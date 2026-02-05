import React from 'react';
import { X } from 'lucide-react';

export default function ActiveRequestBanner({ request, onCancel, assignedCount, canCancel, onGoAssigned }) {
  const statusMap = {
    fully_assigned: {
      stripe: 'bg-green-500',
      bg: 'bg-green-50',
      border: 'border-green-200',
      title: '✅ Fully Assigned',
      titleColor: 'text-green-800',
    },
    partially_assigned: {
      stripe: 'bg-amber-400',
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      title: '⚠️ Partially Assigned',
      titleColor: 'text-amber-800',
    },
    waiting: {
      stripe: 'bg-blue-500',
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      title: '⏳ In Waiting List',
      titleColor: 'text-blue-800',
    },
  };

  const s = statusMap[request.status];
  if (!s) return null;

  return (
    <div className={`${s.bg} border ${s.border} rounded-xl overflow-hidden shadow-sm`}>
      <div className={`h-1 ${s.stripe}`} />
      <div className="p-3">
        {/* header row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className={`text-sm font-bold ${s.titleColor}`}>{s.title}</h3>
          {canCancel && (
            <button onClick={onCancel}
              className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 bg-red-100 text-red-700 rounded-lg text-xs font-bold hover:bg-red-200 active:scale-[0.96]">
              <X className="w-3 h-3" /> Cancel
            </button>
          )}
        </div>

        {/* amount row */}
        <div className="flex items-center gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-500">Requested</p>
            <p className="text-base font-bold text-slate-900">₹{(request.requestedAmount || 0).toLocaleString()}</p>
          </div>
          {(request.assignedAmount || 0) > 0 && (
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-500">Assigned</p>
              <p className="text-base font-bold text-slate-900">₹{(request.assignedAmount || 0).toLocaleString()}</p>
            </div>
          )}
          {(request.remainingAmount || 0) > 0 && (
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-500">Waiting</p>
              <p className="text-base font-bold text-amber-700">₹{(request.remainingAmount || 0).toLocaleString()}</p>
            </div>
          )}
        </div>

        {/* go-to-assigned link */}
        {assignedCount > 0 && (
          <button onClick={onGoAssigned} className="text-xs text-purple-600 font-bold hover:underline">
            → Go to Assigned Payouts ({assignedCount})
          </button>
        )}
      </div>
    </div>
  );
}
