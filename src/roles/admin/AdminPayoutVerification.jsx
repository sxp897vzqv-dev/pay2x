import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import {
  CheckCircle, XCircle, Clock, FileText, Video, User, IndianRupee,
  AlertTriangle, Eye, RefreshCw, Filter, ChevronDown, ExternalLink
} from 'lucide-react';
import Toast from '../../components/admin/Toast';

const STATUS_COLORS = {
  pending_review: 'bg-amber-100 text-amber-800 border-amber-200',
  verified: 'bg-green-100 text-green-800 border-green-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
};

export default function AdminPayoutVerification() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending_review');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [processing, setProcessing] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [toast, setToast] = useState(null);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('payout_requests')
        .select(`
          *,
          traders:trader_id (id, name, email, phone)
        `)
        .order('verification_submitted_at', { ascending: false });

      if (filter !== 'all') {
        query = query.eq('verification_status', filter);
      } else {
        query = query.in('verification_status', ['pending_review', 'verified', 'rejected']);
      }

      const { data, error } = await query.limit(100);
      if (error) throw error;

      // Fetch payout counts for each request
      const requestsWithCounts = await Promise.all((data || []).map(async (req) => {
        const { count } = await supabase
          .from('payouts')
          .select('*', { count: 'exact', head: true })
          .eq('payout_request_id', req.id)
          .eq('status', 'completed');
        
        return { ...req, completedPayoutCount: count || 0 };
      }));

      setRequests(requestsWithCounts);
    } catch (e) {
      console.error('Fetch error:', e);
      setToast({ msg: 'Failed to load requests', success: false });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRequests();
  }, [filter]);

  const handleApprove = async (request) => {
    setProcessing(request.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.rpc('approve_batch_verification', {
        p_request_id: request.id,
        p_admin_id: user.id
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      setToast({ 
        msg: `✅ Verified! Trader earned ₹${data.commissionEarned?.toLocaleString() || 0} commission`, 
        success: true 
      });
      fetchRequests();
      setSelectedRequest(null);
    } catch (e) {
      setToast({ msg: '❌ ' + e.message, success: false });
    }
    setProcessing(null);
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      setToast({ msg: 'Please provide a rejection reason', success: false });
      return;
    }

    setProcessing(selectedRequest.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.rpc('reject_batch_verification', {
        p_request_id: selectedRequest.id,
        p_admin_id: user.id,
        p_reason: rejectReason.trim()
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      setToast({ msg: `Verification rejected (attempt ${data.rejectionCount})`, success: true });
      fetchRequests();
      setSelectedRequest(null);
      setShowRejectModal(false);
      setRejectReason('');
    } catch (e) {
      setToast({ msg: '❌ ' + e.message, success: false });
    }
    setProcessing(null);
  };

  const stats = {
    pending: requests.filter(r => r.verification_status === 'pending_review').length,
    verified: requests.filter(r => r.verification_status === 'verified').length,
    rejected: requests.filter(r => r.verification_status === 'rejected').length,
  };

  return (
    <div className="space-y-6">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Payout Verification</h1>
          <p className="text-slate-500 text-sm">Review batch verification submissions from traders</p>
        </div>
        <button
          onClick={fetchRequests}
          className="p-2 hover:bg-slate-100 rounded-lg"
        >
          <RefreshCw className={`w-5 h-5 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-semibold text-amber-700 uppercase">Pending</span>
          </div>
          <p className="text-2xl font-bold text-amber-800">{stats.pending}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <span className="text-xs font-semibold text-green-700 uppercase">Verified</span>
          </div>
          <p className="text-2xl font-bold text-green-800">{stats.verified}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <XCircle className="w-4 h-4 text-red-600" />
            <span className="text-xs font-semibold text-red-700 uppercase">Rejected</span>
          </div>
          <p className="text-2xl font-bold text-red-800">{stats.rejected}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {['pending_review', 'verified', 'rejected', 'all'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
              filter === f 
                ? 'bg-purple-600 text-white' 
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {f === 'pending_review' ? 'Pending' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Requests List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl border p-4 animate-pulse">
              <div className="h-4 bg-slate-200 rounded w-1/3 mb-3"></div>
              <div className="h-3 bg-slate-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200">
          <CheckCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No {filter === 'all' ? '' : filter.replace('_', ' ')} verifications</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(req => (
            <div
              key={req.id}
              className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setSelectedRequest(req)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <User className="w-4 h-4 text-slate-400" />
                    <span className="font-semibold text-slate-900">
                      {req.traders?.name || 'Unknown Trader'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${STATUS_COLORS[req.verification_status] || 'bg-slate-100'}`}>
                      {req.verification_status?.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-500">
                    <span className="flex items-center gap-1">
                      <IndianRupee className="w-3.5 h-3.5" />
                      ₹{(req.assigned_amount || 0).toLocaleString()}
                    </span>
                    <span>{req.completedPayoutCount} payouts</span>
                    {req.rejection_count > 0 && (
                      <span className="text-red-500 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {req.rejection_count} rejection(s)
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right text-xs text-slate-400">
                  {req.verification_submitted_at && (
                    <p>{new Date(req.verification_submitted_at).toLocaleString()}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedRequest(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Verification Details</h2>
                <p className="text-sm text-slate-500">{selectedRequest.traders?.name}</p>
              </div>
              <button onClick={() => setSelectedRequest(null)} className="p-2 hover:bg-slate-100 rounded-lg">
                <XCircle className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-6">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">Total Amount</p>
                  <p className="text-xl font-bold text-slate-900">₹{(selectedRequest.assigned_amount || 0).toLocaleString()}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">Payouts Completed</p>
                  <p className="text-xl font-bold text-slate-900">{selectedRequest.completedPayoutCount}</p>
                </div>
              </div>

              {/* Proofs */}
              <div className="space-y-4">
                <h3 className="font-semibold text-slate-900">Submitted Proofs</h3>
                
                {/* Statement */}
                <div className="border rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span className="font-semibold text-slate-700">Bank Statement</span>
                  </div>
                  {selectedRequest.statement_proof_url ? (
                    <a
                      href={selectedRequest.statement_proof_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-blue-600 hover:underline text-sm"
                    >
                      <ExternalLink className="w-4 h-4" />
                      View Statement
                    </a>
                  ) : (
                    <p className="text-sm text-slate-400">No statement uploaded</p>
                  )}
                </div>

                {/* Video */}
                <div className="border rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Video className="w-4 h-4 text-purple-600" />
                    <span className="font-semibold text-slate-700">Video Proof</span>
                  </div>
                  {selectedRequest.video_proof_url ? (
                    <div>
                      <video
                        src={selectedRequest.video_proof_url}
                        controls
                        className="w-full rounded-lg max-h-64"
                      />
                      <a
                        href={selectedRequest.video_proof_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-purple-600 hover:underline text-sm mt-2"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Open in new tab
                      </a>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">No video uploaded</p>
                  )}
                </div>
              </div>

              {/* Previous rejections */}
              {selectedRequest.rejection_count > 0 && selectedRequest.rejection_reason && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-red-700 mb-1">Previous Rejection Reason:</p>
                  <p className="text-sm text-red-800">{selectedRequest.rejection_reason}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            {selectedRequest.verification_status === 'pending_review' && (
              <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex gap-3">
                <button
                  onClick={() => setShowRejectModal(true)}
                  disabled={processing === selectedRequest.id}
                  className="flex-1 py-2.5 border border-red-300 text-red-600 rounded-xl font-semibold hover:bg-red-50 disabled:opacity-40"
                >
                  Reject
                </button>
                <button
                  onClick={() => handleApprove(selectedRequest)}
                  disabled={processing === selectedRequest.id}
                  className="flex-1 py-2.5 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {processing === selectedRequest.id ? 'Processing...' : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Approve & Credit Balance
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowRejectModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Reject Verification</h3>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Explain why the verification is being rejected..."
              rows={4}
              className="w-full px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
            />
            <p className="text-xs text-slate-400 mt-2">Trader will be notified and can resubmit.</p>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => { setShowRejectModal(false); setRejectReason(''); }}
                className="flex-1 py-2.5 border border-slate-300 rounded-xl font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectReason.trim() || processing}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 disabled:opacity-40"
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
