import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../supabase';
import { Save, User, Building, Lock, CheckCircle } from 'lucide-react';

export default function AffiliateSettings() {
  const { affiliate, refreshAffiliate } = useOutletContext();
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');
  
  const [profileData, setProfileData] = useState({
    name: '',
    phone: ''
  });
  
  const [bankData, setBankData] = useState({
    bank_name: '',
    bank_ifsc: '',
    bank_account_number: '',
    bank_account_name: ''
  });
  
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  useEffect(() => {
    if (affiliate) {
      setProfileData({
        name: affiliate.name || '',
        phone: affiliate.phone || ''
      });
      setBankData({
        bank_name: affiliate.bank_name || '',
        bank_ifsc: affiliate.bank_ifsc || '',
        bank_account_number: affiliate.bank_account_number || '',
        bank_account_name: affiliate.bank_account_name || ''
      });
    }
  }, [affiliate]);

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
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      refreshAffiliate();
    }
    setLoading(false);
  };

  const handleSaveBank = async () => {
    setLoading(true);
    const { error } = await supabase
      .from('affiliates')
      .update({
        bank_name: bankData.bank_name,
        bank_ifsc: bankData.bank_ifsc,
        bank_account_number: bankData.bank_account_number,
        bank_account_name: bankData.bank_account_name
      })
      .eq('id', affiliate.id);

    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      refreshAffiliate();
    }
    setLoading(false);
  };

  const handleChangePassword = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      alert('Passwords do not match');
      return;
    }

    if (passwordData.newPassword.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({
      password: passwordData.newPassword
    });

    if (error) {
      alert('Error: ' + error.message);
    } else {
      setSaved(true);
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setSaved(false), 3000);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600">Manage your profile and bank details</p>
      </div>

      {saved && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
          <CheckCircle size={18} className="text-green-600" />
          <span className="text-green-700">Changes saved successfully!</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-4 border-b">
        <button
          onClick={() => setActiveTab('profile')}
          className={`pb-3 px-1 font-medium flex items-center gap-2 ${
            activeTab === 'profile'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500'
          }`}
        >
          <User size={18} />
          Profile
        </button>
        <button
          onClick={() => setActiveTab('bank')}
          className={`pb-3 px-1 font-medium flex items-center gap-2 ${
            activeTab === 'bank'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500'
          }`}
        >
          <Building size={18} />
          Bank Details
        </button>
        <button
          onClick={() => setActiveTab('password')}
          className={`pb-3 px-1 font-medium flex items-center gap-2 ${
            activeTab === 'password'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500'
          }`}
        >
          <Lock size={18} />
          Password
        </button>
      </div>

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Profile Information</h2>
          
          <div className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={affiliate?.email || ''}
                disabled
                className="w-full border rounded-lg px-3 py-2 bg-gray-50 text-gray-500"
              />
              <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={profileData.name}
                onChange={(e) => setProfileData({...profileData, name: e.target.value})}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="tel"
                value={profileData.phone}
                onChange={(e) => setProfileData({...profileData, phone: e.target.value})}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="+91 9876543210"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Commission Rate</label>
              <input
                type="text"
                value={`${affiliate?.default_commission_rate}%`}
                disabled
                className="w-full border rounded-lg px-3 py-2 bg-gray-50 text-gray-500"
              />
              <p className="text-xs text-gray-500 mt-1">Contact admin to change commission rate</p>
            </div>

            <button
              onClick={handleSaveProfile}
              disabled={loading}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Save size={18} />
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {/* Bank Tab */}
      {activeTab === 'bank' && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Bank Account Details</h2>
          <p className="text-sm text-gray-600 mb-4">
            Your monthly settlements will be transferred to this account.
          </p>
          
          <div className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name</label>
              <input
                type="text"
                value={bankData.bank_name}
                onChange={(e) => setBankData({...bankData, bank_name: e.target.value})}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="HDFC Bank"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">IFSC Code</label>
              <input
                type="text"
                value={bankData.bank_ifsc}
                onChange={(e) => setBankData({...bankData, bank_ifsc: e.target.value.toUpperCase()})}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="HDFC0001234"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Account Number</label>
              <input
                type="text"
                value={bankData.bank_account_number}
                onChange={(e) => setBankData({...bankData, bank_account_number: e.target.value})}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="1234567890"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Account Holder Name</label>
              <input
                type="text"
                value={bankData.bank_account_name}
                onChange={(e) => setBankData({...bankData, bank_account_name: e.target.value})}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="As per bank records"
              />
            </div>

            <button
              onClick={handleSaveBank}
              disabled={loading}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Save size={18} />
              {loading ? 'Saving...' : 'Save Bank Details'}
            </button>
          </div>
        </div>
      )}

      {/* Password Tab */}
      {activeTab === 'password' && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Change Password</h2>
          
          <div className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
              <input
                type="password"
                value={passwordData.newPassword}
                onChange={(e) => setPasswordData({...passwordData, newPassword: e.target.value})}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="Enter new password"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
              <input
                type="password"
                value={passwordData.confirmPassword}
                onChange={(e) => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="Confirm new password"
              />
            </div>

            <button
              onClick={handleChangePassword}
              disabled={loading || !passwordData.newPassword}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Lock size={18} />
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
