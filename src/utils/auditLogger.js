import { supabase } from '../supabase';
import { getCachedIP } from './ipCapture';

/**
 * Central audit logging function — Supabase version
 * Logs all critical actions across the platform for compliance and security
 *
 * @param {Object} params - Logging parameters
 * @param {string} params.action - Action type (e.g., 'upi_enabled', 'trader_balance_topup')
 * @param {string} params.category - Category: 'financial' | 'entity' | 'operational' | 'security' | 'system' | 'analytics'
 * @param {string} params.entityType - Entity affected: 'trader' | 'merchant' | 'user' | 'payin' | 'payout' | 'dispute' | 'upi' | 'system'
 * @param {string} params.entityId - ID of affected entity
 * @param {string} params.entityName - Display name of entity
 * @param {Object} params.details - Action details { before, after, amount, note, metadata }
 * @param {number} params.balanceBefore - Balance before action (for financial operations)
 * @param {number} params.balanceAfter - Balance after action (for financial operations)
 * @param {string} params.severity - Severity: 'info' | 'warning' | 'critical' (default: 'info')
 * @param {boolean} params.requiresReview - Flag for compliance review (default: false)
 * @param {string} params.source - Source: 'admin_panel' | 'api' | 'webhook' | 'cron' | 'system' (default: 'admin_panel')
 * @param {string} params.performedBy - Override performer ID (optional, uses current user)
 * @param {string} params.performedByName - Override performer name (optional)
 * @param {string} params.performedByRole - Override performer role (optional)
 * @param {string} params.performedByIp - Override performer IP (optional, uses cached IP)
 */
export async function logAuditEvent({
  action,
  category,
  entityType,
  entityId,
  entityName,
  details = {},
  balanceBefore = null,
  balanceAfter = null,
  severity = 'info',
  requiresReview = false,
  source = 'admin_panel',
  performedBy = null,
  performedByName = null,
  performedByRole = null,
  performedByIp = null,
}) {
  try {
    // Validate required fields
    if (!action) throw new Error('Action is required for audit logging');
    if (!category) throw new Error('Category is required for audit logging');

    // Get current user from Supabase (async)
    const { data: { user } } = await supabase.auth.getUser();

    // Get performer info
    const performerId = performedBy || user?.id || null;
    const performerName = performedByName || user?.email || user?.user_metadata?.display_name || 'System';
    const performerRole = performedByRole || 'admin';

    // Handle IP — PostgreSQL INET type does NOT accept 'unknown' or empty string
    const rawIp = performedByIp || getCachedIP();
    const ipForDb = (rawIp && rawIp !== 'unknown' && rawIp !== '') ? rawIp : null;

    // Build details JSONB
    const detailsJson = {
      before: details.before !== undefined ? details.before : null,
      after: details.after !== undefined ? details.after : null,
      amount: details.amount || null,
      note: details.note || null,
      metadata: details.metadata || null,
    };

    // Prepare log entry with snake_case column names
    const logEntry = {
      action,
      category,
      entity_type: entityType || null,
      entity_id: entityId || null,
      entity_name: entityName || null,
      performed_by: performerId,
      performed_by_name: performerName,
      performed_by_role: performerRole,
      performed_by_ip: ipForDb,
      details: detailsJson,
      severity,
      requires_review: requiresReview,
      source,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
    };

    // Write to Supabase
    const { error } = await supabase.from('admin_logs').insert(logEntry);

    if (error) throw error;

    console.log(`✅ Audit log created: ${action} [${category}]`, {
      entity: entityType ? `${entityType}:${entityId}` : 'none',
      performer: performerName,
    });

    return { success: true };
  } catch (error) {
    // CRITICAL: Never break app functionality if logging fails
    console.error('❌ Failed to create audit log:', error);
    console.error('Log details:', { action, category, entityType, entityId });

    // Return error but don't throw (silent failure)
    return { success: false, error: error.message };
  }
}

/**
 * Pre-configured logging functions for common actions
 * These provide better type safety and reduce boilerplate
 */

// Financial operations
export const logBalanceTopup = (traderId, traderName, amount, balanceBefore, balanceAfter, note) =>
  logAuditEvent({
    action: 'trader_balance_topup',
    category: 'financial',
    entityType: 'trader',
    entityId: traderId,
    entityName: traderName,
    details: { amount, note },
    balanceBefore,
    balanceAfter,
    severity: 'info',
  });

export const logBalanceDeduct = (traderId, traderName, amount, balanceBefore, balanceAfter, reason) =>
  logAuditEvent({
    action: 'trader_balance_deduct',
    category: 'financial',
    entityType: 'trader',
    entityId: traderId,
    entityName: traderName,
    details: { amount, note: reason },
    balanceBefore,
    balanceAfter,
    severity: 'warning',
  });

export const logSecurityHoldAdded = (traderId, traderName, amount, balanceBefore, balanceAfter, reason) =>
  logAuditEvent({
    action: 'security_hold_added',
    category: 'financial',
    entityType: 'trader',
    entityId: traderId,
    entityName: traderName,
    details: { amount, note: reason },
    balanceBefore,
    balanceAfter,
    severity: 'warning',
  });

export const logSecurityHoldReleased = (traderId, traderName, amount, balanceBefore, balanceAfter, reason) =>
  logAuditEvent({
    action: 'security_hold_released',
    category: 'financial',
    entityType: 'trader',
    entityId: traderId,
    entityName: traderName,
    details: { amount, note: reason },
    balanceBefore,
    balanceAfter,
    severity: 'info',
  });

// UPI operations
export const logUPIEnabled = (upiId, upiAddress, merchantId, reason) =>
  logAuditEvent({
    action: 'upi_enabled',
    category: 'operational',
    entityType: 'upi',
    entityId: upiId,
    entityName: upiAddress,
    details: {
      before: 'disabled',
      after: 'active',
      note: reason,
      metadata: { merchantId },
    },
    severity: 'warning',
  });

export const logUPIDisabled = (upiId, upiAddress, merchantId, reason) =>
  logAuditEvent({
    action: 'upi_disabled',
    category: 'operational',
    entityType: 'upi',
    entityId: upiId,
    entityName: upiAddress,
    details: {
      before: 'active',
      after: 'disabled',
      note: reason,
      metadata: { merchantId },
    },
    severity: 'warning',
  });

export const logUPIAdded = (upiId, upiAddress, merchantId) =>
  logAuditEvent({
    action: 'upi_added',
    category: 'operational',
    entityType: 'upi',
    entityId: upiId,
    entityName: upiAddress,
    details: {
      metadata: { merchantId },
    },
    severity: 'info',
  });

export const logUPIDeleted = (upiId, upiAddress, merchantId, reason) =>
  logAuditEvent({
    action: 'upi_deleted',
    category: 'operational',
    entityType: 'upi',
    entityId: upiId,
    entityName: upiAddress,
    details: {
      note: reason,
      metadata: { merchantId },
    },
    severity: 'warning',
    requiresReview: true,
  });

// Trader operations
export const logTraderActivated = (traderId, traderName, reason) =>
  logAuditEvent({
    action: 'trader_activated',
    category: 'entity',
    entityType: 'trader',
    entityId: traderId,
    entityName: traderName,
    details: { note: reason },
    severity: 'info',
  });

export const logTraderDeactivated = (traderId, traderName, reason) =>
  logAuditEvent({
    action: 'trader_deactivated',
    category: 'entity',
    entityType: 'trader',
    entityId: traderId,
    entityName: traderName,
    details: { note: reason },
    severity: 'warning',
  });

// Merchant operations
export const logMerchantActivated = (merchantId, merchantName, reason) =>
  logAuditEvent({
    action: 'merchant_activated',
    category: 'entity',
    entityType: 'merchant',
    entityId: merchantId,
    entityName: merchantName,
    details: { note: reason },
    severity: 'info',
  });

export const logMerchantDeactivated = (merchantId, merchantName, reason) =>
  logAuditEvent({
    action: 'merchant_deactivated',
    category: 'entity',
    entityType: 'merchant',
    entityId: merchantId,
    entityName: merchantName,
    details: { note: reason },
    severity: 'warning',
  });

export const logMerchantAPIKeyGenerated = (merchantId, merchantName, keyPrefix) =>
  logAuditEvent({
    action: 'merchant_apikey_generated',
    category: 'security',
    entityType: 'merchant',
    entityId: merchantId,
    entityName: merchantName,
    details: {
      metadata: { keyPrefix },
    },
    severity: 'warning',
    requiresReview: true,
  });

// Merchant balance operations
export const logMerchantBalanceTopup = (merchantId, merchantName, amount, balanceBefore, balanceAfter, note) =>
  logAuditEvent({
    action: 'merchant_balance_topup',
    category: 'financial',
    entityType: 'merchant',
    entityId: merchantId,
    entityName: merchantName,
    details: { amount, note },
    balanceBefore,
    balanceAfter,
    severity: 'info',
  });

export const logMerchantBalanceDeduct = (merchantId, merchantName, amount, balanceBefore, balanceAfter, reason) =>
  logAuditEvent({
    action: 'merchant_balance_deduct',
    category: 'financial',
    entityType: 'merchant',
    entityId: merchantId,
    entityName: merchantName,
    details: { amount, note: reason },
    balanceBefore,
    balanceAfter,
    severity: 'warning',
  });

// Authentication operations
export const logLoginSuccess = (role, userId, userName, email, userAgent, clientIP) =>
  logAuditEvent({
    action: 'login_success',
    category: 'security',
    entityType: role,
    entityId: userId,
    entityName: userName,
    details: {
      note: `${role.charAt(0).toUpperCase() + role.slice(1)} logged in successfully`,
      metadata: { email, userAgent },
    },
    performedByIp: clientIP,
    severity: 'info',
  });

export const logLoginFailure = (email, reason, errorCode, userAgent, clientIP, isSuspicious = false) =>
  logAuditEvent({
    action: 'login_failed',
    category: 'security',
    entityType: 'user',
    entityId: null,
    entityName: email,
    details: {
      note: `Login attempt failed: ${reason}`,
      metadata: { email, userAgent, errorCode },
    },
    performedByIp: clientIP,
    severity: isSuspicious ? 'critical' : 'warning',
    requiresReview: isSuspicious,
  });

// Data operations
export const logDataExported = (dataType, recordCount, filters = {}) =>
  logAuditEvent({
    action: 'data_exported',
    category: 'security',
    entityType: 'system',
    entityId: 'export',
    entityName: `${dataType} Export`,
    details: {
      note: `Exported ${recordCount} ${dataType} records as CSV`,
      metadata: {
        dataType,
        recordCount,
        filters,
        exportedAt: new Date().toISOString(),
      },
    },
    severity: 'info',
    requiresReview: recordCount > 10000,
  });

export const logDataDeleted = (entityType, entityId, entityName, reason = '') =>
  logAuditEvent({
    action: 'data_deleted',
    category: 'security',
    entityType,
    entityId,
    entityName,
    details: {
      note: reason || `${entityType} permanently deleted`,
      metadata: {
        deletedAt: new Date().toISOString(),
      },
    },
    severity: 'critical',
    requiresReview: true,
  });

// System configuration operations
export const logTatumAPIKeyChanged = (oldKeyPrefix, newKeyPrefix) =>
  logAuditEvent({
    action: 'tatum_apikey_changed',
    category: 'system',
    entityType: 'system',
    entityId: 'tatumConfig',
    entityName: 'Tatum API Key',
    details: {
      note: 'Tatum API key updated',
      metadata: {
        oldKeyPrefix,
        newKeyPrefix,
        changedAt: new Date().toISOString(),
      },
    },
    severity: 'critical',
    requiresReview: true,
  });

export const logAdminWalletChanged = (oldWallet, newWallet) =>
  logAuditEvent({
    action: 'admin_wallet_changed',
    category: 'system',
    entityType: 'system',
    entityId: 'tatumConfig',
    entityName: 'Admin Wallet Address',
    details: {
      note: 'Admin USDT wallet address updated (where funds are swept)',
      before: oldWallet || 'none',
      after: newWallet,
      metadata: {
        changedAt: new Date().toISOString(),
      },
    },
    severity: 'critical',
    requiresReview: true,
  });

export const logMasterWalletGenerated = (address, xpubPrefix, wasRegenerated = false) =>
  logAuditEvent({
    action: 'master_wallet_generated',
    category: 'system',
    entityType: 'system',
    entityId: 'tatumConfig',
    entityName: 'Master Wallet',
    details: {
      note: wasRegenerated
        ? 'Master wallet regenerated (replaced old wallet)'
        : 'Master wallet generated for first time',
      metadata: {
        address,
        xpubPrefix,
        generatedAt: new Date().toISOString(),
        wasRegenerated,
      },
    },
    severity: 'critical',
    requiresReview: true,
  });

// Dispute operations
export const logDisputeResolved = (disputeId, type, merchantId, traderId, outcome, note) =>
  logAuditEvent({
    action: 'dispute_resolved',
    category: 'operational',
    entityType: 'dispute',
    entityId: disputeId,
    entityName: `${type} Dispute`,
    details: {
      after: outcome,
      note,
      metadata: { merchantId, traderId, type },
    },
    severity: 'info',
  });

// System operations
export const logSettingsChanged = (settingName, before, after, note) =>
  logAuditEvent({
    action: 'settings_changed',
    category: 'system',
    entityType: 'system',
    entityId: settingName,
    entityName: settingName,
    details: { before, after, note },
    severity: 'warning',
    requiresReview: true,
  });

// USDT deposit operations
export const logUSDTDepositAddressGenerated = (traderId, traderName, address, derivationIndex) =>
  logAuditEvent({
    action: 'usdt_deposit_address_generated',
    category: 'financial',
    entityType: 'trader',
    entityId: traderId,
    entityName: traderName,
    details: {
      metadata: { address, derivationIndex },
    },
    severity: 'info',
  });

export const logUSDTDepositDetected = (traderId, traderName, amount, usdtAmount, txHash, address) =>
  logAuditEvent({
    action: 'usdt_deposit_detected',
    category: 'financial',
    entityType: 'trader',
    entityId: traderId,
    entityName: traderName,
    details: {
      amount,
      metadata: { usdtAmount, txHash, address },
    },
    severity: 'info',
    source: 'webhook',
  });

export const logUSDTDepositCredited = (traderId, traderName, amount, usdtAmount, txHash, balanceBefore, balanceAfter) =>
  logAuditEvent({
    action: 'usdt_deposit_credited',
    category: 'financial',
    entityType: 'trader',
    entityId: traderId,
    entityName: traderName,
    details: {
      amount,
      metadata: { usdtAmount, txHash },
    },
    balanceBefore,
    balanceAfter,
    severity: 'info',
    source: 'webhook',
  });
