import React, { useEffect, useState, useMemo } from 'react';
import { db } from '../../../firebase';
import { collection, query, onSnapshot, orderBy, limit, where, getDocs, Timestamp } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { FileText, Search, Filter, Download, RefreshCw, User, Calendar, Clock, DollarSign, Settings, Shield, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';

const ACTION_CONFIG = {
  admin_topup: { icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-100', label: 'Balance Top Up' },
  admin_deduct: { icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-100', label: 'Balance Deduct' },
  security_hold_add: { icon: Shield, color: 'text-orange-600', bg: 'bg-orange-100', label: 'Security Hold Added' },
  security_hold_release: { icon: Shield, color: 'text-blue-600', bg: 'bg-blue-100', label: 'Security Hold Released' },
  trader_activated: { icon: User, color: 'text-green-600', bg: 'bg-green-100', label: 'Trader Activated' },
  trader_deactivated: { icon: User, color: 'text-red-600', bg: 'bg-red-100', label: 'Trader Deactivated' },
  dispute_resolved: { icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-100', label: 'Dispute Resolved' },
  settings_changed: { icon: Settings, color: 'text-purple-600', bg: 'bg-purple-100', label: 'Settings Changed' },
};

function LogCard({ log }) {
  const config = ACTION_CONFIG[log.action] || { icon: FileText, color: 'text-slate-600', bg: 'bg-slate-100', label: log.action || 'Action' };
  const Icon = config.icon;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-lg ${config.bg} flex items-center justify-center flex-shrink-0`}>
          <Icon className={`w-4 h-4 ${config.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-slate-900 text-sm">{config.label}</span>
            {log.amount && <span className="text-sm font-bold text-green-600">₹{log.amount.toLocaleString()}</span>}
          </div>
          {log.traderName && (
            <Link to={`/admin/traders/${log.traderId}`} className="text-xs text-indigo-600 font-semibold flex items-center gap-1 mb-1">
              <User className="w-3 h-3" /> {log.traderName}
            </Link>
          )}
          {log.note && <p className="text-xs text-slate-500 line-clamp-2">{log.note}</p>}
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1.5">
            <Clock className="w-3 h-3" />
            {log.createdAt?.seconds ? new Date(log.createdAt.seconds * 1000).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'adminLog'), orderBy('createdAt', 'desc'), limit(200)),
      (snap) => {
        const list = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        setLogs(list);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    let result = logs;
    if (actionFilter !== 'all') result = result.filter(l => l.action === actionFilter);
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(l => l.traderName?.toLowerCase().includes(s) || l.note?.toLowerCase().includes(s) || l.action?.toLowerCase().includes(s));
    }
    if (dateFrom) result = result.filter(l => (l.createdAt?.seconds || 0) * 1000 >= new Date(dateFrom).getTime());
    if (dateTo) result = result.filter(l => (l.createdAt?.seconds || 0) * 1000 <= new Date(dateTo).getTime() + 86399999);
    return result;
  }, [logs, actionFilter, search, dateFrom, dateTo]);

  const actionTypes = useMemo(() => {
    const types = new Set(logs.map(l => l.action).filter(Boolean));
    return Array.from(types);
  }, [logs]);

  const handleExport = () => {
    const csv = [
      ['Date', 'Action', 'Trader', 'Amount', 'Note'],
      ...filtered.map(l => [
        l.createdAt?.seconds ? new Date(l.createdAt.seconds * 1000).toISOString() : '',
        l.action || '', l.traderName || '', l.amount || '', l.note || ''
      ])
    ].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `admin-logs-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="hidden sm:flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-slate-600 to-slate-700 rounded-xl shadow-sm"><FileText className="w-5 h-5 text-white" /></div>Audit Logs
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 ml-11">Admin activity history</p>
        </div>
        <button onClick={handleExport} className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 text-sm font-semibold">
          <Download className="w-4 h-4" /> Export
        </button>
      </div>

      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input type="text" placeholder="Search trader, action, note..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white" />
        </div>
        <button onClick={() => setShowFilters(!showFilters)} className={`w-10 h-10 flex items-center justify-center rounded-xl border flex-shrink-0 ${showFilters ? 'bg-slate-100 border-slate-300 text-slate-700' : 'bg-white border-slate-200 text-slate-500'}`}>
          <Filter className="w-4 h-4" />
        </button>
      </div>

      {showFilters && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-bold text-slate-500 mb-1"><Calendar className="w-3 h-3 inline mr-1" />From</label><input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs" /></div>
            <div><label className="block text-xs font-bold text-slate-500 mb-1"><Calendar className="w-3 h-3 inline mr-1" />To</label><input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs" /></div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Action Type</label>
            <select value={actionFilter} onChange={e => setActionFilter(e.target.value)} className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs bg-white">
              <option value="all">All Actions</option>
              {actionTypes.map(type => <option key={type} value={type}>{ACTION_CONFIG[type]?.label || type}</option>)}
            </select>
          </div>
        </div>
      )}

      {loading ? <div className="flex items-center justify-center py-12"><RefreshCw className="w-8 h-8 text-slate-500 animate-spin" /></div> : filtered.length > 0 ? (
        <div className="space-y-2">{filtered.map(log => <LogCard key={log.id} log={log} />)}</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center"><FileText className="w-12 h-12 text-slate-200 mx-auto mb-3" /><p className="text-slate-500 font-medium">No logs found</p></div>
      )}
    </div>
  );
}