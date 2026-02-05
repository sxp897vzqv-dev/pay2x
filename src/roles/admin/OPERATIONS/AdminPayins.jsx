import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '../../../supabase';
import { useRealtimeSubscription } from '../../../hooks/useRealtimeSubscription';
import { useSearchParams } from 'react-router-dom';
import {
  TrendingUp, Filter, Download, RefreshCw, Calendar, X, AlertTriangle,
} from 'lucide-react';

// Shared components
import { Toast, FilterPills, DatePresetPills, SearchInput, CardSkeleton } from '../../../components/admin';

// Extracted components
import PayinCard from './components/PayinCard';

const BATCH_SIZE = 100;

/* ─── Main Component ─── */
export default function AdminPayins() {
  const [searchParams] = useSearchParams();
  const [payins, setPayins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalFetched, setTotalFetched] = useState(0);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState('newest');
  const [expandedId, setExpandedId] = useState(null);
  const [toast, setToast] = useState(null);
  const [datePreset, setDatePreset] = useState('all');

  const traderFilter = searchParams.get('trader');

  // Fetch payins
  const fetchPayins = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPayins([]);
    setHasMore(true);
    setTotalFetched(0);

    try {
      let q = supabase
        .from('payins')
        .select('*')
        .order('created_at', { ascending: false })
        .range(0, BATCH_SIZE - 1);

      if (traderFilter) {
        q = q.eq('trader_id', traderFilter);
      }

      const { data, error: fetchError } = await q;
      if (fetchError) throw fetchError;

      setPayins(data || []);
      setTotalFetched((data || []).length);
      setHasMore((data || []).length >= BATCH_SIZE);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, [traderFilter]);

  useEffect(() => {
    fetchPayins();
  }, [fetchPayins]);

  // Realtime: auto-refresh on any payins change
  useRealtimeSubscription('payins', () => fetchPayins());

  // Load more (offset-based pagination)
  const loadMorePayins = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      let q = supabase
        .from('payins')
        .select('*')
        .order('created_at', { ascending: false })
        .range(totalFetched, totalFetched + BATCH_SIZE - 1);

      if (traderFilter) {
        q = q.eq('trader_id', traderFilter);
      }

      const { data, error: fetchError } = await q;
      if (fetchError) throw fetchError;

      const newPayins = data || [];
      setPayins(prev => [...prev, ...newPayins]);
      setTotalFetched(prev => prev + newPayins.length);
      setHasMore(newPayins.length >= BATCH_SIZE);
    } catch (err) {
      setToast({ msg: 'Failed to load more: ' + err.message, success: false });
    }
    setLoadingMore(false);
  };

  // Filter and sort
  const filtered = useMemo(() => {
    let result = payins;
    
    if (statusFilter !== 'all') {
      result = result.filter(p => p.status === statusFilter);
    }
    
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(p => 
        p.txn_id?.toLowerCase().includes(s) || 
        p.utr?.toLowerCase().includes(s) || 
        p.trader_id?.toLowerCase().includes(s) ||
        p.assigned_upi?.toLowerCase().includes(s) ||
        p.merchant_id?.toLowerCase().includes(s)
      );
    }
    
    if (dateFrom) {
      const fromTs = new Date(dateFrom).getTime();
      result = result.filter(p => p.created_at ? new Date(p.created_at).getTime() >= fromTs : false);
    }
    if (dateTo) {
      const toTs = new Date(dateTo).getTime() + 86399999;
      result = result.filter(p => p.created_at ? new Date(p.created_at).getTime() <= toTs : false);
    }

    result = [...result].sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      switch (sortBy) {
        case 'newest': return timeB - timeA;
        case 'oldest': return timeA - timeB;
        case 'amount-high': return (Number(b.amount) || 0) - (Number(a.amount) || 0);
        case 'amount-low': return (Number(a.amount) || 0) - (Number(b.amount) || 0);
        default: return 0;
      }
    });

    return result;
  }, [payins, statusFilter, search, dateFrom, dateTo, sortBy]);

  // Stats
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    const all = {
      total: payins.length,
      pending: payins.filter(p => p.status === 'pending').length,
      completed: payins.filter(p => p.status === 'completed').length,
      rejected: payins.filter(p => p.status === 'rejected').length,
      expired: payins.filter(p => p.status === 'expired' || p.status === 'failed').length,
      totalAmount: payins.filter(p => p.status === 'completed').reduce((s, p) => s + (Number(p.amount) || 0), 0),
    };

    const todayPayins = payins.filter(p => p.created_at ? new Date(p.created_at).getTime() >= todayMs : false);
    const todayStats = {
      total: todayPayins.length,
      completed: todayPayins.filter(p => p.status === 'completed').length,
      amount: todayPayins.filter(p => p.status === 'completed').reduce((s, p) => s + (Number(p.amount) || 0), 0),
    };

    const filteredStats = {
      total: filtered.length,
      amount: filtered.filter(p => p.status === 'completed').reduce((s, p) => s + (Number(p.amount) || 0), 0),
    };

    return { all, today: todayStats, filtered: filteredStats };
  }, [payins, filtered]);

  // Date preset handler
  const handleDatePreset = (preset) => {
    setDatePreset(preset);
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    switch (preset) {
      case 'today':
        setDateFrom(todayStr);
        setDateTo(todayStr);
        break;
      case 'week':
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        setDateFrom(weekAgo.toISOString().split('T')[0]);
        setDateTo(todayStr);
        break;
      case 'month':
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        setDateFrom(monthAgo.toISOString().split('T')[0]);
        setDateTo(todayStr);
        break;
      default:
        setDateFrom('');
        setDateTo('');
    }
  };

  // CSV Export
  const handleExport = () => {
    const escapeCSV = (val) => {
      const str = String(val ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csv = [
      ['ID', 'Transaction ID', 'Amount', 'Status', 'Trader ID', 'Assigned UPI', 'UTR', 'Merchant', 'Created At', 'Completed At'],
      ...filtered.map(p => [
        p.id, p.txn_id || '', Number(p.amount) || 0, p.status || '', p.trader_id || '',
        p.assigned_upi || '', p.utr || '', p.merchant_id || '',
        p.created_at || '',
        p.completed_at || '',
      ].map(escapeCSV))
    ].map(r => r.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payins-${dateFrom || 'all'}-${dateTo || 'all'}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRefresh = () => {
    fetchPayins();
  };

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setDateFrom('');
    setDateTo('');
    setSortBy('newest');
    setDatePreset('all');
  };

  const hasActiveFilters = search || statusFilter !== 'all' || dateFrom || dateTo;

  // Filter pills config
  const filterPills = [
    { label: 'All', value: stats.all.total, key: 'all', activeBg: 'bg-slate-200', activeText: 'text-slate-800' },
    { label: 'Pending', value: stats.all.pending, key: 'pending', activeBg: 'bg-amber-100', activeText: 'text-amber-700' },
    { label: 'Completed', value: stats.all.completed, key: 'completed', activeBg: 'bg-green-100', activeText: 'text-green-700' },
    { label: 'Rejected', value: stats.all.rejected, key: 'rejected', activeBg: 'bg-red-100', activeText: 'text-red-700' },
    { label: 'Expired', value: stats.all.expired, key: 'expired', activeBg: 'bg-slate-200', activeText: 'text-slate-600' },
  ];

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-sm">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Payins</h1>
            <p className="text-slate-500 text-xs sm:text-sm hidden sm:block">All incoming payments</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleRefresh} className="p-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 text-sm font-semibold">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* Stats Strip */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl p-4 text-white">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-green-200 text-xs font-semibold">Today's Volume</p>
            <p className="text-xl sm:text-2xl font-bold">₹{stats.today.amount.toLocaleString()}</p>
            <p className="text-green-200 text-xs">{stats.today.completed} completed</p>
          </div>
          <div>
            <p className="text-green-200 text-xs font-semibold">All Time</p>
            <p className="text-xl sm:text-2xl font-bold">₹{stats.all.totalAmount.toLocaleString()}</p>
            <p className="text-green-200 text-xs">{stats.all.completed} completed</p>
          </div>
          <div>
            <p className="text-green-200 text-xs font-semibold">Pending</p>
            <p className="text-xl sm:text-2xl font-bold">{stats.all.pending}</p>
            <p className="text-green-200 text-xs">awaiting action</p>
          </div>
          <div>
            <p className="text-green-200 text-xs font-semibold">
              {hasActiveFilters ? 'Filtered Results' : 'Total Payins'}
            </p>
            <p className="text-xl sm:text-2xl font-bold">
              {hasActiveFilters ? stats.filtered.total : stats.all.total}
            </p>
            {hasActiveFilters && (
              <p className="text-green-200 text-xs">₹{stats.filtered.amount.toLocaleString()}</p>
            )}
          </div>
        </div>
      </div>

      {/* Filter Pills */}
      <FilterPills 
        pills={filterPills} 
        activeKey={statusFilter} 
        onChange={setStatusFilter} 
      />

      {/* Date Presets */}
      <div className="flex flex-wrap gap-2 items-center">
        <DatePresetPills activePreset={datePreset} onChange={handleDatePreset} />
        {hasActiveFilters && (
          <button onClick={clearFilters} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 flex items-center gap-1">
            <X className="w-3 h-3" /> Clear All
          </button>
        )}
      </div>

      {/* Search + Sort + Filter */}
      <div className="flex gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search ID, UTR, trader, UPI..."
          accentColor="green"
          className="flex-1"
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="amount-high">Amount: High</option>
          <option value="amount-low">Amount: Low</option>
        </select>
        <button onClick={() => setShowFilters(!showFilters)}
          className={`w-10 h-10 flex items-center justify-center rounded-xl border flex-shrink-0 ${showFilters ? 'bg-green-50 border-green-300 text-green-600' : 'bg-white border-slate-200 text-slate-500'}`}>
          <Filter className="w-4 h-4" />
        </button>
      </div>

      {/* Advanced Filters */}
      {showFilters && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">
              <Calendar className="w-3 h-3 inline mr-1" />From Date
            </label>
            <input 
              type="date" 
              value={dateFrom} 
              onChange={e => { setDateFrom(e.target.value); setDatePreset(''); }}
              className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-green-400" 
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">
              <Calendar className="w-3 h-3 inline mr-1" />To Date
            </label>
            <input 
              type="date" 
              value={dateTo} 
              onChange={e => { setDateTo(e.target.value); setDatePreset(''); }}
              className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-green-400" 
            />
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-red-700">Failed to load payins</p>
            <p className="text-sm text-red-600">{error}</p>
          </div>
          <button onClick={handleRefresh} className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm font-semibold hover:bg-red-200">
            Retry
          </button>
        </div>
      )}

      {/* Cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <CardSkeleton count={6} />
        </div>
      ) : filtered.length > 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(payin => (
              <PayinCard 
                key={payin.id} 
                payin={payin} 
                expanded={expandedId === payin.id}
                onExpand={(id) => setExpandedId(expandedId === id ? null : id)}
              />
            ))}
          </div>
          
          {hasMore && (
            <div className="text-center pt-2">
              <button
                onClick={loadMorePayins}
                disabled={loadingMore}
                className="px-6 py-2.5 bg-green-50 text-green-700 rounded-xl text-sm font-semibold hover:bg-green-100 border border-green-200 disabled:opacity-50"
              >
                {loadingMore ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
          
          <p className="text-center text-xs text-slate-400">
            Showing {filtered.length} payins{hasMore ? ' (more available)' : ''}
          </p>
        </>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <TrendingUp className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No payins found</p>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="mt-2 text-sm text-green-600 hover:underline">
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
