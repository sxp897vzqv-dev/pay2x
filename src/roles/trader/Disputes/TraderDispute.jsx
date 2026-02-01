import React, { useEffect, useState, useMemo } from "react";
import { db, storage } from '../../../firebase';
import {
  collection, query, where, onSnapshot, orderBy, updateDoc, doc, serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getAuth } from "firebase/auth";
import {
  AlertCircle, CheckCircle, XCircle, Clock, Search, RefreshCw,
  X, Upload, Send, AlertTriangle, ArrowDownCircle, ArrowUpCircle, Paperclip, Filter,
} from "lucide-react";

/* ─── Dispute Card ─── */
function DisputeCard({ dispute, onRespond }) {
  const isPayin = dispute.type === 'payin';

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* status stripe */}
      <div className={`h-1 ${dispute.status === 'pending' ? 'bg-amber-400' : dispute.status === 'approved' ? 'bg-green-500' : 'bg-red-500'}`} />
      <div className="p-3">

        {/* ── Header badges row ── */}
        <div className="flex items-center justify-between mb-2.5">
          {/* badges can wrap on tiny screens — use flex-wrap */}
          <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0 pr-2">
            <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${
              dispute.status === 'pending'  ? 'bg-amber-100 text-amber-700' :
              dispute.status === 'approved' ? 'bg-green-100 text-green-700' :
              'bg-red-100 text-red-700'
            }`}>{dispute.status?.toUpperCase()}</span>
            <span className={`px-2 py-0.5 rounded-lg text-xs font-bold flex items-center gap-1 ${
              isPayin ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
            }`}>
              {isPayin ? <ArrowDownCircle size={10} /> : <ArrowUpCircle size={10} />}
              {dispute.type?.toUpperCase()}
            </span>
          </div>
          {/* ✅ FIX: ACTION badge pinned right, never pushed off */}
          {dispute.status === 'pending' && (
            <span className="text-xs text-amber-600 font-bold animate-pulse flex-shrink-0">ACTION</span>
          )}
        </div>

        {/* ── Key info row ── ✅ FIX: proper flex layout so amount stays visible */}
        <div className="flex items-center justify-between mb-2" style={{ gap: 12 }}>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400">{isPayin ? 'UPI ID' : 'Order ID'}</p>
            <p className="font-mono font-bold text-slate-900 text-sm truncate" style={{ fontFamily: 'var(--font-mono)' }}>
              {isPayin ? dispute.upiId : dispute.orderId}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xs text-slate-400">Amount</p>
            <p className="text-lg font-bold text-green-700">₹{(dispute.amount || 0).toLocaleString()}</p>
          </div>
        </div>

        {dispute.merchantName && (
          <p className="text-xs text-slate-500 mb-1"><span className="font-semibold text-slate-600">Merchant:</span> {dispute.merchantName}</p>
        )}
        {dispute.reason && <p className="text-xs text-slate-500 line-clamp-2 mb-2">{dispute.reason}</p>}

        <div className="flex items-center gap-1 text-xs text-slate-400 mb-2.5">
          <Clock size={11} />
          {new Date((dispute.createdAt?.seconds || 0) * 1000).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
        </div>

        {dispute.status === 'pending' && (
          <button onClick={() => onRespond(dispute)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 text-white rounded-xl hover:bg-amber-600 active:scale-[0.97] transition-all font-semibold text-sm">
            <Send size={15} /> Respond
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Response Modal (bottom sheet on mobile) ─── */
function ResponseModal({ dispute, onClose, onSubmit }) {
  const [action,    setAction]    = useState('');
  const [note,      setNote]      = useState('');
  const [proofFile, setProofFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const isPayin = dispute.type === 'payin';

  const handleSubmit = async () => {
    if (!action)      { alert('Please select Accept or Reject'); return; }
    if (!note.trim()) { alert('Please provide a note'); return; }
    if (action === 'reject' && !proofFile) { alert('Please upload proof for rejection'); return; }
    setUploading(true);
    try {
      let proofUrl = null;
      if (proofFile) {
        const sRef = ref(storage, `disputes/${dispute.id}/${Date.now()}_${proofFile.name}`);
        await uploadBytes(sRef, proofFile);
        proofUrl = await getDownloadURL(sRef);
      }
      await onSubmit({ action, note, proofUrl });
      onClose();
    } catch (e) { alert('Error: ' + e.message); }
    setUploading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-white shadow-2xl rounded-t-2xl sm:rounded-2xl overflow-hidden mt-auto sm:mt-0 max-h-[90vh] flex flex-col">
        {/* Handle */}
        <div className="sm:hidden flex justify-center pt-2 pb-1"><div className="w-10 h-1 bg-slate-300 rounded-full" /></div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-900">Respond to Dispute</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg"><X size={20} className="text-slate-500" /></button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Summary */}
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
            <div className="flex justify-between items-center" style={{ gap: 12 }}>
              <div className="min-w-0">
                <p className="text-xs text-slate-400">{isPayin ? 'UPI ID' : 'Order ID'}</p>
                <p className="font-mono text-sm font-bold text-slate-900 truncate" style={{ fontFamily: 'var(--font-mono)' }}>
                  {isPayin ? dispute.upiId : dispute.orderId}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-slate-400">Amount</p>
                <p className="text-lg font-bold text-green-600">₹{dispute.amount?.toLocaleString()}</p>
              </div>
            </div>
            {dispute.reason && <p className="text-xs text-slate-500 mt-2 italic">"{dispute.reason}"</p>}
          </div>

          {/* Decision buttons */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wide">Your Decision *</label>
            <div className="flex gap-2.5">
              <button onClick={() => setAction('accept')}
                className={`flex-1 p-3 rounded-xl border-2 transition-all text-center ${action === 'accept' ? 'border-green-500 bg-green-50' : 'border-slate-200 hover:border-green-300 bg-white'}`}>
                <CheckCircle className={`w-5 h-5 mx-auto mb-1 ${action === 'accept' ? 'text-green-600' : 'text-slate-300'}`} />
                <p className={`text-sm font-bold ${action === 'accept' ? 'text-green-800' : 'text-slate-500'}`}>Accept</p>
              </button>
              <button onClick={() => setAction('reject')}
                className={`flex-1 p-3 rounded-xl border-2 transition-all text-center ${action === 'reject' ? 'border-red-500 bg-red-50' : 'border-slate-200 hover:border-red-300 bg-white'}`}>
                <XCircle className={`w-5 h-5 mx-auto mb-1 ${action === 'reject' ? 'text-red-600' : 'text-slate-300'}`} />
                <p className={`text-sm font-bold ${action === 'reject' ? 'text-red-800' : 'text-slate-500'}`}>Reject</p>
              </button>
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Your Note *</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent resize-none"
              placeholder="Explain your decision…" />
          </div>

          {/* Proof upload (reject only) */}
          {action === 'reject' && (
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
                Upload Proof <span className="text-red-500">*</span>
              </label>
              <label htmlFor="proof-upload"
                className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-xl p-4 cursor-pointer hover:border-amber-400 transition-colors">
                <Upload className="w-6 h-6 text-slate-400" />
                <p className="text-sm font-semibold text-slate-600">Tap to upload</p>
                <p className="text-xs text-slate-400">Screenshot or receipt</p>
                <input type="file" accept="image/*" onChange={e => setProofFile(e.target.files[0])} className="hidden" id="proof-upload" />
              </label>
              {/* ✅ clear selected-file badge */}
              {proofFile && (
                <div className="mt-2 px-3 py-2 bg-blue-50 rounded-lg text-xs text-blue-800 font-semibold flex items-center gap-2 border border-blue-200">
                  <Paperclip size={14} /> {proofFile.name}
                  <button onClick={() => setProofFile(null)} className="ml-auto text-blue-400 hover:text-blue-600"><X size={14} /></button>
                </div>
              )}
            </div>
          )}

          {action === 'reject' && (
            <div className="bg-amber-50 border-l-4 border-amber-400 rounded-lg p-3 flex gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">Rejecting requires proof. Admin will review before a final decision.</p>
            </div>
          )}
        </div>

        {/* ── Footer — ✅ min-width so buttons never collapse below 320px ── */}
        <div className="px-4 py-3 border-t border-slate-100 flex gap-2.5">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-slate-300 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 active:bg-slate-100"
            style={{ minWidth: 100 }}>Cancel</button>
          <button onClick={handleSubmit}
            disabled={uploading || !action || !note.trim() || (action === 'reject' && !proofFile)}
            className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-bold disabled:opacity-40 active:scale-[0.97]"
            style={{ minWidth: 100 }}>
            {uploading ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function TraderDispute() {
  const [disputes,     setDisputes]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [typeFilter,   setTypeFilter]   = useState("all");
  const [respondingTo, setRespondingTo] = useState(null);
  const [showFilters,  setShowFilters]  = useState(false);

  useEffect(() => {
    const user = getAuth().currentUser;
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, "disputes"), where("traderId","==",user.uid), orderBy("createdAt","desc")),
      snap => {
        const list = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        setDisputes(list);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    let r = disputes;
    if (statusFilter !== "all") r = r.filter(d => d.status === statusFilter);
    if (typeFilter !== "all")   r = r.filter(d => d.type === typeFilter);
    if (search) {
      const s = search.toLowerCase();
      r = r.filter(d => d.orderId?.toLowerCase().includes(s) || d.upiId?.toLowerCase().includes(s) || d.reason?.toLowerCase().includes(s));
    }
    return r;
  }, [disputes, statusFilter, typeFilter, search]);

  const stats = useMemo(() => ({
    total:    disputes.length,
    pending:  disputes.filter(d => d.status === 'pending').length,
    approved: disputes.filter(d => d.status === 'approved').length,
    rejected: disputes.filter(d => d.status === 'rejected').length,
  }), [disputes]);

  const handleResponseSubmit = async ({ action, note, proofUrl }) => {
    if (!respondingTo) return;
    try {
      await updateDoc(doc(db, 'disputes', respondingTo.id), {
        status: action === 'accept' ? 'approved' : 'rejected',
        traderNote: note, traderAction: action,
        proofUrl: proofUrl || null, respondedAt: serverTimestamp(),
      });
      setRespondingTo(null);
    } catch (e) { alert('Error: ' + e.message); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <RefreshCw className="w-10 h-10 text-amber-500 animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm font-medium">Loading disputes…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Desktop header */}
      <div className="hidden sm:flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <AlertCircle className="w-6 h-6 text-amber-600" /> Disputes
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">Respond to merchant disputes</p>
        </div>
      </div>

      {/* Status pills */}
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {[
          { label: 'All',      value: stats.total,    color: 'bg-slate-100 text-slate-700', key: 'all' },
          { label: 'Pending',  value: stats.pending,  color: 'bg-amber-100 text-amber-700', key: 'pending' },
          { label: 'Approved', value: stats.approved, color: 'bg-green-100 text-green-700', key: 'approved' },
          { label: 'Rejected', value: stats.rejected, color: 'bg-red-100 text-red-700',     key: 'rejected' },
        ].map(pill => (
          <button key={pill.key} onClick={() => setStatusFilter(pill.key)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              statusFilter === pill.key ? `${pill.color} ring-2 ring-offset-1 ring-current` : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}>
            {pill.label}
            <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${statusFilter === pill.key ? 'bg-white/60' : 'bg-slate-200 text-slate-600'}`}>{pill.value}</span>
          </button>
        ))}
      </div>

      {/* Search + filter toggle */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input type="text" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent bg-white" />
        </div>
        <button onClick={() => setShowFilters(!showFilters)}
          className={`w-10 h-10 flex items-center justify-center rounded-xl border flex-shrink-0 ${
            showFilters ? 'bg-amber-50 border-amber-300 text-amber-600' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
          }`}>
          <Filter className="w-4 h-4" />
        </button>
      </div>

      {showFilters && (
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white">
            <option value="all">All Types</option>
            <option value="payin">Payin</option>
            <option value="payout">Payout</option>
          </select>
        </div>
      )}

      {/* Cards */}
      {filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map(d => <DisputeCard key={d.id} dispute={d} onRespond={setRespondingTo} />)}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <AlertCircle className="w-10 h-10 text-slate-200 mx-auto mb-2" />
          <p className="text-slate-500 text-sm font-medium">No disputes found</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {statusFilter !== "all" || typeFilter !== "all" || search ? "Try adjusting your filters" : "No active disputes"}
          </p>
        </div>
      )}

      {respondingTo && <ResponseModal dispute={respondingTo} onClose={() => setRespondingTo(null)} onSubmit={handleResponseSubmit} />}
    </div>
  );
}