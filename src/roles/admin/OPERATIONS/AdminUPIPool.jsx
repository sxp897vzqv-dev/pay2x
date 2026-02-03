import React, { useEffect, useState, useMemo } from 'react';
import { db } from '../../../firebase';
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { Database, Search, RefreshCw, CheckCircle, AlertCircle, ToggleLeft, ToggleRight, User, Trash2, Eye, CreditCard, Building } from 'lucide-react';

function Toast({ msg, success, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return <div className={`fixed left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-50 ${success ? 'bg-green-600' : 'bg-red-600'} text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-medium`} style={{ top: 60 }}>{success ? <CheckCircle size={18} /> : <AlertCircle size={18} />}<span>{msg}</span></div>;
}

function UPICard({ upi, onToggle, onDelete }) {
  const isActive = upi.active;
  const isBank = Boolean(upi.accountNumber);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className={`h-1 ${isActive ? 'bg-green-500' : 'bg-slate-300'}`} />
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {isBank ? <Building className="w-4 h-4 text-indigo-500" /> : <CreditCard className="w-4 h-4 text-purple-500" />}
              <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{isActive ? 'ACTIVE' : 'OFF'}</span>
            </div>
            <p className="font-mono text-sm font-bold text-slate-900 truncate" style={{ fontFamily: 'var(--font-mono)' }}>{upi.upiId || upi.accountNumber}</p>
            {upi.ifscCode && <p className="font-mono text-xs text-slate-500" style={{ fontFamily: 'var(--font-mono)' }}>IFSC: {upi.ifscCode}</p>}
            <p className="text-xs text-slate-400 mt-0.5">{upi.holderName}</p>
          </div>
          <button onClick={() => onToggle(upi)} className={`p-1.5 rounded-lg ${isActive ? 'bg-green-50 hover:bg-green-100' : 'bg-slate-50 hover:bg-slate-100'}`}>
            {isActive ? <ToggleRight className="w-5 h-5 text-green-600" /> : <ToggleLeft className="w-5 h-5 text-slate-400" />}
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
          <span className={`px-2 py-0.5 rounded-lg font-semibold ${upi.priority === 'VIP' ? 'bg-purple-100 text-purple-700' : upi.priority === 'High' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
            {upi.priority || 'Normal'}
          </span>
          <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 font-semibold">{upi.type || 'Unknown'}</span>
        </div>

        <div className="flex gap-2">
          <Link to={`/admin/traders/${upi.traderId}`} className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg text-xs font-semibold hover:bg-indigo-100">
            <User className="w-3 h-3" /> Trader
          </Link>
          <button onClick={() => onDelete(upi)} className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs font-semibold hover:bg-red-100">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminUPIPool() {
  const [pool, setPool] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'upi_pool'), (snap) => {
      const list = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      setPool(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    let result = pool;
    if (statusFilter === 'active') result = result.filter(u => u.active);
    else if (statusFilter === 'inactive') result = result.filter(u => !u.active);
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(u => u.upiId?.toLowerCase().includes(s) || u.accountNumber?.toLowerCase().includes(s) || u.holderName?.toLowerCase().includes(s) || u.traderId?.toLowerCase().includes(s));
    }
    return result;
  }, [pool, statusFilter, search]);

  const stats = useMemo(() => ({
    total: pool.length,
    active: pool.filter(u => u.active).length,
    inactive: pool.filter(u => !u.active).length,
  }), [pool]);

  const handleToggle = async (upi) => {
    try {
      await updateDoc(doc(db, 'upi_pool', upi.id), { active: !upi.active });
      setToast({ msg: `UPI ${!upi.active ? 'activated' : 'deactivated'}`, success: true });
    } catch (e) { console.error(e); setToast({ msg: 'Failed to update', success: false }); }
  };

  const handleDelete = async (upi) => {
    if (!window.confirm(`Remove ${upi.upiId || upi.accountNumber} from pool?`)) return;
    try {
      await deleteDoc(doc(db, 'upi_pool', upi.id));
      setToast({ msg: 'Removed from pool', success: true });
    } catch (e) { console.error(e); setToast({ msg: 'Failed to remove', success: false }); }
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className="hidden sm:flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl shadow-sm"><Database className="w-5 h-5 text-white" /></div>UPI Pool
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 ml-11">Active payment endpoints</p>
        </div>
      </div>

      <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-xl p-4 text-white">
        <div className="flex items-center justify-between">
          <div><p className="text-indigo-200 text-xs font-semibold">Active UPIs</p><p className="text-2xl font-bold">{stats.active}</p></div>
          <div className="text-right"><p className="text-indigo-200 text-xs">Total in Pool</p><p className="text-lg font-bold">{stats.total}</p></div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {[{ label: 'All', value: stats.total, key: 'all', color: 'bg-slate-100 text-slate-700' }, { label: 'Active', value: stats.active, key: 'active', color: 'bg-green-100 text-green-700' }, { label: 'Inactive', value: stats.inactive, key: 'inactive', color: 'bg-red-100 text-red-700' }].map(pill => (
          <button key={pill.key} onClick={() => setStatusFilter(pill.key)} className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${statusFilter === pill.key ? `${pill.color} ring-2 ring-offset-1 ring-current` : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
            {pill.label}<span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${statusFilter === pill.key ? 'bg-white/60' : 'bg-slate-200 text-slate-600'}`}>{pill.value}</span>
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input type="text" placeholder="Search UPI, account, holder..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
        </div>
      </div>

      {loading ? <div className="flex items-center justify-center py-12"><RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" /></div> : filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{filtered.map(upi => <UPICard key={upi.id} upi={upi} onToggle={handleToggle} onDelete={handleDelete} />)}</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center"><Database className="w-12 h-12 text-slate-200 mx-auto mb-3" /><p className="text-slate-500 font-medium">No UPIs in pool</p></div>
      )}
    </div>
  );
}