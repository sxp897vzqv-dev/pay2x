import React, { useState } from 'react';
import { Key, RefreshCw, Check, AlertCircle, Shield } from 'lucide-react';
import { resetUserPassword } from '../../../../supabaseAdmin';
import TwoFactorModal, { useTwoFactorVerification } from '../../../../components/TwoFactorModal';
import { TwoFactorActions } from '../../../../hooks/useTwoFactor';

export default function ResetPasswordButton({ email, name, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null); // 'success' | 'error' | null
  
  // 2FA
  const { requireVerification, TwoFactorModal: TwoFactorModalComponent } = useTwoFactorVerification();

  const doReset = async () => {
    setLoading(true);
    setStatus(null);

    try {
      await resetUserPassword(email);
      setStatus('success');
      if (onSuccess) onSuccess();
      
      // Clear success status after 3 seconds
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      console.error('Password reset error:', err);
      setStatus('error');
      setTimeout(() => setStatus(null), 3000);
    }

    setLoading(false);
  };

  const handleReset = () => {
    if (!confirm(`Reset password for ${name || email}?\n\nA new password will be generated and sent to their email.`)) {
      return;
    }
    requireVerification('Reset Password', TwoFactorActions.RESET_PASSWORD, doReset);
  };

  if (status === 'success') {
    return (
      <button
        disabled
        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 text-xs font-medium rounded-lg"
      >
        <Check className="w-3.5 h-3.5" />
        Sent!
      </button>
    );
  }

  if (status === 'error') {
    return (
      <button
        disabled
        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-700 text-xs font-medium rounded-lg"
      >
        <AlertCircle className="w-3.5 h-3.5" />
        Failed
      </button>
    );
  }

  return (
    <>
      <button
        onClick={handleReset}
        disabled={loading}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-100 hover:bg-orange-200 text-orange-700 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
        title="Reset password and send to email"
      >
        {loading ? (
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Key className="w-3.5 h-3.5" />
        )}
        Reset Password
      </button>
      <TwoFactorModalComponent />
    </>
  );
}
