import React, { useState, useEffect } from 'react';
import { getRefunds, processRefund, getChargebacks, updateChargeback } from '../../utils/enterprise';
import { RefreshCw, IndianRupee, AlertTriangle, Clock, CheckCircle, XCircle, FileText, Search } from 'lucide-react';

const REFUND_STATUS = {
  pending: { color: 'yellow', label: 'Pending' },
  approved: { color: 'blue', label: 'Approved' },
  processing: { color: 'indigo', label: 'Processing' },
  completed: { color: 'green', label: 'Completed' },
  rejected: { color: 'red', label: 'Rejected' },
  failed: { color: 'red', label: 'Failed' },
};

const CHARGEBACK_STATUS = {
  received: { color: 'yellow', label: 'Received' },
  under_review: { color: 'blue', label: 'Under Review' },
  evidence_requested: { color: 'orange', label: 'Evidence Needed' },
  evidence_submitted: { color: 'indigo', label: 'Evidence Submitted' },
  won: { color: 'green', label: 'Won' },
  lost: { color: 'red', label: 'Lost' },
  accepted: { color: 'gray', label: 'Accepted' },
  expired: { color: 'gray', label: 'Expired' },
};

export default function AdminRefunds() {
  const [refunds, setRefunds] = useState([]);
  const [chargebacks, setChargebacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('refunds');
  const [selectedItem, setSelectedItem] = useState(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [refundsData, chargebacksData] = await Promise.all([
        getRefunds({ limit: 100 }),
        getChargebacks({ limit: 100 })
      ]);
      setRefunds(refundsData);
      setChargebacks(chargebacksData);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);

  const refundStats = {
    pending: refunds.filter(r => r.status === 'pending').length,
    pendingAmount: refunds.filter(r => r.status === 'pending').reduce((sum, r) => sum + Number(r.refund_amount || 0), 0),
  };

  const chargebackStats = {
    open: chargebacks.filter(c => ['received', 'under_review', 'evidence_requested'].includes(c.status)).length,
    openAmount: chargebacks.filter(c => ['received', 'under_review', 'evidence_requested'].includes(c.status)).reduce((sum, c) => sum + Number(c.chargeback_amount || 0), 0),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Refunds & Chargebacks</h1>
          <p className="text-gray-400 text-sm mt-1">Manage refund requests and chargeback cases</p>
        </div>
        <button onClick={fetchData} className="p-2 bg-[#1a1a2e] rounded-lg hover:bg-white/10">
          <RefreshCw className="w-5 h-5 text-gray-400" />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-white/5">
          <p className="text-gray-400 text-sm">Pending Refunds</p>
          <p className="text-2xl font-bold text-yellow-400">{refundStats.pending}</p>
          <p className="text-sm text-gray-500">{formatCurrency(refundStats.pendingAmount)}</p>
        </div>
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-white/5">
          <p className="text-gray-400 text-sm">Open Chargebacks</p>
          <p className="text-2xl font-bold text-red-400">{chargebackStats.open}</p>
          <p className="text-sm text-gray-500">{formatCurrency(chargebackStats.openAmount)}</p>
        </div>
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-white/5">
          <p className="text-gray-400 text-sm">Total Refunds</p>
          <p className="text-2xl font-bold text-white">{refunds.length}</p>
        </div>
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-white/5">
          <p className="text-gray-400 text-sm">Total Chargebacks</p>
          <p className="text-2xl font-bold text-white">{chargebacks.length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10">
        {[
          { key: 'refunds', label: 'Refunds', count: refundStats.pending },
          { key: 'chargebacks', label: 'Chargebacks', count: chargebackStats.open },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === tab.key
                ? 'text-indigo-400 border-b-2 border-indigo-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="px-1.5 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded-full">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading...</div>
      ) : activeTab === 'refunds' ? (
        <RefundsTab refunds={refunds} onSelect={setSelectedItem} onRefresh={fetchData} formatCurrency={formatCurrency} />
      ) : (
        <ChargebacksTab chargebacks={chargebacks} onSelect={setSelectedItem} formatCurrency={formatCurrency} />
      )}

      {/* Action Modal */}
      {selectedItem && (
        <ActionModal
          item={selectedItem}
          type={activeTab === 'refunds' ? 'refund' : 'chargeback'}
          onClose={() => setSelectedItem(null)}
          onSuccess={fetchData}
        />
      )}
    </div>
  );
}

function RefundsTab({ refunds, onSelect, onRefresh, formatCurrency }) {
  if (refunds.length === 0) {
    return (
      <div className="bg-[#1a1a2e] rounded-xl border border-white/5 p-8 text-center">
        <IndianRupee className="w-12 h-12 text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400">No refund requests</p>
      </div>
    );
  }

  return (
    <div className="bg-[#1a1a2e] rounded-xl border border-white/5 overflow-hidden">
      <table className="w-full">
        <thead className="bg-black/20">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Merchant</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Payin</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Amount</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Reason</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Date</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {refunds.map(r => (
            <tr key={r.id} className="hover:bg-white/5">
              <td className="px-4 py-3 text-white">{r.merchants?.name || '-'}</td>
              <td className="px-4 py-3 text-gray-400 font-mono text-sm">{r.payins?.order_id || '-'}</td>
              <td className="px-4 py-3 text-right">
                <span className="text-white">{formatCurrency(r.refund_amount)}</span>
                {r.is_partial && <span className="text-xs text-gray-500 ml-1">(partial)</span>}
              </td>
              <td className="px-4 py-3 text-gray-400 capitalize">{r.reason?.replace('_', ' ')}</td>
              <td className="px-4 py-3">
                <div className="flex justify-center">
                  <span className={`px-2 py-0.5 text-xs rounded-full bg-${REFUND_STATUS[r.status]?.color || 'gray'}-500/20 text-${REFUND_STATUS[r.status]?.color || 'gray'}-400`}>
                    {REFUND_STATUS[r.status]?.label || r.status}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3 text-gray-500 text-sm">{new Date(r.created_at).toLocaleDateString()}</td>
              <td className="px-4 py-3">
                {r.status === 'pending' && (
                  <button
                    onClick={() => onSelect(r)}
                    className="text-xs px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded"
                  >
                    Review
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChargebacksTab({ chargebacks, onSelect, formatCurrency }) {
  if (chargebacks.length === 0) {
    return (
      <div className="bg-[#1a1a2e] rounded-xl border border-white/5 p-8 text-center">
        <AlertTriangle className="w-12 h-12 text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400">No chargebacks</p>
      </div>
    );
  }

  return (
    <div className="bg-[#1a1a2e] rounded-xl border border-white/5 overflow-hidden">
      <table className="w-full">
        <thead className="bg-black/20">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Merchant</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Case #</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Amount</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Reason</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Due Date</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {chargebacks.map(c => (
            <tr key={c.id} className="hover:bg-white/5">
              <td className="px-4 py-3 text-white">{c.merchants?.name || '-'}</td>
              <td className="px-4 py-3 text-gray-400 font-mono text-sm">{c.case_number || c.arn || '-'}</td>
              <td className="px-4 py-3 text-right text-red-400">{formatCurrency(c.chargeback_amount)}</td>
              <td className="px-4 py-3 text-gray-400 capitalize">{c.reason?.replace('_', ' ')}</td>
              <td className="px-4 py-3">
                <div className="flex justify-center">
                  <span className={`px-2 py-0.5 text-xs rounded-full bg-${CHARGEBACK_STATUS[c.status]?.color || 'gray'}-500/20 text-${CHARGEBACK_STATUS[c.status]?.color || 'gray'}-400`}>
                    {CHARGEBACK_STATUS[c.status]?.label || c.status}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3 text-sm">
                {c.evidence_due_date ? (
                  <span className={new Date(c.evidence_due_date) < new Date() ? 'text-red-400' : 'text-gray-400'}>
                    {new Date(c.evidence_due_date).toLocaleDateString()}
                  </span>
                ) : '-'}
              </td>
              <td className="px-4 py-3">
                {['received', 'under_review', 'evidence_requested'].includes(c.status) && (
                  <button
                    onClick={() => onSelect(c)}
                    className="text-xs px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded"
                  >
                    Manage
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActionModal({ item, type, onClose, onSuccess }) {
  const [action, setAction] = useState('');
  const [notes, setNotes] = useState('');
  const [transactionRef, setTransactionRef] = useState('');
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async () => {
    setProcessing(true);
    try {
      if (type === 'refund') {
        await processRefund(item.id, action, transactionRef, notes);
      } else {
        const updates = { status: action };
        if (notes) updates.resolution_notes = notes;
        await updateChargeback(item.id, updates);
      }
      onSuccess();
      onClose();
    } catch (e) {
      console.error(e);
      alert('Failed to process');
    }
    setProcessing(false);
  };

  const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1a2e] rounded-xl w-full max-w-md border border-white/10 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          {type === 'refund' ? 'Process Refund' : 'Manage Chargeback'}
        </h2>

        <div className="space-y-4">
          <div className="bg-black/30 rounded-lg p-3">
            <p className="text-sm text-gray-400">Amount</p>
            <p className="text-xl font-bold text-white">
              {formatCurrency(type === 'refund' ? item.refund_amount : item.chargeback_amount)}
            </p>
          </div>

          {type === 'refund' ? (
            <>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Action</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAction('approve')}
                    className={`flex-1 py-2 rounded-lg text-sm ${action === 'approve' ? 'bg-green-600 text-white' : 'bg-green-500/20 text-green-400'}`}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => setAction('reject')}
                    className={`flex-1 py-2 rounded-lg text-sm ${action === 'reject' ? 'bg-red-600 text-white' : 'bg-red-500/20 text-red-400'}`}
                  >
                    Reject
                  </button>
                </div>
              </div>
              {action === 'approve' && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Transaction Reference</label>
                  <input
                    type="text"
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    placeholder="UTR/Reference number"
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white"
                  />
                </div>
              )}
            </>
          ) : (
            <div>
              <label className="block text-sm text-gray-400 mb-2">Update Status</label>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value)}
                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white"
              >
                <option value="">Select status...</option>
                <option value="under_review">Under Review</option>
                <option value="evidence_requested">Request Evidence</option>
                <option value="evidence_submitted">Evidence Submitted</option>
                <option value="won">Won</option>
                <option value="lost">Lost</option>
                <option value="accepted">Accept (don't fight)</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-400 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2 border border-white/10 text-white rounded-lg hover:bg-white/5">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!action || processing}
            className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
          >
            {processing ? 'Processing...' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}
