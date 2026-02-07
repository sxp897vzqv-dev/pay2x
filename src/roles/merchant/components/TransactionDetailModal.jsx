// src/roles/merchant/components/TransactionDetailModal.jsx
// Detailed view of a payin/payout transaction

import { useState } from 'react';
import {
  XMarkIcon,
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
  ArrowPathIcon,
  DocumentDuplicateIcon,
  BanknotesIcon,
  UserIcon,
  CalendarIcon,
  ReceiptRefundIcon
} from '@heroicons/react/24/outline';

export default function TransactionDetailModal({ transaction, type = 'payin', onClose, onRefund }) {
  const [copied, setCopied] = useState(null);
  const [showRefundForm, setShowRefundForm] = useState(false);
  const [refundAmount, setRefundAmount] = useState(transaction?.amount || 0);
  const [refundReason, setRefundReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!transaction) return null;

  const isPayin = type === 'payin';
  const tx = transaction;

  function copyToClipboard(text, field) {
    navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  }

  function getStatusConfig(status) {
    const configs = {
      completed: { icon: CheckCircleIcon, bg: 'bg-green-100', text: 'text-green-700', label: 'Completed' },
      success: { icon: CheckCircleIcon, bg: 'bg-green-100', text: 'text-green-700', label: 'Success' },
      pending: { icon: ClockIcon, bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Pending' },
      processing: { icon: ArrowPathIcon, bg: 'bg-blue-100', text: 'text-blue-700', label: 'Processing' },
      failed: { icon: XCircleIcon, bg: 'bg-red-100', text: 'text-red-700', label: 'Failed' },
      rejected: { icon: XCircleIcon, bg: 'bg-red-100', text: 'text-red-700', label: 'Rejected' },
      expired: { icon: XCircleIcon, bg: 'bg-gray-100', text: 'text-gray-700', label: 'Expired' },
    };
    return configs[status] || configs.pending;
  }

  function formatDate(date) {
    if (!date) return '—';
    return new Date(date).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount || 0);
  }

  async function handleRefund() {
    if (!refundAmount || refundAmount <= 0) {
      alert('Enter valid refund amount');
      return;
    }
    if (refundAmount > tx.amount) {
      alert('Refund amount cannot exceed transaction amount');
      return;
    }
    if (!refundReason.trim()) {
      alert('Please provide a reason for refund');
      return;
    }

    setSubmitting(true);
    try {
      await onRefund({
        payinId: tx.id,
        amount: refundAmount,
        reason: refundReason
      });
      setShowRefundForm(false);
    } catch (err) {
      alert('Refund failed: ' + err.message);
    }
    setSubmitting(false);
  }

  const statusConfig = getStatusConfig(tx.status);
  const StatusIcon = statusConfig.icon;

  // Timeline events
  const timeline = [
    { label: 'Created', time: tx.created_at, done: true },
    tx.assigned_at && { label: 'Assigned', time: tx.assigned_at, done: true },
    tx.utr_submitted_at && { label: 'UTR Submitted', time: tx.utr_submitted_at, done: true },
    tx.completed_at && { label: 'Completed', time: tx.completed_at, done: true },
    tx.status === 'failed' && { label: 'Failed', time: tx.updated_at, done: true, error: true },
    tx.status === 'expired' && { label: 'Expired', time: tx.updated_at, done: true, error: true },
  ].filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div 
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {isPayin ? 'Payment Details' : 'Payout Details'}
            </h2>
            <p className="text-sm text-gray-500 font-mono">{tx.txn_id || tx.id?.slice(0, 8)}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <XMarkIcon className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Amount & Status */}
          <div className="text-center py-4 bg-gray-50 rounded-xl">
            <p className="text-3xl font-bold text-gray-900">{formatCurrency(tx.amount)}</p>
            <div className={`inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full ${statusConfig.bg}`}>
              <StatusIcon className={`h-4 w-4 ${statusConfig.text}`} />
              <span className={`text-sm font-medium ${statusConfig.text}`}>{statusConfig.label}</span>
            </div>
          </div>

          {/* Key Details */}
          <div className="space-y-3">
            <DetailRow 
              label="Order ID" 
              value={tx.order_id || '—'} 
              copyable 
              onCopy={() => copyToClipboard(tx.order_id, 'order')}
              copied={copied === 'order'}
            />
            {isPayin && tx.utr && (
              <DetailRow 
                label="UTR Number" 
                value={tx.utr} 
                copyable 
                onCopy={() => copyToClipboard(tx.utr, 'utr')}
                copied={copied === 'utr'}
              />
            )}
            {isPayin && tx.upi_id && (
              <DetailRow label="UPI ID" value={tx.upi_id} />
            )}
            {isPayin && tx.holder_name && (
              <DetailRow label="Account Holder" value={tx.holder_name} />
            )}
            {tx.user_id && (
              <DetailRow label="Customer ID" value={tx.user_id} />
            )}
          </div>

          {/* Timeline */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Transaction Timeline</h3>
            <div className="space-y-3">
              {timeline.map((event, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full mt-2 ${event.error ? 'bg-red-500' : 'bg-green-500'}`} />
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${event.error ? 'text-red-700' : 'text-gray-900'}`}>
                      {event.label}
                    </p>
                    <p className="text-xs text-gray-500">{formatDate(event.time)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Commission/Fee */}
          {tx.commission && (
            <div className="bg-blue-50 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-blue-900 mb-2">Fee Breakdown</h3>
              <div className="flex justify-between text-sm">
                <span className="text-blue-700">Commission Deducted</span>
                <span className="font-medium text-blue-900">{formatCurrency(tx.commission)}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-blue-700">Net Amount</span>
                <span className="font-bold text-blue-900">{formatCurrency(tx.amount - (tx.commission || 0))}</span>
              </div>
            </div>
          )}

          {/* Refund Section (for completed payins only) */}
          {isPayin && tx.status === 'completed' && onRefund && (
            <div className="border-t pt-4">
              {!showRefundForm ? (
                <button
                  onClick={() => setShowRefundForm(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:border-red-300 hover:text-red-600 transition-colors"
                >
                  <ReceiptRefundIcon className="h-5 w-5" />
                  Request Refund
                </button>
              ) : (
                <div className="bg-red-50 rounded-xl p-4 space-y-3">
                  <h4 className="font-semibold text-red-900">Request Refund</h4>
                  <div>
                    <label className="text-sm text-red-700">Refund Amount (₹)</label>
                    <input
                      type="number"
                      value={refundAmount}
                      onChange={(e) => setRefundAmount(Number(e.target.value))}
                      max={tx.amount}
                      className="w-full mt-1 px-3 py-2 border border-red-200 rounded-lg"
                    />
                    <p className="text-xs text-red-600 mt-1">Max: {formatCurrency(tx.amount)}</p>
                  </div>
                  <div>
                    <label className="text-sm text-red-700">Reason</label>
                    <textarea
                      value={refundReason}
                      onChange={(e) => setRefundReason(e.target.value)}
                      rows={2}
                      className="w-full mt-1 px-3 py-2 border border-red-200 rounded-lg"
                      placeholder="Customer requested refund..."
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowRefundForm(false)}
                      className="flex-1 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleRefund}
                      disabled={submitting}
                      className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                    >
                      {submitting ? 'Submitting...' : 'Submit Refund'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Metadata */}
          {tx.metadata && Object.keys(tx.metadata).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Additional Data</h3>
              <pre className="bg-gray-100 rounded-lg p-3 text-xs overflow-x-auto">
                {JSON.stringify(tx.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, copyable, onCopy, copied }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100">
      <span className="text-sm text-gray-500">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-900">{value}</span>
        {copyable && value && value !== '—' && (
          <button
            onClick={onCopy}
            className="p-1 hover:bg-gray-100 rounded"
          >
            {copied ? (
              <CheckCircleIcon className="h-4 w-4 text-green-500" />
            ) : (
              <DocumentDuplicateIcon className="h-4 w-4 text-gray-400" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
