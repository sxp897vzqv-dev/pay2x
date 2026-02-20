/**
 * Dispute Engine v1.0
 * Smart routing, workflow management, and balance adjustments for disputes
 *
 * Status Flow:
 *   pending → routed_to_trader → trader_accepted / trader_rejected → admin_approved / admin_rejected → resolved
 *
 * Payin Dispute:
 *   Merchant says "payin not received"
 *   → Engine routes to trader (via UPI ID / trader ID from payin record)
 *   → Trader accepts (received) → admin approves → payin completed, balance credited to trader
 *   → Trader rejects (not received, provides statement) → admin reviews
 *
 * Payout Dispute:
 *   Client says "payout not received"
 *   → Engine routes to trader (via payout ID / transaction ID)
 *   → Trader provides proof (successful) → admin reviews proof
 *   → Trader accepts not sent → admin approves → deduct (amount + commission) from trader
 *
 * Admin always has final say. Balances only change after admin decision.
 */

const { mergeDisputeConfig, DEFAULT_DISPUTE_CONFIG } = require('./disputeConfig');

class DisputeEngine {
  constructor(db) {
    this.db = db;
    this.config = DEFAULT_DISPUTE_CONFIG;
  }

  /**
   * Load config from Firestore
   */
  async loadConfig() {
    try {
      const configDoc = await this.db.collection('system').doc('disputeEngineConfig').get();
      this.config = mergeDisputeConfig(configDoc.exists ? configDoc.data() : null);
      console.log('✅ Dispute Engine config loaded');
    } catch (error) {
      console.error('⚠️ Failed to load dispute config:', error.message);
      this.config = DEFAULT_DISPUTE_CONFIG;
    }
    return this.config;
  }

  /**
   * Route a dispute to the correct trader
   * Called when a new dispute is created
   */
  async routeDispute(disputeId) {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 DISPUTE ENGINE v1.0 - Routing Dispute');
    console.log('='.repeat(60));

    await this.loadConfig();

    const disputeRef = this.db.collection('disputes').doc(disputeId);
    const disputeDoc = await disputeRef.get();

    if (!disputeDoc.exists) {
      return { success: false, error: 'Dispute not found' };
    }

    const dispute = disputeDoc.data();
    const isPayin = dispute.type === 'payin';

    console.log(`📋 Dispute: ${disputeId}`);
    console.log(`   Type: ${dispute.type}`);
    console.log(`   Amount: ₹${dispute.amount}`);
    console.log(`   Merchant: ${dispute.merchantName || dispute.merchantId}`);

    let traderId = dispute.traderId;
    let traderName = null;
    let routeReason = '';
    let routeSource = '';

    // If traderId already set (merchant form found it), verify it
    if (traderId) {
      const traderDoc = await this.db.collection('trader').doc(traderId).get();
      if (traderDoc.exists) {
        traderName = traderDoc.data().name || 'Unknown';
        routeReason = `Trader already identified from ${isPayin ? 'UPI mapping' : 'payout record'}`;
        routeSource = 'merchant_form';
        console.log(`✅ Trader pre-identified: ${traderName} (${traderId})`);
      } else {
        console.log(`⚠️ Pre-set traderId ${traderId} not found, attempting re-route...`);
        traderId = null;
      }
    }

    // If no traderId, try to find the right trader
    if (!traderId) {
      if (isPayin) {
        // Route payin dispute via UPI ID or transaction ID
        const result = await this._routePayinDispute(dispute);
        traderId = result.traderId;
        traderName = result.traderName;
        routeReason = result.reason;
        routeSource = result.source;
      } else {
        // Route payout dispute via payout ID
        const result = await this._routePayoutDispute(dispute);
        traderId = result.traderId;
        traderName = result.traderName;
        routeReason = result.reason;
        routeSource = result.source;
      }
    }

    if (!traderId) {
      console.log('❌ Could not find trader to route dispute');

      await disputeRef.update({
        status: 'unroutable',
        routeError: 'Could not identify trader',
        routeAttemptedAt: new Date(),
      });

      await this._logRouting(disputeId, dispute, null, null, false, 'No trader found');

      return {
        success: false,
        error: 'Could not identify the trader for this dispute',
      };
    }

    // Update dispute with routing info
    await disputeRef.update({
      traderId: traderId,
      traderName: traderName,
      status: 'routed_to_trader',
      routedAt: new Date(),
      routeReason: routeReason,
      routeSource: routeSource,
    });

    // Log routing
    await this._logRouting(disputeId, dispute, traderId, traderName, true, routeReason);

    console.log('\n' + '='.repeat(60));
    console.log(`✅ Routed to: ${traderName} (${traderId})`);
    console.log(`   Reason: ${routeReason}`);
    console.log('='.repeat(60));

    return {
      success: true,
      traderId,
      traderName,
      routeReason,
    };
  }

  /**
   * Route payin dispute — find trader via UPI ID or payin record
   * Priority: savedBanks (permanent) > payin record > UTR match > upiPool (can be removed)
   */
  async _routePayinDispute(dispute) {
    const upiId = dispute.receiverUpiId || dispute.upiId;

    // Method 1 (PRIMARY): Find via UPI ID in savedBanks — permanent record, never deleted
    if (upiId) {
      console.log(`🔍 Searching savedBanks for UPI: ${upiId}`);

      const savedBanksQuery = await this.db.collection('savedBanks')
        .where('upiId', '==', upiId)
        .limit(5)
        .get();

      if (!savedBanksQuery.empty) {
        // Pick the first non-deleted match, or any match if all deleted
        let bestMatch = null;
        savedBanksQuery.forEach(doc => {
          const data = doc.data();
          if (!bestMatch || (!data.isDeleted && bestMatch.isDeleted)) {
            bestMatch = { id: doc.id, ...data };
          }
        });

        if (bestMatch && bestMatch.traderId) {
          const traderId = bestMatch.traderId;
          const traderDoc = await this.db.collection('trader').doc(traderId).get();
          return {
            traderId,
            traderName: traderDoc.exists ? traderDoc.data().name : 'Unknown',
            reason: `Matched UPI ${upiId} in savedBanks (permanent record) → trader ${traderId}`,
            source: 'savedBanks',
          };
        }
      }
    }

    // Method 2: Find via transaction ID in payin collection
    if (dispute.transactionId) {
      console.log(`🔍 Searching payin collection for txn: ${dispute.transactionId}`);

      const payinDoc = await this.db.collection('payin').doc(dispute.transactionId).get();
      if (payinDoc.exists && payinDoc.data().traderId) {
        const traderId = payinDoc.data().traderId;
        const traderDoc = await this.db.collection('trader').doc(traderId).get();
        return {
          traderId,
          traderName: traderDoc.exists ? traderDoc.data().name : 'Unknown',
          reason: `Matched transaction ${dispute.transactionId} in payin collection`,
          source: 'payin_collection',
        };
      }
    }

    // Method 3: Search by UTR
    if (dispute.utrNumber) {
      console.log(`🔍 Searching payin by UTR: ${dispute.utrNumber}`);

      const utrQuery = await this.db.collection('payin')
        .where('utrId', '==', dispute.utrNumber)
        .limit(1)
        .get();

      if (!utrQuery.empty) {
        const payinData = utrQuery.docs[0].data();
        if (payinData.traderId) {
          const traderDoc = await this.db.collection('trader').doc(payinData.traderId).get();
          return {
            traderId: payinData.traderId,
            traderName: traderDoc.exists ? traderDoc.data().name : 'Unknown',
            reason: `Matched UTR ${dispute.utrNumber} → payin ${utrQuery.docs[0].id}`,
            source: 'utr_match',
          };
        }
      }
    }

    // Method 4 (FALLBACK): Check upiPool — UPIs can be removed from here
    if (upiId) {
      console.log(`🔍 Fallback: searching upiPool for: ${upiId}`);

      const docId = upiId.replace(/[@.]/g, '_').toLowerCase();
      const poolDoc = await this.db.collection('upiPool').doc(docId).get();

      if (poolDoc.exists && poolDoc.data().traderId) {
        const traderId = poolDoc.data().traderId;
        const traderDoc = await this.db.collection('trader').doc(traderId).get();
        return {
          traderId,
          traderName: traderDoc.exists ? traderDoc.data().name : 'Unknown',
          reason: `Matched UPI ${upiId} in upiPool (fallback) → trader ${traderId}`,
          source: 'upiPool',
        };
      }
    }

    return { traderId: null, traderName: null, reason: 'No match found', source: null };
  }

  /**
   * Route payout dispute — find trader via payout record
   */
  async _routePayoutDispute(dispute) {
    const payoutId = dispute.payoutId || dispute.orderId;

    // Method 1: Direct payout doc lookup
    if (payoutId) {
      console.log(`🔍 Searching payouts for: ${payoutId}`);

      const payoutDoc = await this.db.collection('payouts').doc(payoutId).get();
      if (payoutDoc.exists && payoutDoc.data().traderId) {
        const traderId = payoutDoc.data().traderId;
        const traderDoc = await this.db.collection('trader').doc(traderId).get();
        return {
          traderId,
          traderName: traderDoc.exists ? traderDoc.data().name : 'Unknown',
          reason: `Matched payout ${payoutId} → trader ${traderId}`,
          source: 'payout_collection',
        };
      }

      // Method 2: Search by orderId field
      const orderQuery = await this.db.collection('payouts')
        .where('orderId', '==', payoutId)
        .limit(1)
        .get();

      if (!orderQuery.empty) {
        const payoutData = orderQuery.docs[0].data();
        if (payoutData.traderId) {
          const traderDoc = await this.db.collection('trader').doc(payoutData.traderId).get();
          return {
            traderId: payoutData.traderId,
            traderName: traderDoc.exists ? traderDoc.data().name : 'Unknown',
            reason: `Matched orderId ${payoutId} in payouts → trader ${payoutData.traderId}`,
            source: 'payout_orderId',
          };
        }
      }
    }

    return { traderId: null, traderName: null, reason: 'No match found', source: null };
  }

  /**
   * Process trader's response to a dispute
   */
  async processTraderResponse(disputeId, action, note, proofUrl) {
    console.log(`📋 Processing trader response for dispute ${disputeId}: ${action}`);

    const disputeRef = this.db.collection('disputes').doc(disputeId);
    const disputeDoc = await disputeRef.get();

    if (!disputeDoc.exists) {
      return { success: false, error: 'Dispute not found' };
    }

    const dispute = disputeDoc.data();
    const isPayin = dispute.type === 'payin';

    let newStatus;
    let traderAction;

    if (isPayin) {
      // Payin: trader accepts (received) or rejects (not received)
      if (action === 'accept') {
        newStatus = 'trader_accepted';
        traderAction = 'Trader confirmed payment was received';
      } else {
        newStatus = 'trader_rejected';
        traderAction = 'Trader says payment was NOT received';
      }
    } else {
      // Payout: trader provides proof (sent) or accepts not sent
      if (action === 'accept') {
        // Accept = trader admits payout was NOT sent
        newStatus = 'trader_accepted';
        traderAction = 'Trader confirms payout was NOT sent';
      } else {
        // Reject = trader says payout WAS sent, provides proof
        newStatus = 'trader_rejected';
        traderAction = 'Trader says payout WAS sent successfully';
      }
    }

    await disputeRef.update({
      status: newStatus,
      traderAction: traderAction,
      traderNote: note || '',
      traderProofUrl: proofUrl || null,
      traderRespondedAt: new Date(),
    });

    // Log trader response
    await this._logTraderResponse(disputeId, dispute, action, traderAction);

    console.log(`✅ Dispute ${disputeId} → ${newStatus}`);

    return {
      success: true,
      newStatus,
      traderAction,
    };
  }

  /**
   * Admin final decision — this is where balances change
   */
  async adminResolve(disputeId, decision, adminNote, adminId) {
    console.log('\n' + '='.repeat(60));
    console.log('⚖️ DISPUTE ENGINE - Admin Resolution');
    console.log('='.repeat(60));

    await this.loadConfig();

    const disputeRef = this.db.collection('disputes').doc(disputeId);
    const disputeDoc = await disputeRef.get();

    if (!disputeDoc.exists) {
      return { success: false, error: 'Dispute not found' };
    }

    const dispute = disputeDoc.data();
    const isPayin = dispute.type === 'payin';
    const amount = Number(dispute.amount) || 0;
    const traderId = dispute.traderId;
    const merchantId = dispute.merchantId;

    console.log(`📋 Dispute: ${disputeId}`);
    console.log(`   Type: ${dispute.type}, Amount: ₹${amount}`);
    console.log(`   Trader status: ${dispute.status}`);
    console.log(`   Admin decision: ${decision}`);

    let balanceChanges = [];
    let resolution = '';

    if (isPayin) {
      balanceChanges = await this._resolvePayinDispute(dispute, decision, amount, traderId, merchantId);
      resolution = this._getPayinResolution(dispute, decision);
    } else {
      balanceChanges = await this._resolvePayoutDispute(dispute, decision, amount, traderId, merchantId);
      resolution = this._getPayoutResolution(dispute, decision);
    }

    // Update dispute status
    await disputeRef.update({
      status: decision === 'approve' ? 'admin_approved' : 'admin_rejected',
      adminDecision: decision,
      adminNote: adminNote || '',
      adminId: adminId,
      resolvedAt: new Date(),
      resolution: resolution,
      balanceChanges: balanceChanges,
    });

    // Log admin resolution
    await this._logAdminResolution(disputeId, dispute, decision, resolution, balanceChanges, adminId);

    console.log('\n' + '='.repeat(60));
    console.log(`✅ Dispute resolved: ${resolution}`);
    if (balanceChanges.length > 0) {
      balanceChanges.forEach(change => {
        console.log(`   💰 ${change.entity} (${change.entityId}): ${change.type} ₹${change.amount}`);
      });
    }
    console.log('='.repeat(60));

    return {
      success: true,
      resolution,
      balanceChanges,
    };
  }

  /**
   * Resolve Payin dispute — handle balance adjustments
   *
   * Scenario 1: Trader accepted (received) + Admin approves
   *   → Payin is confirmed. Credit to trader balance. Complete the payin.
   *
   * Scenario 2: Trader accepted (received) + Admin rejects
   *   → Admin overrides trader. No balance change.
   *
   * Scenario 3: Trader rejected (not received) + Admin approves
   *   → Trader was right, payment not received. Refund merchant if applicable.
   *
   * Scenario 4: Trader rejected (not received) + Admin rejects
   *   → Admin overrides trader's rejection. Force credit to trader.
   */
  async _resolvePayinDispute(dispute, decision, amount, traderId, merchantId) {
    const balanceChanges = [];
    const traderStatus = dispute.status; // trader_accepted or trader_rejected

    if (traderStatus === 'trader_accepted' && decision === 'approve') {
      // Trader says received + admin approves = credit trader balance
      if (traderId) {
        const traderRef = this.db.collection('trader').doc(traderId);
        const traderDoc = await traderRef.get();
        if (traderDoc.exists) {
          const currentBalance = Number(traderDoc.data().balance || 0);
          const newBalance = currentBalance + amount;
          await traderRef.update({ balance: newBalance });
          balanceChanges.push({
            entity: 'trader',
            entityId: traderId,
            type: 'credit',
            amount: amount,
            previousBalance: currentBalance,
            newBalance: newBalance,
            reason: 'Payin confirmed by trader and approved by admin',
          });
        }
      }
    } else if (traderStatus === 'trader_rejected' && decision === 'reject') {
      // Trader says not received but admin rejects trader's claim = force credit trader
      if (traderId) {
        const traderRef = this.db.collection('trader').doc(traderId);
        const traderDoc = await traderRef.get();
        if (traderDoc.exists) {
          const currentBalance = Number(traderDoc.data().balance || 0);
          const newBalance = currentBalance + amount;
          await traderRef.update({ balance: newBalance });
          balanceChanges.push({
            entity: 'trader',
            entityId: traderId,
            type: 'credit',
            amount: amount,
            previousBalance: currentBalance,
            newBalance: newBalance,
            reason: 'Admin overrode trader rejection — payin was received',
          });
        }
      }
    }
    // Other scenarios: no balance change

    return balanceChanges;
  }

  /**
   * Resolve Payout dispute — handle balance adjustments
   *
   * Scenario 1: Trader accepted (not sent) + Admin approves
   *   → Deduct amount + commission from trader balance
   *
   * Scenario 2: Trader rejected (sent, has proof) + Admin approves
   *   → Payout was successful, no deduction needed
   *
   * Scenario 3: Trader rejected (sent, has proof) + Admin rejects
   *   → Admin says proof invalid. Deduct from trader.
   *
   * Scenario 4: Trader accepted (not sent) + Admin rejects
   *   → Admin overrides. No deduction (maybe payout was actually sent).
   */
  async _resolvePayoutDispute(dispute, decision, amount, traderId, merchantId) {
    const balanceChanges = [];
    const traderStatus = dispute.status;

    const shouldDeduct =
      (traderStatus === 'trader_accepted' && decision === 'approve') ||
      (traderStatus === 'trader_rejected' && decision === 'reject');

    if (shouldDeduct && traderId) {
      const traderRef = this.db.collection('trader').doc(traderId);
      const traderDoc = await traderRef.get();

      if (traderDoc.exists) {
        const traderData = traderDoc.data();
        const currentBalance = Number(traderData.balance || 0);
        const commissionRate = Number(traderData.payoutCommission || traderData.payoutCommissionRate || 1);
        const commission = (amount * commissionRate) / 100;
        const totalDeduction = amount + commission;
        const newBalance = currentBalance - totalDeduction;

        await traderRef.update({ balance: newBalance });

        balanceChanges.push({
          entity: 'trader',
          entityId: traderId,
          type: 'debit',
          amount: totalDeduction,
          breakdown: {
            payoutAmount: amount,
            commission: commission,
            commissionRate: commissionRate,
          },
          previousBalance: currentBalance,
          newBalance: newBalance,
          reason: traderStatus === 'trader_accepted'
            ? 'Trader admitted payout not sent — amount + commission deducted'
            : 'Admin rejected trader proof — amount + commission deducted',
        });
      }
    }

    return balanceChanges;
  }

  /**
   * Get human-readable resolution text for payin
   */
  _getPayinResolution(dispute, decision) {
    const traderStatus = dispute.status;
    if (traderStatus === 'trader_accepted' && decision === 'approve') {
      return 'Payin confirmed. Trader received payment. Balance credited to trader.';
    }
    if (traderStatus === 'trader_accepted' && decision === 'reject') {
      return 'Admin rejected despite trader acceptance. No balance change.';
    }
    if (traderStatus === 'trader_rejected' && decision === 'approve') {
      return 'Payin not received confirmed. Trader was right.';
    }
    if (traderStatus === 'trader_rejected' && decision === 'reject') {
      return 'Admin overrode trader rejection. Payin was received. Balance force-credited to trader.';
    }
    return `Resolved by admin: ${decision}`;
  }

  /**
   * Get human-readable resolution text for payout
   */
  _getPayoutResolution(dispute, decision) {
    const traderStatus = dispute.status;
    if (traderStatus === 'trader_accepted' && decision === 'approve') {
      return 'Payout was NOT sent. Trader balance deducted (amount + commission).';
    }
    if (traderStatus === 'trader_accepted' && decision === 'reject') {
      return 'Admin rejected despite trader admission. No deduction.';
    }
    if (traderStatus === 'trader_rejected' && decision === 'approve') {
      return 'Payout was sent successfully. Trader proof accepted. No deduction.';
    }
    if (traderStatus === 'trader_rejected' && decision === 'reject') {
      return 'Admin rejected trader proof. Payout NOT confirmed. Balance deducted (amount + commission).';
    }
    return `Resolved by admin: ${decision}`;
  }

  /**
   * Log routing decision
   */
  async _logRouting(disputeId, dispute, traderId, traderName, success, reason) {
    if (!this.config.routing.enableLogging) return;

    try {
      await this.db.collection('disputeEngineLogs').add({
        type: 'routing',
        disputeId,
        disputeType: dispute.type,
        amount: dispute.amount,
        merchantId: dispute.merchantId,
        traderId: traderId,
        traderName: traderName,
        success,
        reason,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('⚠️ Failed to log routing:', error.message);
    }
  }

  /**
   * Log trader response
   */
  async _logTraderResponse(disputeId, dispute, action, traderAction) {
    try {
      await this.db.collection('disputeEngineLogs').add({
        type: 'trader_response',
        disputeId,
        disputeType: dispute.type,
        traderId: dispute.traderId,
        action,
        traderAction,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('⚠️ Failed to log trader response:', error.message);
    }
  }

  /**
   * Log admin resolution
   */
  async _logAdminResolution(disputeId, dispute, decision, resolution, balanceChanges, adminId) {
    try {
      await this.db.collection('disputeEngineLogs').add({
        type: 'admin_resolution',
        disputeId,
        disputeType: dispute.type,
        amount: dispute.amount,
        traderId: dispute.traderId,
        merchantId: dispute.merchantId,
        traderStatus: dispute.status,
        adminDecision: decision,
        resolution,
        balanceChanges,
        adminId,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('⚠️ Failed to log admin resolution:', error.message);
    }
  }

  /**
   * Get engine stats
   */
  async getStats() {
    const disputes = await this.db.collection('disputes').get();

    const stats = {
      total: 0,
      pending: 0,
      routed_to_trader: 0,
      trader_accepted: 0,
      trader_rejected: 0,
      admin_approved: 0,
      admin_rejected: 0,
      unroutable: 0,
      byType: { payin: 0, payout: 0 },
      totalAmount: 0,
      avgResolutionHours: 0,
    };

    let totalResolutionTime = 0;
    let resolvedCount = 0;

    disputes.forEach(doc => {
      const d = doc.data();
      stats.total++;
      stats[d.status] = (stats[d.status] || 0) + 1;
      stats.byType[d.type] = (stats.byType[d.type] || 0) + 1;
      stats.totalAmount += Number(d.amount) || 0;

      if (d.resolvedAt && d.createdAt) {
        const created = d.createdAt.toMillis ? d.createdAt.toMillis() : d.createdAt.seconds * 1000;
        const resolved = d.resolvedAt.toMillis ? d.resolvedAt.toMillis() : d.resolvedAt.seconds * 1000;
        totalResolutionTime += (resolved - created) / (1000 * 60 * 60); // hours
        resolvedCount++;
      }
    });

    stats.avgResolutionHours = resolvedCount > 0
      ? Math.round((totalResolutionTime / resolvedCount) * 10) / 10
      : 0;

    // Recent logs
    const logsSnapshot = await this.db.collection('disputeEngineLogs')
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get();

    const logs = [];
    logsSnapshot.forEach(doc => {
      logs.push({ id: doc.id, ...doc.data() });
    });

    return { stats, logs };
  }
}

module.exports = DisputeEngine;
