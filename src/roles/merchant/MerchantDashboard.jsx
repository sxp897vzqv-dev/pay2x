import React, { useEffect, useState, useCallback } from "react";
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../supabase';
import { useRealtimeRefresh } from '../../hooks/useRealtimeSubscription';
import {
  TrendingUp, TrendingDown, DollarSign, Activity, RefreshCw,
  AlertCircle, CheckCircle, Clock, AlertTriangle, Eye,
  Wallet, Download, ArrowRight, XCircle, Calendar, Filter, X,
} from 'lucide-react';
import StatCard from '../../components/admin/StatCard';

/* ─── Alert Card ─── */
const AlertCard = ({ alert, onView }) => {
  const typeStyles = {
    critical: { bg: 'bg-red-50', border: 'border-red-200', icon: XCircle, iconColor: 'text-red-600' },
    warning: { bg: 'bg-amber-50', border: 'border-amber-200', icon: AlertTriangle, iconColor: 'text-amber-600' },
    info: { bg: 'bg-blue-50', border: 'border-blue-200', icon: AlertCircle, iconColor: 'text-blue-600' },
  };
  const style = typeStyles[alert.type] || typeStyles.info;
  const Icon = style.icon;

  return (
    <div className={`${style.bg} ${style.border} border rounded-xl p-3 flex items-start gap-3`}>
      <Icon className={`w-5 h-5 ${style.iconColor} flex-shrink-0 mt-0.5`} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-900 text-sm">{alert.title}</p>
        <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{alert.message}</p>
      </div>
    </div>
  );
};

/* ─── RecentTransaction ─── */
function RecentTransaction({ tx }) {
  const isPayin = tx.type === 'payin';
  const statusColors = {
    success: 'bg-green-100 text-green-700',
    completed: 'bg-green-100 text-green-700',
    pending: 'bg-yellow-100 text-yellow-700',
    queued: 'bg-blue-100 text-blue-700',
    processing: 'bg-yellow-100 text-yellow-700',
    failed: 'bg-red-100 text-red-700',
  };

  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0">
      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${isPayin ? 'bg-green-100' : 'bg-blue-100'}`}>
        {isPayin ? <TrendingUp className="text-green-600" size={16} /> : <TrendingDown className="text-blue-600" size={16} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-900 text-sm">{isPayin ? 'Payment In' : 'Payout'}</p>
        <p className="text-xs text-slate-400 truncate">{tx.order_id || tx.payout_id || tx.id?.slice(-8)}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={`font-bold text-sm ${isPayin ? 'text-green-600' : 'text-blue-600'}`}>
          {isPayin ? '+' : '−'}₹{tx.amount?.toLocaleString()}
        </p>
        <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[tx.status] || statusColors.pending}`}>
          {tx.status}
        </span>
      </div>
    </div>
  );
}

/* ─── Date Presets ─── */
const DATE_PRESETS = [
  { label: 'Today', key: 'today' },
  { label: 'Yesterday', key: 'yesterday' },
  { label: 'Last 7 Days', key: '7d' },
  { label: 'Last 30 Days', key: '30d' },
  { label: 'This Month', key: 'month' },
  { label: 'Custom', key: 'custom' },
];

function getDateRange(preset) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  switch (preset) {
    case 'today':
      return { from: today.toISOString(), to: new Date().toISOString() };
    case 'yesterday':
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { from: yesterday.toISOString(), to: today.toISOString() };
    case '7d':
      const d7 = new Date(today);
      d7.setDate(d7.getDate() - 7);
      return { from: d7.toISOString(), to: new Date().toISOString() };
    case '30d':
      const d30 = new Date(today);
      d30.setDate(d30.getDate() - 30);
      return { from: d30.toISOString(), to: new Date().toISOString() };
    case 'month':
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: monthStart.toISOString(), to: new Date().toISOString() };
    default:
      return { from: today.toISOString(), to: new Date().toISOString() };
  }
}

export default function MerchantDashboard() {
  const { merchantInfo } = useOutletContext() || {};
  const [stats, setStats] = useState({
    payins: 0, payouts: 0, successRate: 0,
    availableBalance: 0, pendingSettlement: 0, reservedAmount: 0,
    totalTransactions: 0, failedTransactions: 0, pendingDisputes: 0,
  });
  const [alerts, setAlerts] = useState([]);
  const [recentTx, setRecentTx] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Date filters
  const [datePreset, setDatePreset] = useState('today');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  const fetchAlerts = async (merchantId) => {
    try {
      const { data } = await supabase
        .from('disputes')
        .select('*')
        .eq('merchant_id', merchantId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(3);

      const list = (data || []).map(d => ({
        id: d.id,
        type: 'warning',
        title: `Dispute: ₹${(Number(d.amount) || 0).toLocaleString()}`,
        message: d.reason || 'Pending response required',
        createdAt: d.created_at,
        link: `/merchant/disputes/${d.id}`,
      }));
      setAlerts(list);
    } catch (e) { console.error(e); }
  };

  const fetchStats = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); setRefreshing(false); return; }

    try {
      const { data: merchant } = await supabase.from('merchants').select('*').eq('profile_id', user.id).single();
      if (!merchant) { setLoading(false); setRefreshing(false); return; }

      // Get date range
      let fromDate, toDate;
      if (datePreset === 'custom' && dateFrom && dateTo) {
        fromDate = new Date(dateFrom).toISOString();
        toDate = new Date(dateTo + 'T23:59:59').toISOString();
      } else {
        const range = getDateRange(datePreset);
        fromDate = range.from;
        toDate = range.to;
      }

      const [payinRes, payoutRes, allPayinsRes, allPayoutsRes, disputesRes] = await Promise.all([
        supabase.from('payins').select('amount, status').eq('merchant_id', merchant.id).gte('created_at', fromDate).lte('created_at', toDate),
        supabase.from('payouts').select('amount').eq('merchant_id', merchant.id).gte('created_at', fromDate).lte('created_at', toDate),
        supabase.from('payins').select('*').eq('merchant_id', merchant.id).order('created_at', { ascending: false }).limit(5),
        supabase.from('payouts').select('*').eq('merchant_id', merchant.id).order('created_at', { ascending: false }).limit(5),
        supabase.from('disputes').select('id', { count: 'exact', head: true }).eq('merchant_id', merchant.id).eq('status', 'pending'),
      ]);

      let payins = 0, payouts = 0, successCount = 0, totalCount = 0;

      (payinRes.data || []).forEach(d => {
        payins += Number(d.amount || 0);
        totalCount++;
        if (d.status === 'success' || d.status === 'completed') successCount++;
      });
      (payoutRes.data || []).forEach(d => { payouts += Number(d.amount || 0); });

      const successRate = totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 0;

      const recent = [
        ...(allPayinsRes.data || []).map(d => ({ ...d, type: 'payin' })),
        ...(allPayoutsRes.data || []).map(d => ({ ...d, type: 'payout' })),
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      setStats({
        payins, payouts, successRate,
        availableBalance: Number(merchant?.available_balance || 0),
        pendingSettlement: Number(merchant?.pending_settlement || merchant?.pending_balance || 0),
        reservedAmount: Number(merchant?.reserved_amount || 0),
        totalTransactions: totalCount,
        failedTransactions: totalCount - successCount,
        pendingDisputes: disputesRes.count || 0,
      });
      setRecentTx(recent.slice(0, 10));
      fetchAlerts(merchant.id);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
    setRefreshing(false);
  }, [datePreset, dateFrom, dateTo]);

  // Initial fetch and when date changes
  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Real-time refresh
  useRealtimeRefresh(['payins', 'payouts'], () => fetchStats(true), 5000);

  const handlePresetChange = (preset) => {
    setDatePreset(preset);
    if (preset !== 'custom') {
      setShowDatePicker(false);
    } else {
      setShowDatePicker(true);
    }
  };

  const handleExportReport = () => {
    const csv = [
      ['Metric', 'Value'],
      ['Payins', `₹${stats.payins}`],
      ['Payouts', `₹${stats.payouts}`],
      ['Success Rate', `${stats.successRate}%`],
      ['Available Balance', `₹${stats.availableBalance}`],
      ['Date Range', datePreset === 'custom' ? `${dateFrom} to ${dateTo}` : datePreset],
    ].map(r => r.join(',')).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `merchant-report-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm font-medium">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Desktop header */}
      <div className="hidden sm:flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">Your business overview</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExportReport}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-200 text-sm font-semibold">
            <Download className="w-4 h-4" /> Export
          </button>
          <button onClick={() => fetchStats(true)} disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors text-sm font-semibold disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Mobile buttons */}
      <div className="flex sm:hidden justify-between items-center">
        <button onClick={handleExportReport}
          className="p-2 bg-slate-100 border border-slate-200 rounded-xl hover:bg-slate-200">
          <Download className="w-4 h-4 text-slate-600" />
        </button>
        <button onClick={() => fetchStats(true)} disabled={refreshing}
          className="p-2 bg-purple-50 border border-purple-200 rounded-xl hover:bg-purple-100 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 text-purple-600 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Date Range Selector */}
      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="w-4 h-4 text-purple-600" />
          <span className="text-sm font-bold text-slate-700">Date Range</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {DATE_PRESETS.map(preset => (
            <button
              key={preset.key}
              onClick={() => handlePresetChange(preset.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                datePreset === preset.key
                  ? 'bg-purple-100 text-purple-700 shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
        {/* Custom date picker */}
        {showDatePicker && (
          <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">From</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-purple-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">To</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-purple-400" />
            </div>
          </div>
        )}
      </div>

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Requires Attention
          </h3>
          <div className="grid gap-2">
            {alerts.map(alert => (
              <AlertCard key={alert.id} alert={alert} onView={() => window.location.href = alert.link} />
            ))}
          </div>
        </div>
      )}

      {/* Hero Balance Card */}
      <div className="bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-700 rounded-2xl p-4 sm:p-5 text-white shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-purple-200 text-xs font-semibold uppercase tracking-wide mb-0.5">Available Balance</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">₹{stats.availableBalance.toLocaleString()}</h2>
          </div>
          <div className="text-right">
            <p className="text-purple-200 text-xs">Period Net</p>
            <p className="text-lg font-bold">₹{(stats.payins - stats.payouts).toLocaleString()}</p>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex-1 bg-white/10 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="w-3.5 h-3.5 text-yellow-300" />
              <span className="text-xs text-purple-200 font-medium">Pending</span>
            </div>
            <p className="text-lg font-bold text-white">₹{stats.pendingSettlement.toLocaleString()}</p>
          </div>
          <div className="flex-1 bg-white/10 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <AlertCircle className="w-3.5 h-3.5 text-orange-300" />
              <span className="text-xs text-purple-200 font-medium">Reserved</span>
            </div>
            <p className="text-lg font-bold text-white">₹{stats.reservedAmount.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Primary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        <StatCard title="Payins" value={`₹${stats.payins.toLocaleString()}`} icon={TrendingUp} color="green" />
        <StatCard title="Payouts" value={`₹${stats.payouts.toLocaleString()}`} icon={TrendingDown} color="blue" />
        <StatCard title="Success Rate" value={`${stats.successRate}%`} icon={CheckCircle} color="emerald" className="col-span-2 sm:col-span-1" />
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Transactions" value={stats.totalTransactions.toString()} icon={Activity} color="purple" subtitle={datePreset === 'today' ? 'Today' : datePreset} />
        <StatCard title="Failed" value={stats.failedTransactions.toString()} icon={AlertCircle} color="red" subtitle={stats.failedTransactions > 0 ? "Attention" : "All good"} />
        <StatCard title="Disputes" value={stats.pendingDisputes.toString()} icon={AlertTriangle} color="orange" subtitle={stats.pendingDisputes > 0 ? "Pending" : "None"} />
        <StatCard title="Net Revenue" value={`₹${(stats.payins - stats.payouts).toLocaleString()}`} icon={DollarSign} color="yellow" />
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-900">Quick Actions</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3">
          {[
            { href: '/merchant/payins', icon: TrendingUp, title: 'View Payins', sub: `${stats.totalTransactions} transactions`, color: '#16a34a', bg: 'from-green-50 to-emerald-50' },
            { href: '/merchant/payouts', icon: TrendingDown, title: 'Create Payout', sub: 'Process withdrawals', color: '#2563eb', bg: 'from-blue-50 to-cyan-50' },
            { href: '/merchant/balance', icon: Wallet, title: 'Request Settlement', sub: `₹${stats.availableBalance.toLocaleString()} available`, color: '#9333ea', bg: 'from-purple-50 to-pink-50' },
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <a key={i} href={item.href}
                className={`flex items-center gap-3 p-4 bg-gradient-to-br ${item.bg} hover:shadow-md active:scale-[0.98] transition-all border-b sm:border-b-0 sm:border-r border-slate-100 last:border-0`}>
                <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5" style={{ color: item.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 text-sm">{item.title}</p>
                  <p className="text-xs text-slate-500 truncate">{item.sub}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
              </a>
            );
          })}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Recent Transactions</h3>
          <a href="/merchant/payins" className="text-xs text-purple-600 font-semibold hover:text-purple-700 flex items-center gap-1">
            View All <ArrowRight className="w-3 h-3" />
          </a>
        </div>
        <div className="px-4 py-1">
          {recentTx.length > 0 ? (
            recentTx.map(tx => <RecentTransaction key={tx.id} tx={tx} />)
          ) : (
            <div className="text-center py-10">
              <Activity className="w-10 h-10 text-slate-200 mx-auto mb-2" />
              <p className="text-slate-500 text-sm font-medium">No recent transactions</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
