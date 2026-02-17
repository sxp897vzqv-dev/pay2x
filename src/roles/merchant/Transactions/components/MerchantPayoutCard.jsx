import React from 'react';
import {
  CheckCircle, XCircle, Clock, AlertCircle, Building, CreditCard, User, Hash,
  Loader2, Ban, Eye, ArrowUpRight, ShieldCheck, Copy, Check,
} from 'lucide-react';

export default function PayoutCard({ payout, onCancel, isNew }) {
  const [copied, setCopied] = React.useState(false);
  
  // Handle column name variations (DB has both old and new names)
  const beneficiaryName = payout.beneficiary_name || payout.account_name || 'N/A';
  const ifscCode = payout.ifsc_code || payout.ifsc || 'N/A';
  const paymentMode = payout.payment_mode || (payout.upi_id ? 'upi' : 'bank');
  
  const statusConfig = {
    pending: { 
      bg: 'bg-yellow-50', 
      border: 'border-yellow-200', 
      text: 'text-yellow-700', 
      icon: Clock,
      stripe: 'bg-yellow-500',
      label: 'PENDING'
    },
    assigned: { 
      bg: 'bg-blue-50', 
      border: 'border-blue-200', 
      text: 'text-blue-700', 
      icon: User,
      stripe: 'bg-blue-500',
      label: 'ASSIGNED'
    },
    processing: { 
      bg: 'bg-amber-50', 
      border: 'border-amber-200', 
      text: 'text-amber-700', 
      icon: Loader2,
      stripe: 'bg-amber-500',
      label: 'PROCESSING'
    },
    completed: { 
      bg: 'bg-green-50', 
      border: 'border-green-200', 
      text: 'text-green-700', 
      icon: CheckCircle,
      stripe: 'bg-green-500',
      label: 'COMPLETED'
    },
    failed: { 
      bg: 'bg-red-50', 
      border: 'border-red-200', 
      text: 'text-red-700', 
      icon: XCircle,
      stripe: 'bg-red-500',
      label: 'FAILED'
    },
    cancelled: { 
      bg: 'bg-slate-50', 
      border: 'border-slate-200', 
      text: 'text-slate-600', 
      icon: Ban,
      stripe: 'bg-slate-400',
      label: 'CANCELLED'
    },
    rejected: { 
      bg: 'bg-red-50', 
      border: 'border-red-200', 
      text: 'text-red-700', 
      icon: XCircle,
      stripe: 'bg-red-500',
      label: 'REJECTED'
    },
  };

  const status = statusConfig[payout.status] || statusConfig.pending;
  const StatusIcon = status.icon;

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (dateString) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleString('en-IN', { 
      dateStyle: 'short', 
      timeStyle: 'short' 
    });
  };

  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden transition-all ${
      isNew ? 'ring-2 ring-purple-400 ring-offset-2 animate-pulse-once' : ''
    }`}>
      {/* Status stripe */}
      <div className={`h-1 ${status.stripe}`} />
      
      <div className="p-4 space-y-3">
        {/* Header: ID & Status */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 mb-1">Payout ID</p>
            <div className="flex items-center gap-2">
              <code className="font-mono text-sm font-bold text-slate-900 bg-slate-50 px-2 py-1 rounded-lg truncate">
                {payout.payout_id || payout.id?.slice(-8)}
              </code>
              <button 
                onClick={() => copyToClipboard(payout.payout_id || payout.id)}
                className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${status.bg} ${status.border} ${status.text} flex items-center gap-1.5 border flex-shrink-0`}>
            <StatusIcon className={`w-3.5 h-3.5 ${payout.status === 'processing' ? 'animate-spin' : ''}`} />
            {status.label}
          </span>
        </div>

        {/* Main Info Grid */}
        <div className="grid grid-cols-2 gap-2">
          {/* Beneficiary */}
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
            <div className="flex items-center gap-1.5 mb-1">
              <User className="w-3.5 h-3.5 text-purple-500" />
              <p className="text-xs font-bold text-slate-400 uppercase">Beneficiary</p>
            </div>
            <p className="text-sm font-semibold text-slate-800 truncate">{beneficiaryName}</p>
          </div>

          {/* Amount */}
          <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
            <div className="flex items-center gap-1.5 mb-1">
              <ArrowUpRight className="w-3.5 h-3.5 text-purple-600" />
              <p className="text-xs font-bold text-purple-600 uppercase">Amount</p>
            </div>
            <p className="text-lg font-bold text-purple-700">₹{payout.amount?.toLocaleString()}</p>
          </div>

          {/* Payment Details */}
          {paymentMode === 'upi' ? (
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 col-span-2">
              <div className="flex items-center gap-1.5 mb-1">
                <CreditCard className="w-3.5 h-3.5 text-green-600" />
                <p className="text-xs font-bold text-slate-400 uppercase">UPI ID</p>
              </div>
              <p className="text-sm font-mono font-semibold text-slate-800">
                {payout.upi_id || 'N/A'}
              </p>
            </div>
          ) : (
            <>
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                <div className="flex items-center gap-1.5 mb-1">
                  <Building className="w-3.5 h-3.5 text-indigo-600" />
                  <p className="text-xs font-bold text-slate-400 uppercase">Account</p>
                </div>
                <p className="text-sm font-mono font-semibold text-slate-800">
                  ****{payout.account_number?.slice(-4) || 'N/A'}
                </p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                <div className="flex items-center gap-1.5 mb-1">
                  <Hash className="w-3.5 h-3.5 text-teal-600" />
                  <p className="text-xs font-bold text-slate-400 uppercase">IFSC</p>
                </div>
                <p className="text-sm font-mono font-semibold text-slate-800">
                  {ifscCode}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Fee Info */}
        {payout.merchant_fee > 0 && (
          <div className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
            <span className="text-xs text-slate-500 font-medium">Processing Fee</span>
            <span className="text-sm font-semibold text-slate-700">₹{payout.merchant_fee?.toLocaleString()}</span>
          </div>
        )}

        {/* Status-specific info cards */}
        
        {/* Trader assigned */}
        {payout.trader_id && payout.status !== 'completed' && (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-blue-50 rounded-lg border border-blue-200">
            <User className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-semibold text-blue-800">Assigned to trader • Processing</span>
          </div>
        )}

        {/* Pending verification */}
        {payout.status === 'completed' && payout.verification_status && payout.verification_status !== 'verified' && (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-50 rounded-lg border border-amber-200">
            <Clock className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-semibold text-amber-800">
              {payout.verification_status === 'pending' ? 'Awaiting verification' : 
               payout.verification_status === 'submitted' ? 'Verification submitted' : 
               `Verification: ${payout.verification_status}`}
            </span>
          </div>
        )}

        {/* UTR (completed) */}
        {payout.utr && (
          <div className="flex items-center justify-between px-3 py-2.5 bg-green-50 rounded-lg border border-green-200">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-green-600" />
              <span className="text-xs font-semibold text-green-800">UTR: {payout.utr}</span>
            </div>
            {payout.proof_url && (
              <a 
                href={payout.proof_url} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-xs text-green-600 font-semibold hover:text-green-700 flex items-center gap-1"
              >
                <Eye className="w-3.5 h-3.5" /> View Proof
              </a>
            )}
          </div>
        )}

        {/* Failure reason */}
        {(payout.status === 'failed' || payout.status === 'rejected') && payout.failure_reason && (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 rounded-lg border border-red-200">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <span className="text-xs text-red-700">{payout.failure_reason}</span>
          </div>
        )}

        {/* Footer: Time & Purpose */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Clock className="w-3.5 h-3.5" />
            {formatTime(payout.created_at)}
          </div>
          {payout.purpose && (
            <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded capitalize">
              {payout.purpose}
            </span>
          )}
        </div>

        {/* Cancel button - only for pending status */}
        {payout.status === 'pending' && onCancel && (
          <button
            onClick={() => onCancel(payout.id)}
            className="w-full py-2.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-semibold hover:bg-red-100 active:bg-red-200 flex items-center justify-center gap-1.5 transition-colors"
          >
            <Ban className="w-3.5 h-3.5" />
            Cancel Payout Request
          </button>
        )}
      </div>
    </div>
  );
}
