import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../supabase';
import { 
  Save, User, Wallet, Lock, CheckCircle, 
  AlertCircle, Copy, Shield
} from 'lucide-react';

export default function AffiliateSettings() {
  const { affiliate, refreshAffiliate } = useOutletContext();
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');
  const [copied, setCopied] = useState(false);
  
  const [profileData, setProfileData] = useState({
    name: '',
    phone: ''
  });
  
  const [walletData, setWalletData] = useState({
    usdt_wallet_address: ''
  });
  
  const [passwordData, setPasswordData] = useState({
    newPassword: '',
    confirmPassword: ''
  });

  useEffect(() => {
    if (affiliate) {
      setProfileData({
        name: affiliate.name || '',
        phone: affiliate.phone || ''
      });
      setWalletData({
        usdt_wallet_address: affiliate.usdt_wallet_address || ''
      });
    }
  }, [affiliate]);

  const showSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleSaveProfile = async () => {
    setLoading(true);
    const { error } = await supabase
      .from('affiliates')
      .update({
        name: profileData.name,
        phone: profileData.phone
      })
      .eq('id', affiliate.id);

    if (!error) {
      showSaved();
      refreshAffiliate();
    } else {
      alert('Error: ' + error.message);
    }
    setLoading(false);
  };

  const handleSaveWallet = async () => {
    // Basic TRC20 address validation
    const address = walletData.usdt_wallet_address.trim();
    if (address && !address.startsWith('T')) {
      alert('Invalid TRC20 address. It should start with "T"');
      return;
    }
    if (address && address.length !== 34) {
      alert('Invalid TRC20 address. It should be 34 characters');
      return;
    }

    setLoading(true);
    const { error } = await supabase
      .from('affiliates')
      .update({
        usdt_wallet_address: address
      })
      .eq('id', affiliate.id);

    if (!error) {
      showSaved();
      refreshAffiliate();
    } else {
      alert('Error: ' + error.message);
    }
    setLoading(false);
  };

  const handleChangePassword = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      alert('Passwords do not match');
      return;
    }

    if (passwordData.newPassword.length < 8) {
      alert('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({
      password: passwordData.newPassword
    });

    if (error) {
      alert('Error: ' + error.message);
    } else {
      showSaved();
      setPasswordData({ newPassword: '', confirmPassword: '' });
    }
    setLoading(false);
  };

  const copyAddress = () => {
    navigator.clipboard.writeText(walletData.usdt_wallet_address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'wallet', label: 'USDT Wallet', icon: Wallet },
    { id: 'password', label: 'Security', icon: Shield },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-600 text-sm md:text-base">Manage your profile and settlement wallet</p>
      </div>

      {/* Success Toast */}
      {saved && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <span className="text-green-700 font-medium">Changes saved successfully!</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg font-medium text-sm transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-purple-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-5 md:p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Profile Information</h2>
          
          <div className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <input
                type="email"
                value={affiliate?.email || ''}
                disabled
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 bg-slate-50 text-slate-500"
              />
              <p className="text-xs text-slate-500 mt-1">Email cannot be changed</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Name</label>
              <input
                type="text"
                value={profileData.name}
                onChange={(e) => setProfileData({...profileData, name: e.target.value})}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone</label>
              <input
                type="tel"
                value={profileData.phone}
                onChange={(e) => setProfileData({...profileData, phone: e.target.value})}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                placeholder="+91 9876543210"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Commission Rate</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={`${affiliate?.default_commission_rate}%`}
                  disabled
                  className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 bg-slate-50 text-slate-500"
                />
                <div className="px-3 py-2.5 bg-purple-100 text-purple-700 rounded-xl text-sm font-medium">
                  Fixed
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-1">Contact admin to change commission rate</p>
            </div>

            <button
              onClick={handleSaveProfile}
              disabled={loading}
              className="flex items-center gap-2 bg-purple-600 text-white px-5 py-2.5 rounded-xl hover:bg-purple-700 disabled:opacity-50 font-medium transition-colors"
            >
              <Save className="w-4 h-4" />
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {/* Wallet Tab */}
      {activeTab === 'wallet' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-5 md:p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">USDT Settlement Wallet</h2>
            <p className="text-sm text-slate-600 mb-4">
              Your monthly commission will be converted to USDT and sent to this wallet address.
            </p>
            
            <div className="space-y-4 max-w-lg">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  TRC20 Wallet Address
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={walletData.usdt_wallet_address}
                    onChange={(e) => setWalletData({...walletData, usdt_wallet_address: e.target.value})}
                    className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 font-mono text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                    placeholder="T..."
                  />
                  {walletData.usdt_wallet_address && (
                    <button
                      onClick={copyAddress}
                      className="px-3 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                    >
                      <Copy className="w-4 h-4 text-slate-500" />
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1.5">
                  Enter your TRON (TRC20) wallet address starting with "T"
                </p>
              </div>

              <button
                onClick={handleSaveWallet}
                disabled={loading}
                className="flex items-center gap-2 bg-purple-600 text-white px-5 py-2.5 rounded-xl hover:bg-purple-700 disabled:opacity-50 font-medium transition-colors"
              >
                <Save className="w-4 h-4" />
                {loading ? 'Saving...' : 'Save Wallet'}
              </button>
            </div>
          </div>

          {/* USDT Info */}
          <div className="bg-gradient-to-r from-purple-50 to-violet-50 border border-purple-100 rounded-2xl p-4 md:p-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-purple-900">Important</h3>
                <ul className="text-sm text-purple-700 mt-2 space-y-1">
                  <li>• Only TRC20 (TRON network) addresses are supported</li>
                  <li>• Double-check your address - transactions cannot be reversed</li>
                  <li>• Settlements are processed on the 2nd of every month</li>
                  <li>• INR to USDT conversion at current market rate</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Security Tab */}
      {activeTab === 'password' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-5 md:p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Change Password</h2>
          
          <div className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">New Password</label>
              <input
                type="password"
                value={passwordData.newPassword}
                onChange={(e) => setPasswordData({...passwordData, newPassword: e.target.value})}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                placeholder="Enter new password"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirm Password</label>
              <input
                type="password"
                value={passwordData.confirmPassword}
                onChange={(e) => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                placeholder="Confirm new password"
              />
            </div>

            <div className="text-xs text-slate-500 space-y-1">
              <p>Password requirements:</p>
              <ul className="list-disc list-inside">
                <li>At least 8 characters</li>
                <li>Include numbers and letters</li>
              </ul>
            </div>

            <button
              onClick={handleChangePassword}
              disabled={loading || !passwordData.newPassword}
              className="flex items-center gap-2 bg-purple-600 text-white px-5 py-2.5 rounded-xl hover:bg-purple-700 disabled:opacity-50 font-medium transition-colors"
            >
              <Lock className="w-4 h-4" />
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </div>
      )}

      {/* Copy Toast */}
      {copied && (
        <div className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg z-50">
          Copied to clipboard!
        </div>
      )}
    </div>
  );
}
