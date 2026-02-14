import React from 'react';
import {
  AlertCircle, CheckCircle, XCircle, Clock,
  ArrowDownCircle, ArrowUpCircle, MessageSquare, Eye,
} from 'lucide-react';

export default function DisputeCard({ dispute, onViewConversation, unreadCount }) {
  const isPayin = dispute.type === 'payin';

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* status stripe */}
      <div className={`h-1 ${(dispute.status === 'pending' || dispute.status === 'routed_to_trader') ? 'bg-amber-400' : (dispute.status === 'approved' || dispute.status === 'trader_accepted' || dispute.status === 'admin_approved') ? 'bg-green-500' : 'bg-red-500'}`} />
      <div className="p-3">

        {/* Header badges row */}
        <div className="flex items-start justify-between mb-2.5">
          <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
            <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${
              (dispute.status === 'pending' || dispute.status === 'routed_to_trader') ? 'bg-amber-100 text-amber-700' :
              (dispute.status === 'approved' || dispute.status === 'trader_accepted' || dispute.status === 'admin_approved') ? 'bg-green-100 text-green-700' :
              'bg-red-100 text-red-700'
            }`}>{dispute.status === 'routed_to_trader' ? 'PENDING ACTION' : dispute.status?.toUpperCase()}</span>
            <span className={`px-2 py-0.5 rounded-lg text-xs font-bold flex items-center gap-1 ${
              isPayin ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
            }`}>
              {isPayin ? <ArrowDownCircle size={10} /> : <ArrowUpCircle size={10} />}
              {dispute.type?.toUpperCase()}
            </span>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-red-500 text-white flex items-center gap-1">
                <MessageSquare size={10} />
                {unreadCount} new
              </span>
            )}
          </div>
          {(dispute.status === 'pending' || dispute.status === 'routed_to_trader') && (
            <span className="text-xs text-amber-600 font-bold animate-pulse flex-shrink-0">ACTION NEEDED</span>
          )}
        </div>

        {/* Key info row */}
        <div className="flex items-center justify-between mb-2" style={{ gap: 12 }}>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400">{isPayin ? 'UPI ID' : 'Order ID'}</p>
            <p className="font-mono font-bold text-slate-900 text-sm truncate" style={{ fontFamily: 'var(--font-mono)' }}>
              {isPayin ? dispute.upiId : dispute.orderId}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xs text-slate-400">Amount</p>
            <p className="text-lg font-bold text-green-700">₹{(dispute.amount || 0).toLocaleString()}</p>
          </div>
        </div>

        {dispute.merchantName && (
          <p className="text-xs text-slate-500 mb-1"><span className="font-semibold text-slate-600">Merchant:</span> {dispute.merchantName}</p>
        )}
        {dispute.reason && <p className="text-xs text-slate-500 line-clamp-2 mb-2">{dispute.reason}</p>}

        {/* Messages indicator */}
        {(dispute.messageCount || 0) > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 mb-2 bg-blue-50 rounded-lg border border-blue-200 text-xs">
            <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
            <span className="font-semibold text-blue-900">{dispute.messageCount} message{dispute.messageCount !== 1 ? 's' : ''}</span>
          </div>
        )}

        <div className="flex items-center gap-1 text-xs text-slate-400 mb-2.5">
          <Clock size={11} />
          {new Date((dispute.createdAt?.seconds || 0) * 1000).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
        </div>

        <button onClick={() => onViewConversation(dispute)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 text-white rounded-xl hover:bg-amber-600 active:scale-[0.97] transition-all font-semibold text-sm">
          <Eye size={15} /> View Conversation
        </button>
      </div>
    </div>
  );
}
