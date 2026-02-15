import React, { useEffect, useState, useCallback } from "react";
import { Link } from 'react-router-dom';
import { supabase } from '../../../supabase';
import {
  TrendingUp, TrendingDown, IndianRupee, Wallet, Activity, RefreshCw,
  Calendar, ArrowRight, AlertTriangle, AlertCircle, XCircle, CheckCircle, Clock,
} from 'lucide-react';
import StatCard from '../../../components/admin/StatCard';
import { SkeletonStats, RelativeTime } from '../../../components/trader';
import { formatINR } from '../../../utils/format';

/* ─── Alert Card ─── */
const AlertCard = ({ alert }) => {
  const typeStyles = {
    critical: { bg: 'bg-red-50', border: 'border-red-200', icon: XCircle, iconColor: 'text-red-600' },
    warning: { bg: 'bg-amber-50', border: 'border-amber-200', icon: AlertTriangle, iconColor: 'text-amber-600' },
    info: { bg: 'bg-blue-50', border: 'border-blue-200', icon: AlertCircle, iconColor: 'text-blue-600' },
    success: { bg: 'bg-green-50', border: 'border-green-200', icon: CheckCircle, iconColor: 'text-green-600' },
  };
  const style = typeStyles[alert.type] || typeStyles.info;
  const Icon = style.icon;

  return (
    <Link to={alert.link || '#'} className={`${style.bg} ${style.border} border rounded-xl p-3 flex items-start gap-3 hover:shadow-sm transition-shadow`}>
      <Icon className={`w-5 h-5 ${style.iconColor} flex-shrink-0 mt-0.5`} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-900 text-sm">{alert.title}</p>
        <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{alert.message}</p>
      </div>
    </Link>
  );
};

/* ─── Recent Transaction ─── */
function RecentTransaction({ tx }) {
  const isPayin = tx.type === 'payin';
  const statusColors = {
    success: 'bg-green-100 text-green-700',
    completed: 'bg-green-100 text-green-700',
    pending: 'bg-yellow-100 text-yellow-700',
    assigned: 'bg-blue-100 text-blue-700',
    processing: 'bg-yellow-100 text-yellow-700',
    failed: 'bg-red-100 text-red-700',
    rejected: 'bg-red-100 text-red-700',
    expired: 'bg-slate-100 text-slate-600',
  };

  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0">
      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${isPayin ? 'bg-green-100' : 'bg-blue-100'}`}>
        {isPayin ? <TrendingUp className="text-green-600" size={16} /> : <TrendingDown className="text-blue-600" size={16} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-900 text-sm">{isPayin ? 'Payin' : 'Payout'}</p>
        <p className="text-xs text-slate-400 truncate">{tx.utr || tx.id?.slice(-8)}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={`font-bold text-sm ${isPayin ? 'text-green-600' : 'text-blue-600'}`}>
          {isPayin ? '+' : '−'}₹{Number(tx.amount || 0).toLocaleString()}
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

export default function TraderDashboard() {
  const [traderId, setTraderId] = useState(null);
  const [stats, setStats] = useState({
    payins: 0, payouts: 0, 
    payinCommission: 0, payoutCommission: 0, pendingCommission: 0, 
    overallCommission: 0, lifetimeCommission: 0,
    balance: 0, securityHold: 0,
    commissionBalance: 0, lifetimeEarnings: 0,
    pendingPayins: 0, pendingPayoutsCount: 0, pendingDisputes: 0,
  });
  const [alerts, setAlerts] = useState([]);
  const [recentTx, setRecentTx] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  
  // Date filters
  const [datePreset, setDatePreset] = useState('today');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  const fetchAlerts = useCallback(async (trader) => {
    const alertsList = [];

    try {
      // Check for pending disputes
      const { data: disputes, count: disputeCount } = await supabase
        .from('disputes')
        .select('*', { count: 'exact' })
        .eq('trader_id', trader.id)
        .in('status', ['pending', 'routed_to_trader'])
        .order('created_at', { ascending: false })
        .limit(3);

      if (disputeCount > 0) {
        alertsList.push({
          id: 'disputes',
          type: 'warning',
          title: `${disputeCount} Dispute${disputeCount > 1 ? 's' : ''} Pending`,
          message: 'You have disputes requiring your response',
          link: '/trader/dispute',
        });
      }

      // Low balance warning
      const workingBalance = Number(trader.balance || 0) - Number(trader.security_hold || 0);
      if (workingBalance < 5000) {
        alertsList.push({
          id: 'low-balance',
          type: workingBalance < 1000 ? 'critical' : 'warning',
          title: 'Low Balance Warning',
          message: `Working balance is ₹${workingBalance.toLocaleString()}. Consider adding funds.`,
          link: '/trader/balance',
        });
      }

      // Check for assigned payouts awaiting action
      const { count: assignedPayouts } = await supabase
        .from('payouts')
        .select('id', { count: 'exact', head: true })
        .eq('trader_id', trader.id)
        .eq('status', 'assigned');

      if (assignedPayouts > 0) {
        alertsList.push({
          id: 'assigned-payouts',
          type: 'info',
          title: `${assignedPayouts} Payout${assignedPayouts > 1 ? 's' : ''} Assigned`,
          message: 'New payouts assigned to you for processing',
          link: '/trader/payout',
        });
      }

    } catch (e) {
      console.error('Error fetching alerts:', e);
    }

    setAlerts(alertsList);
  }, []);

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

      const [piCRes, piPRes, poVerifiedRes, poPendingRes, poPRes, disputesRes, recentPayins, recentPayouts] = await Promise.all([
        supabase.from('payins').select('amount,commission').eq('trader_id', trader.id).eq('status', 'completed').gte('completed_at', fromDate).lte('completed_at', toDate),
        supabase.from('payins').select('id', { count: 'exact', head: true }).eq('trader_id', trader.id).eq('status', 'pending'),
        // Verified payouts (commission already credited)
        supabase.from('payouts').select('amount,commission').eq('trader_id', trader.id).eq('status', 'completed').eq('verification_status', 'verified').gte('completed_at', fromDate).lte('completed_at', toDate),
        // Pending verification payouts (commission not yet credited) - includes NULL and non-verified
        supabase.from('payouts').select('amount,commission').eq('trader_id', trader.id).eq('status', 'completed').or('verification_status.is.null,verification_status.neq.verified').gte('completed_at', fromDate).lte('completed_at', toDate),
        supabase.from('payouts').select('id', { count: 'exact', head: true }).eq('trader_id', trader.id).in('status', ['pending', 'assigned']),
        supabase.from('disputes').select('id', { count: 'exact', head: true }).eq('trader_id', trader.id).in('status', ['pending', 'routed_to_trader']),
        supabase.from('payins').select('*').eq('trader_id', trader.id).order('created_at', { ascending: false }).limit(5),
        supabase.from('payouts').select('*').eq('trader_id', trader.id).order('created_at', { ascending: false }).limit(5),
      ]);

      let payins = 0, commission = 0;
      (piCRes.data || []).forEach(v => { payins += Number(v.amount || 0); commission += Number(v.commission || 0); });

      const payoutRate = Number(trader.payout_commission || 1) / 100;
      
      // Verified payouts (earned commission)
      let verifiedPayouts = 0, verifiedPayoutCommission = 0;
      (poVerifiedRes.data || []).forEach(v => { 
        const amt = Number(v.amount || 0);
        verifiedPayouts += amt; 
        verifiedPayoutCommission += Number(v.commission || 0) || (amt * payoutRate);
      });
      
      // Pending verification payouts (pending commission)
      let pendingPayouts = 0, pendingPayoutCommission = 0;
      (poPendingRes.data || []).forEach(v => { 
        const amt = Number(v.amount || 0);
        pendingPayouts += amt; 
        pendingPayoutCommission += Number(v.commission || 0) || (amt * payoutRate);
      });
      
      const totalPayouts = verifiedPayouts + pendingPayouts;

      const rawBalance = Number(trader.balance || 0);
      const securityHold = Number(trader.security_hold || 0);

      // Combine and sort recent transactions
      const recent = [
        ...(recentPayins.data || []).map(d => ({ ...d, type: 'payin' })),
        ...(recentPayouts.data || []).map(d => ({ ...d, type: 'payout' })),
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 8);

      // Overall commission for this period = payin + verified payout commission
      const periodOverallCommission = commission + verifiedPayoutCommission;
      
      setStats({
        payins, 
        payouts: totalPayouts, 
        payinCommission: commission,
        payoutCommission: verifiedPayoutCommission,
        pendingCommission: pendingPayoutCommission,
        overallCommission: periodOverallCommission,
        lifetimeCommission: Number(trader.overall_commission || 0),
        balance: rawBalance - securityHold,
        securityHold,
        commissionBalance: Number(trader.commission_balance || 0),
        lifetimeEarnings: Number(trader.lifetime_earnings || trader.overall_commission || 0),
        pendingPayins: piPRes.count || 0,
        pendingPayoutsCount: poPRes.count || 0,
        pendingDisputes: disputesRes.count || 0,
      });

      setRecentTx(recent);
      fetchAlerts(trader);
    } catch (e) {
      setError("Failed to load stats: " + e.message);
      console.error(e);
    }
    setLoading(false); 
    setRefreshing(false);
  }, [datePreset, dateFrom, dateTo, fetchAlerts]);

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

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Requires Attention
          </h3>
          <div className="grid gap-2">
            {alerts.map(alert => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </div>
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

      {/* Primary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        <StatCard title={`${periodLabel} Payins`} value={`₹${stats.payins.toLocaleString()}`} icon={TrendingUp} color="green" loading={loading} />
        <StatCard title={`${periodLabel} Payouts`} value={`₹${stats.payouts.toLocaleString()}`} icon={TrendingDown} color="blue" loading={loading} />
        <StatCard title={`${periodLabel} Overall Commission`} value={`₹${stats.overallCommission.toLocaleString()}`} icon={IndianRupee} color="purple" loading={loading} className="col-span-2 sm:col-span-1" subtitle={`Lifetime: ₹${stats.lifetimeCommission.toLocaleString()}`} />
      </div>

      {/* Commission stats */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <StatCard title={`${periodLabel} Payin Commission`} value={`₹${stats.payinCommission.toLocaleString()}`} icon={IndianRupee} color="green" loading={loading} />
        <StatCard title={`${periodLabel} Payout Commission`} value={`₹${stats.payoutCommission.toLocaleString()}`} icon={IndianRupee} color="blue" loading={loading} subtitle="Verified" />
        <StatCard title="Pending Commission" value={`₹${stats.pendingCommission.toLocaleString()}`} icon={Clock} color="amber" loading={loading} subtitle="Awaiting verification" />
      </div>

      {/* Pending items */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <StatCard title="Pending Payins" value={stats.pendingPayins.toString()} icon={TrendingUp} color="yellow" loading={loading} subtitle="Awaiting action" />
        <StatCard title="Pending Payouts" value={stats.pendingPayoutsCount.toString()} icon={TrendingDown} color="red" loading={loading} subtitle="Awaiting action" />
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-900">Quick Actions</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3">
          {[
            { href: '/trader/payin', icon: TrendingUp, title: 'Process Payins', sub: `${stats.pendingPayins} pending`, color: '#16a34a', bg: 'from-green-50 to-emerald-50' },
            { href: '/trader/payout', icon: TrendingDown, title: 'Handle Payouts', sub: `${stats.pendingPayoutsCount} pending`, color: '#2563eb', bg: 'from-blue-50 to-cyan-50' },
            { href: '/trader/balance', icon: Wallet, title: 'Manage Balance', sub: `₹${stats.balance.toLocaleString()}`, color: '#9333ea', bg: 'from-purple-50 to-pink-50' },
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <Link key={i} to={item.href}
                className={`flex items-center gap-3 p-4 bg-gradient-to-br ${item.bg} hover:shadow-md active:scale-[0.98] transition-all border-b sm:border-b-0 sm:border-r border-slate-100 last:border-0`}>
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

      {/* Recent Transactions */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Recent Transactions</h3>
          <Link to="/trader/payin" className="text-xs text-green-600 font-semibold hover:text-green-700 flex items-center gap-1">
            View All <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="px-4 py-1">
          {loading ? (
            <div className="py-8 text-center">
              <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : recentTx.length > 0 ? (
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
