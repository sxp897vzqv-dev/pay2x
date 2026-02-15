import React from 'react';
import {
  CheckCircle, IndianRupee, FileText,
} from 'lucide-react';
import { StatusBadge, RelativeTime } from '../../../../components/trader';
import { formatINR } from '../../../../utils/format';

/* ─── History Row ─── */
function HistoryRow({ payout }) {
  let timeStr = '—';
  try {
    const d = payout.completedAt?.toDate?.() || new Date((payout.completedAt?.seconds || 0) * 1000);
    timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  } catch (e) { /* keep default */ }

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <CheckCircle className="w-3.5 h-3.5 text-green-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900">{formatINR(payout.amount)}</p>
            <p className="text-xs text-slate-400">{timeStr}</p>
          </div>
        </div>
        <StatusBadge status="completed" size="sm" />
      </div>

      {/* details row */}
      <div className="flex gap-3 ml-9 flex-wrap">
        {payout.upiId && (
          <div>
            <p className="text-xs text-slate-400">UPI</p>
            <p className="text-xs font-semibold text-slate-700 truncate" style={{ fontFamily: 'var(--font-mono)' }}>{payout.upiId}</p>
          </div>
        )}
        {payout.accountNumber && (
          <div>
            <p className="text-xs text-slate-400">Account</p>
            <p className="text-xs font-semibold text-slate-700" style={{ fontFamily: 'var(--font-mono)' }}>***{payout.accountNumber.slice(-4)}</p>
          </div>
        )}
        {payout.utrId && (
          <div>
            <p className="text-xs text-slate-400">UTR</p>
            <p className="text-xs font-semibold text-slate-700 truncate" style={{ fontFamily: 'var(--font-mono)' }}>{payout.utrId}</p>
          </div>
        )}
        {payout.proofUrl && (
          <a href={payout.proofUrl} target="_blank" rel="noopener noreferrer"
            className="text-xs text-blue-600 font-semibold flex items-center gap-0.5 hover:underline">
            <FileText className="w-3 h-3" /> Proof
          </a>
        )}
      </div>
    </div>
  );
}

/* ─── History Tab ─── */
export default function HistoryTab({ payouts, totalAmount }) {
  if (payouts.length === 0) {
    return (
      <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200">
        <div className="w-14 h-14 bg-white border border-slate-200 rounded-full mx-auto mb-3 flex items-center justify-center shadow-sm">
          <FileText className="w-6 h-6 text-slate-400" />
        </div>
        <h3 className="text-sm font-bold text-slate-700">No History Yet</h3>
        <p className="text-xs text-slate-400 mt-0.5">Completed payouts will appear here</p>
      </div>
    );
  }

  /* group by date */
  const grouped = payouts.reduce((acc, p) => {
    let dateKey = '—';
    try {
      const d = p.completedAt?.toDate?.() || new Date((p.completedAt?.seconds || 0) * 1000);
      dateKey = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) { /* keep default */ }
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      {/* summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <CheckCircle className="w-3.5 h-3.5 text-purple-600" />
            <p className="text-xs font-semibold text-purple-600 uppercase">Completed</p>
          </div>
          <p className="text-xl font-bold text-purple-800">{payouts.length}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <IndianRupee className="w-3.5 h-3.5 text-green-600" />
            <p className="text-xs font-semibold text-green-600 uppercase">Total</p>
          </div>
          <p className="text-xl font-bold text-green-800">₹{totalAmount.toLocaleString()}</p>
        </div>
      </div>

      {/* grouped history */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {Object.entries(grouped).map(([date, items], gi) => (
          <div key={date}>
            {/* date header */}
            <div className={`px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2 ${gi > 0 ? 'border-t border-slate-100' : ''}`}>
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <p className="text-xs font-bold text-slate-600">{date}</p>
              <span className="text-xs text-slate-400">({items.length})</span>
            </div>
            {/* rows */}
            <div className="divide-y divide-slate-100">
              {items.map((p, i) => (
                <HistoryRow key={p.id || i} payout={p} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
