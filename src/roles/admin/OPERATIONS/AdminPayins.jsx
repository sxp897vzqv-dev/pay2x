import React, { useEffect, useState, useMemo } from 'react';
import { db } from '../../../firebase';
import { collection, query, onSnapshot, orderBy, where, Timestamp, getDocs } from 'firebase/firestore';
import { Link, useSearchParams } from 'react-router-dom';
import {
  TrendingUp, Search, Filter, Download, RefreshCw, CheckCircle, XCircle,
  Clock, Eye, User, Calendar, DollarSign, Hash, CreditCard, AlertCircle,
} from 'lucide-react';

/* ─── Payin Card ─── */
function PayinCard({ payin }) {
  const statusStyles = {
    completed: { bg: 'bg-green-100', text: 'text-green-700', stripe: 'bg-green-500' },
    pending: { bg: 'bg-amber-100', text: 'text-amber-700', stripe: 'bg-amber-500' },
    rejected: { bg: 'bg-red-100', text: 'text-red-700', stripe: 'bg-red-500' },
  };
  const style = statusStyles[payin.status] || statusStyles.pending;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className={`h-1 ${style.stripe}`} />
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <p className="font-mono text-xs text-slate-400" style={{ fontFamily: 'var(--font-mono)' }}>{payin.transactionId || payin.id?.slice(0, 12)}</p>
            <p className="text-lg font-bold text-green-600">₹{(payin.amount || 0).toLocaleString()}</p>
          </div>
          <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${style.bg} ${style.text}`}>{payin.status?.toUpperCase()}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-2 text-xs">
          <div className="flex items-center gap-1.5 text-slate-500">
            <User className="w-3 h-3" />
            <span className="truncate">{payin.traderId?.slice(0, 8) || '—'}</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-500">
            <CreditCard className="w-3 h-3" />
            <span className="truncate">{payin.upiId || '—'}</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-500">
            <Hash className="w-3 h-3" />
            <span className="truncate">{payin.utrId || 'No UTR'}</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-500">
            <Clock className="w-3 h-3" />
            <span>{payin.requestedAt?.seconds ? new Date(payin.requestedAt.seconds * 1000).toLocaleDateString('en-IN') : '—'}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <Link to={`/admin/traders/${payin.traderId}`}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-slate-50 text-slate-600 border border-slate-200 rounded-lg text-xs font-semibold hover:bg-slate-100">
            <Eye className="w-3 h-3" /> Trader
          </Link>
          {payin.screenshotUrl && (
            <a href={payin.screenshotUrl} target="_blank" rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg text-xs font-semibold hover:bg-blue-100">
              <Eye className="w-3 h-3" /> Proof
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminPayins() {
  const [searchParams] = useSearchParams();
  const [payins, setPayins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const traderFilter = searchParams.get('trader');

  useEffect(() => {
    let q = query(collection(db, 'payin'), orderBy('requestedAt', 'desc'));
    if (traderFilter) q = query(collection(db, 'payin'), where('traderId', '==', traderFilter), orderBy('requestedAt', 'desc'));

    const unsub = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      setPayins(list);
      setLoading(false);
    });
    return () => unsub();
  }, [traderFilter]);

  const filtered = useMemo(() => {
    let result = payins;
    if (statusFilter !== 'all') result = result.filter(p => p.status === statusFilter);
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(p => p.transactionId?.toLowerCase().includes(s) || p.utrId?.toLowerCase().includes(s) || p.traderId?.toLowerCase().includes(s));
    }
    if (dateFrom) result = result.filter(p => (p.requestedAt?.seconds || 0) * 1000 >= new Date(dateFrom).getTime());
    if (dateTo) result = result.filter(p => (p.requestedAt?.seconds || 0) * 1000 <= new Date(dateTo).getTime() + 86399999);
    return result;
  }, [payins, statusFilter, search, dateFrom, dateTo]);

  const stats = useMemo(() => ({
    total: payins.length,
    pending: payins.filter(p => p.status === 'pending').length,
    completed: payins.filter(p => p.status === 'completed').length,
    rejected: payins.filter(p => p.status === 'rejected').length,
    totalAmount: payins.filter(p => p.status === 'completed').reduce((s, p) => s + (p.amount || 0), 0),
  }), [payins]);

  const handleExport = () => {
    const csv = [
      ['ID', 'Amount', 'Status', 'Trader ID', 'UPI ID', 'UTR', 'Date'],
      ...filtered.map(p => [p.id, p.amount || 0, p.status || '', p.traderId || '', p.upiId || '', p.utrId || '', p.requestedAt?.seconds ? new Date(p.requestedAt.seconds * 1000).toISOString() : '']),
    ].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `payins-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="hidden sm:flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-sm"><TrendingUp className="w-5 h-5 text-white" /></div>
            Payins
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 ml-11">All incoming payments</p>
        </div>
        <button onClick={handleExport} className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 text-sm font-semibold">
          <Download className="w-4 h-4" /> Export
        </button>
      </div>

      {/* Stats strip */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl p-4 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-green-200 text-xs font-semibold">Total Completed</p>
            <p className="text-2xl font-bold">₹{stats.totalAmount.toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p className="text-green-200 text-xs">Pending</p>
            <p className="text-lg font-bold">{stats.pending}</p>
          </div>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {[
          { label: 'All', value: stats.total, key: 'all', color: 'bg-slate-100 text-slate-700' },
          { label: 'Pending', value: stats.pending, key: 'pending', color: 'bg-amber-100 text-amber-700' },
          { label: 'Completed', value: stats.completed, key: 'completed', color: 'bg-green-100 text-green-700' },
          { label: 'Rejected', value: stats.rejected, key: 'rejected', color: 'bg-red-100 text-red-700' },
        ].map(pill => (
          <button key={pill.key} onClick={() => setStatusFilter(pill.key)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              statusFilter === pill.key ? `${pill.color} ring-2 ring-offset-1 ring-current` : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}>
            {pill.label}
            <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${statusFilter === pill.key ? 'bg-white/60' : 'bg-slate-200 text-slate-600'}`}>{pill.value}</span>
          </button>
        ))}
      </div>

      {/* Search + filter */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input type="text" placeholder="Search ID, UTR, trader..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
        </div>
        <button onClick={() => setShowFilters(!showFilters)}
          className={`w-10 h-10 flex items-center justify-center rounded-xl border flex-shrink-0 ${showFilters ? 'bg-green-50 border-green-300 text-green-600' : 'bg-white border-slate-200 text-slate-500'}`}>
          <Filter className="w-4 h-4" />
        </button>
      </div>

      {showFilters && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1"><Calendar className="w-3 h-3 inline mr-1" />From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-green-400" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1"><Calendar className="w-3 h-3 inline mr-1" />To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-green-400" />
          </div>
        </div>
      )}

      {/* Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-12"><RefreshCw className="w-8 h-8 text-green-500 animate-spin" /></div>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.slice(0, 50).map(payin => <PayinCard key={payin.id} payin={payin} />)}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <TrendingUp className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No payins found</p>
        </div>
      )}

      {filtered.length > 50 && (
        <p className="text-center text-xs text-slate-400">Showing first 50 results. Use filters to narrow down.</p>
      )}
    </div>
  );
}