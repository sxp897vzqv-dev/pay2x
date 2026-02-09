import React, { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "../../supabase";
import { useRealtimeSubscription } from "../../hooks/useRealtimeSubscription";
import {
  TrendingUp, Search, Download, Filter, X, CheckCircle, XCircle, Clock,
  AlertCircle, Calendar, Hash, User, CreditCard, Smartphone,
  RefreshCw, Copy, MoreHorizontal, Eye, ArrowRight,
} from "lucide-react";
import { Toast } from '../../components/admin';

/* ─── Payin Card ─── */
function PayinCard({ payin, onViewWebhook, isNew }) {
  const [copied, setCopied] = useState(false);

  const statusColors = {
    completed: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', icon: CheckCircle },
    pending: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', icon: Clock },
    rejected: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: XCircle },
    failed: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: XCircle },
  };

  const status = statusColors[payin.status] || statusColors.pending;
  const StatusIcon = status.icon;

  const copyText = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden transition-all ${isNew ? 'ring-2 ring-purple-400 ring-offset-2' : ''}`}>
      <div className={`h-1 ${payin.status === 'completed' ? 'bg-green-500' : payin.status === 'rejected' || payin.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500'}`} />
      <div className="p-3 space-y-3">

        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 mb-0.5">Order ID</p>
            <div className="flex items-center gap-1.5">
              <p className="font-mono text-sm font-bold text-slate-900 truncate bg-slate-50 px-2 py-1 rounded-lg inline-block" style={{ fontFamily: 'var(--font-mono)' }}>
                {payin.order_id || payin.id?.slice(-8)}
              </p>
              <button onClick={() => copyText(payin.order_id || payin.id)} className="p-1 hover:bg-slate-100 rounded">
                {copied ? <CheckCircle className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${status.bg} ${status.border} ${status.text} flex items-center gap-1 border`}>
              <StatusIcon className="w-3 h-3" />
              {payin.status?.toUpperCase()}
            </span>
            <button onClick={() => onViewWebhook(payin)} className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg">
              <Eye className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
            <div className="flex items-center gap-1 mb-1">
              <User className="w-3 h-3 text-purple-600" />
              <p className="text-xs font-bold text-slate-400 uppercase">Customer</p>
            </div>
            <p className="text-xs font-bold text-slate-800 truncate" style={{ fontFamily: 'var(--font-mono)' }}>
              {payin.customer_id || payin.user_id || 'N/A'}
            </p>
          </div>

          <div className="bg-green-50 rounded-lg p-2.5 border border-green-200">
            <div className="flex items-center gap-1 mb-1">
              <CreditCard className="w-3 h-3 text-green-600" />
              <p className="text-xs font-bold text-slate-600 uppercase">Amount</p>
            </div>
            <p className="text-base font-bold text-green-700">₹{payin.amount?.toLocaleString()}</p>
          </div>

          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
            <div className="flex items-center gap-1 mb-1">
              <Smartphone className="w-3 h-3 text-blue-600" />
              <p className="text-xs font-bold text-slate-400 uppercase">Method</p>
            </div>
            <p className="text-xs font-semibold text-slate-800 capitalize">{payin.payment_method || 'UPI'}</p>
          </div>

          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
            <div className="flex items-center gap-1 mb-1">
              <Hash className="w-3 h-3 text-indigo-600" />
              <p className="text-xs font-bold text-slate-400 uppercase">UTR</p>
            </div>
            <p className="text-xs font-bold text-slate-800 truncate" style={{ fontFamily: 'var(--font-mono)' }}>
              {payin.utr || 'Pending'}
            </p>
          </div>
        </div>

        {/* Webhook status */}
        {payin.webhook_status && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${
            payin.webhook_status === 'delivered' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
            payin.webhook_status === 'failed' ? 'bg-red-50 text-red-700 border border-red-200' :
            'bg-yellow-50 text-yellow-700 border border-yellow-200'
          }`}>
            <AlertCircle className="w-3.5 h-3.5" />
            Webhook: {payin.webhook_status?.toUpperCase()}
          </div>
        )}

        {/* Timestamp */}
        <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-100">
          <div className="flex items-center gap-1">
            <Clock size={11} />
            {payin.created_at ? new Date(payin.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
          </div>
          {payin.upi_id && (
            <span className="font-mono text-slate-600">UPI: {payin.upi_id}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Transaction Details Modal ─── */
function TransactionModal({ payin, onClose }) {
  if (!payin) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-2xl bg-white shadow-2xl rounded-t-2xl sm:rounded-2xl overflow-hidden mt-auto sm:mt-0 max-h-[85vh] flex flex-col">
        {/* Handle */}
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 bg-slate-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900">Transaction Details</h3>
            <p className="text-xs text-slate-400" style={{ fontFamily: 'var(--font-mono)' }}>
              {payin.order_id}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Summary */}
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Amount</p>
                <p className="font-bold text-green-700 text-lg">₹{payin.amount?.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Status</p>
                <p className="font-bold text-slate-900 capitalize">{payin.status}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Customer ID</p>
                <p className="font-mono text-xs text-slate-800" style={{ fontFamily: 'var(--font-mono)' }}>
                  {payin.customer_id || payin.user_id || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5">UPI ID</p>
                <p className="text-xs font-semibold text-slate-800">{payin.upi_id || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5">UTR</p>
                <p className="font-mono text-xs text-slate-800" style={{ fontFamily: 'var(--font-mono)' }}>
                  {payin.utr || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Created</p>
                <p className="text-xs text-slate-700">
                  {payin.created_at ? new Date(payin.created_at).toLocaleString('en-IN') : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Webhook Info */}
          <div>
            <h4 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
              <div className="w-1.5 h-4 bg-blue-500 rounded-full" />
              Webhook Delivery
            </h4>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Status:</span>
                <span className="font-bold text-blue-900 capitalize">{payin.webhook_status || 'Pending'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Attempts:</span>
                <span className="font-bold text-blue-900">{payin.webhook_attempts || 0}</span>
              </div>
            </div>
          </div>

          {/* Raw Payload */}
          <div>
            <h4 className="text-sm font-bold text-slate-900 mb-2">Webhook Payload</h4>
            <pre className="bg-slate-900 text-green-400 p-3 rounded-xl text-xs overflow-x-auto" style={{ fontFamily: 'var(--font-mono)' }}>
{JSON.stringify({
  event: payin.status === 'completed' ? 'payment.completed' : 'payment.pending',
  order_id: payin.order_id,
  utr: payin.utr,
  amount: payin.amount,
  status: payin.status,
  customer_id: payin.customer_id,
  upi_id: payin.upi_id,
  timestamp: new Date(payin.created_at).getTime(),
}, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Component ─── */
export default function MerchantPayin() {
  const [payins, setPayins] = useState([]);
  const [merchantId, setMerchantId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedPayin, setSelectedPayin] = useState(null);
  const [toast, setToast] = useState(null);
  const [newPayinIds, setNewPayinIds] = useState(new Set());

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch payins
  const fetchPayins = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); setRefreshing(false); return; }

    try {
      const { data: merchant } = await supabase.from('merchants').select('id').eq('profile_id', user.id).single();
      if (!merchant) { setLoading(false); setRefreshing(false); return; }

      setMerchantId(merchant.id);

      const { data } = await supabase
        .from('payins')
        .select('*')
        .eq('merchant_id', merchant.id)
        .order('created_at', { ascending: false })
        .limit(200);

      setPayins(data || []);
    } catch (error) {
      console.error("Error fetching payins:", error);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  // Initial fetch
  useEffect(() => { fetchPayins(); }, [fetchPayins]);

  // Real-time subscription (like Admin)
  useRealtimeSubscription('payins', {
    filter: merchantId ? `merchant_id=eq.${merchantId}` : undefined,
    onInsert: (newPayin) => {
      setPayins(prev => [newPayin, ...prev]);
      setNewPayinIds(prev => new Set([...prev, newPayin.id]));
      setToast({ type: 'success', message: `New payin: ₹${newPayin.amount?.toLocaleString()}` });
      // Clear highlight after 5s
      setTimeout(() => {
        setNewPayinIds(prev => {
          const next = new Set(prev);
          next.delete(newPayin.id);
          return next;
        });
      }, 5000);
    },
    onUpdate: (updated) => {
      setPayins(prev => prev.map(p => p.id === updated.id ? updated : p));
      if (updated.status === 'completed') {
        setToast({ type: 'success', message: `Payin completed: ₹${updated.amount?.toLocaleString()}` });
      }
    },
  });

  const filtered = useMemo(() => {
    let r = payins;
    if (statusFilter !== "all") r = r.filter(p => p.status === statusFilter);
    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase();
      r = r.filter(p => 
        p.order_id?.toLowerCase().includes(s) || 
        p.customer_id?.toLowerCase().includes(s) || 
        p.utr?.toLowerCase().includes(s) ||
        p.upi_id?.toLowerCase().includes(s)
      );
    }
    if (dateFrom) r = r.filter(p => new Date(p.created_at) >= new Date(dateFrom));
    if (dateTo) r = r.filter(p => new Date(p.created_at) <= new Date(dateTo + 'T23:59:59'));
    return r;
  }, [payins, statusFilter, debouncedSearch, dateFrom, dateTo]);

  const stats = useMemo(() => ({
    total: payins.length,
    success: payins.filter(p => p.status === 'completed').length,
    pending: payins.filter(p => p.status === 'pending').length,
    failed: payins.filter(p => p.status === 'rejected' || p.status === 'failed').length,
  }), [payins]);

  const handleExport = () => {
    const csv = [
      ['Order ID', 'Customer ID', 'Amount', 'Status', 'UPI ID', 'UTR', 'Timestamp'],
      ...filtered.map(p => [
        p.order_id || '',
        p.customer_id || '',
        p.amount || 0,
        p.status || '',
        p.upi_id || '',
        p.utr || '',
        new Date(p.created_at).toLocaleString(),
      ])
    ].map(r => r.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payins-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm font-medium">Loading payins…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Toast */}
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* Modal */}
      {selectedPayin && <TransactionModal payin={selectedPayin} onClose={() => setSelectedPayin(null)} />}

      {/* Desktop header */}
      <div className="hidden sm:flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-sm">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            Payins
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 ml-11">Monitor incoming payments</p>
        </div>
        <button onClick={() => fetchPayins(true)} disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors text-sm font-semibold disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Mobile refresh */}
      <div className="flex sm:hidden justify-end">
        <button onClick={() => fetchPayins(true)} disabled={refreshing}
          className="p-2 bg-purple-50 border border-purple-200 rounded-xl hover:bg-purple-100 active:bg-purple-200 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 text-purple-600 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Status pills */}
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {[
          { label: 'All', value: stats.total, color: 'bg-slate-100 text-slate-700', key: 'all' },
          { label: 'Completed', value: stats.success, color: 'bg-green-100 text-green-700', key: 'completed' },
          { label: 'Pending', value: stats.pending, color: 'bg-yellow-100 text-yellow-700', key: 'pending' },
          { label: 'Rejected', value: stats.failed, color: 'bg-red-100 text-red-700', key: 'rejected' },
        ].map(pill => (
          <button
            key={pill.key}
            onClick={() => setStatusFilter(pill.key)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              statusFilter === pill.key ? `${pill.color} shadow-sm` : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            {pill.label}
            <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${statusFilter === pill.key ? 'bg-white/60' : 'bg-slate-200 text-slate-600'}`}>
              {pill.value}
            </span>
          </button>
        ))}
      </div>

      {/* Search + filter toggle + export */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search order, customer, UTR…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent bg-white"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`w-10 h-10 flex items-center justify-center rounded-xl border flex-shrink-0 ${
            showFilters ? 'bg-purple-50 border-purple-300 text-purple-600' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
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
                className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-purple-400"
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
                className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-purple-400"
              />
            </div>
          </div>
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }} 
              className="text-xs text-purple-600 font-semibold flex items-center gap-1 hover:text-purple-700">
              <X className="w-3 h-3" /> Clear filters
            </button>
          )}
        </div>
      )}

      {/* Cards */}
      {filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map(p => (
            <PayinCard key={p.id} payin={p} onViewWebhook={setSelectedPayin} isNew={newPayinIds.has(p.id)} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <TrendingUp className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-semibold mb-1">No payins found</p>
          <p className="text-slate-400 text-sm">
            {search || statusFilter !== 'all' ? 'Try adjusting your filters' : 'Payins will appear here when received'}
          </p>
        </div>
      )}
    </div>
  );
}
