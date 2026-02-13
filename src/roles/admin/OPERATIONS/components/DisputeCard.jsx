import React from 'react';
import { Link } from 'react-router-dom';
import {
  Clock, CheckCircle, XCircle, User, Eye, ArrowDownCircle, ArrowUpCircle,
  MessageSquare, AlertTriangle, UserCheck, UserX
} from 'lucide-react';

export default function DisputeCard({ dispute, onResolve }) {
  // Status styles for all possible statuses
  const statusStyles = {
    pending: { bg: 'bg-amber-100', text: 'text-amber-700', stripe: 'bg-amber-500', label: 'PENDING' },
    routed_to_trader: { bg: 'bg-blue-100', text: 'text-blue-700', stripe: 'bg-blue-500', label: 'WITH TRADER' },
    trader_accepted: { bg: 'bg-cyan-100', text: 'text-cyan-700', stripe: 'bg-cyan-500', label: 'TRADER ACCEPTED' },
    trader_rejected: { bg: 'bg-orange-100', text: 'text-orange-700', stripe: 'bg-orange-500', label: 'TRADER REJECTED' },
    admin_approved: { bg: 'bg-green-100', text: 'text-green-700', stripe: 'bg-green-500', label: 'APPROVED' },
    admin_rejected: { bg: 'bg-red-100', text: 'text-red-700', stripe: 'bg-red-500', label: 'REJECTED' },
  };
  
  const style = statusStyles[dispute.status] || statusStyles.pending;
  const isPayin = dispute.type === 'payin' || dispute.dispute_type?.includes('payin') || dispute.payin_id;
  
  // Check if admin action needed
  const needsAdminAction = ['trader_accepted', 'trader_rejected'].includes(dispute.status);
  const isPending = ['pending', 'routed_to_trader'].includes(dispute.status);

  // Format timestamp (Supabase returns ISO string, not Firebase {seconds})
  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return '—';
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className={`h-1 ${style.stripe}`} />
      <div className="p-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${style.bg} ${style.text}`}>
              {style.label}
            </span>
            <span className={`px-2 py-0.5 rounded-lg text-xs font-bold flex items-center gap-1 ${isPayin ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
              {isPayin ? <ArrowDownCircle size={10} /> : <ArrowUpCircle size={10} />}
              {isPayin ? 'PAYIN' : 'PAYOUT'}
            </span>
          </div>
          {needsAdminAction && (
            <span className="text-xs text-amber-600 font-bold animate-pulse flex items-center gap-1">
              <AlertTriangle size={12} /> NEEDS DECISION
            </span>
          )}
          {isPending && (
            <span className="text-xs text-blue-600 font-bold">PENDING</span>
          )}
        </div>

        {/* ID and Amount */}
        <div className="flex items-center justify-between mb-2">
          <div className="min-w-0">
            <p className="text-xs text-slate-400">{isPayin ? 'UPI ID' : 'Order ID'}</p>
            <p className="font-mono font-bold text-slate-900 text-sm truncate">
              {dispute.upi_id || dispute.order_id || dispute.txn_id || dispute.id?.slice(0, 8)}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xs text-slate-400">Amount</p>
            <p className="text-lg font-bold text-green-700">₹{(Number(dispute.amount) || 0).toLocaleString()}</p>
          </div>
        </div>

        {/* Dispute Type */}
        {dispute.dispute_type && (
          <div className="mb-2">
            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-medium">
              {dispute.dispute_type.replace(/_/g, ' ')}
            </span>
          </div>
        )}

        {/* Reason */}
        {dispute.reason && (
          <p className="text-xs text-slate-500 line-clamp-2 mb-2">{dispute.reason}</p>
        )}

        {/* Trader Response */}
        {dispute.trader_response && (
          <div className={`border rounded-lg p-2 mb-2 ${
            dispute.status === 'trader_accepted' ? 'bg-green-50 border-green-200' : 
            dispute.status === 'trader_rejected' ? 'bg-red-50 border-red-200' : 
            'bg-blue-50 border-blue-200'
          }`}>
            <p className="text-xs flex items-start gap-1">
              {dispute.status === 'trader_accepted' ? (
                <UserCheck size={12} className="text-green-600 mt-0.5" />
              ) : dispute.status === 'trader_rejected' ? (
                <UserX size={12} className="text-red-600 mt-0.5" />
              ) : (
                <MessageSquare size={12} className="text-blue-600 mt-0.5" />
              )}
              <span className={`${
                dispute.status === 'trader_accepted' ? 'text-green-800' : 
                dispute.status === 'trader_rejected' ? 'text-red-800' : 
                'text-blue-800'
              }`}>
                <span className="font-bold">Trader:</span> {dispute.trader_response}
              </span>
            </p>
          </div>
        )}

        {/* Meta */}
        <div className="flex items-center gap-3 text-xs text-slate-400 mb-3 flex-wrap">
          <span className="flex items-center gap-1">
            <Clock size={11} />
            {formatDate(dispute.created_at)}
          </span>
          {dispute.trader_id && (
            <Link to={`/admin/traders/${dispute.trader_id}`} className="flex items-center gap-1 text-indigo-600 font-semibold hover:underline">
              <User size={11} />Trader
            </Link>
          )}
          {dispute.merchant_id && (
            <Link to={`/admin/merchants/${dispute.merchant_id}`} className="flex items-center gap-1 text-purple-600 font-semibold hover:underline">
              <User size={11} />Merchant
            </Link>
          )}
        </div>

        {/* Action Buttons - Show for pending OR trader responded */}
        {(needsAdminAction || isPending) && (
          <div className="flex gap-2">
            <button onClick={() => onResolve(dispute, 'approved')} 
              className="flex-1 flex items-center justify-center gap-1 py-2 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 active:scale-[0.97]">
              <CheckCircle className="w-3.5 h-3.5" /> Approve
            </button>
            <button onClick={() => onResolve(dispute, 'rejected')} 
              className="flex-1 flex items-center justify-center gap-1 py-2 bg-red-500 text-white rounded-lg text-xs font-bold hover:bg-red-600 active:scale-[0.97]">
              <XCircle className="w-3.5 h-3.5" /> Reject
            </button>
          </div>
        )}

        {/* Proof Link */}
        {dispute.proof_url && (
          <a href={dispute.proof_url} target="_blank" rel="noopener noreferrer" 
            className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 font-semibold hover:underline">
            <Eye className="w-3 h-3" /> View Proof
          </a>
        )}
      </div>
    </div>
  );
}
