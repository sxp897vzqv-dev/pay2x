import React from 'react';
import {
  AlertCircle, CreditCard, Zap, RefreshCw, Send,
} from 'lucide-react';

export default function RequestTab({ canCreate, requestAmount, setRequestAmount, workingBalance, submitting, onSubmit, activeRequest, assignedCount, onGoAssigned }) {
  if (!canCreate) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-amber-50 border-b border-amber-200 p-3 flex items-start gap-2.5">
          <AlertCircle className="w-4.5 h-4.5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-amber-800 text-sm">Cannot Create New Request</p>
            <p className="text-xs text-amber-600 mt-0.5">
              {activeRequest && assignedCount === 0
                ? 'Cancel your current request or wait for payouts to be assigned.'
                : assignedCount > 0
                ? `Complete or cancel ${assignedCount} assigned payout(s) first.`
                : 'Complete your active request first.'}
            </p>
          </div>
        </div>
        <div className="p-4 space-y-3">
          {activeRequest && (
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <p className="text-xs text-slate-500 mb-0.5">Active Request</p>
              <p className="text-sm font-bold text-slate-900">₹{(activeRequest.requestedAmount || 0).toLocaleString()}</p>
              <p className="text-xs text-slate-500 mt-0.5 capitalize">{activeRequest.status?.replace('_', ' ')}</p>
            </div>
          )}
          {assignedCount > 0 && (
            <button onClick={onGoAssigned}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-bold hover:bg-purple-700 active:scale-[0.97]">
              <CreditCard className="w-4 h-4" /> Process {assignedCount} Assigned Payout(s)
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* info card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-purple-50 border-b border-purple-200 p-3 flex items-start gap-2.5">
          <Zap className="w-4.5 h-4.5 text-purple-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-purple-800 text-sm">Instant Auto-Assignment</p>
            <p className="text-xs text-purple-600 mt-0.5">Payouts are assigned immediately — no waiting for approval.</p>
          </div>
        </div>
      </div>

      {/* form card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div>
          <p className="text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Request Amount *</p>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₹</span>
            <input
              type="number"
              value={requestAmount}
              onChange={e => setRequestAmount(e.target.value)}
              placeholder="Enter amount"
              min="5000" max="100000"
              className="w-full pl-8 pr-3 py-3 border border-slate-300 rounded-xl text-base font-bold focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
            />
          </div>
          <p className="text-xs text-slate-400 mt-1">Min ₹5,000 · Max ₹1,00,000 per request</p>
        </div>

        {/* how-it-works */}
        <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
          <p className="text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5 text-blue-500" /> How it works
          </p>
          <div className="text-xs text-slate-500 space-y-0.5">
            <p>• Oldest unassigned payouts are assigned first (FIFO)</p>
            <p>• Partial match → you get available now + rest when ready</p>
            <p>• No match → added to waiting list</p>
          </div>
        </div>

        <button onClick={onSubmit} disabled={submitting || !requestAmount}
          className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl text-sm font-bold hover:from-purple-700 hover:to-blue-700 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed">
          {submitting
            ? <><RefreshCw className="w-4 h-4 animate-spin" /> Processing…</>
            : <><Send className="w-4 h-4" /> Request Payout</>
          }
        </button>
      </div>
    </div>
  );
}
