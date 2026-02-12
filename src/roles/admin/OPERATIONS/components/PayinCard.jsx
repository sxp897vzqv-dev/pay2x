import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  User, CreditCard, Clock, Hash, ChevronDown, ChevronUp, Copy, Timer, Eye,
} from 'lucide-react';

/* ─── Time Ago Helper ─── */
function timeAgo(dateStr) {
  if (!dateStr) return null;
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/* ─── Pending Timer ─── */
function PendingTimer({ createdAt }) {
  const [elapsed, setElapsed] = useState('');
  
  useEffect(() => {
    if (!createdAt) return;
    
    const update = () => {
      const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
      const mins = Math.floor(diff / 60);
      const hrs = Math.floor(mins / 60);
      if (hrs > 0) {
        setElapsed(`${hrs}h ${mins % 60}m`);
      } else {
        setElapsed(`${mins}m`);
      }
    };
    
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [createdAt]);

  if (!elapsed) return null;
  
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded text-xs font-medium">
      <Timer className="w-3 h-3" /> {elapsed}
    </span>
  );
}

/* ─── Payin Card ─── */
export default function PayinCard({ payin, onExpand, expanded }) {
  const statusStyles = {
    completed: { bg: 'bg-green-100', text: 'text-green-700', stripe: 'bg-green-500', amountColor: 'text-green-600' },
    pending: { bg: 'bg-amber-100', text: 'text-amber-700', stripe: 'bg-amber-500', amountColor: 'text-amber-600' },
    rejected: { bg: 'bg-red-100', text: 'text-red-700', stripe: 'bg-red-500', amountColor: 'text-red-600' },
    expired: { bg: 'bg-slate-100', text: 'text-slate-600', stripe: 'bg-slate-400', amountColor: 'text-slate-600' },
    failed: { bg: 'bg-red-100', text: 'text-red-700', stripe: 'bg-red-500', amountColor: 'text-red-600' },
  };
  const style = statusStyles[payin.status] || statusStyles.pending;

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  // Display transaction ID (prefer txn_id, fallback to id)
  const displayTxnId = payin.txn_id || payin.id?.slice(0, 12) || '—';
  const displayTraderId = payin.trader_id?.slice(0, 8) || '—';
  const displayUpiId = payin.upi_id || payin.assigned_upi || '—';
  const displayUtr = payin.utr || payin.utr_id || 'No UTR';
  const displayMerchant = payin.merchant_id?.slice(0, 8) || '—';

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className={`h-1 ${style.stripe}`} />
      <div className="p-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-mono text-xs text-slate-400">{displayTxnId}</p>
              {payin.status === 'pending' && <PendingTimer createdAt={payin.created_at} />}
            </div>
            <p className={`text-lg font-bold ${style.amountColor}`}>₹{(Number(payin.amount) || 0).toLocaleString()}</p>
          </div>
          <div className="flex items-center gap-1">
            <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${style.bg} ${style.text}`}>
              {payin.status?.toUpperCase() || 'PENDING'}
            </span>
            <button 
              onClick={() => onExpand(payin.id)}
              className="p-1 hover:bg-slate-100 rounded-lg"
            >
              {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>
          </div>
        </div>

        {/* Quick Info */}
        <div className="grid grid-cols-2 gap-2 mb-2 text-xs">
          <div className="flex items-center gap-1.5 text-slate-500">
            <User className="w-3 h-3" />
            <span className="truncate">{displayTraderId}</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-500">
            <CreditCard className="w-3 h-3" />
            <span className="truncate">{displayUpiId}</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-500">
            <Hash className="w-3 h-3" />
            <span className="truncate">{displayUtr}</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-500">
            <Clock className="w-3 h-3" />
            <span>{timeAgo(payin.created_at) || '—'}</span>
          </div>
        </div>

        {/* Expanded Details */}
        {expanded && (
          <div className="border-t border-slate-100 pt-2 mt-2 space-y-2">
            <div className="bg-slate-50 rounded-lg p-2 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Transaction ID</span>
                <button onClick={() => copyToClipboard(payin.txn_id || payin.id)} className="font-mono text-slate-700 hover:text-indigo-600 flex items-center gap-1">
                  {payin.txn_id || payin.id} <Copy className="w-3 h-3" />
                </button>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Trader ID</span>
                <span className="font-mono text-slate-700">{payin.trader_id || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Merchant</span>
                <span className="text-slate-700">{payin.merchant_id || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">UPI ID</span>
                <span className="font-mono text-slate-700">{displayUpiId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Holder Name</span>
                <span className="text-slate-700">{payin.holder_name || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">UTR</span>
                <span className="font-mono text-slate-700">{payin.utr || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Created</span>
                <span className="text-slate-700">
                  {payin.created_at ? new Date(payin.created_at).toLocaleString('en-IN') : '—'}
                </span>
              </div>
              {payin.completed_at && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Completed</span>
                  <span className="text-slate-700">
                    {new Date(payin.completed_at).toLocaleString('en-IN')}
                  </span>
                </div>
              )}
              {payin.commission !== undefined && payin.commission !== null && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Commission</span>
                  <span className="text-green-600 font-semibold">₹{(Number(payin.commission) || 0).toLocaleString()}</span>
                </div>
              )}
              {payin.order_id && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Order ID</span>
                  <span className="font-mono text-slate-700">{payin.order_id}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-2">
          {payin.trader_id && (
            <Link to={`/admin/traders/${payin.trader_id}`}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-slate-50 text-slate-600 border border-slate-200 rounded-lg text-xs font-semibold hover:bg-slate-100">
              <User className="w-3 h-3" /> Trader
            </Link>
          )}
          {payin.screenshot_url && (
            <a href={payin.screenshot_url} target="_blank" rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg text-xs font-semibold hover:bg-blue-100">
              <Eye className="w-3 h-3" /> Proof
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
