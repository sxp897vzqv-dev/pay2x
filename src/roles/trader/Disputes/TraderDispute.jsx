import React, { useEffect, useState, useMemo } from "react";
import { db, storage } from '../../../firebase';
import {
  collection, query, where, onSnapshot, orderBy, updateDoc, doc, serverTimestamp, addDoc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getAuth } from "firebase/auth";
import {
  AlertCircle, CheckCircle, XCircle, Clock, Search, RefreshCw,
  X, Upload, Send, AlertTriangle, ArrowDownCircle, ArrowUpCircle, Paperclip, Filter,
  MessageSquare, Bell, BellOff, Eye,
} from "lucide-react";

/* ─── Browser Notification Helper ─── */
class DisputeNotifications {
  constructor() {
    this.permission = 'default';
    this.enabled = false;
    this.seenDisputes = new Set(JSON.parse(localStorage.getItem('seenDisputes') || '[]'));
  }

  async requestPermission() {
    if (!('Notification' in window)) {
      console.warn('Browser does not support notifications');
      return false;
    }
    
    try {
      const permission = await Notification.requestPermission();
      this.permission = permission;
      this.enabled = permission === 'granted';
      return this.enabled;
    } catch (e) {
      console.error('Notification permission error:', e);
      return false;
    }
  }

  notify(title, body, data = {}) {
    if (!this.enabled || this.permission !== 'granted') return;
    
    try {
      const notification = new Notification(title, {
        body,
        icon: '/logo192.png',
        badge: '/logo192.png',
        tag: data.disputeId || 'dispute',
        requireInteraction: true,
        data,
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      // Auto-close after 10 seconds
      setTimeout(() => notification.close(), 10000);
    } catch (e) {
      console.error('Notification error:', e);
    }
  }

  checkNewDisputes(disputes) {
    if (!this.enabled) return;
    
    const pendingDisputes = disputes.filter(d => d.status === 'pending');
    
    for (const dispute of pendingDisputes) {
      if (!this.seenDisputes.has(dispute.id)) {
        this.notify(
          '⚠️ New Dispute',
          `${dispute.type === 'payin' ? 'Payin' : 'Payout'} dispute for ₹${dispute.amount?.toLocaleString()} - Action required!`,
          { disputeId: dispute.id }
        );
        this.seenDisputes.add(dispute.id);
      }
    }
    
    // Save seen disputes to localStorage
    localStorage.setItem('seenDisputes', JSON.stringify([...this.seenDisputes]));
  }

  markAsSeen(disputeId) {
    this.seenDisputes.add(disputeId);
    localStorage.setItem('seenDisputes', JSON.stringify([...this.seenDisputes]));
  }
}

const notificationManager = new DisputeNotifications();

/* ─── Toast ─── */
function Toast({ msg, success, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div
      className={`fixed left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-50 ${success ? 'bg-green-600' : 'bg-red-600'} text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-medium`}
      style={{ top: 60 }}
    >
      {success ? <CheckCircle size={18} className="flex-shrink-0" /> : <AlertCircle size={18} className="flex-shrink-0" />}
      <span>{msg}</span>
    </div>
  );
}

/* ─── Dispute Card ─── */
function DisputeCard({ dispute, onViewConversation, unreadCount }) {
  const isPayin = dispute.type === 'payin';

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* status stripe */}
      <div className={`h-1 ${dispute.status === 'pending' ? 'bg-amber-400' : dispute.status === 'approved' ? 'bg-green-500' : 'bg-red-500'}`} />
      <div className="p-3">

        {/* Header badges row */}
        <div className="flex items-start justify-between mb-2.5">
          <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
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
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-red-500 text-white flex items-center gap-1">
                <MessageSquare size={10} />
                {unreadCount} new
              </span>
            )}
          </div>
          {dispute.status === 'pending' && (
            <span className="text-xs text-amber-600 font-bold animate-pulse flex-shrink-0">ACTION</span>
          )}
        </div>

        {/* Key info row */}
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

        {/* Messages indicator */}
        {(dispute.messageCount || 0) > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 mb-2 bg-blue-50 rounded-lg border border-blue-200 text-xs">
            <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
            <span className="font-semibold text-blue-900">{dispute.messageCount} message{dispute.messageCount !== 1 ? 's' : ''}</span>
          </div>
        )}

        <div className="flex items-center gap-1 text-xs text-slate-400 mb-2.5">
          <Clock size={11} />
          {new Date((dispute.createdAt?.seconds || 0) * 1000).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
        </div>

        <button onClick={() => onViewConversation(dispute)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 text-white rounded-xl hover:bg-amber-600 active:scale-[0.97] transition-all font-semibold text-sm">
          <Eye size={15} /> View Conversation
        </button>
      </div>
    </div>
  );
}

/* ─── Conversation Modal with messaging ─── */
function ConversationModal({ dispute, onClose, onSubmit }) {
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [proofFile, setProofFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [action, setAction] = useState('');
  const [finalNote, setFinalNote] = useState('');
  const [showFinalDecision, setShowFinalDecision] = useState(false);
  const isPayin = dispute.type === 'payin';
  const canRespond = dispute.status === 'pending';

  // Load messages
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
        
        // Mark trader messages as read
        list.forEach(msg => {
          if (msg.from !== 'trader' && !msg.readByTrader) {
            updateDoc(doc(db, 'disputeMessages', msg.id), {
              readByTrader: true,
              readByTraderAt: serverTimestamp(),
            });
          }
        });
      }
    );

    return () => unsub();
  }, [dispute]);

  const handleSendMessage = async () => {
    if (!messageText.trim()) return;

    try {
      await addDoc(collection(db, 'disputeMessages'), {
        disputeId: dispute.id,
        from: 'trader',
        text: messageText,
        timestamp: serverTimestamp(),
        readByMerchant: false,
        readByTrader: true,
      });

      // Update message count
      await updateDoc(doc(db, 'disputes', dispute.id), {
        messageCount: (dispute.messageCount || 0) + 1,
        lastMessageAt: serverTimestamp(),
        lastMessageFrom: 'trader',
      });

      setMessageText('');
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  const handleFinalDecision = async () => {
    if (!action) { alert('Please select Accept or Reject'); return; }
    if (!finalNote.trim()) { alert('Please provide a note'); return; }
    if (action === 'reject' && !proofFile) { alert('Please upload proof for rejection'); return; }
    
    setUploading(true);
    try {
      let proofUrl = null;
      if (proofFile) {
        const sRef = ref(storage, `disputes/${dispute.id}/${Date.now()}_${proofFile.name}`);
        await uploadBytes(sRef, proofFile);
        proofUrl = await getDownloadURL(sRef);
      }

      // Add final decision message
      await addDoc(collection(db, 'disputeMessages'), {
        disputeId: dispute.id,
        from: 'trader',
        text: `**FINAL DECISION: ${action.toUpperCase()}**\n\n${finalNote}`,
        isDecision: true,
        action,
        proofUrl,
        timestamp: serverTimestamp(),
        readByMerchant: false,
        readByTrader: true,
      });

      await onSubmit({ action, note: finalNote, proofUrl });
      onClose();
    } catch (e) {
      alert('Error: ' + e.message);
    }
    setUploading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-2xl bg-white shadow-2xl rounded-t-2xl sm:rounded-2xl overflow-hidden mt-auto sm:mt-0 max-h-[90vh] flex flex-col">
        {/* Handle */}
        <div className="sm:hidden flex justify-center pt-2 pb-1"><div className="w-10 h-1 bg-slate-300 rounded-full" /></div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900">Dispute Conversation</h3>
            <p className="text-xs text-slate-400" style={{ fontFamily: 'var(--font-mono)' }}>
              {isPayin ? dispute.upiId : dispute.orderId}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg">
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        {/* Summary */}
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
          <div className="flex justify-between items-center" style={{ gap: 12 }}>
            <div className="min-w-0">
              <p className="text-xs text-slate-500">Dispute Type: <span className="font-bold capitalize">{dispute.type}</span></p>
              <p className="text-xs text-slate-500 mt-0.5">Status: <span className={`font-bold ${dispute.status === 'pending' ? 'text-amber-600' : dispute.status === 'approved' ? 'text-green-600' : 'text-red-600'}`}>{dispute.status?.toUpperCase()}</span></p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs text-slate-400">Amount</p>
              <p className="text-lg font-bold text-green-700">₹{dispute.amount?.toLocaleString()}</p>
            </div>
          </div>
          {dispute.reason && (
            <div className="mt-2 p-2 bg-white rounded-lg border border-slate-200">
              <p className="text-xs text-slate-500 font-semibold">Original Complaint:</p>
              <p className="text-xs text-slate-700 mt-0.5 italic">"{dispute.reason}"</p>
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 max-h-96">
          {messages.length > 0 ? (
            messages.map(msg => (
              <div key={msg.id} className={`p-3 rounded-lg ${
                msg.from === 'trader' 
                  ? msg.isDecision 
                    ? 'bg-amber-100 border-2 border-amber-400' 
                    : 'bg-blue-50 border border-blue-200 ml-8'
                  : 'bg-slate-50 border border-slate-200 mr-8'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-bold ${msg.isDecision ? 'text-amber-900' : msg.from === 'trader' ? 'text-blue-900' : 'text-slate-900'}`}>
                    {msg.from === 'trader' ? '🛡️ You (Trader)' : '🏪 Merchant'}
                  </span>
                  <span className="text-xs text-slate-400">
                    {new Date((msg.timestamp?.seconds || 0) * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-sm text-slate-800 whitespace-pre-wrap">{msg.text}</p>
                {msg.proofUrl && (
                  <a href={msg.proofUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-2 text-xs text-blue-600 hover:underline">
                    <Paperclip size={12} /> View Proof
                  </a>
                )}
              </div>
            ))
          ) : (
            <p className="text-center text-sm text-slate-500 py-4">No messages yet. Start the conversation!</p>
          )}
        </div>

        {/* Actions */}
        {canRespond ? (
          showFinalDecision ? (
            /* Final Decision Form */
            <div className="px-4 py-3 border-t border-slate-100 space-y-3 bg-amber-50">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-amber-900">Final Decision</h4>
                <button onClick={() => setShowFinalDecision(false)} className="text-xs text-slate-600 hover:text-slate-900">
                  Back to chat
                </button>
              </div>

              {/* Decision buttons */}
              <div className="flex gap-2">
                <button onClick={() => setAction('accept')}
                  className={`flex-1 p-3 rounded-xl border-2 transition-all text-center ${action === 'accept' ? 'border-green-500 bg-green-50' : 'border-slate-200 hover:border-green-300 bg-white'}`}>
                  <CheckCircle className={`w-5 h-5 mx-auto mb-1 ${action === 'accept' ? 'text-green-600' : 'text-slate-300'}`} />
                  <p className={`text-xs font-bold ${action === 'accept' ? 'text-green-800' : 'text-slate-500'}`}>Accept</p>
                </button>
                <button onClick={() => setAction('reject')}
                  className={`flex-1 p-3 rounded-xl border-2 transition-all text-center ${action === 'reject' ? 'border-red-500 bg-red-50' : 'border-slate-200 hover:border-red-300 bg-white'}`}>
                  <XCircle className={`w-5 h-5 mx-auto mb-1 ${action === 'reject' ? 'text-red-600' : 'text-slate-300'}`} />
                  <p className={`text-xs font-bold ${action === 'reject' ? 'text-red-800' : 'text-slate-500'}`}>Reject</p>
                </button>
              </div>

              {/* Note */}
              <textarea value={finalNote} onChange={e => setFinalNote(e.target.value)} rows={2}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                placeholder="Final decision note…" />

              {/* Proof upload (reject only) */}
              {action === 'reject' && (
                <div>
                  <label htmlFor="proof-final"
                    className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-xl p-3 cursor-pointer hover:border-amber-400 transition-colors">
                    <Upload className="w-4 h-4 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-600">Upload Proof (Required)</span>
                    <input type="file" accept="image/*" onChange={e => setProofFile(e.target.files[0])} className="hidden" id="proof-final" />
                  </label>
                  {proofFile && (
                    <div className="mt-2 px-3 py-2 bg-blue-50 rounded-lg text-xs text-blue-800 font-semibold flex items-center gap-2 border border-blue-200">
                      <Paperclip size={14} /> {proofFile.name}
                      <button onClick={() => setProofFile(null)} className="ml-auto text-blue-400 hover:text-blue-600"><X size={14} /></button>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => setShowFinalDecision(false)}
                  className="flex-1 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50">
                  Cancel
                </button>
                <button onClick={handleFinalDecision}
                  disabled={uploading || !action || !finalNote.trim() || (action === 'reject' && !proofFile)}
                  className="flex-1 py-2 bg-amber-500 text-white rounded-xl text-xs font-bold disabled:opacity-40">
                  {uploading ? 'Submitting…' : 'Submit Decision'}
                </button>
              </div>
            </div>
          ) : (
            /* Chat Input */
            <div className="px-4 py-3 border-t border-slate-100 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={messageText}
                  onChange={e => setMessageText(e.target.value)}
                  placeholder="Type your message…"
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  onKeyPress={e => e.key === 'Enter' && handleSendMessage()}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!messageText.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={() => setShowFinalDecision(true)}
                className="w-full py-2 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600 flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                Make Final Decision
              </button>
            </div>
          )
        ) : (
          <div className="px-4 py-3 border-t border-slate-100 bg-slate-50">
            <p className="text-center text-sm text-slate-600">
              Dispute {dispute.status === 'approved' ? 'accepted' : 'rejected'}. Conversation is closed.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function TraderDispute() {
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedDispute, setSelectedDispute] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [toast, setToast] = useState(null);
  const [unreadCounts, setUnreadCounts] = useState({});

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Load disputes
  useEffect(() => {
    const user = getAuth().currentUser;
    if (!user) return;
    
    const unsub = onSnapshot(
      query(collection(db, 'disputes'), where('traderId', '==', user.uid), orderBy('createdAt', 'desc')),
      snap => {
        const list = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        setDisputes(list);
        setLoading(false);
        
        // Check for new disputes and notify
        if (notificationsEnabled) {
          notificationManager.checkNewDisputes(list);
        }
      }
    );
    return () => unsub();
  }, [notificationsEnabled]);

  // Load unread message counts
  useEffect(() => {
    const user = getAuth().currentUser;
    if (!user) return;

    const unsubscribers = disputes.map(dispute => {
      return onSnapshot(
        query(
          collection(db, 'disputeMessages'),
          where('disputeId', '==', dispute.id),
          where('from', '!=', 'trader'),
          where('readByTrader', '==', false)
        ),
        snap => {
          setUnreadCounts(prev => ({ ...prev, [dispute.id]: snap.size }));
        }
      );
    });

    return () => unsubscribers.forEach(unsub => unsub());
  }, [disputes]);

  // Request notification permission on mount
  useEffect(() => {
    const checkPermission = async () => {
      if ('Notification' in window && Notification.permission === 'granted') {
        notificationManager.enabled = true;
        setNotificationsEnabled(true);
      }
    };
    checkPermission();
  }, []);

  const handleEnableNotifications = async () => {
    const granted = await notificationManager.requestPermission();
    if (granted) {
      setNotificationsEnabled(true);
      setToast({ msg: '✅ Notifications enabled!', success: true });
    } else {
      setToast({ msg: '❌ Notification permission denied', success: false });
    }
  };

  const filtered = useMemo(() => {
    let r = disputes;
    if (statusFilter !== 'all') r = r.filter(d => d.status === statusFilter);
    if (typeFilter !== 'all') r = r.filter(d => d.type === typeFilter);
    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase();
      r = r.filter(d => d.orderId?.toLowerCase().includes(s) || d.upiId?.toLowerCase().includes(s) || d.reason?.toLowerCase().includes(s));
    }
    return r;
  }, [disputes, statusFilter, typeFilter, debouncedSearch]);

  const stats = useMemo(() => ({
    total: disputes.length,
    pending: disputes.filter(d => d.status === 'pending').length,
    approved: disputes.filter(d => d.status === 'approved').length,
    rejected: disputes.filter(d => d.status === 'rejected').length,
  }), [disputes]);

  const handleResponseSubmit = async ({ action, note, proofUrl }) => {
    if (!selectedDispute) return;
    try {
      await updateDoc(doc(db, 'disputes', selectedDispute.id), {
        status: action === 'accept' ? 'approved' : 'rejected',
        traderNote: note,
        traderAction: action,
        proofUrl: proofUrl || null,
        respondedAt: serverTimestamp(),
      });
      
      // Mark as seen
      notificationManager.markAsSeen(selectedDispute.id);
      
      setSelectedDispute(null);
      setToast({ msg: `✅ Dispute ${action === 'accept' ? 'accepted' : 'rejected'}`, success: true });
    } catch (e) {
      setToast({ msg: '❌ Error: ' + e.message, success: false });
    }
  };

  const handleViewConversation = (dispute) => {
    setSelectedDispute(dispute);
    notificationManager.markAsSeen(dispute.id);
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
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* Desktop header */}
      <div className="hidden sm:flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <AlertCircle className="w-6 h-6 text-amber-600" /> Disputes
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">Respond to merchant disputes</p>
        </div>
        <button
          onClick={handleEnableNotifications}
          disabled={notificationsEnabled}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold ${
            notificationsEnabled
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100'
          }`}
        >
          {notificationsEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
          {notificationsEnabled ? 'Notifications On' : 'Enable Notifications'}
        </button>
      </div>

      {/* Notification banner (mobile) */}
      {!notificationsEnabled && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2">
          <BellOff className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-amber-900">Get instant alerts</p>
            <p className="text-xs text-amber-700 mt-0.5">Enable notifications for new disputes</p>
          </div>
          <button
            onClick={handleEnableNotifications}
            className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 flex-shrink-0"
          >
            Enable
          </button>
        </div>
      )}

      {/* Status pills */}
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {[
          { label: 'All', value: stats.total, color: 'bg-slate-100 text-slate-700', key: 'all' },
          { label: 'Pending', value: stats.pending, color: 'bg-amber-100 text-amber-700', key: 'pending' },
          { label: 'Approved', value: stats.approved, color: 'bg-green-100 text-green-700', key: 'approved' },
          { label: 'Rejected', value: stats.rejected, color: 'bg-red-100 text-red-700', key: 'rejected' },
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
          {filtered.map(d => (
            <DisputeCard
              key={d.id}
              dispute={d}
              onViewConversation={handleViewConversation}
              unreadCount={unreadCounts[d.id] || 0}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <AlertCircle className="w-10 h-10 text-slate-200 mx-auto mb-2" />
          <p className="text-slate-500 text-sm font-medium">No disputes found</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {statusFilter !== 'all' || typeFilter !== 'all' || search ? 'Try adjusting your filters' : 'No active disputes'}
          </p>
        </div>
      )}

      {selectedDispute && (
        <ConversationModal
          dispute={selectedDispute}
          onClose={() => setSelectedDispute(null)}
          onSubmit={handleResponseSubmit}
        />
      )}
    </div>
  );
}
