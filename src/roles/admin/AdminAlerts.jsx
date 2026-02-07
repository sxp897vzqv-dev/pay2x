import React, { useState, useEffect } from 'react';
import { getAlertRules, createAlertRule, updateAlertRule, deleteAlertRule, getAlertHistory, acknowledgeAlert } from '../../utils/enterprise';
import { Bell, Plus, Trash2, Edit2, CheckCircle, AlertTriangle, AlertCircle, Info, Settings, History, RefreshCw, X } from 'lucide-react';

const SEVERITY_CONFIG = {
  info: { color: 'blue', icon: Info, label: 'Info' },
  warning: { color: 'yellow', icon: AlertTriangle, label: 'Warning' },
  critical: { color: 'red', icon: AlertCircle, label: 'Critical' },
};

const EVENT_TYPES = [
  { value: 'high_failure_rate', label: 'High Failure Rate', description: 'Payin/payout failure rate exceeds threshold' },
  { value: 'large_transaction', label: 'Large Transaction', description: 'Transaction amount above threshold' },
  { value: 'new_dispute', label: 'New Dispute', description: 'New dispute created' },
  { value: 'low_balance', label: 'Low Balance', description: 'Trader/merchant balance below threshold' },
  { value: 'upi_down', label: 'UPI Down', description: 'UPI account health degraded' },
  { value: 'settlement_failed', label: 'Settlement Failed', description: 'Settlement processing failed' },
  { value: 'kyc_expired', label: 'KYC Expiring', description: 'KYC document expiring soon' },
  { value: 'unusual_activity', label: 'Unusual Activity', description: 'Anomalous transaction pattern detected' },
];

export default function AdminAlerts() {
  const [rules, setRules] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('rules');
  const [showModal, setShowModal] = useState(null); // null | 'create' | rule object

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [rulesData, historyData] = await Promise.all([
        getAlertRules(),
        getAlertHistory(50)
      ]);
      setRules(rulesData);
      setHistory(historyData);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleToggleRule = async (rule) => {
    try {
      await updateAlertRule(rule.id, { is_active: !rule.is_active });
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteRule = async (ruleId) => {
    if (!confirm('Delete this alert rule?')) return;
    try {
      await deleteAlertRule(ruleId);
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleAcknowledge = async (alertId) => {
    try {
      await acknowledgeAlert(alertId, 'Acknowledged from admin panel');
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const unacknowledgedCount = history.filter(h => !h.acknowledged_at).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Bell className="w-6 h-6" />
            Alert System
          </h1>
          <p className="text-gray-400 text-sm mt-1">Configure alerts and view history</p>
        </div>
        <button
          onClick={() => setShowModal('create')}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
        >
          <Plus className="w-4 h-4" />
          Create Rule
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-white/5">
          <p className="text-gray-400 text-sm">Active Rules</p>
          <p className="text-2xl font-bold text-green-400">{rules.filter(r => r.is_active).length}</p>
        </div>
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-white/5">
          <p className="text-gray-400 text-sm">Total Rules</p>
          <p className="text-2xl font-bold text-white">{rules.length}</p>
        </div>
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-white/5">
          <p className="text-gray-400 text-sm">Unacknowledged</p>
          <p className="text-2xl font-bold text-yellow-400">{unacknowledgedCount}</p>
        </div>
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-white/5">
          <p className="text-gray-400 text-sm">Critical (24h)</p>
          <p className="text-2xl font-bold text-red-400">
            {history.filter(h => h.severity === 'critical' && new Date(h.created_at) > new Date(Date.now() - 86400000)).length}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10">
        {[
          { key: 'rules', label: 'Rules', icon: Settings },
          { key: 'history', label: 'History', icon: History, badge: unacknowledgedCount },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'text-indigo-400 border-b-2 border-indigo-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.badge > 0 && (
              <span className="px-1.5 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded-full">{tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'rules' ? (
        <RulesTab rules={rules} onToggle={handleToggleRule} onEdit={setShowModal} onDelete={handleDeleteRule} loading={loading} />
      ) : (
        <HistoryTab history={history} onAcknowledge={handleAcknowledge} loading={loading} />
      )}

      {/* Modal */}
      {showModal && (
        <RuleModal
          rule={showModal === 'create' ? null : showModal}
          onClose={() => setShowModal(null)}
          onSuccess={fetchData}
        />
      )}
    </div>
  );
}

function RulesTab({ rules, onToggle, onEdit, onDelete, loading }) {
  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading...</div>;
  }

  if (rules.length === 0) {
    return (
      <div className="bg-[#1a1a2e] rounded-xl border border-white/5 p-8 text-center">
        <Bell className="w-12 h-12 text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400">No alert rules configured</p>
        <p className="text-gray-500 text-sm">Create your first rule to start monitoring</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rules.map(rule => {
        const SeverityIcon = SEVERITY_CONFIG[rule.severity]?.icon || Info;
        const severityColor = SEVERITY_CONFIG[rule.severity]?.color || 'gray';
        const eventType = EVENT_TYPES.find(e => e.value === rule.event_type);

        return (
          <div key={rule.id} className={`bg-[#1a1a2e] rounded-xl border p-4 ${rule.is_active ? 'border-white/5' : 'border-white/5 opacity-50'}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg bg-${severityColor}-500/20`}>
                  <SeverityIcon className={`w-5 h-5 text-${severityColor}-400`} />
                </div>
                <div>
                  <h3 className="text-white font-medium">{rule.name}</h3>
                  <p className="text-gray-400 text-sm">{eventType?.description || rule.event_type}</p>
                  <div className="flex gap-2 mt-2">
                    {rule.channels?.map(ch => (
                      <span key={ch} className="px-2 py-0.5 text-xs bg-white/10 text-gray-300 rounded">{ch}</span>
                    ))}
                  </div>
                  {rule.conditions && (
                    <p className="text-xs text-gray-500 mt-1">
                      Conditions: {JSON.stringify(rule.conditions)}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onToggle(rule)}
                  className={`px-3 py-1 text-xs rounded ${rule.is_active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}
                >
                  {rule.is_active ? 'Active' : 'Inactive'}
                </button>
                <button onClick={() => onEdit(rule)} className="p-2 hover:bg-white/10 rounded">
                  <Edit2 className="w-4 h-4 text-gray-400" />
                </button>
                <button onClick={() => onDelete(rule.id)} className="p-2 hover:bg-white/10 rounded">
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HistoryTab({ history, onAcknowledge, loading }) {
  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading...</div>;
  }

  if (history.length === 0) {
    return (
      <div className="bg-[#1a1a2e] rounded-xl border border-white/5 p-8 text-center">
        <History className="w-12 h-12 text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400">No alerts triggered yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {history.map(alert => {
        const SeverityIcon = SEVERITY_CONFIG[alert.severity]?.icon || Info;
        const severityColor = SEVERITY_CONFIG[alert.severity]?.color || 'gray';

        return (
          <div key={alert.id} className={`bg-[#1a1a2e] rounded-lg border p-3 ${alert.acknowledged_at ? 'border-white/5 opacity-60' : `border-${severityColor}-500/30`}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <SeverityIcon className={`w-5 h-5 text-${severityColor}-400 mt-0.5`} />
                <div>
                  <p className="text-white text-sm">{alert.message}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-gray-500">{new Date(alert.created_at).toLocaleString()}</span>
                    <span className="text-xs text-gray-400">{alert.rule_name}</span>
                  </div>
                </div>
              </div>
              {!alert.acknowledged_at && (
                <button
                  onClick={() => onAcknowledge(alert.id)}
                  className="px-3 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded"
                >
                  Acknowledge
                </button>
              )}
              {alert.acknowledged_at && (
                <span className="flex items-center gap-1 text-xs text-green-400">
                  <CheckCircle className="w-3 h-3" />
                  Acked
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RuleModal({ rule, onClose, onSuccess }) {
  const [form, setForm] = useState(rule || {
    name: '',
    event_type: 'high_failure_rate',
    severity: 'warning',
    channels: ['in_app'],
    conditions: { threshold: 50 },
    cooldown_minutes: 30,
    notify_admins: true,
    is_active: true,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.name.trim()) return alert('Name is required');
    setSaving(true);
    try {
      if (rule) {
        await updateAlertRule(rule.id, form);
      } else {
        await createAlertRule(form);
      }
      onSuccess();
      onClose();
    } catch (e) {
      console.error(e);
      alert('Failed to save rule');
    }
    setSaving(false);
  };

  const toggleChannel = (channel) => {
    setForm(f => ({
      ...f,
      channels: f.channels?.includes(channel)
        ? f.channels.filter(c => c !== channel)
        : [...(f.channels || []), channel]
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1a2e] rounded-xl w-full max-w-lg border border-white/10 max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{rule ? 'Edit Rule' : 'Create Alert Rule'}</h2>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Rule Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g., High Failure Rate Alert"
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Event Type</label>
            <select
              value={form.event_type}
              onChange={(e) => setForm(f => ({ ...f, event_type: e.target.value }))}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white"
            >
              {EVENT_TYPES.map(et => (
                <option key={et.value} value={et.value}>{et.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Severity</label>
            <select
              value={form.severity}
              onChange={(e) => setForm(f => ({ ...f, severity: e.target.value }))}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white"
            >
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Notification Channels</label>
            <div className="flex flex-wrap gap-2">
              {['in_app', 'email', 'telegram', 'webhook'].map(ch => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => toggleChannel(ch)}
                  className={`px-3 py-1 text-sm rounded border ${
                    form.channels?.includes(ch)
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'border-white/20 text-gray-400 hover:border-white/40'
                  }`}
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Threshold</label>
            <input
              type="number"
              value={form.conditions?.threshold || ''}
              onChange={(e) => setForm(f => ({ ...f, conditions: { ...f.conditions, threshold: parseInt(e.target.value) } }))}
              placeholder="e.g., 50 for 50%"
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Cooldown (minutes)</label>
            <input
              type="number"
              value={form.cooldown_minutes || 30}
              onChange={(e) => setForm(f => ({ ...f, cooldown_minutes: parseInt(e.target.value) }))}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="notify_admins"
              checked={form.notify_admins !== false}
              onChange={(e) => setForm(f => ({ ...f, notify_admins: e.target.checked }))}
              className="rounded border-white/20 bg-black/30"
            />
            <label htmlFor="notify_admins" className="text-sm text-white">Notify all admins</label>
          </div>
        </div>

        <div className="p-4 border-t border-white/10 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 border border-white/10 text-white rounded-lg hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
          >
            {saving ? 'Saving...' : (rule ? 'Update' : 'Create')}
          </button>
        </div>
      </div>
    </div>
  );
}
