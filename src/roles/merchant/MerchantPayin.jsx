import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "../../supabase";
import {
  TrendingUp, Search, Download, Filter, X, CheckCircle, XCircle, Clock,
  AlertCircle, ExternalLink, Calendar, Hash, User, CreditCard, Smartphone,
  RefreshCw, Copy, MoreHorizontal,
} from "lucide-react";

/* ─── Payin Card ─── */
function PayinCard({ payin, onViewWebhook }) {
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
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className={`h-1 ${payin.status === 'completed' ? 'bg-green-500' : payin.status === 'rejected' || payin.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500'}`} />
      <div className="p-3 space-y-3">

        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 mb-0.5">Order ID</p>
            <div className="flex items-center gap-1.5">
              <p className="font-mono text-sm font-bold text-slate-900 truncate bg-slate-50 px-2 py-1 rounded-lg inline-block" style={{ fontFamily: 'var(--font-mono)' }}>
                {payin.orderId || payin.id.slice(-8)}
              </p>
              <button onClick={() => copyText(payin.orderId || payin.id)} className="p-1 hover:bg-slate-100 rounded">
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
              <MoreHorizontal className="w-4 h-4 text-slate-500" />
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
              {payin.userId || 'N/A'}
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
            <p className="text-xs font-semibold text-slate-800 capitalize">{payin.paymentMethod || 'UPI'}</p>
          </div>

          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
            <div className="flex items-center gap-1 mb-1">
              <Hash className="w-3 h-3 text-indigo-600" />
              <p className="text-xs font-bold text-slate-400 uppercase">UTR</p>
            </div>
            <p className="text-xs font-bold text-slate-800 truncate" style={{ fontFamily: 'var(--font-mono)' }}>
              {payin.utrId || 'Pending'}
            </p>
          </div>
        </div>

        {/* Webhook status */}
        {payin.webhookStatus && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${
            payin.webhookStatus === 'delivered' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
            payin.webhookStatus === 'failed' ? 'bg-red-50 text-red-700 border border-red-200' :
            'bg-yellow-50 text-yellow-700 border border-yellow-200'
          }`}>
            <AlertCircle className="w-3.5 h-3.5" />
            Webhook: {payin.webhookStatus?.toUpperCase()}
            {payin.webhookStatus === 'failed' && (
              <button className="ml-auto text-xs text-red-600 underline">Retry</button>
            )}
          </div>
        )}

        {/* Timestamp */}
        <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-100">
          <div className="flex items-center gap-1">
            <Clock size={11} />
            {new Date((payin.requestedAt?.seconds || 0) * 1000).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
          </div>
          {payin.upiId && (
            <span className="font-mono text-slate-600">UPI: {payin.upiId}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Webhook Details Modal ─── */
function WebhookModal({ payin, onClose }) {
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
              {payin.orderId}
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
                <p className="text-xs text-slate-500 mb-0.5">User ID</p>
                <p className="font-mono text-xs text-slate-800" style={{ fontFamily: 'var(--font-mono)' }}>
                  {payin.userId || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5">UPI ID</p>
                <p className="text-xs font-semibold text-slate-800">{payin.upiId || 'N/A'}</p>
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
                <span className="font-bold text-blue-900 capitalize">{payin.webhookStatus || 'Pending'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Attempts:</span>
                <span className="font-bold text-blue-900">{payin.webhookAttempts || 0}</span>
              </div>
              {payin.webhookLastAttempt && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Last Attempt:</span>
                  <span className="text-xs text-slate-700">
                    {new Date(payin.webhookLastAttempt.seconds * 1000).toLocaleString('en-IN')}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Raw Payload */}
          <div>
            <h4 className="text-sm font-bold text-slate-900 mb-2">Webhook Payload</h4>
            <pre className="bg-slate-900 text-green-400 p-3 rounded-xl text-xs overflow-x-auto" style={{ fontFamily: 'var(--font-mono)' }}>
{JSON.stringify({
  event: payin.status === 'completed' ? 'payment.completed' : 'payment.pending',
  orderId: payin.orderId,
  utrId: payin.utrId,
  amount: payin.amount,
  status: payin.status,
  userId: payin.userId,
  upiId: payin.upiId,
  timestamp: payin.requestedAt?.seconds * 1000,
}, null, 2)}
            </pre>
          </div>

          {/* Actions */}
          {payin.webhookStatus === 'failed' && (
            <button className="w-full px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold text-sm flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Retry Webhook
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Main Component ─── */
export default function MerchantPayin() {
  const [payins, setPayins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedPayin, setSelectedPayin] = useState(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const fetchPayins = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      try {
        // Get merchant doc
        const { data: merchant } = await supabase.from('merchants').select('id').eq('id', user.id).single();
        if (!merchant) { setLoading(false); return; }

        const { data } = await supabase
          .from('payins')
          .select('*')
          .eq('merchant_id', merchant.id)
          .order('requested_at', { ascending: false })
          .limit(200);
        setPayins((data || []).map(r => ({
          ...r,
          merchantId: r.merchant_id, traderId: r.trader_id,
          upiId: r.upi_id, utrId: r.utr,
          transactionId: r.transaction_id, userId: r.merchant_id,
          screenshotUrl: r.screenshot_url, orderId: r.order_id,
          requestedAt: r.requested_at ? { seconds: new Date(r.requested_at).getTime() / 1000 } : null,
          completedAt: r.completed_at ? { seconds: new Date(r.completed_at).getTime() / 1000 } : null,
        })));
      } catch (error) {
        console.error("Error fetching payins:", error);
      }
      setLoading(false);
    };
    fetchPayins();
  }, []);

  const filtered = useMemo(() => {
    let r = payins;
    if (statusFilter !== "all") r = r.filter(p => p.status === statusFilter);
    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase();
      r = r.filter(p => 
        p.orderId?.toLowerCase().includes(s) || 
        p.userId?.toLowerCase().includes(s) || 
        p.utrId?.toLowerCase().includes(s) ||
        p.upiId?.toLowerCase().includes(s)
      );
    }
    if (dateFrom) r = r.filter(p => (p.requestedAt?.seconds || 0) * 1000 >= new Date(dateFrom).getTime());
    if (dateTo) r = r.filter(p => (p.requestedAt?.seconds || 0) * 1000 <= new Date(dateTo).getTime() + 86399999);
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
      ['Order ID', 'User ID', 'Amount', 'Status', 'UPI ID', 'UTR', 'Timestamp'],
      ...filtered.map(p => [
        p.orderId || '',
        p.userId || '',
        p.amount || 0,
        p.status || '',
        p.upiId || '',
        p.utrId || '',
        new Date((p.requestedAt?.seconds || 0) * 1000).toLocaleString(),
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
          <RefreshCw className="w-10 h-10 text-green-500 animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm font-medium">Loading payins…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
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
              statusFilter === pill.key ? `${pill.color} ring-2 ring-offset-1 ring-current` : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
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
            placeholder="Search order, customer, txn ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent bg-white"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`w-10 h-10 flex items-center justify-center rounded-xl border flex-shrink-0 ${
            showFilters ? 'bg-green-50 border-green-300 text-green-600' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
          }`}
        >
          <Filter className="w-4 h-4" />
        </button>
        <button
          onClick={handleExport}
          className="w-10 h-10 flex items-center justify-center bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 active:bg-blue-200 flex-shrink-0"
        >
          <Download className="w-4 h-4 text-blue-600" />
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
                className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-green-400"
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
                className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-green-400"
              />
            </div>
          </div>
        </div>
      )}

      {/* Cards */}
      {filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map(p => (
            <PayinCard key={p.id} payin={p} onViewWebhook={setSelectedPayin} />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <TrendingUp className="w-10 h-10 text-slate-200 mx-auto mb-2" />
          <p className="text-slate-500 text-sm font-medium">No payins found</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {statusFilter !== "all" || search || dateFrom || dateTo ? "Try adjusting your filters" : "Payins will appear here"}
          </p>
        </div>
      )}

      {/* Webhook Modal */}
      {selectedPayin && (
        <WebhookModal payin={selectedPayin} onClose={() => setSelectedPayin(null)} />
      )}
    </div>
  );
}