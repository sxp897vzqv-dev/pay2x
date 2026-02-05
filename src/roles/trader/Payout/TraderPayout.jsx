import React, { useState, useEffect } from 'react';
import { db, storage } from '../../../firebase';
import {
  collection, query, where, getDocs, onSnapshot,
  runTransaction, doc, serverTimestamp, updateDoc, limit,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getAuth } from 'firebase/auth';
import {
  DollarSign, CreditCard, TrendingDown, FileText,
} from 'lucide-react';
import {
  immediateAutoAssignPayouts,
  cancelPayoutByTrader,
  cancelPayoutRequestByTrader
} from '../../../utils/Payoutassignmenthelper';
import Toast from '../../../components/admin/Toast';
import ActiveRequestBanner from './components/ActiveRequestBanner';
import RequestTab from './components/RequestTab';
import AssignedTab from './components/AssignedTab';
import HistoryTab from './components/HistoryTab';
import ProcessModal from './components/ProcessModal';

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
      query(collection(db, 'payouts'), where('traderId', '==', traderId), where('status', '==', 'assigned'), limit(100)),
      snap => {
        const list = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        list.sort((a, b) => (a.assignedAt?.seconds || 0) - (b.assignedAt?.seconds || 0));
        setAssignedPayouts(list);
      }
    );

    /* real-time: completed payouts */
    const unsubCompleted = onSnapshot(
      query(collection(db, 'payouts'), where('traderId', '==', traderId), where('status', '==', 'completed'), limit(200)),
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
      <div className="space-y-4 max-w-3xl mx-auto">
        {/* Tabs skeleton */}
        <div className="flex gap-2">
          <div className="flex-1 h-10 bg-slate-200 rounded-xl animate-pulse"></div>
          <div className="flex-1 h-10 bg-slate-200 rounded-xl animate-pulse"></div>
          <div className="flex-1 h-10 bg-slate-200 rounded-xl animate-pulse"></div>
        </div>
        
        {/* Stats cards skeleton */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="h-4 bg-slate-200 rounded w-2/3 mb-3 animate-pulse"></div>
            <div className="h-8 bg-slate-200 rounded w-1/2 animate-pulse"></div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="h-4 bg-slate-200 rounded w-2/3 mb-3 animate-pulse"></div>
            <div className="h-8 bg-slate-200 rounded w-1/2 animate-pulse"></div>
          </div>
        </div>

        {/* Request form skeleton */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="h-4 bg-slate-200 rounded w-1/4 animate-pulse"></div>
          <div className="h-12 bg-slate-200 rounded-xl animate-pulse"></div>
          <div className="h-10 bg-slate-200 rounded-xl animate-pulse"></div>
        </div>

        {/* List items skeleton */}
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="h-4 bg-slate-200 rounded w-1/3 animate-pulse"></div>
                <div className="h-6 bg-slate-200 rounded-full w-16 animate-pulse"></div>
              </div>
              <div className="h-3 bg-slate-200 rounded w-2/3 animate-pulse"></div>
            </div>
          ))}
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
