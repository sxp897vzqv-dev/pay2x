import React, { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "../../../supabase";
import { useRealtimeSubscription } from "../../../hooks/useRealtimeSubscription";
import {
  TrendingUp, Search, Download, Filter, X, CheckCircle, XCircle, Clock,
  AlertCircle, Calendar, Hash, User, CreditCard, Smartphone,
  RefreshCw, Copy, Eye, ChevronDown, ChevronUp,
} from "lucide-react";
import { Toast } from '../../../components/admin';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';

/* ─── Time Ago Helper ─── */
function timeAgo(dateStr) {
  if (!dateStr) return null;
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/* ─── Payin Card ─── */
function PayinCard({ payin, onViewWebhook, isNew }) {
  const [copied, setCopied] = useState('');
  const [expanded, setExpanded] = useState(false);

  const statusColors = {
    completed: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', stripe: 'bg-green-500', icon: CheckCircle },
    pending: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', stripe: 'bg-yellow-500', icon: Clock },
    rejected: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', stripe: 'bg-red-500', icon: XCircle },
    failed: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', stripe: 'bg-red-500', icon: XCircle },
    expired: { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-600', stripe: 'bg-slate-400', icon: Clock },
  };

  const status = statusColors[payin.status] || statusColors.pending;
  const StatusIcon = status.icon;

  const copyText = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  };

  // Calculate net amount (amount - commission)
  const commission = Number(payin.commission) || 0;
  const netAmount = Number(payin.amount) - commission;

  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden transition-all ${isNew ? 'ring-2 ring-purple-400 ring-offset-2' : ''}`}>
      <div className={`h-1 ${status.stripe}`} />
      <div className="p-3">
        {/* Header Row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <p className="font-mono text-xs text-slate-400">{payin.txn_id || payin.id?.slice(0, 12) || '—'}</p>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs text-slate-500">{timeAgo(payin.created_at)}</span>
            </div>
            <p className="text-lg font-bold text-green-600">₹{(Number(payin.amount) || 0).toLocaleString()}</p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${status.bg} ${status.border} ${status.text} flex items-center gap-1 border`}>
              <StatusIcon className="w-3 h-3" />
              {payin.status?.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Quick Info Grid */}
        <div className="grid grid-cols-2 gap-2 mb-2 text-xs">
          <div className="flex items-center gap-1.5 text-slate-600 bg-slate-50 px-2 py-1.5 rounded-lg">
            <Hash className="w-3 h-3 text-slate-400" />
            <span className="truncate font-medium">{payin.order_id || 'No Order ID'}</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-600 bg-slate-50 px-2 py-1.5 rounded-lg">
            <CreditCard className="w-3 h-3 text-slate-400" />
            <span className="truncate font-mono">{payin.upi_id || 'N/A'}</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-600 bg-slate-50 px-2 py-1.5 rounded-lg">
            <User className="w-3 h-3 text-slate-400" />
            <span className="truncate">{payin.holder_name || payin.customer_id || payin.user_id || 'N/A'}</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-600 bg-slate-50 px-2 py-1.5 rounded-lg">
            <Smartphone className="w-3 h-3 text-slate-400" />
            <span className="truncate font-mono">{payin.utr || 'Pending UTR'}</span>
          </div>
        </div>

        {/* Commission & Net Amount (if completed) */}
        {payin.status === 'completed' && commission > 0 && (
          <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-2">
            <div className="text-xs">
              <span className="text-slate-500">Amount: </span>
              <span className="font-bold text-slate-700">₹{Number(payin.amount).toLocaleString()}</span>
              <span className="text-slate-400 mx-1">−</span>
              <span className="text-slate-500">Fee: </span>
              <span className="font-bold text-orange-600">₹{commission.toLocaleString()}</span>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">You Received</p>
              <p className="text-sm font-bold text-green-700">₹{netAmount.toLocaleString()}</p>
            </div>
          </div>
        )}

        {/* Expand/Collapse Button */}
        <button 
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-1 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
        >
          {expanded ? 'Hide Details' : 'Show Details'}
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {/* Expanded Details */}
        {expanded && (
          <div className="border-t border-slate-100 pt-2 mt-2 space-y-2">
            <div className="bg-slate-50 rounded-lg p-2 text-xs space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Payment ID</span>
                <button onClick={() => copyText(payin.id, 'id')} className="font-mono text-slate-700 hover:text-purple-600 flex items-center gap-1">
                  {payin.id?.slice(0, 16)}... {copied === 'id' ? <CheckCircle className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
              {payin.txn_id && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Transaction ID</span>
                  <button onClick={() => copyText(payin.txn_id, 'txn')} className="font-mono text-slate-700 hover:text-purple-600 flex items-center gap-1">
                    {payin.txn_id} {copied === 'txn' ? <CheckCircle className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Order ID</span>
                <button onClick={() => copyText(payin.order_id || payin.id, 'order')} className="font-mono text-slate-700 hover:text-purple-600 flex items-center gap-1">
                  {payin.order_id || '—'} {copied === 'order' ? <CheckCircle className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Customer ID</span>
                <span className="font-mono text-slate-700">{payin.customer_id || payin.user_id || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">UPI ID</span>
                <span className="font-mono text-slate-700">{payin.upi_id || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Account Holder</span>
                <span className="text-slate-700">{payin.holder_name || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">UTR / Reference</span>
                <button onClick={() => copyText(payin.utr || '', 'utr')} className="font-mono text-slate-700 hover:text-purple-600 flex items-center gap-1">
                  {payin.utr || '—'} {payin.utr && (copied === 'utr' ? <CheckCircle className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />)}
                </button>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Amount</span>
                <span className="font-bold text-green-600">₹{(Number(payin.amount) || 0).toLocaleString()}</span>
              </div>
              {commission > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Platform Fee</span>
                  <span className="text-orange-600">−₹{commission.toLocaleString()}</span>
                </div>
              )}
              {commission > 0 && (
                <div className="flex justify-between border-t border-slate-200 pt-1 mt-1">
                  <span className="text-slate-600 font-semibold">Net Credited</span>
                  <span className="font-bold text-green-700">₹{netAmount.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between pt-1 border-t border-slate-200 mt-1">
                <span className="text-slate-500">Created</span>
                <span className="text-slate-700">
                  {payin.created_at ? new Date(payin.created_at).toLocaleString('en-IN') : '—'}
                </span>
              </div>
              {payin.completed_at && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Completed</span>
                  <span className="text-green-700">
                    {new Date(payin.completed_at).toLocaleString('en-IN')}
                  </span>
                </div>
              )}
              {payin.webhook_status && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Webhook</span>
                  <span className={`font-semibold ${
                    payin.webhook_status === 'delivered' ? 'text-blue-600' :
                    payin.webhook_status === 'failed' ? 'text-red-600' : 'text-yellow-600'
                  }`}>{payin.webhook_status?.toUpperCase()}</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button 
                onClick={() => onViewWebhook(payin)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-xs font-semibold hover:bg-purple-100"
              >
                <Eye className="w-3.5 h-3.5" /> View Webhook
              </button>
            </div>
          </div>
        )}
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
    if (statusFilter !== "all") {
      if (statusFilter === 'rejected') {
        // Include rejected, failed, and expired in "Rejected" filter
        r = r.filter(p => ['rejected', 'failed', 'expired'].includes(p.status));
      } else {
        r = r.filter(p => p.status === statusFilter);
      }
    }
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
    failed: payins.filter(p => ['rejected', 'failed', 'expired'].includes(p.status)).length,
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
    return <LoadingSpinner message="Loading payins…" color="purple" />;
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
            <div className="p-2 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg shadow-purple-500/20">
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
