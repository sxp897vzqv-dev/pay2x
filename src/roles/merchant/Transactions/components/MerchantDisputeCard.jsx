import React, { memo } from 'react';
import { CheckCircle, XCircle, Clock, RefreshCw, AlertCircle, Eye } from 'lucide-react';

const DisputeCard = memo(function DisputeCard({ dispute, onViewDetails, isNew }) {
  const statusColors = {
    pending: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', icon: Clock, label: 'Pending' },
    routed_to_trader: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: RefreshCw, label: 'Routed' },
    trader_accepted: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', icon: CheckCircle, label: 'Accepted' },
    trader_rejected: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: XCircle, label: 'Rejected' },
    admin_approved: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', icon: CheckCircle, label: 'Approved' },
    admin_rejected: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: XCircle, label: 'Denied' },
    resolved: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', icon: CheckCircle, label: 'Resolved' },
    open: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', icon: Clock, label: 'Open' },
    under_review: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: RefreshCw, label: 'Under Review' },
    lost: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: XCircle, label: 'Lost' },
  };

  const status = statusColors[dispute.status] || statusColors.pending;
  const StatusIcon = status.icon;

  // Determine stripe color
  const stripeColor = 
    dispute.status === 'admin_approved' || dispute.status === 'resolved' ? 'bg-green-500' :
    dispute.status === 'admin_rejected' || dispute.status === 'trader_rejected' || dispute.status === 'lost' ? 'bg-red-500' :
    dispute.status === 'trader_accepted' ? 'bg-emerald-500' :
    'bg-yellow-500';

  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden transition-all ${isNew ? 'ring-2 ring-orange-400 ring-offset-2' : ''}`}>
      <div className={`h-1 ${stripeColor}`} />
      <div className="p-3 space-y-3">
        
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 mb-0.5">Dispute ID</p>
            <p className="font-mono text-sm font-bold text-slate-900 truncate bg-slate-50 px-2 py-1 rounded-lg inline-block" style={{ fontFamily: 'var(--font-mono)' }}>
              {dispute.dispute_id || dispute.id?.slice(-8)}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${status.bg} ${status.border} ${status.text} flex items-center gap-1 border`}>
              <StatusIcon className={`w-3 h-3 ${dispute.status === 'under_review' || dispute.status === 'routed_to_trader' ? 'animate-spin' : ''}`} />
              {status.label}
            </span>
            <button onClick={() => onViewDetails(dispute)} className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg">
              <Eye className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Info */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
            <p className="text-xs font-bold text-slate-400 uppercase mb-1">Transaction</p>
            <p className="text-xs font-semibold text-slate-800 truncate" style={{ fontFamily: 'var(--font-mono)' }}>
              {dispute.transaction_id || dispute.utr || 'N/A'}
            </p>
          </div>
          <div className="bg-orange-50 rounded-lg p-2.5 border border-orange-200">
            <p className="text-xs font-bold text-slate-600 uppercase mb-1">Amount</p>
            <p className="text-base font-bold text-orange-700">₹{dispute.amount?.toLocaleString()}</p>
          </div>
        </div>

        {/* Type badge */}
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded-lg text-xs font-bold ${
            dispute.type === 'payin' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
          }`}>
            {dispute.type === 'payin' ? 'Payin Dispute' : 'Payout Dispute'}
          </span>
          {dispute.upi_id && (
            <span className="px-2 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 truncate max-w-[150px]">
              {dispute.upi_id}
            </span>
          )}
        </div>

        {/* Reason */}
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
          <p className="text-xs font-bold text-slate-600 mb-1">Reason</p>
          <p className="text-xs text-slate-700 line-clamp-2">{dispute.reason || 'No reason provided'}</p>
        </div>

        {/* Trader/Admin response */}
        {(dispute.trader_response || dispute.admin_notes) && (
          <div className={`rounded-lg p-3 border ${
            dispute.status === 'admin_approved' || dispute.status === 'trader_accepted' 
              ? 'bg-green-50 border-green-200' 
              : 'bg-red-50 border-red-200'
          }`}>
            <p className="text-xs font-bold text-slate-600 mb-1">Response</p>
            <p className="text-xs text-slate-700">{dispute.admin_notes || dispute.trader_response}</p>
          </div>
        )}

        {/* Deadline */}
        {dispute.deadline && (dispute.status === 'pending' || dispute.status === 'routed_to_trader' || dispute.status === 'open') && (
          <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 rounded-lg border border-orange-200 text-xs">
            <Clock className="w-3.5 h-3.5 text-orange-600" />
            <span className="font-semibold text-orange-900">
              Deadline: {new Date(dispute.deadline).toLocaleDateString('en-IN')}
            </span>
          </div>
        )}

        {/* Timestamp */}
        <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-100">
          <div className="flex items-center gap-1">
            <Clock size={11} />
            {dispute.created_at 
              ? new Date(dispute.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })
              : '—'
            }
          </div>
          <button onClick={() => onViewDetails(dispute)} className="text-orange-600 font-semibold hover:text-orange-700">
            View Details →
          </button>
        </div>
      </div>
    </div>
  );
});

export default DisputeCard;
