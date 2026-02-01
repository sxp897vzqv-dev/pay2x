import React, { useState, useEffect } from 'react';
import { db, auth } from '../../../../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import {
  Search, Filter, Download, Calendar, DollarSign, TrendingUp, TrendingDown,
  CheckCircle, Clock, XCircle, Eye, RefreshCw, ChevronLeft, ChevronRight,
  ArrowUpCircle, ArrowDownCircle, Receipt, FileText, Activity
} from 'lucide-react';

export default function MerchantTransactions() {
  const [activeTab, setActiveTab] = useState('payin'); // 'payin' | 'payout'
  const [payinTransactions, setPayinTransactions] = useState([]);
  const [payoutTransactions, setPayoutTransactions] = useState([]);
  const [filteredTransactions, setFilteredTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  
  // Filters
  const [filters, setFilters] = useState({
    status: 'all',
    searchQuery: '',
    dateRange: 'all', // 'today' | 'yesterday' | 'week' | 'month' | 'custom' | 'all'
    dateFrom: '',
    dateTo: '',
    minAmount: '',
    maxAmount: ''
  });
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(15);

  // Stats by date
  const [statsFilter, setStatsFilter] = useState('today'); // 'today' | 'week' | 'month' | 'all'

  useEffect(() => {
    const merchantId = auth.currentUser?.uid;
    if (!merchantId) {
      setLoading(false);
      return;
    }

    // FIXED: Real-time listeners with correct collection names
    const unsubscribePayin = setupPayinListener(merchantId);
    const unsubscribePayout = setupPayoutListener(merchantId);

    return () => {
      unsubscribePayin();
      unsubscribePayout();
    };
  }, []);

  useEffect(() => {
    applyFilters();
  }, [payinTransactions, payoutTransactions, filters, activeTab]);

  // FIXED: Real-time payin listener
  const setupPayinListener = (merchantId) => {
    const q = query(
      collection(db, 'payin'),
      where('merchantId', '==', merchantId)
    );

    return onSnapshot(q, 
      (snapshot) => {
        const payins = [];
        snapshot.forEach((doc) => {
          payins.push({ id: doc.id, type: 'payin', ...doc.data() });
        });
        
        // Sort by date in frontend
        payins.sort((a, b) => {
          const dateA = a.requestedAt?.toDate?.() || new Date(0);
          const dateB = b.requestedAt?.toDate?.() || new Date(0);
          return dateB - dateA;
        });
        
        setPayinTransactions(payins);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching payin transactions:', error);
        setLoading(false);
      }
    );
  };

  // FIXED: Real-time payout listener with CORRECT collection name
  const setupPayoutListener = (merchantId) => {
    // FIXED: Changed from 'payout' to 'payouts' to match Payout Dashboard
    const q = query(
      collection(db, 'payouts'),
      where('createdBy', '==', merchantId) // FIXED: Using 'createdBy' as per Payout Dashboard
    );

    return onSnapshot(q, 
      (snapshot) => {
        const payouts = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          payouts.push({ 
            id: doc.id, 
            type: 'payout',
            // Map fields to match transaction structure
            merchantId: data.createdBy, // FIXED: Map createdBy to merchantId
            requestedAt: data.requestTime, // FIXED: Map requestTime to requestedAt
            ...data 
          });
        });
        
        // Sort by date in frontend
        payouts.sort((a, b) => {
          const dateA = a.requestTime?.toDate?.() || new Date(0);
          const dateB = b.requestTime?.toDate?.() || new Date(0);
          return dateB - dateA;
        });
        
        setPayoutTransactions(payouts);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching payout transactions:', error);
        setLoading(false);
      }
    );
  };

  const applyFilters = () => {
    const transactions = activeTab === 'payin' ? payinTransactions : payoutTransactions;
    let filtered = [...transactions];
    
    // Status filter
    if (filters.status !== 'all') {
      filtered = filtered.filter(txn => txn.status === filters.status);
    }
    
    // Search filter
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      filtered = filtered.filter(txn => 
        txn.id.toLowerCase().includes(query) ||
        (txn.utrId && txn.utrId.toLowerCase().includes(query)) ||
        (txn.userId && txn.userId.toLowerCase().includes(query)) ||
        (txn.orderId && txn.orderId.toLowerCase().includes(query)) ||
        (txn.upiId && txn.upiId.toLowerCase().includes(query)) ||
        (txn.accountNumber && txn.accountNumber.toLowerCase().includes(query))
      );
    }
    
    // Date range filter - FIXED: Handle both requestedAt and requestTime
    if (filters.dateRange !== 'all') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      filtered = filtered.filter(txn => {
        // FIXED: Support both field names
        const txnDate = (txn.requestedAt || txn.requestTime)?.toDate?.() || new Date(0);
        
        switch (filters.dateRange) {
          case 'today':
            return txnDate >= today;
          case 'yesterday':
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            return txnDate >= yesterday && txnDate < today;
          case 'week':
            const weekAgo = new Date(today);
            weekAgo.setDate(weekAgo.getDate() - 7);
            return txnDate >= weekAgo;
          case 'month':
            const monthAgo = new Date(today);
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            return txnDate >= monthAgo;
          case 'custom':
            let valid = true;
            if (filters.dateFrom) {
              valid = valid && txnDate >= new Date(filters.dateFrom);
            }
            if (filters.dateTo) {
              const toDate = new Date(filters.dateTo);
              toDate.setHours(23, 59, 59, 999);
              valid = valid && txnDate <= toDate;
            }
            return valid;
          default:
            return true;
        }
      });
    }
    
    // Amount filter
    if (filters.minAmount) {
      filtered = filtered.filter(txn => Number(txn.amount) >= Number(filters.minAmount));
    }
    if (filters.maxAmount) {
      filtered = filtered.filter(txn => Number(txn.amount) <= Number(filters.maxAmount));
    }
    
    setFilteredTransactions(filtered);
    setCurrentPage(1);
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({
      status: 'all',
      searchQuery: '',
      dateRange: 'all',
      dateFrom: '',
      dateTo: '',
      minAmount: '',
      maxAmount: ''
    });
  };

  // Calculate stats based on statsFilter - FIXED: Handle both date field names
  const calculateStats = () => {
    const transactions = activeTab === 'payin' ? payinTransactions : payoutTransactions;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    let filtered = [...transactions];
    
    switch (statsFilter) {
      case 'today':
        filtered = filtered.filter(t => {
          const date = (t.requestedAt || t.requestTime)?.toDate?.() || new Date(0);
          return date >= today;
        });
        break;
      case 'week':
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        filtered = filtered.filter(t => {
          const date = (t.requestedAt || t.requestTime)?.toDate?.() || new Date(0);
          return date >= weekAgo;
        });
        break;
      case 'month':
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        filtered = filtered.filter(t => {
          const date = (t.requestedAt || t.requestTime)?.toDate?.() || new Date(0);
          return date >= monthAgo;
        });
        break;
      default:
        // 'all' - no filter
        break;
    }
    
    return {
      total: filtered.length,
      completed: filtered.filter(t => t.status === 'completed').length,
      pending: filtered.filter(t => t.status === 'pending').length,
      rejected: filtered.filter(t => t.status === 'rejected').length,
      totalAmount: filtered
        .filter(t => t.status === 'completed')
        .reduce((sum, t) => sum + Number(t.amount || 0), 0),
      pendingAmount: filtered
        .filter(t => t.status === 'pending')
        .reduce((sum, t) => sum + Number(t.amount || 0), 0)
    };
  };

  const stats = calculateStats();

  const exportToCSV = () => {
    const header = activeTab === 'payin' 
      ? ['Transaction ID', 'Order ID', 'Amount', 'Status', 'UTR', 'UPI ID', 'Date', 'Trader']
      : ['Transaction ID', 'Amount', 'Status', 'Payment Method', 'Account/UPI', 'Date', 'Created By'];
    
    const rows = filteredTransactions.map(txn => 
      activeTab === 'payin'
        ? [
            txn.id,
            txn.orderId || '',
            txn.amount,
            txn.status,
            txn.utrId || '',
            txn.upiId || '',
            (txn.requestedAt || txn.requestTime)?.toDate?.()?.toLocaleString() || '',
            txn.traderId || ''
          ]
        : [
            txn.id,
            txn.amount,
            txn.status,
            txn.paymentMethod || '',
            txn.upiId || txn.accountNumber || '',
            (txn.requestedAt || txn.requestTime)?.toDate?.()?.toLocaleString() || '',
            txn.createdBy || txn.merchantId || ''
          ]
    );
    
    const csv = [header.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTab}_transactions_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Pagination
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredTransactions.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);

  const paginate = (pageNumber) => setCurrentPage(pageNumber);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Loading transactions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl shadow-lg">
              <Activity className="w-8 h-8 text-white" />
            </div>
            Transactions
          </h1>
          <p className="text-slate-600 mt-2 font-medium">View and manage all your payment transactions</p>
        </div>
        <div className="flex gap-2 mt-4 md:mt-0">
          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-semibold shadow-md"
          >
            <Download className="w-5 h-5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Debug Info - Remove after testing */}
      <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4">
        <p className="text-sm font-semibold text-yellow-800">
          Debug: Payin Count: {payinTransactions.length} | Payout Count: {payoutTransactions.length}
        </p>
        {payoutTransactions.length > 0 && (
          <p className="text-xs text-yellow-700 mt-1">
            Latest Payout: {payoutTransactions[0]?.id?.substring(0, 10)}... | Status: {payoutTransactions[0]?.status} | Amount: ₹{payoutTransactions[0]?.amount}
          </p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b-2 border-slate-200">
        <button
          onClick={() => setActiveTab('payin')}
          className={`flex items-center gap-2 px-6 py-3 font-bold transition-all ${
            activeTab === 'payin'
              ? 'text-blue-600 border-b-2 border-blue-600 -mb-0.5'
              : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          <ArrowDownCircle className="w-5 h-5" />
          Payin
          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">
            {payinTransactions.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('payout')}
          className={`flex items-center gap-2 px-6 py-3 font-bold transition-all ${
            activeTab === 'payout'
              ? 'text-green-600 border-b-2 border-green-600 -mb-0.5'
              : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          <ArrowUpCircle className="w-5 h-5" />
          Payout
          <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-bold">
            {payoutTransactions.length}
          </span>
        </button>
      </div>

      {/* Stats Period Filter */}
      <div className="flex items-center justify-between bg-white rounded-xl p-4 border-2 border-slate-200">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-slate-600" />
          <span className="font-semibold text-slate-700">Statistics for:</span>
        </div>
        <div className="flex gap-2">
          {['today', 'week', 'month', 'all'].map((period) => (
            <button
              key={period}
              onClick={() => setStatsFilter(period)}
              className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
                statsFilter === period
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {period.charAt(0).toUpperCase() + period.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          label="Total"
          value={stats.total}
          icon={<Receipt className="w-5 h-5" />}
          color="blue"
          subtitle={`All ${activeTab}s`}
        />
        <StatCard
          label="Completed"
          value={stats.completed}
          icon={<CheckCircle className="w-5 h-5" />}
          color="green"
          subtitle={`${((stats.completed / stats.total) * 100 || 0).toFixed(0)}% success`}
        />
        <StatCard
          label="Pending"
          value={stats.pending}
          icon={<Clock className="w-5 h-5" />}
          color="yellow"
          subtitle={`${((stats.pending / stats.total) * 100 || 0).toFixed(0)}% pending`}
        />
        <StatCard
          label="Rejected"
          value={stats.rejected}
          icon={<XCircle className="w-5 h-5" />}
          color="red"
          subtitle={`${((stats.rejected / stats.total) * 100 || 0).toFixed(0)}% failed`}
        />
        <StatCard
          label="Completed Amount"
          value={`₹${(stats.totalAmount / 1000).toFixed(1)}K`}
          icon={<DollarSign className="w-5 h-5" />}
          color="purple"
          subtitle={`From ${stats.completed} txns`}
        />
        <StatCard
          label="Pending Amount"
          value={`₹${(stats.pendingAmount / 1000).toFixed(1)}K`}
          icon={<TrendingUp className="w-5 h-5" />}
          color="orange"
          subtitle={`In ${stats.pending} txns`}
        />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-md p-6 border-2 border-slate-200">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-slate-600" />
          <h3 className="text-lg font-bold text-slate-800">Filters</h3>
          <span className="text-sm text-slate-500">
            ({filteredTransactions.length} results)
          </span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Status Filter */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              Status
            </label>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="w-full border-2 border-slate-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-semibold"
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          
          {/* Date Range Filter */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              Date Range
            </label>
            <select
              value={filters.dateRange}
              onChange={(e) => handleFilterChange('dateRange', e.target.value)}
              className="w-full border-2 border-slate-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-semibold"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="week">Last 7 Days</option>
              <option value="month">Last 30 Days</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>
          
          {/* Min Amount */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              Min Amount (₹)
            </label>
            <input
              type="number"
              value={filters.minAmount}
              onChange={(e) => handleFilterChange('minAmount', e.target.value)}
              placeholder="0"
              className="w-full border-2 border-slate-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-semibold"
            />
          </div>
          
          {/* Max Amount */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              Max Amount (₹)
            </label>
            <input
              type="number"
              value={filters.maxAmount}
              onChange={(e) => handleFilterChange('maxAmount', e.target.value)}
              placeholder="No limit"
              className="w-full border-2 border-slate-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-semibold"
            />
          </div>
        </div>
        
        {/* Custom Date Range */}
        {filters.dateRange === 'custom' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                From Date
              </label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                To Date
              </label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        )}
        
        {/* Search */}
        <div className="mt-4">
          <label className="block text-sm font-bold text-slate-700 mb-2">
            Search
          </label>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={filters.searchQuery}
              onChange={(e) => handleFilterChange('searchQuery', e.target.value)}
              placeholder={`Search by ID, ${activeTab === 'payin' ? 'UTR, UPI' : 'Account'}, Order ID...`}
              className="w-full border-2 border-slate-300 rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-semibold"
            />
          </div>
        </div>
        
        <div className="mt-4 flex justify-end">
          <button
            onClick={clearFilters}
            className="text-sm text-blue-600 hover:text-blue-700 font-bold flex items-center gap-2"
          >
            <XCircle className="w-4 h-4" />
            Clear All Filters
          </button>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-xl shadow-md overflow-hidden border-2 border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-slate-50 to-slate-100 border-b-2 border-slate-200">
              <tr>
                <th className="text-left py-4 px-4 text-sm font-bold text-slate-700">
                  Transaction ID
                </th>
                {activeTab === 'payin' && (
                  <th className="text-left py-4 px-4 text-sm font-bold text-slate-700">
                    Order ID
                  </th>
                )}
                <th className="text-left py-4 px-4 text-sm font-bold text-slate-700">
                  Amount
                </th>
                <th className="text-left py-4 px-4 text-sm font-bold text-slate-700">
                  Status
                </th>
                {activeTab === 'payin' ? (
                  <>
                    <th className="text-left py-4 px-4 text-sm font-bold text-slate-700">
                      UTR / UPI ID
                    </th>
                  </>
                ) : (
                  <>
                    <th className="text-left py-4 px-4 text-sm font-bold text-slate-700">
                      Account / UPI
                    </th>
                  </>
                )}
                <th className="text-left py-4 px-4 text-sm font-bold text-slate-700">
                  Date & Time
                </th>
                <th className="text-left py-4 px-4 text-sm font-bold text-slate-700">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {currentItems.length > 0 ? (
                currentItems.map((txn) => (
                  <TransactionRow
                    key={txn.id}
                    transaction={txn}
                    type={activeTab}
                    onView={() => setSelectedTransaction(txn)}
                  />
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="text-center py-16 text-slate-500">
                    {filters.searchQuery || filters.status !== 'all' || filters.dateRange !== 'all' ? (
                      <div>
                        <Filter className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                        <p className="text-lg font-semibold mb-2">No transactions found</p>
                        <p className="text-sm mb-4">Try adjusting your filters</p>
                        <button
                          onClick={clearFilters}
                          className="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold"
                        >
                          Clear Filters
                        </button>
                      </div>
                    ) : (
                      <div>
                        <Receipt className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                        <p className="text-lg font-semibold">No {activeTab} transactions yet</p>
                        <p className="text-sm text-slate-400 mt-2">
                          Your {activeTab} transactions will appear here
                        </p>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="border-t-2 border-slate-200 px-6 py-4 bg-slate-50">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-600 font-semibold">
                Showing <span className="text-slate-900">{indexOfFirstItem + 1}</span> to{' '}
                <span className="text-slate-900">{Math.min(indexOfLastItem, filteredTransactions.length)}</span> of{' '}
                <span className="text-slate-900">{filteredTransactions.length}</span> results
              </p>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => paginate(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="p-2 border-2 border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                
                {[...Array(Math.min(totalPages, 5))].map((_, index) => {
                  let page;
                  if (totalPages <= 5) {
                    page = index + 1;
                  } else if (currentPage <= 3) {
                    page = index + 1;
                  } else if (currentPage >= totalPages - 2) {
                    page = totalPages - 4 + index;
                  } else {
                    page = currentPage - 2 + index;
                  }
                  
                  return (
                    <button
                      key={page}
                      onClick={() => paginate(page)}
                      className={`px-4 py-2 rounded-lg font-bold transition-colors ${
                        currentPage === page
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'border-2 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {page}
                    </button>
                  );
                })}
                
                <button
                  onClick={() => paginate(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="p-2 border-2 border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Transaction Details Modal */}
      {selectedTransaction && (
        <TransactionModal
          transaction={selectedTransaction}
          type={activeTab}
          onClose={() => setSelectedTransaction(null)}
        />
      )}
    </div>
  );
}

// Stats Card Component
function StatCard({ label, value, icon, color, subtitle }) {
  const colors = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    red: 'from-red-500 to-red-600',
    yellow: 'from-yellow-500 to-orange-500',
    purple: 'from-purple-500 to-purple-600',
    orange: 'from-orange-500 to-orange-600'
  };

  return (
    <div className="bg-white rounded-xl p-5 border-2 border-slate-200 shadow-sm hover:shadow-md transition-shadow">
      <div className={`w-12 h-12 bg-gradient-to-br ${colors[color]} rounded-xl flex items-center justify-center text-white mb-3 shadow-lg`}>
        {icon}
      </div>
      <p className="text-3xl font-extrabold text-slate-900 mb-1">{value}</p>
      <p className="text-sm font-bold text-slate-700">{label}</p>
      {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
    </div>
  );
}

// Transaction Row Component - FIXED: Handle both date field names
function TransactionRow({ transaction, type, onView }) {
  const getStatusBadge = (status) => {
    const styles = {
      completed: 'bg-green-100 text-green-700 border-green-200',
      pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      rejected: 'bg-red-100 text-red-700 border-red-200'
    };
    
    const icons = {
      completed: <CheckCircle className="w-4 h-4" />,
      pending: <Clock className="w-4 h-4" />,
      rejected: <XCircle className="w-4 h-4" />
    };
    
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border-2 ${styles[status]}`}>
        {icons[status]}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const formatDateTime = (timestamp) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <tr className="border-b border-slate-100 hover:bg-blue-50 transition-colors">
      <td className="py-4 px-4">
        <span className="font-mono text-sm font-bold text-slate-800">
          {transaction.id.substring(0, 10)}...
        </span>
      </td>
      {type === 'payin' && (
        <td className="py-4 px-4">
          <span className="text-sm text-slate-700 font-semibold">
            {transaction.orderId || '-'}
          </span>
        </td>
      )}
      <td className="py-4 px-4">
        <span className="text-sm font-extrabold text-slate-900">
          ₹{(transaction.amount || 0).toLocaleString('en-IN')}
        </span>
      </td>
      <td className="py-4 px-4">
        {getStatusBadge(transaction.status || 'pending')}
      </td>
      <td className="py-4 px-4">
        {type === 'payin' ? (
          <div>
            <p className="font-mono text-xs text-slate-600 font-semibold">{transaction.utrId || '-'}</p>
            <p className="text-xs text-slate-500 mt-0.5">{transaction.upiId || '-'}</p>
          </div>
        ) : (
          <div>
            <p className="font-mono text-xs text-slate-600 font-semibold">
              {transaction.upiId || transaction.accountNumber || '-'}
            </p>
            {transaction.ifscCode && (
              <p className="text-xs text-slate-500 mt-0.5">{transaction.ifscCode}</p>
            )}
          </div>
        )}
      </td>
      <td className="py-4 px-4">
        <span className="text-sm text-slate-600 font-semibold">
          {/* FIXED: Handle both date field names */}
          {formatDateTime(transaction.requestedAt || transaction.requestTime)}
        </span>
      </td>
      <td className="py-4 px-4">
        <button
          onClick={onView}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm font-bold border-2 border-blue-200"
        >
          <Eye className="w-4 h-4" />
          View
        </button>
      </td>
    </tr>
  );
}

// Transaction Details Modal - FIXED: Handle both date field names
function TransactionModal({ transaction, type, onClose }) {
  const formatDateTime = (timestamp) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('en-IN');
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-5 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-extrabold text-white">Transaction Details</h3>
            <p className="text-blue-100 text-sm mt-1">
              {type === 'payin' ? 'Payin' : 'Payout'} Transaction
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <XCircle className="w-6 h-6 text-white" />
          </button>
        </div>
        
        <div className="p-6 space-y-3">
          <DetailRow label="Transaction ID" value={transaction.id} />
          {type === 'payin' && <DetailRow label="Order ID" value={transaction.orderId || '-'} />}
          <DetailRow 
            label="Amount" 
            value={`₹${(transaction.amount || 0).toLocaleString('en-IN')}`} 
            highlight 
          />
          <DetailRow label="Status" value={transaction.status} badge />
          {type === 'payin' ? (
            <>
              <DetailRow label="UTR ID" value={transaction.utrId || '-'} />
              <DetailRow label="UPI ID" value={transaction.upiId || '-'} />
              <DetailRow label="Holder Name" value={transaction.holderName || '-'} />
              <DetailRow label="Trader ID" value={transaction.traderId || '-'} />
            </>
          ) : (
            <>
              <DetailRow label="Payment Method" value={transaction.paymentMethod || '-'} />
              <DetailRow label="UPI ID" value={transaction.upiId || '-'} />
              <DetailRow label="Account Number" value={transaction.accountNumber || '-'} />
              <DetailRow label="IFSC Code" value={transaction.ifscCode || '-'} />
              <DetailRow label="Bank Name" value={transaction.bankName || '-'} />
              <DetailRow label="Account Holder" value={transaction.accountHolderName || '-'} />
              <DetailRow label="Created By" value={transaction.createdBy || transaction.merchantId || '-'} />
            </>
          )}
          <DetailRow label="Customer ID" value={transaction.userId || '-'} />
          {/* FIXED: Handle both date field names */}
          <DetailRow label="Requested At" value={formatDateTime(transaction.requestedAt || transaction.requestTime)} />
          {transaction.completedAt && (
            <DetailRow label="Completed At" value={formatDateTime(transaction.completedAt)} />
          )}
        </div>
        
        <div className="p-6 border-t border-slate-200 bg-slate-50">
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors font-bold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, highlight, badge }) {
  const getStatusBadge = (status) => {
    const styles = {
      completed: 'bg-green-100 text-green-700 border-green-300',
      pending: 'bg-yellow-100 text-yellow-700 border-yellow-300',
      rejected: 'bg-red-100 text-red-700 border-red-300'
    };
    
    return (
      <span className={`px-4 py-2 rounded-lg font-bold text-sm border-2 ${styles[status]}`}>
        {status?.toUpperCase()}
      </span>
    );
  };

  return (
    <div className="flex items-start justify-between py-3 border-b border-slate-100">
      <span className="text-sm font-bold text-slate-600">{label}</span>
      <span className={`text-sm text-right max-w-md break-words ${
        highlight ? 'text-xl font-extrabold text-blue-600' : 'font-semibold text-slate-900'
      }`}>
        {badge ? getStatusBadge(value) : value}
      </span>
    </div>
  );
}