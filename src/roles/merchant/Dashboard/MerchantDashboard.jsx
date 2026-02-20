import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useOutletContext, Link } from 'react-router-dom';
import { supabase } from '../../../supabase';
import { useMultipleRealtimeSubscriptions } from '../../../hooks/useRealtimeSubscription';
import {
  TrendingUp, TrendingDown, IndianRupee, Activity, RefreshCw,
  AlertCircle, CheckCircle, Clock, AlertTriangle, ArrowRight,
  XCircle, Calendar, ArrowUpRight, ArrowDownRight, Zap,
  CreditCard, Banknote, Timer, BarChart3, Percent, Hash,
} from 'lucide-react';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';

/* ─── Compact Stat Card ─── */
const StatBox = ({ label, value, sub, icon: Icon, color = 'purple', trend, trendLabel }) => {
  const colors = {
    green: 'bg-green-50 text-green-600 border-green-100',
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
    red: 'bg-red-50 text-red-600 border-red-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    slate: 'bg-slate-50 text-slate-600 border-slate-100',
  };

  return (
    <div className={`${colors[color]} border rounded-xl p-3`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</span>
        {Icon && <Icon className="w-4 h-4 opacity-50" />}
      </div>
      <p className="text-xl font-bold">{value}</p>
      <div className="flex items-center justify-between mt-0.5">
        {sub && <span className="text-xs opacity-60">{sub}</span>}
        {trend !== undefined && trend !== null && (
          <span className={`text-xs font-semibold flex items-center gap-0.5 ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {trend >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(trend)}%
            {trendLabel && <span className="opacity-60 ml-0.5">{trendLabel}</span>}
          </span>
        )}
      </div>
    </div>
  );
};

/* ─── Recent Transaction Row ─── */
function TxRow({ tx }) {
  const isPayin = tx.type === 'payin';
  const statusStyle = {
    completed: 'bg-green-100 text-green-700',
    success: 'bg-green-100 text-green-700',
    pending: 'bg-amber-100 text-amber-700',
    processing: 'bg-blue-100 text-blue-700',
    assigned: 'bg-blue-100 text-blue-700',
    failed: 'bg-red-100 text-red-700',
    rejected: 'bg-red-100 text-red-700',
    expired: 'bg-slate-100 text-slate-600',
  };

  const timeAgo = (date) => {
    const mins = Math.floor((Date.now() - new Date(date)) / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-slate-50 last:border-0">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isPayin ? 'bg-green-100' : 'bg-blue-100'}`}>
        {isPayin ? <ArrowDownRight className="w-4 h-4 text-green-600" /> : <ArrowUpRight className="w-4 h-4 text-blue-600" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-slate-900">
            {isPayin ? '+' : '−'}₹{Number(tx.amount || 0).toLocaleString()}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${statusStyle[tx.status] || statusStyle.pending}`}>
            {tx.status}
          </span>
        </div>
        <p className="text-xs text-slate-400 truncate">{tx.order_id || tx.id?.slice(0, 12)}</p>
      </div>
      <span className="text-xs text-slate-400">{timeAgo(tx.created_at)}</span>
    </div>
  );
}

/* ─── Date Range Helper ─── */
function getDateRange(preset, customFrom, customTo) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  if (preset === 'custom' && customFrom && customTo) {
    return {
      from: new Date(customFrom).toISOString(),
      to: new Date(customTo + 'T23:59:59').toISOString(),
    };
  }

  switch (preset) {
    case 'today':
      return { from: today.toISOString(), to: now.toISOString() };
    case '7d':
      return { from: new Date(today.getTime() - 7 * 86400000).toISOString(), to: now.toISOString() };
    case '30d':
      return { from: new Date(today.getTime() - 30 * 86400000).toISOString(), to: now.toISOString() };
    default:
      return { from: today.toISOString(), to: now.toISOString() };
  }
}

export default function MerchantDashboard() {
  const { merchantInfo } = useOutletContext() || {};
  const [stats, setStats] = useState(null);
  const [recentTx, setRecentTx] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedOnce = useRef(false);
  
  const [datePreset, setDatePreset] = useState('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const fetchData = useCallback(async () => {
    if (!hasLoadedOnce.current) setLoading(true);
    else setRefreshing(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: merchant } = await supabase
        .from('merchants')
        .select('*')
        .eq('profile_id', user.id)
        .single();
      if (!merchant) return;

      const { from: fromDate, to: toDate } = getDateRange(datePreset, customFrom, customTo);
      
      // Get yesterday's range for comparison
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const yesterdayStart = new Date(todayStart.getTime() - 86400000);
      const yesterdayEnd = todayStart.toISOString();

      // Parallel fetch all data
      const [
        payinsRes,
        payoutsRes,
        yesterdayPayinsRes,
        pendingPayinsRes,
        pendingPayoutsRes,
        disputesRes,
        recentPayinsRes,
        recentPayoutsRes,
        lastSettlementRes,
      ] = await Promise.all([
        // Current period payins
        supabase.from('payins')
          .select('amount, status, commission, created_at, completed_at')
          .eq('merchant_id', merchant.id)
          .gte('created_at', fromDate)
          .lte('created_at', toDate),
        // Current period payouts
        supabase.from('payouts')
          .select('amount, status, commission')
          .eq('merchant_id', merchant.id)
          .gte('created_at', fromDate)
          .lte('created_at', toDate),
        // Yesterday's payins for comparison
        supabase.from('payins')
          .select('amount, status')
          .eq('merchant_id', merchant.id)
          .gte('created_at', yesterdayStart.toISOString())
          .lt('created_at', yesterdayEnd),
        // Pending payins (all time)
        supabase.from('payins')
          .select('id', { count: 'exact', head: true })
          .eq('merchant_id', merchant.id)
          .eq('status', 'pending'),
        // Pending payouts (all time)
        supabase.from('payouts')
          .select('id', { count: 'exact', head: true })
          .eq('merchant_id', merchant.id)
          .in('status', ['pending', 'assigned', 'processing']),
        // Open disputes
        supabase.from('disputes')
          .select('id, amount, reason', { count: 'exact' })
          .eq('merchant_id', merchant.id)
          .eq('status', 'pending')
          .limit(3),
        // Recent payins
        supabase.from('payins')
          .select('id, order_id, amount, status, created_at')
          .eq('merchant_id', merchant.id)
          .order('created_at', { ascending: false })
          .limit(5),
        // Recent payouts
        supabase.from('payouts')
          .select('id, amount, status, created_at')
          .eq('merchant_id', merchant.id)
          .order('created_at', { ascending: false })
          .limit(5),
        // Last settlement
        supabase.from('merchant_settlements')
          .select('amount, status, created_at')
          .eq('merchant_id', merchant.id)
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(1),
      ]);

      const payins = payinsRes.data || [];
      const payouts = payoutsRes.data || [];
      const yesterdayPayins = yesterdayPayinsRes.data || [];

      // Calculate stats
      const completedPayins = payins.filter(p => p.status === 'completed' || p.status === 'success');
      const failedPayins = payins.filter(p => ['failed', 'rejected', 'expired'].includes(p.status));
      const completedPayouts = payouts.filter(p => p.status === 'completed');

      const payinVolume = completedPayins.reduce((s, p) => s + Number(p.amount || 0), 0);
      const payoutVolume = completedPayouts.reduce((s, p) => s + Number(p.amount || 0), 0);
      const payinFees = completedPayins.reduce((s, p) => s + Number(p.commission || 0), 0);
      const payoutFees = completedPayouts.reduce((s, p) => s + Number(p.commission || 0), 0);

      // Yesterday comparison
      const yesterdayCompleted = yesterdayPayins.filter(p => p.status === 'completed' || p.status === 'success');
      const yesterdayVolume = yesterdayCompleted.reduce((s, p) => s + Number(p.amount || 0), 0);
      const volumeTrend = yesterdayVolume > 0 ? Math.round(((payinVolume - yesterdayVolume) / yesterdayVolume) * 100) : null;
      const countTrend = yesterdayCompleted.length > 0 
        ? Math.round(((completedPayins.length - yesterdayCompleted.length) / yesterdayCompleted.length) * 100) 
        : null;

      // Success rate
      const successRate = payins.length > 0 ? Math.round((completedPayins.length / payins.length) * 100) : 0;

      // Average completion time
      let avgTime = 0;
      const withTime = completedPayins.filter(p => p.completed_at);
      if (withTime.length > 0) {
        const totalMs = withTime.reduce((s, p) => s + (new Date(p.completed_at) - new Date(p.created_at)), 0);
        avgTime = Math.round(totalMs / withTime.length / 60000); // minutes
      }

      // Average transaction
      const avgTxn = completedPayins.length > 0 ? Math.round(payinVolume / completedPayins.length) : 0;

      // Last settlement
      const lastSettlement = lastSettlementRes.data?.[0];

      setStats({
        // Balances
        available: Number(merchant.available_balance || 0),
        pending: Number(merchant.pending_settlement || merchant.pending_balance || 0),
        reserved: Number(merchant.reserved_amount || 0),
        
        // Period stats
        payinVolume,
        payoutVolume,
        payinCount: completedPayins.length,
        payoutCount: completedPayouts.length,
        totalTxns: payins.length,
        failedCount: failedPayins.length,
        successRate,
        
        // Fees
        payinFees,
        payoutFees,
        totalFees: payinFees + payoutFees,
        
        // Pending (all time)
        pendingPayins: pendingPayinsRes.count || 0,
        pendingPayouts: pendingPayoutsRes.count || 0,
        
        // Disputes
        openDisputes: disputesRes.count || 0,
        disputes: disputesRes.data || [],
        
        // Insights
        avgTime,
        avgTxn,
        volumeTrend,
        countTrend,
        
        // Settlement
        lastSettlement: lastSettlement ? {
          amount: Number(lastSettlement.amount),
          date: lastSettlement.created_at,
        } : null,
      });

      // Merge recent transactions
      const recent = [
        ...(recentPayinsRes.data || []).map(p => ({ ...p, type: 'payin' })),
        ...(recentPayoutsRes.data || []).map(p => ({ ...p, type: 'payout' })),
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 8);
      setRecentTx(recent);

    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      hasLoadedOnce.current = true;
      setLoading(false);
      setRefreshing(false);
    }
  }, [datePreset, customFrom, customTo]);

  useEffect(() => {
    if (datePreset !== 'custom' || (customFrom && customTo)) {
      fetchData();
    }
  }, [fetchData]);

  // Realtime
  const fetchRef = useRef(fetchData);
  useEffect(() => { fetchRef.current = fetchData; }, [fetchData]);
  
  const subs = useMemo(() => [
    { table: 'payins', options: { onChange: () => fetchRef.current() } },
    { table: 'payouts', options: { onChange: () => fetchRef.current() } },
  ], []);
  useMultipleRealtimeSubscriptions(subs);

  if (loading) {
    return <LoadingSpinner message="Loading dashboard…" />;
  }

  const s = stats || {};

  return (
    <div className="space-y-4">
      {/* Header + Date */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="hidden sm:block">
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 text-sm">Real-time business overview</p>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          {['today', '7d', '30d'].map(p => (
            <button
              key={p}
              onClick={() => setDatePreset(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                datePreset === p
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {p === 'today' ? 'Today' : p === '7d' ? '7 Days' : '30 Days'}
            </button>
          ))}
          <button
            onClick={() => setDatePreset('custom')}
            className={`p-1.5 rounded-lg transition-all ${
              datePreset === 'custom' ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            <Calendar className="w-4 h-4" />
          </button>
          <button
            onClick={fetchData}
            disabled={refreshing}
            className="p-1.5 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Custom Date */}
      {datePreset === 'custom' && (
        <div className="flex items-center gap-2 bg-slate-50 rounded-xl p-3">
          <input
            type="date"
            value={customFrom}
            onChange={e => setCustomFrom(e.target.value)}
            className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
          />
          <span className="text-slate-400">to</span>
          <input
            type="date"
            value={customTo}
            onChange={e => setCustomTo(e.target.value)}
            className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
          />
          <button
            onClick={fetchData}
            disabled={!customFrom || !customTo}
            className="px-3 py-1.5 bg-purple-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      )}

      {/* Alerts */}
      {s.openDisputes > 0 && (
        <Link to="/merchant/disputes" className="block bg-amber-50 border border-amber-200 rounded-xl p-3 hover:bg-amber-100 transition-colors">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <div className="flex-1">
              <p className="font-semibold text-amber-900 text-sm">
                {s.openDisputes} Open Dispute{s.openDisputes > 1 ? 's' : ''}
              </p>
              <p className="text-xs text-amber-700">Requires your response</p>
            </div>
            <ArrowRight className="w-4 h-4 text-amber-500" />
          </div>
        </Link>
      )}

      {/* Balance Hero */}
      <div className="bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-700 rounded-2xl p-4 text-white">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-purple-200 text-xs font-semibold uppercase tracking-wide">Available Balance</p>
            <h2 className="text-3xl font-bold">₹{s.available?.toLocaleString()}</h2>
          </div>
          {s.lastSettlement && (
            <div className="text-right">
              <p className="text-purple-200 text-xs">Last Settlement</p>
              <p className="text-sm font-semibold">₹{s.lastSettlement.amount.toLocaleString()}</p>
              <p className="text-purple-300 text-xs">{new Date(s.lastSettlement.date).toLocaleDateString()}</p>
            </div>
          )}
        </div>
      </div>

      {/* Volume Stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatBox
          label="Payin Volume"
          value={`₹${s.payinVolume?.toLocaleString()}`}
          sub={`${s.payinCount} completed`}
          icon={TrendingUp}
          color="green"
          trend={s.volumeTrend}
          trendLabel="vs yesterday"
        />
        <StatBox
          label="Payout Volume"
          value={`₹${s.payoutVolume?.toLocaleString()}`}
          sub={`${s.payoutCount} completed`}
          icon={TrendingDown}
          color="blue"
        />
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
          <Percent className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
          <p className="text-lg font-bold text-slate-900">{s.successRate}%</p>
          <p className="text-xs text-slate-500">Success</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
          <Hash className="w-4 h-4 text-purple-500 mx-auto mb-1" />
          <p className="text-lg font-bold text-slate-900">{s.totalTxns}</p>
          <p className="text-xs text-slate-500">Total Txns</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
          <Timer className="w-4 h-4 text-blue-500 mx-auto mb-1" />
          <p className="text-lg font-bold text-slate-900">{s.avgTime || '—'}m</p>
          <p className="text-xs text-slate-500">Avg Time</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
          <IndianRupee className="w-4 h-4 text-amber-500 mx-auto mb-1" />
          <p className="text-lg font-bold text-slate-900">₹{s.avgTxn?.toLocaleString()}</p>
          <p className="text-xs text-slate-500">Avg Txn</p>
        </div>
      </div>

      {/* Pending & Failed */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link to="/merchant/payins?status=pending" className="bg-amber-50 border border-amber-100 rounded-xl p-3 hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-1">
            <Clock className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-bold text-amber-700">Payins</span>
          </div>
          <p className="text-xl font-bold text-amber-700">{s.pendingPayins}</p>
          <p className="text-xs text-amber-600">Pending</p>
        </Link>
        
        <Link to="/merchant/payouts?status=pending" className="bg-blue-50 border border-blue-100 rounded-xl p-3 hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-1">
            <Clock className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-bold text-blue-700">Payouts</span>
          </div>
          <p className="text-xl font-bold text-blue-700">{s.pendingPayouts}</p>
          <p className="text-xs text-blue-600">In Progress</p>
        </Link>
        
        <div className="bg-red-50 border border-red-100 rounded-xl p-3">
          <div className="flex items-center justify-between mb-1">
            <XCircle className="w-4 h-4 text-red-500" />
            <span className="text-xs font-bold text-red-700">Failed</span>
          </div>
          <p className="text-xl font-bold text-red-700">{s.failedCount}</p>
          <p className="text-xs text-red-600">This period</p>
        </div>
        
        <div className="bg-purple-50 border border-purple-100 rounded-xl p-3">
          <div className="flex items-center justify-between mb-1">
            <Banknote className="w-4 h-4 text-purple-500" />
            <span className="text-xs font-bold text-purple-700">Fees</span>
          </div>
          <p className="text-xl font-bold text-purple-700">₹{s.totalFees?.toLocaleString()}</p>
          <p className="text-xs text-purple-600">Platform fees</p>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Activity className="w-4 h-4 text-purple-500" />
            Recent Activity
          </h3>
          <Link to="/merchant/payins" className="text-xs text-purple-600 font-semibold hover:text-purple-700 flex items-center gap-1">
            View All <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="px-4 py-2">
          {recentTx.length > 0 ? (
            recentTx.map(tx => <TxRow key={tx.id} tx={tx} />)
          ) : (
            <div className="text-center py-8">
              <Activity className="w-8 h-8 text-slate-200 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">No transactions yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-3 gap-2">
        <Link to="/merchant/payins" className="bg-green-50 hover:bg-green-100 border border-green-100 rounded-xl p-3 text-center transition-all">
          <CreditCard className="w-5 h-5 text-green-600 mx-auto mb-1" />
          <p className="text-xs font-semibold text-green-700">Payins</p>
        </Link>
        <Link to="/merchant/payouts" className="bg-blue-50 hover:bg-blue-100 border border-blue-100 rounded-xl p-3 text-center transition-all">
          <Banknote className="w-5 h-5 text-blue-600 mx-auto mb-1" />
          <p className="text-xs font-semibold text-blue-700">Payouts</p>
        </Link>
        <Link to="/merchant/reports" className="bg-purple-50 hover:bg-purple-100 border border-purple-100 rounded-xl p-3 text-center transition-all">
          <BarChart3 className="w-5 h-5 text-purple-600 mx-auto mb-1" />
          <p className="text-xs font-semibold text-purple-700">Reports</p>
        </Link>
      </div>
    </div>
  );
}
