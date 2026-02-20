import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useOutletContext, Link } from 'react-router-dom';
import { supabase } from '../../../supabase';
import { useMultipleRealtimeSubscriptions } from '../../../hooks/useRealtimeSubscription';
import {
  TrendingUp, TrendingDown, Activity, RefreshCw,
  AlertTriangle, ArrowRight, ArrowDownRight, ArrowUpRight,
  Calendar, CheckCircle, XCircle, Clock, Timer, Percent,
  CreditCard, Banknote, BarChart3, AlertCircle, Hourglass,
  IndianRupee, Hash, ShieldCheck,
} from 'lucide-react';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';

/* ─── Mini Stat ─── */
const MiniStat = ({ label, value, color = 'slate' }) => {
  const colors = {
    green: 'text-green-700 bg-green-50',
    blue: 'text-blue-700 bg-blue-50',
    red: 'text-red-700 bg-red-50',
    amber: 'text-amber-700 bg-amber-50',
    purple: 'text-purple-700 bg-purple-50',
    slate: 'text-slate-700 bg-slate-50',
  };
  return (
    <div className={`${colors[color]} rounded-lg p-2 text-center`}>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-[10px] font-semibold uppercase opacity-70">{label}</p>
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

      // Parallel fetch all data
      const [
        payinsRes,
        payoutsRes,
        disputesRes,
        recentPayinsRes,
        recentPayoutsRes,
        lastSettlementRes,
      ] = await Promise.all([
        // Current period payins with all statuses
        supabase.from('payins')
          .select('amount, status, commission, created_at, completed_at')
          .eq('merchant_id', merchant.id)
          .gte('created_at', fromDate)
          .lte('created_at', toDate),
        // Current period payouts with all statuses
        supabase.from('payouts')
          .select('amount, status, commission, verification_status, created_at, completed_at')
          .eq('merchant_id', merchant.id)
          .gte('created_at', fromDate)
          .lte('created_at', toDate),
        // Open disputes
        supabase.from('disputes')
          .select('id', { count: 'exact', head: true })
          .eq('merchant_id', merchant.id)
          .in('status', ['pending', 'routed_to_trader']),
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

      // ─── PAYIN STATS ───
      const payinTotal = payins.length;
      const payinCompleted = payins.filter(p => p.status === 'completed' || p.status === 'success');
      const payinPending = payins.filter(p => p.status === 'pending');
      const payinRejected = payins.filter(p => p.status === 'rejected');
      const payinExpired = payins.filter(p => p.status === 'expired');
      const payinVolume = payinCompleted.reduce((s, p) => s + Number(p.amount || 0), 0);
      const payinFees = payinCompleted.reduce((s, p) => s + Number(p.commission || 0), 0);
      const payinConversionRate = payinTotal > 0 ? Math.round((payinCompleted.length / payinTotal) * 100) : 0;
      
      // Avg approval time (minutes)
      let payinAvgTime = 0;
      const payinWithTime = payinCompleted.filter(p => p.completed_at);
      if (payinWithTime.length > 0) {
        const totalMs = payinWithTime.reduce((s, p) => s + (new Date(p.completed_at) - new Date(p.created_at)), 0);
        payinAvgTime = Math.round(totalMs / payinWithTime.length / 60000);
      }

      // ─── PAYOUT STATS ───
      const payoutTotal = payouts.length;
      const payoutCompleted = payouts.filter(p => p.status === 'completed' && p.verification_status === 'verified');
      const payoutProcessing = payouts.filter(p => ['assigned', 'processing'].includes(p.status));
      const payoutPendingVerification = payouts.filter(p => p.status === 'completed' && p.verification_status !== 'verified');
      const payoutRejected = payouts.filter(p => ['rejected', 'failed', 'cancelled'].includes(p.status));
      const payoutVolume = payoutCompleted.reduce((s, p) => s + Number(p.amount || 0), 0);
      const payoutFees = payoutCompleted.reduce((s, p) => s + Number(p.commission || 0), 0);
      const payoutConversionRate = payoutTotal > 0 ? Math.round((payoutCompleted.length / payoutTotal) * 100) : 0;
      
      // Avg processing time (minutes)
      let payoutAvgTime = 0;
      const payoutWithTime = payoutCompleted.filter(p => p.completed_at);
      if (payoutWithTime.length > 0) {
        const totalMs = payoutWithTime.reduce((s, p) => s + (new Date(p.completed_at) - new Date(p.created_at)), 0);
        payoutAvgTime = Math.round(totalMs / payoutWithTime.length / 60000);
      }

      // Last settlement
      const lastSettlement = lastSettlementRes.data?.[0];

      setStats({
        // Balance
        available: Number(merchant.available_balance || 0),
        lastSettlement: lastSettlement ? {
          amount: Number(lastSettlement.amount),
          date: lastSettlement.created_at,
        } : null,
        
        // Payin stats
        payinTotal,
        payinCompleted: payinCompleted.length,
        payinPending: payinPending.length,
        payinRejected: payinRejected.length,
        payinExpired: payinExpired.length,
        payinVolume,
        payinFees,
        payinConversionRate,
        payinAvgTime,
        
        // Payout stats
        payoutTotal,
        payoutCompleted: payoutCompleted.length,
        payoutProcessing: payoutProcessing.length,
        payoutPendingVerification: payoutPendingVerification.length,
        payoutRejected: payoutRejected.length,
        payoutVolume,
        payoutFees,
        payoutConversionRate,
        payoutAvgTime,
        
        // Combined
        totalFees: payinFees + payoutFees,
        openDisputes: disputesRes.count || 0,
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

      {/* ═══════════════════════ PAYINS SECTION ═══════════════════════ */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-green-50 px-4 py-3 border-b border-green-100 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-green-600" />
          <h3 className="font-bold text-green-900">Payins</h3>
          <span className="ml-auto text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
            {s.payinTotal} Total
          </span>
        </div>
        <div className="p-4 space-y-3">
          {/* Volume & Fees */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-green-50 rounded-xl p-3">
              <p className="text-xs text-green-600 font-semibold">Total Volume</p>
              <p className="text-2xl font-bold text-green-700">₹{s.payinVolume?.toLocaleString()}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-500 font-semibold">Platform Fees</p>
              <p className="text-2xl font-bold text-slate-700">₹{s.payinFees?.toLocaleString()}</p>
            </div>
          </div>
          
          {/* Status counts */}
          <div className="grid grid-cols-4 gap-2">
            <MiniStat label="Completed" value={s.payinCompleted} color="green" />
            <MiniStat label="Pending" value={s.payinPending} color="amber" />
            <MiniStat label="Rejected" value={s.payinRejected} color="red" />
            <MiniStat label="Expired" value={s.payinExpired} color="slate" />
          </div>
          
          {/* Metrics */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                <Percent className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Conversion Rate</p>
                <p className="text-lg font-bold text-slate-900">{s.payinConversionRate}%</p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Timer className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Avg Approval Time</p>
                <p className="text-lg font-bold text-slate-900">{s.payinAvgTime || '—'} min</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════ PAYOUTS SECTION ═══════════════════════ */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-blue-50 px-4 py-3 border-b border-blue-100 flex items-center gap-2">
          <TrendingDown className="w-5 h-5 text-blue-600" />
          <h3 className="font-bold text-blue-900">Payouts</h3>
          <span className="ml-auto text-xs font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
            {s.payoutTotal} Total
          </span>
        </div>
        <div className="p-4 space-y-3">
          {/* Volume & Fees */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 rounded-xl p-3">
              <p className="text-xs text-blue-600 font-semibold">Total Volume</p>
              <p className="text-2xl font-bold text-blue-700">₹{s.payoutVolume?.toLocaleString()}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-500 font-semibold">Platform Fees</p>
              <p className="text-2xl font-bold text-slate-700">₹{s.payoutFees?.toLocaleString()}</p>
            </div>
          </div>
          
          {/* Status counts */}
          <div className="grid grid-cols-4 gap-2">
            <MiniStat label="Completed" value={s.payoutCompleted} color="green" />
            <MiniStat label="Processing" value={s.payoutProcessing} color="blue" />
            <MiniStat label="Pending Verify" value={s.payoutPendingVerification} color="amber" />
            <MiniStat label="Rejected" value={s.payoutRejected} color="red" />
          </div>
          
          {/* Metrics */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                <Percent className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Conversion Rate</p>
                <p className="text-lg font-bold text-slate-900">{s.payoutConversionRate}%</p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Timer className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Avg Processing Time</p>
                <p className="text-lg font-bold text-slate-900">{s.payoutAvgTime || '—'} min</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════ BOTTOM STATS ═══════════════════════ */}
      <div className="grid grid-cols-2 gap-3">
        {/* Open Disputes */}
        <Link to="/merchant/disputes" className={`rounded-xl p-4 border ${s.openDisputes > 0 ? 'bg-amber-50 border-amber-200 hover:bg-amber-100' : 'bg-slate-50 border-slate-200'} transition-all`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.openDisputes > 0 ? 'bg-amber-100' : 'bg-slate-100'}`}>
              <AlertTriangle className={`w-5 h-5 ${s.openDisputes > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
            </div>
            <div>
              <p className="text-xs text-slate-500">Open Disputes</p>
              <p className={`text-xl font-bold ${s.openDisputes > 0 ? 'text-amber-700' : 'text-slate-700'}`}>{s.openDisputes}</p>
            </div>
          </div>
        </Link>
        
        {/* Total Fees */}
        <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <IndianRupee className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Today's Total Fees</p>
              <p className="text-xl font-bold text-purple-700">₹{s.totalFees?.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════ RECENT ACTIVITY ═══════════════════════ */}
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
