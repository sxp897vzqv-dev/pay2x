import React from 'react';
import { X, ExternalLink } from 'lucide-react';

/* ─── Details Modal ─── */
export default function PayoutDetailsModal({ item, type, onClose }) {
  if (!item) return null;
  const isRequest = type === 'request';
  const statusColors = {
    completed: 'bg-green-100 text-green-700',
    assigned: 'bg-blue-100 text-blue-700',
    pending: 'bg-amber-100 text-amber-700',
    waiting: 'bg-blue-100 text-blue-700',
    partially_assigned: 'bg-amber-100 text-amber-700',
    fully_assigned: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
    cancelled_by_trader: 'bg-red-100 text-red-700',
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-xl bg-white shadow-2xl rounded-t-2xl sm:rounded-2xl overflow-hidden mt-auto sm:mt-0 max-h-[90vh] flex flex-col">
        <div className="sm:hidden flex justify-center pt-2 pb-1"><div className="w-10 h-1 bg-slate-300 rounded-full" /></div>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-900">{isRequest ? 'Request Details' : 'Payout Details'}</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg"><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl p-5 text-center text-white">
            <p className="text-blue-200 text-xs mb-1">Amount</p>
            <p className="text-3xl font-bold">₹{(item.amount || item.requestedAmount || 0).toLocaleString()}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {isRequest ? (
              <>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">Trader</p><p className="text-sm font-semibold truncate">{item.trader?.name || item.traderId?.slice(0, 15)}</p></div>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">Status</p><span className={`inline-block px-2 py-0.5 rounded-lg text-xs font-bold ${statusColors[item.status] || 'bg-slate-100 text-slate-700'}`}>{item.status?.toUpperCase().replace('_', ' ')}</span></div>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">Requested</p><p className="text-sm font-semibold">₹{(item.requestedAmount || 0).toLocaleString()}</p></div>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">Assigned</p><p className="text-sm font-semibold">₹{(item.assignedAmount || 0).toLocaleString()}</p></div>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">Remaining</p><p className="text-sm font-semibold">₹{(item.remainingAmount || 0).toLocaleString()}</p></div>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">Payouts</p><p className="text-sm font-semibold">{item.assignedPayouts?.length || 0}</p></div>
              </>
            ) : (
              <>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">ID</p><p className="text-xs font-mono font-semibold truncate">{item.id}</p></div>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">Status</p><span className={`inline-block px-2 py-0.5 rounded-lg text-xs font-bold ${statusColors[item.status] || 'bg-slate-100 text-slate-700'}`}>{item.status?.toUpperCase().replace('_', ' ')}</span></div>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">User ID</p><p className="text-xs font-mono font-semibold truncate">{item.userId || '—'}</p></div>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">Trader ID</p><p className="text-xs font-mono font-semibold truncate">{item.traderId?.slice(0, 15) || '—'}</p></div>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">UPI/Account</p><p className="text-xs font-mono font-semibold truncate">{item.upiId || item.accountNumber || '—'}</p></div>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">IFSC</p><p className="text-xs font-mono font-semibold truncate">{item.ifscCode || '—'}</p></div>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">UTR</p><p className="text-xs font-mono font-semibold truncate">{item.utrId || '—'}</p></div>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">Commission</p><p className="text-sm font-semibold">{item.commission ? `₹${item.commission}` : '—'}</p></div>
              </>
            )}
          </div>
          {item.cancelReason && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-xs font-bold text-red-800 mb-1">Cancel Reason:</p>
              <p className="text-sm text-red-700">{item.cancelReason}</p>
            </div>
          )}
          {item.proofUrl && (
            <a href={item.proofUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 w-full py-3 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl font-semibold text-sm hover:bg-blue-100">
              <ExternalLink className="w-4 h-4" /> View Proof
            </a>
          )}
        </div>
        <div className="px-4 py-3 border-t border-slate-100">
          <button onClick={onClose} className="w-full py-3 bg-slate-900 text-white rounded-xl font-semibold hover:bg-slate-800 active:scale-[0.98]">Close</button>
        </div>
      </div>
    </div>
  );
}
