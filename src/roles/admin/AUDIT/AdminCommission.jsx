import React, { useEffect, useState, useMemo } from 'react';
import { db } from '../../../firebase';
import { collection, query, getDocs, where, Timestamp } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { DollarSign, Search, Filter, Download, RefreshCw, User, Calendar, TrendingUp, TrendingDown, CheckCircle, AlertTriangle } from 'lucide-react';

/* ─── Color maps ─── */
const BG_MAP = { green: '#f0fdf4', blue: '#eff6ff', purple: '#faf5ff', orange: '#fff7ed' };
const BORDER_MAP = { green: '#86efac', blue: '#bfdbfe', purple: '#c4b5fd', orange: '#fdba74' };
const TEXT_MAP = { green: '#15803d', blue: '#1d4ed8', purple: '#7e22ce', orange: '#c2410c' };

const StatCard = ({ title, value, color = 'blue', subtitle }) => (
  <div className="rounded-xl p-3 sm:p-4" style={{ backgroundColor: BG_MAP[color], border: `1px solid ${BORDER_MAP[color]}` }}>
    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{title}</p>
    <h3 className="text-xl sm:text-2xl font-bold" style={{ color: TEXT_MAP[color] }}>{value}</h3>
    {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
  </div>
);

function TraderCommissionRow({ trader, payinCommission, payoutCommission }) {
  const expected = payinCommission + payoutCommission;
  const actual = trader.overallCommission || 0;
  const diff = actual - expected;
  const isMatch = Math.abs(diff) < 1;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <Link to={`/admin/traders/${trader.id}`} className="font-semibold text-slate-900 text-sm hover:text-indigo-600 flex items-center gap-1.5">
            <User className="w-4 h-4 text-slate-400" /> {trader.name || 'Unnamed'}
          </Link>
          <p className="text-xs text-slate-400 font-mono" style={{ fontFamily: 'var(--font-mono)' }}>{trader.id?.slice(0, 12)}...</p>
        </div>
        <div className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 ${isMatch ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
          {isMatch ? <CheckCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
          {isMatch ? 'Match' : 'Mismatch'}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mt-3 text-center">
        <div className="bg-green-50 rounded-lg p-2 border border-green-100">
          <p className="text-xs text-green-600 mb-0.5">Payin Comm.</p>
          <p className="text-sm font-bold text-green-700">₹{payinCommission.toLocaleString()}</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-2 border border-blue-100">
          <p className="text-xs text-blue-600 mb-0.5">Payout Comm.</p>
          <p className="text-sm font-bold text-blue-700">₹{payoutCommission.toLocaleString()}</p>
        </div>
        <div className="bg-purple-50 rounded-lg p-2 border border-purple-100">
          <p className="text-xs text-purple-600 mb-0.5">Expected</p>
          <p className="text-sm font-bold text-purple-700">₹{expected.toLocaleString()}</p>
        </div>
        <div className={`rounded-lg p-2 border ${isMatch ? 'bg-green-50 border-green-100' : 'bg-amber-50 border-amber-100'}`}>
          <p className={`text-xs mb-0.5 ${isMatch ? 'text-green-600' : 'text-amber-600'}`}>Actual</p>
          <p className={`text-sm font-bold ${isMatch ? 'text-green-700' : 'text-amber-700'}`}>₹{actual.toLocaleString()}</p>
        </div>
      </div>

      {!isMatch && (
        <div className="mt-2 text-xs text-amber-600 font-semibold">
          Difference: {diff > 0 ? '+' : ''}₹{diff.toLocaleString()}
        </div>
      )}
    </div>
  );
}

export default function AdminCommission() {
  const [traders, setTraders] = useState([]);
  const [commissions, setCommissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    fetchData();
  }, [dateFrom, dateTo]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch traders
      const tradersSnap = await getDocs(collection(db, 'trader'));
      const tradersList = [];
      tradersSnap.forEach(d => tradersList.push({ id: d.id, ...d.data() }));
      setTraders(tradersList);

      // Build date filters
      let payinQuery = query(collection(db, 'payin'), where('status', '==', 'completed'));
      let payoutQuery = query(collection(db, 'payouts'), where('status', '==', 'completed'));

      if (dateFrom) {
        const fromTs = Timestamp.fromDate(new Date(dateFrom));
        payinQuery = query(collection(db, 'payin'), where('status', '==', 'completed'), where('completedAt', '>=', fromTs));
        payoutQuery = query(collection(db, 'payouts'), where('status', '==', 'completed'), where('completedAt', '>=', fromTs));
      }

      // Fetch payins and payouts
      const [payinsSnap, payoutsSnap] = await Promise.all([getDocs(payinQuery), getDocs(payoutQuery)]);

      // Calculate commissions per trader
      const commData = {};
      payinsSnap.forEach(d => {
        const data = d.data();
        const tid = data.traderId;
        if (!commData[tid]) commData[tid] = { payin: 0, payout: 0 };
        commData[tid].payin += Number(data.commission || 0);
      });
      payoutsSnap.forEach(d => {
        const data = d.data();
        const tid = data.traderId;
        if (!commData[tid]) commData[tid] = { payin: 0, payout: 0 };
        commData[tid].payout += Number(data.commission || 0);
      });

      setCommissions(commData);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const filtered = useMemo(() => {
    let result = traders;
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(t => t.name?.toLowerCase().includes(s) || t.id?.toLowerCase().includes(s));
    }
    return result;
  }, [traders, search]);

  const totals = useMemo(() => {
    let totalPayin = 0, totalPayout = 0, totalExpected = 0, totalActual = 0;
    filtered.forEach(t => {
      const c = commissions[t.id] || { payin: 0, payout: 0 };
      totalPayin += c.payin;
      totalPayout += c.payout;
      totalExpected += c.payin + c.payout;
      totalActual += t.overallCommission || 0;
    });
    return { totalPayin, totalPayout, totalExpected, totalActual, diff: totalActual - totalExpected };
  }, [filtered, commissions]);

  const handleExport = () => {
    const csv = [
      ['Trader ID', 'Trader Name', 'Payin Commission', 'Payout Commission', 'Expected', 'Actual', 'Difference'],
      ...filtered.map(t => {
        const c = commissions[t.id] || { payin: 0, payout: 0 };
        const expected = c.payin + c.payout;
        const actual = t.overallCommission || 0;
        return [t.id, t.name || '', c.payin, c.payout, expected, actual, actual - expected];
      })
    ].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `commission-audit-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="hidden sm:flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl shadow-sm"><DollarSign className="w-5 h-5 text-white" /></div>Commission Audit
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 ml-11">Expected vs actual reconciliation</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchData} className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 text-sm font-semibold">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={handleExport} className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 text-sm font-semibold">
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard title="Payin Commission" value={`₹${totals.totalPayin.toLocaleString()}`} color="green" />
        <StatCard title="Payout Commission" value={`₹${totals.totalPayout.toLocaleString()}`} color="blue" />
        <StatCard title="Expected Total" value={`₹${totals.totalExpected.toLocaleString()}`} color="purple" />
        <StatCard title="Actual Total" value={`₹${totals.totalActual.toLocaleString()}`} color={Math.abs(totals.diff) < 1 ? 'green' : 'orange'} subtitle={totals.diff !== 0 ? `Diff: ${totals.diff > 0 ? '+' : ''}₹${totals.diff.toLocaleString()}` : 'Matched'} />
      </div>

      {/* Search and filters */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input type="text" placeholder="Search trader..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white" />
        </div>
        <button onClick={() => setShowFilters(!showFilters)} className={`w-10 h-10 flex items-center justify-center rounded-xl border flex-shrink-0 ${showFilters ? 'bg-emerald-50 border-emerald-300 text-emerald-600' : 'bg-white border-slate-200 text-slate-500'}`}>
          <Filter className="w-4 h-4" />
        </button>
      </div>

      {showFilters && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-bold text-slate-500 mb-1"><Calendar className="w-3 h-3 inline mr-1" />From</label><input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs" /></div>
          <div><label className="block text-xs font-bold text-slate-500 mb-1"><Calendar className="w-3 h-3 inline mr-1" />To</label><input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs" /></div>
        </div>
      )}

      {/* Trader rows */}
      {loading ? (
        <div className="flex items-center justify-center py-12"><RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" /></div>
      ) : filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map(trader => {
            const c = commissions[trader.id] || { payin: 0, payout: 0 };
            return <TraderCommissionRow key={trader.id} trader={trader} payinCommission={c.payin} payoutCommission={c.payout} />;
          })}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <DollarSign className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No traders found</p>
        </div>
      )}
    </div>
  );
}