/**
 * Payout Engine v1.0
 * Smart Trader Selection for Payout Assignment
 * Mirrors PayinEngine architecture but selects traders instead of UPIs
 */

const { mergePayoutConfig, DEFAULT_PAYOUT_CONFIG } = require('./payoutConfig');
const { scoreAllTraders, getPayoutAmountTier } = require('./scorers/TraderScorer');
const { selectTraderWithFallback } = require('./TraderSelector');

class PayoutEngine {
  constructor(db) {
    this.db = db;
    this.config = DEFAULT_PAYOUT_CONFIG;
  }

  /**
   * Load configuration from Firestore
   */
  async loadConfig() {
    try {
      const configDoc = await this.db.collection('system').doc('payoutEngineConfig').get();
      this.config = mergePayoutConfig(configDoc.exists ? configDoc.data() : null);
      console.log('✅ Payout Engine config loaded');
    } catch (error) {
      console.error('⚠️ Failed to load payout config, using defaults:', error.message);
      this.config = DEFAULT_PAYOUT_CONFIG;
    }
    return this.config;
  }

  /**
   * Fetch all eligible traders for a payout
   */
  async fetchEligibleTraders(amount) {
    console.log(`\n📋 Fetching traders for payout amount: ₹${amount}`);

    const tradersSnapshot = await this.db.collection('trader')
      .where('isActive', '==', true)
      .get();

    if (tradersSnapshot.empty) {
      // Fallback: try 'active' field
      const fallbackSnapshot = await this.db.collection('trader')
        .where('active', '==', true)
        .get();

      if (fallbackSnapshot.empty) {
        console.log('❌ No active traders found');
        return [];
      }

      console.log(`👥 Found ${fallbackSnapshot.size} active traders (via 'active' field)`);
      const traders = [];
      fallbackSnapshot.forEach(doc => {
        traders.push({ id: doc.id, ...doc.data() });
      });
      return traders;
    }

    console.log(`👥 Found ${tradersSnapshot.size} active traders`);
    const traders = [];
    tradersSnapshot.forEach(doc => {
      traders.push({ id: doc.id, ...doc.data() });
    });

    return traders;
  }

  /**
   * Enrich traders with payout stats
   * Reads from payoutStats subcollection or trader doc fields
   */
  async enrichTraderStats(traders) {
    console.log(`📊 Enriching ${traders.length} traders with payout stats...`);

    for (const trader of traders) {
      // If payoutStats already on the doc, skip
      if (trader.payoutStats) continue;

      // Build stats from payout collection
      try {
        // Count active payouts for this trader
        const activeQuery = await this.db.collection('payouts')
          .where('traderId', '==', trader.id)
          .where('status', '==', 'assigned')
          .get();

        // Count today's completed
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const completedQuery = await this.db.collection('payouts')
          .where('traderId', '==', trader.id)
          .where('status', '==', 'completed')
          .get();

        const cancelledQuery = await this.db.collection('payouts')
          .where('traderId', '==', trader.id)
          .where('status', '==', 'cancelled_by_trader')
          .get();

        // Calculate stats
        let totalCompleted = 0;
        let totalCompletionTime = 0;
        let todayCompleted = 0;
        let todayCancelled = 0;
        let todayCount = 0;

        completedQuery.forEach(doc => {
          const data = doc.data();
          totalCompleted++;
          // Calculate completion time
          const assignedAt = data.assignedAt?.toDate?.();
          const completedAt = data.completedAt?.toDate?.();
          if (assignedAt && completedAt) {
            totalCompletionTime += (completedAt - assignedAt) / 60000; // minutes
          }
          // Check if today
          const docDate = completedAt || assignedAt;
          if (docDate && docDate >= todayStart) {
            todayCompleted++;
            todayCount++;
          }
        });

        let totalCancelled = 0;
        cancelledQuery.forEach(doc => {
          const data = doc.data();
          totalCancelled++;
          const cancelledAt = data.cancelledAt?.toDate?.();
          if (cancelledAt && cancelledAt >= todayStart) {
            todayCancelled++;
            todayCount++;
          }
        });

        // Add today's active to count
        todayCount += activeQuery.size;

        const totalAttempted = totalCompleted + totalCancelled;
        const avgCompletionMins = totalCompleted > 0
          ? totalCompletionTime / totalCompleted
          : null;

        trader.payoutStats = {
          activePayouts: activeQuery.size,
          totalCompleted,
          totalCancelled,
          totalAttempted,
          avgCompletionMinutes: avgCompletionMins,
          todayCount,
          todayCompleted,
          todayCancelled,
          lastAssignedAt: trader.lastAssignedAt || null,
          bestAmountTier: 'medium', // Default, could be computed from history
        };

      } catch (error) {
        console.error(`⚠️ Failed to enrich stats for trader ${trader.id}:`, error.message);
        trader.payoutStats = {
          activePayouts: 0,
          totalCompleted: 0,
          totalCancelled: 0,
          totalAttempted: 0,
          avgCompletionMinutes: null,
          todayCount: 0,
          todayCompleted: 0,
          todayCancelled: 0,
          lastAssignedAt: null,
          bestAmountTier: 'medium',
        };
      }
    }

    return traders;
  }

  /**
   * Log selection with detailed reasoning
   */
  async logSelection(payoutId, merchantId, amount, scoredTraders, result) {
    if (!this.config.enableLogging) return;

    try {
      const logData = {
        payoutId,
        merchantId,
        amount,
        amountTier: getPayoutAmountTier(amount, this.config),

        // All candidates with scores and reasons
        candidatesCount: scoredTraders.length,
        candidates: scoredTraders.slice(0, 10).map(t => ({
          traderId: t.traderId,
          traderName: t.traderName,
          score: t.score,
          breakdown: t.breakdown,
          reasons: t.reasons,
          summary: t.summary,
        })),

        // The winner
        selected: result.success ? {
          traderId: result.selected.traderId,
          traderName: result.selected.traderName,
          score: result.selected.score,
          reasons: result.selected.reasons,
          summary: result.selected.summary,
          whySelected: buildSelectionExplanation(result.selected, scoredTraders, result.attempts),
        } : null,

        // Selection metadata
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
      };

      await this.db.collection('payoutSelectionLogs').add(logData);
      console.log('📝 Selection logged with reasoning');
    } catch (error) {
      console.error('⚠️ Failed to log payout selection:', error.message);
    }
  }

  /**
   * Main entry point: Select best trader for a payout
   */
  async selectTrader(amount, merchantId, payoutId) {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 PAYOUT ENGINE v1.0 - Starting Trader Selection');
    console.log('='.repeat(60));
    console.log(`💰 Payout Amount: ₹${amount}`);
    console.log(`🏪 Merchant: ${merchantId}`);
    if (payoutId) console.log(`📋 Payout ID: ${payoutId}`);

    // 1. Load config
    await this.loadConfig();

    // 2. Fetch eligible traders
    let traders = await this.fetchEligibleTraders(amount);

    if (traders.length === 0) {
      console.log('❌ No eligible traders found');
      return {
        success: false,
        error: 'No traders available at the moment',
      };
    }

    // 3. Enrich with payout stats
    traders = await this.enrichTraderStats(traders);
    console.log(`📊 Stats enriched for ${traders.length} traders`);

    // 4. Score all traders
    console.log('\n📈 Scoring traders...');
    const scoredTraders = scoreAllTraders(traders, amount, {}, this.config);

    console.log('\n🏆 Top 5 scored traders:');
    scoredTraders.slice(0, 5).forEach((t, i) => {
      console.log(`   ${i + 1}. ${t.traderName} (${t.traderId}) - Score: ${t.score}`);
      console.log(`      ${t.summary}`);
    });

    // 5. Select with weighted random + fallback
    console.log('\n🎯 Selecting trader...');
    const result = selectTraderWithFallback(scoredTraders, amount, this.config);

    // 6. Log selection with reasoning
    await this.logSelection(payoutId, merchantId, amount, scoredTraders, result);

    if (result.success) {
      console.log('\n' + '='.repeat(60));
      console.log(`✅ SUCCESS: ${result.selected.traderName} (${result.selected.traderId})`);
      console.log(`   Score: ${result.selected.score}`);
      console.log(`   Reason: ${result.selected.summary}`);
      console.log(`   Attempts: ${result.totalAttempts}`);
      console.log('='.repeat(60));

      return {
        success: true,
        traderId: result.selected.traderId,
        traderName: result.selected.traderName,
        score: result.selected.score,
        summary: result.selected.summary,
        reasons: result.selected.reasons,
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
   * Update trader payout stats after a payout completes/cancels
   */
  async updateTraderStats(traderId, status, amount, assignedAt) {
    console.log(`📊 Updating payout stats for trader ${traderId}: ${status}`);

    try {
      const traderRef = this.db.collection('trader').doc(traderId);
      const traderDoc = await traderRef.get();

      if (!traderDoc.exists) {
        console.log(`⚠️ Trader ${traderId} not found`);
        return;
      }

      const currentStats = traderDoc.data().payoutStats || {};
      const updates = {};

      if (status === 'completed') {
        updates['payoutStats.totalCompleted'] = (currentStats.totalCompleted || 0) + 1;
        updates['payoutStats.totalAttempted'] = (currentStats.totalAttempted || 0) + 1;
        updates['payoutStats.todayCompleted'] = (currentStats.todayCompleted || 0) + 1;
        updates['payoutStats.todayCount'] = (currentStats.todayCount || 0) + 1;
        updates['payoutStats.activePayouts'] = Math.max(0, (currentStats.activePayouts || 0) - 1);
        updates['payoutStats.lastCompletedAt'] = new Date();

        // Update average completion time
        if (assignedAt) {
          const completionMins = (Date.now() - (assignedAt.toMillis?.() || assignedAt)) / 60000;
          const prevAvg = currentStats.avgCompletionMinutes || completionMins;
          const prevCount = currentStats.totalCompleted || 0;
          const newAvg = prevCount > 0
            ? ((prevAvg * prevCount) + completionMins) / (prevCount + 1)
            : completionMins;
          updates['payoutStats.avgCompletionMinutes'] = Math.round(newAvg * 10) / 10;
        }

        // Update total volume
        updates['payoutStats.totalVolume'] = (currentStats.totalVolume || 0) + amount;
        updates['payoutStats.todayVolume'] = (currentStats.todayVolume || 0) + amount;

      } else if (status === 'cancelled_by_trader') {
        updates['payoutStats.totalCancelled'] = (currentStats.totalCancelled || 0) + 1;
        updates['payoutStats.totalAttempted'] = (currentStats.totalAttempted || 0) + 1;
        updates['payoutStats.todayCancelled'] = (currentStats.todayCancelled || 0) + 1;
        updates['payoutStats.activePayouts'] = Math.max(0, (currentStats.activePayouts || 0) - 1);

      } else if (status === 'assigned') {
        updates['payoutStats.activePayouts'] = (currentStats.activePayouts || 0) + 1;
        updates['payoutStats.lastAssignedAt'] = new Date();
      }

      await traderRef.update(updates);
      console.log(`✅ Payout stats updated for trader ${traderId}`);
    } catch (error) {
      console.error(`❌ Error updating trader payout stats: ${error.message}`);
    }
  }

  /**
   * Reset daily stats for all traders (call at midnight IST)
   */
  async resetDailyStats() {
    console.log('🔄 Resetting daily payout stats for all traders...');

    try {
      const tradersSnapshot = await this.db.collection('trader').get();
      const batch = this.db.batch();
      let count = 0;

      tradersSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.payoutStats) {
          batch.update(doc.ref, {
            'payoutStats.todayCount': 0,
            'payoutStats.todayCompleted': 0,
            'payoutStats.todayCancelled': 0,
            'payoutStats.todayVolume': 0,
          });
          count++;
        }
      });

      if (count > 0) {
        await batch.commit();
        console.log(`✅ Reset daily payout stats for ${count} traders`);
      } else {
        console.log('⚠️ No traders with payoutStats to reset');
      }

      return { reset: count };
    } catch (error) {
      console.error('❌ Error resetting daily payout stats:', error.message);
      throw error;
    }
  }
}

/**
 * Build human-readable explanation of why a specific trader was selected
 */
function buildSelectionExplanation(selected, allScored, attempts) {
  const parts = [];

  parts.push(`Selected ${selected.traderName} with score ${selected.score}/100.`);

  // Compare with runner-up
  if (allScored.length > 1) {
    const runnerUp = allScored.find(t => t.traderId !== selected.traderId);
    if (runnerUp) {
      const diff = selected.score - runnerUp.score;
      if (diff > 15) {
        parts.push(`Clear winner — ${diff}pts ahead of ${runnerUp.traderName} (${runnerUp.score}).`);
      } else if (diff > 0) {
        parts.push(`Close race — only ${diff}pts ahead of ${runnerUp.traderName} (${runnerUp.score}).`);
      } else {
        parts.push(`Won by weighted random over ${runnerUp.traderName} (${runnerUp.score}).`);
      }
    }
  }

  // Key reasons from breakdown
  const topReasons = Object.entries(selected.reasons)
    .filter(([key, val]) => !key.includes('penalties') && !key.includes('random'))
    .sort((a, b) => (selected.breakdown[b[0]] || 0) - (selected.breakdown[a[0]] || 0))
    .slice(0, 3)
    .map(([key, reason]) => reason);

  if (topReasons.length > 0) {
    parts.push(`Top factors: ${topReasons.join(' | ')}`);
  }

  // Note any attempts/fallback
  if (attempts && attempts.length > 1) {
    const failed = attempts.filter(a => !a.valid);
    if (failed.length > 0) {
      const failedNames = failed.map(f => `${f.traderName} (${f.reason})`).join(', ');
      parts.push(`Skipped: ${failedNames}`);
    }
  }

  return parts.join(' ');
}

module.exports = PayoutEngine;
