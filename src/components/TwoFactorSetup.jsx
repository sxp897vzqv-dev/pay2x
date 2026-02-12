// src/components/TwoFactorSetup.jsx
// 2FA Setup component for admin security settings

import React, { useState, useEffect } from 'react';
import { 
  Shield, QrCode, Key, Copy, CheckCircle, AlertCircle, 
  Loader2, Smartphone, RefreshCw, ShieldOff, ShieldCheck,
  Download, Eye, EyeOff
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../supabase';

export default function TwoFactorSetup() {
  const [status, setStatus] = useState(null); // null = loading, object = loaded
  const [setupData, setSetupData] = useState(null);
  const [step, setStep] = useState('status'); // status, setup, verify, backup, complete
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [backupCodes, setBackupCodes] = useState([]);
  const [showSecret, setShowSecret] = useState(false);
  const [copied, setCopied] = useState(false);

  // Fetch 2FA status when session is ready
  useEffect(() => {
    // Wait for auth to be ready
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        fetchStatus();
      } else {
        setStatus({ enabled: false });
        setStep('status');
        setLoading(false);
      }
    });

    // Also try immediate fetch
    fetchStatus();

    return () => subscription.unsubscribe();
  }, []);

  const fetchStatus = async () => {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      console.log('2FA fetchStatus - Session:', session ? 'exists' : 'null', sessionError);
      
      // If no session, user not logged in - show not enabled state
      if (!session?.access_token) {
        console.log('2FA: No access token, showing not enabled');
        setStatus({ enabled: false });
        setStep('status');
        setLoading(false);
        return;
      }
      
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

      if (!response.ok) {
        // Handle auth errors gracefully
        if (response.status === 401) {
          setStatus({ enabled: false });
          setStep('status');
          setLoading(false);
          return;
        }
        throw new Error('Failed to fetch status');
      }

      const data = await response.json();
      setStatus(data);
      setStep(data.enabled ? 'enabled' : 'status');
    } catch (err) {
      console.error('2FA status error:', err);
      // Default to not enabled on error
      setStatus({ enabled: false });
      setStep('status');
    } finally {
      setLoading(false);
    }
  };

  const startSetup = async () => {
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
          body: JSON.stringify({ action: 'setup' }),
        }
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      setSetupData(data);
      setStep('setup');
    } catch (err) {
      setError(err.message || 'Failed to start setup');
    } finally {
      setLoading(false);
    }
  };

  const verifySetup = async () => {
    if (code.length !== 6) {
      setError('Please enter a 6-digit code');
      return;
    }

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
          body: JSON.stringify({ action: 'verify-setup', code }),
        }
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      setBackupCodes(data.backupCodes);
      setStep('backup');
    } catch (err) {
      setError(err.message || 'Invalid code');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const disable2FA = async () => {
    if (code.length !== 6) {
      setError('Please enter a 6-digit code to disable 2FA');
      return;
    }

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
          body: JSON.stringify({ action: 'disable', code }),
        }
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      setStatus({ enabled: false });
      setStep('status');
      setCode('');
    } catch (err) {
      setError(err.message || 'Failed to disable 2FA');
    } finally {
      setLoading(false);
    }
  };

  const copySecret = () => {
    navigator.clipboard.writeText(setupData?.secret || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadBackupCodes = () => {
    const content = `Pay2X Backup Codes\n==================\n\nGenerated: ${new Date().toLocaleString()}\n\nKeep these codes safe! Each code can only be used once.\n\n${backupCodes.map((c, i) => `${i + 1}. ${c}`).join('\n')}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pay2x-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
          <Shield className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">Two-Factor Authentication</h2>
          <p className="text-slate-500 text-sm">Add an extra layer of security to your account</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Status / Not Enabled */}
      {step === 'status' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center">
                <ShieldOff className="w-8 h-8 text-slate-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">2FA Not Enabled</h3>
                <p className="text-slate-500">Your account is not protected by two-factor authentication</p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
              <p className="text-amber-800 text-sm">
                <strong>Recommended:</strong> Enable 2FA to protect sensitive actions like balance adjustments, 
                approving payouts, and managing users.
              </p>
            </div>

            <button
              onClick={startSetup}
              disabled={loading}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 
                disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
              Enable Two-Factor Authentication
            </button>
          </div>
        </div>
      )}

      {/* Setup - Show QR Code */}
      {step === 'setup' && setupData && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-6">
            <div className="text-center mb-6">
              <h3 className="text-lg font-bold text-slate-900 mb-2">Scan QR Code</h3>
              <p className="text-slate-500 text-sm">
                Use Google Authenticator, Authy, or any TOTP app to scan this code
              </p>
            </div>

            {/* QR Code */}
            <div className="flex justify-center mb-6">
              <div className="bg-white p-4 rounded-2xl shadow-lg border border-slate-100">
                <QRCodeSVG 
                  value={setupData.otpauthUrl} 
                  size={192}
                  level="M"
                  includeMargin={false}
                />
              </div>
            </div>

            {/* Manual entry option */}
            <div className="bg-slate-50 rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-slate-500 uppercase">Manual Entry Key</p>
                <button
                  onClick={() => setShowSecret(!showSecret)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-white px-3 py-2 rounded-lg text-sm font-mono border border-slate-200 overflow-hidden">
                  {showSecret ? setupData.secret : '••••••••••••••••••••••••'}
                </code>
                <button
                  onClick={copySecret}
                  className="p-2 bg-white rounded-lg border border-slate-200 hover:bg-slate-50"
                >
                  {copied ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-slate-400" />}
                </button>
              </div>
            </div>

            {/* Verify code */}
            <div className="mb-6">
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Enter the 6-digit code from your app
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={e => { setCode(e.target.value.replace(/\D/g, '')); setError(''); }}
                placeholder="000000"
                className="w-full px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] border-2 border-slate-200 
                  rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
              />
            </div>

            <button
              onClick={verifySetup}
              disabled={loading || code.length !== 6}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 
                disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Verify & Enable 2FA
            </button>
          </div>
        </div>
      )}

      {/* Backup Codes */}
      {step === 'backup' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="bg-green-50 border-b border-green-100 p-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <div>
                <h3 className="font-bold text-green-800">2FA Enabled Successfully!</h3>
                <p className="text-green-700 text-sm">Save your backup codes below</p>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
              <p className="text-amber-800 text-sm">
                <strong>Important:</strong> Save these backup codes somewhere safe. If you lose access to your 
                authenticator app, you can use these codes to sign in. Each code can only be used once.
              </p>
            </div>

            {/* Backup codes grid */}
            <div className="grid grid-cols-2 gap-2 mb-6">
              {backupCodes.map((code, i) => (
                <div key={i} className="bg-slate-50 px-4 py-2 rounded-lg font-mono text-sm text-center">
                  {code}
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={downloadBackupCodes}
                className="flex-1 py-3 border border-slate-300 rounded-xl font-semibold text-slate-700 
                  hover:bg-slate-50 flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download Codes
              </button>
              <button
                onClick={() => { setStep('enabled'); fetchStatus(); }}
                className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 
                  flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enabled State */}
      {step === 'enabled' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center">
                <ShieldCheck className="w-8 h-8 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">2FA Enabled</h3>
                <p className="text-slate-500">Your account is protected by two-factor authentication</p>
              </div>
            </div>

            {status && (
              <div className="bg-slate-50 rounded-xl p-4 mb-6 space-y-2 text-sm">
                {status.verifiedAt && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Enabled on</span>
                    <span className="text-slate-900 font-medium">
                      {new Date(status.verifiedAt).toLocaleDateString()}
                    </span>
                  </div>
                )}
                {status.lastUsedAt && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Last used</span>
                    <span className="text-slate-900 font-medium">
                      {new Date(status.lastUsedAt).toLocaleString()}
                    </span>
                  </div>
                )}
                {status.backupCodesUsed > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Backup codes used</span>
                    <span className="text-orange-600 font-medium">{status.backupCodesUsed} / 10</span>
                  </div>
                )}
              </div>
            )}

            {/* Disable 2FA */}
            <div className="border-t border-slate-100 pt-6">
              <h4 className="font-bold text-slate-900 mb-2">Disable 2FA</h4>
              <p className="text-slate-500 text-sm mb-4">
                Enter your current 2FA code to disable two-factor authentication
              </p>
              <div className="flex gap-3">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={e => { setCode(e.target.value.replace(/\D/g, '')); setError(''); }}
                  placeholder="000000"
                  className="flex-1 px-4 py-3 text-center font-mono tracking-wider border border-slate-200 
                    rounded-xl focus:border-red-500 focus:ring-2 focus:ring-red-200 focus:outline-none"
                />
                <button
                  onClick={disable2FA}
                  disabled={loading || code.length !== 6}
                  className="px-6 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 
                    disabled:opacity-50 flex items-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldOff className="w-4 h-4" />}
                  Disable
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
