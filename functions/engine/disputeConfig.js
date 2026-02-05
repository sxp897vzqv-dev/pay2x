/**
 * Dispute Engine Configuration
 */

const DEFAULT_DISPUTE_CONFIG = {
  // SLA settings (in hours)
  sla: {
    traderResponseHours: 4,     // Trader must respond within 4 hours
    adminReviewHours: 24,       // Admin must decide within 24 hours
    escalationHours: 48,        // Auto-escalate if unresolved
  },

  // Auto-routing settings
  routing: {
    enableAutoRoute: true,      // Auto-route to trader on creation
    enableLogging: true,        // Log routing decisions
  },

  // Balance adjustment settings
  balance: {
    deductCommissionOnPayoutFail: true,  // Deduct commission when payout wasn't sent
  },

  // Feature flags
  enableSLAAlerts: true,
  enableDisputeScoring: true,
};

function mergeDisputeConfig(firestoreConfig) {
  if (!firestoreConfig) return DEFAULT_DISPUTE_CONFIG;

  return {
    ...DEFAULT_DISPUTE_CONFIG,
    ...firestoreConfig,
    sla: {
      ...DEFAULT_DISPUTE_CONFIG.sla,
      ...(firestoreConfig.sla || {}),
    },
    routing: {
      ...DEFAULT_DISPUTE_CONFIG.routing,
      ...(firestoreConfig.routing || {}),
    },
    balance: {
      ...DEFAULT_DISPUTE_CONFIG.balance,
      ...(firestoreConfig.balance || {}),
    },
  };
}

module.exports = {
  DEFAULT_DISPUTE_CONFIG,
  mergeDisputeConfig,
};
