import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, query, where, getDocs, updateDoc, doc, addDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth, updatePassword } from 'firebase/auth';
import {
  User, Building, Shield, Bell, Users, CreditCard, Key, Save,
  CheckCircle, AlertCircle, Mail, Phone, Globe, FileText, Plus,
  Trash2, Edit, RefreshCw, X,
} from 'lucide-react';
import Toast from '../../components/admin/Toast';
import BankAccountCard from './components/BankAccountCard';
import TeamMemberCard from './components/TeamMemberCard';

export default function MerchantSettings() {
  const [activeTab, setActiveTab] = useState('profile');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  
  // Profile
  const [profile, setProfile] = useState({
    businessName: '',
    website: '',
    supportEmail: '',
    supportPhone: '',
    gst: '',
  });

  // Bank accounts
  const [bankAccounts, setBankAccounts] = useState([]);
  const [primaryAccountId, setPrimaryAccountId] = useState('');

  // Team
  const [teamMembers, setTeamMembers] = useState([]);

  // Notifications
  const [notifications, setNotifications] = useState({
    emailTransactions: true,
    emailBalance: true,
    smsAlerts: false,
    webhookEvents: true,
  });

  // Security
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [password, setPassword] = useState({ current: '', new: '', confirm: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const user = getAuth().currentUser;
    if (!user) return;

    try {
      // Fetch merchant profile
      const merchantSnap = await getDocs(query(collection(db, 'merchant'), where('uid', '==', user.uid)));
      if (!merchantSnap.empty) {
        const data = merchantSnap.docs[0].data();
        setProfile({
          businessName: data.businessName || '',
          website: data.website || '',
          supportEmail: data.supportEmail || '',
          supportPhone: data.supportPhone || '',
          gst: data.gst || '',
        });
        setNotifications(data.notifications || notifications);
        setTwoFactorEnabled(data.twoFactorEnabled || false);
      }

      // Fetch bank accounts
      const banksSnap = await getDocs(query(collection(db, 'merchantBankAccounts'), where('merchantId', '==', user.uid)));
      const banks = [];
      banksSnap.forEach(d => {
        const acc = { id: d.id, ...d.data() };
        banks.push(acc);
        if (acc.isPrimary) setPrimaryAccountId(d.id);
      });
      setBankAccounts(banks);

      // Fetch team members
      const teamSnap = await getDocs(query(collection(db, 'merchantTeam'), where('merchantId', '==', user.uid)));
      const team = [];
      teamSnap.forEach(d => team.push({ id: d.id, ...d.data() }));
      setTeamMembers(team);

    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleSaveProfile = async () => {
    const user = getAuth().currentUser;
    if (!user) return;

    try {
      const merchantSnap = await getDocs(query(collection(db, 'merchant'), where('uid', '==', user.uid)));
      if (!merchantSnap.empty) {
        await updateDoc(doc(db, 'merchant', merchantSnap.docs[0].id), {
          ...profile,
          updatedAt: serverTimestamp(),
        });
        setToast({ msg: '✅ Profile updated!', success: true });
      }
    } catch (e) {
      setToast({ msg: 'Error: ' + e.message, success: false });
    }
  };

  const handleSaveNotifications = async () => {
    const user = getAuth().currentUser;
    if (!user) return;

    try {
      const merchantSnap = await getDocs(query(collection(db, 'merchant'), where('uid', '==', user.uid)));
      if (!merchantSnap.empty) {
        await updateDoc(doc(db, 'merchant', merchantSnap.docs[0].id), {
          notifications,
          updatedAt: serverTimestamp(),
        });
        setToast({ msg: '✅ Notifications updated!', success: true });
      }
    } catch (e) {
      setToast({ msg: 'Error: ' + e.message, success: false });
    }
  };

  const handleToggle2FA = async () => {
    const user = getAuth().currentUser;
    if (!user) return;

    try {
      const merchantSnap = await getDocs(query(collection(db, 'merchant'), where('uid', '==', user.uid)));
      if (!merchantSnap.empty) {
        const newValue = !twoFactorEnabled;
        await updateDoc(doc(db, 'merchant', merchantSnap.docs[0].id), {
          twoFactorEnabled: newValue,
          updatedAt: serverTimestamp(),
        });
        setTwoFactorEnabled(newValue);
        setToast({ msg: `✅ 2FA ${newValue ? 'enabled' : 'disabled'}!`, success: true });
      }
    } catch (e) {
      setToast({ msg: 'Error: ' + e.message, success: false });
    }
  };

  const handleChangePassword = async () => {
    if (!password.current || !password.new || !password.confirm) {
      setToast({ msg: 'Fill all password fields', success: false });
      return;
    }
    if (password.new.length < 6) {
      setToast({ msg: 'New password must be at least 6 characters', success: false });
      return;
    }
    if (password.new !== password.confirm) {
      setToast({ msg: 'New passwords do not match', success: false });
      return;
    }

    try {
      const user = getAuth().currentUser;
      await updatePassword(user, password.new);
      setPassword({ current: '', new: '', confirm: '' });
      setToast({ msg: '✅ Password updated successfully!', success: true });
    } catch (e) {
      if (e.code === 'auth/requires-recent-login') {
        setToast({ msg: 'Please log out and log in again to change password', success: false });
      } else {
        setToast({ msg: 'Error: ' + e.message, success: false });
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <RefreshCw className="w-10 h-10 text-purple-500 animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm font-medium">Loading settings…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* Desktop header */}
      <div className="hidden sm:block">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <div className="p-2 bg-gradient-to-br from-slate-500 to-slate-600 rounded-xl shadow-sm">
            <User className="w-5 h-5 text-white" />
          </div>
          Settings
        </h1>
        <p className="text-slate-500 text-sm mt-0.5 ml-11">Manage your account</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {[
          { key: 'profile', label: 'Profile', icon: User },
          { key: 'team', label: 'Team', icon: Users },
          { key: 'notifications', label: 'Alerts', icon: Bell },
          { key: 'security', label: 'Security', icon: Shield },
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex-shrink-0 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                activeTab === tab.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Building className="w-4 h-4 text-purple-600" />
            Business Information
          </h3>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Business Name *</label>
            <input
              type="text"
              value={profile.businessName}
              onChange={e => setProfile({ ...profile, businessName: e.target.value })}
              className="w-full px-3 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide flex items-center gap-1">
                <Globe className="w-3 h-3" /> Website
              </label>
              <input
                type="url"
                value={profile.website}
                onChange={e => setProfile({ ...profile, website: e.target.value })}
                placeholder="https://yourbusiness.com"
                className="w-full px-3 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide flex items-center gap-1">
                <FileText className="w-3 h-3" /> GST Number (Optional)
              </label>
              <input
                type="text"
                value={profile.gst}
                onChange={e => setProfile({ ...profile, gst: e.target.value.toUpperCase() })}
                placeholder="Enter GST number if applicable"
                className="w-full px-3 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 font-mono"
                style={{ fontFamily: 'var(--font-mono)' }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide flex items-center gap-1">
                <Mail className="w-3 h-3" /> Support Email
              </label>
              <input
                type="email"
                value={profile.supportEmail}
                onChange={e => setProfile({ ...profile, supportEmail: e.target.value })}
                placeholder="support@yourbusiness.com"
                className="w-full px-3 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide flex items-center gap-1">
                <Phone className="w-3 h-3" /> Support Phone
              </label>
              <input
                type="tel"
                value={profile.supportPhone}
                onChange={e => setProfile({ ...profile, supportPhone: e.target.value })}
                placeholder="+91 1234567890"
                className="w-full px-3 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
            </div>
          </div>

          <button onClick={handleSaveProfile}
            className="w-full py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 font-semibold text-sm flex items-center justify-center gap-2">
            <Save className="w-4 h-4" /> Save Changes
          </button>
        </div>
      )}

      {/* Team Tab */}
      {activeTab === 'team' && (
        <div className="space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
            <Users className="w-10 h-10 text-yellow-400 mx-auto mb-2" />
            <p className="text-sm font-bold text-yellow-900">Team Management</p>
            <p className="text-xs text-yellow-700 mt-1">Coming Soon! Invite team members to manage your account.</p>
          </div>
        </div>
      )}

      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
          <h3 className="text-sm font-bold text-slate-900">Notification Preferences</h3>

          {[
            { key: 'emailTransactions', label: 'Email for Transactions', desc: 'Receive emails for every transaction' },
            { key: 'emailBalance', label: 'Email for Balance Alerts', desc: 'Get notified when balance is low' },
            { key: 'smsAlerts', label: 'SMS Alerts', desc: 'Critical alerts via SMS' },
            { key: 'webhookEvents', label: 'Webhook Events', desc: 'Send webhook for all events' },
          ].map(item => (
            <label key={item.key} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 cursor-pointer">
              <div>
                <p className="font-semibold text-slate-900 text-sm">{item.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
              </div>
              <input
                type="checkbox"
                checked={notifications[item.key]}
                onChange={e => setNotifications({ ...notifications, [item.key]: e.target.checked })}
                className="w-5 h-5 text-purple-600 rounded"
              />
            </label>
          ))}

          <button onClick={handleSaveNotifications}
            className="w-full py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 font-semibold text-sm flex items-center justify-center gap-2">
            <Save className="w-4 h-4" /> Save Preferences
          </button>
        </div>
      )}

      {/* Security Tab */}
      {activeTab === 'security' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Two-Factor Authentication</h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-700 font-semibold">2FA Status</p>
                <p className="text-xs text-slate-500 mt-0.5">Add extra layer of security</p>
              </div>
              <button
                onClick={handleToggle2FA}
                className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                  twoFactorEnabled ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {twoFactorEnabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Change Password</h3>
            <div className="space-y-3">
              <input 
                type="password" 
                placeholder="Current Password" 
                value={password.current}
                onChange={e => setPassword({ ...password, current: e.target.value })}
                className="w-full px-3 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" 
              />
              <input 
                type="password" 
                placeholder="New Password" 
                value={password.new}
                onChange={e => setPassword({ ...password, new: e.target.value })}
                className="w-full px-3 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" 
              />
              <input 
                type="password" 
                placeholder="Confirm New Password" 
                value={password.confirm}
                onChange={e => setPassword({ ...password, confirm: e.target.value })}
                className="w-full px-3 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" 
              />
              <button 
                onClick={handleChangePassword}
                className="w-full py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 font-semibold text-sm flex items-center justify-center gap-2">
                <Key className="w-4 h-4" /> Update Password
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}