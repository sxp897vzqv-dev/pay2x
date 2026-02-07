// src/roles/merchant/MerchantRefunds.jsx
// Refund management for merchants

import { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import {
  ReceiptRefundIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  FunnelIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';

export default function MerchantRefunds() {
  const [loading, setLoading] = useState(true);
  const [merchant, setMerchant] = useState(null);
  const [refunds, setRefunds] = useState([]);
  const [filter, setFilter] = useState('all');
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [searchTxn, setSearchTxn] = useState('');
  const [foundPayin, setFoundPayin] = useState(null);
  const [searching, setSearching] = useState(false);
  const [refundForm, setRefundForm] = useState({ amount: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: merchantData } = await supabase
        .from('merchants')
        .select('*')
        .eq('profile_id', user.id)
        .single();
      setMerchant(merchantData);

      if (merchantData) {
        const { data: refundsData } = await supabase
          .from('refunds')
          .select('*, payins(txn_id, order_id, amount, utr)')
          .eq('merchant_id', merchantData.id)
          .order('created_at', { ascending: false });
        setRefunds(refundsData || []);
      }
    } catch (err) {
      console.error('Error loading refunds:', err);
    }
    setLoading(false);
  }

  async function searchPayin() {
    if (!searchTxn.trim()) return;
    setSearching(true);
    setFoundPayin(null);

    try {
      const { data } = await supabase
        .from('payins')
        .select('*')
        .eq('merchant_id', merchant.id)
        .eq('status', 'completed')
        .or(`txn_id.eq.${searchTxn},order_id.eq.${searchTxn},utr.eq.${searchTxn}`)
        .single();

      if (data) {
        // Check if already refunded
        const { data: existingRefund } = await supabase
          .from('refunds')
          .select('id, status')
          .eq('payin_id', data.id)
          .in('status', ['pending', 'approved', 'processed'])
          .single();

        if (existingRefund) {
          alert('This transaction already has a pending or processed refund');
          setFoundPayin(null);
        } else {
          setFoundPayin(data);
          setRefundForm({ amount: data.amount, reason: '' });
        }
      } else {
        alert('No completed transaction found with this ID');
      }
    } catch (err) {
      console.error('Search error:', err);
      alert('Transaction not found or not eligible for refund');
    }
    setSearching(false);
  }

  async function submitRefund() {
    if (!foundPayin) return;
    if (!refundForm.amount || Number(refundForm.amount) <= 0) {
      alert('Enter valid refund amount');
      return;
    }
    if (Number(refundForm.amount) > foundPayin.amount) {
      alert('Refund amount cannot exceed transaction amount');
      return;
    }
    if (!refundForm.reason.trim()) {
      alert('Please provide a reason');
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase.from('refunds').insert({
        merchant_id: merchant.id,
        payin_id: foundPayin.id,
        amount: Number(refundForm.amount),
        reason: refundForm.reason,
        requested_by: user.id,
        status: 'pending'
      });

      if (error) throw error;

      setShowRequestModal(false);
      setFoundPayin(null);
      setSearchTxn('');
      setRefundForm({ amount: '', reason: '' });
      loadData();
    } catch (err) {
      console.error('Refund error:', err);
      alert('Failed to submit refund: ' + err.message);
    }
    setSubmitting(false);
  }

  const filteredRefunds = refunds.filter(r => {
    if (filter === 'all') return true;
    return r.status === filter;
  });

  function getStatusBadge(status) {
    const configs = {
      pending: { icon: ClockIcon, bg: 'bg-yellow-100', text: 'text-yellow-700' },
      approved: { icon: CheckCircleIcon, bg: 'bg-blue-100', text: 'text-blue-700' },
      processed: { icon: CheckCircleIcon, bg: 'bg-green-100', text: 'text-green-700' },
      rejected: { icon: XCircleIcon, bg: 'bg-red-100', text: 'text-red-700' },
      failed: { icon: XCircleIcon, bg: 'bg-red-100', text: 'text-red-700' },
    };
    const config = configs[status] || configs.pending;
    const Icon = config.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
        <Icon className="h-3 w-3" />
        {status}
      </span>
    );
  }

  function formatDate(date) {
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount || 0);
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ReceiptRefundIcon className="h-7 w-7 text-indigo-500" />
            Refunds
          </h1>
          <p className="text-gray-500 mt-1">Request and track refunds for completed payments</p>
        </div>
        <button
          onClick={() => setShowRequestModal(true)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
        >
          <PlusIcon className="h-5 w-5" />
          Request Refund
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Total Refunds</p>
          <p className="text-2xl font-bold text-gray-900">{refunds.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Pending</p>
          <p className="text-2xl font-bold text-yellow-600">
            {refunds.filter(r => r.status === 'pending').length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Processed</p>
          <p className="text-2xl font-bold text-green-600">
            {refunds.filter(r => r.status === 'processed').length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Refunded Amount</p>
          <p className="text-2xl font-bold text-gray-900">
            {formatCurrency(refunds.filter(r => r.status === 'processed').reduce((sum, r) => sum + Number(r.amount), 0))}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow mb-4">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FunnelIcon className="h-5 w-5 text-gray-400" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="border-gray-300 rounded-lg text-sm"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="processed">Processed</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <button onClick={loadData} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowPathIcon className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {filteredRefunds.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <ReceiptRefundIcon className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>No refunds found</p>
          </div>
        ) : (
          <div className="divide-y">
            {filteredRefunds.map(refund => (
              <div key={refund.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      {getStatusBadge(refund.status)}
                      <span className="font-bold text-gray-900">
                        {formatCurrency(refund.amount)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">
                      Order: {refund.payins?.order_id || refund.payins?.txn_id || '—'}
                    </p>
                    <p className="text-sm text-gray-500">
                      Original: {formatCurrency(refund.payins?.amount)}
                      {refund.amount < refund.payins?.amount && ' (Partial)'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">{formatDate(refund.created_at)}</p>
                    {refund.processed_at && (
                      <p className="text-xs text-green-600">
                        Processed: {formatDate(refund.processed_at)}
                      </p>
                    )}
                  </div>
                </div>
                {refund.reason && (
                  <p className="mt-2 text-sm text-gray-600 bg-gray-50 rounded p-2">
                    Reason: {refund.reason}
                  </p>
                )}
                {refund.admin_notes && (
                  <p className="mt-1 text-sm text-blue-600 bg-blue-50 rounded p-2">
                    Admin: {refund.admin_notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Request Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Request Refund</h3>
              <button
                onClick={() => {
                  setShowRequestModal(false);
                  setFoundPayin(null);
                  setSearchTxn('');
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Search Transaction */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Find Transaction
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchTxn}
                    onChange={(e) => setSearchTxn(e.target.value)}
                    placeholder="Transaction ID, Order ID, or UTR"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                    onKeyDown={(e) => e.key === 'Enter' && searchPayin()}
                  />
                  <button
                    onClick={searchPayin}
                    disabled={searching}
                    className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
                  >
                    {searching ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <MagnifyingGlassIcon className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {/* Found Transaction */}
              {foundPayin && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-green-800 mb-2">Transaction Found</p>
                  <div className="space-y-1 text-sm">
                    <p><span className="text-green-600">Amount:</span> <span className="font-bold">{formatCurrency(foundPayin.amount)}</span></p>
                    <p><span className="text-green-600">Order ID:</span> {foundPayin.order_id || '—'}</p>
                    <p><span className="text-green-600">UTR:</span> {foundPayin.utr || '—'}</p>
                    <p><span className="text-green-600">Date:</span> {formatDate(foundPayin.created_at)}</p>
                  </div>

                  <div className="mt-4 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Refund Amount (₹)
                      </label>
                      <input
                        type="number"
                        value={refundForm.amount}
                        onChange={(e) => setRefundForm({ ...refundForm, amount: e.target.value })}
                        max={foundPayin.amount}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Max: {formatCurrency(foundPayin.amount)}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Reason for Refund *
                      </label>
                      <textarea
                        value={refundForm.reason}
                        onChange={(e) => setRefundForm({ ...refundForm, reason: e.target.value })}
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="Customer requested refund..."
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowRequestModal(false);
                  setFoundPayin(null);
                  setSearchTxn('');
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={submitRefund}
                disabled={!foundPayin || submitting}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit Refund Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
