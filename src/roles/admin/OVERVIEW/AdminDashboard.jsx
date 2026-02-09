import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../supabase';
import { useRealtimeRefresh } from '../../../hooks/useRealtimeSubscription';
import { Link } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, DollarSign, Users, Store, Activity, RefreshCw,
  AlertCircle, CheckCircle, Clock, ArrowRight, Database, UserCircle,
  AlertTriangle, XCircle, Eye, Calendar,
} from 'lucide-react';

// Shared components
import { StatCard } from '../../../components/admin';

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
      {onView && (
        <button onClick={() => onView(alert)} className="p-1.5 hover:bg-white/50 rounded-lg flex-shrink-0">
          <Eye className="w-4 h-4 text-slate-500" />
        </button>
      )}
    </div>
  );
};

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

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalTraders: 0, activeTraders: 0,
    totalMerchants: 0, activeMerchants: 0,
    payins: 0, payouts: 0,
    volume: 0, commission: 0,
    pendingPayins: 0, pendingPayouts: 0,
    pendingDisputes: 0, activeUPIs: 0,
  });
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Date filters
  const [datePreset, setDatePreset] = useState('today');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  const fetchAlerts = async () => {
    try {
      const { data } = await supabase
        .from('disputes')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5);

      const list = (data || []).map(d => ({
        id: d.id,
        type: 'warning',
        title: `Dispute: ₹${(Number(d.amount) || 0).toLocaleString()}`,
        message: d.reason || 'Pending response from trader',
        createdAt: d.created_at,
        link: `/admin/disputes/${d.id}`,
      }));
      setAlerts(list);
    } catch (e) { console.error(e); }
  };

  const fetchStats = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
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

      // Parallel queries
      const [
        tradersRes, merchantsRes,
        payinsRes, payoutsRes,
        pendingPayinsRes, pendingPayoutsRes,
        pendingDisputesRes, upiPoolRes,
      ] = await Promise.all([
        supabase.from('traders').select('id, is_active').limit(200),
        supabase.from('merchants').select('id, is_active').limit(200),
        supabase.from('payins').select('amount, commission').eq('status', 'completed').gte('completed_at', fromDate).lte('completed_at', toDate),
        supabase.from('payouts').select('amount').eq('status', 'completed').gte('completed_at', fromDate).lte('completed_at', toDate),
        supabase.from('payins').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('payouts').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('disputes').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('upi_pool').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      ]);

      const traders = tradersRes.data || [];
      const merchants = merchantsRes.data || [];
      const payins = payinsRes.data || [];
      const payouts = payoutsRes.data || [];

      const activeTraders = traders.filter(t => t.is_active).length;
      const activeMerchants = merchants.filter(m => m.is_active).length;

      let payinAmount = 0, commission = 0;
      payins.forEach(d => {
        payinAmount += Number(d.amount || 0);
        commission += Number(d.commission || 0);
      });

      let payoutAmount = 0;
      payouts.forEach(d => {
        payoutAmount += Number(d.amount || 0);
      });

      setStats({
        totalTraders: traders.length,
        activeTraders,
        totalMerchants: merchants.length,
        activeMerchants,
        payins: payinAmount,
        payouts: payoutAmount,
        volume: payinAmount + payoutAmount,
        commission,
        pendingPayins: pendingPayinsRes.count || 0,
        pendingPayouts: pendingPayoutsRes.count || 0,
        pendingDisputes: pendingDisputesRes.count || 0,
        activeUPIs: upiPoolRes.count || 0,
      });

    } catch (e) {
      console.error('Error fetching stats:', e);
    }

    setLoading(false);
    setRefreshing(false);
  }, [datePreset, dateFrom, dateTo]);

  // Initial data fetch
  useEffect(() => {
    fetchStats();
    fetchAlerts();
  }, [fetchStats]);

  // Realtime subscriptions
  useRealtimeRefresh('payins', () => fetchStats(), { debounceMs: 2000 });
  useRealtimeRefresh('payouts', () => fetchStats(), { debounceMs: 2000 });
  useRealtimeRefresh('disputes', () => fetchAlerts(), { debounceMs: 2000 });

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
          <p className="text-slate-500 text-sm mt-0.5">System overview and live metrics</p>
        </div>
        <button
          onClick={() => fetchStats(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors text-sm font-semibold disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Mobile refresh */}
      <div className="flex sm:hidden justify-end">
        <button
          onClick={() => fetchStats(true)}
          disabled={refreshing}
          className="p-2 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 active:bg-indigo-200 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 text-indigo-600 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Date Range Selector */}
      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="w-4 h-4 text-indigo-600" />
          <span className="text-sm font-bold text-slate-700">Date Range</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {DATE_PRESETS.map(preset => (
            <button
              key={preset.key}
              onClick={() => handlePresetChange(preset.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                datePreset === preset.key
                  ? 'bg-indigo-100 text-indigo-700 shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
        {showDatePicker && (
          <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">From</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">To</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" />
            </div>
          </div>
        )}
      </div>

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Pending Disputes ({alerts.length})
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {alerts.map(alert => (
              <AlertCard key={alert.id} alert={alert} onView={() => window.location.href = '/admin/disputes'} />
            ))}
          </div>
        </div>
      )}

      {/* Hero Volume Strip */}
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-4 text-white shadow-md">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-indigo-200 text-xs font-semibold uppercase tracking-wide mb-0.5">{periodLabel} Volume</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {loading ? (
                <span className="inline-block w-32 h-8 bg-white/20 animate-pulse rounded" />
              ) : (
                `₹${stats.volume.toLocaleString()}`
              )}
            </h2>
          </div>
          <div className="text-right">
            <p className="text-indigo-200 text-xs">Commission Earned</p>
            <p className="text-lg font-bold">
              {loading ? '—' : `₹${stats.commission.toLocaleString()}`}
            </p>
          </div>
        </div>
      </div>

      {/* Primary stats - Volume breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard title={`${periodLabel} Payins`} value={`₹${stats.payins.toLocaleString()}`} icon={TrendingUp} color="green" loading={loading} />
        <StatCard title={`${periodLabel} Payouts`} value={`₹${stats.payouts.toLocaleString()}`} icon={TrendingDown} color="blue" loading={loading} />
        <StatCard title={`${periodLabel} Commission`} value={`₹${stats.commission.toLocaleString()}`} icon={DollarSign} color="emerald" loading={loading} />
        <StatCard title="Active UPIs" value={stats.activeUPIs.toString()} icon={Database} color="purple" loading={loading} />
      </div>

      {/* Entity stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard title="Total Traders" value={stats.totalTraders.toString()} icon={Users} color="indigo" loading={loading} subtitle={`${stats.activeTraders} active`} />
        <StatCard title="Total Merchants" value={stats.totalMerchants.toString()} icon={Store} color="violet" loading={loading} subtitle={`${stats.activeMerchants} active`} />
        <StatCard title="Pending Payins" value={stats.pendingPayins.toString()} icon={Clock} color="yellow" loading={loading} subtitle="Awaiting action" />
        <StatCard title="Pending Payouts" value={stats.pendingPayouts.toString()} icon={Clock} color="orange" loading={loading} subtitle="Awaiting action" />
      </div>

      {/* Pending Items */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard title="Pending Disputes" value={stats.pendingDisputes.toString()} icon={AlertCircle} color="red" loading={loading} subtitle={stats.pendingDisputes > 0 ? "Requires attention" : "All resolved"} />
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-900">Quick Actions</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
          {[
            { to: '/admin/payins', icon: TrendingUp, title: 'Payins', sub: `${stats.pendingPayins} pending`, color: '#16a34a', bg: 'from-green-50 to-emerald-50' },
            { to: '/admin/payouts', icon: TrendingDown, title: 'Payouts', sub: `${stats.pendingPayouts} pending`, color: '#2563eb', bg: 'from-blue-50 to-cyan-50' },
            { to: '/admin/disputes', icon: AlertCircle, title: 'Disputes', sub: `${stats.pendingDisputes} pending`, color: '#dc2626', bg: 'from-red-50 to-orange-50' },
            { to: '/admin/traders', icon: Users, title: 'Traders', sub: `${stats.totalTraders} total`, color: '#7c3aed', bg: 'from-violet-50 to-purple-50' },
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <Link
                key={i}
                to={item.to}
                className={`flex items-center gap-3 p-4 bg-gradient-to-br ${item.bg} hover:shadow-md active:scale-[0.98] transition-all`}
              >
                <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5" style={{ color: item.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 text-sm">{item.title}</p>
                  <p className="text-xs text-slate-500 truncate">{item.sub}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 flex-shrink-0 hidden sm:block" />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
