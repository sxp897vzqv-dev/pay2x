import React, { useEffect, useState, useCallback } from "react";
import { supabase } from '../../../supabase';
import {
  TrendingUp, TrendingDown, DollarSign, Wallet, Activity, RefreshCw,
  Calendar, ArrowRight,
} from 'lucide-react';
import StatCard from '../../../components/admin/StatCard';

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

export default function TraderDashboard() {
  const [traderId, setTraderId] = useState(null);
  const [stats, setStats] = useState({
    payins: 0, payouts: 0, commission: 0,
    overallCommission: 0, balance: 0,
    pendingPayins: 0, pendingPayouts: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  
  // Date filters
  const [datePreset, setDatePreset] = useState('today');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  const fetchStats = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); setRefreshing(false); setError("User not logged in."); return; }

    try {
      // Get trader record
      const { data: trader } = await supabase
        .from('traders')
        .select('*')
        .eq('profile_id', user.id)
        .single();

      if (!trader) { setLoading(false); setRefreshing(false); setError("Trader not found."); return; }
      setTraderId(trader.id);

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

      const [piCRes, piPRes, poCRes, poPRes] = await Promise.all([
        supabase.from('payins').select('amount,commission').eq('trader_id', trader.id).eq('status', 'completed').gte('completed_at', fromDate).lte('completed_at', toDate),
        supabase.from('payins').select('id', { count: 'exact', head: true }).eq('trader_id', trader.id).eq('status', 'pending'),
        supabase.from('payouts').select('amount').eq('trader_id', trader.id).eq('status', 'completed').gte('completed_at', fromDate).lte('completed_at', toDate),
        supabase.from('payouts').select('id', { count: 'exact', head: true }).eq('trader_id', trader.id).eq('status', 'pending'),
      ]);

      let payins = 0, commission = 0;
      (piCRes.data || []).forEach(v => { payins += Number(v.amount || 0); commission += Number(v.commission || 0); });

      let payouts = 0;
      (poCRes.data || []).forEach(v => { payouts += Number(v.amount || 0); });

      const rawBalance = Number(trader.balance || 0);
      const securityHold = Number(trader.security_hold || 0);

      setStats({
        payins, payouts, commission,
        overallCommission: Number(trader.overall_commission || 0),
        balance: rawBalance - securityHold,
        pendingPayins: piPRes.count || 0,
        pendingPayouts: poPRes.count || 0,
      });
    } catch (e) {
      setError("Failed to load stats: " + e.message);
      console.error(e);
    }
    setLoading(false); 
    setRefreshing(false);
  }, [datePreset, dateFrom, dateTo]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const handlePresetChange = (preset) => {
    setDatePreset(preset);
    if (preset !== 'custom') {
      setShowDatePicker(false);
    } else {
      setShowDatePicker(true);
    }
  };

  const periodLabel = datePreset === 'today' ? "Today's" : datePreset === 'yesterday' ? "Yesterday's" : "Period";

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Desktop header */}
      <div className="hidden sm:flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">Your performance overview</p>
        </div>
        <button onClick={() => fetchStats(true)} disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors text-sm font-semibold disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Mobile refresh */}
      <div className="flex sm:hidden justify-end">
        <button onClick={() => fetchStats(true)} disabled={refreshing}
          className="p-2 bg-green-50 border border-green-200 rounded-xl hover:bg-green-100 active:bg-green-200 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 text-green-600 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 flex items-center gap-2 text-sm">
          <Activity className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {/* Date Range Selector */}
      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="w-4 h-4 text-green-600" />
          <span className="text-sm font-bold text-slate-700">Date Range</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {DATE_PRESETS.map(preset => (
            <button
              key={preset.key}
              onClick={() => handlePresetChange(preset.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                datePreset === preset.key
                  ? 'bg-green-100 text-green-700 shadow-sm'
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
                className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-green-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">To</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-green-400" />
            </div>
          </div>
        )}
      </div>

      {/* Hero summary strip */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-2xl p-4 text-white shadow-md">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-green-200 text-xs font-semibold uppercase tracking-wide mb-0.5">Working Balance</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {loading ? <span className="inline-block w-28 h-7 bg-white/20 animate-pulse rounded" /> : `₹${stats.balance.toLocaleString()}`}
            </h2>
          </div>
          <div className="text-right">
            <p className="text-green-200 text-xs">{periodLabel} Net</p>
            <p className="text-lg font-bold">
              {loading ? '—' : `₹${(stats.payins - stats.payouts).toLocaleString()}`}
            </p>
          </div>
        </div>
      </div>

      {/* Primary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        <StatCard title={`${periodLabel} Payins`} value={`₹${stats.payins.toLocaleString()}`} icon={TrendingUp} color="green" loading={loading} />
        <StatCard title={`${periodLabel} Payouts`} value={`₹${stats.payouts.toLocaleString()}`} icon={TrendingDown} color="blue" loading={loading} />
        <StatCard title={`${periodLabel} Commission`} value={`₹${stats.commission.toLocaleString()}`} icon={DollarSign} color="emerald" loading={loading} className="col-span-2 sm:col-span-1" />
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Overall Commission" value={`₹${stats.overallCommission.toLocaleString()}`} icon={DollarSign} color="purple" loading={loading} />
        <StatCard title="Wallet Balance" value={`₹${stats.balance.toLocaleString()}`} icon={Wallet} color="orange" loading={loading} />
        <StatCard title="Pending Payins" value={stats.pendingPayins.toString()} icon={Activity} color="yellow" loading={loading} subtitle="Awaiting action" />
        <StatCard title="Pending Payouts" value={stats.pendingPayouts.toString()} icon={Activity} color="red" loading={loading} subtitle="Awaiting action" />
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-900">Quick Actions</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3">
          {[
            { href: '/trader/payin', icon: TrendingUp, title: 'Process Payins', sub: `${stats.pendingPayins} pending`, color: '#16a34a', bg: 'from-green-50 to-emerald-50' },
            { href: '/trader/payout', icon: TrendingDown, title: 'Handle Payouts', sub: `${stats.pendingPayouts} pending`, color: '#2563eb', bg: 'from-blue-50 to-cyan-50' },
            { href: '/trader/balance', icon: Wallet, title: 'Manage Balance', sub: `₹${stats.balance.toLocaleString()}`, color: '#9333ea', bg: 'from-purple-50 to-pink-50' },
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
    </div>
  );
}
