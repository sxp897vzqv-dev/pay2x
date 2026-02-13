import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '../../../supabase';
import { useRealtimeSubscription } from '../../../hooks/useRealtimeSubscription';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, Search, RefreshCw, Filter, Calendar, X, Download } from 'lucide-react';

// Shared components
import { Toast, FilterPills, SearchInput, CardSkeleton } from '../../../components/admin';

// Extracted components
import DisputeCard from './components/DisputeCard';

export default function AdminDisputes() {
  const [searchParams] = useSearchParams();
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [toast, setToast] = useState(null);
  const traderFilter = searchParams.get('trader');

  const fetchDisputes = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      let q = supabase
        .from('disputes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (traderFilter) {
        q = q.eq('trader_id', traderFilter);
      }

      const { data, error } = await q;
      if (error) throw error;
      setDisputes(data || []);
    } catch (err) {
      console.error('Disputes fetch error:', err);
    }
    setLoading(false);
    setRefreshing(false);
  }, [traderFilter]);

  useEffect(() => {
    fetchDisputes();
  }, [fetchDisputes]);

  useRealtimeSubscription('disputes', {
    onInsert: () => fetchDisputes(true),
    onUpdate: () => fetchDisputes(true),
  });

  const filtered = useMemo(() => {
    let result = disputes;
    
    // Status filter with proper grouping
    if (statusFilter === 'pending') {
      // Pending = not yet resolved by admin
      result = result.filter(d => ['pending', 'routed_to_trader', 'trader_accepted', 'trader_rejected'].includes(d.status));
    } else if (statusFilter === 'needs_action') {
      // Needs immediate admin decision
      result = result.filter(d => ['trader_accepted', 'trader_rejected'].includes(d.status));
    } else if (statusFilter !== 'all') {
      result = result.filter(d => d.status === statusFilter);
    }
    
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(d =>
        d.id?.toLowerCase().includes(s) ||
        d.dispute_id?.toLowerCase().includes(s) ||
        d.reason?.toLowerCase().includes(s) ||
        d.upi_id?.toLowerCase().includes(s) ||
        d.utr?.toLowerCase().includes(s) ||
        d.trader_id?.toLowerCase().includes(s) ||
        d.merchant_id?.toLowerCase().includes(s) ||
        d.order_id?.toLowerCase().includes(s)
      );
    }
    // Date filters
    if (dateFrom) result = result.filter(d => new Date(d.created_at) >= new Date(dateFrom));
    if (dateTo) result = result.filter(d => new Date(d.created_at) <= new Date(dateTo + 'T23:59:59'));
    return result;
  }, [disputes, statusFilter, search, dateFrom, dateTo]);

  const stats = useMemo(() => ({
    total: disputes.length,
    pending: disputes.filter(d => ['pending', 'routed_to_trader', 'trader_accepted', 'trader_rejected'].includes(d.status)).length,
    needsAction: disputes.filter(d => ['trader_accepted', 'trader_rejected'].includes(d.status)).length,
    approved: disputes.filter(d => d.status === 'admin_approved').length,
    rejected: disputes.filter(d => d.status === 'admin_rejected').length,
  }), [disputes]);

  const handleResolve = async (dispute, decision) => {
    try {
      // Check if trader has responded - use Edge Function for balance adjustments
      if (['trader_accepted', 'trader_rejected'].includes(dispute.status)) {
        // Call Edge Function for proper balance handling
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-resolve-dispute`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({ disputeId: dispute.id, decision }),
          }
        );
        
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to resolve dispute');
        
        setToast({ 
          success: true, 
          msg: result.balanceAdjusted 
            ? `✅ Dispute ${decision}. Balance adjusted ₹${result.adjustmentAmount}` 
            : `✅ Dispute ${decision}` 
        });
      } else {
        // Direct DB update for pending disputes (no trader response yet)
        const newStatus = decision === 'approved' ? 'admin_approved' : 'admin_rejected';
        const { error } = await supabase.from('disputes').update({
          status: newStatus,
          admin_decision: decision,
          admin_resolved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', dispute.id);

        if (error) throw error;
        setToast({ success: true, msg: `✅ Dispute ${decision}` });
      }
      
      fetchDisputes(true);
    } catch (e) {
      console.error('Resolve error:', e);
      setToast({ success: false, msg: e.message || 'Failed to update dispute' });
    }
  };

  const handleExport = () => {
    const csv = [
      ['Dispute ID', 'Merchant', 'Trader', 'Amount', 'Type', 'Status', 'Reason', 'Created'],
      ...filtered.map(d => [
        d.dispute_id || d.id,
        d.merchant_id || '',
        d.trader_id || '',
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

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="hidden sm:flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl shadow-sm">
              <AlertCircle className="w-5 h-5 text-white" />
            </div>
            Disputes
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 ml-11">Resolve merchant disputes</p>
        </div>
        <button onClick={() => fetchDisputes(true)} disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-xl hover:bg-amber-700 text-sm font-semibold disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Summary card */}
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl p-4 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-amber-100 text-xs font-semibold">Pending Resolution</p>
            <p className="text-2xl font-bold">{stats.pending}</p>
          </div>
          {stats.needsAction > 0 && (
            <div className="text-center bg-white/20 rounded-lg px-3 py-1">
              <p className="text-amber-100 text-xs">⚠️ Needs Action</p>
              <p className="text-xl font-bold">{stats.needsAction}</p>
            </div>
          )}
          <div className="text-right">
            <p className="text-amber-100 text-xs">Total</p>
            <p className="text-lg font-bold">{stats.total}</p>
          </div>
        </div>
      </div>

      {/* Status pills */}
      <div className="flex gap-2 overflow-x-auto px-1 py-1 -mx-1" style={{ scrollbarWidth: 'none' }}>
        {[
          { label: 'All', value: stats.total, key: 'all', activeBg: 'bg-slate-200', activeText: 'text-slate-800' },
          { label: 'Pending', value: stats.pending, key: 'pending', activeBg: 'bg-amber-100', activeText: 'text-amber-700' },
          { label: '⚠️ Needs Action', value: stats.needsAction, key: 'needs_action', activeBg: 'bg-orange-100', activeText: 'text-orange-700' },
          { label: 'Approved', value: stats.approved, key: 'admin_approved', activeBg: 'bg-green-100', activeText: 'text-green-700' },
          { label: 'Rejected', value: stats.rejected, key: 'admin_rejected', activeBg: 'bg-red-100', activeText: 'text-red-700' },
        ].map(pill => {
          const isActive = statusFilter === pill.key;
          return (
            <button key={pill.key} onClick={() => setStatusFilter(pill.key)} 
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                isActive ? `${pill.activeBg} ${pill.activeText} shadow-sm` : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}>
              {pill.label}
              <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${isActive ? 'bg-white/70' : 'bg-slate-200 text-slate-600'}`}>
                {pill.value}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search + filters */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input type="text" placeholder="Search dispute, UTR, reason..." value={search} onChange={e => setSearch(e.target.value)} 
            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
        </div>
        <button onClick={() => setShowFilters(!showFilters)}
          className={`w-10 h-10 flex items-center justify-center rounded-xl border flex-shrink-0 ${
            showFilters || dateFrom || dateTo ? 'bg-amber-50 border-amber-300 text-amber-600' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
          }`}>
          <Filter className="w-4 h-4" />
        </button>
        <button onClick={handleExport}
          className="w-10 h-10 flex items-center justify-center bg-slate-100 border border-slate-200 rounded-xl hover:bg-slate-200 flex-shrink-0">
          <Download className="w-4 h-4 text-slate-600" />
        </button>
      </div>

      {/* Date filters */}
      {showFilters && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> From
              </label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-amber-400" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> To
              </label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-amber-400" />
            </div>
          </div>
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }} 
              className="text-xs text-amber-600 font-semibold flex items-center gap-1 hover:text-amber-700">
              <X className="w-3 h-3" /> Clear date filter
            </button>
          )}
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(dispute => (
            <DisputeCard key={dispute.id} dispute={dispute} onResolve={handleResolve} />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <AlertCircle className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No disputes found</p>
          <p className="text-slate-400 text-xs mt-1">
            {search || dateFrom || dateTo || statusFilter !== 'pending' ? 'Try adjusting your filters' : 'All caught up!'}
          </p>
        </div>
      )}
    </div>
  );
}
