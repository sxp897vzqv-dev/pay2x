// src/roles/merchant/MerchantSecurity.jsx
// Security settings: 2FA, Sessions, Activity Log

import { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import TwoFactorSetup from '../../components/TwoFactorSetup';
import { 
  ShieldCheckIcon, 
  DevicePhoneMobileIcon, 
  ClockIcon,
  ComputerDesktopIcon,
  ArrowRightOnRectangleIcon,
  KeyIcon,
  GlobeAltIcon,
  PlusIcon,
  TrashIcon,
  CheckIcon
} from '@heroicons/react/24/outline';

export default function MerchantSecurity() {
  const [activeTab, setActiveTab] = useState('2fa');
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [twoFaStatus, setTwoFaStatus] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [activityLog, setActivityLog] = useState([]);
  const [merchant, setMerchant] = useState(null);
  const [ipWhitelist, setIpWhitelist] = useState([]);
  const [newIp, setNewIp] = useState('');
  const [newIpLabel, setNewIpLabel] = useState('');
  const [addingIp, setAddingIp] = useState(false);
  const [whitelistEnabled, setWhitelistEnabled] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      // Get merchant
      const { data: merchantData } = await supabase
        .from('merchants')
        .select('*')
        .eq('profile_id', user.id)
        .single();
      setMerchant(merchantData);

      // Get 2FA status
      const { data: twoFa } = await supabase
        .from('user_2fa')
        .select('*')
        .eq('user_id', user.id)
        .single();
      setTwoFaStatus(twoFa);

      // Get active sessions
      const { data: sessionsData } = await supabase
        .from('user_sessions')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('last_activity_at', { ascending: false });
      setSessions(sessionsData || []);

      // Get activity log
      if (merchantData) {
        const { data: logData } = await supabase
          .from('merchant_activity_log')
          .select('*')
          .eq('merchant_id', merchantData.id)
          .order('created_at', { ascending: false })
          .limit(50);
        setActivityLog(logData || []);

        // Get IP whitelist
        const { data: ipData } = await supabase
          .from('ip_whitelist')
          .select('*')
          .eq('merchant_id', merchantData.id)
          .order('created_at', { ascending: false });
        setIpWhitelist(ipData || []);
        setWhitelistEnabled(merchantData.ip_whitelist_enabled || false);
      }
    } catch (err) {
      console.error('Error loading security data:', err);
    }
    setLoading(false);
  }

  async function addIpToWhitelist() {
    if (!newIp.trim()) return;
    
    // Basic IP validation
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(newIp.trim())) {
      alert('Invalid IP address format');
      return;
    }

    setAddingIp(true);
    try {
      const { error } = await supabase.from('ip_whitelist').insert({
        merchant_id: merchant.id,
        ip_address: newIp.trim(),
        label: newIpLabel.trim() || null,
        is_active: true
      });

      if (error) throw error;

      setNewIp('');
      setNewIpLabel('');
      loadData();
    } catch (err) {
      console.error('Error adding IP:', err);
      alert('Failed to add IP: ' + err.message);
    }
    setAddingIp(false);
  }

  async function removeIp(ipId) {
    if (!confirm('Remove this IP from whitelist?')) return;

    try {
      await supabase.from('ip_whitelist').delete().eq('id', ipId);
      loadData();
    } catch (err) {
      console.error('Error removing IP:', err);
    }
  }

  async function toggleWhitelist() {
    try {
      await supabase
        .from('merchants')
        .update({ ip_whitelist_enabled: !whitelistEnabled })
        .eq('id', merchant.id);
      setWhitelistEnabled(!whitelistEnabled);
    } catch (err) {
      console.error('Error toggling whitelist:', err);
    }
  }

  async function revokeSession(sessionId) {
    if (!confirm('Revoke this session? The device will be logged out.')) return;
    
    const { error } = await supabase
      .from('user_sessions')
      .update({ is_active: false })
      .eq('id', sessionId);

    if (!error) {
      setSessions(sessions.filter(s => s.id !== sessionId));
    }
  }

  async function revokeAllSessions() {
    if (!confirm('Revoke all sessions except current? All other devices will be logged out.')) return;
    
    const { error } = await supabase
      .from('user_sessions')
      .update({ is_active: false })
      .eq('user_id', user.id);

    if (!error) {
      setSessions([]);
    }
  }

  const tabs = [
    { id: '2fa', name: 'Two-Factor Auth', icon: ShieldCheckIcon },
    { id: 'sessions', name: 'Active Sessions', icon: DevicePhoneMobileIcon },
    { id: 'ip', name: 'IP Whitelist', icon: GlobeAltIcon },
    { id: 'activity', name: 'Activity Log', icon: ClockIcon },
  ];

  function formatDate(date) {
    return new Date(date).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function getDeviceIcon(userAgent) {
    if (!userAgent) return ComputerDesktopIcon;
    const ua = userAgent.toLowerCase();
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
      return DevicePhoneMobileIcon;
    }
    return ComputerDesktopIcon;
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

  function getActionColor(action) {
    if (action.includes('delete') || action.includes('revoke')) return 'text-red-600 bg-red-50';
    if (action.includes('create') || action.includes('add')) return 'text-green-600 bg-green-50';
    if (action.includes('update') || action.includes('change')) return 'text-yellow-600 bg-yellow-50';
    return 'text-gray-600 bg-gray-50';
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Security Settings</h1>
        <p className="text-gray-500 mt-1">Manage your account security and monitor activity</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-8">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <tab.icon className="h-5 w-5" />
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {/* 2FA Tab */}
      {activeTab === '2fa' && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <ShieldCheckIcon className="h-6 w-6 text-indigo-500" />
                Two-Factor Authentication
              </h2>
              <p className="text-gray-500 text-sm mt-1">
                Add an extra layer of security to your account
              </p>
            </div>
            {twoFaStatus?.is_enabled && (
              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                ✓ Enabled
              </span>
            )}
          </div>

          <TwoFactorSetup 
            userId={user?.id} 
            onComplete={() => loadData()} 
          />

          {twoFaStatus?.backup_codes && twoFaStatus.backup_codes.length > 0 && (
            <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h3 className="font-medium text-yellow-800 flex items-center gap-2">
                <KeyIcon className="h-5 w-5" />
                Backup Codes
              </h3>
              <p className="text-sm text-yellow-700 mt-1">
                You have {twoFaStatus.backup_codes.length} backup codes remaining.
                Store these securely - they can be used if you lose access to your authenticator.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Sessions Tab */}
      {activeTab === 'sessions' && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Active Sessions</h2>
              <p className="text-gray-500 text-sm mt-1">
                Devices currently logged into your account
              </p>
            </div>
            {sessions.length > 1 && (
              <button
                onClick={revokeAllSessions}
                className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium"
              >
                Revoke All Others
              </button>
            )}
          </div>

          {sessions.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No active sessions found
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {sessions.map(session => {
                const { browser, os } = parseUserAgent(session.user_agent);
                const DeviceIcon = getDeviceIcon(session.user_agent);
                
                return (
                  <div key={session.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-gray-100 rounded-lg">
                        <DeviceIcon className="h-6 w-6 text-gray-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {browser} on {os}
                        </p>
                        <p className="text-sm text-gray-500">
                          {session.ip_address || 'Unknown IP'} 
                          {session.location && ` • ${session.location}`}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          Last active: {formatDate(session.last_activity_at)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => revokeSession(session.id)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      title="Revoke session"
                    >
                      <ArrowRightOnRectangleIcon className="h-5 w-5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* IP Whitelist Tab */}
      {activeTab === 'ip' && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">API IP Whitelist</h2>
                <p className="text-gray-500 text-sm mt-1">
                  Restrict API access to specific IP addresses
                </p>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <span className={`text-sm font-medium ${whitelistEnabled ? 'text-green-600' : 'text-gray-500'}`}>
                  {whitelistEnabled ? 'Enabled' : 'Disabled'}
                </span>
                <button
                  onClick={toggleWhitelist}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    whitelistEnabled ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      whitelistEnabled ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </label>
            </div>
          </div>

          {!whitelistEnabled && (
            <div className="p-4 bg-yellow-50 border-b border-yellow-100">
              <p className="text-sm text-yellow-700">
                ⚠️ IP whitelist is disabled. API calls from any IP address are allowed.
              </p>
            </div>
          )}

          {/* Add IP Form */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex gap-3">
              <input
                type="text"
                value={newIp}
                onChange={(e) => setNewIp(e.target.value)}
                placeholder="IP Address (e.g., 192.168.1.1)"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <input
                type="text"
                value={newIpLabel}
                onChange={(e) => setNewIpLabel(e.target.value)}
                placeholder="Label (optional)"
                className="w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <button
                onClick={addIpToWhitelist}
                disabled={addingIp || !newIp.trim()}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
              >
                <PlusIcon className="h-4 w-4" />
                Add
              </button>
            </div>
          </div>

          {ipWhitelist.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <GlobeAltIcon className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No IPs whitelisted</p>
              <p className="text-sm mt-1">Add IP addresses to restrict API access</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {ipWhitelist.map(ip => (
                <div key={ip.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <GlobeAltIcon className="h-5 w-5 text-gray-600" />
                    </div>
                    <div>
                      <p className="font-mono text-gray-900">{ip.ip_address}</p>
                      {ip.label && <p className="text-sm text-gray-500">{ip.label}</p>}
                      <p className="text-xs text-gray-400 mt-1">
                        Added: {formatDate(ip.created_at)}
                        {ip.last_used_at && ` • Last used: ${formatDate(ip.last_used_at)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {ip.is_active && (
                      <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                        Active
                      </span>
                    )}
                    <button
                      onClick={() => removeIp(ip.id)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Activity Log Tab */}
      {activeTab === 'activity' && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold">Activity Log</h2>
            <p className="text-gray-500 text-sm mt-1">
              Recent actions on your account
            </p>
          </div>

          {activityLog.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No activity recorded yet
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {activityLog.map(log => (
                <div key={log.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getActionColor(log.action)}`}>
                        {log.action}
                      </span>
                      <span className="text-gray-900">
                        {log.resource_type && (
                          <span className="text-gray-500">{log.resource_type}: </span>
                        )}
                        {log.resource_id || ''}
                      </span>
                    </div>
                    <span className="text-sm text-gray-500">
                      {formatDate(log.created_at)}
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-gray-500 flex items-center gap-4">
                    <span>{log.user_email || 'System'}</span>
                    {log.ip_address && <span>IP: {log.ip_address}</span>}
                  </div>
                  {log.details && (
                    <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-x-auto">
                      {JSON.stringify(log.details, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
