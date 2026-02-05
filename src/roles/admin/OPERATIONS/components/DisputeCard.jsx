import React from 'react';
import { Link } from 'react-router-dom';
import {
  Clock, CheckCircle, XCircle, User, Eye, ArrowDownCircle, ArrowUpCircle,
} from 'lucide-react';

export default function DisputeCard({ dispute, onResolve }) {
  const statusStyles = {
    approved: { bg: 'bg-green-100', text: 'text-green-700', stripe: 'bg-green-500' },
    pending: { bg: 'bg-amber-100', text: 'text-amber-700', stripe: 'bg-amber-500' },
    rejected: { bg: 'bg-red-100', text: 'text-red-700', stripe: 'bg-red-500' },
  };
  const style = statusStyles[dispute.status] || statusStyles.pending;
  const isPayin = dispute.type === 'payin';

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className={`h-1 ${style.stripe}`} />
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${style.bg} ${style.text}`}>{dispute.status?.toUpperCase()}</span>
            <span className={`px-2 py-0.5 rounded-lg text-xs font-bold flex items-center gap-1 ${isPayin ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
              {isPayin ? <ArrowDownCircle size={10} /> : <ArrowUpCircle size={10} />}{dispute.type?.toUpperCase()}
            </span>
          </div>
          {dispute.status === 'pending' && <span className="text-xs text-amber-600 font-bold animate-pulse">NEEDS ACTION</span>}
        </div>

        <div className="flex items-center justify-between mb-2">
          <div className="min-w-0"><p className="text-xs text-slate-400">{isPayin ? 'UPI ID' : 'Order ID'}</p><p className="font-mono font-bold text-slate-900 text-sm truncate" style={{ fontFamily: 'var(--font-mono)' }}>{isPayin ? dispute.upiId : dispute.orderId}</p></div>
          <div className="text-right flex-shrink-0"><p className="text-xs text-slate-400">Amount</p><p className="text-lg font-bold text-green-700">₹{(Number(dispute.amount) || 0).toLocaleString()}</p></div>
        </div>

        {dispute.reason && <p className="text-xs text-slate-500 line-clamp-2 mb-2">{dispute.reason}</p>}
        {dispute.traderNote && <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 mb-2"><p className="text-xs text-blue-800"><span className="font-bold">Trader Response:</span> {dispute.traderNote}</p></div>}

        <div className="flex items-center gap-3 text-xs text-slate-400 mb-3">
          <span className="flex items-center gap-1"><Clock size={11} />{new Date((dispute.createdAt?.seconds || 0) * 1000).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</span>
          <Link to={`/admin/traders/${dispute.traderId}`} className="flex items-center gap-1 text-indigo-600 font-semibold"><User size={11} />Trader</Link>
        </div>

        {dispute.status === 'pending' && (
          <div className="flex gap-2">
            <button onClick={() => onResolve(dispute, 'approved')} className="flex-1 flex items-center justify-center gap-1 py-2 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 active:scale-[0.97]"><CheckCircle className="w-3.5 h-3.5" /> Approve</button>
            <button onClick={() => onResolve(dispute, 'rejected')} className="flex-1 flex items-center justify-center gap-1 py-2 bg-red-500 text-white rounded-lg text-xs font-bold hover:bg-red-600 active:scale-[0.97]"><XCircle className="w-3.5 h-3.5" /> Reject</button>
          </div>
        )}

        {dispute.proofUrl && <a href={dispute.proofUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 font-semibold"><Eye className="w-3 h-3" /> View Proof</a>}
      </div>
    </div>
  );
}
