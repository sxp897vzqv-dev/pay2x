import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../../supabase';
import { useRealtimeMulti } from '../../../hooks/useRealtimeSubscription';
import { Link } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, DollarSign, Users, Store, Activity, RefreshCw,
  AlertCircle, CheckCircle, Clock, Zap, ArrowRight, Database, UserCircle,
  AlertTriangle, XCircle, Eye,
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
        <p className="text-xs text-slate-400 mt-1">
          {alert.createdAt ? new Date(alert.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
        </p>
      </div>
      {onView && (
        <button onClick={() => onView(alert)} className="p-1.5 hover:bg-white/50 rounded-lg flex-shrink-0">
          <Eye className="w-4 h-4 text-slate-500" />
        </button>
      )}
    </div>
  );
};

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalTraders: 0, activeTraders: 0,
    totalMerchants: 0, activeMerchants: 0,
    todaysPayins: 0, todaysPayouts: 0,
    todaysVolume: 0, todaysCommission: 0,
    pendingPayins: 0, pendingPayouts: 0,
    pendingDisputes: 0, activeUPIs: 0,
  });
  const [alerts, setAlerts] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchStats();
    fetchAlerts();
  }, []);

  // Realtime: refresh dashboard on any transaction changes
  useRealtimeMulti(['payins', 'payouts', 'disputes'], () => fetchStats());

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

  const fetchStats = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();

      // Parallel queries
      const [
        tradersRes, merchantsRes,
        todayPayinsRes, todayPayoutsRes,
        pendingPayinsRes, pendingPayoutsRes,
        pendingDisputesRes, upiPoolRes,
      ] = await Promise.all([
        supabase.from('traders').select('id, is_active').limit(200),
        supabase.from('merchants').select('id, is_active').limit(200),
        supabase.from('payins').select('amount, commission').eq('status', 'completed').gte('completed_at', todayISO),
        supabase.from('payouts').select('amount').eq('status', 'completed').gte('completed_at', todayISO),
        supabase.from('payins').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('payouts').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('disputes').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('upi_pool').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      ]);

      const traders = tradersRes.data || [];
      const merchants = merchantsRes.data || [];
      const todayPayins = todayPayinsRes.data || [];
      const todayPayouts = todayPayoutsRes.data || [];

      const activeTraders = traders.filter(t => t.is_active).length;
      const activeMerchants = merchants.filter(m => m.is_active).length;

      let todaysPayinAmount = 0, todaysCommission = 0;
      todayPayins.forEach(d => {
        todaysPayinAmount += Number(d.amount || 0);
        todaysCommission += Number(d.commission || 0);
      });

      let todaysPayoutAmount = 0;
      todayPayouts.forEach(d => {
        todaysPayoutAmount += Number(d.amount || 0);
      });

      setStats({
        totalTraders: traders.length,
        activeTraders,
        totalMerchants: merchants.length,
        activeMerchants,
        todaysPayins: todaysPayinAmount,
        todaysPayouts: todaysPayoutAmount,
        todaysVolume: todaysPayinAmount + todaysPayoutAmount,
        todaysCommission,
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
  };

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

      {/* ── Hero Volume Strip ── */}
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-4 text-white shadow-md">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-indigo-200 text-xs font-semibold uppercase tracking-wide mb-0.5">Today's Volume</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {loading ? (
                <span className="inline-block w-32 h-8 bg-white/20 animate-pulse rounded" />
              ) : (
                `₹${stats.todaysVolume.toLocaleString()}`
              )}
            </h2>
          </div>
          <div className="text-right">
            <p className="text-indigo-200 text-xs">Commission Earned</p>
            <p className="text-lg font-bold">
              {loading ? '—' : `₹${stats.todaysCommission.toLocaleString()}`}
            </p>
          </div>
        </div>
      </div>

      {/* ── Primary Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          title="Today's Payins"
          value={`₹${stats.todaysPayins.toLocaleString()}`}
          icon={TrendingUp}
          color="green"
          loading={loading}
        />
        <StatCard
          title="Today's Payouts"
          value={`₹${stats.todaysPayouts.toLocaleString()}`}
          icon={TrendingDown}
          color="blue"
          loading={loading}
        />
        <StatCard
          title="Active Traders"
          value={`${stats.activeTraders}/${stats.totalTraders}`}
          icon={Users}
          color="purple"
          loading={loading}
        />
        <StatCard
          title="Active Merchants"
          value={`${stats.activeMerchants}/${stats.totalMerchants}`}
          icon={Store}
          color="orange"
          loading={loading}
        />
      </div>

      {/* ── Pending Actions ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          title="Pending Payins"
          value={stats.pendingPayins.toString()}
          icon={Clock}
          color="yellow"
          loading={loading}
          subtitle="Awaiting action"
        />
        <StatCard
          title="Pending Payouts"
          value={stats.pendingPayouts.toString()}
          icon={Clock}
          color="cyan"
          loading={loading}
          subtitle="Awaiting action"
        />
        <StatCard
          title="Open Disputes"
          value={stats.pendingDisputes.toString()}
          icon={AlertCircle}
          color="red"
          loading={loading}
          subtitle="Need resolution"
        />
        <StatCard
          title="Active UPIs"
          value={stats.activeUPIs.toString()}
          icon={Database}
          color="indigo"
          loading={loading}
          subtitle="In pool"
        />
      </div>

      {/* ── Alerts & Quick Actions ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Live Alerts */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              Live Alerts
            </h2>
            <Link to="/admin/disputes" className="text-xs text-indigo-600 font-semibold hover:underline">
              View All
            </Link>
          </div>
          <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
            {alerts.length > 0 ? (
              alerts.map(alert => <AlertCard key={alert.id} alert={alert} />)
            ) : (
              <div className="text-center py-6">
                <CheckCircle className="w-10 h-10 text-green-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-500">All clear!</p>
                <p className="text-xs text-slate-400">No pending alerts</p>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              Quick Actions
            </h2>
          </div>
          <div className="divide-y divide-slate-100">
            {[
              { to: '/admin/traders', icon: Users, title: 'Manage Traders', sub: `${stats.totalTraders} total`, color: '#9333ea', bg: 'from-purple-50 to-violet-50' },
              { to: '/admin/payins', icon: TrendingUp, title: 'Process Payins', sub: `${stats.pendingPayins} pending`, color: '#16a34a', bg: 'from-green-50 to-emerald-50' },
              { to: '/admin/payouts', icon: TrendingDown, title: 'Handle Payouts', sub: `${stats.pendingPayouts} pending`, color: '#2563eb', bg: 'from-blue-50 to-cyan-50' },
              { to: '/admin/disputes', icon: AlertCircle, title: 'Resolve Disputes', sub: `${stats.pendingDisputes} open`, color: '#dc2626', bg: 'from-red-50 to-orange-50' },
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
                  <ArrowRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── System Health ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-900">System Health</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-100">
          {[
            { label: 'UPI Pool', status: stats.activeUPIs > 0 ? 'healthy' : 'warning', value: `${stats.activeUPIs} active` },
            { label: 'Traders', status: stats.activeTraders > 0 ? 'healthy' : 'warning', value: `${stats.activeTraders} online` },
            { label: 'Disputes', status: stats.pendingDisputes === 0 ? 'healthy' : stats.pendingDisputes < 5 ? 'warning' : 'critical', value: `${stats.pendingDisputes} pending` },
            { label: 'Processing', status: 'healthy', value: 'Normal' },
          ].map((item, i) => (
            <div key={i} className="p-4 text-center">
              <div className={`w-3 h-3 rounded-full mx-auto mb-2 ${
                item.status === 'healthy' ? 'bg-green-500' :
                item.status === 'warning' ? 'bg-amber-500' : 'bg-red-500'
              }`} />
              <p className="text-xs font-semibold text-slate-500 uppercase">{item.label}</p>
              <p className="text-sm font-bold text-slate-900 mt-0.5">{item.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
