import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabase';
import {
  User, Building, Shield, Bell, Key, Save, Clock,
  CheckCircle, Mail, Phone, Globe, AlertCircle,
  RefreshCw, ShieldCheck, ArrowUpRight, ArrowDownLeft,
  FileText, Settings, Wallet, Calendar, X,
} from 'lucide-react';
import { Toast } from '../../../components/admin';
import TwoFactorSetup from '../../../components/TwoFactorSetup';
import { logMerchantActivity, MERCHANT_ACTIONS } from '../../../utils/merchantActivityLogger';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';

export default function MerchantSettings() {
  const [activeTab, setActiveTab] = useState('profile');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [user, setUser] = useState(null);
  const [merchant, setMerchant] = useState(null);
  const [twoFaStatus, setTwoFaStatus] = useState(null);
  const [activityLog, setActivityLog] = useState([]);
  
  // Activity log date filters
  const [activityDateFrom, setActivityDateFrom] = useState('');
  const [activityDateTo, setActivityDateTo] = useState('');
  
  // Profile
  const [profile, setProfile] = useState({
    businessName: '',
    website: '',
    supportEmail: '',
    supportPhone: '',
  });

  // Notifications
  const [notifications, setNotifications] = useState({
    emailTransactions: true,
    emailBalance: true,
    smsAlerts: false,
    webhookEvents: true,
  });

  // Password
  const [password, setPassword] = useState({ current: '', new: '', confirm: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;
      setUser(authUser);

      // Get merchant data
      const { data } = await supabase
        .from('merchants')
        .select('*')
        .eq('profile_id', authUser.id)
        .single();
      
      if (data) {
        setMerchant(data);
        setProfile({
          businessName: data.business_name || data.name || '',
          website: data.website || '',
          supportEmail: data.support_email || '',
          supportPhone: data.support_phone || '',
        });
        setNotifications(data.notifications || notifications);

        // Get activity log
        const { data: logData } = await supabase
          .from('merchant_activity_log')
          .select('*')
          .eq('merchant_id', data.id)
          .order('created_at', { ascending: false })
          .limit(50);
        setActivityLog(logData || []);
      }

      // Get 2FA status
      const { data: twoFa } = await supabase
        .from('user_2fa')
        .select('*')
        .eq('user_id', authUser.id)
        .single();
      setTwoFaStatus(twoFa);

    } catch (e) { 
      console.error(e); 
    }
    setLoading(false);
  };

  const handleSaveProfile = async () => {
    if (!merchant) return;
    try {
      const changes = {
        business_name: profile.businessName,
        website: profile.website,
        support_email: profile.supportEmail,
        support_phone: profile.supportPhone,
      };
      await supabase.from('merchants').update(changes).eq('id', merchant.id);
      
      await logMerchantActivity(MERCHANT_ACTIONS.PROFILE_UPDATED, {
        details: { updated_fields: Object.keys(changes).filter(k => changes[k]) }
      });
      
      setToast({ type: 'success', message: 'Profile updated!' });
    } catch (e) { 
      setToast({ type: 'error', message: 'Error: ' + e.message }); 
    }
  };

  const handleSaveNotifications = async () => {
    if (!merchant) return;
    try {
      await supabase.from('merchants').update({ notifications }).eq('id', merchant.id);
      
      await logMerchantActivity(MERCHANT_ACTIONS.NOTIFICATIONS_UPDATED, {
        details: { notifications }
      });
      
      setToast({ type: 'success', message: 'Notifications updated!' });
    } catch (e) { 
      setToast({ type: 'error', message: 'Error: ' + e.message }); 
    }
  };

  const handleChangePassword = async () => {
    if (!password.current || !password.new || !password.confirm) { 
      setToast({ type: 'error', message: 'Fill all password fields' }); 
      return; 
    }
    if (password.new.length < 6) { 
      setToast({ type: 'error', message: 'New password must be at least 6 characters' }); 
      return; 
    }
    if (password.new !== password.confirm) { 
      setToast({ type: 'error', message: 'New passwords do not match' }); 
      return; 
    }

    try {
      const { error } = await supabase.auth.updateUser({ password: password.new });
      if (error) throw error;
      
      await logMerchantActivity(MERCHANT_ACTIONS.PASSWORD_CHANGED);
      
      setPassword({ current: '', new: '', confirm: '' });
      setToast({ type: 'success', message: 'Password updated successfully!' });
    } catch (e) {
      setToast({ type: 'error', message: 'Error: ' + e.message });
    }
  };

  // Activity log helpers
  function formatDateFull(date) {
    if (!date) return 'Unknown';
    return new Date(date).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function parseUserAgent(ua) {
    if (!ua) return { browser: 'Unknown', os: 'Unknown' };
    let browser = 'Unknown';
    let os = 'Unknown';
    if (ua.includes('Chrome')) browser = 'Chrome';
    else if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Safari')) browser = 'Safari';
    else if (ua.includes('Edge')) browser = 'Edge';
    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Mac')) os = 'macOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
    return { browser, os };
  }

  function getActionIcon(action) {
    if (!action) return Settings;
    const a = action.toLowerCase();
    if (a.includes('payout')) return ArrowUpRight;
    if (a.includes('payin')) return ArrowDownLeft;
    if (a.includes('dispute')) return AlertCircle;
    if (a.includes('refund')) return RefreshCw;
    if (a.includes('settlement')) return Wallet;
    if (a.includes('auth') || a.includes('login') || a.includes('logout') || a.includes('2fa') || a.includes('password')) return User;
    if (a.includes('api') || a.includes('key')) return Key;
    if (a.includes('webhook')) return FileText;
    return Settings;
  }

  function getActionStyle(severity, action) {
    if (severity === 'critical') return { bg: 'bg-red-100', text: 'text-red-700' };
    if (severity === 'warning') return { bg: 'bg-amber-100', text: 'text-amber-700' };
    if (!action) return { bg: 'bg-slate-100', text: 'text-slate-600' };
    const a = action.toLowerCase();
    if (a.includes('disabled') || a.includes('revoke') || a.includes('cancel')) return { bg: 'bg-red-100', text: 'text-red-700' };
    if (a.includes('created') || a.includes('enabled')) return { bg: 'bg-green-100', text: 'text-green-700' };
    if (a.includes('update') || a.includes('request')) return { bg: 'bg-amber-100', text: 'text-amber-700' };
    if (a.includes('login') || a.includes('logout')) return { bg: 'bg-blue-100', text: 'text-blue-700' };
    return { bg: 'bg-slate-100', text: 'text-slate-600' };
  }
  
  function formatAction(action) {
    if (!action) return 'Unknown';
    return action.split('.').map(part => part.charAt(0).toUpperCase() + part.slice(1).replace(/_/g, ' ')).join(' → ');
  }

  if (loading) {
    return <LoadingSpinner message="Loading settings…" color="purple" />;
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      {/* Desktop header */}
      <div className="hidden sm:block">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <div className="p-2 bg-gradient-to-br from-slate-500 to-slate-600 rounded-xl shadow-sm">
            <Settings className="w-5 h-5 text-white" />
          </div>
          Settings
        </h1>
        <p className="text-slate-500 text-sm mt-0.5 ml-11">Manage your account & security</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {[
          { key: 'profile', label: 'Profile', icon: User },
          { key: 'notifications', label: 'Alerts', icon: Bell },
          { key: 'security', label: 'Security', icon: Shield },
          { key: 'activity', label: 'Activity', icon: Clock },
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
          {/* 2FA Section */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <ShieldCheck className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Two-Factor Authentication</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Add extra security with authenticator app</p>
                </div>
              </div>
              {twoFaStatus?.is_enabled && (
                <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> Enabled
                </span>
              )}
            </div>

            <TwoFactorSetup 
              userId={user?.id} 
              onComplete={async (enabled) => {
                if (enabled !== undefined) {
                  await logMerchantActivity(
                    enabled ? MERCHANT_ACTIONS.TWO_FA_ENABLED : MERCHANT_ACTIONS.TWO_FA_DISABLED
                  );
                }
                fetchData();
              }} 
            />

            {twoFaStatus?.backup_codes && twoFaStatus.backup_codes.length > 0 && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center gap-2 text-amber-800">
                  <Key className="w-4 h-4" />
                  <span className="text-xs font-semibold">Backup Codes Available</span>
                </div>
                <p className="text-xs text-amber-700 mt-1">
                  You have {twoFaStatus.backup_codes.length} backup codes. Store them securely for account recovery.
                </p>
              </div>
            )}
          </div>

          {/* Change Password Section */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-slate-100 rounded-lg">
                <Key className="w-5 h-5 text-slate-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Change Password</h3>
                <p className="text-xs text-slate-500 mt-0.5">Update your account password</p>
              </div>
            </div>
            
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

      {/* Activity Tab */}
      {activeTab === 'activity' && (
        <div className="space-y-4">
          {/* Date Filters */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-purple-600" />
                Filter by Date
              </h3>
              {(activityDateFrom || activityDateTo) && (
                <button 
                  onClick={() => { setActivityDateFrom(''); setActivityDateTo(''); }}
                  className="text-xs text-purple-600 font-semibold flex items-center gap-1 hover:text-purple-700"
                >
                  <X className="w-3 h-3" /> Clear
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">From Date</label>
                <input
                  type="date"
                  value={activityDateFrom}
                  onChange={e => setActivityDateFrom(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">To Date</label>
                <input
                  type="date"
                  value={activityDateTo}
                  onChange={e => setActivityDateTo(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Activity Log</h2>
                <p className="text-xs text-slate-500 mt-0.5">Recent actions on your account</p>
              </div>
              <button 
                onClick={fetchData}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {(() => {
              // Filter activity log by date
              const filteredActivity = activityLog.filter(log => {
                if (!log.created_at) return true;
                const logDate = new Date(log.created_at);
                if (activityDateFrom && logDate < new Date(activityDateFrom)) return false;
                if (activityDateTo && logDate > new Date(activityDateTo + 'T23:59:59')) return false;
                return true;
              });
              
              if (filteredActivity.length === 0) {
                return (
                  <div className="p-8 text-center">
                    <Clock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 text-sm font-medium">
                      {activityDateFrom || activityDateTo ? 'No activity in selected date range' : 'No activity yet'}
                    </p>
                    <p className="text-slate-400 text-xs mt-1">
                      {activityDateFrom || activityDateTo ? 'Try adjusting your date filters' : 'Your account activity will appear here'}
                    </p>
                  </div>
                );
              }
              
              return (
                <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
                  {filteredActivity.map(log => {
                const Icon = getActionIcon(log.action);
                const style = getActionStyle(log.severity, log.action);
                
                return (
                  <div key={log.id} className="p-4 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${style.bg}`}>
                        <Icon className={`w-4 h-4 ${style.text}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${style.bg} ${style.text}`}>
                              {formatAction(log.action)}
                            </span>
                            {log.severity === 'critical' && (
                              <span className="text-xs px-1.5 py-0.5 bg-red-500 text-white rounded font-bold">!</span>
                            )}
                          </div>
                          <span className="text-xs text-slate-400 flex-shrink-0">
                            {formatDateFull(log.created_at)}
                          </span>
                        </div>
                        {log.description && (
                          <p className="text-sm text-slate-700 mt-1">{log.description}</p>
                        )}
                        {log.entity_type && (
                          <p className="text-xs text-slate-500 mt-0.5">
                            {log.entity_type}
                            {log.entity_id && <span className="text-slate-400 font-mono ml-1">{log.entity_id.slice(0, 8)}…</span>}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                          {log.user_agent && (
                            <span>{parseUserAgent(log.user_agent).browser} on {parseUserAgent(log.user_agent).os}</span>
                          )}
                        </div>
                        {log.details && Object.keys(log.details).length > 0 && (
                          <details className="mt-2">
                            <summary className="text-xs text-purple-600 cursor-pointer hover:text-purple-700 font-medium">
                              View details
                            </summary>
                            <div className="mt-1 bg-slate-50 p-2 rounded-lg text-xs">
                              {Object.entries(log.details).map(([key, value]) => (
                                <div key={key} className="flex gap-2">
                                  <span className="text-slate-500 font-medium">{key.replace(/_/g, ' ')}:</span>
                                  <span className="text-slate-700 font-mono">
                                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
