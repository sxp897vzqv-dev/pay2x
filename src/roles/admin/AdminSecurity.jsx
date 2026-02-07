// src/roles/admin/AdminSecurity.jsx
// Admin Security Dashboard - View login attempts, locked accounts, security settings
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import {
  Shield,
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle,
  Clock,
  User,
  Globe,
  Activity,
  Settings,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  XCircle,
} from 'lucide-react';
import { logAuditEvent } from '../../utils/auditLogger';

const AdminSecurity = () => {
  const [activeTab, setActiveTab] = useState('attempts');
  const [loginAttempts, setLoginAttempts] = useState([]);
  const [lockedAccounts, setLockedAccounts] = useState([]);
  const [securitySettings, setSecuritySettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const PAGE_SIZE = 20;

  // Fetch login attempts
  const fetchLoginAttempts = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('login_attempts')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

      if (searchQuery) {
        query = query.ilike('email', `%${searchQuery}%`);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      setLoginAttempts(data || []);
      setTotalPages(Math.ceil((count || 0) / PAGE_SIZE));
    } catch (error) {
      console.error('Error fetching login attempts:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch locked accounts
  const fetchLockedAccounts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('account_lockouts')
        .select('*')
        .order('locked_at', { ascending: false });

      if (error) throw error;
      setLockedAccounts(data || []);
    } catch (error) {
      console.error('Error fetching locked accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch security settings
  const fetchSecuritySettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('security_settings')
        .select('*')
        .order('setting_key');

      if (error) throw error;
      setSecuritySettings(data || []);
    } catch (error) {
      console.error('Error fetching security settings:', error);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch based on active tab
  useEffect(() => {
    if (activeTab === 'attempts') {
      fetchLoginAttempts();
    } else if (activeTab === 'locked') {
      fetchLockedAccounts();
    } else if (activeTab === 'settings') {
      fetchSecuritySettings();
    }
  }, [activeTab, page, searchQuery]);

  // Unlock account
  const handleUnlockAccount = async (email) => {
    if (!confirm(`Are you sure you want to unlock ${email}?`)) return;

    try {
      const { error } = await supabase
        .from('account_lockouts')
        .delete()
        .eq('email', email);

      if (error) throw error;

      // Log the action
      await logAuditEvent({
        action: 'account_unlocked',
        category: 'security',
        entityType: 'user',
        entityId: email,
        entityName: email,
        details: {
          note: 'Account manually unlocked by admin',
        },
        severity: 'warning',
      });

      // Refresh list
      fetchLockedAccounts();
    } catch (error) {
      console.error('Error unlocking account:', error);
      alert('Failed to unlock account');
    }
  };

  // Update security setting
  const handleUpdateSetting = async (settingKey, newValue) => {
    try {
      const { error } = await supabase
        .from('security_settings')
        .update({
          setting_value: newValue,
          updated_at: new Date().toISOString(),
        })
        .eq('setting_key', settingKey);

      if (error) throw error;

      // Log the action
      await logAuditEvent({
        action: 'security_setting_changed',
        category: 'security',
        entityType: 'system',
        entityId: settingKey,
        entityName: settingKey,
        details: {
          note: `Security setting "${settingKey}" updated`,
          after: newValue,
        },
        severity: 'warning',
        requiresReview: true,
      });

      // Refresh settings
      fetchSecuritySettings();
    } catch (error) {
      console.error('Error updating setting:', error);
      alert('Failed to update setting');
    }
  };

  // Format timestamp
  const formatTime = (timestamp) => {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Check if lockout is active
  const isLockoutActive = (lockedUntil) => {
    return new Date(lockedUntil) > new Date();
  };

  // Get stats for header
  const stats = {
    totalAttempts: loginAttempts.length,
    failedAttempts: loginAttempts.filter((a) => !a.success).length,
    lockedAccounts: lockedAccounts.filter((a) => isLockoutActive(a.locked_until)).length,
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="w-7 h-7 text-blue-600" />
            Security Dashboard
          </h1>
          <p className="text-gray-600 mt-1">Monitor login attempts, locked accounts, and security settings</p>
        </div>
        <button
          onClick={() => {
            if (activeTab === 'attempts') fetchLoginAttempts();
            else if (activeTab === 'locked') fetchLockedAccounts();
            else fetchSecuritySettings();
          }}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Activity className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Attempts (24h)</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalAttempts}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <XCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Failed Attempts</p>
              <p className="text-2xl font-bold text-red-600">{stats.failedAttempts}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <Lock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Locked Accounts</p>
              <p className="text-2xl font-bold text-amber-600">{stats.lockedAccounts}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="border-b border-gray-200">
          <div className="flex gap-1 p-2">
            {[
              { id: 'attempts', label: 'Login Attempts', icon: Activity },
              { id: 'locked', label: 'Locked Accounts', icon: Lock },
              { id: 'settings', label: 'Security Settings', icon: Settings },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setPage(1);
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Search (for attempts tab) */}
          {activeTab === 'attempts' && (
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by email..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          )}

          {/* Loading State */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
              <span className="ml-2 text-gray-500">Loading...</span>
            </div>
          ) : (
            <>
              {/* Login Attempts Tab */}
              {activeTab === 'attempts' && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-sm text-gray-500 border-b">
                        <th className="pb-3 font-medium">Email</th>
                        <th className="pb-3 font-medium">Status</th>
                        <th className="pb-3 font-medium">IP Address</th>
                        <th className="pb-3 font-medium">Time</th>
                        <th className="pb-3 font-medium">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {loginAttempts.map((attempt) => (
                        <tr key={attempt.id} className="text-sm">
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-gray-400" />
                              <span className="font-medium text-gray-900">{attempt.email}</span>
                            </div>
                          </td>
                          <td className="py-3">
                            {attempt.success ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium">
                                <CheckCircle className="w-3 h-3" />
                                Success
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-700 rounded-full text-xs font-medium">
                                <XCircle className="w-3 h-3" />
                                Failed
                              </span>
                            )}
                          </td>
                          <td className="py-3">
                            <div className="flex items-center gap-1 text-gray-600">
                              <Globe className="w-3 h-3" />
                              {attempt.ip_address || 'Unknown'}
                            </div>
                          </td>
                          <td className="py-3 text-gray-600">{formatTime(attempt.created_at)}</td>
                          <td className="py-3 text-gray-500 text-xs max-w-xs truncate">
                            {attempt.failure_reason || '-'}
                          </td>
                        </tr>
                      ))}
                      {loginAttempts.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-gray-500">
                            No login attempts found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <p className="text-sm text-gray-500">
                        Page {page} of {totalPages}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={page === 1}
                          className="p-2 rounded-lg border hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                          disabled={page === totalPages}
                          className="p-2 rounded-lg border hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Locked Accounts Tab */}
              {activeTab === 'locked' && (
                <div className="space-y-3">
                  {lockedAccounts.map((lockout) => {
                    const isActive = isLockoutActive(lockout.locked_until);
                    return (
                      <div
                        key={lockout.id}
                        className={`p-4 rounded-lg border ${
                          isActive ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <div
                              className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                isActive ? 'bg-red-100' : 'bg-gray-100'
                              }`}
                            >
                              <Lock className={`w-5 h-5 ${isActive ? 'text-red-600' : 'text-gray-400'}`} />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{lockout.email}</p>
                              <div className="flex flex-wrap gap-3 mt-1 text-sm text-gray-600">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  Locked: {formatTime(lockout.locked_at)}
                                </span>
                                <span className="flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" />
                                  {lockout.failed_attempts} failed attempts
                                </span>
                                {lockout.last_attempt_ip && (
                                  <span className="flex items-center gap-1">
                                    <Globe className="w-3 h-3" />
                                    {lockout.last_attempt_ip}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm mt-1">
                                {isActive ? (
                                  <span className="text-red-600 font-medium">
                                    Locked until {formatTime(lockout.locked_until)}
                                  </span>
                                ) : (
                                  <span className="text-gray-500">Lock expired</span>
                                )}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleUnlockAccount(lockout.email)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
                          >
                            <Unlock className="w-4 h-4" />
                            Unlock
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {lockedAccounts.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                      <Lock className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                      <p>No locked accounts</p>
                    </div>
                  )}
                </div>
              )}

              {/* Security Settings Tab */}
              {activeTab === 'settings' && (
                <div className="space-y-4">
                  {securitySettings.map((setting) => (
                    <div key={setting.id} className="p-4 rounded-lg border border-gray-200 bg-gray-50">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-gray-900 capitalize">
                            {setting.setting_key.replace(/_/g, ' ')}
                          </p>
                          <p className="text-sm text-gray-500 mt-1">{setting.description}</p>
                        </div>
                        <button
                          onClick={() => {
                            const newValue = prompt(
                              'Enter new value (JSON):',
                              JSON.stringify(setting.setting_value, null, 2)
                            );
                            if (newValue) {
                              try {
                                const parsed = JSON.parse(newValue);
                                handleUpdateSetting(setting.setting_key, parsed);
                              } catch (e) {
                                alert('Invalid JSON');
                              }
                            }
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg"
                        >
                          <Settings className="w-4 h-4" />
                          Edit
                        </button>
                      </div>
                      <pre className="mt-3 p-3 bg-white rounded-lg border text-xs overflow-x-auto">
                        {JSON.stringify(setting.setting_value, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminSecurity;
