import React, { useState } from 'react';
import { X, CheckCircle, Hash, IndianRupee, Building2, AlertCircle } from 'lucide-react';

/**
 * Simple modal to mark a payout as completed (just UTR input)
 * Video/statement verification happens later at batch level
 */
export default function CompletePayoutModal({ payout, onClose, onComplete }) {
  const [utr, setUtr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!utr.trim() || utr.trim().length < 6) return;
    setSubmitting(true);
    try {
      await onComplete(payout, utr.trim());
      onClose();
    } catch (e) {
      console.error(e);
    }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:w-full sm:max-w-md bg-white shadow-2xl sm:rounded-2xl rounded-t-2xl overflow-hidden mt-auto sm:mt-0 max-h-[85vh] flex flex-col">
        {/* handle */}
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 bg-slate-300 rounded-full" />
        </div>

        {/* header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-green-50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Complete Payout</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* payout summary */}
        <div className="px-4 pt-3">
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Amount</span>
              <span className="text-lg font-bold text-green-600">₹{(payout.amount || 0).toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Account</span>
              <span className="text-xs font-mono font-semibold text-slate-700">{payout.accountNumber || payout.upiId || '—'}</span>
            </div>
            {payout.ifscCode && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">IFSC</span>
                <span className="text-xs font-mono font-semibold text-slate-700">{payout.ifscCode}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Beneficiary</span>
              <span className="text-xs font-semibold text-slate-700">{payout.accountHolderName || '—'}</span>
            </div>
          </div>
        </div>

        {/* UTR input */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
            UTR / Reference Number *
          </label>
          <input
            type="text"
            value={utr}
            onChange={e => setUtr(e.target.value)}
            className="w-full px-3 py-3 border border-slate-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
            placeholder="Enter UTR from bank statement"
          />
          <p className="text-xs text-slate-400 mt-1.5">Enter the transaction reference from your bank</p>

          {/* info notice */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mt-4 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-blue-800">
              <p className="font-semibold mb-0.5">Verification Later</p>
              <p>After completing all assigned payouts, you'll submit one video + statement proof for the entire batch.</p>
            </div>
          </div>
        </div>

        {/* footer */}
        <div className="px-4 py-3 border-t border-slate-100 flex gap-2.5">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-slate-300 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!utr.trim() || utr.trim().length < 6 || submitting}
            className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-bold disabled:opacity-40 active:scale-[0.97]"
          >
            {submitting ? 'Saving...' : 'Mark Complete'}
          </button>
        </div>
      </div>
    </div>
  );
}
