import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../supabase';
import { 
  History, Search, Calendar, Filter, ArrowUpCircle, ArrowDownCircle,
  User, Building, RefreshCw, X
} from 'lucide-react';
import ExportButton from '../../../components/admin/ExportButton';
import { EXPORT_COLUMNS } from '../../../utils/exportUtils';

const REASONS = [
  { value: 'all', label: 'All Reasons' },
  { value: 'payin_completed', label: 'Payin Completed' },
  { value: 'payout_verified', label: 'Payout Verified' },
  { value: 'dispute_approved', label: 'Dispute Approved' },
  { value: 'dispute_rejected', label: 'Dispute Rejected' },
  { value: 'manual_adjustment', label: 'Manual Adjustment' },
  { value: 'settlement', label: 'Settlement' },
  { value: 'refund', label: 'Refund' },
];

export default function AdminBalanceHistory() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState('all');
  const [reasonFilter, setReasonFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Fetch balance history
  const fetchHistory = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('v_balance_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (entityType !== 'all') {
        query = query.eq('entity_type', entityType);
      }
      if (reasonFilter !== 'all') {
        query = query.eq('reason', reasonFilter);
      }
      if (dateFrom) {
        query = query.gte('created_at', dateFrom);
      }
      if (dateTo) {
        query = query.lte('created_at', dateTo + 'T23:59:59');
      }

      const { data, error } = await query;
      if (error) throw error;
      setHistory(data || []);
    } catch (err) {
      console.error('Error fetching balance history:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchHistory();
  }, [entityType, reasonFilter, dateFrom, dateTo]);

  // Filter by search
  const filtered = useMemo(() => {
    if (!search) return history;
    const s = search.toLowerCase();
    return history.filter(h => 
      h.entity_name?.toLowerCase().includes(s) ||
      h.entity_email?.toLowerCase().includes(s) ||
      h.reason?.toLowerCase().includes(s) ||
      h.note?.toLowerCase().includes(s)
    );
  }, [history, search]);

  // Stats
  const stats = useMemo(() => {
    const credits = filtered.filter(h => h.amount > 0);
    const debits = filtered.filter(h => h.amount < 0);
    return {
      totalCredits: credits.reduce((s, h) => s + Number(h.amount), 0),
      totalDebits: Math.abs(debits.reduce((s, h) => s + Number(h.amount), 0)),
      creditCount: credits.length,
      debitCount: debits.length,
    };
  }, [filtered]);

  const clearFilters = () => {
    setSearch('');
    setEntityType('all');
    setReasonFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl shadow-sm">
            <History className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Balance History</h1>
            <p className="text-sm text-slate-500">Track all balance changes</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton 
            data={filtered} 
            columns={EXPORT_COLUMNS.balanceHistory} 
            filename="balance_history"
            dateRange={dateFrom && dateTo ? { from: dateFrom, to: dateTo } : null}
          />
          <button 
            onClick={fetchHistory}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <RefreshCw className={`w-5 h-5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 font-medium">Total Credits</p>
          <p className="text-xl font-bold text-green-600">₹{stats.totalCredits.toLocaleString()}</p>
          <p className="text-xs text-slate-400">{stats.creditCount} transactions</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 font-medium">Total Debits</p>
          <p className="text-xl font-bold text-red-600">₹{stats.totalDebits.toLocaleString()}</p>
          <p className="text-xs text-slate-400">{stats.debitCount} transactions</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 font-medium">Net Change</p>
          <p className={`text-xl font-bold ${stats.totalCredits - stats.totalDebits >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            ₹{(stats.totalCredits - stats.totalDebits).toLocaleString()}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 font-medium">Total Records</p>
          <p className="text-xl font-bold text-slate-900">{filtered.length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, email, reason..."
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
          </div>

          {/* Entity Type */}
          <select
            value={entityType}
            onChange={e => setEntityType(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
          >
            <option value="all">All Types</option>
            <option value="trader">Traders</option>
            <option value="merchant">Merchants</option>
          </select>

          {/* Reason */}
          <select
            value={reasonFilter}
            onChange={e => setReasonFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
          >
            {REASONS.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>

          {/* Toggle more filters */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-1 ${
              showFilters ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'
            }`}
          >
            <Filter className="w-4 h-4" />
            {showFilters ? 'Hide' : 'More'}
          </button>

          {/* Clear */}
          {(search || entityType !== 'all' || reasonFilter !== 'all' || dateFrom || dateTo) && (
            <button
              onClick={clearFilters}
              className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-xl flex items-center gap-1"
            >
              <X className="w-4 h-4" />
              Clear
            </button>
          )}
        </div>

        {/* Date filters */}
        {showFilters && (
          <div className="flex gap-3 mt-3 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-xl text-sm"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-xl text-sm"
              />
            </div>
          </div>
        )}
      </div>

      {/* History List */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <RefreshCw className="w-6 h-6 text-slate-400 animate-spin mx-auto mb-2" />
            <p className="text-sm text-slate-500">Loading...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <History className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No balance history found</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map(h => (
              <div key={h.id} className="p-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${h.amount >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                      {h.amount >= 0 ? (
                        <ArrowDownCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <ArrowUpCircle className="w-5 h-5 text-red-600" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-lg font-bold ${h.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {h.amount >= 0 ? '+' : ''}₹{Number(h.amount).toLocaleString()}
                        </span>
                        <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${
                          h.entity_type === 'trader' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                        }`}>
                          {h.entity_type === 'trader' ? <User className="w-3 h-3 inline mr-1" /> : <Building className="w-3 h-3 inline mr-1" />}
                          {h.entity_type}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-slate-700">{h.entity_name || 'Unknown'}</p>
                      <p className="text-xs text-slate-500">{h.reason?.replace(/_/g, ' ')}</p>
                      {h.note && <p className="text-xs text-slate-400 mt-1">"{h.note}"</p>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">
                      {new Date(h.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      ₹{Number(h.balance_before).toLocaleString()} → ₹{Number(h.balance_after).toLocaleString()}
                    </p>
                    {h.reference_type && (
                      <p className="text-xs text-slate-400 mt-1">
                        {h.reference_type}: {h.reference_id?.slice(0, 8)}...
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
