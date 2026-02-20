/**
 * Pay2X Engine v2.0
 * Smart UPI Selection (Payin) + Smart Trader Selection (Payout) + Dispute Resolution
 */

// Payin Engine
const PayinEngine = require('./PayinEngine');
const { DEFAULT_CONFIG, mergeConfig } = require('./config');
const { scoreUpi, scoreAllUpis, getAmountTier } = require('./scorers/UpiScorer');
const { weightedRandomPick, selectWithFallback } = require('./UpiSelector');

// Payout Engine
const PayoutEngine = require('./PayoutEngine');
const { DEFAULT_PAYOUT_CONFIG, mergePayoutConfig } = require('./payoutConfig');
const { scoreTrader, scoreAllTraders, getPayoutAmountTier } = require('./scorers/TraderScorer');
const { weightedRandomPickTrader, selectTraderWithFallback } = require('./TraderSelector');

// Dispute Engine
const DisputeEngine = require('./DisputeEngine');
const { DEFAULT_DISPUTE_CONFIG, mergeDisputeConfig } = require('./disputeConfig');

module.exports = {
  // Payin
  PayinEngine,
  DEFAULT_CONFIG,
  mergeConfig,
  scoreUpi,
  scoreAllUpis,
  getAmountTier,
  weightedRandomPick,
  selectWithFallback,

  // Payout
  PayoutEngine,
  DEFAULT_PAYOUT_CONFIG,
  mergePayoutConfig,
  scoreTrader,
  scoreAllTraders,
  getPayoutAmountTier,
  weightedRandomPickTrader,
  selectTraderWithFallback,

  // Dispute
  DisputeEngine,
  DEFAULT_DISPUTE_CONFIG,
  mergeDisputeConfig,
};
