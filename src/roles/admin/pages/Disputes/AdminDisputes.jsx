import React, { useState, useEffect } from 'react';
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../../../firebase';
import {
  Search,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  Eye,
  X,
} from 'lucide-react';

const STATUS_CONFIG = {
  pending: { color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  approved: { color: 'bg-green-100 text-green-700', icon: CheckCircle },
  rejected: { color: 'bg-red-100 text-red-700', icon: XCircle },
};

const DisputeModal = ({ dispute, onClose, onResolve }) => {
  const [resolution, setResolution] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const handleResolve = async (status) => {
    if (!note && status === 'rejected') {
      alert('Please provide a note for rejection');
      return;
    }

    setLoading(true);
    try {
      await onResolve(dispute, status, note);
      onClose();
    } catch (error) {
      alert('Error: ' + error.message);
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h3 className="text-xl font-bold text-slate-900">Dispute Details</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Status Badge */}
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              STATUS_CONFIG[dispute.status]?.color
            }`}>
              {dispute.status?.toUpperCase()}
            </span>
            {dispute.type && (
              <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-700">
                {dispute.type.toUpperCase()}
              </span>
            )}
          </div>

          {/* Reference ID */}
          <div>
            <p className="text-sm text-slate-500 mb-1">Reference ID</p>
            <p className="font-mono text-lg font-semibold text-slate-900">{dispute.refId}</p>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-slate-500 mb-1">Merchant ID</p>
              <p className="font-mono text-sm text-slate-900">{dispute.merchantId || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500 mb-1">Trader ID</p>
              <p className="font-mono text-sm text-slate-900">{dispute.traderId || 'N/A'}</p>
            </div>
          </div>

          {/* Reason */}
          <div>
            <p className="text-sm text-slate-500 mb-2">Reason</p>
            <p className="text-sm text-slate-900 bg-slate-50 p-4 rounded-lg border border-slate-200">
              {dispute.reason || 'No reason provided'}
            </p>
          </div>

          {/* Timestamps */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Created At:</span>
              <span className="font-medium text-slate-900">
                {dispute.createdAt?.toDate?.().toLocaleString() || 'N/A'}
              </span>
            </div>
            {dispute.resolvedAt && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Resolved At:</span>
                <span className="font-medium text-slate-900">
                  {dispute.resolvedAt.toDate().toLocaleString()}
                </span>
              </div>
            )}
          </div>

          {/* Admin Note (if exists) */}
          {dispute.adminNote && (
            <div>
              <p className="text-sm text-slate-500 mb-2">Admin Note</p>
              <p className="text-sm text-slate-900 bg-blue-50 p-4 rounded-lg border border-blue-200">
                {dispute.adminNote}
              </p>
            </div>
          )}

          {/* Resolution Form (for pending disputes) */}
          {dispute.status === 'pending' && (
            <div className="pt-6 border-t border-slate-200 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Admin Note / Resolution
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  rows={4}
                  placeholder="Enter resolution details or notes..."
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => handleResolve('approved')}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50"
                >
                  <CheckCircle className="w-5 h-5" />
                  Approve Dispute
                </button>
                <button
                  onClick={() => handleResolve('rejected')}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50"
                >
                  <XCircle className="w-5 h-5" />
                  Reject Dispute
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const DisputeCard = ({ dispute, onView }) => {
  const StatusIcon = STATUS_CONFIG[dispute.status]?.icon || AlertCircle;
  const statusColor = STATUS_CONFIG[dispute.status]?.color || 'bg-gray-100 text-gray-700';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 hover:shadow-md transition-all">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${statusColor}`}>
              <StatusIcon className="w-3 h-3" />
              {dispute.status?.toUpperCase()}
            </span>
            {dispute.type && (
              <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                {dispute.type.toUpperCase()}
              </span>
            )}
          </div>
          <p className="font-mono text-sm text-slate-600">{dispute.refId}</p>
        </div>
        <button
          onClick={() => onView(dispute)}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <Eye className="w-5 h-5 text-slate-600" />
        </button>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Merchant:</span>
          <span className="font-mono text-slate-900">{dispute.merchantId?.slice(-10) || 'N/A'}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Trader:</span>
          <span className="font-mono text-slate-900">{dispute.traderId?.slice(-10) || 'N/A'}</span>
        </div>
      </div>

      <div className="pt-4 border-t border-slate-100">
        <p className="text-sm text-slate-600 line-clamp-2">{dispute.reason || 'No reason provided'}</p>
      </div>

      <div className="pt-3 text-xs text-slate-400">
        {dispute.createdAt?.toDate?.().toLocaleString() || 'N/A'}
      </div>
    </div>
  );
};

const AdminDisputes = () => {
  const [disputes, setDisputes] = useState([]);
  const [filteredDisputes, setFilteredDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [selectedDispute, setSelectedDispute] = useState(null);

  useEffect(() => {
    fetchDisputes();
  }, []);

  useEffect(() => {
    let filtered = disputes.filter((d) => d.status === statusFilter);

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (d) =>
          d.refId?.toLowerCase().includes(searchLower) ||
          d.merchantId?.toLowerCase().includes(searchLower) ||
          d.traderId?.toLowerCase().includes(searchLower) ||
          d.reason?.toLowerCase().includes(searchLower)
      );
    }

    setFilteredDisputes(filtered);
  }, [disputes, statusFilter, search]);

  const fetchDisputes = async () => {
    setLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'disputes'));
      const disputesData = [];
      querySnapshot.forEach((doc) => {
        disputesData.push({ id: doc.id, ...doc.data() });
      });

      // Sort by date (newest first)
      disputesData.sort((a, b) => {
        const dateA = a.createdAt?.seconds || 0;
        const dateB = b.createdAt?.seconds || 0;
        return dateB - dateA;
      });

      setDisputes(disputesData);
    } catch (error) {
      console.error('Error fetching disputes:', error);
    }
    setLoading(false);
  };

  const handleResolveDispute = async (dispute, status, note) => {
    try {
      await updateDoc(doc(db, 'disputes', dispute.id), {
        status,
        resolvedAt: serverTimestamp(),
        adminNote: note || `${status === 'approved' ? 'Approved' : 'Rejected'} by admin`,
      });

      await fetchDisputes();
    } catch (error) {
      throw error;
    }
  };

  const stats = {
    pending: disputes.filter((d) => d.status === 'pending').length,
    approved: disputes.filter((d) => d.status === 'approved').length,
    rejected: disputes.filter((d) => d.status === 'rejected').length,
    total: disputes.length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">Loading disputes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Dispute Management</h1>
        <p className="text-slate-600 mt-1">Review and resolve transaction disputes</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-slate-500 to-slate-600 rounded-xl p-6 text-white">
          <p className="text-slate-100 text-sm mb-1">Total Disputes</p>
          <p className="text-3xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl p-6 text-white">
          <p className="text-yellow-100 text-sm mb-1">Pending</p>
          <p className="text-3xl font-bold">{stats.pending}</p>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white">
          <p className="text-green-100 text-sm mb-1">Approved</p>
          <p className="text-3xl font-bold">{stats.approved}</p>
        </div>
        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-6 text-white">
          <p className="text-red-100 text-sm mb-1">Rejected</p>
          <p className="text-3xl font-bold">{stats.rejected}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 flex items-center gap-3">
            <Search className="w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by ID, merchant, trader, or reason..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 outline-none text-slate-900 placeholder-slate-400"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setStatusFilter('pending')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                statusFilter === 'pending'
                  ? 'bg-yellow-500 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Pending
            </button>
            <button
              onClick={() => setStatusFilter('approved')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                statusFilter === 'approved'
                  ? 'bg-green-500 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Approved
            </button>
            <button
              onClick={() => setStatusFilter('rejected')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                statusFilter === 'rejected'
                  ? 'bg-red-500 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Rejected
            </button>
          </div>
        </div>
      </div>

      {/* Disputes Grid */}
      {filteredDisputes.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDisputes.map((dispute) => (
            <DisputeCard
              key={dispute.id}
              dispute={dispute}
              onView={setSelectedDispute}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-12 text-center">
          <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">No {statusFilter} disputes found</p>
        </div>
      )}

      {/* Dispute Modal */}
      {selectedDispute && (
        <DisputeModal
          dispute={selectedDispute}
          onClose={() => setSelectedDispute(null)}
          onResolve={handleResolveDispute}
        />
      )}
    </div>
  );
};

export default AdminDisputes;