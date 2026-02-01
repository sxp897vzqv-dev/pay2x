import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../../firebase';
import {
  Key,
  Wallet,
  Eye,
  EyeOff,
  Copy,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Shield,
  Download,
  Lock,
} from 'lucide-react';

const AdminSettings = () => {
  const [masterWallet, setMasterWallet] = useState(null);
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [showXPUB, setShowXPUB] = useState(false);
  const [copied, setCopied] = useState('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [tatumApiKey, setTatumApiKey] = useState('');
  const [adminWallet, setAdminWallet] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const settingsDoc = await getDoc(doc(db, 'system', 'tatumConfig'));
      if (settingsDoc.exists()) {
        const data = settingsDoc.data();
        setMasterWallet(data.masterWallet || null);
        setTatumApiKey(data.tatumApiKey || '');
        setAdminWallet(data.adminWallet || '');
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
    setLoading(false);
  };

  const generateMasterWallet = async () => {
    if (!tatumApiKey) {
      alert('Please enter Tatum API Key first');
      return;
    }

    if (masterWallet && !window.confirm('Master wallet already exists! Generate a new one? This will replace the old wallet.')) {
      return;
    }

    setGenerating(true);
    try {
      // Step 1: Call Tatum API to generate Tron wallet
      console.log('Calling Tatum API to generate wallet...');
      const response = await fetch('https://api.tatum.io/v3/tron/wallet', {
        method: 'GET',
        headers: {
          'x-api-key': tatumApiKey,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `Failed to generate wallet: ${response.status}`);
      }

      const walletData = await response.json();
      console.log('✅ Wallet data received from Tatum:', walletData);

      // Validate required fields
      if (!walletData.mnemonic || !walletData.xpub) {
        throw new Error('Invalid wallet data: missing mnemonic or xpub');
      }

      // Step 2: Derive address from XPUB at index 0
      console.log('Deriving address from XPUB...');
      const addressResponse = await fetch(`https://api.tatum.io/v3/tron/address/${walletData.xpub}/0`, {
        method: 'GET',
        headers: {
          'x-api-key': tatumApiKey,
        },
      });

      if (!addressResponse.ok) {
        throw new Error('Failed to derive address from XPUB');
      }

      const addressData = await addressResponse.json();
      console.log('✅ Address derived:', addressData);

      const newMasterWallet = {
        mnemonic: walletData.mnemonic,
        xpub: walletData.xpub,
        address: addressData.address,
        generatedAt: new Date().toISOString(),
      };

      // Step 3: Save to Firestore
      console.log('Saving to Firestore...');
      await setDoc(
        doc(db, 'system', 'tatumConfig'),
        {
          masterWallet: newMasterWallet,
          tatumApiKey: tatumApiKey,
          adminWallet: adminWallet,
          lastUpdated: serverTimestamp(),
        },
        { merge: true }
      );

      setMasterWallet(newMasterWallet);
      console.log('✅ Master wallet saved successfully!');
      
      alert('✅ Master wallet generated successfully!\n\n⚠️ CRITICAL: Click "Download Backup" NOW and store it securely!\n\nMnemonic: ' + walletData.mnemonic.split(' ').slice(0, 3).join(' ') + '...');
    } catch (error) {
      console.error('❌ Error generating wallet:', error);
      alert('Error generating wallet: ' + error.message + '\n\nPlease check:\n1. Tatum API key is valid\n2. You have API credits\n3. Network connection is stable\n\nCheck browser console for details.');
    }
    setGenerating(false);
  };

  const saveSettings = async () => {
    if (!adminWallet) {
      alert('Please enter Admin Wallet address');
      return;
    }

    try {
      await setDoc(
        doc(db, 'system', 'tatumConfig'),
        {
          tatumApiKey: tatumApiKey,
          adminWallet: adminWallet,
          lastUpdated: serverTimestamp(),
        },
        { merge: true }
      );
      alert('✅ Settings saved successfully!');
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Error: ' + error.message);
    }
  };

  const copyToClipboard = (text, type) => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(''), 2000);
  };

  const downloadBackup = () => {
    if (!masterWallet) return;

    const backup = {
      version: '1.0',
      system: 'Pay2X USDT Auto-Verification',
      mnemonic: masterWallet.mnemonic,
      xpub: masterWallet.xpub,
      address: masterWallet.address,
      generatedAt: masterWallet.generatedAt,
      tatumApiKey: tatumApiKey,
      adminWallet: adminWallet,
      backupDate: new Date().toISOString(),
      warning: '⚠️ KEEP THIS FILE SECURE! Anyone with the mnemonic can access all derived wallets and funds.',
      instructions: [
        '1. Store this file in a secure, encrypted location',
        '2. Keep an offline backup (USB drive in safe)',
        '3. Never share mnemonic with anyone',
        '4. Never upload to cloud services',
        '5. Write mnemonic on paper as additional backup',
        '6. Test recovery process in safe environment'
      ]
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pay2x-master-wallet-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    alert('✅ Backup downloaded!\n\nNext steps:\n1. Store in secure location\n2. Create offline backup (USB)\n3. Write mnemonic on paper\n4. Verify backup is readable');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-4">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Tatum Configuration</h1>
        <p className="text-slate-600 mt-1">Manage master wallet and Tatum integration</p>
      </div>

      {/* Security Warning */}
      <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-red-900 mb-1">🔒 Security Warning</h3>
            <p className="text-sm text-red-800">
              Never share your mnemonic or private keys with anyone. Store backup securely offline. 
              Loss of mnemonic means loss of all funds. This page should only be accessible to authorized admins.
            </p>
          </div>
        </div>
      </div>

      {/* Tatum API Key */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Key className="w-5 h-5 text-purple-600" />
          <h2 className="text-xl font-bold text-slate-900">Tatum API Configuration</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Tatum API Key * <span className="text-xs text-slate-500">(Required)</span>
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={tatumApiKey}
                onChange={(e) => setTatumApiKey(e.target.value)}
                className="w-full px-4 py-3 pr-12 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm"
                placeholder="t-66a730ccccfd17001c479705-2f597d14ad7543f289a03418"
              />
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showApiKey ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            <div className="mt-2 text-xs space-y-1">
              <p className="text-slate-500">
                Get your API key: <a href="https://dashboard.tatum.io" target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline font-medium">https://dashboard.tatum.io</a>
              </p>
              <p className="text-slate-500">
                • Free tier: 5000 requests/month (sufficient for small operations)
              </p>
              <p className="text-slate-500">
                • Paid tier: 100k requests/month starting at $79/month
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Admin USDT Wallet (TRC20) * <span className="text-xs text-slate-500">(Required)</span>
            </label>
            <input
              type="text"
              value={adminWallet}
              onChange={(e) => setAdminWallet(e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm"
              placeholder="TYourAdminWalletAddress..."
            />
            <p className="text-xs text-slate-500 mt-1">
              Final destination where all trader deposits will be automatically swept
            </p>
          </div>

          <button
            onClick={saveSettings}
            disabled={!tatumApiKey || !adminWallet}
            className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save Configuration
          </button>
        </div>
      </div>

      {/* Master Wallet */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-purple-600" />
            <h2 className="text-xl font-bold text-slate-900">Master Wallet (HD Wallet)</h2>
          </div>
          {masterWallet && (
            <div className="flex gap-2">
              <button
                onClick={downloadBackup}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                <Download size={16} />
                Download Backup
              </button>
              <button
                onClick={generateMasterWallet}
                disabled={generating}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm disabled:opacity-50"
              >
                <RefreshCw size={16} className={generating ? 'animate-spin' : ''} />
                Regenerate
              </button>
            </div>
          )}
        </div>

        {masterWallet ? (
          <div className="space-y-4">
            {/* Master Address */}
            <div className="p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg">
              <p className="text-xs font-semibold text-slate-700 mb-2">Master Address (Index 0)</p>
              <div className="flex items-center gap-2">
                <p className="flex-1 font-mono text-sm text-slate-900 break-all">
                  {masterWallet.address}
                </p>
                <button
                  onClick={() => copyToClipboard(masterWallet.address, 'address')}
                  className="p-2 hover:bg-white rounded-lg transition-colors flex-shrink-0"
                >
                  {copied === 'address' ? (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4 text-slate-600" />
                  )}
                </button>
              </div>
            </div>

            {/* XPUB */}
            <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <Key className="w-3 h-3" />
                  Extended Public Key (XPUB)
                </p>
                <button
                  onClick={() => setShowXPUB(!showXPUB)}
                  className="text-xs px-2 py-1 bg-white rounded hover:bg-slate-50 flex items-center gap-1"
                >
                  {showXPUB ? <EyeOff size={14} /> : <Eye size={14} />}
                  {showXPUB ? 'Hide' : 'Show'}
                </button>
              </div>
              {showXPUB && (
                <div className="flex items-center gap-2">
                  <p className="flex-1 font-mono text-xs text-slate-900 break-all">
                    {masterWallet.xpub}
                  </p>
                  <button
                    onClick={() => copyToClipboard(masterWallet.xpub, 'xpub')}
                    className="p-2 hover:bg-white rounded-lg transition-colors flex-shrink-0"
                  >
                    {copied === 'xpub' ? (
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    ) : (
                      <Copy className="w-4 h-4 text-slate-600" />
                    )}
                  </button>
                </div>
              )}
              <p className="text-xs text-yellow-700 mt-2">
                Used to derive infinite unique addresses for traders (index 1, 2, 3...)
              </p>
            </div>

            {/* Mnemonic */}
            <div className="p-4 bg-red-50 rounded-lg border-2 border-red-200">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-red-900 flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  Recovery Phrase (Mnemonic) - CRITICAL
                </p>
                <button
                  onClick={() => setShowMnemonic(!showMnemonic)}
                  className="text-xs px-2 py-1 bg-white rounded hover:bg-red-50 flex items-center gap-1"
                >
                  {showMnemonic ? <EyeOff size={14} /> : <Eye size={14} />}
                  {showMnemonic ? 'Hide' : 'Show'}
                </button>
              </div>
              {showMnemonic && (
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <p className="flex-1 font-mono text-sm text-red-900 break-all bg-white p-3 rounded border border-red-200">
                      {masterWallet.mnemonic}
                    </p>
                    <button
                      onClick={() => copyToClipboard(masterWallet.mnemonic, 'mnemonic')}
                      className="p-2 hover:bg-white rounded-lg transition-colors flex-shrink-0"
                    >
                      {copied === 'mnemonic' ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4 text-red-600" />
                      )}
                    </button>
                  </div>
                  <div className="bg-red-100 p-3 rounded">
                    <p className="text-xs text-red-900 font-semibold">⚠️ NEVER share this phrase!</p>
                    <p className="text-xs text-red-800 mt-1">
                      Anyone with this phrase has full control over all derived wallets. Store securely offline.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Metadata */}
            <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t">
              <span>Generated: {new Date(masterWallet.generatedAt).toLocaleString()}</span>
              <span className="flex items-center gap-1">
                <Shield className="w-3 h-3 text-green-600" />
                Secured in Firestore
              </span>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <Wallet className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600 mb-4">No master wallet configured</p>
            <p className="text-sm text-slate-500 mb-6">
              Generate a master wallet to enable unique USDT addresses for each trader
            </p>
            <button
              onClick={generateMasterWallet}
              disabled={generating || !tatumApiKey}
              className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 mx-auto"
            >
              {generating ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Generating wallet...
                </>
              ) : (
                <>
                  <Wallet className="w-5 h-5" />
                  Generate Master Wallet
                </>
              )}
            </button>
            {!tatumApiKey && (
              <p className="text-xs text-red-600 mt-2">
                ⚠️ Please enter Tatum API Key first
              </p>
            )}
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <h3 className="font-bold text-blue-900 mb-3 flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Setup Instructions
        </h3>
        <ol className="space-y-2 text-sm text-blue-900 list-decimal list-inside">
          <li>Sign up at <a href="https://dashboard.tatum.io" target="_blank" rel="noopener noreferrer" className="underline font-medium">dashboard.tatum.io</a> and get your API key</li>
          <li>Enter your Tatum API key above</li>
          <li>Enter your admin wallet address (where USDT will be swept)</li>
          <li>Click "Save Configuration"</li>
          <li>Click "Generate Master Wallet"</li>
          <li>⚠️ <strong className="text-red-600">IMMEDIATELY</strong> click "Download Backup" and store securely</li>
          <li>Write down mnemonic phrase on paper and store in safe place</li>
          <li>Deploy Firebase Functions (see documentation)</li>
          <li>Setup Tatum webhook (see documentation)</li>
          <li>Done! You can now create traders with unique USDT addresses</li>
        </ol>
      </div>
    </div>
  );
};

export default AdminSettings;