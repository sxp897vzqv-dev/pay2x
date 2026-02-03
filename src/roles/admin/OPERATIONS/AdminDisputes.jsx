import React, { useEffect, useState, useMemo } from 'react';
import { db } from '../../../firebase';
import { collection, query, onSnapshot, orderBy, where, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, Search, Filter, Download, RefreshCw, Eye, User, Clock, CheckCircle, XCircle, Send, X, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';

function Toast({ msg, success, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return <div className={`fixed left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-50 ${success ? 'bg-green-600' : 'bg-red-600'} text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-medium`} style={{ top: 60 }}>{success ? <CheckCircle size={18} /> : <AlertCircle size={18} />}<span>{msg}</span></div>;
}

function DisputeCard({ dispute, onResolve }) {
  const statusStyles = { approved: { bg: 'bg-green-100', text: 'text-green-700', stripe: 'bg-green-500' }, pending: { bg: 'bg-amber-100', text: 'text-amber-700', stripe: 'bg-amber-500' }, rejected: { bg: 'bg-red-100', text: 'text-red-700', stripe: 'bg-red-500' } };
  const style = statusStyles[dispute.status] || statusStyles.pending;
  const isPayin = dispute.type === 'payin';

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className={`h-1 ${style.stripe}`} />
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${style.bg} ${style.text}`}>{dispute.status?.toUpperCase()}</span>
            <span className={`px-2 py-0.5 rounded-lg text-xs font-bold flex items-center gap-1 ${isPayin ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
              {isPayin ? <ArrowDownCircle size={10} /> : <ArrowUpCircle size={10} />}{dispute.type?.toUpperCase()}
            </span>
          </div>
          {dispute.status === 'pending' && <span className="text-xs text-amber-600 font-bold animate-pulse">NEEDS ACTION</span>}
        </div>

        <div className="flex items-center justify-between mb-2">
          <div className="min-w-0"><p className="text-xs text-slate-400">{isPayin ? 'UPI ID' : 'Order ID'}</p><p className="font-mono font-bold text-slate-900 text-sm truncate" style={{ fontFamily: 'var(--font-mono)' }}>{isPayin ? dispute.upiId : dispute.orderId}</p></div>
          <div className="text-right flex-shrink-0"><p className="text-xs text-slate-400">Amount</p><p className="text-lg font-bold text-green-700">₹{(dispute.amount || 0).toLocaleString()}</p></div>
        </div>

        {dispute.reason && <p className="text-xs text-slate-500 line-clamp-2 mb-2">{dispute.reason}</p>}
        {dispute.traderNote && <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 mb-2"><p className="text-xs text-blue-800"><span className="font-bold">Trader Response:</span> {dispute.traderNote}</p></div>}

        <div className="flex items-center gap-3 text-xs text-slate-400 mb-3">
          <span className="flex items-center gap-1"><Clock size={11} />{new Date((dispute.createdAt?.seconds || 0) * 1000).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</span>
          <Link to={`/admin/traders/${dispute.traderId}`} className="flex items-center gap-1 text-indigo-600 font-semibold"><User size={11} />Trader</Link>
        </div>

        {dispute.status === 'pending' && (
          <div className="flex gap-2">
            <button onClick={() => onResolve(dispute, 'approved')} className="flex-1 flex items-center justify-center gap-1 py-2 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 active:scale-[0.97]"><CheckCircle className="w-3.5 h-3.5" /> Approve</button>
            <button onClick={() => onResolve(dispute, 'rejected')} className="flex-1 flex items-center justify-center gap-1 py-2 bg-red-500 text-white rounded-lg text-xs font-bold hover:bg-red-600 active:scale-[0.97]"><XCircle className="w-3.5 h-3.5" /> Reject</button>
          </div>
        )}

        {dispute.proofUrl && <a href={dispute.proofUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 font-semibold"><Eye className="w-3 h-3" /> View Proof</a>}
      </div>
    </div>
  );
}

export default function AdminDisputes() {
  const [searchParams] = useSearchParams();
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [toast, setToast] = useState(null);
  const traderFilter = searchParams.get('trader');

  useEffect(() => {
    let q = query(collection(db, 'disputes'), orderBy('createdAt', 'desc'));
    if (traderFilter) q = query(collection(db, 'disputes'), where('traderId', '==', traderFilter), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => { const list = []; snap.forEach(d => list.push({ id: d.id, ...d.data() })); setDisputes(list); setLoading(false); });
    return () => unsub();
  }, [traderFilter]);

  const filtered = useMemo(() => {
    let result = disputes;
    if (statusFilter !== 'all') result = result.filter(d => d.status === statusFilter);
    if (search) { const s = search.toLowerCase(); result = result.filter(d => d.orderId?.toLowerCase().includes(s) || d.upiId?.toLowerCase().includes(s) || d.reason?.toLowerCase().includes(s)); }
    return result;
  }, [disputes, statusFilter, search]);

  const stats = useMemo(() => ({ total: disputes.length, pending: disputes.filter(d => d.status === 'pending').length, approved: disputes.filter(d => d.status === 'approved').length, rejected: disputes.filter(d => d.status === 'rejected').length }), [disputes]);

  const handleResolve = async (dispute, decision) => {
    if (!window.confirm(`${decision === 'approved' ? 'Approve' : 'Reject'} this dispute for ₹${dispute.amount?.toLocaleString()}?`)) return;
    try {
      await updateDoc(doc(db, 'disputes', dispute.id), { status: decision, adminDecision: decision, resolvedAt: serverTimestamp() });
      setToast({ msg: `Dispute ${decision}`, success: decision === 'approved' });
    } catch (e) { console.error(e); setToast({ msg: 'Failed to update dispute', success: false }); }
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className="hidden sm:flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl shadow-sm"><AlertCircle className="w-5 h-5 text-white" /></div>Disputes
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 ml-11">Resolve merchant disputes</p>
        </div>
      </div>

      <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl p-4 text-white">
        <div className="flex items-center justify-between">
          <div><p className="text-amber-100 text-xs font-semibold">Pending Resolution</p><p className="text-2xl font-bold">{stats.pending}</p></div>
          <div className="text-right"><p className="text-amber-100 text-xs">Total</p><p className="text-lg font-bold">{stats.total}</p></div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {[{ label: 'All', value: stats.total, key: 'all', color: 'bg-slate-100 text-slate-700' }, { label: 'Pending', value: stats.pending, key: 'pending', color: 'bg-amber-100 text-amber-700' }, { label: 'Approved', value: stats.approved, key: 'approved', color: 'bg-green-100 text-green-700' }, { label: 'Rejected', value: stats.rejected, key: 'rejected', color: 'bg-red-100 text-red-700' }].map(pill => (
          <button key={pill.key} onClick={() => setStatusFilter(pill.key)} className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${statusFilter === pill.key ? `${pill.color} ring-2 ring-offset-1 ring-current` : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
            {pill.label}<span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${statusFilter === pill.key ? 'bg-white/60' : 'bg-slate-200 text-slate-600'}`}>{pill.value}</span>
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input type="text" placeholder="Search order, UPI, reason..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
        </div>
      </div>

      {loading ? <div className="flex items-center justify-center py-12"><RefreshCw className="w-8 h-8 text-amber-500 animate-spin" /></div> : filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{filtered.map(dispute => <DisputeCard key={dispute.id} dispute={dispute} onResolve={handleResolve} />)}</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center"><AlertCircle className="w-12 h-12 text-slate-200 mx-auto mb-3" /><p className="text-slate-500 font-medium">No disputes found</p></div>
      )}
    </div>
  );
}