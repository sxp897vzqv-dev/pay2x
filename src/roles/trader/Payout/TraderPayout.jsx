import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../supabase';
import { useRealtimeSubscription } from '../../../hooks/useRealtimeSubscription';
import {
  IndianRupee, CreditCard, TrendingDown, FileText, Upload, CheckCircle2, AlertCircle,
} from 'lucide-react';
import {
  immediateAutoAssignPayouts,
  cancelPayoutByTrader,
  cancelPayoutRequestByTrader
} from '../../../utils/Payoutassignmenthelper';
import Toast from '../../../components/admin/Toast';
import { StickyTabs, StatusBadge, RelativeTime, SkeletonCard } from '../../../components/trader';
import { formatINR } from '../../../utils/format';
import ActiveRequestBanner from './components/ActiveRequestBanner';
import RequestTab from './components/RequestTab';
import AssignedTab from './components/AssignedTab';
import HistoryTab from './components/HistoryTab';
import CompletePayoutModal from './components/CompletePayoutModal';
import BatchVerificationModal from './components/BatchVerificationModal';

/* ─── Tabs config ─── */
const TABS = [
  { key: 'request',  label: 'Request',  icon: IndianRupee },
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
  const [completedPayouts,  setCompletedPayouts]  = useState([]); // Completed + verified
  const [pendingVerification, setPendingVerification] = useState([]); // Completed but not yet verified
  const [selectedPayout,    setSelectedPayout]    = useState(null); // For CompletePayoutModal
  const [showBatchVerification, setShowBatchVerification] = useState(false);
  const [processingPayout,  setProcessingPayout]  = useState(null);
  const [toast,             setToast]             = useState(null);

  const [traderId, setTraderId] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setTraderId(user.id); });
  }, []);

  /* derived */
  const hasActiveRequest   = activeRequest !== null;
  const hasAssignedPayouts = assignedPayouts.length > 0;
  const hasPendingVerification = pendingVerification.length > 0;
  const canCreateRequest   = !hasActiveRequest && !hasAssignedPayouts && !hasPendingVerification;
  const canCancelRequest   = hasActiveRequest && !hasAssignedPayouts && !hasPendingVerification;
  
  // Show verification button when: has active request + no more assigned + has completed pending verification
  const hasRejectedPayouts = pendingVerification.some(p => p.verificationStatus === 'rejected') || 
    activeRequest?.verificationStatus === 'rejected';
  const canSubmitVerification = hasActiveRequest && !hasAssignedPayouts && hasPendingVerification && 
    (activeRequest.status !== 'pending_verification' || hasRejectedPayouts) && activeRequest.status !== 'verified';

  // Map request row for display (snake_case → camelCase)
  const mapRequest = (r) => ({
    ...r,
    traderId: r.trader_id,
    requestedAmount: r.requested_amount || r.amount || 0,
    assignedAmount: r.assigned_amount || 0,
    remainingAmount: r.remaining_amount || 0,
    fullyAssigned: r.fully_assigned,
    inWaitingList: r.in_waiting_list,
    verificationStatus: r.verification_status,
    rejectionReason: r.rejection_reason,
    rejectionCount: r.rejection_count,
    createdAt: r.created_at ? { seconds: new Date(r.created_at).getTime() / 1000 } : null,
  });

  // Map payout row for child components (snake_case → camelCase)
  // Handle multiple column variants from different creation methods
  const mapPayout = (r) => ({
    ...r,
    traderId: r.trader_id,
    merchantId: r.merchant_id,
    utrId: r.utr,
    proofUrl: r.proof_url,
    payoutRequestId: r.payout_request_id,
    // Bank details (handle ALL column variants)
    accountNumber: r.account_number,
    ifscCode: r.ifsc_code || r.ifsc,
    accountHolderName: r.beneficiary_name || r.account_name || r.account_holder_name,
    paymentMethod: r.payment_mode || r.payment_method || 'bank',
    upiId: r.upi_id,
    userId: r.user_id,
    verificationStatus: r.verification_status,
    // Timestamps
    assignedAt: r.assigned_at ? { seconds: new Date(r.assigned_at).getTime() / 1000 } : null,
    completedAt: r.completed_at ? { seconds: new Date(r.completed_at).getTime() / 1000 } : null,
    createdAt: r.created_at ? { seconds: new Date(r.created_at).getTime() / 1000 } : null,
  });

  const fetchAll = useCallback(async () => {
    if (!traderId) return;
    
    try {
      // Trader data
      const { data: td } = await supabase.from('traders').select('balance, security_hold, payout_commission').eq('id', traderId).single();
      if (td) {
        setWorkingBalance((Number(td.balance) || 0) - (Number(td.security_hold) || 0));
        setPayoutCommission(td.payout_commission || 1);
      }

      // Payout requests
      const { data: requests } = await supabase.from('payout_requests').select('*').eq('trader_id', traderId);
      let active = null;
      (requests || []).forEach(r => {
        if (r.status !== 'completed' && r.status !== 'cancelled' && r.status !== 'verified') {
          active = mapRequest(r);
        }
      });
      setActiveRequest(active);

      // Assigned payouts (status = 'assigned')
      const { data: assigned } = await supabase
        .from('payouts')
        .select('*')
        .eq('trader_id', traderId)
        .eq('status', 'assigned')
        .limit(100);
      setAssignedPayouts((assigned || []).map(mapPayout).sort((a, b) => (a.assignedAt?.seconds || 0) - (b.assignedAt?.seconds || 0)));

      // Completed payouts pending verification (including rejected - needs re-upload)
      const { data: pendingVer } = await supabase
        .from('payouts')
        .select('*')
        .eq('trader_id', traderId)
        .eq('status', 'completed')
        .or('verification_status.is.null,verification_status.eq.pending,verification_status.eq.pending_review,verification_status.eq.rejected,verification_status.eq.pending_proof')
        .limit(100);
      setPendingVerification((pendingVer || []).map(mapPayout));

      // Fully completed payouts (verified)
      const { data: completed } = await supabase
        .from('payouts')
        .select('*')
        .eq('trader_id', traderId)
        .eq('status', 'completed')
        .eq('verification_status', 'verified')
        .order('completed_at', { ascending: false })
        .limit(200);
      setCompletedPayouts((completed || []).map(mapPayout));
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [traderId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Realtime: refresh when payouts change
  useRealtimeSubscription('payouts', {
    onChange: fetchAll,
    filter: traderId ? `trader_id=eq.${traderId}` : undefined,
    enabled: !!traderId, // Only subscribe once we have traderId
  });

  /* ── handlers ── */
  const handleSubmitRequest = async () => {
    const amount = Number(requestAmount);
    if (!amount || amount <= 0) { setToast({ msg: 'Please enter a valid amount', success: false }); return; }
    if (amount > 100000)        { setToast({ msg: 'Maximum request is ₹1,00,000', success: false }); return; }
    if (amount > workingBalance){ setToast({ msg: `Insufficient balance. Available: ₹${workingBalance.toLocaleString()}`, success: false }); return; }
    if (!canCreateRequest) {
      if (hasPendingVerification) {
        setToast({ msg: 'Submit verification for your completed payouts first', success: false });
      } else if (hasActiveRequest) {
        setToast({ msg: 'You already have an active request', success: false });
      } else {
        setToast({ msg: `Complete ${assignedPayouts.length} assigned payout(s) first`, success: false });
      }
      return;
    }
    setSubmitting(true);
    try {
      const result = await immediateAutoAssignPayouts(traderId, amount);
      setToast({ msg: result.message, success: true });
      setRequestAmount('');
      
      // Immediately set the active request state
      setActiveRequest({
        id: result.requestId,
        status: result.status,
        traderId: traderId,
        requestedAmount: amount,
        assignedAmount: result.assignedAmount || 0,
        remainingAmount: result.remainingAmount || 0,
        fullyAssigned: result.fullyAssigned,
        inWaitingList: result.inWaitingList,
        createdAt: { seconds: Date.now() / 1000 },
      });
      
      // Refresh assigned payouts
      if (result.assignedCount > 0) {
        const { data: assigned } = await supabase.from('payouts').select('*').eq('trader_id', traderId).eq('status', 'assigned').limit(100);
        setAssignedPayouts((assigned || []).map(mapPayout).sort((a, b) => (a.assignedAt?.seconds || 0) - (b.assignedAt?.seconds || 0)));
        setActiveTab('assigned');
      }
    } catch (e) {
      setToast({ msg: '❌ ' + e.message, success: false });
    }
    setSubmitting(false);
  };

  const handleCancelRequest = async () => {
    if (!activeRequest) return;
    if (hasAssignedPayouts) { setToast({ msg: `Complete ${assignedPayouts.length} assigned payout(s) first`, success: false }); return; }
    if (hasPendingVerification) { setToast({ msg: 'Submit verification for completed payouts first', success: false }); return; }
    try {
      await cancelPayoutRequestByTrader(activeRequest.id);
      setActiveRequest(null);
      setToast({ msg: '✅ Request cancelled', success: true });
    } catch (e) { setToast({ msg: '❌ ' + e.message, success: false }); }
  };

  // Handle marking a single payout as complete (just UTR, no proof yet)
  const handleCompletePayout = async (payout, utr) => {
    try {
      const { error } = await supabase
        .from('payouts')
        .update({
          status: 'completed',
          utr: utr,
          completed_at: new Date().toISOString(),
          verification_status: 'pending', // Awaiting batch verification
        })
        .eq('id', payout.id);

      if (error) throw error;

      setToast({ msg: '✅ Payout marked complete', success: true });
      setSelectedPayout(null);
      
      // Refresh lists
      await fetchAll();
    } catch (e) {
      setToast({ msg: '❌ ' + e.message, success: false });
    }
  };

  // Handle batch verification submission
  const handleBatchVerificationSubmit = async (result) => {
    if (result?.success) {
      setToast({ 
        msg: `✅ Verification submitted for ${result.payoutCount} payouts (₹${result.totalAmount.toLocaleString()})`, 
        success: true 
      });
      setShowBatchVerification(false);
      await fetchAll();
    } else {
      setToast({ msg: '❌ ' + (result?.error || 'Submission failed'), success: false });
    }
  };

  const handleCancelPayout = async (payout, reason) => {
    if (!reason || reason.trim().length < 10) { setToast({ msg: 'Reason must be at least 10 characters', success: false }); return; }
    setProcessingPayout(payout.id);
    try {
      await cancelPayoutByTrader(payout.id, reason);
      setToast({ msg: '✅ Payout cancelled, returned to pool', success: true });
      await fetchAll();
    } catch (e) { setToast({ msg: '❌ ' + e.message, success: false }); }
    setProcessingPayout(null);
  };

  /* ── loading ── */
  if (loading) {
    return (
      <div className="space-y-4 max-w-3xl mx-auto">
        <div className="flex gap-2">
          <div className="flex-1 h-10 bg-slate-200 rounded-xl animate-pulse"></div>
          <div className="flex-1 h-10 bg-slate-200 rounded-xl animate-pulse"></div>
          <div className="flex-1 h-10 bg-slate-200 rounded-xl animate-pulse"></div>
        </div>
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
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="h-4 bg-slate-200 rounded w-1/4 animate-pulse"></div>
          <div className="h-12 bg-slate-200 rounded-xl animate-pulse"></div>
          <div className="h-10 bg-slate-200 rounded-xl animate-pulse"></div>
        </div>
      </div>
    );
  }

  const totalAssigned   = assignedPayouts.reduce((s, p) => s + (p.amount || 0), 0);
  const totalPendingVer = pendingVerification.reduce((s, p) => s + (p.amount || 0), 0);
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

      {/* Verification needed banner */}
      {canSubmitVerification && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-purple-500 rounded-xl flex items-center justify-center flex-shrink-0">
              <Upload className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-purple-900">Verification Required</h3>
              <p className="text-sm text-purple-700 mt-0.5">
                You've completed {pendingVerification.length} payouts (₹{totalPendingVer.toLocaleString()}). 
                Submit video + statement proof to credit your balance.
              </p>
              <button
                onClick={() => setShowBatchVerification(true)}
                className="mt-3 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-bold hover:bg-purple-700 active:scale-[0.97] flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Submit Verification
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rejected verification - needs re-upload */}
      {(pendingVerification.some(p => p.verificationStatus === 'rejected') || activeRequest?.verificationStatus === 'rejected') && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-red-500 rounded-xl flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-red-900">⚠️ Verification Rejected</h3>
              <p className="text-sm text-red-700 mt-0.5">
                Your verification was rejected. Please re-upload proof.
              </p>
              {(activeRequest?.rejection_reason || activeRequest?.rejectionReason) && (
                <p className="text-sm text-red-600 mt-2 bg-red-100 px-3 py-2 rounded-lg">
                  <strong>Reason:</strong> {activeRequest.rejection_reason || activeRequest.rejectionReason}
                </p>
              )}
              <button
                onClick={() => setShowBatchVerification(true)}
                className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 active:scale-[0.97] flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Re-upload Verification
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending verification info (when verification already submitted) */}
      {activeRequest?.status === 'pending_verification' && !pendingVerification.some(p => p.verificationStatus === 'rejected') && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-amber-900">Verification Pending Review</h3>
            <p className="text-sm text-amber-700 mt-0.5">
              Your verification has been submitted. Admin will review and credit your balance soon.
            </p>
          </div>
        </div>
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
          pendingVerificationCount={pendingVerification.length}
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

      {/* Complete Payout Modal (just UTR input) */}
      {selectedPayout && (
        <CompletePayoutModal
          payout={selectedPayout}
          onClose={() => setSelectedPayout(null)}
          onComplete={handleCompletePayout}
        />
      )}

      {/* Batch Verification Modal */}
      {showBatchVerification && activeRequest && (
        <BatchVerificationModal
          request={activeRequest}
          completedPayouts={pendingVerification}
          onClose={() => setShowBatchVerification(false)}
          onSubmit={handleBatchVerificationSubmit}
        />
      )}
    </div>
  );
}
