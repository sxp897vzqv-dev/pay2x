import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Eye, User, Clock, Hash, CreditCard, Building,
  Trash2, RotateCcw, MoreVertical, FileText, Loader,
} from 'lucide-react';

/* ─── Payout Card ─── */
export default function PayoutCard({ payout, onView, onRemove, onReassign, showActions = false }) {
  const [showMenu, setShowMenu] = useState(false);
  const statusStyles = {
    completed: { bg: 'bg-green-100', text: 'text-green-700', stripe: 'bg-green-500' },
    assigned: { bg: 'bg-blue-100', text: 'text-blue-700', stripe: 'bg-blue-500' },
    pending: { bg: 'bg-amber-100', text: 'text-amber-700', stripe: 'bg-amber-500' },
    cancelled: { bg: 'bg-red-100', text: 'text-red-700', stripe: 'bg-red-500' },
    cancelled_by_trader: { bg: 'bg-red-100', text: 'text-red-700', stripe: 'bg-red-500' },
  };
  const style = statusStyles[payout.status] || statusStyles.pending;
  
  // Calculate time elapsed - handle both assignedAt and createdAt
  const timestamp = payout.assignedAt || payout.createdAt;
  const timeElapsed = timestamp?.seconds
    ? Math.floor((Date.now() - timestamp.seconds * 1000) / (1000 * 60))
    : 0;
  const isOverdue = payout.status === 'assigned' && timeElapsed > 60;

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${isOverdue ? 'border-orange-300' : 'border-slate-200'}`}>
      <div className={`h-1 ${isOverdue ? 'bg-orange-500' : style.stripe}`} />
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <p className="font-mono text-xs text-slate-400">{payout.id?.slice(0, 12)}...</p>
            <p className="text-lg font-bold text-blue-600">₹{(Number(payout.amount) || 0).toLocaleString()}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${style.bg} ${style.text}`}>
              {payout.status?.toUpperCase().replace('_', ' ')}
            </span>
            {isOverdue && <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-orange-100 text-orange-700">OVERDUE</span>}
            {showActions && (
              <div className="relative">
                <button onClick={() => setShowMenu(!showMenu)} className="p-1 hover:bg-slate-100 rounded-lg">
                  <MoreVertical className="w-4 h-4 text-slate-500" />
                </button>
                {showMenu && (
                  <div className="absolute right-0 mt-1 w-40 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-20">
                    <button onClick={() => { onView(payout); setShowMenu(false); }} className="w-full px-3 py-2 text-left text-xs hover:bg-slate-50 flex items-center gap-2">
                      <Eye className="w-3.5 h-3.5" /> View Details
                    </button>
                    {onReassign && (
                      <button onClick={() => { onReassign(payout); setShowMenu(false); }} className="w-full px-3 py-2 text-left text-xs hover:bg-purple-50 text-purple-600 flex items-center gap-2">
                        <RotateCcw className="w-3.5 h-3.5" /> Reassign to Pool
                      </button>
                    )}
                    {onRemove && (
                      <button onClick={() => { onRemove(payout); setShowMenu(false); }} className="w-full px-3 py-2 text-left text-xs hover:bg-red-50 text-red-600 flex items-center gap-2">
                        <Trash2 className="w-3.5 h-3.5" /> Remove Payout
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2 text-xs">
          <div className="flex items-center gap-1.5 text-slate-500"><User className="w-3 h-3" /><span className="truncate">{payout.traderId?.slice(0, 8) || payout.userId?.slice(0, 8) || '—'}</span></div>
          <div className="flex items-center gap-1.5 text-slate-500">{payout.upiId ? <CreditCard className="w-3 h-3" /> : <Building className="w-3 h-3" />}<span className="truncate">{payout.upiId || payout.accountNumber || '—'}</span></div>
          <div className="flex items-center gap-1.5 text-slate-500"><Hash className="w-3 h-3" /><span className="truncate">{payout.utrId || 'No UTR'}</span></div>
          <div className="flex items-center gap-1.5 text-slate-500"><Clock className="w-3 h-3" /><span className={timeElapsed > 60 ? 'text-orange-600 font-bold' : ''}>{timeElapsed}m ago</span></div>
        </div>
        {payout.cancelReason && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-2 mb-2">
            <p className="text-xs text-red-700 line-clamp-2"><span className="font-bold">Reason:</span> {payout.cancelReason}</p>
          </div>
        )}
        <div className="flex gap-2">
          {payout.traderId && <Link to={`/admin/traders/${payout.traderId}`} className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-slate-50 text-slate-600 border border-slate-200 rounded-lg text-xs font-semibold hover:bg-slate-100"><Eye className="w-3 h-3" /> Trader</Link>}
          {payout.proofUrl && <a href={payout.proofUrl} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg text-xs font-semibold hover:bg-blue-100"><FileText className="w-3 h-3" /> Proof</a>}
          <button onClick={() => onView(payout)} className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg text-xs font-semibold hover:bg-indigo-100"><Eye className="w-3 h-3" /> Details</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Waiting Request Card ─── */
export function WaitingRequestCard({ request, onView }) {
  return (
    <div className="bg-white rounded-xl border-2 border-blue-200 shadow-sm overflow-hidden">
      <div className="h-1 bg-blue-500" />
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <Loader className="w-4 h-4 text-blue-600 animate-spin" />
            <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${
              request.status === 'waiting' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {request.status === 'waiting' ? 'WAITING' : request.status?.toUpperCase().replace('_', ' ') || 'PARTIAL'}
            </span>
          </div>
          <button onClick={() => onView(request)} className="p-1.5 hover:bg-slate-100 rounded-lg"><Eye className="w-4 h-4 text-slate-500" /></button>
        </div>
        <div className="mb-2">
          <p className="text-xs text-slate-400">Trader</p>
          <p className="text-sm font-bold text-slate-900 truncate">{request.trader?.name || request.traderId?.slice(0, 12) || '—'}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center mb-2">
          <div className="bg-slate-50 rounded-lg p-2">
            <p className="text-xs text-slate-400">Requested</p>
            <p className="text-sm font-bold text-slate-900">₹{(request.requestedAmount || 0).toLocaleString()}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-2">
            <p className="text-xs text-green-600">Assigned</p>
            <p className="text-sm font-bold text-green-700">₹{(request.assignedAmount || 0).toLocaleString()}</p>
          </div>
          <div className="bg-orange-50 rounded-lg p-2">
            <p className="text-xs text-orange-600">Waiting</p>
            <p className="text-sm font-bold text-orange-700">₹{(request.remainingAmount || 0).toLocaleString()}</p>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {request.requestedAt?.seconds ? new Date(request.requestedAt.seconds * 1000).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
          </span>
          {request.assignedPayouts?.length > 0 && <span className="text-green-600 font-semibold">{request.assignedPayouts.length} assigned</span>}
        </div>
      </div>
    </div>
  );
}
