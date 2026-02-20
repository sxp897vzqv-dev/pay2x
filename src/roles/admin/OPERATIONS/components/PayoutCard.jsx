import React, { useState, memo } from 'react';
import { Link } from 'react-router-dom';
import {
  Eye, User, Clock, Hash, CreditCard, Building, Copy, Check,
  Trash2, RotateCcw, MoreVertical, FileText, Loader, X, Filter,
  CheckSquare, Square,
} from 'lucide-react';

/* ─── Payout Card ─── */
const PayoutCard = memo(function PayoutCard({ 
  payout, 
  traderName,
  selected = false,
  onToggleSelect,
  showCheckbox = false,
  onView, 
  onRemove, 
  onReassign, 
  onFilterByTrader,
  onFilterByMerchant,
  showActions = false 
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const statusStyles = {
    completed: { bg: 'bg-green-100', text: 'text-green-700', stripe: 'bg-green-500' },
    assigned: { bg: 'bg-blue-100', text: 'text-blue-700', stripe: 'bg-blue-500' },
    pending: { bg: 'bg-amber-100', text: 'text-amber-700', stripe: 'bg-amber-500' },
    cancelled: { bg: 'bg-red-100', text: 'text-red-700', stripe: 'bg-red-500' },
    cancelled_by_trader: { bg: 'bg-red-100', text: 'text-red-700', stripe: 'bg-red-500' },
    failed: { bg: 'bg-red-100', text: 'text-red-700', stripe: 'bg-red-500' },
  };
  const style = statusStyles[payout.status] || statusStyles.pending;
  
  const timestamp = payout.assigned_at || payout.created_at;
  const timeElapsed = timestamp ? Math.floor((Date.now() - new Date(timestamp).getTime()) / (1000 * 60)) : 0;
  const isOverdue = payout.status === 'assigned' && timeElapsed > 60;

  const traderId = payout.trader_id;
  const merchantId = payout.merchant_id;
  const upiId = payout.upi_id;
  const accountNumber = payout.account_number;
  const utr = payout.utr;
  const cancelReason = payout.cancel_reason || payout.failure_reason;
  const proofUrl = payout.proof_url;

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(payout.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const formatTime = (mins) => {
    if (mins < 60) return `${mins}m`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    return `${Math.floor(mins / 1440)}d`;
  };

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${
      isOverdue ? 'border-orange-300' : selected ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200'
    }`}>
      <div className={`h-1 ${isOverdue ? 'bg-orange-500' : style.stripe}`} />
      <div className="p-3">
        {/* Header Row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            {/* Checkbox */}
            {showCheckbox && onToggleSelect && (
              <button onClick={onToggleSelect} className="mt-0.5 flex-shrink-0">
                {selected ? (
                  <CheckSquare className="w-5 h-5 text-indigo-600" />
                ) : (
                  <Square className="w-5 h-5 text-slate-300 hover:text-slate-400" />
                )}
              </button>
            )}
            
            <div className="flex-1 min-w-0">
              {/* ID with copy button */}
              <div className="flex items-center gap-1.5 mb-0.5">
                <p className="font-mono text-xs text-slate-400 truncate">{payout.txn_id || payout.id?.slice(0, 12)}...</p>
                <button onClick={handleCopyId} className="p-0.5 hover:bg-slate-100 rounded flex-shrink-0" title="Copy ID">
                  {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 text-slate-400" />}
                </button>
              </div>
              <p className="text-lg font-bold text-blue-600">₹{(Number(payout.amount) || 0).toLocaleString()}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${style.bg} ${style.text}`}>
              {payout.status?.toUpperCase().replace('_', ' ') || 'PENDING'}
            </span>
            {isOverdue && <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-orange-100 text-orange-700">OVERDUE</span>}
            {showActions && (
              <div className="relative">
                <button onClick={() => setShowMenu(!showMenu)} className="p-1 hover:bg-slate-100 rounded-lg">
                  <MoreVertical className="w-4 h-4 text-slate-500" />
                </button>
                {showMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                    <div className="absolute right-0 mt-1 w-44 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-20">
                      <button onClick={() => { onView(payout); setShowMenu(false); }} className="w-full px-3 py-2 text-left text-xs hover:bg-slate-50 flex items-center gap-2">
                        <Eye className="w-3.5 h-3.5" /> View Details
                      </button>
                      {traderId && onFilterByTrader && (
                        <button onClick={() => { onFilterByTrader(traderId); setShowMenu(false); }} className="w-full px-3 py-2 text-left text-xs hover:bg-blue-50 text-blue-600 flex items-center gap-2">
                          <Filter className="w-3.5 h-3.5" /> Filter by Trader
                        </button>
                      )}
                      {merchantId && onFilterByMerchant && (
                        <button onClick={() => { onFilterByMerchant(merchantId); setShowMenu(false); }} className="w-full px-3 py-2 text-left text-xs hover:bg-blue-50 text-blue-600 flex items-center gap-2">
                          <Filter className="w-3.5 h-3.5" /> Filter by Merchant
                        </button>
                      )}
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
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        
        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-2 mb-2 text-xs">
          {/* Trader with name */}
          <div className="flex items-center gap-1.5 text-slate-500">
            <User className="w-3 h-3 flex-shrink-0" />
            <span className="truncate" title={traderId}>
              {traderName || traderId?.slice(0, 8) || '—'}
            </span>
          </div>
          
          {/* UPI/Account */}
          <div className="flex items-center gap-1.5 text-slate-500">
            {upiId ? <CreditCard className="w-3 h-3 flex-shrink-0" /> : <Building className="w-3 h-3 flex-shrink-0" />}
            <span className="truncate">{upiId || accountNumber || '—'}</span>
          </div>
          
          {/* UTR */}
          <div className="flex items-center gap-1.5 text-slate-500">
            <Hash className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{utr || 'No UTR'}</span>
          </div>
          
          {/* Time */}
          <div className="flex items-center gap-1.5 text-slate-500">
            <Clock className="w-3 h-3 flex-shrink-0" />
            <span className={timeElapsed > 60 ? 'text-orange-600 font-bold' : ''}>{formatTime(timeElapsed)} ago</span>
          </div>
        </div>
        
        {/* Cancel Reason */}
        {cancelReason && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-2 mb-2">
            <p className="text-xs text-red-700 line-clamp-2"><span className="font-bold">Reason:</span> {cancelReason}</p>
          </div>
        )}
        
        {/* Action Buttons */}
        <div className="flex gap-2">
          {traderId && (
            <Link to={`/admin/traders/${traderId}`} className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-slate-50 text-slate-600 border border-slate-200 rounded-lg text-xs font-semibold hover:bg-slate-100">
              <Eye className="w-3 h-3" /> Trader
            </Link>
          )}
          {proofUrl && (
            <a href={proofUrl} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg text-xs font-semibold hover:bg-blue-100">
              <FileText className="w-3 h-3" /> Proof
            </a>
          )}
          <button onClick={() => onView(payout)} className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg text-xs font-semibold hover:bg-indigo-100">
            <Eye className="w-3 h-3" /> Details
          </button>
        </div>
      </div>
    </div>
  );
});

/* ─── Waiting Request Card ─── */
export const WaitingRequestCard = memo(function WaitingRequestCard({ request, onView, onCancel }) {
  const traderId = request.trader_id;
  const traderName = request.trader?.name;
  const requestedAmount = request.requested_amount || request.amount || 0;
  const assignedAmount = request.assigned_amount || 0;
  const remainingAmount = request.remaining_amount || 0;
  const assignedPayouts = request.assigned_payouts || [];
  const createdAt = request.created_at;

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
          <div className="flex items-center gap-1">
            <button onClick={() => onView(request)} className="p-1.5 hover:bg-slate-100 rounded-lg">
              <Eye className="w-4 h-4 text-slate-500" />
            </button>
            {onCancel && (
              <button onClick={() => onCancel(request)} className="p-1.5 hover:bg-red-100 rounded-lg" title="Cancel Request">
                <X className="w-4 h-4 text-red-500" />
              </button>
            )}
          </div>
        </div>
        <div className="mb-2">
          <p className="text-xs text-slate-400">Trader</p>
          <p className="text-sm font-bold text-slate-900 truncate">{traderName || traderId?.slice(0, 12) || '—'}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center mb-2">
          <div className="bg-slate-50 rounded-lg p-2">
            <p className="text-xs text-slate-400">Requested</p>
            <p className="text-sm font-bold text-slate-900">₹{requestedAmount.toLocaleString()}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-2">
            <p className="text-xs text-green-600">Assigned</p>
            <p className="text-sm font-bold text-green-700">₹{assignedAmount.toLocaleString()}</p>
          </div>
          <div className="bg-orange-50 rounded-lg p-2">
            <p className="text-xs text-orange-600">Waiting</p>
            <p className="text-sm font-bold text-orange-700">₹{remainingAmount.toLocaleString()}</p>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {createdAt ? new Date(createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
          </span>
          {assignedPayouts.length > 0 && (
            <span className="text-green-600 font-semibold">{assignedPayouts.length} assigned</span>
          )}
        </div>
      </div>
    </div>
  );
});

export default PayoutCard;
