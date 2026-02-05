import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabase';
import {
  Cpu, Activity, RefreshCw, CheckCircle, XCircle, AlertTriangle,
  ChevronDown, ChevronUp, Clock, ArrowDownCircle, ArrowUpCircle,
  Users, Shield, Zap, Eye, MessageSquare, Settings
} from 'lucide-react';
import { Toast } from '../../components/admin';

const API_BASE = 'https://us-central1-pay2x-4748c.cloudfunctions.net';

export default function AdminDisputeEngine() {
  const [loading, setLoading] = useState(true);
  const [disputes, setDisputes] = useState([]);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('queue');
  const [expandedDispute, setExpandedDispute] = useState(null);
  const [resolving, setResolving] = useState(null);
  const [adminNote, setAdminNote] = useState('');
  const [toast, setToast] = useState(null);
  // Config tab state
  const [disputeConfig, setDisputeConfig] = useState(null);
  const [editingDisputeConfig, setEditingDisputeConfig] = useState(false);
  const [editSlaHours, setEditSlaHours] = useState(24);
  const [editAutoEscalate, setEditAutoEscalate] = useState(12);
  const [editMaxDisputeAmount, setEditMaxDisputeAmount] = useState(50000);
  const [savingDisputeConfig, setSavingDisputeConfig] = useState(false);

  // Live disputes listener
  const fetchDisputes = async () => {
    const { data } = await supabase
      .from('disputes')
      .select('*')
      .order('created_at', { ascending: false });
    setDisputes((data || []).map(d => ({
      ...d,
      createdAt: d.created_at ? { seconds: new Date(d.created_at).getTime() / 1000 } : null,
      traderId: d.trader_id,
      merchantId: d.merchant_id,
      payinId: d.payin_id,
      payoutId: d.payout_id,
      traderResponse: d.trader_response,
      traderProofUrl: d.trader_proof_url,
      traderStatement: d.trader_statement,
      traderRespondedAt: d.trader_responded_at,
      adminDecision: d.admin_decision,
      adminNote: d.admin_note,
      adminResolvedAt: d.admin_resolved_at,
      balanceAdjusted: d.balance_adjusted,
      adjustmentAmount: d.adjustment_amount,
      slaDeadline: d.sla_deadline,
      isEscalated: d.is_escalated,
    })));
    setLoading(false);
  };

  useEffect(() => { fetchDisputes(); }, []);

  // Fetch engine logs
  const fetchLogs = async () => {
    try {
      const response = await fetch(`${API_BASE}/getDisputeEngineStats`);
      const data = await response.json();
      if (data.success) {
        setLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Fetch logs error:', err);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 30000);
    return () => clearInterval(interval);
  }, []);

  // Stats
  const stats = useMemo(() => {
    const s = {
      total: disputes.length,
      needsTrader: disputes.filter(d => d.status === 'routed_to_trader' || d.status === 'pending').length,
      needsAdmin: disputes.filter(d => d.status === 'trader_accepted' || d.status === 'trader_rejected').length,
      resolved: disputes.filter(d => d.status === 'admin_approved' || d.status === 'admin_rejected').length,
      payin: disputes.filter(d => d.type === 'payin').length,
      payout: disputes.filter(d => d.type === 'payout').length,
      totalAmount: disputes.reduce((sum, d) => sum + (Number(d.amount) || 0), 0),
    };
    return s;
  }, [disputes]);

  // Disputes needing admin action (trader has responded)
  const adminQueue = useMemo(() => {
    return disputes.filter(d =>
      d.status === 'trader_accepted' || d.status === 'trader_rejected'
    );
  }, [disputes]);

  // All disputes grouped by status
  const allDisputes = useMemo(() => {
    const groups = {
      'Needs Admin Decision': disputes.filter(d => d.status === 'trader_accepted' || d.status === 'trader_rejected'),
      'Waiting on Trader': disputes.filter(d => d.status === 'routed_to_trader' || d.status === 'pending'),
      'Resolved': disputes.filter(d => d.status === 'admin_approved' || d.status === 'admin_rejected'),
      'Unroutable': disputes.filter(d => d.status === 'unroutable'),
    };
    return groups;
  }, [disputes]);

  // Admin resolve
  const handleResolve = async (disputeId, decision) => {
    if (!window.confirm(`${decision === 'approve' ? 'APPROVE' : 'REJECT'} this dispute? This will adjust balances.`)) return;

    setResolving(disputeId);
    try {
      const response = await fetch(`${API_BASE}/adminResolveDispute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          disputeId,
          decision,
          adminNote: adminNote || '',
          adminId: 'admin',
        }),
      });
      const data = await response.json();
      if (data.success) {
        setToast({ msg: `Dispute ${decision}d! ${data.resolution}`, success: true });
        setAdminNote('');
        setExpandedDispute(null);
        fetchLogs();
      } else {
        setToast({ msg: data.error || 'Failed', success: false });
      }
    } catch (err) {
      setToast({ msg: err.message, success: false });
    }
    setResolving(null);
  };

  const initEngine = async () => {
    try {
      const response = await fetch(`${API_BASE}/initDisputeEngine`);
      const data = await response.json();
      if (data.success) alert('✅ Dispute Engine config initialized!');
    } catch (err) {
      alert('❌ Error: ' + err.message);
    }
  };

  // Status badge helper
  const StatusBadge = ({ status }) => {
    const config = {
      pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Pending' },
      routed_to_trader: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'With Trader' },
      trader_accepted: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Trader Accepted' },
      trader_rejected: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Trader Rejected' },
      admin_approved: { bg: 'bg-green-100', text: 'text-green-700', label: 'Approved' },
      admin_rejected: { bg: 'bg-red-100', text: 'text-red-700', label: 'Rejected' },
      unroutable: { bg: 'bg-slate-100', text: 'text-slate-700', label: 'Unroutable' },
    }[status] || { bg: 'bg-slate-100', text: 'text-slate-600', label: status };

    return (
      <span className={`px-2 py-0.5 rounded text-xs font-bold ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    );
  };

  // Fetch dispute config
  const fetchDisputeConfig = async () => {
    try {
      const { data } = await supabase
        .from('system_config')
        .select('value')
        .eq('key', 'dispute_engine_config')
        .single();
      if (data?.value) {
        setDisputeConfig(data.value);
      }
    } catch (err) {
      console.error('Error fetching dispute config:', err);
    }
  };

  useEffect(() => {
    fetchDisputeConfig();
  }, []);

  const saveDisputeConfig = async () => {
    setSavingDisputeConfig(true);
    try {
      const response = await fetch(`${API_BASE}/updateDisputeEngineConfig`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slaHours: editSlaHours,
          autoEscalateAfterHours: editAutoEscalate,
          maxDisputeAmount: editMaxDisputeAmount,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setToast({ msg: '✅ Dispute config saved!', success: true });
        setEditingDisputeConfig(false);
        fetchDisputeConfig();
      } else {
        setToast({ msg: `❌ Error: ${data.error}`, success: false });
      }
    } catch (err) {
      setToast({ msg: `❌ Error: ${err.message}`, success: false });
    }
    setSavingDisputeConfig(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <Shield className="w-12 h-12 text-orange-500 animate-pulse mx-auto mb-3" />
          <p className="text-slate-500 font-medium">Loading Dispute Engine...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && <Toast msg={toast.msg} success={toast.success} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Dispute Engine v1.0</h1>
            <p className="text-slate-500 text-xs">Smart Routing & Resolution</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={initEngine} className="px-3 py-2 bg-orange-100 text-orange-700 rounded-lg text-sm font-medium">
            Init
          </button>
          <button onClick={fetchLogs} className="px-3 py-2 bg-indigo-100 text-indigo-700 rounded-lg text-sm font-medium flex items-center gap-1.5">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border p-3">
          <p className="text-xs text-slate-500 mb-1">Needs Admin</p>
          <p className="text-xl font-bold text-orange-600">{stats.needsAdmin}</p>
          <p className="text-xs text-slate-400">{stats.needsTrader} with trader</p>
        </div>
        <div className="bg-white rounded-xl border p-3">
          <p className="text-xs text-slate-500 mb-1">Total Amount</p>
          <p className="text-xl font-bold text-green-600">₹{stats.totalAmount.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border p-3">
          <p className="text-xs text-slate-500 mb-1">Resolved</p>
          <p className="text-xl font-bold text-green-600">{stats.resolved}</p>
        </div>
        <div className="bg-white rounded-xl border p-3">
          <p className="text-xs text-slate-500 mb-1">Total</p>
          <p className="text-xl font-bold">{stats.total}</p>
          <p className="text-xs text-slate-400">{stats.payin} payin, {stats.payout} payout</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
        {['queue', 'all', 'logs', 'config'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition ${
              activeTab === tab ? 'bg-white shadow text-orange-600' : 'text-slate-600'
            }`}
          >
            {tab === 'queue' ? `Queue (${stats.needsAdmin})` : tab === 'all' ? 'All' : tab === 'logs' ? 'Logs' : 'Config'}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">

        {/* Admin Queue — disputes needing admin decision */}
        {activeTab === 'queue' && (
          <div className="divide-y">
            {adminQueue.length > 0 ? adminQueue.map((dispute) => (
              <div key={dispute.id} className="p-3">
                {/* Header */}
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedDispute(expandedDispute === dispute.id ? null : dispute.id)}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold flex items-center gap-1 ${
                      dispute.type === 'payin' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                    }`}>
                      {dispute.type === 'payin' ? <ArrowDownCircle size={10} /> : <ArrowUpCircle size={10} />}
                      {dispute.type?.toUpperCase()}
                    </span>
                    <StatusBadge status={dispute.status} />
                    <span className="font-bold text-green-700">₹{(dispute.amount || 0).toLocaleString()}</span>
                  </div>
                  {expandedDispute === dispute.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </div>

                {/* Trader info */}
                <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
                  <span>Merchant: {dispute.merchantName || dispute.merchantId?.substring(0, 10)}</span>
                  <span>Trader: {dispute.traderName || dispute.traderId?.substring(0, 10)}</span>
                </div>

                {/* Trader's action summary */}
                {dispute.traderAction && (
                  <div className={`mt-2 px-3 py-2 rounded-lg text-sm ${
                    dispute.status === 'trader_accepted' ? 'bg-orange-50 border border-orange-200 text-orange-800' :
                    'bg-purple-50 border border-purple-200 text-purple-800'
                  }`}>
                    <p className="font-semibold text-xs mb-0.5">Trader's Response:</p>
                    <p>{dispute.traderAction}</p>
                    {dispute.traderNote && <p className="mt-1 text-xs opacity-80">Note: {dispute.traderNote}</p>}
                  </div>
                )}

                {/* Expanded: full details + admin actions */}
                {expandedDispute === dispute.id && (
                  <div className="mt-3 space-y-3">
                    {/* Dispute Details */}
                    <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
                      <p><span className="text-slate-500">Reason:</span> {dispute.reason}</p>
                      {dispute.type === 'payin' && (
                        <>
                          {dispute.transactionId && <p><span className="text-slate-500">Txn ID:</span> <span className="font-mono">{dispute.transactionId}</span></p>}
                          {dispute.utrNumber && <p><span className="text-slate-500">UTR:</span> <span className="font-mono">{dispute.utrNumber}</span></p>}
                          {(dispute.receiverUpiId || dispute.upiId) && <p><span className="text-slate-500">UPI:</span> <span className="font-mono">{dispute.receiverUpiId || dispute.upiId}</span></p>}
                        </>
                      )}
                      {dispute.type === 'payout' && (
                        <>
                          {dispute.payoutId && <p><span className="text-slate-500">Payout ID:</span> <span className="font-mono">{dispute.payoutId}</span></p>}
                          {dispute.accountNumber && <p><span className="text-slate-500">Account:</span> <span className="font-mono">{dispute.accountNumber}</span></p>}
                        </>
                      )}
                      {dispute.routeReason && <p><span className="text-slate-500">Route:</span> {dispute.routeReason}</p>}
                      <p className="text-xs text-slate-400">
                        Created: {dispute.createdAt?.seconds ? new Date(dispute.createdAt.seconds * 1000).toLocaleString() : 'Unknown'}
                      </p>
                    </div>

                    {/* Proofs */}
                    {dispute.receiptUrl && (
                      <a href={dispute.receiptUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-blue-600 font-medium">
                        <Eye className="w-4 h-4" /> View Merchant Receipt
                      </a>
                    )}
                    {dispute.traderProofUrl && (
                      <a href={dispute.traderProofUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-purple-600 font-medium">
                        <Eye className="w-4 h-4" /> View Trader Proof
                      </a>
                    )}

                    {/* What will happen */}
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                      <p className="font-semibold text-amber-800 mb-1">⚠️ Balance Impact:</p>
                      {dispute.type === 'payin' && dispute.status === 'trader_accepted' && (
                        <>
                          <p className="text-amber-900"><strong>Approve:</strong> Credit ₹{(dispute.amount || 0).toLocaleString()} to trader balance (payin confirmed)</p>
                          <p className="text-amber-900"><strong>Reject:</strong> No balance change (override trader)</p>
                        </>
                      )}
                      {dispute.type === 'payin' && dispute.status === 'trader_rejected' && (
                        <>
                          <p className="text-amber-900"><strong>Approve:</strong> No balance change (trader was right, not received)</p>
                          <p className="text-amber-900"><strong>Reject:</strong> Force credit ₹{(dispute.amount || 0).toLocaleString()} to trader (override rejection)</p>
                        </>
                      )}
                      {dispute.type === 'payout' && dispute.status === 'trader_accepted' && (
                        <>
                          <p className="text-amber-900"><strong>Approve:</strong> Deduct ₹{(dispute.amount || 0).toLocaleString()} + commission from trader (not sent)</p>
                          <p className="text-amber-900"><strong>Reject:</strong> No deduction (override trader)</p>
                        </>
                      )}
                      {dispute.type === 'payout' && dispute.status === 'trader_rejected' && (
                        <>
                          <p className="text-amber-900"><strong>Approve:</strong> No deduction (proof accepted, payout was sent)</p>
                          <p className="text-amber-900"><strong>Reject:</strong> Deduct ₹{(dispute.amount || 0).toLocaleString()} + commission from trader (proof rejected)</p>
                        </>
                      )}
                    </div>

                    {/* Admin note */}
                    <textarea
                      value={adminNote}
                      onChange={(e) => setAdminNote(e.target.value)}
                      placeholder="Admin note (optional)..."
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                      rows={2}
                    />

                    {/* Action buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleResolve(dispute.id, 'approve')}
                        disabled={resolving === dispute.id}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 disabled:opacity-50"
                      >
                        <CheckCircle className="w-4 h-4" /> Approve
                      </button>
                      <button
                        onClick={() => handleResolve(dispute.id, 'reject')}
                        disabled={resolving === dispute.id}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-red-500 text-white rounded-lg text-sm font-bold hover:bg-red-600 disabled:opacity-50"
                      >
                        <XCircle className="w-4 h-4" /> Reject
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )) : (
              <div className="p-8 text-center text-slate-400">
                <CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No disputes waiting for admin decision</p>
                <p className="text-xs mt-1">Disputes appear here after trader responds</p>
              </div>
            )}
          </div>
        )}

        {/* All Disputes */}
        {activeTab === 'all' && (
          <div className="divide-y">
            {Object.entries(allDisputes).map(([group, items]) => items.length > 0 && (
              <div key={group}>
                <div className="px-3 py-2 bg-slate-50 border-b">
                  <p className="text-xs font-bold text-slate-600 uppercase">{group} ({items.length})</p>
                </div>
                {items.map(dispute => (
                  <div key={dispute.id} className="p-3 border-b last:border-b-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold flex items-center gap-1 ${
                          dispute.type === 'payin' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                        }`}>
                          {dispute.type?.toUpperCase()}
                        </span>
                        <StatusBadge status={dispute.status} />
                        <span className="font-bold text-green-700">₹{(dispute.amount || 0).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                      <span>{dispute.merchantName || 'Merchant'}</span>
                      <span>→ {dispute.traderName || dispute.traderId?.substring(0, 10) || 'Unrouted'}</span>
                      <span>{dispute.createdAt?.seconds ? new Date(dispute.createdAt.seconds * 1000).toLocaleDateString() : ''}</span>
                    </div>
                    {dispute.resolution && (
                      <p className="mt-1 text-xs text-slate-600 bg-slate-50 px-2 py-1 rounded">{dispute.resolution}</p>
                    )}
                    {dispute.balanceChanges?.length > 0 && (
                      <div className="mt-1">
                        {dispute.balanceChanges.map((change, i) => (
                          <p key={i} className={`text-xs font-medium ${change.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                            💰 {change.type === 'credit' ? '+' : '-'}₹{change.amount.toLocaleString()} ({change.reason})
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
            {disputes.length === 0 && (
              <div className="p-8 text-center text-slate-400">
                <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No disputes yet</p>
              </div>
            )}
          </div>
        )}

        {/* Engine Logs */}
        {activeTab === 'logs' && (
          <div className="divide-y">
            {logs.length > 0 ? logs.map((log, i) => (
              <div key={i} className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    log.type === 'routing' ? 'bg-blue-100 text-blue-700' :
                    log.type === 'trader_response' ? 'bg-purple-100 text-purple-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {log.type?.replace('_', ' ').toUpperCase()}
                  </span>
                  <span className="text-xs text-slate-500">{log.disputeType}</span>
                  {log.amount && <span className="text-xs font-bold text-green-700">₹{log.amount.toLocaleString()}</span>}
                </div>

                {log.type === 'routing' && (
                  <p className="text-sm text-slate-700">
                    {log.success ? '✅' : '❌'} {log.reason}
                    {log.traderName && <span className="font-medium"> → {log.traderName}</span>}
                  </p>
                )}
                {log.type === 'trader_response' && (
                  <p className="text-sm text-slate-700">{log.traderAction}</p>
                )}
                {log.type === 'admin_resolution' && (
                  <div>
                    <p className="text-sm text-slate-700">{log.resolution}</p>
                    {log.balanceChanges?.length > 0 && log.balanceChanges.map((change, j) => (
                      <p key={j} className={`text-xs font-medium mt-0.5 ${change.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                        💰 {change.type === 'credit' ? '+' : '-'}₹{change.amount.toLocaleString()}
                      </p>
                    ))}
                  </div>
                )}

                <p className="text-xs text-slate-400 mt-1">
                  {log.timestamp?._seconds
                    ? new Date(log.timestamp._seconds * 1000).toLocaleString()
                    : log.timestamp?.seconds
                      ? new Date(log.timestamp.seconds * 1000).toLocaleString()
                      : 'Unknown'
                  }
                </p>
              </div>
            )) : (
              <div className="p-8 text-center text-slate-400">
                <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No engine logs yet</p>
              </div>
            )}
          </div>
        )}

        {/* Config Tab */}
        {activeTab === 'config' && (
          <div className="p-4 space-y-4">
            <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <Settings className="w-4 h-4" /> Dispute Engine Config
            </h3>

            {disputeConfig ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-500 mb-1">SLA Hours</p>
                    {editingDisputeConfig ? (
                      <input
                        type="number" min="1" max="168"
                        value={editSlaHours}
                        onChange={e => setEditSlaHours(Number(e.target.value))}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm font-bold"
                      />
                    ) : (
                      <p className="text-lg font-bold text-orange-600">{disputeConfig.slaHours ?? 24}h</p>
                    )}
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-500 mb-1">Auto Escalate After</p>
                    {editingDisputeConfig ? (
                      <input
                        type="number" min="1" max="168"
                        value={editAutoEscalate}
                        onChange={e => setEditAutoEscalate(Number(e.target.value))}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm font-bold"
                      />
                    ) : (
                      <p className="text-lg font-bold text-orange-600">{disputeConfig.autoEscalateAfterHours ?? 12}h</p>
                    )}
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3 col-span-2">
                    <p className="text-xs text-slate-500 mb-1">Max Dispute Amount (auto-route)</p>
                    {editingDisputeConfig ? (
                      <input
                        type="number" min="0"
                        value={editMaxDisputeAmount}
                        onChange={e => setEditMaxDisputeAmount(Number(e.target.value))}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm font-bold"
                      />
                    ) : (
                      <p className="text-lg font-bold text-orange-600">₹{(disputeConfig.maxDisputeAmount ?? 50000).toLocaleString()}</p>
                    )}
                  </div>
                </div>

                {/* Edit / Save / Cancel buttons */}
                <div className="flex gap-2">
                  {editingDisputeConfig ? (
                    <>
                      <button
                        onClick={saveDisputeConfig}
                        disabled={savingDisputeConfig}
                        className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                      >
                        {savingDisputeConfig ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => setEditingDisputeConfig(false)}
                        className="flex-1 px-3 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setEditSlaHours(disputeConfig.slaHours ?? 24);
                          setEditAutoEscalate(disputeConfig.autoEscalateAfterHours ?? 12);
                          setEditMaxDisputeAmount(disputeConfig.maxDisputeAmount ?? 50000);
                          setEditingDisputeConfig(true);
                        }}
                        className="flex-1 px-3 py-2 bg-orange-100 text-orange-700 rounded-lg text-sm font-medium"
                      >
                        Edit Config
                      </button>
                      <button
                        onClick={initEngine}
                        className="flex-1 px-3 py-2 bg-amber-100 text-amber-700 rounded-lg text-sm font-medium"
                      >
                        Reset to Defaults
                      </button>
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="p-8 text-center text-slate-400">
                <Settings className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No config found</p>
                <button onClick={initEngine} className="mt-2 text-orange-600 text-sm underline">
                  Initialize Dispute Engine
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
