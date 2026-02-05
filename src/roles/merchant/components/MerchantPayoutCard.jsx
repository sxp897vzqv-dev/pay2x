import React from 'react';
import {
  CheckCircle, XCircle, Clock, AlertCircle, Building, CreditCard, User, Hash,
  RefreshCw, Ban,
} from 'lucide-react';

export default function PayoutCard({ payout, onCancel }) {
  const statusColors = {
    queued: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: Clock },
    processing: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', icon: RefreshCw },
    completed: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', icon: CheckCircle },
    failed: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: XCircle },
  };

  const status = statusColors[payout.status] || statusColors.queued;
  const StatusIcon = status.icon;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className={`h-1 ${payout.status === 'completed' ? 'bg-green-500' : payout.status === 'failed' ? 'bg-red-500' : 'bg-blue-500'}`} />
      <div className="p-3 space-y-3">

        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 mb-0.5">Payout ID</p>
            <p className="font-mono text-sm font-bold text-slate-900 truncate bg-slate-50 px-2 py-1 rounded-lg inline-block" style={{ fontFamily: 'var(--font-mono)' }}>
              {payout.payoutId || payout.id.slice(-8)}
            </p>
          </div>
          <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${status.bg} ${status.border} ${status.text} flex items-center gap-1 border flex-shrink-0`}>
            <StatusIcon className={`w-3 h-3 ${payout.status === 'processing' ? 'animate-spin' : ''}`} />
            {payout.status?.toUpperCase()}
          </span>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
            <div className="flex items-center gap-1 mb-1">
              <User className="w-3 h-3 text-purple-600" />
              <p className="text-xs font-bold text-slate-400 uppercase">Beneficiary</p>
            </div>
            <p className="text-xs font-bold text-slate-800 truncate">{payout.beneficiaryName || 'N/A'}</p>
          </div>

          <div className="bg-blue-50 rounded-lg p-2.5 border border-blue-200">
            <div className="flex items-center gap-1 mb-1">
              <CreditCard className="w-3 h-3 text-blue-600" />
              <p className="text-xs font-bold text-slate-600 uppercase">Amount</p>
            </div>
            <p className="text-base font-bold text-blue-700">₹{payout.amount?.toLocaleString()}</p>
          </div>

          {payout.paymentMode === 'upi' ? (
            <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100 col-span-2">
              <div className="flex items-center gap-1 mb-1">
                <CreditCard className="w-3 h-3 text-green-600" />
                <p className="text-xs font-bold text-slate-400 uppercase">UPI ID</p>
              </div>
              <p className="text-xs font-semibold text-slate-800" style={{ fontFamily: 'var(--font-mono)' }}>
                {payout.upiId || 'N/A'}
              </p>
            </div>
          ) : (
            <>
              <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                <div className="flex items-center gap-1 mb-1">
                  <Building className="w-3 h-3 text-indigo-600" />
                  <p className="text-xs font-bold text-slate-400 uppercase">Account</p>
                </div>
                <p className="text-xs font-bold text-slate-800 truncate" style={{ fontFamily: 'var(--font-mono)' }}>
                  ***{payout.accountNumber?.slice(-4) || 'N/A'}
                </p>
              </div>
              <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                <div className="flex items-center gap-1 mb-1">
                  <Hash className="w-3 h-3 text-teal-600" />
                  <p className="text-xs font-bold text-slate-400 uppercase">IFSC</p>
                </div>
                <p className="text-xs font-semibold text-slate-800" style={{ fontFamily: 'var(--font-mono)' }}>
                  {payout.ifscCode || 'N/A'}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Trader info (if processing/completed) */}
        {payout.traderId && (
          <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 rounded-lg border border-purple-200 text-xs">
            <User className="w-3.5 h-3.5 text-purple-600" />
            <span className="font-semibold text-purple-900">
              Assigned to: {payout.traderName || payout.traderId.slice(0, 8)}
            </span>
          </div>
        )}

        {/* UTR (if completed) */}
        {payout.utrId && (
          <div className="flex items-center justify-between px-3 py-2 bg-green-50 rounded-lg border border-green-200 text-xs">
            <span className="font-semibold text-green-900">UTR: {payout.utrId}</span>
            {payout.proofUrl && (
              <a href={payout.proofUrl} target="_blank" rel="noopener noreferrer" className="text-green-600 underline flex items-center gap-1">
                View Proof
              </a>
            )}
          </div>
        )}

        {/* Failure reason */}
        {payout.status === 'failed' && payout.failureReason && (
          <div className="flex items-start gap-2 px-3 py-2 bg-red-50 rounded-lg border border-red-200 text-xs">
            <AlertCircle className="w-3.5 h-3.5 text-red-600 flex-shrink-0 mt-0.5" />
            <span className="text-red-800">{payout.failureReason}</span>
          </div>
        )}

        {/* Timestamp */}
        <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-100">
          <div className="flex items-center gap-1">
            <Clock size={11} />
            {new Date((payout.createdAt?.seconds || 0) * 1000).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
          </div>
          {payout.purpose && (
            <span className="text-slate-600 capitalize">{payout.purpose}</span>
          )}
        </div>

        {/* Cancel button for queued payouts */}
        {payout.status === 'queued' && (
          <button
            onClick={() => onCancel(payout.id)}
            className="w-full py-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-semibold hover:bg-red-100 flex items-center justify-center gap-1"
          >
            <Ban className="w-3.5 h-3.5" />
            Cancel Payout
          </button>
        )}
      </div>
    </div>
  );
}
