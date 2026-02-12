import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';
import {
  Shield, CheckCircle, XCircle, AlertTriangle, Clock, Eye, RefreshCw,
  User, CreditCard, FileText, Video, ExternalLink, Flag, ChevronDown,
  ChevronUp, X, Play, Image as ImageIcon, Download, AlertCircle,
} from 'lucide-react';
import Toast from '../../components/admin/Toast';

/* ─── Priority colors ─── */
const PRIORITY_STYLES = {
  critical: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300', label: '🔴 Critical (>4hr)' },
  high: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300', label: '🟠 High (>1hr)' },
  medium: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300', label: '🟡 Medium (>30m)' },
  normal: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300', label: '🟢 Normal' },
};

/* ─── Main Component ─── */
export default function AdminPayoutVerification() {
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPayout, setSelectedPayout] = useState(null);
  const [toast, setToast] = useState(null);
  const [filter, setFilter] = useState('all'); // all, escalated, flagged
  const [stats, setStats] = useState({ pending: 0, escalated: 0, flagged: 0, todayApproved: 0 });

  // Fetch pending verifications
  const fetchPayouts = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    
    try {
      const { data, error } = await supabase
        .from('v_pending_payout_verifications')
        .select('*')
        .order('proof_submitted_at', { ascending: true });
      
      if (error) throw error;
      setPayouts(data || []);
      
      // Calculate stats
      const pending = data?.length || 0;
      const escalated = data?.filter(p => p.verification_status === 'escalated').length || 0;
      const flagged = data?.filter(p => p.has_flags).length || 0;
      
      // Get today's approved count
      const today = new Date().toISOString().split('T')[0];
      const { count: todayApproved } = await supabase
        .from('payouts')
        .select('*', { count: 'exact', head: true })
        .eq('verification_status', 'approved')
        .gte('verified_at', today);
      
      setStats({ pending, escalated, flagged, todayApproved: todayApproved || 0 });
    } catch (e) {
      console.error('Error fetching verifications:', e);
      setToast({ msg: '❌ Failed to load verifications', success: false });
    }
    
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { fetchPayouts(); }, [fetchPayouts]);

  // Realtime updates
  useRealtimeSubscription('payouts', {
    onChange: () => fetchPayouts(true),
    filter: `verification_status=in.(pending_verification,escalated)`,
  });

  // Filter payouts
  const filteredPayouts = payouts.filter(p => {
    if (filter === 'escalated') return p.verification_status === 'escalated';
    if (filter === 'flagged') return p.has_flags;
    return true;
  });

  // Approve payout
  const handleApprove = async (payoutId, notes = null) => {
    try {
      const { data, error } = await supabase.rpc('approve_payout_verification', {
        p_payout_id: payoutId,
        p_notes: notes,
      });
      
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Approval failed');
      
      setToast({ 
        msg: `✅ Approved! ₹${data.commission_credited?.toLocaleString()} credited to trader`, 
        success: true 
      });
      setSelectedPayout(null);
      fetchPayouts(true);
    } catch (e) {
      setToast({ msg: '❌ ' + e.message, success: false });
    }
  };

  // Reject payout
  const handleReject = async (payoutId, reason) => {
    if (!reason?.trim()) {
      setToast({ msg: '❌ Rejection reason is required', success: false });
      return;
    }
    
    try {
      const { data, error } = await supabase.rpc('reject_payout_verification', {
        p_payout_id: payoutId,
        p_reason: reason,
      });
      
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Rejection failed');
      
      setToast({ msg: data.message, success: true });
      setSelectedPayout(null);
      fetchPayouts(true);
    } catch (e) {
      setToast({ msg: '❌ ' + e.message, success: false });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm font-medium">Loading verifications…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-sm">
              <Shield className="w-5 h-5 text-white" />
            </div>
            Payout Verification
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 ml-11">Review and approve trader payout proofs</p>
        </div>
        <button
          onClick={() => fetchPayouts(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-200 text-sm font-semibold disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard 
          label="Pending Review" 
          value={stats.pending} 
          icon={Clock} 
          color="blue" 
        />
        <StatCard 
          label="Escalated" 
          value={stats.escalated} 
          icon={AlertTriangle} 
          color="red" 
        />
        <StatCard 
          label="Flagged" 
          value={stats.flagged} 
          icon={Flag} 
          color="orange" 
        />
        <StatCard 
          label="Approved Today" 
          value={stats.todayApproved} 
          icon={CheckCircle} 
          color="green" 
        />
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { key: 'all', label: 'All Pending', count: stats.pending },
          { key: 'escalated', label: 'Escalated', count: stats.escalated },
          { key: 'flagged', label: 'Flagged', count: stats.flagged },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
              filter === f.key
                ? 'bg-blue-100 text-blue-700 shadow-sm'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            {f.label}
            <span className={`px-1.5 py-0.5 rounded-full text-xs ${
              filter === f.key ? 'bg-blue-200' : 'bg-slate-200'
            }`}>
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {/* Queue */}
      {filteredPayouts.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
          <p className="text-slate-600 font-semibold">All caught up!</p>
          <p className="text-sm text-slate-400 mt-1">No payouts pending verification</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredPayouts.map(payout => (
            <PayoutCard
              key={payout.id}
              payout={payout}
              onReview={() => setSelectedPayout(payout)}
            />
          ))}
        </div>
      )}

      {/* Review Modal */}
      {selectedPayout && (
        <ReviewModal
          payout={selectedPayout}
          onClose={() => setSelectedPayout(null)}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      )}
    </div>
  );
}

/* ─── Stat Card ─── */
function StatCard({ label, value, icon: Icon, color }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600 border-blue-200',
    red: 'bg-red-50 text-red-600 border-red-200',
    orange: 'bg-orange-50 text-orange-600 border-orange-200',
    green: 'bg-green-50 text-green-600 border-green-200',
  };

  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4" />
        <span className="text-xs font-semibold uppercase tracking-wide opacity-75">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

/* ─── Payout Card ─── */
function PayoutCard({ payout, onReview }) {
  const priority = PRIORITY_STYLES[payout.priority] || PRIORITY_STYLES.normal;
  const isEscalated = payout.verification_status === 'escalated';

  return (
    <div className={`bg-white rounded-xl border ${isEscalated ? 'border-red-300 ring-2 ring-red-100' : 'border-slate-200'} overflow-hidden`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Header row */}
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${priority.bg} ${priority.text}`}>
                {priority.label}
              </span>
              {isEscalated && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                  ⚠️ ESCALATED (3 rejections)
                </span>
              )}
              {payout.has_flags && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                  <Flag className="w-3 h-3 inline mr-1" />
                  Flagged
                </span>
              )}
              {payout.rejection_count > 0 && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {payout.rejection_count}x rejected
                </span>
              )}
            </div>

            {/* Amount and trader */}
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-xl font-bold text-slate-900">₹{payout.amount?.toLocaleString()}</span>
              <span className="text-sm text-slate-500">• {payout.trader_name}</span>
            </div>

            {/* Beneficiary */}
            <p className="text-sm text-slate-600">
              <span className="font-medium">{payout.beneficiary_name}</span>
              <span className="text-slate-400"> • {payout.beneficiary_bank}</span>
              <span className="text-slate-400"> • ****{payout.beneficiary_account?.slice(-4)}</span>
            </p>

            {/* Time in queue */}
            <p className="text-xs text-slate-400 mt-2">
              Submitted {Math.round(payout.minutes_in_queue || 0)} min ago
            </p>
          </div>

          {/* Review button */}
          <button
            onClick={onReview}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 active:scale-95 transition-transform"
          >
            <Eye className="w-4 h-4" />
            Review
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Review Modal ─── */
function ReviewModal({ payout, onClose, onApprove, onReject }) {
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [videoFullscreen, setVideoFullscreen] = useState(false);

  const handleApprove = async () => {
    setProcessing(true);
    await onApprove(payout.id);
    setProcessing(false);
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) return;
    setProcessing(true);
    await onReject(payout.id, rejectionReason);
    setProcessing(false);
  };

  const priority = PRIORITY_STYLES[payout.priority] || PRIORITY_STYLES.normal;
  const isEscalated = payout.verification_status === 'escalated';
  const flags = payout.verification_flags || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${isEscalated ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              Review Payout
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${priority.bg} ${priority.text}`}>
                {priority.label}
              </span>
            </h2>
            <p className="text-sm text-slate-500">₹{payout.amount?.toLocaleString()} • {payout.trader_name}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/50 rounded-lg">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Flags warning */}
          {flags.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <div className="flex items-center gap-2 text-orange-700 font-semibold mb-2">
                <AlertTriangle className="w-5 h-5" />
                Verification Flags
              </div>
              <ul className="text-sm text-orange-600 space-y-1">
                {flags.includes('completed_too_fast') && (
                  <li>⚡ Completed unusually fast (under 30 seconds after assignment)</li>
                )}
                {flags.map((flag, i) => 
                  flag !== 'completed_too_fast' && <li key={i}>• {flag}</li>
                )}
              </ul>
            </div>
          )}

          {/* Rejection history */}
          {payout.rejection_count > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center gap-2 text-red-700 font-semibold mb-2">
                <XCircle className="w-5 h-5" />
                Previous Rejection ({payout.rejection_count}x)
              </div>
              <p className="text-sm text-red-600">{payout.last_rejection_reason}</p>
            </div>
          )}

          {/* Payout details */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-xl p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Payout Details</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Amount</span>
                  <span className="font-bold text-slate-900">₹{payout.amount?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Merchant</span>
                  <span className="font-medium text-slate-700">{payout.merchant_name || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Trader</span>
                  <span className="font-medium text-slate-700">{payout.trader_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Trader Phone</span>
                  <span className="font-mono text-slate-700">{payout.trader_phone}</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Beneficiary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Name</span>
                  <span className="font-medium text-slate-700">{payout.beneficiary_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Account</span>
                  <span className="font-mono text-slate-700">{payout.beneficiary_account}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">IFSC</span>
                  <span className="font-mono text-slate-700">{payout.beneficiary_ifsc}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Bank</span>
                  <span className="font-medium text-slate-700">{payout.beneficiary_bank}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Proofs */}
          <div className="grid grid-cols-2 gap-4">
            {/* Statement */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wide flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Statement Proof
                </h3>
              </div>
              <div className="p-4">
                {payout.statement_proof_url ? (
                  <div className="space-y-2">
                    {payout.statement_proof_url.endsWith('.pdf') ? (
                      <div className="flex items-center gap-3 p-4 bg-slate-100 rounded-lg">
                        <FileText className="w-10 h-10 text-red-500" />
                        <span className="text-sm font-medium text-slate-700">PDF Document</span>
                      </div>
                    ) : (
                      <img 
                        src={payout.statement_proof_url} 
                        alt="Statement" 
                        className="w-full rounded-lg border border-slate-200 cursor-pointer hover:opacity-90"
                        onClick={() => window.open(payout.statement_proof_url, '_blank')}
                      />
                    )}
                    <a
                      href={payout.statement_proof_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open in new tab
                    </a>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 text-center py-6">No statement uploaded</p>
                )}
              </div>
            </div>

            {/* Video */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wide flex items-center gap-2">
                  <Video className="w-4 h-4" />
                  Video Proof
                </h3>
              </div>
              <div className="p-4">
                {payout.video_proof_url ? (
                  <div className="space-y-2">
                    <video 
                      src={payout.video_proof_url} 
                      controls 
                      className="w-full rounded-lg bg-black"
                    />
                    <a
                      href={payout.video_proof_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open in new tab
                    </a>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 text-center py-6">No video uploaded</p>
                )}
              </div>
            </div>
          </div>

          {/* Rejection form */}
          {showRejectForm && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <h3 className="text-sm font-bold text-red-700 mb-2">Rejection Reason *</h3>
              <textarea
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                placeholder="Explain why this proof is being rejected..."
                className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                rows={3}
              />
              <p className="text-xs text-red-500 mt-2">
                {payout.rejection_count >= 2 
                  ? '⚠️ This will be the 3rd rejection - payout will be ESCALATED to admin'
                  : 'Trader will be notified and must upload new proof'}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-between gap-3">
          <button
            onClick={onClose}
            disabled={processing}
            className="px-4 py-2.5 border border-slate-300 text-slate-600 rounded-xl text-sm font-semibold hover:bg-white disabled:opacity-50"
          >
            Cancel
          </button>

          <div className="flex gap-2">
            {showRejectForm ? (
              <>
                <button
                  onClick={() => setShowRejectForm(false)}
                  disabled={processing}
                  className="px-4 py-2.5 border border-slate-300 text-slate-600 rounded-xl text-sm font-semibold hover:bg-white disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  onClick={handleReject}
                  disabled={processing || !rejectionReason.trim()}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 disabled:opacity-50"
                >
                  {processing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                  Confirm Rejection
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setShowRejectForm(true)}
                  disabled={processing}
                  className="flex items-center gap-1.5 px-4 py-2.5 border border-red-300 text-red-600 rounded-xl text-sm font-semibold hover:bg-red-50 disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" />
                  Reject
                </button>
                <button
                  onClick={handleApprove}
                  disabled={processing}
                  className="flex items-center gap-1.5 px-6 py-2.5 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 disabled:opacity-50"
                >
                  {processing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  Approve & Credit
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
