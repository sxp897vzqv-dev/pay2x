// src/components/TwoFactorModal.jsx
// Reusable 2FA verification modal for protected actions

import React, { useState, useRef, useEffect } from 'react';
import { Shield, X, AlertCircle, Loader2, CheckCircle, Key } from 'lucide-react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../supabase';

export default function TwoFactorModal({ 
  isOpen, 
  onClose, 
  onVerified, 
  actionName = 'this action',
  actionKey = 'unknown',
}) {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const inputRefs = useRef([]);

  useEffect(() => {
    if (isOpen) {
      setCode(['', '', '', '', '', '']);
      setError('');
      setSuccess(false);
      // Focus first input
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  }, [isOpen]);

  const handleChange = (index, value) => {
    // Only allow numbers
    if (value && !/^\d$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);
    setError('');

    // Move to next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all filled
    if (value && index === 5) {
      const fullCode = newCode.join('');
      if (fullCode.length === 6) {
        handleVerify(fullCode);
      }
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'Enter') {
      const fullCode = code.join('');
      if (fullCode.length === 6) {
        handleVerify(fullCode);
      }
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      const newCode = pasted.split('');
      setCode(newCode);
      handleVerify(pasted);
    }
  };

  const handleVerify = async (fullCode) => {
    setLoading(true);
    setError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/two-factor`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            action: 'verify',
            code: fullCode,
            protectedAction: actionKey,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Verification failed');
      }

      setSuccess(true);
      
      // Small delay to show success state
      setTimeout(() => {
        onVerified();
        onClose();
      }, 500);
    } catch (err) {
      setError(err.message || 'Invalid code. Please try again.');
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">2FA Verification</h3>
                <p className="text-indigo-100 text-sm">Confirm {actionName}</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/20 transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          {success ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <p className="text-green-700 font-semibold">Verified successfully!</p>
            </div>
          ) : (
            <>
              <p className="text-slate-600 text-center mb-6">
                Enter the 6-digit code from your authenticator app
              </p>

              {/* Code Input */}
              <div className="flex justify-center gap-2 mb-6" onPaste={handlePaste}>
                {code.map((digit, index) => (
                  <input
                    key={index}
                    ref={el => inputRefs.current[index] = el}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleChange(index, e.target.value)}
                    onKeyDown={e => handleKeyDown(index, e)}
                    disabled={loading}
                    className={`w-12 h-14 text-center text-2xl font-bold border-2 rounded-xl transition-all
                      ${error ? 'border-red-300 bg-red-50' : 'border-slate-200'}
                      ${digit ? 'border-indigo-400 bg-indigo-50' : ''}
                      focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none
                      disabled:opacity-50 disabled:cursor-not-allowed`}
                  />
                ))}
              </div>

              {/* Error */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {/* Backup code hint */}
              <div className="bg-slate-50 rounded-xl p-3 flex items-start gap-2">
                <Key className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-slate-500">
                  Lost access to your authenticator? You can use a backup code instead.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <div className="px-6 pb-6">
            <button
              onClick={() => {
                const fullCode = code.join('');
                if (fullCode.length === 6) handleVerify(fullCode);
              }}
              disabled={loading || code.join('').length !== 6}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 
                disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4" />
                  Verify & Continue
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Hook for easy 2FA verification
export function useTwoFactorVerification() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [actionConfig, setActionConfig] = useState({ name: '', key: '' });

  const requireVerification = (actionName, actionKey, callback) => {
    setActionConfig({ name: actionName, key: actionKey });
    setPendingAction(() => callback);
    setIsModalOpen(true);
  };

  const handleVerified = () => {
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setPendingAction(null);
  };

  const TwoFactorModalComponent = () => (
    <TwoFactorModal
      isOpen={isModalOpen}
      onClose={handleClose}
      onVerified={handleVerified}
      actionName={actionConfig.name}
      actionKey={actionConfig.key}
    />
  );

  return {
    requireVerification,
    TwoFactorModal: TwoFactorModalComponent,
  };
}
