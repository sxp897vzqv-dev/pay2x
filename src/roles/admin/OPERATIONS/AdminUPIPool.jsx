import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '../../../supabase';
import { Link } from 'react-router-dom';
import { 
  Database, Search, RefreshCw, CheckCircle, ToggleLeft, ToggleRight, 
  User, Trash2, CreditCard, Building, TrendingUp, Clock, 
  Zap, AlertTriangle, Target, X
} from 'lucide-react';
import { logUPIEnabled, logUPIDisabled, logUPIDeleted } from '../../../utils/auditLogger';

// Shared components
import { Toast, FilterPills, SearchInput, CardSkeleton } from '../../../components/admin';

/* ─── Stat Card ─── */
const StatCard = ({ title, value, subtitle, icon: Icon, color = 'indigo' }) => {
  const colors = {
    indigo: 'from-indigo-500 to-indigo-600',
    green: 'from-green-500 to-green-600',
    amber: 'from-amber-500 to-amber-600',
    red: 'from-red-500 to-red-600',
  };
  return (
    <div className={`bg-gradient-to-br ${colors[color]} rounded-xl p-3 text-white`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white/70 text-xs font-semibold">{title}</p>
          <p className="text-xl font-bold">{value}</p>
          {subtitle && <p className="text-white/60 text-xs">{subtitle}</p>}
        </div>
        {Icon && <Icon className="w-8 h-8 text-white/30" />}
      </div>
    </div>
  );
};

/* ─── Health Badge ─── */
function HealthBadge({ health }) {
  const config = {
    healthy: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle, label: 'Healthy' },
    idle: { bg: 'bg-amber-100', text: 'text-amber-700', icon: Clock, label: 'Idle' },
    problem: { bg: 'bg-red-100', text: 'text-red-700', icon: AlertTriangle, label: 'Problem' },
    new: { bg: 'bg-blue-100', text: 'text-blue-700', icon: Zap, label: 'New' },
  };
  const c = config[health] || config.new;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold ${c.bg} ${c.text}`}>
      <c.icon className="w-3 h-3" /> {c.label}
    </span>
  );
}

/* ─── Conversion Ring ─── */
function ConversionRing({ rate, size = 40 }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (rate / 100) * circumference;
  const color = rate >= 70 ? '#22c55e' : rate >= 40 ? '#f59e0b' : '#ef4444';
  
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={radius} stroke="#e5e7eb" strokeWidth="4" fill="none" />
        <circle cx={size/2} cy={size/2} r={radius} stroke={color} strokeWidth="4" fill="none"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold" style={{ color }}>
        {rate}%
      </span>
    </div>
  );
}

/* ─── UPI Card ─── */
function UPICard({ upi, stats, onToggle, onDelete, onUpdateLimit }) {
  const [showLimitInput, setShowLimitInput] = useState(false);
  const [limitValue, setLimitValue] = useState(upi.daily_limit || '');
  
  const isActive = upi.status === 'active';
  const isBank = Boolean(upi.account_number);
  const identifier = upi.upi_id || upi.account_number;

  const getHealth = () => {
    if (!stats || stats.total === 0) return 'new';
    const hoursSinceLastSuccess = stats.lastSuccess 
      ? (Date.now() - stats.lastSuccess) / (1000 * 60 * 60) 
      : Infinity;
    if (stats.conversionRate < 30) return 'problem';
    if (hoursSinceLastSuccess > 24) return 'idle';
    if (stats.conversionRate >= 50) return 'healthy';
    return 'idle';
  };

  const health = getHealth();
  const limitUsed = stats?.todayVolume || 0;
  const limitMax = upi.daily_limit || 0;
  const limitPercent = limitMax > 0 ? Math.min(100, (limitUsed / limitMax) * 100) : 0;

  const handleSaveLimit = () => {
    onUpdateLimit(upi, Number(limitValue) || 0);
    setShowLimitInput(false);
  };

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${!isActive ? 'opacity-60' : ''} ${health === 'problem' ? 'border-red-200' : 'border-slate-200'}`}>
      <div className={`h-1 ${isActive ? (health === 'problem' ? 'bg-red-500' : health === 'idle' ? 'bg-amber-500' : 'bg-green-500') : 'bg-slate-300'}`} />
      
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {isBank ? <Building className="w-4 h-4 text-indigo-500" /> : <CreditCard className="w-4 h-4 text-purple-500" />}
              <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                {isActive ? 'ACTIVE' : 'OFF'}
              </span>
              <HealthBadge health={health} />
            </div>
            <p className="font-mono text-sm font-bold text-slate-900 truncate">{identifier}</p>
            {upi.ifsc && <p className="font-mono text-xs text-slate-500">IFSC: {upi.ifsc}</p>}
            <p className="text-xs text-slate-400 mt-0.5">{upi.holder_name}</p>
          </div>
          
          <div className="flex flex-col items-center gap-1">
            {stats && stats.total > 0 && <ConversionRing rate={stats.conversionRate} />}
            <button onClick={() => onToggle(upi)} className={`p-1.5 rounded-lg ${isActive ? 'bg-green-50 hover:bg-green-100' : 'bg-slate-50 hover:bg-slate-100'}`}>
              {isActive ? <ToggleRight className="w-5 h-5 text-green-600" /> : <ToggleLeft className="w-5 h-5 text-slate-400" />}
            </button>
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-3 gap-2 mb-2">
            <div className="bg-slate-50 rounded-lg p-2 text-center">
              <p className="text-xs text-slate-500">Volume</p>
              <p className="text-sm font-bold text-slate-700">₹{(stats.totalVolume || 0).toLocaleString()}</p>
            </div>
            <div className="bg-green-50 rounded-lg p-2 text-center">
              <p className="text-xs text-green-600">Success</p>
              <p className="text-sm font-bold text-green-700">{stats.completed || 0}</p>
            </div>
            <div className="bg-red-50 rounded-lg p-2 text-center">
              <p className="text-xs text-red-600">Failed</p>
              <p className="text-sm font-bold text-red-700">{stats.failed || 0}</p>
            </div>
          </div>
        )}

        {limitMax > 0 && (
          <div className="mb-2">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500">Daily Limit</span>
              <span className={`font-semibold ${limitPercent >= 90 ? 'text-red-600' : limitPercent >= 70 ? 'text-amber-600' : 'text-slate-600'}`}>
                ₹{limitUsed.toLocaleString()} / ₹{limitMax.toLocaleString()}
              </span>
            </div>
            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all ${limitPercent >= 90 ? 'bg-red-500' : limitPercent >= 70 ? 'bg-amber-500' : 'bg-green-500'}`}
                style={{ width: `${limitPercent}%` }}
              />
            </div>
          </div>
        )}

        {showLimitInput && (
          <div className="flex gap-2 mb-2">
            <input type="number" value={limitValue} onChange={(e) => setLimitValue(e.target.value)}
              placeholder="Daily limit (₹)" className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs" />
            <button onClick={handleSaveLimit} className="px-2 py-1.5 bg-green-500 text-white rounded-lg text-xs font-semibold">Save</button>
            <button onClick={() => setShowLimitInput(false)} className="px-2 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs"><X className="w-3 h-3" /></button>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-slate-500 mb-3 flex-wrap">
          <span className={`px-2 py-0.5 rounded-lg font-semibold ${upi.priority === 'VIP' ? 'bg-purple-100 text-purple-700' : upi.priority === 'High' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
            {upi.priority || 'Normal'}
          </span>
          <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 font-semibold">{upi.type || 'UPI'}</span>
          {stats?.lastSuccess && (
            <span className="text-slate-400">Last: {new Date(stats.lastSuccess).toLocaleDateString('en-IN')}</span>
          )}
        </div>

        <div className="flex gap-2">
          <Link to={`/admin/traders/${upi.trader_id}`} className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg text-xs font-semibold hover:bg-indigo-100">
            <User className="w-3 h-3" /> Trader
          </Link>
          <button onClick={() => setShowLimitInput(!showLimitInput)} className="px-3 py-1.5 bg-amber-50 text-amber-600 border border-amber-200 rounded-lg text-xs font-semibold hover:bg-amber-100">
            <Target className="w-3 h-3" />
          </button>
          <button onClick={() => onDelete(upi)} className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs font-semibold hover:bg-red-100">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Component ─── */
export default function AdminUPIPool() {
  const [pool, setPool] = useState([]);
  const [payins, setPayins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [healthFilter, setHealthFilter] = useState('all');
  const [sortBy, setSortBy] = useState('conversion');
  const [showFilters, setShowFilters] = useState(false);
  const [toast, setToast] = useState(null);

  const fetchPool = useCallback(async () => {
    const { data } = await supabase.from('upi_pool').select('*');
    setPool(data || []);
  }, []);

  const fetchPayins = useCallback(async () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('payins')
      .select('id, assigned_upi, status, amount, completed_at, created_at')
      .gte('created_at', thirtyDaysAgo);
    setPayins(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchPool(); fetchPayins(); }, [fetchPool, fetchPayins]);

  // Calculate stats per UPI
  const upiStats = useMemo(() => {
    const stats = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    payins.forEach(p => {
      const upiId = p.assigned_upi;
      if (!upiId) return;

      if (!stats[upiId]) {
        stats[upiId] = { total: 0, completed: 0, failed: 0, pending: 0, totalVolume: 0, todayVolume: 0, todayCount: 0, lastSuccess: null, amounts: [] };
      }

      const s = stats[upiId];
      s.total++;

      if (p.status === 'completed') {
        s.completed++;
        s.totalVolume += Number(p.amount) || 0;
        s.amounts.push(Number(p.amount) || 0);
        
        const completedAt = p.completed_at ? new Date(p.completed_at).getTime() : 
                           p.created_at ? new Date(p.created_at).getTime() : null;
        if (completedAt) {
          if (!s.lastSuccess || completedAt > s.lastSuccess) s.lastSuccess = completedAt;
          if (completedAt >= todayMs) {
            s.todayVolume += Number(p.amount) || 0;
            s.todayCount++;
          }
        }
      } else if (p.status === 'rejected' || p.status === 'expired' || p.status === 'failed') {
        s.failed++;
      } else {
        s.pending++;
      }
    });

    Object.keys(stats).forEach(upiId => {
      const s = stats[upiId];
      const resolved = s.completed + s.failed;
      s.conversionRate = resolved > 0 ? Math.round((s.completed / resolved) * 100) : 0;
      s.avgAmount = s.amounts.length > 0 ? Math.round(s.amounts.reduce((a, b) => a + b, 0) / s.amounts.length) : 0;
    });

    return stats;
  }, [payins]);

  const filtered = useMemo(() => {
    let result = pool.map(upi => ({
      ...upi,
      stats: upiStats[upi.upi_id] || upiStats[upi.account_number] || null,
    }));

    if (statusFilter === 'active') result = result.filter(u => u.status === 'active');
    else if (statusFilter === 'inactive') result = result.filter(u => u.status !== 'active');

    if (healthFilter !== 'all') {
      result = result.filter(u => {
        const s = u.stats;
        if (!s || s.total === 0) return healthFilter === 'new';
        const hoursSinceLastSuccess = s.lastSuccess ? (Date.now() - s.lastSuccess) / (1000 * 60 * 60) : Infinity;
        if (healthFilter === 'problem') return s.conversionRate < 30;
        if (healthFilter === 'idle') return hoursSinceLastSuccess > 24 && s.conversionRate >= 30;
        if (healthFilter === 'healthy') return s.conversionRate >= 50 && hoursSinceLastSuccess <= 24;
        return false;
      });
    }

    if (search) {
      const s = search.toLowerCase();
      result = result.filter(u => 
        u.upi_id?.toLowerCase().includes(s) || 
        u.account_number?.toLowerCase().includes(s) || 
        u.holder_name?.toLowerCase().includes(s) || 
        u.trader_id?.toLowerCase().includes(s)
      );
    }

    result.sort((a, b) => {
      const aStats = a.stats || { conversionRate: 0, totalVolume: 0, lastSuccess: 0 };
      const bStats = b.stats || { conversionRate: 0, totalVolume: 0, lastSuccess: 0 };
      switch (sortBy) {
        case 'conversion': return bStats.conversionRate - aStats.conversionRate;
        case 'volume': return bStats.totalVolume - aStats.totalVolume;
        case 'recent': return (bStats.lastSuccess || 0) - (aStats.lastSuccess || 0);
        case 'priority':
          const po = { VIP: 0, High: 1, Normal: 2 };
          return (po[a.priority] || 2) - (po[b.priority] || 2);
        default: return 0;
      }
    });

    return result;
  }, [pool, upiStats, statusFilter, healthFilter, search, sortBy]);

  const overallStats = useMemo(() => {
    const activePool = pool.filter(u => u.status === 'active');
    const allStats = Object.values(upiStats);
    const totalCompleted = allStats.reduce((sum, s) => sum + s.completed, 0);
    const totalFailed = allStats.reduce((sum, s) => sum + s.failed, 0);
    const totalVolume = allStats.reduce((sum, s) => sum + s.totalVolume, 0);
    const resolved = totalCompleted + totalFailed;
    const overallConversion = resolved > 0 ? Math.round((totalCompleted / resolved) * 100) : 0;

    let healthy = 0, idle = 0, problem = 0;
    pool.forEach(upi => {
      const s = upiStats[upi.upi_id] || upiStats[upi.account_number];
      if (!s || s.total === 0) return;
      const hours = s.lastSuccess ? (Date.now() - s.lastSuccess) / (1000 * 60 * 60) : Infinity;
      if (s.conversionRate < 30) problem++;
      else if (hours > 24) idle++;
      else healthy++;
    });

    return { total: pool.length, active: activePool.length, inactive: pool.length - activePool.length, totalVolume, overallConversion, totalCompleted, totalFailed, healthy, idle, problem };
  }, [pool, upiStats]);

  const handleToggle = async (upi) => {
    const willActivate = upi.status !== 'active';
    try {
      await supabase.from('upi_pool').update({ status: willActivate ? 'active' : 'inactive' }).eq('id', upi.id);
      const upiIdentifier = upi.upi_id || upi.account_number || 'Unknown';
      if (willActivate) {
        await logUPIEnabled(upi.id, upiIdentifier, upi.trader_id || 'N/A', 'Admin toggled UPI to active');
      } else {
        await logUPIDisabled(upi.id, upiIdentifier, upi.trader_id || 'N/A', 'Admin toggled UPI to inactive');
      }
      setToast({ msg: `UPI ${willActivate ? 'activated' : 'deactivated'}`, success: true });
      fetchPool();
    } catch (e) { console.error(e); setToast({ msg: 'Failed to update', success: false }); }
  };

  const handleDelete = async (upi) => {
    if (!window.confirm(`Remove ${upi.upi_id || upi.account_number} from pool?`)) return;
    try {
      await supabase.from('upi_pool').delete().eq('id', upi.id);
      const upiIdentifier = upi.upi_id || upi.account_number || 'Unknown';
      await logUPIDeleted(upi.id, upiIdentifier, upi.trader_id || 'N/A', 'Admin removed UPI from pool');
      setToast({ msg: 'Removed from pool', success: true });
      fetchPool();
    } catch (e) { console.error(e); setToast({ msg: 'Failed to remove', success: false }); }
  };

  const handleUpdateLimit = async (upi, limit) => {
    try {
      await supabase.from('upi_pool').update({ daily_limit: limit }).eq('id', upi.id);
      setToast({ msg: `Daily limit ${limit > 0 ? `set to ₹${limit.toLocaleString()}` : 'removed'}`, success: true });
      fetchPool();
    } catch (e) { console.error(e); setToast({ msg: 'Failed to update limit', success: false }); }
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className="hidden sm:flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl shadow-sm">
              <Database className="w-5 h-5 text-white" />
            </div>
            UPI Pool
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 ml-11">Payment endpoints with conversion tracking</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard title="Active UPIs" value={overallStats.active} subtitle={`of ${overallStats.total} total`} icon={Database} color="indigo" />
        <StatCard title="Overall Conversion" value={`${overallStats.overallConversion}%`} subtitle={`${overallStats.totalCompleted} of ${overallStats.totalCompleted + overallStats.totalFailed}`} icon={Target} color={overallStats.overallConversion >= 60 ? 'green' : overallStats.overallConversion >= 40 ? 'amber' : 'red'} />
        <StatCard title="30-Day Volume" value={`₹${(overallStats.totalVolume / 100000).toFixed(1)}L`} subtitle={`${overallStats.totalCompleted} transactions`} icon={TrendingUp} color="green" />
        <StatCard title="Problem UPIs" value={overallStats.problem} subtitle={`${overallStats.idle} idle, ${overallStats.healthy} healthy`} icon={AlertTriangle} color={overallStats.problem > 0 ? 'red' : 'green'} />
      </div>

      <div className="flex gap-2 overflow-x-auto px-1 py-1 -mx-1" style={{ scrollbarWidth: 'none' }}>
        {[
          { label: 'All', value: overallStats.total, key: 'all', activeBg: 'bg-slate-200', activeText: 'text-slate-800' },
          { label: 'Active', value: overallStats.active, key: 'active', activeBg: 'bg-green-100', activeText: 'text-green-700' },
          { label: 'Inactive', value: overallStats.inactive, key: 'inactive', activeBg: 'bg-red-100', activeText: 'text-red-700' },
        ].map(pill => {
          const isActive = statusFilter === pill.key;
          return (
            <button key={pill.key} onClick={() => setStatusFilter(pill.key)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${isActive ? `${pill.activeBg} ${pill.activeText} shadow-sm` : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
              {pill.label}
              <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${isActive ? 'bg-white/70' : 'bg-slate-200 text-slate-600'}`}>{pill.value}</span>
            </button>
          );
        })}
        <div className="w-px bg-slate-200 mx-1" />
        {[
          { label: '🟢 Healthy', key: 'healthy', count: overallStats.healthy },
          { label: '🟡 Idle', key: 'idle', count: overallStats.idle },
          { label: '🔴 Problem', key: 'problem', count: overallStats.problem },
        ].map(pill => {
          const isActive = healthFilter === pill.key;
          return (
            <button key={pill.key} onClick={() => setHealthFilter(isActive ? 'all' : pill.key)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${isActive ? 'bg-indigo-100 text-indigo-700 shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
              {pill.label}
              <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${isActive ? 'bg-white/70' : 'bg-slate-200 text-slate-600'}`}>{pill.count}</span>
            </button>
          );
        })}
      </div>

      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input type="text" placeholder="Search UPI, account, holder, trader..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
        </div>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
          <option value="conversion">Sort: Conversion</option>
          <option value="volume">Sort: Volume</option>
          <option value="recent">Sort: Recent Activity</option>
          <option value="priority">Sort: Priority</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" /></div>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(upi => (
            <UPICard key={upi.id} upi={upi} stats={upi.stats} onToggle={handleToggle} onDelete={handleDelete} onUpdateLimit={handleUpdateLimit} />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <Database className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No UPIs found</p>
        </div>
      )}
    </div>
  );
}
