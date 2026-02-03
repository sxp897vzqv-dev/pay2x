import React, { useEffect, useState } from "react";
import { db } from '../../firebase';
import {
  collection, query, where, getDocs, onSnapshot, Timestamp, orderBy, limit,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import {
  TrendingUp, TrendingDown, DollarSign, Activity, RefreshCw,
  AlertCircle, CheckCircle, Clock, ArrowUpRight, ArrowDownRight,
  Wallet, PieChart, Download, IndianRupee,
} from 'lucide-react';

/* ─── Static color maps ─── */
const BG_MAP = {
  blue:    '#eff6ff', green:   '#f0fdf4', purple:  '#faf5ff',
  orange:  '#fff7ed', emerald: '#ecfdf5', yellow:  '#fefce8', red: '#fef2f2',
};
const ICON_BG_MAP = {
  blue:    { bg: '#dbeafe', text: '#2563eb' },
  green:   { bg: '#bbf7d0', text: '#16a34a' },
  purple:  { bg: '#e9d5ff', text: '#9333ea' },
  orange:  { bg: '#fed7aa', text: '#ea580c' },
  emerald: { bg: '#a7f3d0', text: '#059669' },
  yellow:  { bg: '#fde047', text: '#ca8a04' },
  red:     { bg: '#fecaca', text: '#dc2626' },
};
const TEXT_MAP = {
  blue:    '#1d4ed8', green:   '#15803d', purple:  '#7e22ce',
  orange:  '#c2410c', emerald: '#047857', yellow:  '#a16207', red: '#b91c1c',
};
const BORDER_MAP = {
  blue:    '#bfdbfe', green:   '#86efac', purple:  '#c4b5fd',
  orange:  '#fdba74', emerald: '#6ee7b7', yellow:  '#fcd34d', red: '#fca5a5',
};

/* ─── StatCard ─── */
const StatCard = ({ title, value, icon: Icon, color = 'blue', loading, subtitle, trend }) => (
  <div
    className="rounded-xl p-3 sm:p-4"
    style={{
      backgroundColor: BG_MAP[color],
      border: `1px solid ${BORDER_MAP[color]}`,
    }}
  >
    <div className="flex items-center justify-between mb-2">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide truncate pr-2">{title}</p>
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: ICON_BG_MAP[color].bg }}>
        <Icon className="w-3.5 h-3.5" style={{ color: ICON_BG_MAP[color].text }} />
      </div>
    </div>
    {loading ? (
      <div className="h-6 w-20 bg-slate-200 animate-pulse rounded" />
    ) : (
      <>
        <h3 className="text-xl sm:text-2xl font-bold leading-tight" style={{ color: TEXT_MAP[color] }}>{value}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        {trend && (
          <div className={`flex items-center gap-1 mt-1 text-xs font-semibold ${trend.positive ? 'text-green-600' : 'text-red-600'}`}>
            {trend.positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {trend.value}
          </div>
        )}
      </>
    )}
  </div>
);

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
        <p className="text-xs text-slate-400 truncate">
          {tx.orderId || tx.payoutId || tx.id.slice(-8)}
        </p>
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

export default function MerchantDashboard() {
  const [stats, setStats] = useState({
    todayPayins: 0, todayPayouts: 0, successRate: 0,
    availableBalance: 0, pendingSettlement: 0, reservedAmount: 0,
    totalTransactions: 0, failedTransactions: 0,
    yesterdayPayins: 0, // For comparison
  });
  const [recentTx, setRecentTx] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { fetchStats(); }, []);

  const fetchStats = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    const user = getAuth().currentUser;
    if (!user) { setLoading(false); setRefreshing(false); return; }

    try {
      // Get merchant data
      const merchantSnap = await getDocs(query(collection(db, 'merchant'), where('uid', '==', user.uid)));
      const merchant = !merchantSnap.empty ? merchantSnap.docs[0].data() : {};

      const today = new Date(); today.setHours(0, 0, 0, 0);
      const todayStart = Timestamp.fromDate(today);
      
      const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStart = Timestamp.fromDate(yesterday);

      // Fetch today's transactions
      const [payinSnap, payoutSnap, allPayinsSnap, allPayoutsSnap, yesterdayPayinsSnap] = await Promise.all([
        getDocs(query(collection(db, "merchantPayins"), where("merchantId","==",user.uid), where("createdAt",">=",todayStart))),
        getDocs(query(collection(db, "merchantPayouts"), where("merchantId","==",user.uid), where("createdAt",">=",todayStart))),
        getDocs(query(collection(db, "merchantPayins"), where("merchantId","==",user.uid), orderBy("createdAt","desc"), limit(5))),
        getDocs(query(collection(db, "merchantPayouts"), where("merchantId","==",user.uid), orderBy("createdAt","desc"), limit(5))),
        getDocs(query(collection(db, "merchantPayins"), where("merchantId","==",user.uid), where("createdAt",">=",yesterdayStart), where("createdAt","<",todayStart))),
      ]);

      let todayPayins = 0, todayPayouts = 0, successCount = 0, totalCount = 0, yesterdayPayins = 0;
      
      payinSnap.forEach(d => {
        const data = d.data();
        todayPayins += Number(data.amount || 0);
        totalCount++;
        if (data.status === 'success') successCount++;
      });

      payoutSnap.forEach(d => {
        todayPayouts += Number(d.data().amount || 0);
      });

      yesterdayPayinsSnap.forEach(d => {
        yesterdayPayins += Number(d.data().amount || 0);
      });

      const successRate = totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 0;

      // Recent transactions - combine payins and payouts
      const recent = [];
      allPayinsSnap.forEach(d => recent.push({ id: d.id, type: 'payin', ...d.data() }));
      allPayoutsSnap.forEach(d => recent.push({ id: d.id, type: 'payout', ...d.data() }));
      recent.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

      setStats({
        todayPayins,
        todayPayouts,
        yesterdayPayins,
        successRate,
        availableBalance: Number(merchant.availableBalance || 0),
        pendingSettlement: Number(merchant.pendingSettlement || 0),
        reservedAmount: Number(merchant.reservedAmount || 0),
        totalTransactions: totalCount,
        failedTransactions: totalCount - successCount,
      });

      setRecentTx(recent.slice(0, 10));
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
    setRefreshing(false);
  };

  const handleExportReport = () => {
    const csv = [
      ['Metric', 'Value'],
      ['Today Payins', `₹${stats.todayPayins}`],
      ['Today Payouts', `₹${stats.todayPayouts}`],
      ['Success Rate', `${stats.successRate}%`],
      ['Available Balance', `₹${stats.availableBalance}`],
    ].map(r => r.join(',')).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `merchant-report-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Calculate growth percentage
  const payinGrowth = stats.yesterdayPayins > 0 
    ? ((stats.todayPayins - stats.yesterdayPayins) / stats.yesterdayPayins * 100).toFixed(1)
    : (stats.todayPayins > 0 ? '+100' : '0');
  const payinGrowthPositive = Number(payinGrowth) >= 0;

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
            className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl hover:bg-blue-100 text-sm font-semibold">
            <Download className="w-4 h-4" /> Export
          </button>
          <button onClick={() => fetchStats(true)} disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors text-sm font-semibold disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Mobile refresh */}
      <div className="flex sm:hidden justify-between items-center">
        <button onClick={handleExportReport}
          className="p-2 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 active:bg-blue-200">
          <Download className="w-4 h-4 text-blue-600" />
        </button>
        <button onClick={() => fetchStats(true)} disabled={refreshing}
          className="p-2 bg-purple-50 border border-purple-200 rounded-xl hover:bg-purple-100 active:bg-purple-200 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 text-purple-600 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Hero Balance Card */}
      <div className="bg-gradient-to-br from-purple-600 to-blue-600 rounded-2xl p-4 sm:p-5 text-white shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-purple-200 text-xs font-semibold uppercase tracking-wide mb-0.5">Available Balance</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-ui)' }}>
              ₹{stats.availableBalance.toLocaleString()}
            </h2>
          </div>
          <div className="text-right">
            <p className="text-purple-200 text-xs">Today's Net</p>
            <p className="text-lg font-bold">
              {loading ? '—' : `₹${(stats.todayPayins - stats.todayPayouts).toLocaleString()}`}
            </p>
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

      {/* Primary stats - 2 col mobile / 3 col desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        <StatCard 
          title="Today's Payins" 
          value={`₹${stats.todayPayins.toLocaleString()}`} 
          icon={TrendingUp} 
          color="green" 
          loading={loading}
          trend={{ positive: payinGrowthPositive, value: `${payinGrowthPositive ? '+' : ''}${payinGrowth}%` }}
        />
        <StatCard 
          title="Today's Payouts" 
          value={`₹${stats.todayPayouts.toLocaleString()}`} 
          icon={TrendingDown} 
          color="blue" 
          loading={loading}
        />
        <StatCard 
          title="Success Rate" 
          value={`${stats.successRate}%`} 
          icon={CheckCircle} 
          color="emerald" 
          loading={loading}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {/* Secondary stats - 2 col mobile / 4 col lg */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard 
          title="Total Transactions" 
          value={stats.totalTransactions.toString()} 
          icon={Activity} 
          color="purple" 
          loading={loading}
          subtitle="Today"
        />
        <StatCard 
          title="Failed Txns" 
          value={stats.failedTransactions.toString()} 
          icon={AlertCircle} 
          color="red" 
          loading={loading}
          subtitle="Requires attention"
        />
        <StatCard 
          title="Wallet Balance" 
          value={`₹${stats.availableBalance.toLocaleString()}`} 
          icon={Wallet} 
          color="orange" 
          loading={loading}
        />
        <StatCard 
          title="Net Revenue" 
          value={`₹${(stats.todayPayins - stats.todayPayouts).toLocaleString()}`} 
          icon={DollarSign} 
          color="yellow" 
          loading={loading}
        />
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-900">Quick Actions</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3">
          {[
            { href: '/merchant/payins', icon: TrendingUp, title: 'View Payins', sub: `${stats.totalTransactions} today`, color: '#16a34a', bg: 'from-green-50 to-emerald-50' },
            { href: '/merchant/payouts', icon: TrendingDown, title: 'Manage Payouts', sub: 'Process withdrawals', color: '#2563eb', bg: 'from-blue-50 to-cyan-50' },
            { href: '/merchant/balance', icon: Wallet, title: 'Request Settlement', sub: `₹${stats.availableBalance.toLocaleString()} available`, color: '#9333ea', bg: 'from-purple-50 to-pink-50' },
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <a
                key={i}
                href={item.href}
                className={`flex items-center gap-3 p-4 bg-gradient-to-br ${item.bg} hover:shadow-md active:scale-[0.98] transition-all`}
                style={{
                  borderBottom: i < 2 ? '1px solid #e2e8f0' : 'none',
                }}
              >
                <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5" style={{ color: item.color }} />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 text-sm">{item.title}</p>
                  <p className="text-xs text-slate-500 truncate">{item.sub}</p>
                </div>
              </a>
            );
          })}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Recent Transactions</h3>
          <a href="/merchant/payins" className="text-xs text-purple-600 font-semibold hover:text-purple-700">View All →</a>
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
