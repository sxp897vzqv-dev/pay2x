import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../supabase';
import { useRealtimeSubscription } from '../../../hooks/useRealtimeSubscription';
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
import VerificationUploadModal from './components/VerificationUploadModal';

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

  const [traderId, setTraderId] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setTraderId(user.id); });
  }, []);

  /* derived */
  const hasActiveRequest   = activeRequest !== null;
  const hasAssignedPayouts = assignedPayouts.length > 0;
  const canCreateRequest   = !hasActiveRequest && !hasAssignedPayouts;
  const canCancelRequest   = hasActiveRequest && !hasAssignedPayouts;

  // Map request row for display (snake_case → camelCase)
  const mapRequest = (r) => ({
    ...r,
    traderId: r.trader_id,
    requestedAmount: r.requested_amount || r.amount || 0,
    assignedAmount: r.assigned_amount || 0,
    remainingAmount: r.remaining_amount || 0,
    fullyAssigned: r.fully_assigned,
    inWaitingList: r.in_waiting_list,
    createdAt: r.created_at ? { seconds: new Date(r.created_at).getTime() / 1000 } : null,
  });

  // Map payout row for child components
  const mapPayout = (r) => ({
    ...r,
    traderId: r.trader_id, merchantId: r.merchant_id,
    utrId: r.utr, proofUrl: r.proof_url,
    payoutRequestId: r.payout_request_id,
    assignedAt: r.assigned_at ? { seconds: new Date(r.assigned_at).getTime() / 1000 } : null,
    completedAt: r.completed_at ? { seconds: new Date(r.completed_at).getTime() / 1000 } : null,
    createdAt: r.created_at ? { seconds: new Date(r.created_at).getTime() / 1000 } : null,
  });

  useEffect(() => {
    if (!traderId) return;

    const fetchAll = async () => {
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
          if (r.status !== 'completed' && r.status !== 'cancelled') {
            active = mapRequest(r);
          }
        });
        setActiveRequest(active);

        // Assigned payouts
        const { data: assigned } = await supabase.from('payouts').select('*').eq('trader_id', traderId).eq('status', 'assigned').limit(100);
        setAssignedPayouts((assigned || []).map(mapPayout).sort((a, b) => (a.assignedAt?.seconds || 0) - (b.assignedAt?.seconds || 0)));

        // Completed payouts
        const { data: completed } = await supabase.from('payouts').select('*').eq('trader_id', traderId).eq('status', 'completed').order('completed_at', { ascending: false }).limit(200);
        setCompletedPayouts((completed || []).map(mapPayout));
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    fetchAll();
  }, [traderId]);

  // Realtime: refresh when payouts change
  useRealtimeSubscription('payouts', {
    onChange: async () => {
      if (!traderId) return;
      const { data: assigned } = await supabase.from('payouts').select('*').eq('trader_id', traderId).eq('status', 'assigned').limit(100);
      setAssignedPayouts((assigned || []).map(mapPayout).sort((a, b) => (a.assignedAt?.seconds || 0) - (b.assignedAt?.seconds || 0)));
      const { data: completed } = await supabase.from('payouts').select('*').eq('trader_id', traderId).eq('status', 'completed').order('completed_at', { ascending: false }).limit(200);
      setCompletedPayouts((completed || []).map(mapPayout));
    },
    filter: traderId ? `trader_id=eq.${traderId}` : undefined,
  });

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
    try {
      await cancelPayoutRequestByTrader(activeRequest.id);
      setActiveRequest(null); // Clear immediately
      setToast({ msg: '✅ Request cancelled', success: true });
    } catch (e) { setToast({ msg: '❌ ' + e.message, success: false }); }
  };

  // Handle verification proof submission (new flow with admin approval)
  const handleVerificationSubmit = async (result) => {
    if (result?.success) {
      const hasFlags = result.flags && result.flags.length > 0;
      setToast({ 
        msg: hasFlags 
          ? '📤 Proof submitted for verification (flagged for review)' 
          : '📤 Proof submitted! Awaiting admin verification', 
        success: true 
      });
      setSelectedPayout(null);
      
      // Refresh assigned payouts to show updated status
      const { data: assigned } = await supabase
        .from('payouts')
        .select('*')
        .eq('trader_id', traderId)
        .in('status', ['assigned'])
        .limit(100);
      setAssignedPayouts((assigned || []).map(mapPayout).sort((a, b) => (a.assignedAt?.seconds || 0) - (b.assignedAt?.seconds || 0)));
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

      {/* Verification Upload Modal (new flow with admin approval) */}
      {selectedPayout && (
        <VerificationUploadModal
          payout={selectedPayout}
          onClose={() => setSelectedPayout(null)}
          onSubmit={handleVerificationSubmit}
        />
      )}
    </div>
  );
}
