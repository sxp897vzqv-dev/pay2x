import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabase';
import { getSettlements, createSettlement, processSettlement, getSettlementSettings, updateSettlementSettings } from '../../utils/enterprise';
import { Search, Filter, Download, CheckCircle, Clock, XCircle, AlertCircle, Settings, Plus, RefreshCw } from 'lucide-react';

const STATUS_CONFIG = {
  pending: { color: 'yellow', icon: Clock, label: 'Pending' },
  processing: { color: 'blue', icon: RefreshCw, label: 'Processing' },
  completed: { color: 'green', icon: CheckCircle, label: 'Completed' },
  failed: { color: 'red', icon: XCircle, label: 'Failed' },
  cancelled: { color: 'gray', icon: XCircle, label: 'Cancelled' },
};

export default function AdminSettlements() {
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('settlements');
  const [filters, setFilters] = useState({ type: '', status: '' });
  const [settings, setSettings] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showProcessModal, setShowProcessModal] = useState(null);

  useEffect(() => { fetchData(); }, [filters]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [settlementsData, settingsData] = await Promise.all([
        getSettlements(filters),
        getSettlementSettings('global')
      ]);
      setSettlements(settlementsData);
      setSettings(settingsData);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const stats = useMemo(() => {
    const pending = settlements.filter(s => s.status === 'pending');
    const completed = settlements.filter(s => s.status === 'completed');
    return {
      pendingCount: pending.length,
      pendingAmount: pending.reduce((sum, s) => sum + Number(s.net_amount || 0), 0),
      completedCount: completed.length,
      completedAmount: completed.reduce((sum, s) => sum + Number(s.net_amount || 0), 0),
    };
  }, [settlements]);

  const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);
  const formatDate = (date) => new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Settlements</h1>
          <p className="text-gray-400 text-sm mt-1">Manage merchant and trader settlements</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Settlement
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-white/5">
          <p className="text-gray-400 text-sm">Pending</p>
          <p className="text-2xl font-bold text-yellow-400">{stats.pendingCount}</p>
          <p className="text-sm text-gray-500">{formatCurrency(stats.pendingAmount)}</p>
        </div>
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-white/5">
          <p className="text-gray-400 text-sm">Completed</p>
          <p className="text-2xl font-bold text-green-400">{stats.completedCount}</p>
          <p className="text-sm text-gray-500">{formatCurrency(stats.completedAmount)}</p>
        </div>
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-white/5">
          <p className="text-gray-400 text-sm">Frequency</p>
          <p className="text-xl font-bold text-white capitalize">{settings?.frequency || 'Daily'}</p>
        </div>
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-white/5">
          <p className="text-gray-400 text-sm">Hold Period</p>
          <p className="text-xl font-bold text-white">{settings?.hold_days || 0} days</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10">
        {['settlements', 'settings'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? 'text-indigo-400 border-b-2 border-indigo-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'settlements' ? (
        <>
          {/* Filters */}
          <div className="flex gap-3 flex-wrap">
            <select
              value={filters.type}
              onChange={(e) => setFilters(f => ({ ...f, type: e.target.value }))}
              className="bg-[#1a1a2e] border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
            >
              <option value="">All Types</option>
              <option value="merchant">Merchant</option>
              <option value="trader">Trader</option>
            </select>
            <select
              value={filters.status}
              onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}
              className="bg-[#1a1a2e] border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
            >
              <option value="">All Status</option>
              {Object.keys(STATUS_CONFIG).map(s => (
                <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
              ))}
            </select>
            <button onClick={fetchData} className="p-2 bg-[#1a1a2e] rounded-lg hover:bg-white/10">
              <RefreshCw className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          {/* Table */}
          <div className="bg-[#1a1a2e] rounded-xl border border-white/5 overflow-hidden">
            <table className="w-full">
              <thead className="bg-black/20">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Entity</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Period</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Gross</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Fee</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Net</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
                ) : settlements.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No settlements found</td></tr>
                ) : settlements.map(s => {
                  const StatusIcon = STATUS_CONFIG[s.status]?.icon || Clock;
                  const statusColor = STATUS_CONFIG[s.status]?.color || 'gray';
                  return (
                    <tr key={s.id} className="hover:bg-white/5">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 text-xs rounded ${s.settlement_type === 'merchant' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>
                            {s.settlement_type}
                          </span>
                          <span className="text-white">{s.merchants?.name || s.traders?.name || '-'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">
                        {formatDate(s.period_start)} - {formatDate(s.period_end)}
                      </td>
                      <td className="px-4 py-3 text-right text-white">{formatCurrency(s.gross_amount)}</td>
                      <td className="px-4 py-3 text-right text-red-400">-{formatCurrency(s.fee_amount)}</td>
                      <td className="px-4 py-3 text-right text-green-400 font-medium">{formatCurrency(s.net_amount)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center">
                          <span className={`flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-${statusColor}-500/20 text-${statusColor}-400`}>
                            <StatusIcon className="w-3 h-3" />
                            {STATUS_CONFIG[s.status]?.label}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {s.status === 'pending' && (
                          <button
                            onClick={() => setShowProcessModal(s)}
                            className="text-xs px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded"
                          >
                            Process
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <SettingsTab settings={settings} onUpdate={fetchData} />
      )}

      {/* Process Modal */}
      {showProcessModal && (
        <ProcessModal
          settlement={showProcessModal}
          onClose={() => setShowProcessModal(null)}
          onSuccess={fetchData}
        />
      )}
    </div>
  );
}

function SettingsTab({ settings, onUpdate }) {
  const [form, setForm] = useState(settings || {});
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (settings) setForm(settings); }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettlementSettings('global', null, form);
      onUpdate();
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  return (
    <div className="bg-[#1a1a2e] rounded-xl border border-white/5 p-6 max-w-2xl">
      <h2 className="text-lg font-semibold text-white mb-4">Global Settlement Settings</h2>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Frequency</label>
          <select
            value={form.frequency || 'daily'}
            onChange={(e) => setForm(f => ({ ...f, frequency: e.target.value }))}
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Bi-weekly</option>
            <option value="monthly">Monthly</option>
            <option value="manual">Manual</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Settlement Hour (0-23)</label>
          <input
            type="number"
            min="0"
            max="23"
            value={form.settlement_hour || 10}
            onChange={(e) => setForm(f => ({ ...f, settlement_hour: parseInt(e.target.value) }))}
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Minimum Settlement Amount (₹)</label>
          <input
            type="number"
            value={form.min_settlement_amount || 1000}
            onChange={(e) => setForm(f => ({ ...f, min_settlement_amount: parseFloat(e.target.value) }))}
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Hold Percentage (%)</label>
          <input
            type="number"
            step="0.1"
            value={form.hold_percentage || 0}
            onChange={(e) => setForm(f => ({ ...f, hold_percentage: parseFloat(e.target.value) }))}
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Hold Days</label>
          <input
            type="number"
            value={form.hold_days || 0}
            onChange={(e) => setForm(f => ({ ...f, hold_days: parseInt(e.target.value) }))}
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="auto_settle"
            checked={form.auto_settle !== false}
            onChange={(e) => setForm(f => ({ ...f, auto_settle: e.target.checked }))}
            className="rounded border-white/20 bg-black/30"
          />
          <label htmlFor="auto_settle" className="text-sm text-white">Enable auto-settlement</label>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

function ProcessModal({ settlement, onClose, onSuccess }) {
  const [transactionRef, setTransactionRef] = useState('');
  const [processing, setProcessing] = useState(false);

  const handleProcess = async () => {
    if (!transactionRef.trim()) return;
    setProcessing(true);
    try {
      await processSettlement(settlement.id, transactionRef);
      onSuccess();
      onClose();
    } catch (e) {
      console.error(e);
      alert('Failed to process settlement');
    }
    setProcessing(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1a2e] rounded-xl p-6 w-full max-w-md border border-white/10">
        <h2 className="text-lg font-semibold text-white mb-4">Process Settlement</h2>
        
        <div className="space-y-4">
          <div className="bg-black/30 rounded-lg p-3">
            <p className="text-sm text-gray-400">Entity</p>
            <p className="text-white">{settlement.merchants?.name || settlement.traders?.name}</p>
          </div>
          
          <div className="bg-black/30 rounded-lg p-3">
            <p className="text-sm text-gray-400">Net Amount</p>
            <p className="text-xl font-bold text-green-400">
              ₹{Number(settlement.net_amount).toLocaleString('en-IN')}
            </p>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Bank Transaction Reference</label>
            <input
              type="text"
              value={transactionRef}
              onChange={(e) => setTransactionRef(e.target.value)}
              placeholder="Enter UTR/Reference number"
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2 border border-white/10 text-white rounded-lg hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            onClick={handleProcess}
            disabled={processing || !transactionRef.trim()}
            className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50"
          >
            {processing ? 'Processing...' : 'Mark as Completed'}
          </button>
        </div>
      </div>
    </div>
  );
}
