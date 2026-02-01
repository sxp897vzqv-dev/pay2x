import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  getDocs,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../../../firebase';
import {
  Search,
  Filter,
  Download,
  Eye,
  TrendingUp,
  TrendingDown,
  Calendar,
  X,
} from 'lucide-react';

const TABS = [
  { key: 'all', label: 'All Transactions' },
  { key: 'payin', label: 'Payins' },
  { key: 'payout', label: 'Payouts' },
];

const STATUS_COLORS = {
  completed: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  rejected: 'bg-red-100 text-red-700',
  disputed: 'bg-orange-100 text-orange-700',
};

const TransactionModal = ({ transaction, onClose }) => {
  if (!transaction) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h3 className="text-xl font-bold text-slate-900">Transaction Details</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Header Info */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Transaction ID</p>
              <p className="text-lg font-mono font-semibold text-slate-900">
                {transaction.transactionId || transaction.id}
              </p>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[transaction.status]}`}>
              {transaction.status?.toUpperCase()}
            </span>
          </div>

          {/* Amount */}
          <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl p-6">
            <p className="text-sm text-slate-600 mb-1">Amount</p>
            <p className="text-3xl font-bold text-slate-900">₹{transaction.amount?.toLocaleString()}</p>
            {transaction.commission && (
              <p className="text-sm text-slate-600 mt-2">
                Commission: <span className="font-semibold">₹{transaction.commission}</span>
              </p>
            )}
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-slate-500 mb-1">Type</p>
              <p className="font-medium text-slate-900">
                {transaction.type === 'payin' || transaction.upiId ? 'Payin' : 'Payout'}
              </p>
            </div>

            {transaction.userId && (
              <div>
                <p className="text-sm text-slate-500 mb-1">User ID</p>
                <p className="font-mono text-sm text-slate-900">{transaction.userId}</p>
              </div>
            )}

            {transaction.traderId && (
              <div>
                <p className="text-sm text-slate-500 mb-1">Trader ID</p>
                <p className="font-mono text-sm text-slate-900">{transaction.traderId}</p>
              </div>
            )}

            {transaction.merchantId && (
              <div>
                <p className="text-sm text-slate-500 mb-1">Merchant ID</p>
                <p className="font-mono text-sm text-slate-900">{transaction.merchantId}</p>
              </div>
            )}

            {transaction.upiId && (
              <div>
                <p className="text-sm text-slate-500 mb-1">UPI ID</p>
                <p className="font-mono text-sm text-slate-900">{transaction.upiId}</p>
              </div>
            )}

            {transaction.utrId && (
              <div>
                <p className="text-sm text-slate-500 mb-1">UTR Number</p>
                <p className="font-mono text-sm text-slate-900">{transaction.utrId}</p>
              </div>
            )}

            {transaction.accountNumber && (
              <div>
                <p className="text-sm text-slate-500 mb-1">Account Number</p>
                <p className="font-mono text-sm text-slate-900">{transaction.accountNumber}</p>
              </div>
            )}

            {transaction.ifscCode && (
              <div>
                <p className="text-sm text-slate-500 mb-1">IFSC Code</p>
                <p className="font-mono text-sm text-slate-900">{transaction.ifscCode}</p>
              </div>
            )}
          </div>

          {/* Timestamps */}
          <div className="border-t border-slate-200 pt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Requested At:</span>
              <span className="font-medium text-slate-900">
                {transaction.requestedAt?.toDate?.().toLocaleString() || 
                 transaction.requestTime?.toDate?.().toLocaleString() || 'N/A'}
              </span>
            </div>
            {transaction.completedAt && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Completed At:</span>
                <span className="font-medium text-slate-900">
                  {transaction.completedAt.toDate().toLocaleString()}
                </span>
              </div>
            )}
          </div>

          {/* Screenshot */}
          {transaction.screenshotUrl && (
            <div>
              <p className="text-sm text-slate-500 mb-2">Payment Proof</p>
              <a
                href={transaction.screenshotUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <Eye className="w-4 h-4" />
                View Screenshot
              </a>
            </div>
          )}

          {/* Notes */}
          {transaction.traderNote && (
            <div>
              <p className="text-sm text-slate-500 mb-2">Trader Note</p>
              <p className="text-sm text-slate-900 bg-slate-50 p-3 rounded-lg">
                {transaction.traderNote}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const AdminTransactions = () => {
  const [activeTab, setActiveTab] = useState('all');
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const [payinsSnap, payoutsSnap] = await Promise.all([
        getDocs(query(collection(db, 'payin'), orderBy('requestedAt', 'desc'))),
        getDocs(query(collection(db, 'payouts'), orderBy('requestTime', 'desc'))),
      ]);

      const allTransactions = [];

      payinsSnap.forEach((doc) => {
        allTransactions.push({
          id: doc.id,
          ...doc.data(),
          type: 'payin',
        });
      });

      payoutsSnap.forEach((doc) => {
        allTransactions.push({
          id: doc.id,
          ...doc.data(),
          type: 'payout',
        });
      });

      // Sort by date
      allTransactions.sort((a, b) => {
        const dateA = a.requestedAt?.seconds || a.requestTime?.seconds || 0;
        const dateB = b.requestedAt?.seconds || b.requestTime?.seconds || 0;
        return dateB - dateA;
      });

      setTransactions(allTransactions);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
    setLoading(false);
  };

  const filteredTransactions = useMemo(() => {
    let filtered = transactions;

    // Tab filter
    if (activeTab !== 'all') {
      filtered = filtered.filter((t) => t.type === activeTab);
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((t) => t.status === statusFilter);
    }

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.transactionId?.toLowerCase().includes(searchLower) ||
          t.userId?.toLowerCase().includes(searchLower) ||
          t.traderId?.toLowerCase().includes(searchLower) ||
          t.upiId?.toLowerCase().includes(searchLower) ||
          t.utrId?.toLowerCase().includes(searchLower) ||
          t.amount?.toString().includes(search)
      );
    }

    // Date filter
    if (dateFrom) {
      const fromTime = new Date(dateFrom).getTime();
      filtered = filtered.filter((t) => {
        const txnTime = (t.requestedAt?.seconds || t.requestTime?.seconds || 0) * 1000;
        return txnTime >= fromTime;
      });
    }

    if (dateTo) {
      const toTime = new Date(dateTo).getTime() + 86399999;
      filtered = filtered.filter((t) => {
        const txnTime = (t.requestedAt?.seconds || t.requestTime?.seconds || 0) * 1000;
        return txnTime <= toTime;
      });
    }

    return filtered;
  }, [transactions, activeTab, statusFilter, search, dateFrom, dateTo]);

  const exportToCSV = () => {
    const headers = ['ID', 'Type', 'Amount', 'Status', 'User ID', 'Trader ID', 'Date'];
    const rows = filteredTransactions.map((t) => [
      t.transactionId || t.id,
      t.type,
      t.amount,
      t.status,
      t.userId || 'N/A',
      t.traderId || 'N/A',
      new Date((t.requestedAt?.seconds || t.requestTime?.seconds || 0) * 1000).toLocaleString(),
    ]);

    const csv =
      headers.join(',') +
      '\n' +
      rows.map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-${Date.now()}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const stats = useMemo(() => {
    const total = filteredTransactions.length;
    const completed = filteredTransactions.filter((t) => t.status === 'completed').length;
    const pending = filteredTransactions.filter((t) => t.status === 'pending').length;
    const totalAmount = filteredTransactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    
    return { total, completed, pending, totalAmount };
  }, [filteredTransactions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">Loading transactions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">All Transactions</h1>
          <p className="text-slate-600 mt-1">Monitor and manage all platform transactions</p>
        </div>
        <button
          onClick={exportToCSV}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors shadow-sm"
        >
          <Download className="w-5 h-5" />
          Export CSV
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
          <p className="text-sm text-slate-500 mb-1">Total Transactions</p>
          <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
          <p className="text-sm text-slate-500 mb-1">Completed</p>
          <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
          <p className="text-sm text-slate-500 mb-1">Pending</p>
          <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
          <p className="text-sm text-slate-500 mb-1">Total Volume</p>
          <p className="text-2xl font-bold text-purple-600">₹{stats.totalAmount.toLocaleString()}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-3">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-6 py-2 rounded-xl font-semibold transition-all ${
              activeTab === tab.key
                ? 'bg-purple-600 text-white shadow-lg'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 flex items-center gap-3">
            <Search className="w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by ID, user, amount..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 outline-none text-slate-900 placeholder-slate-400"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Filter className="w-5 h-5" />
            Filters
          </button>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              >
                <option value="all">All Status</option>
                <option value="completed">Completed</option>
                <option value="pending">Pending</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">From Date</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">To Date</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
          </div>
        )}
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Transaction ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  User ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {filteredTransactions.length > 0 ? (
                filteredTransactions.map((transaction) => (
                  <tr key={transaction.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-mono text-slate-900">
                        {transaction.transactionId || transaction.id.slice(-8)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 text-sm font-medium ${
                        transaction.type === 'payin' ? 'text-green-600' : 'text-blue-600'
                      }`}>
                        {transaction.type === 'payin' ? (
                          <TrendingUp className="w-4 h-4" />
                        ) : (
                          <TrendingDown className="w-4 h-4" />
                        )}
                        {transaction.type === 'payin' ? 'Payin' : 'Payout'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-semibold text-slate-900">
                        ₹{transaction.amount?.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        STATUS_COLORS[transaction.status]
                      }`}>
                        {transaction.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-slate-900 font-mono">
                        {transaction.userId?.slice(-10) || 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {new Date(
                        (transaction.requestedAt?.seconds || transaction.requestTime?.seconds || 0) * 1000
                      ).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => setSelectedTransaction(transaction)}
                        className="text-purple-600 hover:text-purple-900 font-medium"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-slate-500">
                    No transactions found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transaction Detail Modal */}
      {selectedTransaction && (
        <TransactionModal
          transaction={selectedTransaction}
          onClose={() => setSelectedTransaction(null)}
        />
      )}
    </div>
  );
};

export default AdminTransactions;