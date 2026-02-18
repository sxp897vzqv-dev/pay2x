import React, { useState } from 'react';
import { X, ExternalLink, Copy, Check, Clock, User, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react';

/* ─── Details Modal ─── */
export default function PayoutDetailsModal({ item, type, onClose, traders = {} }) {
  const [copied, setCopied] = useState(false);
  
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
    failed: 'bg-red-100 text-red-700',
  };

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(item.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  // Build timeline events
  const buildTimeline = () => {
    const events = [];
    
    if (item.created_at) {
      events.push({
        label: 'Created',
        time: item.created_at,
        icon: Clock,
        color: 'text-slate-500',
        bgColor: 'bg-slate-100',
      });
    }
    
    if (item.assigned_at) {
      events.push({
        label: 'Assigned to Trader',
        time: item.assigned_at,
        icon: User,
        color: 'text-blue-500',
        bgColor: 'bg-blue-100',
      });
    }
    
    if (item.completed_at && item.status === 'completed') {
      events.push({
        label: 'Completed',
        time: item.completed_at,
        icon: CheckCircle,
        color: 'text-green-500',
        bgColor: 'bg-green-100',
      });
    }
    
    if ((item.status === 'cancelled' || item.status === 'cancelled_by_trader' || item.status === 'failed') && item.updated_at) {
      events.push({
        label: item.status === 'cancelled_by_trader' ? 'Cancelled by Trader' : item.status === 'failed' ? 'Failed' : 'Cancelled',
        time: item.updated_at,
        icon: AlertCircle,
        color: 'text-red-500',
        bgColor: 'bg-red-100',
      });
    }
    
    return events.sort((a, b) => new Date(a.time) - new Date(b.time));
  };

  const timeline = !isRequest ? buildTimeline() : [];
  const traderName = traders[item.trader_id]?.name;

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
          {/* Amount Header */}
          <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl p-5 text-center text-white">
            <p className="text-blue-200 text-xs mb-1">Amount</p>
            <p className="text-3xl font-bold">₹{(item.amount || item.requested_amount || item.requestedAmount || 0).toLocaleString()}</p>
          </div>
          
          {/* ID with Copy */}
          {!isRequest && (
            <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
              <div>
                <p className="text-xs text-slate-400">Payout ID</p>
                <p className="text-xs font-mono font-semibold text-slate-700">{item.id}</p>
              </div>
              <button onClick={handleCopyId} className="p-2 hover:bg-slate-200 rounded-lg transition-colors" title="Copy ID">
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-slate-400" />}
              </button>
            </div>
          )}

          {/* Status Timeline */}
          {timeline.length > 0 && (
            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-xs font-bold text-slate-500 mb-3">Status Timeline</p>
              <div className="space-y-3">
                {timeline.map((event, idx) => {
                  const Icon = event.icon;
                  return (
                    <div key={idx} className="flex items-start gap-3">
                      <div className={`p-1.5 rounded-full ${event.bgColor}`}>
                        <Icon className={`w-3.5 h-3.5 ${event.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-700">{event.label}</p>
                        <p className="text-xs text-slate-400">{formatDateTime(event.time)}</p>
                      </div>
                      {idx < timeline.length - 1 && (
                        <ArrowRight className="w-4 h-4 text-slate-300 flex-shrink-0 mt-1" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-3">
            {isRequest ? (
              <>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">Trader</p><p className="text-sm font-semibold truncate">{item.trader?.name || (item.trader_id || item.traderId)?.slice(0, 15)}</p></div>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">Status</p><span className={`inline-block px-2 py-0.5 rounded-lg text-xs font-bold ${statusColors[item.status] || 'bg-slate-100 text-slate-700'}`}>{item.status?.toUpperCase().replace('_', ' ')}</span></div>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">Requested</p><p className="text-sm font-semibold">₹{(item.requested_amount || item.requestedAmount || item.amount || 0).toLocaleString()}</p></div>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">Assigned</p><p className="text-sm font-semibold">₹{(item.assigned_amount || item.assignedAmount || 0).toLocaleString()}</p></div>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">Remaining</p><p className="text-sm font-semibold">₹{(item.remaining_amount || item.remainingAmount || 0).toLocaleString()}</p></div>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">Payouts</p><p className="text-sm font-semibold">{item.assigned_payouts?.length || item.assignedPayouts?.length || 0}</p></div>
              </>
            ) : (
              <>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">Status</p><span className={`inline-block px-2 py-0.5 rounded-lg text-xs font-bold ${statusColors[item.status] || 'bg-slate-100 text-slate-700'}`}>{item.status?.toUpperCase().replace('_', ' ')}</span></div>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">Merchant ID</p><p className="text-xs font-mono font-semibold truncate">{(item.merchant_id)?.slice(0, 15) || '—'}</p></div>
                <div className="bg-slate-50 rounded-lg p-2.5">
                  <p className="text-xs text-slate-400 mb-0.5">Trader</p>
                  <p className="text-sm font-semibold truncate">{traderName || (item.trader_id)?.slice(0, 15) || '—'}</p>
                  {traderName && item.trader_id && <p className="text-xs text-slate-400 font-mono truncate">{item.trader_id.slice(0, 12)}...</p>}
                </div>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">UPI ID</p><p className="text-xs font-mono font-semibold truncate">{item.upi_id || '—'}</p></div>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">Account Number</p><p className="text-xs font-mono font-semibold truncate">{item.account_number || '—'}</p></div>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">IFSC</p><p className="text-xs font-mono font-semibold truncate">{item.ifsc || item.ifsc_code || '—'}</p></div>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">Beneficiary</p><p className="text-xs font-semibold truncate">{item.beneficiary_name || item.account_name || '—'}</p></div>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">UTR</p><p className="text-xs font-mono font-semibold truncate">{item.utr || '—'}</p></div>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">Commission</p><p className="text-sm font-semibold">{item.commission ? `₹${Number(item.commission).toLocaleString()}` : '—'}</p></div>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">Payment Mode</p><p className="text-xs font-semibold truncate">{item.payment_mode || (item.upi_id ? 'UPI' : item.account_number ? 'Bank' : '—')}</p></div>
              </>
            )}
          </div>
          
          {/* Failure Reason */}
          {(item.failure_reason || item.cancel_reason) && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-xs font-bold text-red-800 mb-1">Failure Reason:</p>
              <p className="text-sm text-red-700">{item.failure_reason || item.cancel_reason}</p>
            </div>
          )}
          
          {/* Proof Link */}
          {(item.proof_url || item.proofUrl) && (
            <a href={item.proof_url || item.proofUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 w-full py-3 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl font-semibold text-sm hover:bg-blue-100">
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
