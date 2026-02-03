import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
import {
  collection, query, where, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, orderBy,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import {
  AlertTriangle, Search, Filter, X, Clock, CheckCircle, XCircle, MessageSquare,
  Upload, Download, RefreshCw, Send, Paperclip, Calendar, User, DollarSign,
} from 'lucide-react';

/* ─── Dispute Card ─── */
function DisputeCard({ dispute, onViewDetails }) {
  const statusColors = {
    open: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', icon: Clock },
    'in-review': { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: RefreshCw },
    resolved: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', icon: CheckCircle },
    rejected: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: XCircle },
  };

  const status = statusColors[dispute.status] || statusColors.open;
  const StatusIcon = status.icon;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className={`h-1 ${dispute.status === 'resolved' ? 'bg-green-500' : dispute.status === 'rejected' ? 'bg-red-500' : 'bg-yellow-500'}`} />
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
            <StatusIcon className={`w-3 h-3 ${dispute.status === 'in-review' ? 'animate-spin' : ''}`} />
            {dispute.status?.toUpperCase().replace('-', ' ')}
          </span>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
            <div className="flex items-center gap-1 mb-1">
              <DollarSign className="w-3 h-3 text-purple-600" />
              <p className="text-xs font-bold text-slate-400 uppercase">Amount</p>
            </div>
            <p className="text-base font-bold text-purple-700">₹{dispute.amount?.toLocaleString()}</p>
          </div>

          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
            <div className="flex items-center gap-1 mb-1">
              <User className="w-3 h-3 text-blue-600" />
              <p className="text-xs font-bold text-slate-400 uppercase">Customer</p>
            </div>
            <p className="text-xs font-bold text-slate-800 truncate">{dispute.customerId || 'N/A'}</p>
          </div>
        </div>

        {/* Reason */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2.5">
          <p className="text-xs font-bold text-yellow-900 mb-1">Reason</p>
          <p className="text-xs text-yellow-800">{dispute.reason || 'No reason provided'}</p>
        </div>

        {/* Messages indicator */}
        {dispute.messageCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg border border-blue-200 text-xs">
            <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
            <span className="font-semibold text-blue-900">{dispute.messageCount} message{dispute.messageCount !== 1 ? 's' : ''}</span>
          </div>
        )}

        {/* Timestamp + View button */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
          <div className="flex items-center gap-1 text-xs text-slate-400">
            <Clock size={11} />
            {new Date((dispute.createdAt?.seconds || 0) * 1000).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
          </div>
          <button
            onClick={() => onViewDetails(dispute)}
            className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-semibold hover:bg-purple-700"
          >
            View Details
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Dispute Details Modal ─── */
function DisputeDetailsModal({ dispute, onClose, onSubmitReply, onUploadEvidence }) {
  const [replyText, setReplyText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    if (!dispute) return;

    const unsub = onSnapshot(
      query(
        collection(db, 'disputeMessages'),
        where('disputeId', '==', dispute.id),
        orderBy('timestamp', 'asc')
      ),
      snap => {
        const list = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        setMessages(list);
      }
    );

    return () => unsub();
  }, [dispute]);

  const handleSendReply = async () => {
    if (!replyText.trim()) return;
    
    try {
      await onSubmitReply(dispute.id, replyText);
      setReplyText('');
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      // TODO: Upload to storage and get URL
      const fakeUrl = `https://example.com/evidence/${file.name}`;
      await onUploadEvidence(dispute.id, fakeUrl, file.name);
    } catch (e) {
      alert('Error: ' + e.message);
    }
    setUploading(false);
  };

  if (!dispute) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-3xl bg-white shadow-2xl rounded-t-2xl sm:rounded-2xl overflow-hidden mt-auto sm:mt-0 max-h-[90vh] flex flex-col">
        {/* Handle */}
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 bg-slate-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900">Dispute Details</h3>
            <p className="text-xs text-slate-400" style={{ fontFamily: 'var(--font-mono)' }}>
              {dispute.disputeId}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Summary */}
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Amount</p>
                <p className="font-bold text-purple-700 text-lg">₹{dispute.amount?.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Status</p>
                <p className="font-bold text-slate-900 capitalize">{dispute.status?.replace('-', ' ')}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Customer ID</p>
                <p className="font-mono text-xs text-slate-800" style={{ fontFamily: 'var(--font-mono)' }}>
                  {dispute.customerId || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Order ID</p>
                <p className="font-mono text-xs text-slate-800" style={{ fontFamily: 'var(--font-mono)' }}>
                  {dispute.orderId || 'N/A'}
                </p>
              </div>
            </div>
          </div>

          {/* Reason */}
          <div>
            <h4 className="text-sm font-bold text-slate-900 mb-2">Dispute Reason</h4>
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
              <p className="text-sm text-yellow-900">{dispute.reason || 'No reason provided'}</p>
            </div>
          </div>

          {/* Evidence */}
          {dispute.evidence && dispute.evidence.length > 0 && (
            <div>
              <h4 className="text-sm font-bold text-slate-900 mb-2">Evidence</h4>
              <div className="space-y-2">
                {dispute.evidence.map((item, i) => (
                  <div key={i} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                    <div className="flex items-center gap-2">
                      <Paperclip className="w-4 h-4 text-slate-400" />
                      <span className="text-xs font-semibold text-slate-700">{item.name}</span>
                    </div>
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline">
                      View
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          <div>
            <h4 className="text-sm font-bold text-slate-900 mb-2">Conversation</h4>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {messages.length > 0 ? (
                messages.map(msg => (
                  <div key={msg.id} className={`p-3 rounded-lg ${
                    msg.from === 'merchant' ? 'bg-purple-50 border border-purple-200 ml-4' : 'bg-slate-50 border border-slate-200 mr-4'
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-900">
                        {msg.from === 'merchant' ? 'You' : 'Customer'}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date((msg.timestamp?.seconds || 0) * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-sm text-slate-800">{msg.text}</p>
                  </div>
                ))
              ) : (
                <p className="text-center text-sm text-slate-500 py-4">No messages yet</p>
              )}
            </div>
          </div>

          {/* Upload Evidence */}
          <div className="border-t border-slate-200 pt-3">
            <label className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-sm font-semibold hover:bg-blue-100 cursor-pointer inline-flex">
              <Upload className="w-4 h-4" />
              {uploading ? 'Uploading...' : 'Upload Evidence'}
              <input type="file" onChange={handleFileUpload} className="hidden" disabled={uploading || dispute.status === 'resolved'} />
            </label>
          </div>
        </div>

        {/* Footer - Reply */}
        {dispute.status !== 'resolved' && dispute.status !== 'rejected' && (
          <div className="px-4 py-3 border-t border-slate-100">
            <div className="flex gap-2">
              <input
                type="text"
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder="Type your reply..."
                className="flex-1 px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                onKeyPress={e => e.key === 'Enter' && handleSendReply()}
              />
              <button
                onClick={handleSendReply}
                disabled={!replyText.trim()}
                className="px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 disabled:opacity-40 flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main Component ─── */
export default function MerchantDisputes() {
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedDispute, setSelectedDispute] = useState(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const user = getAuth().currentUser;
    if (!user) return;

    const unsub = onSnapshot(
      query(
        collection(db, 'merchantDisputes'),
        where('merchantId', '==', user.uid),
        orderBy('createdAt', 'desc')
      ),
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
    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase();
      r = r.filter(d =>
        d.disputeId?.toLowerCase().includes(s) ||
        d.customerId?.toLowerCase().includes(s) ||
        d.orderId?.toLowerCase().includes(s)
      );
    }
    return r;
  }, [disputes, statusFilter, debouncedSearch]);

  const stats = useMemo(() => ({
    total: disputes.length,
    open: disputes.filter(d => d.status === 'open').length,
    'in-review': disputes.filter(d => d.status === 'in-review').length,
    resolved: disputes.filter(d => d.status === 'resolved').length,
    rejected: disputes.filter(d => d.status === 'rejected').length,
  }), [disputes]);

  const handleSubmitReply = async (disputeId, text) => {
    const user = getAuth().currentUser;
    if (!user) return;

    await addDoc(collection(db, 'disputeMessages'), {
      disputeId,
      from: 'merchant',
      text,
      timestamp: serverTimestamp(),
    });

    // Update dispute messageCount
    const dispute = disputes.find(d => d.id === disputeId);
    if (dispute) {
      await updateDoc(doc(db, 'merchantDisputes', disputeId), {
        messageCount: (dispute.messageCount || 0) + 1,
        updatedAt: serverTimestamp(),
      });
    }
  };

  const handleUploadEvidence = async (disputeId, url, name) => {
    const dispute = disputes.find(d => d.id === disputeId);
    const evidence = dispute?.evidence || [];
    
    await updateDoc(doc(db, 'merchantDisputes', disputeId), {
      evidence: [...evidence, { url, name, uploadedAt: serverTimestamp() }],
      updatedAt: serverTimestamp(),
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <RefreshCw className="w-10 h-10 text-yellow-500 animate-spin mx-auto mb-3" />
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
            <div className="p-2 bg-gradient-to-br from-yellow-500 to-orange-600 rounded-xl shadow-sm">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
            Disputes
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 ml-11">Manage customer disputes</p>
        </div>
      </div>

      {/* Status pills */}
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {[
          { label: 'All', value: stats.total, color: 'bg-slate-100 text-slate-700', key: 'all' },
          { label: 'Open', value: stats.open, color: 'bg-yellow-100 text-yellow-700', key: 'open' },
          { label: 'In Review', value: stats['in-review'], color: 'bg-blue-100 text-blue-700', key: 'in-review' },
          { label: 'Resolved', value: stats.resolved, color: 'bg-green-100 text-green-700', key: 'resolved' },
          { label: 'Rejected', value: stats.rejected, color: 'bg-red-100 text-red-700', key: 'rejected' },
        ].map(pill => (
          <button
            key={pill.key}
            onClick={() => setStatusFilter(pill.key)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              statusFilter === pill.key ? `${pill.color} ring-2 ring-offset-1 ring-current` : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
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
            placeholder="Search dispute, customer, order ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent bg-white"
          />
        </div>
      </div>

      {/* Cards */}
      {filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map(d => (
            <DisputeCard key={d.id} dispute={d} onViewDetails={setSelectedDispute} />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <AlertTriangle className="w-10 h-10 text-slate-200 mx-auto mb-2" />
          <p className="text-slate-500 text-sm font-medium">No disputes found</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {statusFilter !== 'all' || search ? 'Try adjusting your filters' : 'Disputes will appear here when customers raise them'}
          </p>
        </div>
      )}

      {/* Dispute Details Modal */}
      {selectedDispute && (
        <DisputeDetailsModal
          dispute={selectedDispute}
          onClose={() => setSelectedDispute(null)}
          onSubmitReply={handleSubmitReply}
          onUploadEvidence={handleUploadEvidence}
        />
      )}
    </div>
  );
}
