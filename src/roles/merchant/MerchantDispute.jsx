import React, { useState, useEffect, useMemo } from 'react';
import { db, storage } from '../../firebase';
import {
  collection, query, where, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, orderBy,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getAuth } from 'firebase/auth';
import {
  AlertCircle, Plus, Search, Filter, X, Upload, Send, CheckCircle, XCircle,
  Clock, FileText, RefreshCw, Paperclip, MessageSquare, TrendingDown, TrendingUp,
} from 'lucide-react';

/* ─── Dispute Card ─── */
function DisputeCard({ dispute, onViewDetails }) {
  const statusColors = {
    open: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', icon: Clock },
    under_review: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: RefreshCw },
    resolved: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', icon: CheckCircle },
    lost: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: XCircle },
  };

  const status = statusColors[dispute.status] || statusColors.open;
  const StatusIcon = status.icon;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className={`h-1 ${dispute.status === 'resolved' ? 'bg-green-500' : dispute.status === 'lost' ? 'bg-red-500' : 'bg-yellow-500'}`} />
      <div className="p-3 space-y-3">
        
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 mb-0.5">Dispute ID</p>
            <p className="font-mono text-sm font-bold text-slate-900 truncate bg-slate-50 px-2 py-1 rounded-lg inline-block" style={{ fontFamily: 'var(--font-mono)' }}>
              {dispute.disputeId || dispute.id.slice(-8)}
            </p>
          </div>
          <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${status.bg} ${status.border} ${status.text} flex items-center gap-1 border flex-shrink-0`}>
            <StatusIcon className={`w-3 h-3 ${dispute.status === 'under_review' ? 'animate-spin' : ''}`} />
            {dispute.status?.replace('_', ' ').toUpperCase()}
          </span>
        </div>

        {/* Info */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
            <p className="text-xs font-bold text-slate-400 uppercase mb-1">Transaction</p>
            <p className="text-xs font-semibold text-slate-800 truncate" style={{ fontFamily: 'var(--font-mono)' }}>
              {dispute.transactionId || 'N/A'}
            </p>
          </div>
          <div className="bg-red-50 rounded-lg p-2.5 border border-red-200">
            <p className="text-xs font-bold text-slate-600 uppercase mb-1">Amount</p>
            <p className="text-base font-bold text-red-700">₹{dispute.amount?.toLocaleString()}</p>
          </div>
        </div>

        {/* Reason */}
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
          <p className="text-xs font-bold text-slate-600 mb-1">Reason</p>
          <p className="text-xs text-slate-700 line-clamp-2">{dispute.reason || 'No reason provided'}</p>
        </div>

        {/* Deadline */}
        {dispute.deadline && dispute.status === 'open' && (
          <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 rounded-lg border border-orange-200 text-xs">
            <Clock className="w-3.5 h-3.5 text-orange-600" />
            <span className="font-semibold text-orange-900">
              Respond by: {new Date((dispute.deadline?.seconds || 0) * 1000).toLocaleDateString('en-IN')}
            </span>
          </div>
        )}

        {/* Timestamp */}
        <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-100">
          <div className="flex items-center gap-1">
            <Clock size={11} />
            {new Date((dispute.createdAt?.seconds || 0) * 1000).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
          </div>
          <button onClick={() => onViewDetails(dispute)} className="text-purple-600 font-semibold hover:text-purple-700">
            View Details →
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Create Dispute Modal ─── */
function CreateDisputeModal({ onClose, onSubmit }) {
  const [form, setForm] = useState({
    transactionId: '',
    reason: '',
    amount: '',
    type: 'payin',
  });
  const [evidence, setEvidence] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!form.transactionId || !form.reason || !form.amount) {
      alert('Please fill all required fields');
      return;
    }

    if (form.reason.length < 20) {
      alert('Reason must be at least 20 characters');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(form, evidence);
      onClose();
    } catch (e) {
      alert('Error: ' + e.message);
    }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-white shadow-2xl rounded-t-2xl sm:rounded-2xl overflow-hidden mt-auto sm:mt-0 max-h-[90vh] flex flex-col">
        <div className="sm:hidden flex justify-center pt-2 pb-1"><div className="w-10 h-1 bg-slate-300 rounded-full" /></div>

        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-900">File Dispute</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Transaction Type</label>
            <div className="flex gap-2">
              <button onClick={() => setForm({ ...form, type: 'payin' })}
                className={`flex-1 p-3 rounded-xl border-2 transition-all text-center ${
                  form.type === 'payin' ? 'border-green-500 bg-green-50' : 'border-slate-200 bg-white'
                }`}>
                <TrendingUp className={`w-5 h-5 mx-auto mb-1 ${form.type === 'payin' ? 'text-green-600' : 'text-slate-300'}`} />
                <p className={`text-sm font-bold ${form.type === 'payin' ? 'text-green-800' : 'text-slate-500'}`}>Payin</p>
              </button>
              <button onClick={() => setForm({ ...form, type: 'payout' })}
                className={`flex-1 p-3 rounded-xl border-2 transition-all text-center ${
                  form.type === 'payout' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white'
                }`}>
                <TrendingDown className={`w-5 h-5 mx-auto mb-1 ${form.type === 'payout' ? 'text-blue-600' : 'text-slate-300'}`} />
                <p className={`text-sm font-bold ${form.type === 'payout' ? 'text-blue-800' : 'text-slate-500'}`}>Payout</p>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Transaction ID *</label>
            <input
              type="text"
              value={form.transactionId}
              onChange={e => setForm({ ...form, transactionId: e.target.value })}
              placeholder="TXN123456"
              className="w-full px-3 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 font-mono"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Amount *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-semibold">₹</span>
              <input
                type="number"
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                placeholder="0"
                className="w-full pl-8 pr-3 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 font-bold"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Reason *</label>
            <textarea
              value={form.reason}
              onChange={e => setForm({ ...form, reason: e.target.value })}
              rows={4}
              placeholder="Describe the issue in detail (min 20 characters)..."
              className="w-full px-3 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
            />
            <p className="text-xs text-slate-500 mt-1">{form.reason.length}/200 characters</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Evidence (Optional)</label>
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-xl p-4 cursor-pointer hover:border-red-400 transition-colors">
              <Upload className="w-6 h-6 text-slate-400" />
              <p className="text-sm font-semibold text-slate-600">Upload screenshot or document</p>
              <input type="file" accept="image/*,.pdf" onChange={e => setEvidence(e.target.files[0])} className="hidden" />
            </label>
            {evidence && (
              <div className="mt-2 px-3 py-2 bg-blue-50 rounded-lg text-xs text-blue-800 font-semibold flex items-center gap-2 border border-blue-200">
                <Paperclip size={14} /> {evidence.name}
                <button onClick={() => setEvidence(null)} className="ml-auto text-blue-400 hover:text-blue-600">
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-slate-100 flex gap-2.5">
          <button onClick={onClose} className="flex-1 py-3 border border-slate-300 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={submitting}
            className="flex-1 py-3 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 active:scale-[0.97] disabled:opacity-40 flex items-center justify-center gap-2">
            {submitting ? <><RefreshCw className="w-4 h-4 animate-spin" /> Filing…</> : <><Send className="w-4 h-4" /> File Dispute</>}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MerchantDispute() {
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const user = getAuth().currentUser;
    if (!user) return;

    const unsub = onSnapshot(
      query(collection(db, 'merchantDisputes'), where('merchantId', '==', user.uid), orderBy('createdAt', 'desc')),
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
    if (statusFilter !== 'all') r = r.filter(d => d.status === statusFilter);
    if (search) {
      const s = search.toLowerCase();
      r = r.filter(d => 
        d.disputeId?.toLowerCase().includes(s) || 
        d.transactionId?.toLowerCase().includes(s) ||
        d.reason?.toLowerCase().includes(s)
      );
    }
    return r;
  }, [disputes, statusFilter, search]);

  const stats = useMemo(() => ({
    total: disputes.length,
    open: disputes.filter(d => d.status === 'open').length,
    under_review: disputes.filter(d => d.status === 'under_review').length,
    resolved: disputes.filter(d => d.status === 'resolved').length,
    lost: disputes.filter(d => d.status === 'lost').length,
  }), [disputes]);

  const handleCreateDispute = async (formData, evidence) => {
    const user = getAuth().currentUser;
    if (!user) return;

    let evidenceUrl = null;
    if (evidence) {
      const storageRef = ref(storage, `dispute-evidence/${Date.now()}_${evidence.name}`);
      await uploadBytes(storageRef, evidence);
      evidenceUrl = await getDownloadURL(storageRef);
    }

    await addDoc(collection(db, 'merchantDisputes'), {
      merchantId: user.uid,
      disputeId: 'DSP' + Date.now(),
      transactionId: formData.transactionId,
      amount: Number(formData.amount),
      reason: formData.reason,
      type: formData.type,
      evidenceUrl,
      status: 'open',
      createdAt: serverTimestamp(),
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    });

    setShowModal(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <RefreshCw className="w-10 h-10 text-red-500 animate-spin mx-auto mb-3" />
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
            <div className="p-2 bg-gradient-to-br from-red-500 to-red-600 rounded-xl shadow-sm">
              <AlertCircle className="w-5 h-5 text-white" />
            </div>
            Disputes
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 ml-11">Manage transaction disputes</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 text-sm font-semibold">
          <Plus className="w-4 h-4" /> File Dispute
        </button>
      </div>

      {/* Mobile create button */}
      <div className="flex sm:hidden justify-end">
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 text-sm font-semibold active:scale-[0.96]">
          <Plus className="w-4 h-4" /> File
        </button>
      </div>

      {/* Status pills */}
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {[
          { label: 'All', value: stats.total, color: 'bg-slate-100 text-slate-700', key: 'all' },
          { label: 'Open', value: stats.open, color: 'bg-yellow-100 text-yellow-700', key: 'open' },
          { label: 'Under Review', value: stats.under_review, color: 'bg-blue-100 text-blue-700', key: 'under_review' },
          { label: 'Resolved', value: stats.resolved, color: 'bg-green-100 text-green-700', key: 'resolved' },
          { label: 'Lost', value: stats.lost, color: 'bg-red-100 text-red-700', key: 'lost' },
        ].map(pill => (
          <button key={pill.key} onClick={() => setStatusFilter(pill.key)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              statusFilter === pill.key ? `${pill.color} ring-2 ring-offset-1 ring-current` : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}>
            {pill.label}
            <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${statusFilter === pill.key ? 'bg-white/60' : 'bg-slate-200 text-slate-600'}`}>
              {pill.value}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search disputes…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent bg-white"
          />
        </div>
      </div>

      {/* Cards */}
      {filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map(d => (
            <DisputeCard key={d.id} dispute={d} onViewDetails={(dispute) => alert(`View details for ${dispute.disputeId}`)} />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <AlertCircle className="w-10 h-10 text-slate-200 mx-auto mb-2" />
          <p className="text-slate-500 text-sm font-medium">No disputes found</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {statusFilter !== 'all' || search ? 'Try adjusting your filters' : 'File a dispute to get started'}
          </p>
        </div>
      )}

      {showModal && <CreateDisputeModal onClose={() => setShowModal(false)} onSubmit={handleCreateDispute} />}
    </div>
  );
}