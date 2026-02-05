import React, { useEffect, useState } from "react";
import { db } from '../../../firebase';
import {
  collection, query, where, getDocs, Timestamp,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import {
  TrendingUp, TrendingDown, DollarSign, Wallet, Activity, RefreshCw,
} from 'lucide-react';
import StatCard from '../../../components/admin/StatCard';

export default function TraderDashboard() {
  const [stats, setStats] = useState({
    todaysPayins: 0, todaysPayouts: 0, todaysCommission: 0,
    overallCommission: 0, balance: 0,
    pendingPayins: 0, pendingPayouts: 0,
  });
  const [loading, setLoading]       = useState(true);
  const [error,   setError]         = useState("");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { fetchStats(); }, []);

  const fetchStats = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError("");
    const user = getAuth().currentUser;
    if (!user) { setLoading(false); setRefreshing(false); setError("User not logged in."); return; }

    try {
      const traderSnap = await getDocs(query(collection(db, 'trader'), where('uid', '==', user.uid)));
      const trader = !traderSnap.empty ? traderSnap.docs[0].data() : {};

      const today = new Date(); today.setHours(0, 0, 0, 0);
      const todayStart = Timestamp.fromDate(today);

      const [piC, piP, poC, poP] = await Promise.all([
        getDocs(query(collection(db, "payin"),  where("traderId","==",user.uid), where("status","==","completed"), where("completedAt",">=",todayStart))),
        getDocs(query(collection(db, "payin"),  where("traderId","==",user.uid), where("status","==","pending"))),
        getDocs(query(collection(db, "payouts"),where("traderId","==",user.uid), where("status","==","completed"), where("completedAt",">=",todayStart))),
        getDocs(query(collection(db, "payouts"),where("traderId","==",user.uid), where("status","==","pending"))),
      ]);

      let todaysPayins = 0, todaysCommission = 0;
      piC.forEach(d => { const v = d.data(); todaysPayins += Number(v.amount||0); todaysCommission += Number(v.commission||0); });
      let todaysPayouts = 0;
      poC.forEach(d => { todaysPayouts += Number(d.data().amount||0); });

      /* ✅ BUG FIX: show working balance (balance − securityHold), not raw balance */
      const rawBalance    = Number(trader.balance || 0);
      const securityHold  = Number(trader.securityHold || 0);

      setStats({
        todaysPayins, todaysPayouts, todaysCommission,
        overallCommission: Number(trader.overallCommission || 0),
        balance: rawBalance - securityHold,   // ← working balance
        pendingPayins: piP.size,
        pendingPayouts: poP.size,
      });
    } catch (e) {
      setError("Failed to load stats: " + e.message);
      console.error(e);
    }
    setLoading(false); setRefreshing(false);
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Desktop header */}
      <div className="hidden sm:flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">Your overview for today</p>
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

      {/* ── Hero summary strip ── */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-2xl p-4 text-white shadow-md">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-green-200 text-xs font-semibold uppercase tracking-wide mb-0.5">Working Balance</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {loading ? <span className="inline-block w-28 h-7 bg-white/20 animate-pulse rounded" /> : `₹${stats.balance.toLocaleString()}`}
            </h2>
          </div>
          <div className="text-right">
            <p className="text-green-200 text-xs">Today's Net</p>
            <p className="text-lg font-bold">
              {loading ? '—' : `₹${(stats.todaysPayins - stats.todaysPayouts).toLocaleString()}`}
            </p>
          </div>
        </div>
      </div>

      {/* ── Primary stats — 2 col mobile / 3 col desktop ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        <StatCard title="Today's Payins"     value={`₹${stats.todaysPayins.toLocaleString()}`}     icon={TrendingUp}   color="green"   loading={loading} className="stat-card-anim" />
        <StatCard title="Today's Payouts"    value={`₹${stats.todaysPayouts.toLocaleString()}`}    icon={TrendingDown} color="blue"    loading={loading} className="stat-card-anim" />
        <StatCard title="Today's Commission" value={`₹${stats.todaysCommission.toLocaleString()}`} icon={DollarSign}   color="emerald" loading={loading} className="col-span-2 sm:col-span-1 stat-card-anim" />
      </div>

      {/* ── Secondary stats — 2 col mobile / 4 col lg ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Overall Commission" value={`₹${stats.overallCommission.toLocaleString()}`} icon={DollarSign} color="purple" loading={loading} className="stat-card-anim" />
        <StatCard title="Wallet Balance"     value={`₹${stats.balance.toLocaleString()}`}           icon={Wallet}     color="orange" loading={loading} className="stat-card-anim" />
        <StatCard title="Pending Payins"     value={stats.pendingPayins.toString()}                  icon={Activity}   color="yellow" loading={loading} subtitle="Awaiting action" className="stat-card-anim" />
        <StatCard title="Pending Payouts"    value={stats.pendingPayouts.toString()}                 icon={Activity}   color="red"    loading={loading} subtitle="Awaiting action" className="stat-card-anim" />
      </div>

      {/* ── Quick Actions ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-900">Quick Actions</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3">
          {[
            { href: '/trader/payin',   icon: TrendingUp,   title: 'Process Payins',  sub: `${stats.pendingPayins} pending`,  color: '#16a34a', bg: 'from-green-50 to-emerald-50' },
            { href: '/trader/payout',  icon: TrendingDown, title: 'Handle Payouts',  sub: `${stats.pendingPayouts} pending`, color: '#2563eb', bg: 'from-blue-50 to-cyan-50' },
            { href: '/trader/balance', icon: Wallet,       title: 'Manage Balance',  sub: `₹${stats.balance.toLocaleString()}`, color: '#9333ea', bg: 'from-purple-50 to-pink-50' },
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <a
                key={i}
                href={item.href}
                className={`flex items-center gap-3 p-4 bg-gradient-to-br ${item.bg} hover:shadow-md active:scale-[0.98] transition-all`}
                style={{
                  /* ✅ FIX: border-b on mobile (vertical stack), border-r on sm+ (horizontal) */
                  borderBottom: i < 2 ? '1px solid #e2e8f0' : 'none',
                  borderRight : 'none',
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
    </div>
  );
}