import React, { useEffect, useState, useMemo } from 'react';
import { db } from '../../../firebase';
import { collection, query, getDocs, where, Timestamp } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { 
  DollarSign, Search, Filter, Download, RefreshCw, User, Calendar, 
  TrendingUp, TrendingDown, CheckCircle, AlertTriangle, ChevronDown, 
  ChevronUp, AlertCircle, Eye, EyeOff
} from 'lucide-react';

/* ─── Color maps ─── */
const BG_MAP = { green: '#f0fdf4', blue: '#eff6ff', purple: '#faf5ff', orange: '#fff7ed', red: '#fef2f2' };
const BORDER_MAP = { green: '#86efac', blue: '#bfdbfe', purple: '#c4b5fd', orange: '#fdba74', red: '#fecaca' };
const TEXT_MAP = { green: '#15803d', blue: '#1d4ed8', purple: '#7e22ce', orange: '#c2410c', red: '#dc2626' };

const StatCard = ({ title, value, color = 'blue', subtitle, icon: Icon }) => (
  <div className="rounded-xl p-3 sm:p-4" style={{ backgroundColor: BG_MAP[color], border: `1px solid ${BORDER_MAP[color]}` }}>
    <div className="flex items-center gap-2 mb-1">
      {Icon && <Icon className="w-4 h-4" style={{ color: TEXT_MAP[color] }} />}
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{title}</p>
    </div>
    <h3 className="text-xl sm:text-2xl font-bold" style={{ color: TEXT_MAP[color] }}>{value}</h3>
    {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
  </div>
);

/* ─── Expandable Trader Row ─── */
function TraderCommissionRow({ trader, payinData, payoutData, onlyMismatch }) {
  const [expanded, setExpanded] = useState(false);

  // Get rates (payinRate/payinCommission are the same field - just the %)
  const payinRate = Number(trader.payinRate || trader.payinCommission) || 0;
  const payoutRate = Number(trader.payoutRate || trader.payoutCommission) || 0;
  
  // Calculate expected commission from transactions
  const expectedPayinComm = payinData.totalAmount * (payinRate / 100);
  const expectedPayoutComm = payoutData.totalAmount * (payoutRate / 100);
  const expectedTotal = expectedPayinComm + expectedPayoutComm;

  // Actual from trader document (single overallCommission field)
  const actualTotal = Number(trader.overallCommission) || 0;

  // Difference
  const totalDiff = actualTotal - expectedTotal;
  const isMatch = Math.abs(totalDiff) < 1;

  // Severity
  const getSeverity = (diff) => {
    const absDiff = Math.abs(diff);
    if (absDiff < 1) return 'match';
    if (absDiff > 1000) return 'critical';
    if (absDiff > 100) return 'warning';
    return 'minor';
  };

  const severity = getSeverity(totalDiff);
  const severityColors = {
    match: 'bg-green-100 text-green-700 border-green-200',
    minor: 'bg-amber-50 text-amber-700 border-amber-200',
    warning: 'bg-orange-100 text-orange-700 border-orange-200',
    critical: 'bg-red-100 text-red-700 border-red-200',
  };

  // Hide if filter is on and this is a match
  if (onlyMismatch && isMatch) return null;

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${!isMatch ? 'border-amber-200' : 'border-slate-200'}`}>
      {/* Severity stripe */}
      {!isMatch && (
        <div className={`h-1 ${severity === 'critical' ? 'bg-red-500' : severity === 'warning' ? 'bg-orange-400' : 'bg-amber-400'}`} />
      )}
      
      <div className="p-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <Link to={`/admin/traders/${trader.id}`} className="font-semibold text-slate-900 text-sm hover:text-indigo-600 flex items-center gap-1.5">
              <User className="w-4 h-4 text-slate-400" /> {trader.name || 'Unnamed'}
            </Link>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-slate-400 font-mono">{trader.id?.slice(0, 12)}...</span>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs text-slate-500">Payin: {payinRate}% | Payout: {payoutRate}%</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border ${severityColors[severity]}`}>
              {isMatch ? <CheckCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
              {isMatch ? 'Match' : `₹${Math.abs(totalDiff).toLocaleString()}`}
            </div>
            <button 
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
            >
              {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>
          </div>
        </div>

        {/* Summary Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
          <div className={`rounded-lg p-2 border ${isMatch ? 'bg-green-50 border-green-100' : 'bg-amber-50 border-amber-100'}`}>
            <p className="text-xs text-slate-500 mb-0.5">Overall Commission</p>
            <p className={`text-sm font-bold ${isMatch ? 'text-green-700' : 'text-amber-700'}`}>
              ₹{actualTotal.toLocaleString()}
            </p>
            {!isMatch && (
              <p className="text-xs text-amber-600">Expected: ₹{expectedTotal.toLocaleString()}</p>
            )}
          </div>
          <div className="bg-slate-50 rounded-lg p-2 border border-slate-200">
            <p className="text-xs text-slate-500 mb-0.5">Expected Breakdown</p>
            <p className="text-xs font-medium text-slate-600">
              Payin: ₹{expectedPayinComm.toLocaleString()}
            </p>
            <p className="text-xs font-medium text-slate-600">
              Payout: ₹{expectedPayoutComm.toLocaleString()}
            </p>
          </div>
          <div className="bg-blue-50 rounded-lg p-2 border border-blue-100">
            <p className="text-xs text-blue-600 mb-0.5">Payin Volume</p>
            <p className="text-sm font-bold text-blue-700">₹{payinData.totalAmount.toLocaleString()}</p>
            <p className="text-xs text-blue-500">{payinData.count} txns</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-2 border border-purple-100">
            <p className="text-xs text-purple-600 mb-0.5">Payout Volume</p>
            <p className="text-sm font-bold text-purple-700">₹{payoutData.totalAmount.toLocaleString()}</p>
            <p className="text-xs text-purple-500">{payoutData.count} txns</p>
          </div>
        </div>

        {/* Expanded Details */}
        {expanded && (
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
            {/* Calculation breakdown */}
            <div className="bg-slate-50 rounded-lg p-3 text-xs">
              <p className="font-bold text-slate-700 mb-2">📊 Calculation Breakdown</p>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Payin commission:</span>
                  <span className="font-mono">₹{payinData.totalAmount.toLocaleString()} × {payinRate}% = <strong>₹{expectedPayinComm.toLocaleString()}</strong></span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Payout commission:</span>
                  <span className="font-mono">₹{payoutData.totalAmount.toLocaleString()} × {payoutRate}% = <strong>₹{expectedPayoutComm.toLocaleString()}</strong></span>
                </div>
                <div className="border-t border-slate-200 pt-2 flex justify-between items-center">
                  <span className="text-slate-700 font-semibold">Expected Total:</span>
                  <span className="font-mono font-bold">₹{expectedTotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-700 font-semibold">Actual (overallCommission):</span>
                  <span className={`font-mono font-bold ${isMatch ? 'text-green-600' : 'text-amber-600'}`}>
                    ₹{actualTotal.toLocaleString()}
                  </span>
                </div>
                {!isMatch && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-700 font-semibold">Difference:</span>
                    <span className={`font-mono font-bold ${totalDiff > 0 ? 'text-orange-600' : 'text-red-600'}`}>
                      {totalDiff > 0 ? '+' : ''}₹{totalDiff.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Mismatch reason hints */}
            {!isMatch && (
              <div className="bg-amber-50 rounded-lg p-3 text-xs border border-amber-200">
                <p className="font-bold text-amber-700 mb-1">⚠️ Possible Reasons:</p>
                <ul className="text-amber-600 space-y-0.5 list-disc list-inside">
                  {totalDiff > 0 && <li>Manual commission adjustment was added</li>}
                  {totalDiff < 0 && <li>Some transactions may not be marked as completed</li>}
                  <li>Commission rate changed during the period</li>
                  <li>Date filter may exclude some transactions</li>
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main Component ─── */
export default function AdminCommission() {
  const [traders, setTraders] = useState([]);
  const [payinsByTrader, setPayinsByTrader] = useState({});
  const [payoutsByTrader, setPayoutsByTrader] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [onlyMismatch, setOnlyMismatch] = useState(false);
  const [sortBy, setSortBy] = useState('mismatch'); // 'mismatch' | 'name' | 'volume'

  useEffect(() => {
    fetchData();
  }, [dateFrom, dateTo]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch traders
      const tradersSnap = await getDocs(collection(db, 'trader'));
      const tradersList = [];
      tradersSnap.forEach(d => tradersList.push({ id: d.id, ...d.data() }));
      setTraders(tradersList);

      // Build date constraints
      const fromDate = dateFrom ? Timestamp.fromDate(new Date(dateFrom)) : null;
      const toDate = dateTo ? Timestamp.fromDate(new Date(dateTo + 'T23:59:59')) : null;

      // Fetch completed payins
      let payinQuery = query(collection(db, 'payin'), where('status', '==', 'completed'));
      const payinsSnap = await getDocs(payinQuery);

      // Fetch completed payouts
      let payoutQuery = query(collection(db, 'payouts'), where('status', '==', 'completed'));
      const payoutsSnap = await getDocs(payoutQuery);

      // Aggregate payins by trader
      const payinsData = {};
      payinsSnap.forEach(d => {
        const data = d.data();
        const tid = data.traderId;
        if (!tid) return;

        // Date filter (client-side since Firestore compound queries are limited)
        if (fromDate && data.completedAt && data.completedAt < fromDate) return;
        if (toDate && data.completedAt && data.completedAt > toDate) return;

        if (!payinsData[tid]) payinsData[tid] = { totalAmount: 0, count: 0 };
        payinsData[tid].totalAmount += Number(data.amount) || 0;
        payinsData[tid].count += 1;
      });
      setPayinsByTrader(payinsData);

      // Aggregate payouts by trader
      const payoutsData = {};
      payoutsSnap.forEach(d => {
        const data = d.data();
        const tid = data.traderId;
        if (!tid) return;

        // Date filter
        if (fromDate && data.completedAt && data.completedAt < fromDate) return;
        if (toDate && data.completedAt && data.completedAt > toDate) return;

        if (!payoutsData[tid]) payoutsData[tid] = { totalAmount: 0, count: 0 };
        payoutsData[tid].totalAmount += Number(data.amount) || 0;
        payoutsData[tid].count += 1;
      });
      setPayoutsByTrader(payoutsData);

    } catch (e) {
      console.error('Commission fetch error:', e);
      setError(e.message);
    }
    setLoading(false);
  };

  // Filter and sort traders
  const processedTraders = useMemo(() => {
    let result = traders;

    // Search filter
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(t => 
        t.name?.toLowerCase().includes(s) || 
        t.id?.toLowerCase().includes(s) ||
        t.phone?.includes(s)
      );
    }

    // Calculate mismatch for each trader for sorting
    result = result.map(t => {
      const payinData = payinsByTrader[t.id] || { totalAmount: 0, count: 0 };
      const payoutData = payoutsByTrader[t.id] || { totalAmount: 0, count: 0 };
      const payinRate = Number(t.payinRate || t.payinCommission) || 0;
      const payoutRate = Number(t.payoutRate || t.payoutCommission) || 0;
      
      const expectedTotal = (payinData.totalAmount * (payinRate / 100)) + (payoutData.totalAmount * (payoutRate / 100));
      const actualTotal = Number(t.overallCommission) || 0;
      
      const mismatch = Math.abs(actualTotal - expectedTotal);
      const totalVolume = payinData.totalAmount + payoutData.totalAmount;

      return { ...t, _mismatch: mismatch, _volume: totalVolume };
    });

    // Sort
    if (sortBy === 'mismatch') {
      result.sort((a, b) => b._mismatch - a._mismatch);
    } else if (sortBy === 'volume') {
      result.sort((a, b) => b._volume - a._volume);
    } else if (sortBy === 'name') {
      result.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }

    return result;
  }, [traders, search, sortBy, payinsByTrader, payoutsByTrader]);

  // Calculate totals
  const totals = useMemo(() => {
    let totalActual = 0, mismatchCount = 0;
    let totalExpectedPayin = 0, totalExpectedPayout = 0;

    traders.forEach(t => {
      const payinData = payinsByTrader[t.id] || { totalAmount: 0, count: 0 };
      const payoutData = payoutsByTrader[t.id] || { totalAmount: 0, count: 0 };
      const payinRate = Number(t.payinRate || t.payinCommission) || 0;
      const payoutRate = Number(t.payoutRate || t.payoutCommission) || 0;

      const expectedPayin = payinData.totalAmount * (payinRate / 100);
      const expectedPayout = payoutData.totalAmount * (payoutRate / 100);
      const expectedTotal = expectedPayin + expectedPayout;
      const actual = Number(t.overallCommission) || 0;

      totalExpectedPayin += expectedPayin;
      totalExpectedPayout += expectedPayout;
      totalActual += actual;

      if (Math.abs(actual - expectedTotal) >= 1) {
        mismatchCount++;
      }
    });

    const totalExpected = totalExpectedPayin + totalExpectedPayout;

    return { 
      totalExpected,
      totalActual,
      diff: totalActual - totalExpected,
      mismatchCount,
      totalTraders: traders.length
    };
  }, [traders, payinsByTrader, payoutsByTrader]);

  const handleExport = () => {
    const escapeCSV = (val) => {
      const str = String(val ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csv = [
      ['Trader ID', 'Trader Name', 'Payin Rate %', 'Payout Rate %', 'Payin Volume', 'Payout Volume', 
       'Expected Payin Comm', 'Expected Payout Comm', 'Expected Total', 'Actual (overallCommission)', 
       'Difference', 'Status'],
      ...processedTraders.map(t => {
        const payinData = payinsByTrader[t.id] || { totalAmount: 0, count: 0 };
        const payoutData = payoutsByTrader[t.id] || { totalAmount: 0, count: 0 };
        const payinRate = Number(t.payinRate || t.payinCommission) || 0;
        const payoutRate = Number(t.payoutRate || t.payoutCommission) || 0;
        
        const expectedPayin = payinData.totalAmount * (payinRate / 100);
        const expectedPayout = payoutData.totalAmount * (payoutRate / 100);
        const expectedTotal = expectedPayin + expectedPayout;
        const actual = Number(t.overallCommission) || 0;
        
        const diff = actual - expectedTotal;
        const status = Math.abs(diff) < 1 ? 'Match' : 'Mismatch';

        return [
          t.id, t.name || '', payinRate, payoutRate,
          payinData.totalAmount, payoutData.totalAmount,
          expectedPayin.toFixed(2), expectedPayout.toFixed(2),
          expectedTotal.toFixed(2), actual,
          diff.toFixed(2), status
        ];
      })
    ].map(r => r.map(escapeCSV).join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `commission-audit-${dateFrom || 'all'}-${dateTo || 'all'}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Date presets
  const applyDatePreset = (preset) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (preset) {
      case 'today':
        setDateFrom(today.toISOString().split('T')[0]);
        setDateTo(today.toISOString().split('T')[0]);
        break;
      case 'week':
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        setDateFrom(weekAgo.toISOString().split('T')[0]);
        setDateTo(today.toISOString().split('T')[0]);
        break;
      case 'month':
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        setDateFrom(monthAgo.toISOString().split('T')[0]);
        setDateTo(today.toISOString().split('T')[0]);
        break;
      case 'all':
      default:
        setDateFrom('');
        setDateTo('');
        break;
    }
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl shadow-sm">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
            Commission Audit
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 ml-11">Find commission mismatches</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchData} className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 text-sm font-semibold">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 text-sm font-semibold">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* Mismatch Alert Banner */}
      {totals.mismatchCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <span className="font-semibold text-amber-700">
              {totals.mismatchCount} of {totals.totalTraders} traders have mismatches
            </span>
          </div>
          <button
            onClick={() => setOnlyMismatch(!onlyMismatch)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              onlyMismatch 
                ? 'bg-amber-200 text-amber-800' 
                : 'bg-white text-amber-700 border border-amber-300'
            }`}
          >
            {onlyMismatch ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {onlyMismatch ? 'Show All' : 'Show Only Mismatches'}
          </button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard 
          title="Actual Commission" 
          value={`₹${totals.totalActual.toLocaleString()}`} 
          color="green" 
          subtitle="Sum of overallCommission"
          icon={DollarSign}
        />
        <StatCard 
          title="Expected Commission" 
          value={`₹${totals.totalExpected.toLocaleString()}`} 
          color="blue"
          subtitle="Volume × Rate %"
          icon={TrendingUp}
        />
        <StatCard 
          title="Mismatches" 
          value={totals.mismatchCount}
          color={totals.mismatchCount > 0 ? 'orange' : 'green'}
          subtitle={`of ${totals.totalTraders} traders`}
          icon={totals.mismatchCount > 0 ? AlertTriangle : CheckCircle}
        />
        <StatCard 
          title="Difference" 
          value={`${totals.diff >= 0 ? '+' : ''}₹${totals.diff.toLocaleString()}`} 
          color={Math.abs(totals.diff) < 1 ? 'green' : totals.diff > 0 ? 'orange' : 'red'}
          subtitle={Math.abs(totals.diff) < 1 ? '✓ Balanced' : 'Needs review'}
          icon={Math.abs(totals.diff) < 1 ? CheckCircle : AlertCircle}
        />
      </div>

      {/* Date Presets */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs font-bold text-slate-500">Period:</span>
        {['all', 'today', 'week', 'month'].map(preset => (
          <button
            key={preset}
            onClick={() => applyDatePreset(preset)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              (preset === 'all' && !dateFrom && !dateTo) ||
              (preset === 'today' && dateFrom === new Date().toISOString().split('T')[0])
                ? 'bg-emerald-100 text-emerald-700 ring-2 ring-emerald-300'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {preset === 'all' ? 'All Time' : preset.charAt(0).toUpperCase() + preset.slice(1)}
          </button>
        ))}
      </div>

      {/* Search and filters */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input 
            type="text" 
            placeholder="Search trader name, ID, phone..." 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white" 
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
        >
          <option value="mismatch">Sort: Biggest Mismatch</option>
          <option value="volume">Sort: Highest Volume</option>
          <option value="name">Sort: Name A-Z</option>
        </select>
        <button 
          onClick={() => setShowFilters(!showFilters)} 
          className={`w-10 h-10 flex items-center justify-center rounded-xl border flex-shrink-0 ${showFilters ? 'bg-emerald-50 border-emerald-300 text-emerald-600' : 'bg-white border-slate-200 text-slate-500'}`}
        >
          <Filter className="w-4 h-4" />
        </button>
      </div>

      {showFilters && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">
              <Calendar className="w-3 h-3 inline mr-1" />From Date
            </label>
            <input 
              type="date" 
              value={dateFrom} 
              onChange={e => setDateFrom(e.target.value)} 
              className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs" 
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">
              <Calendar className="w-3 h-3 inline mr-1" />To Date
            </label>
            <input 
              type="date" 
              value={dateTo} 
              onChange={e => setDateTo(e.target.value)} 
              className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs" 
            />
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-red-700">Failed to load data</p>
            <p className="text-sm text-red-600">{error}</p>
          </div>
          <button
            onClick={fetchData}
            className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm font-semibold hover:bg-red-200"
          >
            Retry
          </button>
        </div>
      )}

      {/* Trader rows */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
        </div>
      ) : processedTraders.length > 0 ? (
        <div className="space-y-3">
          {processedTraders.map(trader => (
            <TraderCommissionRow 
              key={trader.id} 
              trader={trader} 
              payinData={payinsByTrader[trader.id] || { totalAmount: 0, count: 0 }}
              payoutData={payoutsByTrader[trader.id] || { totalAmount: 0, count: 0 }}
              onlyMismatch={onlyMismatch}
            />
          ))}
          
          {/* If only mismatch filter is on and none shown */}
          {onlyMismatch && totals.mismatchCount === 0 && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-10 text-center">
              <CheckCircle className="w-12 h-12 text-green-300 mx-auto mb-3" />
              <p className="text-green-700 font-semibold">All commissions match!</p>
              <p className="text-green-600 text-sm mt-1">No discrepancies found</p>
            </div>
          )}
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
