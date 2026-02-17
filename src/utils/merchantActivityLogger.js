/**
 * Merchant Activity Logger
 * Centralized logging utility for all merchant actions
 */

import { supabase } from '../supabase';

// Action constants for consistency
export const MERCHANT_ACTIONS = {
  // Auth & Security
  LOGIN: 'auth.login',
  LOGOUT: 'auth.logout',
  TWO_FA_ENABLED: 'auth.2fa_enabled',
  TWO_FA_DISABLED: 'auth.2fa_disabled',
  PASSWORD_CHANGED: 'auth.password_changed',
  SESSION_REVOKED: 'auth.session_revoked',
  SESSION_REVOKED_ALL: 'auth.sessions_revoked_all',
  
  // API & Webhooks
  API_KEY_REGENERATED: 'api.key_regenerated',
  API_KEY_VIEWED: 'api.key_viewed',
  WEBHOOK_URL_UPDATED: 'api.webhook_url_updated',
  WEBHOOK_EVENTS_UPDATED: 'api.webhook_events_updated',
  WEBHOOK_TEST_SENT: 'api.webhook_test_sent',
  
  // Payouts
  PAYOUT_CREATED: 'payout.created',
  PAYOUT_CANCELLED: 'payout.cancelled',
  
  // Disputes
  DISPUTE_CREATED: 'dispute.created',
  
  // Refunds
  REFUND_REQUESTED: 'refund.requested',
  
  // Settlements
  SETTLEMENT_REQUESTED: 'settlement.requested',
  
  // Settings
  PROFILE_UPDATED: 'settings.profile_updated',
  NOTIFICATIONS_UPDATED: 'settings.notifications_updated',
  TEST_MODE_ENABLED: 'settings.test_mode_enabled',
  TEST_MODE_DISABLED: 'settings.test_mode_disabled',
};

// Category constants
export const CATEGORIES = {
  AUTH: 'auth',
  API: 'api',
  PAYOUT: 'payout',
  DISPUTE: 'dispute',
  REFUND: 'refund',
  SETTLEMENT: 'settlement',
  SETTINGS: 'settings',
};

// Severity levels
export const SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical',
};

// Map actions to their metadata
const ACTION_METADATA = {
  // Auth & Security
  [MERCHANT_ACTIONS.LOGIN]: {
    category: CATEGORIES.AUTH,
    severity: SEVERITY.INFO,
    description: 'Logged into account',
  },
  [MERCHANT_ACTIONS.LOGOUT]: {
    category: CATEGORIES.AUTH,
    severity: SEVERITY.INFO,
    description: 'Logged out of account',
  },
  [MERCHANT_ACTIONS.TWO_FA_ENABLED]: {
    category: CATEGORIES.AUTH,
    severity: SEVERITY.CRITICAL,
    description: 'Two-factor authentication enabled',
  },
  [MERCHANT_ACTIONS.TWO_FA_DISABLED]: {
    category: CATEGORIES.AUTH,
    severity: SEVERITY.CRITICAL,
    description: 'Two-factor authentication disabled',
  },
  [MERCHANT_ACTIONS.PASSWORD_CHANGED]: {
    category: CATEGORIES.AUTH,
    severity: SEVERITY.CRITICAL,
    description: 'Account password changed',
  },
  [MERCHANT_ACTIONS.SESSION_REVOKED]: {
    category: CATEGORIES.AUTH,
    severity: SEVERITY.WARNING,
    description: 'Session revoked',
  },
  [MERCHANT_ACTIONS.SESSION_REVOKED_ALL]: {
    category: CATEGORIES.AUTH,
    severity: SEVERITY.WARNING,
    description: 'All other sessions revoked',
  },
  
  // API & Webhooks
  [MERCHANT_ACTIONS.API_KEY_REGENERATED]: {
    category: CATEGORIES.API,
    severity: SEVERITY.CRITICAL,
    description: 'API key regenerated',
  },
  [MERCHANT_ACTIONS.API_KEY_VIEWED]: {
    category: CATEGORIES.API,
    severity: SEVERITY.INFO,
    description: 'API key revealed',
  },
  [MERCHANT_ACTIONS.WEBHOOK_URL_UPDATED]: {
    category: CATEGORIES.API,
    severity: SEVERITY.WARNING,
    description: 'Webhook URL updated',
  },
  [MERCHANT_ACTIONS.WEBHOOK_EVENTS_UPDATED]: {
    category: CATEGORIES.API,
    severity: SEVERITY.WARNING,
    description: 'Webhook events configuration updated',
  },
  [MERCHANT_ACTIONS.WEBHOOK_TEST_SENT]: {
    category: CATEGORIES.API,
    severity: SEVERITY.INFO,
    description: 'Test webhook sent',
  },
  
  // Payouts
  [MERCHANT_ACTIONS.PAYOUT_CREATED]: {
    category: CATEGORIES.PAYOUT,
    severity: SEVERITY.CRITICAL,
    description: 'Payout request created',
  },
  [MERCHANT_ACTIONS.PAYOUT_CANCELLED]: {
    category: CATEGORIES.PAYOUT,
    severity: SEVERITY.WARNING,
    description: 'Payout request cancelled',
  },
  
  // Disputes
  [MERCHANT_ACTIONS.DISPUTE_CREATED]: {
    category: CATEGORIES.DISPUTE,
    severity: SEVERITY.WARNING,
    description: 'Dispute filed',
  },
  
  // Refunds
  [MERCHANT_ACTIONS.REFUND_REQUESTED]: {
    category: CATEGORIES.REFUND,
    severity: SEVERITY.WARNING,
    description: 'Refund requested',
  },
  
  // Settlements
  [MERCHANT_ACTIONS.SETTLEMENT_REQUESTED]: {
    category: CATEGORIES.SETTLEMENT,
    severity: SEVERITY.CRITICAL,
    description: 'Settlement requested',
  },
  
  // Settings
  [MERCHANT_ACTIONS.PROFILE_UPDATED]: {
    category: CATEGORIES.SETTINGS,
    severity: SEVERITY.INFO,
    description: 'Business profile updated',
  },
  [MERCHANT_ACTIONS.NOTIFICATIONS_UPDATED]: {
    category: CATEGORIES.SETTINGS,
    severity: SEVERITY.INFO,
    description: 'Notification preferences updated',
  },
  [MERCHANT_ACTIONS.TEST_MODE_ENABLED]: {
    category: CATEGORIES.SETTINGS,
    severity: SEVERITY.WARNING,
    description: 'Test mode enabled',
  },
  [MERCHANT_ACTIONS.TEST_MODE_DISABLED]: {
    category: CATEGORIES.SETTINGS,
    severity: SEVERITY.WARNING,
    description: 'Test mode disabled (now LIVE)',
  },
};

/**
 * Log a merchant activity
 * @param {string} action - Action constant from MERCHANT_ACTIONS
 * @param {object} options - Additional options
 * @param {string} options.entityType - Type of entity (payout, dispute, etc.)
 * @param {string} options.entityId - ID of the affected entity
 * @param {object} options.details - Additional details to log
 * @param {string} options.description - Override default description
 */
export async function logMerchantActivity(action, options = {}) {
  try {
    const metadata = ACTION_METADATA[action] || {
      category: 'other',
      severity: SEVERITY.INFO,
      description: action,
    };

    const { data, error } = await supabase.rpc('log_merchant_activity', {
      p_action: action,
      p_category: metadata.category,
      p_description: options.description || metadata.description,
      p_entity_type: options.entityType || null,
      p_entity_id: options.entityId || null,
      p_details: options.details || {},
      p_severity: options.severity || metadata.severity,
      p_ip_address: null, // Browser can't reliably get IP
      p_user_agent: navigator.userAgent || null,
    });

    if (error) {
      console.error('Failed to log activity:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Activity logging error:', err);
    return null;
  }
}

/**
 * Helper to format currency for logging
 */
export function formatAmount(amount) {
  return `₹${Number(amount).toLocaleString('en-IN')}`;
}

/**
 * Helper to create change details object
 */
export function createChangeDetails(oldValue, newValue, field) {
  return {
    field,
    old_value: oldValue,
    new_value: newValue,
    changed_at: new Date().toISOString(),
  };
}

export default {
  MERCHANT_ACTIONS,
  CATEGORIES,
  SEVERITY,
  logMerchantActivity,
  formatAmount,
  createChangeDetails,
};
