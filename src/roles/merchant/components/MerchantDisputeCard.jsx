import React from 'react';
import { CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react';

export default function DisputeCard({ dispute, onViewDetails }) {
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
