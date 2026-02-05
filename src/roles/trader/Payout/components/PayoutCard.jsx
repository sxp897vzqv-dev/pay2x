import React, { useState } from 'react';
import {
  CheckCircle, XCircle, Clock, CreditCard, Building2, User, Hash,
  DollarSign, AlertCircle, X,
} from 'lucide-react';

/* ─── Cancel Bottom Sheet ─── */
function CancelSheet({ payout, onClose, onCancel }) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:w-full sm:max-w-md bg-white shadow-2xl sm:rounded-2xl rounded-t-2xl overflow-hidden mt-auto sm:mt-0 max-h-[85vh] flex flex-col">
        {/* handle */}
        <div className="sm:hidden flex justify-center pt-2 pb-1"><div className="w-10 h-1 bg-slate-300 rounded-full" /></div>
        {/* header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-900">Cancel Payout</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg"><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        {/* summary */}
        <div className="px-4 pt-3">
          <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 flex items-center justify-between">
            <p className="text-xs text-slate-500">Amount</p>
            <p className="text-sm font-bold text-slate-900">₹{(payout.amount || 0).toLocaleString()}</p>
          </div>
        </div>
        {/* body */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Reason *</label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent resize-none"
            placeholder="Explain why you're cancelling… (min 10 chars)" />
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mt-2 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">This payout will be returned to the pool for another trader.</p>
          </div>
        </div>
        {/* footer */}
        <div className="px-4 py-3 border-t border-slate-100 flex gap-2.5">
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-300 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 active:bg-slate-100">Cancel</button>
          <button onClick={() => { onCancel(payout, reason); onClose(); }} disabled={reason.trim().length < 10}
            className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-bold disabled:opacity-40 active:scale-[0.97]">Confirm</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Payout Card ─── */
export default function PayoutCard({ payout, onProcess, onCancel, isProcessing }) {
  const [showCancel, setShowCancel] = useState(false);

  return (
    <>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="h-1 bg-blue-500" />
        <div className="p-3 space-y-3">

          {/* header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-400 mb-0.5">Payout ID</p>
              <p className="font-mono text-sm font-bold text-slate-900 truncate bg-slate-50 px-2 py-1 rounded-lg inline-block" style={{ fontFamily: 'var(--font-mono)' }}>
                {payout.id.slice(-10)}
              </p>
            </div>
            <span className="flex-shrink-0 flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-lg text-xs font-bold">
              <Clock className="w-3 h-3" /> PENDING
            </span>
          </div>

          {/* info grid 2×2 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
              <div className="flex items-center gap-1 mb-1"><User className="w-3 h-3 text-green-600" /><p className="text-xs font-bold text-slate-400 uppercase">User</p></div>
              <p className="text-xs font-bold text-slate-800 truncate" style={{ fontFamily: 'var(--font-mono)' }}>{payout.userId || '—'}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
              <div className="flex items-center gap-1 mb-1"><User className="w-3 h-3 text-blue-600" /><p className="text-xs font-bold text-slate-400 uppercase">Holder</p></div>
              <p className="text-xs font-bold text-slate-800 truncate">{payout.accountHolderName || '—'}</p>
            </div>

            {payout.paymentMethod === 'upi' ? (
              <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100 col-span-2 sm:col-span-1">
                <div className="flex items-center gap-1 mb-1"><CreditCard className="w-3 h-3 text-purple-600" /><p className="text-xs font-bold text-slate-400 uppercase">UPI</p></div>
                <p className="text-xs font-semibold text-slate-800 truncate" style={{ fontFamily: 'var(--font-mono)' }}>{payout.upiId || '—'}</p>
              </div>
            ) : (
              <>
                <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                  <div className="flex items-center gap-1 mb-1"><Hash className="w-3 h-3 text-purple-600" /><p className="text-xs font-bold text-slate-400 uppercase">Account</p></div>
                  <p className="text-xs font-bold text-slate-800 truncate" style={{ fontFamily: 'var(--font-mono)' }}>{payout.accountNumber || '—'}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                  <div className="flex items-center gap-1 mb-1"><Building2 className="w-3 h-3 text-indigo-600" /><p className="text-xs font-bold text-slate-400 uppercase">IFSC</p></div>
                  <p className="text-xs font-bold text-slate-800 truncate" style={{ fontFamily: 'var(--font-mono)' }}>{payout.ifscCode || '—'}</p>
                </div>
              </>
            )}

            {/* amount cell */}
            <div className="bg-green-50 rounded-lg p-2.5 border border-green-200 col-span-2 sm:col-span-1">
              <div className="flex items-center gap-1 mb-1"><DollarSign className="w-3 h-3 text-green-600" /><p className="text-xs font-bold text-slate-600 uppercase">Amount</p></div>
              <p className="text-base font-bold text-green-700">₹{(payout.amount || 0).toLocaleString()}</p>
            </div>
          </div>

          {/* action buttons */}
          <div className="flex gap-2 pt-1">
            <button onClick={() => onProcess(payout)} disabled={isProcessing}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed">
              <CheckCircle className="w-4 h-4" />{isProcessing ? 'Processing…' : 'Complete'}
            </button>
            <button onClick={() => setShowCancel(true)} disabled={isProcessing}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed">
              <XCircle className="w-4 h-4" /> Cancel
            </button>
          </div>
        </div>
      </div>

      {/* cancel bottom sheet */}
      {showCancel && (
        <CancelSheet payout={payout} onClose={() => setShowCancel(false)} onCancel={onCancel} />
      )}
    </>
  );
}
