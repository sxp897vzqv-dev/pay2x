import React, { useState, useEffect } from 'react';
import { setup2FA, verify2FASetup, disable2FA, get2FAStatus, getRemainingBackupCodes, regenerateBackupCodes } from '../utils/twoFactor';
import { Shield, ShieldCheck, ShieldOff, Key, Copy, RefreshCw, AlertTriangle, CheckCircle, X } from 'lucide-react';

export default function TwoFactorSetup() {
  const [status, setStatus] = useState({ enabled: false, verified: false });
  const [loading, setLoading] = useState(true);
  const [setupData, setSetupData] = useState(null);
  const [step, setStep] = useState('status'); // status | setup | verify | disable
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [backupCodesCount, setBackupCodesCount] = useState(0);
  const [showBackupCodes, setShowBackupCodes] = useState(false);

  useEffect(() => { fetchStatus(); }, []);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const [statusData, codesCount] = await Promise.all([
        get2FAStatus(),
        getRemainingBackupCodes()
      ]);
      setStatus(statusData);
      setBackupCodesCount(codesCount);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleStartSetup = async () => {
    setProcessing(true);
    setError('');
    try {
      const data = await setup2FA();
      setSetupData(data);
      setStep('verify');
    } catch (e) {
      setError(e.message);
    }
    setProcessing(false);
  };

  const handleVerify = async () => {
    if (code.length !== 6) return;
    setProcessing(true);
    setError('');
    try {
      await verify2FASetup(code);
      setStep('status');
      fetchStatus();
      setShowBackupCodes(true);
    } catch (e) {
      setError(e.message);
    }
    setProcessing(false);
  };

  const handleDisable = async () => {
    if (code.length !== 6) return;
    setProcessing(true);
    setError('');
    try {
      await disable2FA(code);
      setStep('status');
      setCode('');
      fetchStatus();
    } catch (e) {
      setError(e.message);
    }
    setProcessing(false);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  if (loading) {
    return (
      <div className="bg-[#1a1a2e] rounded-xl border border-white/5 p-6">
        <div className="animate-pulse flex items-center gap-3">
          <div className="w-10 h-10 bg-white/10 rounded-lg"></div>
          <div className="flex-1">
            <div className="h-4 bg-white/10 rounded w-1/3 mb-2"></div>
            <div className="h-3 bg-white/10 rounded w-1/2"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#1a1a2e] rounded-xl border border-white/5 p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {status.enabled ? (
            <div className="p-2 bg-green-500/20 rounded-lg">
              <ShieldCheck className="w-6 h-6 text-green-400" />
            </div>
          ) : (
            <div className="p-2 bg-yellow-500/20 rounded-lg">
              <Shield className="w-6 h-6 text-yellow-400" />
            </div>
          )}
          <div>
            <h3 className="text-white font-medium">Two-Factor Authentication</h3>
            <p className="text-gray-400 text-sm">
              {status.enabled ? 'Your account is protected with 2FA' : 'Add an extra layer of security'}
            </p>
          </div>
        </div>
        <span className={`px-2 py-1 text-xs rounded ${status.enabled ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
          {status.enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {step === 'status' && (
        <div className="space-y-4">
          {status.enabled ? (
            <>
              <div className="flex items-center justify-between p-3 bg-black/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-300 text-sm">Backup codes remaining</span>
                </div>
                <span className={`font-mono ${backupCodesCount <= 2 ? 'text-red-400' : 'text-white'}`}>
                  {backupCodesCount}/10
                </span>
              </div>
              
              {backupCodesCount <= 2 && (
                <div className="p-3 bg-yellow-500/20 border border-yellow-500/30 rounded-lg text-yellow-400 text-sm">
                  <AlertTriangle className="w-4 h-4 inline mr-2" />
                  You're running low on backup codes. Consider regenerating them.
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setStep('disable')}
                  className="flex-1 py-2 border border-red-500/50 text-red-400 rounded-lg hover:bg-red-500/10 text-sm"
                >
                  Disable 2FA
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-gray-400 text-sm">
                Two-factor authentication adds an extra layer of security to your account by requiring a code from your authenticator app in addition to your password.
              </p>
              <button
                onClick={handleStartSetup}
                disabled={processing}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
              >
                {processing ? 'Setting up...' : 'Enable 2FA'}
              </button>
            </>
          )}
        </div>
      )}

      {step === 'verify' && setupData && (
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-gray-400 text-sm mb-4">
              Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
            </p>
            <div className="bg-white p-4 rounded-lg inline-block mb-4">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(setupData.otpAuthUrl)}`}
                alt="2FA QR Code"
                className="w-48 h-48"
              />
            </div>
            <div className="text-sm text-gray-500 mb-4">
              Or enter this code manually:
              <div className="flex items-center justify-center gap-2 mt-1">
                <code className="bg-black/30 px-3 py-1 rounded text-white font-mono text-sm">{setupData.secret}</code>
                <button onClick={() => copyToClipboard(setupData.secret)} className="p-1 hover:bg-white/10 rounded">
                  <Copy className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Enter verification code</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white text-center text-2xl font-mono tracking-widest"
              autoFocus
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => { setStep('status'); setSetupData(null); setCode(''); setError(''); }}
              className="flex-1 py-2 border border-white/10 text-white rounded-lg hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              onClick={handleVerify}
              disabled={code.length !== 6 || processing}
              className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50"
            >
              {processing ? 'Verifying...' : 'Verify & Enable'}
            </button>
          </div>
        </div>
      )}

      {step === 'disable' && (
        <div className="space-y-4">
          <div className="p-4 bg-red-500/20 border border-red-500/30 rounded-lg">
            <h4 className="text-red-400 font-medium mb-2">Disable Two-Factor Authentication?</h4>
            <p className="text-gray-400 text-sm">
              This will remove the extra layer of security from your account. Enter your current 2FA code to confirm.
            </p>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Enter current 2FA code</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white text-center text-2xl font-mono tracking-widest"
              autoFocus
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => { setStep('status'); setCode(''); setError(''); }}
              className="flex-1 py-2 border border-white/10 text-white rounded-lg hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              onClick={handleDisable}
              disabled={code.length !== 6 || processing}
              className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50"
            >
              {processing ? 'Disabling...' : 'Disable 2FA'}
            </button>
          </div>
        </div>
      )}

      {/* Backup Codes Modal */}
      {showBackupCodes && setupData?.backupCodes && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1a2e] rounded-xl w-full max-w-md border border-white/10 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Key className="w-5 h-5 text-yellow-400" />
                Backup Codes
              </h3>
              <button onClick={() => setShowBackupCodes(false)} className="p-1 hover:bg-white/10 rounded">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-lg p-3 mb-4">
              <p className="text-yellow-400 text-sm">
                <AlertTriangle className="w-4 h-4 inline mr-1" />
                Save these codes in a safe place. Each code can only be used once.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
              {setupData.backupCodes.map((code, i) => (
                <code key={i} className="bg-black/30 px-3 py-2 rounded text-white font-mono text-sm text-center">
                  {code}
                </code>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => copyToClipboard(setupData.backupCodes.join('\n'))}
                className="flex-1 py-2 border border-white/10 text-white rounded-lg hover:bg-white/5 flex items-center justify-center gap-2"
              >
                <Copy className="w-4 h-4" />
                Copy All
              </button>
              <button
                onClick={() => setShowBackupCodes(false)}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                I've Saved Them
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
