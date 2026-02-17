import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../../supabase';
import { useRealtimeSubscription } from '../../../hooks/useRealtimeSubscription';
import { logMerchantActivity, MERCHANT_ACTIONS } from '../../../utils/merchantActivityLogger';
import {
  AlertCircle, Plus, Search, Filter, X, Calendar, Download,
  RefreshCw, Clock, CheckCircle, XCircle, AlertTriangle, Eye,
} from 'lucide-react';
import DisputeCard from './components/MerchantDisputeCard';
import CreateDisputeModal from './components/MerchantCreateDisputeModal';
import { Toast } from '../../../components/admin';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';

/* ─── Dispute Details Modal ─── */
function DisputeDetailsModal({ dispute, onClose }) {
  if (!dispute) return null;

  const statusStyles = {
    pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: Clock },
    routed_to_trader: { bg: 'bg-blue-100', text: 'text-blue-700', icon: AlertCircle },
    trader_accepted: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: CheckCircle },
    trader_rejected: { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle },
    admin_approved: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle },
    admin_rejected: { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle },
    resolved: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle },
  };
  const style = statusStyles[dispute.status] || statusStyles.pending;
  const StatusIcon = style.icon;

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-white shadow-2xl rounded-t-2xl sm:rounded-2xl overflow-hidden mt-auto sm:mt-0 max-h-[85vh] flex flex-col">
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 bg-slate-300 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900">Dispute Details</h3>
            <p className="text-xs text-slate-400 font-mono">{dispute.dispute_id}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Status */}
          <div className={`${style.bg} rounded-xl p-3 flex items-center gap-3`}>
            <StatusIcon className={`w-5 h-5 ${style.text}`} />
            <div>
              <p className={`font-bold ${style.text} capitalize`}>{dispute.status?.replace(/_/g, ' ')}</p>
              <p className="text-xs text-slate-600">
                {dispute.trader_response || dispute.admin_notes || 'Awaiting response'}
              </p>
            </div>
          </div>

          {/* Details */}
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Amount</span>
              <span className="font-bold text-slate-900">₹{dispute.amount?.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Type</span>
              <span className="font-semibold text-slate-700 capitalize">{dispute.type}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Transaction</span>
              <span className="font-mono text-xs text-slate-700">{dispute.transaction_id || dispute.utr || 'N/A'}</span>
            </div>
            {dispute.upi_id && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">UPI ID</span>
                <span className="font-mono text-xs text-slate-700">{dispute.upi_id}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Created</span>
              <span className="text-xs text-slate-700">
                {dispute.created_at ? new Date(dispute.created_at).toLocaleString('en-IN') : '—'}
              </span>
            </div>
            {dispute.deadline && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Deadline</span>
                <span className="text-xs text-slate-700">
                  {new Date(dispute.deadline).toLocaleString('en-IN')}
                </span>
              </div>
            )}
          </div>

          {/* Reason */}
          <div>
            <h4 className="text-sm font-bold text-slate-900 mb-2">Reason</h4>
            <p className="text-sm text-slate-600 bg-slate-50 rounded-xl p-3 border border-slate-200">
              {dispute.reason || 'No reason provided'}
            </p>
          </div>

          {/* Evidence */}
          {dispute.evidence_url && (
            <div>
              <h4 className="text-sm font-bold text-slate-900 mb-2">Evidence</h4>
              <a 
                href={dispute.evidence_url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="block bg-blue-50 border border-blue-200 rounded-xl p-3 text-blue-700 text-sm font-semibold hover:bg-blue-100"
              >
                View Attached Evidence →
              </a>
            </div>
          )}

          {/* Timeline */}
          {(dispute.routed_at || dispute.trader_responded_at || dispute.resolved_at) && (
            <div>
              <h4 className="text-sm font-bold text-slate-900 mb-2">Timeline</h4>
              <div className="space-y-2 text-xs">
                {dispute.created_at && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <div className="w-2 h-2 rounded-full bg-slate-400" />
                    <span>Created: {new Date(dispute.created_at).toLocaleString('en-IN')}</span>
                  </div>
                )}
                {dispute.routed_at && (
                  <div className="flex items-center gap-2 text-blue-600">
                    <div className="w-2 h-2 rounded-full bg-blue-400" />
                    <span>Routed to trader: {new Date(dispute.routed_at).toLocaleString('en-IN')}</span>
                  </div>
                )}
                {dispute.trader_responded_at && (
                  <div className="flex items-center gap-2 text-emerald-600">
                    <div className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span>Trader responded: {new Date(dispute.trader_responded_at).toLocaleString('en-IN')}</span>
                  </div>
                )}
                {dispute.resolved_at && (
                  <div className="flex items-center gap-2 text-green-600">
                    <div className="w-2 h-2 rounded-full bg-green-400" />
                    <span>Resolved: {new Date(dispute.resolved_at).toLocaleString('en-IN')}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Main Component ─── */
export default function MerchantDispute() {
  const [disputes, setDisputes] = useState([]);
  const [merchantId, setMerchantId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedDispute, setSelectedDispute] = useState(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [toast, setToast] = useState(null);
  const [newDisputeIds, setNewDisputeIds] = useState(new Set());

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch disputes
  const fetchDisputes = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); setRefreshing(false); return; }

    try {
      const { data: merchant } = await supabase.from('merchants').select('id').eq('profile_id', user.id).single();
      if (!merchant) { setLoading(false); setRefreshing(false); return; }

      setMerchantId(merchant.id);

      const { data } = await supabase
        .from('disputes')
        .select('*')
        .eq('merchant_id', merchant.id)
        .order('created_at', { ascending: false })
        .limit(200);

      setDisputes(data || []);
    } catch (error) {
      console.error('Error fetching disputes:', error);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  // Initial fetch
  useEffect(() => { fetchDisputes(); }, [fetchDisputes]);

  // Real-time subscription
  useRealtimeSubscription('disputes', {
    filter: merchantId ? `merchant_id=eq.${merchantId}` : undefined,
    onInsert: (newDispute) => {
      setDisputes(prev => [newDispute, ...prev]);
      setNewDisputeIds(prev => new Set([...prev, newDispute.id]));
      setToast({ type: 'info', message: `New dispute created: ₹${newDispute.amount?.toLocaleString()}` });
      setTimeout(() => {
        setNewDisputeIds(prev => {
          const next = new Set(prev);
          next.delete(newDispute.id);
          return next;
        });
      }, 5000);
    },
    onUpdate: (updated) => {
      setDisputes(prev => prev.map(d => d.id === updated.id ? updated : d));
      
      // Notify on status changes
      if (updated.status === 'trader_accepted') {
        setToast({ type: 'success', message: `Dispute accepted by trader: ₹${updated.amount?.toLocaleString()}` });
      } else if (updated.status === 'admin_approved') {
        setToast({ type: 'success', message: `Dispute resolved in your favor! ₹${updated.amount?.toLocaleString()} credited` });
      } else if (updated.status === 'admin_rejected' || updated.status === 'trader_rejected') {
        setToast({ type: 'error', message: `Dispute rejected: ${updated.admin_notes || updated.trader_response || 'No reason provided'}` });
      }
    },
  });

  const filtered = useMemo(() => {
    let r = disputes;
    if (statusFilter !== 'all') r = r.filter(d => d.status === statusFilter);
    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase();
      r = r.filter(d => 
        d.dispute_id?.toLowerCase().includes(s) || 
        d.transaction_id?.toLowerCase().includes(s) ||
        d.utr?.toLowerCase().includes(s) ||
        d.reason?.toLowerCase().includes(s)
      );
    }
    if (dateFrom) r = r.filter(d => new Date(d.created_at) >= new Date(dateFrom));
    if (dateTo) r = r.filter(d => new Date(d.created_at) <= new Date(dateTo + 'T23:59:59'));
    return r;
  }, [disputes, statusFilter, debouncedSearch, dateFrom, dateTo]);

  const stats = useMemo(() => ({
    total: disputes.length,
    pending: disputes.filter(d => d.status === 'pending' || d.status === 'routed_to_trader').length,
    in_progress: disputes.filter(d => d.status === 'trader_accepted' || d.status === 'under_review').length,
    resolved: disputes.filter(d => d.status === 'admin_approved' || d.status === 'resolved').length,
    rejected: disputes.filter(d => d.status === 'admin_rejected' || d.status === 'trader_rejected').length,
  }), [disputes]);

  const handleCreateDispute = async (formData, evidence) => {
    // Modal now handles the API call directly
    // This callback is for post-creation activities
    try {
      // Log activity
      await logMerchantActivity(MERCHANT_ACTIONS.DISPUTE_CREATED, {
        entityType: 'dispute',
        entityId: formData.disputeId,
        details: {
          dispute_id: formData.disputeId,
          amount: Number(formData.amount),
          type: formData.type,
          reason: formData.reason,
          upi_id: formData.upiId,
          order_id: formData.orderId,
        }
      });
      
      // Refresh disputes list
      fetchDisputes(true);
      setShowModal(false);
      setToast({ type: 'success', message: 'Dispute filed successfully! We\'ll notify you of updates.' });
    } catch (error) {
      console.error('Post-dispute logging error:', error);
    }
  };

  const handleExport = () => {
    const csv = [
      ['Dispute ID', 'Transaction', 'Amount', 'Type', 'Status', 'Reason', 'Created'],
      ...filtered.map(d => [
        d.dispute_id || '',
        d.transaction_id || d.utr || '',
        d.amount || 0,
        d.type || '',
        d.status || '',
        `"${(d.reason || '').replace(/"/g, '""')}"`,
        new Date(d.created_at).toLocaleString(),
      ])
    ].map(r => r.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `disputes-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <LoadingSpinner message="Loading disputes…" color="orange" />;
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Toast */}
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* Modals */}
      {selectedDispute && <DisputeDetailsModal dispute={selectedDispute} onClose={() => setSelectedDispute(null)} />}
      {showModal && <CreateDisputeModal onClose={() => setShowModal(false)} onSubmit={handleCreateDispute} />}

      {/* Desktop header */}
      <div className="hidden sm:flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl shadow-sm">
              <AlertCircle className="w-5 h-5 text-white" />
            </div>
            Disputes
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 ml-11">Manage transaction disputes</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => fetchDisputes(true)} disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-200 text-sm font-semibold disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-xl hover:bg-orange-700 text-sm font-semibold">
            <Plus className="w-4 h-4" /> File Dispute
          </button>
        </div>
      </div>

      {/* Mobile buttons */}
      <div className="flex sm:hidden justify-between items-center">
        <button onClick={() => fetchDisputes(true)} disabled={refreshing}
          className="p-2 bg-slate-100 border border-slate-200 rounded-xl hover:bg-slate-200 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 text-slate-600 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-xl hover:bg-orange-700 text-sm font-semibold active:scale-[0.96]">
          <Plus className="w-4 h-4" /> File Dispute
        </button>
      </div>

      {/* Summary card */}
      {stats.pending > 0 && (
        <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-2xl p-4 text-white shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-orange-100 text-xs font-semibold uppercase tracking-wide">Pending Resolution</p>
              <p className="text-2xl font-bold">{stats.pending} dispute{stats.pending !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>
      )}

      {/* Status pills */}
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {[
          { label: 'All', value: stats.total, color: 'bg-slate-100 text-slate-700', key: 'all' },
          { label: 'Pending', value: stats.pending, color: 'bg-yellow-100 text-yellow-700', key: 'pending' },
          { label: 'In Progress', value: stats.in_progress, color: 'bg-blue-100 text-blue-700', key: 'in_progress' },
          { label: 'Resolved', value: stats.resolved, color: 'bg-green-100 text-green-700', key: 'resolved' },
          { label: 'Rejected', value: stats.rejected, color: 'bg-red-100 text-red-700', key: 'rejected' },
        ].map(pill => (
          <button key={pill.key} onClick={() => setStatusFilter(pill.key === 'in_progress' ? 'trader_accepted' : pill.key === 'resolved' ? 'admin_approved' : pill.key === 'rejected' ? 'admin_rejected' : pill.key)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              statusFilter === pill.key || 
              (pill.key === 'in_progress' && statusFilter === 'trader_accepted') ||
              (pill.key === 'resolved' && statusFilter === 'admin_approved') ||
              (pill.key === 'rejected' && statusFilter === 'admin_rejected')
                ? `${pill.color} shadow-sm` 
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}>
            {pill.label}
            <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${
              statusFilter === pill.key ||
              (pill.key === 'in_progress' && statusFilter === 'trader_accepted') ||
              (pill.key === 'resolved' && statusFilter === 'admin_approved') ||
              (pill.key === 'rejected' && statusFilter === 'admin_rejected')
                ? 'bg-white/60' 
                : 'bg-slate-200 text-slate-600'
            }`}>
              {pill.value}
            </span>
          </button>
        ))}
      </div>

      {/* Search + filters + export */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search disputes, UTR, reason…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent bg-white"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`w-10 h-10 flex items-center justify-center rounded-xl border flex-shrink-0 ${
            showFilters ? 'bg-orange-50 border-orange-300 text-orange-600' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
          }`}
        >
          <Filter className="w-4 h-4" />
        </button>
        <button
          onClick={handleExport}
          className="w-10 h-10 flex items-center justify-center bg-slate-100 border border-slate-200 rounded-xl hover:bg-slate-200 active:bg-slate-300 flex-shrink-0"
        >
          <Download className="w-4 h-4 text-slate-600" />
        </button>
      </div>

      {/* Expanded filters */}
      {showFilters && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> From
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-orange-400"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> To
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-orange-400"
              />
            </div>
          </div>
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }} 
              className="text-xs text-orange-600 font-semibold flex items-center gap-1 hover:text-orange-700">
              <X className="w-3 h-3" /> Clear filters
            </button>
          )}
        </div>
      )}

      {/* Cards */}
      {filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map(d => (
            <DisputeCard 
              key={d.id} 
              dispute={d} 
              onViewDetails={setSelectedDispute}
              isNew={newDisputeIds.has(d.id)}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <AlertCircle className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-semibold mb-1">No disputes found</p>
          <p className="text-xs text-slate-400">
            {statusFilter !== 'all' || search || dateFrom || dateTo ? 'Try adjusting your filters' : 'File a dispute if you have an issue with a transaction'}
          </p>
        </div>
      )}
    </div>
  );
}
