// src/hooks/useTwoFactor.js
// Hook for 2FA verification in protected actions

import { useState, useCallback, useEffect } from 'react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../supabase';

// Action keys - must match database
export const TwoFactorActions = {
  BALANCE_ADJUSTMENT: 'balance_adjustment',
  APPROVE_PAYOUT_LARGE: 'approve_payout_large',
  APPROVE_DISPUTE: 'approve_dispute',
  CREATE_ADMIN: 'create_admin',
  DELETE_ADMIN: 'delete_admin',
  RESET_PASSWORD: 'reset_password',
  CHANGE_COMMISSION: 'change_commission',
  PROCESS_SETTLEMENT: 'process_settlement',
  EXPORT_SENSITIVE: 'export_sensitive',
  DEACTIVATE_ENTITY: 'deactivate_entity',
  REGENERATE_API_KEY: 'regenerate_api_key',
  CHANGE_WEBHOOK: 'change_webhook',
  MODIFY_UPI_POOL: 'modify_upi_pool',
  DELETE_ENTITY: 'delete_entity',
  CHANGE_ENGINE_CONFIG: 'change_engine_config',
};

// Human-readable action names
export const TwoFactorActionNames = {
  [TwoFactorActions.BALANCE_ADJUSTMENT]: 'Balance Adjustment',
  [TwoFactorActions.APPROVE_PAYOUT_LARGE]: 'Approve Large Payout',
  [TwoFactorActions.APPROVE_DISPUTE]: 'Approve Dispute',
  [TwoFactorActions.CREATE_ADMIN]: 'Create Admin/Worker',
  [TwoFactorActions.DELETE_ADMIN]: 'Delete Admin/Worker',
  [TwoFactorActions.RESET_PASSWORD]: 'Reset Password',
  [TwoFactorActions.CHANGE_COMMISSION]: 'Change Commission Rate',
  [TwoFactorActions.PROCESS_SETTLEMENT]: 'Process Settlement',
  [TwoFactorActions.EXPORT_SENSITIVE]: 'Export Sensitive Data',
  [TwoFactorActions.DEACTIVATE_ENTITY]: 'Deactivate Account',
  [TwoFactorActions.REGENERATE_API_KEY]: 'Regenerate API Key',
  [TwoFactorActions.CHANGE_WEBHOOK]: 'Change Webhook URL',
  [TwoFactorActions.MODIFY_UPI_POOL]: 'Modify UPI Pool',
  [TwoFactorActions.DELETE_ENTITY]: 'Delete Account',
  [TwoFactorActions.CHANGE_ENGINE_CONFIG]: 'Change Engine Config',
};

// Threshold for large payouts (in INR)
export const LARGE_PAYOUT_THRESHOLD = 50000;

/**
 * Hook to manage 2FA verification for protected actions
 * 
 * Usage:
 * const { requiresVerification, verifyAndExecute, TwoFactorModal } = useTwoFactor();
 * 
 * // Check if action requires 2FA
 * if (requiresVerification) {
 *   verifyAndExecute(TwoFactorActions.BALANCE_ADJUSTMENT, async () => {
 *     await doTheAction();
 *   });
 * }
 */
export function useTwoFactor() {
  const [userHas2FA, setUserHas2FA] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [actionConfig, setActionConfig] = useState({ name: '', key: '' });
  const [loading, setLoading] = useState(true);

  // Check if current user has 2FA enabled
  useEffect(() => {
    const check2FAStatus = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const response = await fetch(
          `${SUPABASE_URL}/functions/v1/two-factor`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ action: 'status' }),
          }
        );

        const data = await response.json();
        setUserHas2FA(data.enabled);
      } catch (err) {
        console.error('Failed to check 2FA status:', err);
      } finally {
        setLoading(false);
      }
    };

    check2FAStatus();
  }, []);

  /**
   * Execute an action with 2FA verification if required
   * @param {string} actionKey - The action key from TwoFactorActions
   * @param {Function} callback - The async function to execute after verification
   * @param {number} amount - Optional amount for threshold-based actions
   */
  const verifyAndExecute = useCallback((actionKey, callback, amount = null) => {
    // If user doesn't have 2FA enabled, just execute the action
    if (!userHas2FA) {
      callback();
      return;
    }

    // For large payout actions, check threshold
    if (actionKey === TwoFactorActions.APPROVE_PAYOUT_LARGE && amount !== null) {
      if (amount < LARGE_PAYOUT_THRESHOLD) {
        callback();
        return;
      }
    }

    // Show 2FA modal
    const actionName = TwoFactorActionNames[actionKey] || actionKey;
    setActionConfig({ name: actionName, key: actionKey });
    setPendingAction(() => callback);
    setIsModalOpen(true);
  }, [userHas2FA]);

  const handleVerified = useCallback(() => {
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  }, [pendingAction]);

  const handleClose = useCallback(() => {
    setIsModalOpen(false);
    setPendingAction(null);
  }, []);

  return {
    userHas2FA,
    loading,
    isModalOpen,
    actionConfig,
    verifyAndExecute,
    handleVerified,
    handleClose,
  };
}

/**
 * Simpler hook that just wraps a single action
 */
export function useProtectedAction(actionKey) {
  const { userHas2FA, verifyAndExecute, isModalOpen, actionConfig, handleVerified, handleClose } = useTwoFactor();

  const execute = useCallback((callback, amount = null) => {
    verifyAndExecute(actionKey, callback, amount);
  }, [actionKey, verifyAndExecute]);

  return {
    execute,
    requiresVerification: userHas2FA,
    isModalOpen,
    actionConfig,
    handleVerified,
    handleClose,
  };
}
