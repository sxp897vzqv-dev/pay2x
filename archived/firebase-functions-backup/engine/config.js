/**
 * Payin Engine Configuration
 * Default values - can be overridden by Firestore system/engineConfig
 */

const DEFAULT_CONFIG = {
  // Scoring weights (should sum to ~100)
  weights: {
    successRate: 25,      // UPI's historical success rate
    dailyLimitLeft: 20,   // Remaining daily capacity
    cooldown: 15,         // Time since last transaction
    amountMatch: 15,      // UPI tier matches amount
    traderBalance: 10,    // Trader has sufficient balance
    bankHealth: 5,        // Bank's current status
    timeWindow: 5,        // Not in maintenance window
    recentFailures: 5,    // Penalty for recent failures
  },

  // Selection settings
  minScoreThreshold: 30,      // Minimum score to be considered
  maxCandidates: 5,           // Top N candidates for random pick
  maxFallbackAttempts: 3,     // Retry attempts before failing

  // UPI operational limits
  cooldownMinutes: 2,         // Min gap between txns on same UPI
  maxDailyTxnsPerUpi: 50,     // Max transactions per day
  failureThreshold: 3,        // Failures in 1 hour to pause UPI
  
  // Amount tiers for routing
  amountTiers: {
    low: { min: 500, max: 2000 },
    medium: { min: 2001, max: 10000 },
    high: { min: 10001, max: 50000 },
  },

  // Feature flags
  enableRandomness: true,
  enableFallback: true,
  enableLogging: true,
  
  // Randomness settings
  randomnessFactor: 0.1,      // ±10% random variation
  scoreExponent: 2,           // Higher = more bias to top scores
};

/**
 * Merge Firestore config with defaults
 */
function mergeConfig(firestoreConfig) {
  if (!firestoreConfig) return DEFAULT_CONFIG;
  
  return {
    ...DEFAULT_CONFIG,
    ...firestoreConfig,
    weights: {
      ...DEFAULT_CONFIG.weights,
      ...(firestoreConfig.weights || {}),
    },
    amountTiers: {
      ...DEFAULT_CONFIG.amountTiers,
      ...(firestoreConfig.amountTiers || {}),
    },
  };
}

module.exports = {
  DEFAULT_CONFIG,
  mergeConfig,
};
