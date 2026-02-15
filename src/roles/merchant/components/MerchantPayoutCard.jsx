import React from 'react';
import {
  CheckCircle, XCircle, Clock, AlertCircle, Building, CreditCard, User, Hash,
  RefreshCw, Ban, Eye,
} from 'lucide-react';

export default function PayoutCard({ payout, onCancel, isNew }) {
  // Handle column name variations (DB has both old and new names)
  const beneficiaryName = payout.beneficiary_name || payout.account_name || 'N/A';
  const ifscCode = payout.ifsc_code || payout.ifsc || 'N/A';
  const paymentMode = payout.payment_mode || (payout.upi_id ? 'upi' : 'bank');
  
  const statusColors = {
    pending: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', icon: Clock },
    assigned: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: User },
    processing: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: RefreshCw },
    completed: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', icon: CheckCircle },
    failed: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: XCircle },
    cancelled: { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', icon: Ban },
    rejected: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: XCircle },
  };

  const status = statusColors[payout.status] || statusColors.pending;
  const StatusIcon = status.icon;

  // Determine stripe color
  const stripeColor = 
    payout.status === 'completed' ? 'bg-green-500' :
    payout.status === 'failed' ? 'bg-red-500' :
    payout.status === 'processing' ? 'bg-amber-500' :
    'bg-blue-500';

  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden transition-all ${isNew ? 'ring-2 ring-blue-400 ring-offset-2' : ''}`}>
      <div className={`h-1 ${stripeColor}`} />
      <div className="p-3 space-y-3">

        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 mb-0.5">Payout ID</p>
            <p className="font-mono text-sm font-bold text-slate-900 truncate bg-slate-50 px-2 py-1 rounded-lg inline-block" style={{ fontFamily: 'var(--font-mono)' }}>
              {payout.payout_id || payout.id?.slice(-8)}
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
            <p className="text-xs font-bold text-slate-800 truncate">{beneficiaryName}</p>
          </div>

          <div className="bg-blue-50 rounded-lg p-2.5 border border-blue-200">
            <div className="flex items-center gap-1 mb-1">
              <CreditCard className="w-3 h-3 text-blue-600" />
              <p className="text-xs font-bold text-slate-600 uppercase">Amount</p>
            </div>
            <p className="text-base font-bold text-blue-700">₹{payout.amount?.toLocaleString()}</p>
          </div>

          {paymentMode === 'upi' ? (
            <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100 col-span-2">
              <div className="flex items-center gap-1 mb-1">
                <CreditCard className="w-3 h-3 text-green-600" />
                <p className="text-xs font-bold text-slate-400 uppercase">UPI ID</p>
              </div>
              <p className="text-xs font-semibold text-slate-800" style={{ fontFamily: 'var(--font-mono)' }}>
                {payout.upi_id || 'N/A'}
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
                  ***{payout.account_number?.slice(-4) || 'N/A'}
                </p>
              </div>
              <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                <div className="flex items-center gap-1 mb-1">
                  <Hash className="w-3 h-3 text-teal-600" />
                  <p className="text-xs font-bold text-slate-400 uppercase">IFSC</p>
                </div>
                <p className="text-xs font-semibold text-slate-800" style={{ fontFamily: 'var(--font-mono)' }}>
                  {ifscCode}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Fee info */}
        {payout.merchant_fee > 0 && (
          <div className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg border border-slate-100 text-xs">
            <span className="text-slate-500">Fee</span>
            <span className="font-semibold text-slate-700">₹{payout.merchant_fee?.toLocaleString()}</span>
          </div>
        )}

        {/* Trader info (if assigned) */}
        {payout.trader_id && (
          <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 rounded-lg border border-purple-200 text-xs">
            <User className="w-3.5 h-3.5 text-purple-600" />
            <span className="font-semibold text-purple-900">
              Assigned to trader
            </span>
          </div>
        )}

        {/* UTR (if completed) */}
        {payout.utr && (
          <div className="flex items-center justify-between px-3 py-2 bg-green-50 rounded-lg border border-green-200 text-xs">
            <span className="font-semibold text-green-900">UTR: {payout.utr}</span>
            {payout.proof_url && (
              <a href={payout.proof_url} target="_blank" rel="noopener noreferrer" className="text-green-600 underline flex items-center gap-1">
                <Eye className="w-3 h-3" /> Proof
              </a>
            )}
          </div>
        )}

        {/* Failure reason */}
        {payout.status === 'failed' && payout.failure_reason && (
          <div className="flex items-start gap-2 px-3 py-2 bg-red-50 rounded-lg border border-red-200 text-xs">
            <AlertCircle className="w-3.5 h-3.5 text-red-600 flex-shrink-0 mt-0.5" />
            <span className="text-red-800">{payout.failure_reason}</span>
          </div>
        )}

        {/* Timestamp & purpose */}
        <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-100">
          <div className="flex items-center gap-1">
            <Clock size={11} />
            {payout.created_at
              ? new Date(payout.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })
              : '—'
            }
          </div>
          {payout.purpose && (
            <span className="text-slate-600 capitalize">{payout.purpose}</span>
          )}
        </div>

        {/* Cancel button for pending/assigned payouts */}
        {(payout.status === 'pending' || payout.status === 'assigned') && onCancel && (
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
