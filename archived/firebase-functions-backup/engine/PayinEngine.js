/**
 * Payin Engine v2.0
 * Smart UPI Selection System with scoring, randomness, and fallback
 */

const { mergeConfig, DEFAULT_CONFIG } = require('./config');
const { scoreAllUpis, getAmountTier } = require('./scorers/UpiScorer');
const { selectWithFallback } = require('./UpiSelector');

class PayinEngine {
  constructor(db) {
    this.db = db;
    this.config = DEFAULT_CONFIG;
  }

  /**
   * Load configuration from Firestore
   */
  async loadConfig() {
    try {
      const configDoc = await this.db.collection('system').doc('engineConfig').get();
      this.config = mergeConfig(configDoc.exists ? configDoc.data() : null);
      console.log('✅ Engine config loaded');
    } catch (error) {
      console.error('⚠️ Failed to load config, using defaults:', error.message);
      this.config = DEFAULT_CONFIG;
    }
    return this.config;
  }

  /**
   * Fetch all eligible UPIs from the pool
   */
  async fetchEligibleUpis(amount) {
    console.log(`\n📋 Fetching UPIs for amount: ₹${amount}`);
    
    let upis = [];
    
    // PRIMARY: Fetch from upiPool collection
    const poolSnapshot = await this.db.collection('upiPool')
      .where('active', '==', true)
      .get();
    
    if (!poolSnapshot.empty) {
      console.log(`📦 Found ${poolSnapshot.size} active UPIs in upiPool`);
      poolSnapshot.forEach(doc => {
        if (doc.id !== '_placeholder') {
          upis.push({ id: doc.id, ...doc.data() });
        }
      });
    }
    
    // FALLBACK: If upiPool empty, extract from traders
    if (upis.length === 0) {
      console.log('⚠️ upiPool empty, falling back to trader UPIs');
      upis = await this.extractUpisFromTraders(amount);
    } else {
      console.log('✅ Using upiPool (primary source)');
    }
    
    // Filter by amount range
    upis = upis.filter(upi => {
      const min = upi.perTxnMin || 500;
      const max = upi.perTxnMax || 50000;
      return amount >= min && amount <= max;
    });
    
    // Filter by daily limit not exceeded
    upis = upis.filter(upi => {
      const todayVolume = upi.stats?.todayVolume || 0;
      const dailyLimit = upi.dailyLimit || 100000;
      return (todayVolume + amount) <= dailyLimit;
    });
    
    // Filter out UPIs in cooldown (used too recently)
    const now = Date.now();
    upis = upis.filter(upi => {
      const lastUsedAt = upi.stats?.lastUsedAt?.toMillis?.() || 0;
      const cooldownMs = (this.config.cooldownMinutes || 2) * 60 * 1000;
      return (now - lastUsedAt) >= cooldownMs * 0.5; // Allow if 50% cooldown passed
    });
    
    console.log(`✅ ${upis.length} eligible UPIs after filtering`);
    return upis;
  }

  /**
   * Extract UPIs from trader documents (fallback mode)
   */
  async extractUpisFromTraders(amount) {
    const upis = [];
    const tradersSnapshot = await this.db.collection('trader')
      .where('active', '==', true)
      .get();
    
    console.log(`👥 Found ${tradersSnapshot.size} active traders`);
    
    tradersSnapshot.forEach(traderDoc => {
      const trader = traderDoc.data();
      const traderId = traderDoc.id;
      
      // Determine which UPI arrays to check based on amount
      const upiSources = [];
      
      if (amount >= 10000 && trader.bigUpis?.length) {
        upiSources.push({ upis: trader.bigUpis, tier: 'high', type: 'big' });
      }
      if (trader.currentMerchantUpis?.length) {
        upiSources.push({ upis: trader.currentMerchantUpis, tier: 'medium', type: 'merchant' });
      }
      if (trader.normalUpis?.length) {
        upiSources.push({ upis: trader.normalUpis, tier: 'low', type: 'normal' });
      }
      
      // Extract active UPIs
      for (const source of upiSources) {
        for (const upi of source.upis) {
          if (upi.active !== false) {
            upis.push({
              upiId: upi.upiId,
              holderName: upi.holderName || trader.name || 'Account Holder',
              bank: this.extractBankFromUpi(upi.upiId),
              type: source.type,
              traderId: traderId,
              traderName: trader.name,
              
              // Limits (use defaults if not specified)
              dailyLimit: upi.dailyLimit || 100000,
              perTxnMin: upi.perTxnMin || 500,
              perTxnMax: upi.perTxnMax || (source.type === 'big' ? 50000 : 25000),
              
              // Amount tier
              amountTier: source.tier,
              
              // Stats (may not exist yet)
              stats: upi.stats || {
                todayVolume: 0,
                todayCount: 0,
                todaySuccess: 0,
                todayFailed: 0,
                lastUsedAt: null,
              },
              
              // Performance (default if not tracked)
              performance: upi.performance || {
                successRate: 85, // Assume good until proven otherwise
                totalTxns: 0,
              },
              
              active: true,
            });
          }
        }
      }
    });
    
    return upis;
  }

  /**
   * Extract bank code from UPI ID
   */
  extractBankFromUpi(upiId) {
    if (!upiId) return 'unknown';
    const handle = upiId.split('@')[1]?.toLowerCase() || '';
    
    const bankMap = {
      'oksbi': 'sbi',
      'okaxis': 'axis',
      'okicici': 'icici',
      'okhdfcbank': 'hdfc',
      'ybl': 'paytm',
      'paytm': 'paytm',
      'ibl': 'icici',
      'sbi': 'sbi',
      'axisbank': 'axis',
      'axis': 'axis',
      'hdfcbank': 'hdfc',
      'icici': 'icici',
      'upi': 'generic',
      'gpay': 'google',
      'phonepe': 'phonepe',
      'apl': 'amazon',
    };
    
    for (const [key, bank] of Object.entries(bankMap)) {
      if (handle.includes(key)) return bank;
    }
    return 'other';
  }

  /**
   * Fetch context data (bank health, trader balances)
   */
  async fetchContext(upis) {
    const context = {
      traders: {},
      bankHealth: {},
    };
    
    // Get unique trader IDs
    const traderIds = [...new Set(upis.map(u => u.traderId))];
    
    // Fetch trader data
    for (const traderId of traderIds) {
      const traderDoc = await this.db.collection('trader').doc(traderId).get();
      if (traderDoc.exists) {
        context.traders[traderId] = traderDoc.data();
      }
    }
    
    // Fetch bank health (if collection exists)
    try {
      const bankHealthSnapshot = await this.db.collection('bankHealth').get();
      bankHealthSnapshot.forEach(doc => {
        context.bankHealth[doc.id] = doc.data();
      });
    } catch (error) {
      // Bank health collection may not exist yet
      console.log('⚠️ bankHealth collection not found, using defaults');
    }
    
    return context;
  }

  /**
   * Log selection for debugging/analytics
   */
  async logSelection(payinId, merchantId, amount, scoredUpis, result) {
    if (!this.config.enableLogging) return;
    
    try {
      await this.db.collection('selectionLogs').add({
        payinId,
        merchantId,
        amount,
        amountTier: getAmountTier(amount, this.config),
        
        candidatesCount: scoredUpis.length,
        candidates: scoredUpis.slice(0, 10).map(u => ({
          upiId: u.upiId,
          score: u.score,
          breakdown: u.breakdown,
        })),
        
        selected: result.success ? {
          upiId: result.selected.upiId,
          score: result.selected.score,
          traderId: result.selected.upi.traderId,
        } : null,
        
        success: result.success,
        error: result.error || null,
        attempts: result.attempts,
        totalAttempts: result.totalAttempts,
        
        config: {
          minScoreThreshold: this.config.minScoreThreshold,
          maxCandidates: this.config.maxCandidates,
          enableRandomness: this.config.enableRandomness,
        },
        
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('⚠️ Failed to log selection:', error.message);
    }
  }

  /**
   * Main entry point: Select best UPI for a payin
   */
  async selectUpi(amount, merchantId) {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 PAYIN ENGINE v2.0 - Starting UPI Selection');
    console.log('='.repeat(60));
    console.log(`💰 Amount: ₹${amount}`);
    console.log(`🏪 Merchant: ${merchantId}`);
    
    // 1. Load config
    await this.loadConfig();
    
    // 2. Fetch eligible UPIs
    const upis = await this.fetchEligibleUpis(amount);
    
    if (upis.length === 0) {
      console.log('❌ No eligible UPIs found');
      return {
        success: false,
        error: 'No payment methods available at the moment',
      };
    }
    
    // 3. Fetch context (trader balances, bank health)
    const context = await this.fetchContext(upis);
    console.log(`📊 Context loaded: ${Object.keys(context.traders).length} traders, ${Object.keys(context.bankHealth).length} banks`);
    
    // 4. Score all UPIs
    console.log('\n📈 Scoring UPIs...');
    const scoredUpis = scoreAllUpis(upis, amount, context, this.config);
    
    console.log('\n🏆 Top 5 scored UPIs:');
    scoredUpis.slice(0, 5).forEach((u, i) => {
      console.log(`   ${i + 1}. ${u.upiId} - Score: ${u.score}`);
    });
    
    // 5. Select with weighted random + fallback
    console.log('\n🎯 Selecting UPI...');
    const result = selectWithFallback(scoredUpis, amount, this.config);
    
    // 6. Log selection
    await this.logSelection(null, merchantId, amount, scoredUpis, result);
    
    if (result.success) {
      console.log('\n' + '='.repeat(60));
      console.log(`✅ SUCCESS: ${result.selected.upiId}`);
      console.log(`   Score: ${result.selected.score}`);
      console.log(`   Attempts: ${result.totalAttempts}`);
      console.log('='.repeat(60));
      
      return {
        success: true,
        upiId: result.selected.upi.upiId,
        holderName: result.selected.upi.holderName,
        traderId: result.selected.upi.traderId,
        score: result.selected.score,
        attempts: result.totalAttempts,
      };
    } else {
      console.log('\n' + '='.repeat(60));
      console.log(`❌ FAILED: ${result.error}`);
      console.log('='.repeat(60));
      
      return {
        success: false,
        error: result.error,
        attempts: result.totalAttempts,
      };
    }
  }

  /**
   * Update UPI stats after transaction completes
   */
  async updateUpiStats(upiId, traderId, status, amount) {
    console.log(`📊 Updating stats for ${upiId}: ${status}`);
    
    // Create doc ID from UPI (same logic as migration)
    const docId = upiId.replace(/[@.]/g, '_').toLowerCase();
    const poolRef = this.db.collection('upiPool').doc(docId);
    
    try {
      const poolDoc = await poolRef.get();
      
      if (poolDoc.exists) {
        const currentStats = poolDoc.data().stats || {};
        const currentPerf = poolDoc.data().performance || {};
        
        const updates = {
          'stats.lastUsedAt': new Date(),
          'stats.todayCount': (currentStats.todayCount || 0) + 1,
        };
        
        if (status === 'completed') {
          updates['stats.todayVolume'] = (currentStats.todayVolume || 0) + amount;
          updates['stats.todaySuccess'] = (currentStats.todaySuccess || 0) + 1;
          updates['stats.lastSuccessAt'] = new Date();
          
          // Update overall performance
          const totalTxns = (currentPerf.totalTxns || 0) + 1;
          const totalSuccess = (currentPerf.totalSuccess || 0) + 1;
          updates['performance.totalTxns'] = totalTxns;
          updates['performance.totalSuccess'] = totalSuccess;
          updates['performance.successRate'] = Math.round((totalSuccess / totalTxns) * 100);
          updates['performance.updatedAt'] = new Date();
        } else {
          updates['stats.todayFailed'] = (currentStats.todayFailed || 0) + 1;
          updates['stats.lastFailedAt'] = new Date();
          updates['stats.lastHourFailures'] = (currentStats.lastHourFailures || 0) + 1;
          
          // Update overall performance
          const totalTxns = (currentPerf.totalTxns || 0) + 1;
          const totalFailed = (currentPerf.totalFailed || 0) + 1;
          const totalSuccess = currentPerf.totalSuccess || 0;
          updates['performance.totalTxns'] = totalTxns;
          updates['performance.totalFailed'] = totalFailed;
          updates['performance.successRate'] = totalTxns > 0 ? Math.round((totalSuccess / totalTxns) * 100) : 0;
          updates['performance.updatedAt'] = new Date();
        }
        
        await poolRef.update(updates);
        console.log(`✅ upiPool stats updated for ${docId}`);
      } else {
        console.log(`⚠️ UPI ${docId} not found in upiPool, creating entry...`);
        // Auto-create if doesn't exist (edge case)
        await poolRef.set({
          upiId: upiId,
          traderId: traderId,
          active: true,
          stats: {
            todayVolume: status === 'completed' ? amount : 0,
            todayCount: 1,
            todaySuccess: status === 'completed' ? 1 : 0,
            todayFailed: status === 'completed' ? 0 : 1,
            lastUsedAt: new Date(),
          },
          performance: {
            totalTxns: 1,
            totalSuccess: status === 'completed' ? 1 : 0,
            totalFailed: status === 'completed' ? 0 : 1,
            successRate: status === 'completed' ? 100 : 0,
          },
          createdAt: new Date(),
        });
        console.log(`✅ Created new upiPool entry for ${docId}`);
      }
    } catch (error) {
      console.error(`❌ Error updating UPI stats: ${error.message}`);
    }
  }
}

module.exports = PayinEngine;
