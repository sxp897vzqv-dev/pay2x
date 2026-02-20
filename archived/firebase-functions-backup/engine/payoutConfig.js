/**
 * Payout Engine Configuration
 * Default values - can be overridden by Firestore system/payoutEngineConfig
 */

const DEFAULT_PAYOUT_CONFIG = {
  // Scoring weights (sum to ~100)
  weights: {
    successRate: 25,        // Trader's payout completion rate
    speed: 20,              // Average time to complete payouts
    currentLoad: 15,        // How many active payouts they're handling
    cancelRate: 15,         // Penalty for frequent cancellations
    cooldown: 10,           // Time since last assignment
    amountTierMatch: 5,     // Trader handles this amount range well
    onlineStatus: 5,        // Is trader currently active
    priority: 5,            // Admin-set trader priority
  },

  // Selection settings
  minScoreThreshold: 20,      // Minimum score to be considered
  maxCandidates: 5,           // Top N candidates for random pick
  maxFallbackAttempts: 3,     // Retry attempts before failing

  // Trader operational limits
  cooldownMinutes: 1,         // Min gap between assignments to same trader
  maxActivePayouts: 10,       // Max concurrent payouts per trader
  cancelThreshold: 5,         // Cancels in last 24h to pause trader
  maxDailyPayouts: 100,       // Max payouts per trader per day

  // Amount tiers
  amountTiers: {
    low: { min: 100, max: 5000 },
    medium: { min: 5001, max: 25000 },
    high: { min: 25001, max: 100000 },
  },

  // Speed benchmarks (in minutes)
  speedBenchmarks: {
    excellent: 5,     // Under 5 min = perfect score
    good: 15,         // Under 15 min = good score
    acceptable: 30,   // Under 30 min = okay
    slow: 60,         // Over 60 min = penalty
  },

  // Feature flags
  enableRandomness: true,
  enableFallback: true,
  enableLogging: true,

  // Randomness settings
  randomnessFactor: 0.1,     // ±10% random variation
  scoreExponent: 2,          // Higher = more bias to top scores

  // Auto-reassign settings
  reassignAfterMinutes: 30,  // Reassign if trader hasn't acted
};

/**
 * Merge Firestore config with defaults
 */
function mergePayoutConfig(firestoreConfig) {
  if (!firestoreConfig) return DEFAULT_PAYOUT_CONFIG;

  return {
    ...DEFAULT_PAYOUT_CONFIG,
    ...firestoreConfig,
    weights: {
      ...DEFAULT_PAYOUT_CONFIG.weights,
      ...(firestoreConfig.weights || {}),
    },
    amountTiers: {
      ...DEFAULT_PAYOUT_CONFIG.amountTiers,
      ...(firestoreConfig.amountTiers || {}),
    },
    speedBenchmarks: {
      ...DEFAULT_PAYOUT_CONFIG.speedBenchmarks,
      ...(firestoreConfig.speedBenchmarks || {}),
    },
  };
}

module.exports = {
  DEFAULT_PAYOUT_CONFIG,
  mergePayoutConfig,
};
