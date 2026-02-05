import React from 'react';
import {
  CreditCard, DollarSign, CheckCircle, AlertCircle,
} from 'lucide-react';
import PayoutCard from './PayoutCard';

export default function AssignedTab({ payouts, totalAmount, onProcess, onCancel, processing }) {
  if (payouts.length === 0) {
    return (
      <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200">
        <div className="w-14 h-14 bg-white border border-slate-200 rounded-full mx-auto mb-3 flex items-center justify-center shadow-sm">
          <CheckCircle className="w-6 h-6 text-slate-400" />
        </div>
        <h3 className="text-sm font-bold text-slate-700">All Clear</h3>
        <p className="text-xs text-slate-400 mt-0.5">No payouts assigned. Create a request to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <CreditCard className="w-3.5 h-3.5 text-blue-600" />
            <p className="text-xs font-semibold text-blue-600 uppercase">Pending</p>
          </div>
          <p className="text-xl font-bold text-blue-800">{payouts.length}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <DollarSign className="w-3.5 h-3.5 text-green-600" />
            <p className="text-xs font-semibold text-green-600 uppercase">Total</p>
          </div>
          <p className="text-xl font-bold text-green-800">₹{totalAmount.toLocaleString()}</p>
        </div>
      </div>

      {/* instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2.5">
        <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-blue-800">
          <p className="font-bold mb-0.5">Instructions</p>
          <p>Process via your bank → enter UTR + upload proof → click Complete. Balance updates automatically.</p>
        </div>
      </div>

      {/* payout cards */}
      <div className="space-y-3">
        {payouts.map(p => (
          <PayoutCard key={p.id} payout={p} onProcess={onProcess} onCancel={onCancel} isProcessing={processing === p.id} />
        ))}
      </div>
    </div>
  );
}
