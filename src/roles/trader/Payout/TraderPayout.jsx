import React, { useState, useEffect } from 'react';
import { db, storage } from '../../../firebase';
import {
  collection, query, where, getDocs, onSnapshot,
  runTransaction, doc, serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getAuth } from 'firebase/auth';
import {
  DollarSign, AlertCircle, CheckCircle, Clock, XCircle,
  RefreshCw, X, CreditCard, Building2, User, Hash,
  Upload, Send, TrendingDown, Zap, FileText, Paperclip,
} from 'lucide-react';
import {
  immediateAutoAssignPayouts,
  cancelPayoutByTrader,
  cancelPayoutRequestByTrader
} from '../../../utils/Payoutassignmenthelper';

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

/* ─── Tabs config ─── */
const TABS = [
  { key: 'request',  label: 'Request',  icon: DollarSign },
  { key: 'assigned', label: 'Assigned', icon: CreditCard },
  { key: 'history',  label: 'History',  icon: FileText },
];

/* ─── Main ─── */
export default function TraderPayout() {
  const [workingBalance,    setWorkingBalance]    = useState(0);
  const [payoutCommission,  setPayoutCommission]  = useState(1);
  const [loading,           setLoading]           = useState(true);
  const [activeTab,         setActiveTab]         = useState('request');
  const [requestAmount,     setRequestAmount]     = useState('');
  const [submitting,        setSubmitting]        = useState(false);
  const [activeRequest,     setActiveRequest]     = useState(null);
  const [assignedPayouts,   setAssignedPayouts]   = useState([]);
  const [completedPayouts,  setCompletedPayouts]  = useState([]);
  const [selectedPayout,    setSelectedPayout]    = useState(null);
  const [processingPayout,  setProcessingPayout]  = useState(null);
  const [uploadProgress,    setUploadProgress]    = useState(0);
  const [toast,             setToast]             = useState(null);

  const auth     = getAuth();
  const traderId = auth.currentUser?.uid;

  /* derived */
  const hasActiveRequest   = activeRequest !== null;
  const hasAssignedPayouts = assignedPayouts.length > 0;
  const canCreateRequest   = !hasActiveRequest && !hasAssignedPayouts;
  const canCancelRequest   = hasActiveRequest && !hasAssignedPayouts;

  useEffect(() => {
    if (!traderId) return;

    /* fetch balance + commission */
    const fetchTraderData = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'trader'), where('uid', '==', traderId)));
        if (!snap.empty) {
          const d = snap.docs[0].data();
          /* ✅ BUG FIX: derive workingBalance — field doesn't exist in Firestore */
          setWorkingBalance((Number(d.balance) || 0) - (Number(d.securityHold) || 0));
          setPayoutCommission(d.payoutCommission || 1);
        }
      } catch (e) { console.error(e); }
    };
    fetchTraderData();

    /* real-time: payout requests */
    const unsubRequests = onSnapshot(
      query(collection(db, 'payoutRequest'), where('traderId', '==', traderId)),
      snap => {
        let active = null;
        snap.forEach(d => {
          const data = { id: d.id, ...d.data() };
          // Only show active requests (not completed/cancelled)
          if (data.status !== 'completed' && data.status !== 'cancelled') {
            active = data;
          }
        });
        setActiveRequest(active);
        setLoading(false);
      }
    );

    /* real-time: assigned payouts */
    const unsubAssigned = onSnapshot(
      query(collection(db, 'payouts'), where('traderId', '==', traderId), where('status', '==', 'assigned')),
      snap => {
        const list = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        list.sort((a, b) => (a.assignedAt?.seconds || 0) - (b.assignedAt?.seconds || 0));
        setAssignedPayouts(list);
      }
    );

    /* real-time: completed payouts */
    const unsubCompleted = onSnapshot(
      query(collection(db, 'payouts'), where('traderId', '==', traderId), where('status', '==', 'completed')),
      snap => {
        const list = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.completedAt?.seconds || 0) - (a.completedAt?.seconds || 0));
        setCompletedPayouts(list);
      }
    );

    return () => { unsubRequests(); unsubAssigned(); unsubCompleted(); };
  }, [traderId]);

  /* ── handlers ── */
  const handleSubmitRequest = async () => {
    const amount = Number(requestAmount);
    if (!amount || amount <= 0) { setToast({ msg: 'Please enter a valid amount', success: false }); return; }
    if (amount > 100000)        { setToast({ msg: 'Maximum request is ₹1,00,000', success: false }); return; }
    if (amount > workingBalance){ setToast({ msg: `Insufficient balance. Available: ₹${workingBalance.toLocaleString()}`, success: false }); return; }
    if (!canCreateRequest) {
      setToast({ msg: hasActiveRequest ? 'You already have an active request' : `Complete ${assignedPayouts.length} assigned payout(s) first`, success: false });
      return;
    }
    setSubmitting(true);
    try {
      const result = await immediateAutoAssignPayouts(traderId, amount);
      setToast({ msg: result.message, success: true });
      setRequestAmount('');
      if (result.assignedCount > 0) setActiveTab('assigned');
    } catch (e) {
      setToast({ msg: '❌ ' + e.message, success: false });
    }
    setSubmitting(false);
  };

  const handleCancelRequest = async () => {
    if (!activeRequest) return;
    if (hasAssignedPayouts) { setToast({ msg: `Complete ${assignedPayouts.length} assigned payout(s) first`, success: false }); return; }
    try {
      await cancelPayoutRequestByTrader(activeRequest.id);
      setToast({ msg: '✅ Request cancelled', success: true });
    } catch (e) { setToast({ msg: '❌ ' + e.message, success: false }); }
  };

  const handleUploadAndComplete = async (utrId, proofFile) => {
    if (!selectedPayout || !utrId || !proofFile) { setToast({ msg: 'Provide both UTR and proof', success: false }); return; }
    if (proofFile.size > 5 * 1024 * 1024)         { setToast({ msg: 'File must be < 5 MB', success: false }); return; }
    if (!proofFile.type.startsWith('image/'))      { setToast({ msg: 'Only image files allowed', success: false }); return; }

    setProcessingPayout(selectedPayout.id);
    setUploadProgress(0);
    try {
      const filename  = `${selectedPayout.id}-${Date.now()}-${proofFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      const storageRef = ref(storage, `payout-proofs/${filename}`);

      const progressInterval = setInterval(() => setUploadProgress(p => p >= 90 ? 90 : p + 10), 200);
      await uploadBytes(storageRef, proofFile);
      clearInterval(progressInterval);
      setUploadProgress(95);
      const proofUrl = await getDownloadURL(storageRef);
      setUploadProgress(100);

      // ✅ FIX: Get trader doc ID BEFORE transaction
      const tSnap = await getDocs(query(collection(db, 'trader'), where('uid', '==', traderId)));
      if (tSnap.empty) throw new Error('Trader not found');
      const traderDocId = tSnap.docs[0].id;

      await runTransaction(db, async (tx) => {
        const payoutRef = doc(db, 'payouts', selectedPayout.id);
        const tRef = doc(db, 'trader', traderDocId);
        
        // ✅ FIX: Use tx.get() inside transaction (participates in lock)
        const tDoc = await tx.get(tRef);
        if (!tDoc.exists()) throw new Error('Trader not found');
        const td = tDoc.data();

        const amount     = Number(selectedPayout.amount);
        const commission = Math.round((amount * payoutCommission) / 100);
        
        tx.update(payoutRef, { 
          status: 'completed', 
          completedAt: serverTimestamp(), 
          traderId, 
          utrId, 
          proofUrl, 
          commission 
        });
        tx.update(tRef, {
          balance: (Number(td.balance) || 0) + amount + commission,
          overallCommission: (Number(td.overallCommission) || 0) + commission,
        });
      });

      // ✅ Check if all payouts for this request are completed
      if (selectedPayout.payoutRequestId) {
        const requestId = selectedPayout.payoutRequestId;
        
        // Check remaining assigned payouts
        const remainingPayoutsSnap = await getDocs(
          query(
            collection(db, 'payouts'),
            where('payoutRequestId', '==', requestId),
            where('status', '==', 'assigned')
          )
        );

        // If no more assigned payouts, mark request as completed
        if (remainingPayoutsSnap.empty) {
          await updateDoc(doc(db, 'payoutRequest', requestId), {
            status: 'completed',
            completedAt: serverTimestamp(),
            fullyCompleted: true,
          });
          console.log(`✅ Request ${requestId} auto-completed - all payouts done`);
          setToast({ msg: '✅ All payouts completed! Request closed automatically', success: true });
        }
      }

      const comm = Math.round((selectedPayout.amount * payoutCommission) / 100);
      setToast({ msg: `✅ Completed! ₹${(selectedPayout.amount + comm).toLocaleString()} credited`, success: true });
      setSelectedPayout(null);

      /* refresh balance */
      const s = await getDocs(query(collection(db, 'trader'), where('uid', '==', traderId)));
      if (!s.empty) {
        const d = s.docs[0].data();
        setWorkingBalance((Number(d.balance) || 0) - (Number(d.securityHold) || 0));
      }
    } catch (e) {
      console.error(e);
      setToast({ msg: '❌ ' + (e.message || 'Upload failed'), success: false });
    }
    setProcessingPayout(null);
    setUploadProgress(0);
  };

  const handleCancelPayout = async (payout, reason) => {
    if (!reason || reason.trim().length < 10) { setToast({ msg: 'Reason must be at least 10 characters', success: false }); return; }
    setProcessingPayout(payout.id);
    try {
      await cancelPayoutByTrader(payout.id, reason);
      setToast({ msg: '✅ Payout cancelled, returned to pool', success: true });
    } catch (e) { setToast({ msg: '❌ ' + e.message, success: false }); }
    setProcessingPayout(null);
  };

  /* ── loading ── */
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-t-transparent rounded-full animate-spin mx-auto mb-3" style={{ border: '3px solid #7c3aed', borderTopColor: 'transparent' }} />
          <p className="text-slate-500 text-sm font-medium">Loading…</p>
        </div>
      </div>
    );
  }

  const totalAssigned   = assignedPayouts.reduce((s, p) => s + (p.amount || 0), 0);
  const totalCompleted  = completedPayouts.reduce((s, p) => s + (p.amount || 0), 0);

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* Desktop header */}
      <div className="hidden sm:flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-purple-500 to-blue-600 rounded-xl shadow-sm">
              <TrendingDown className="w-5 h-5 text-white" />
            </div>
            Payout Management
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 ml-11">Request & process payouts</p>
        </div>
      </div>

      {/* Active request banner */}
      {activeRequest && (
        <ActiveRequestBanner
          request={activeRequest}
          onCancel={handleCancelRequest}
          assignedCount={assignedPayouts.length}
          canCancel={canCancelRequest}
          onGoAssigned={() => setActiveTab('assigned')}
        />
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        {TABS.map(tab => {
          const Icon  = tab.icon;
          const badge = tab.key === 'assigned' ? assignedPayouts.length : tab.key === 'history' ? completedPayouts.length : 0;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 ${
                activeTab === tab.key ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              {badge > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${
                  activeTab === tab.key
                    ? (tab.key === 'assigned' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700')
                    : 'bg-slate-200 text-slate-600'
                }`}>{badge}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ── */}
      {activeTab === 'request' && (
        <RequestTab
          canCreate={canCreateRequest}
          requestAmount={requestAmount}
          setRequestAmount={setRequestAmount}
          workingBalance={workingBalance}
          submitting={submitting}
          onSubmit={handleSubmitRequest}
          activeRequest={activeRequest}
          assignedCount={assignedPayouts.length}
          onGoAssigned={() => setActiveTab('assigned')}
        />
      )}

      {activeTab === 'assigned' && (
        <AssignedTab
          payouts={assignedPayouts}
          totalAmount={totalAssigned}
          onProcess={setSelectedPayout}
          onCancel={handleCancelPayout}
          processing={processingPayout}
        />
      )}

      {activeTab === 'history' && (
        <HistoryTab payouts={completedPayouts} totalAmount={totalCompleted} />
      )}

      {/* Process modal (bottom sheet) */}
      {selectedPayout && (
        <ProcessModal
          payout={selectedPayout}
          onClose={() => setSelectedPayout(null)}
          onComplete={handleUploadAndComplete}
          isUploading={processingPayout === selectedPayout.id}
          uploadProgress={uploadProgress}
        />
      )}
    </div>
  );
}

/* ─── Active Request Banner ─── */
function ActiveRequestBanner({ request, onCancel, assignedCount, canCancel, onGoAssigned }) {
  const statusMap = {
    fully_assigned: {
      stripe: 'bg-green-500',
      bg: 'bg-green-50',
      border: 'border-green-200',
      title: '✅ Fully Assigned',
      titleColor: 'text-green-800',
    },
    partially_assigned: {
      stripe: 'bg-amber-400',
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      title: '⚠️ Partially Assigned',
      titleColor: 'text-amber-800',
    },
    waiting: {
      stripe: 'bg-blue-500',
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      title: '⏳ In Waiting List',
      titleColor: 'text-blue-800',
    },
  };

  const s = statusMap[request.status];
  if (!s) return null;

  return (
    <div className={`${s.bg} border ${s.border} rounded-xl overflow-hidden shadow-sm`}>
      <div className={`h-1 ${s.stripe}`} />
      <div className="p-3">
        {/* header row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className={`text-sm font-bold ${s.titleColor}`}>{s.title}</h3>
          {canCancel && (
            <button onClick={onCancel}
              className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 bg-red-100 text-red-700 rounded-lg text-xs font-bold hover:bg-red-200 active:scale-[0.96]">
              <X className="w-3 h-3" /> Cancel
            </button>
          )}
        </div>

        {/* amount row */}
        <div className="flex items-center gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-500">Requested</p>
            <p className="text-base font-bold text-slate-900">₹{(request.requestedAmount || 0).toLocaleString()}</p>
          </div>
          {(request.assignedAmount || 0) > 0 && (
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-500">Assigned</p>
              <p className="text-base font-bold text-slate-900">₹{(request.assignedAmount || 0).toLocaleString()}</p>
            </div>
          )}
          {(request.remainingAmount || 0) > 0 && (
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-500">Waiting</p>
              <p className="text-base font-bold text-amber-700">₹{(request.remainingAmount || 0).toLocaleString()}</p>
            </div>
          )}
        </div>

        {/* go-to-assigned link */}
        {assignedCount > 0 && (
          <button onClick={onGoAssigned} className="text-xs text-purple-600 font-bold hover:underline">
            → Go to Assigned Payouts ({assignedCount})
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Request Tab ─── */
function RequestTab({ canCreate, requestAmount, setRequestAmount, workingBalance, submitting, onSubmit, activeRequest, assignedCount, onGoAssigned }) {
  if (!canCreate) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-amber-50 border-b border-amber-200 p-3 flex items-start gap-2.5">
          <AlertCircle className="w-4.5 h-4.5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-amber-800 text-sm">Cannot Create New Request</p>
            <p className="text-xs text-amber-600 mt-0.5">
              {activeRequest && assignedCount === 0
                ? 'Cancel your current request or wait for payouts to be assigned.'
                : assignedCount > 0
                ? `Complete or cancel ${assignedCount} assigned payout(s) first.`
                : 'Complete your active request first.'}
            </p>
          </div>
        </div>
        <div className="p-4 space-y-3">
          {activeRequest && (
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <p className="text-xs text-slate-500 mb-0.5">Active Request</p>
              <p className="text-sm font-bold text-slate-900">₹{(activeRequest.requestedAmount || 0).toLocaleString()}</p>
              <p className="text-xs text-slate-500 mt-0.5 capitalize">{activeRequest.status?.replace('_', ' ')}</p>
            </div>
          )}
          {assignedCount > 0 && (
            <button onClick={onGoAssigned}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-bold hover:bg-purple-700 active:scale-[0.97]">
              <CreditCard className="w-4 h-4" /> Process {assignedCount} Assigned Payout(s)
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* info card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-purple-50 border-b border-purple-200 p-3 flex items-start gap-2.5">
          <Zap className="w-4.5 h-4.5 text-purple-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-purple-800 text-sm">Instant Auto-Assignment</p>
            <p className="text-xs text-purple-600 mt-0.5">Payouts are assigned immediately — no waiting for approval.</p>
          </div>
        </div>
      </div>

      {/* form card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Request Amount *</p>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₹</span>
            <input
              type="number"
              value={requestAmount}
              onChange={e => setRequestAmount(e.target.value)}
              placeholder="Enter amount"
              min="1" max="100000"
              className="w-full pl-8 pr-3 py-3 border border-slate-300 rounded-xl text-base font-bold focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
            />
          </div>
          <p className="text-xs text-slate-400 mt-1">Max ₹1,00,000 · Available ₹{workingBalance.toLocaleString()}</p>
        </div>

        {/* how-it-works */}
        <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
          <p className="text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5 text-blue-500" /> How it works
          </p>
          <div className="text-xs text-slate-500 space-y-0.5">
            <p>• Oldest unassigned payouts are assigned first (FIFO)</p>
            <p>• Partial match → you get available now + rest when ready</p>
            <p>• No match → added to waiting list</p>
          </div>
        </div>

        <button onClick={onSubmit} disabled={submitting || !requestAmount}
          className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl text-sm font-bold hover:from-purple-700 hover:to-blue-700 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed">
          {submitting
            ? <><RefreshCw className="w-4 h-4 animate-spin" /> Processing…</>
            : <><Send className="w-4 h-4" /> Request Payout</>
          }
        </button>
      </div>
    </div>
  );
}

/* ─── Assigned Tab ─── */
function AssignedTab({ payouts, totalAmount, onProcess, onCancel, processing }) {
  if (payouts.length === 0) {
    return (
      <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200">
        <div className="w-14 h-14 bg-white border border-slate-200 rounded-full mx-auto mb-3 flex items-center justify-center shadow-sm">
          <CheckCircle className="w-6 h-6 text-slate-400" />
        </div>
        <h3 className="text-sm font-bold text-slate-700">All Clear</h3>
        <p className="text-xs text-slate-400 mt-0.5">No payouts assigned. Create a request to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <CreditCard className="w-3.5 h-3.5 text-blue-600" />
            <p className="text-xs font-semibold text-blue-600 uppercase">Pending</p>
          </div>
          <p className="text-xl font-bold text-blue-800">{payouts.length}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <DollarSign className="w-3.5 h-3.5 text-green-600" />
            <p className="text-xs font-semibold text-green-600 uppercase">Total</p>
          </div>
          <p className="text-xl font-bold text-green-800">₹{totalAmount.toLocaleString()}</p>
        </div>
      </div>

      {/* instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2.5">
        <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-blue-800">
          <p className="font-bold mb-0.5">Instructions</p>
          <p>Process via your bank → enter UTR + upload proof → click Complete. Balance updates automatically.</p>
        </div>
      </div>

      {/* payout cards */}
      <div className="space-y-3">
        {payouts.map(p => (
          <PayoutCard key={p.id} payout={p} onProcess={onProcess} onCancel={onCancel} isProcessing={processing === p.id} />
        ))}
      </div>
    </div>
  );
}

/* ─── Payout Card ─── */
function PayoutCard({ payout, onProcess, onCancel, isProcessing }) {
  const [showCancel, setShowCancel] = useState(false);

  return (
    <>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="h-1 bg-blue-500" />
        <div className="p-3 space-y-3">

          {/* header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-400 mb-0.5">Payout ID</p>
              <p className="font-mono text-sm font-bold text-slate-900 truncate bg-slate-50 px-2 py-1 rounded-lg inline-block" style={{ fontFamily: 'var(--font-mono)' }}>
                {payout.id.slice(-10)}
              </p>
            </div>
            <span className="flex-shrink-0 flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-lg text-xs font-bold">
              <Clock className="w-3 h-3" /> PENDING
            </span>
          </div>

          {/* info grid 2×2 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
              <div className="flex items-center gap-1 mb-1"><User className="w-3 h-3 text-green-600" /><p className="text-xs font-bold text-slate-400 uppercase">User</p></div>
              <p className="text-xs font-bold text-slate-800 truncate" style={{ fontFamily: 'var(--font-mono)' }}>{payout.userId || '—'}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
              <div className="flex items-center gap-1 mb-1"><User className="w-3 h-3 text-blue-600" /><p className="text-xs font-bold text-slate-400 uppercase">Holder</p></div>
              <p className="text-xs font-bold text-slate-800 truncate">{payout.accountHolderName || '—'}</p>
            </div>

            {payout.paymentMethod === 'upi' ? (
              <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100 col-span-2 sm:col-span-1">
                <div className="flex items-center gap-1 mb-1"><CreditCard className="w-3 h-3 text-purple-600" /><p className="text-xs font-bold text-slate-400 uppercase">UPI</p></div>
                <p className="text-xs font-semibold text-slate-800 truncate" style={{ fontFamily: 'var(--font-mono)' }}>{payout.upiId || '—'}</p>
              </div>
            ) : (
              <>
                <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                  <div className="flex items-center gap-1 mb-1"><Hash className="w-3 h-3 text-purple-600" /><p className="text-xs font-bold text-slate-400 uppercase">Account</p></div>
                  <p className="text-xs font-bold text-slate-800 truncate" style={{ fontFamily: 'var(--font-mono)' }}>{payout.accountNumber || '—'}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                  <div className="flex items-center gap-1 mb-1"><Building2 className="w-3 h-3 text-indigo-600" /><p className="text-xs font-bold text-slate-400 uppercase">IFSC</p></div>
                  <p className="text-xs font-bold text-slate-800 truncate" style={{ fontFamily: 'var(--font-mono)' }}>{payout.ifscCode || '—'}</p>
                </div>
              </>
            )}

            {/* amount cell */}
            <div className="bg-green-50 rounded-lg p-2.5 border border-green-200 col-span-2 sm:col-span-1">
              <div className="flex items-center gap-1 mb-1"><DollarSign className="w-3 h-3 text-green-600" /><p className="text-xs font-bold text-slate-600 uppercase">Amount</p></div>
              <p className="text-base font-bold text-green-700">₹{(payout.amount || 0).toLocaleString()}</p>
            </div>
          </div>

          {/* action buttons */}
          <div className="flex gap-2 pt-1">
            <button onClick={() => onProcess(payout)} disabled={isProcessing}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed">
              <CheckCircle className="w-4 h-4" />{isProcessing ? 'Processing…' : 'Complete'}
            </button>
            <button onClick={() => setShowCancel(true)} disabled={isProcessing}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed">
              <XCircle className="w-4 h-4" /> Cancel
            </button>
          </div>
        </div>
      </div>

      {/* cancel bottom sheet */}
      {showCancel && (
        <CancelSheet payout={payout} onClose={() => setShowCancel(false)} onCancel={onCancel} />
      )}
    </>
  );
}

/* ─── Cancel Bottom Sheet ─── */
function CancelSheet({ payout, onClose, onCancel }) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:w-full sm:max-w-md bg-white shadow-2xl sm:rounded-2xl rounded-t-2xl overflow-hidden mt-auto sm:mt-0 max-h-[85vh] flex flex-col">
        {/* handle */}
        <div className="sm:hidden flex justify-center pt-2 pb-1"><div className="w-10 h-1 bg-slate-300 rounded-full" /></div>
        {/* header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-900">Cancel Payout</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg"><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        {/* summary */}
        <div className="px-4 pt-3">
          <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 flex items-center justify-between">
            <p className="text-xs text-slate-500">Amount</p>
            <p className="text-sm font-bold text-slate-900">₹{(payout.amount || 0).toLocaleString()}</p>
          </div>
        </div>
        {/* body */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Reason *</label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent resize-none"
            placeholder="Explain why you're cancelling… (min 10 chars)" />
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mt-2 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">This payout will be returned to the pool for another trader.</p>
          </div>
        </div>
        {/* footer */}
        <div className="px-4 py-3 border-t border-slate-100 flex gap-2.5">
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-300 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 active:bg-slate-100">Cancel</button>
          <button onClick={() => { onCancel(payout, reason); onClose(); }} disabled={reason.trim().length < 10}
            className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-bold disabled:opacity-40 active:scale-[0.97]">Confirm</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Process Modal (bottom sheet) ─── */
function ProcessModal({ payout, onClose, onComplete, isUploading, uploadProgress }) {
  const [utrId,      setUtrId]      = useState('');
  const [proofFile,  setProofFile]  = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (file) { setProofFile(file); setPreviewUrl(URL.createObjectURL(file)); }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:w-full sm:max-w-md bg-white shadow-2xl sm:rounded-2xl rounded-t-2xl overflow-hidden mt-auto sm:mt-0 max-h-[90vh] flex flex-col">
        {/* handle */}
        <div className="sm:hidden flex justify-center pt-2 pb-1"><div className="w-10 h-1 bg-slate-300 rounded-full" /></div>
        {/* header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900">Complete Payout</h3>
            <p className="text-xs text-slate-500">₹{(payout.amount || 0).toLocaleString()}</p>
          </div>
          <button onClick={onClose} disabled={isUploading} className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg disabled:opacity-40">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* payment details summary */}
          <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">User ID</p>
              <p className="text-xs font-bold text-slate-800 truncate ml-2" style={{ fontFamily: 'var(--font-mono)' }}>{payout.userId || '—'}</p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">Account</p>
              <p className="text-xs font-bold text-slate-800 truncate ml-2" style={{ fontFamily: 'var(--font-mono)' }}>{payout.accountNumber || payout.upiId || '—'}</p>
            </div>
          </div>

          {/* UTR input */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">UTR / Reference *</label>
            <input type="text" value={utrId} onChange={e => setUtrId(e.target.value)} disabled={isUploading}
              placeholder="Enter transaction reference"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
              style={{ fontFamily: 'var(--font-mono)' }} />
          </div>

          {/* proof upload */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Proof Screenshot *</label>
            {previewUrl ? (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <img src={previewUrl} alt="Preview" className="w-full max-h-48 object-contain bg-slate-50" />
                <div className="px-3 py-2 border-t border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-blue-600" />
                    <span className="text-xs font-semibold text-slate-700 truncate">{proofFile?.name}</span>
                  </div>
                  <button onClick={() => { setProofFile(null); setPreviewUrl(null); }} disabled={isUploading}
                    className="text-xs text-red-500 font-semibold hover:text-red-700 disabled:opacity-40">Remove</button>
                </div>
              </div>
            ) : (
              <label htmlFor="process-proof"
                className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-xl p-4 cursor-pointer hover:border-green-400 transition-colors">
                <Upload className="w-6 h-6 text-slate-400" />
                <p className="text-sm font-semibold text-slate-600">Tap to upload</p>
                <p className="text-xs text-slate-400">JPG / PNG · Max 5 MB</p>
                <input type="file" accept="image/*" onChange={handleFile} disabled={isUploading} className="hidden" id="process-proof" />
              </label>
            )}
          </div>

          {/* upload progress */}
          {isUploading && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-bold text-blue-800">Uploading…</p>
                <p className="text-xs font-bold text-blue-800">{uploadProgress}%</p>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-1.5">
                <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="px-4 py-3 border-t border-slate-100 flex gap-2.5">
          <button onClick={onClose} disabled={isUploading}
            className="flex-1 py-2.5 border border-slate-300 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40">Cancel</button>
          <button onClick={() => onComplete(utrId, proofFile)} disabled={!utrId || !proofFile || isUploading}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-bold disabled:opacity-40 active:scale-[0.97]">
            {isUploading
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Processing…</>
              : <><CheckCircle className="w-4 h-4" /> Complete</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── History Tab ─── */
function HistoryTab({ payouts, totalAmount }) {
  if (payouts.length === 0) {
    return (
      <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200">
        <div className="w-14 h-14 bg-white border border-slate-200 rounded-full mx-auto mb-3 flex items-center justify-center shadow-sm">
          <FileText className="w-6 h-6 text-slate-400" />
        </div>
        <h3 className="text-sm font-bold text-slate-700">No History Yet</h3>
        <p className="text-xs text-slate-400 mt-0.5">Completed payouts will appear here</p>
      </div>
    );
  }

  /* group by date */
  const grouped = payouts.reduce((acc, p) => {
    let dateKey = '—';
    try {
      const d = p.completedAt?.toDate?.() || new Date((p.completedAt?.seconds || 0) * 1000);
      dateKey = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) { /* keep default */ }
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      {/* summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <CheckCircle className="w-3.5 h-3.5 text-purple-600" />
            <p className="text-xs font-semibold text-purple-600 uppercase">Completed</p>
          </div>
          <p className="text-xl font-bold text-purple-800">{payouts.length}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <DollarSign className="w-3.5 h-3.5 text-green-600" />
            <p className="text-xs font-semibold text-green-600 uppercase">Total</p>
          </div>
          <p className="text-xl font-bold text-green-800">₹{totalAmount.toLocaleString()}</p>
        </div>
      </div>

      {/* grouped history */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {Object.entries(grouped).map(([date, items], gi) => (
          <div key={date}>
            {/* date header */}
            <div className={`px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2 ${gi > 0 ? 'border-t border-slate-100' : ''}`}>
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <p className="text-xs font-bold text-slate-600">{date}</p>
              <span className="text-xs text-slate-400">({items.length})</span>
            </div>
            {/* rows */}
            <div className="divide-y divide-slate-100">
              {items.map((p, i) => (
                <HistoryRow key={p.id || i} payout={p} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── History Row ─── */
function HistoryRow({ payout }) {
  let timeStr = '—';
  try {
    const d = payout.completedAt?.toDate?.() || new Date((payout.completedAt?.seconds || 0) * 1000);
    timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  } catch (e) { /* keep default */ }

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <CheckCircle className="w-3.5 h-3.5 text-green-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900">₹{(payout.amount || 0).toLocaleString()}</p>
            <p className="text-xs text-slate-400">{timeStr}</p>
          </div>
        </div>
        <span className="flex-shrink-0 px-2 py-0.5 bg-green-100 text-green-700 rounded-lg text-xs font-bold">DONE</span>
      </div>

      {/* details row */}
      <div className="flex gap-3 ml-9 flex-wrap">
        {payout.upiId && (
          <div>
            <p className="text-xs text-slate-400">UPI</p>
            <p className="text-xs font-semibold text-slate-700 truncate" style={{ fontFamily: 'var(--font-mono)' }}>{payout.upiId}</p>
          </div>
        )}
        {payout.accountNumber && (
          <div>
            <p className="text-xs text-slate-400">Account</p>
            <p className="text-xs font-semibold text-slate-700" style={{ fontFamily: 'var(--font-mono)' }}>***{payout.accountNumber.slice(-4)}</p>
          </div>
        )}
        {payout.utrId && (
          <div>
            <p className="text-xs text-slate-400">UTR</p>
            <p className="text-xs font-semibold text-slate-700 truncate" style={{ fontFamily: 'var(--font-mono)' }}>{payout.utrId}</p>
          </div>
        )}
        {payout.proofUrl && (
          <a href={payout.proofUrl} target="_blank" rel="noopener noreferrer"
            className="text-xs text-blue-600 font-semibold flex items-center gap-0.5 hover:underline">
            <FileText className="w-3 h-3" /> Proof
          </a>
        )}
      </div>
    </div>
  );
}