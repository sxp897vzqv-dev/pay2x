import React, { useState, useEffect } from 'react';
import { db, auth } from '../../../../firebase';
import { collection, query, where, onSnapshot, doc, getDoc, Timestamp, orderBy, limit } from 'firebase/firestore';
import {
  TrendingUp, TrendingDown, DollarSign, CreditCard,
  CheckCircle, Clock, XCircle, Download, ArrowRight,
  Users, Activity, Zap, RefreshCw, Wallet, ArrowUpCircle, ArrowDownCircle
} from 'lucide-react';

export default function MerchantDashboard() {
  const [stats, setStats] = useState({
    // Payin stats
    todayPayinRevenue: 0,
    todayPayinTransactions: 0,
    todayPayinCompleted: 0,
    todayPayinPending: 0,
    todayPayinRejected: 0,
    
    // Payout stats
    todayPayoutAmount: 0,
    todayPayoutTransactions: 0,
    todayPayoutCompleted: 0,
    todayPayoutPending: 0,
    todayPayoutRejected: 0,
    
    // Combined stats
    todayNetRevenue: 0,
    todayTotalTransactions: 0,
    overallSuccessRate: 0,
    totalPendingAmount: 0,
    availableBalance: 0,
    totalCustomers: 0,
    avgTransactionValue: 0,
    
    // Historical data
    last7DaysRevenue: [],
    
    // Yesterday comparison
    yesterdayPayinRevenue: 0,
    yesterdayPayoutAmount: 0,
    revenueChangePercent: 0
  });
  
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  useEffect(() => {
    const merchantId = auth.currentUser?.uid;
    if (!merchantId) {
      setLoading(false);
      return;
    }

    // Setup real-time listeners
    const unsubscribes = setupRealtimeListeners(merchantId);

    // Cleanup listeners on unmount
    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, []);

  const setupRealtimeListeners = (merchantId) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = Timestamp.fromDate(today);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayTimestamp = Timestamp.fromDate(yesterday);

    // Real-time listener for today's PAYIN transactions
    const unsubPayinToday = onSnapshot(
      query(
        collection(db, 'payin'),
        where('merchantId', '==', merchantId),
        where('requestedAt', '>=', todayTimestamp)
      ),
      (snapshot) => {
        processPayinData(snapshot, 'today');
      },
      (error) => console.error('Error fetching today payins:', error)
    );

    // Real-time listener for yesterday's PAYIN (for comparison)
    const unsubPayinYesterday = onSnapshot(
      query(
        collection(db, 'payin'),
        where('merchantId', '==', merchantId),
        where('requestedAt', '>=', yesterdayTimestamp),
        where('requestedAt', '<', todayTimestamp)
      ),
      (snapshot) => {
        processPayinData(snapshot, 'yesterday');
      },
      (error) => console.error('Error fetching yesterday payins:', error)
    );

    // Real-time listener for today's PAYOUT transactions
    const unsubPayoutToday = onSnapshot(
      query(
        collection(db, 'payouts'),
        where('createdBy', '==', merchantId),
        where('requestTime', '>=', todayTimestamp)
      ),
      (snapshot) => {
        processPayoutData(snapshot, 'today');
      },
      (error) => console.error('Error fetching today payouts:', error)
    );

    // Real-time listener for yesterday's PAYOUT (for comparison)
    const unsubPayoutYesterday = onSnapshot(
      query(
        collection(db, 'payouts'),
        where('createdBy', '==', merchantId),
        where('requestTime', '>=', yesterdayTimestamp),
        where('requestTime', '<', todayTimestamp)
      ),
      (snapshot) => {
        processPayoutData(snapshot, 'yesterday');
      },
      (error) => console.error('Error fetching yesterday payouts:', error)
    );

    // Real-time listener for recent transactions (combined)
    const unsubRecent = onSnapshot(
      query(
        collection(db, 'payin'),
        where('merchantId', '==', merchantId),
        orderBy('requestedAt', 'desc'),
        limit(10)
      ),
      (snapshot) => {
        const recent = snapshot.docs.map(doc => ({
          id: doc.id,
          type: 'payin',
          ...doc.data()
        }));
        setRecentTransactions(recent);
        setLoading(false);
      },
      (error) => console.error('Error fetching recent transactions:', error)
    );

    // Fetch merchant balance (one-time, then listen for changes)
    const unsubMerchant = onSnapshot(
      doc(db, 'merchant', merchantId),
      (docSnap) => {
        if (docSnap.exists()) {
          const merchantData = docSnap.data();
          setStats(prev => ({
            ...prev,
            availableBalance: Number(merchantData.currentBalance || 0)
          }));
        }
      },
      (error) => console.error('Error fetching merchant data:', error)
    );

    // Fetch 7-day historical data (updates less frequently)
    fetch7DayHistory(merchantId);

    return [
      unsubPayinToday, 
      unsubPayinYesterday, 
      unsubPayoutToday, 
      unsubPayoutYesterday, 
      unsubRecent,
      unsubMerchant
    ];
  };

  const processPayinData = (snapshot, period) => {
    let revenue = 0;
    let completed = 0;
    let pending = 0;
    let rejected = 0;
    const customers = new Set();

    snapshot.forEach(doc => {
      const data = doc.data();
      const status = data.status;
      const amount = Number(data.amount || 0);

      if (status === 'completed') {
        revenue += amount;
        completed++;
        if (data.userId) customers.add(data.userId);
      } else if (status === 'pending') {
        pending++;
      } else if (status === 'rejected') {
        rejected++;
      }
    });

    const total = completed + pending + rejected;

    if (period === 'today') {
      setStats(prev => ({
        ...prev,
        todayPayinRevenue: revenue,
        todayPayinTransactions: total,
        todayPayinCompleted: completed,
        todayPayinPending: pending,
        todayPayinRejected: rejected,
        totalCustomers: customers.size,
        avgTransactionValue: completed > 0 ? revenue / completed : 0
      }));
      calculateCombinedStats();
    } else if (period === 'yesterday') {
      setStats(prev => ({
        ...prev,
        yesterdayPayinRevenue: revenue
      }));
      calculateChangePercent();
    }
    
    setLastUpdate(new Date());
  };

  const processPayoutData = (snapshot, period) => {
    let amount = 0;
    let completed = 0;
    let pending = 0;
    let rejected = 0;

    snapshot.forEach(doc => {
      const data = doc.data();
      const status = data.status;
      const payoutAmount = Number(data.amount || 0);

      if (status === 'completed') {
        amount += payoutAmount;
        completed++;
      } else if (status === 'pending') {
        pending++;
      } else if (status === 'rejected') {
        rejected++;
      }
    });

    const total = completed + pending + rejected;

    if (period === 'today') {
      setStats(prev => ({
        ...prev,
        todayPayoutAmount: amount,
        todayPayoutTransactions: total,
        todayPayoutCompleted: completed,
        todayPayoutPending: pending,
        todayPayoutRejected: rejected
      }));
      calculateCombinedStats();
    } else if (period === 'yesterday') {
      setStats(prev => ({
        ...prev,
        yesterdayPayoutAmount: amount
      }));
      calculateChangePercent();
    }
    
    setLastUpdate(new Date());
  };

  const calculateCombinedStats = () => {
    setStats(prev => {
      const totalCompleted = prev.todayPayinCompleted + prev.todayPayoutCompleted;
      const totalPending = prev.todayPayinPending + prev.todayPayoutPending;
      const totalRejected = prev.todayPayinRejected + prev.todayPayoutRejected;
      const totalTransactions = totalCompleted + totalPending + totalRejected;
      
      const netRevenue = prev.todayPayinRevenue - prev.todayPayoutAmount;
      const successRate = totalTransactions > 0 
        ? ((totalCompleted / totalTransactions) * 100).toFixed(1)
        : 0;
      
      // Calculate total pending amount
      const pendingAmount = 0; // You can calculate this from pending transactions if needed

      return {
        ...prev,
        todayNetRevenue: netRevenue,
        todayTotalTransactions: totalTransactions,
        overallSuccessRate: successRate,
        totalPendingAmount: pendingAmount
      };
    });
  };

  const calculateChangePercent = () => {
    setStats(prev => {
      const todayNet = prev.todayPayinRevenue - prev.todayPayoutAmount;
      const yesterdayNet = prev.yesterdayPayinRevenue - prev.yesterdayPayoutAmount;
      
      const change = yesterdayNet > 0 
        ? (((todayNet - yesterdayNet) / yesterdayNet) * 100).toFixed(1)
        : todayNet > 0 ? 100 : 0;

      return {
        ...prev,
        revenueChangePercent: Number(change)
      };
    });
  };

  const fetch7DayHistory = async (merchantId) => {
    try {
      const last7Days = [];
      
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);
        const dayStart = Timestamp.fromDate(date);
        
        const dayEnd = new Date(date);
        dayEnd.setHours(23, 59, 59, 999);
        const dayEndTimestamp = Timestamp.fromDate(dayEnd);
        
        // Fetch payins for this day
        const payinSnapshot = await new Promise((resolve) => {
          const q = query(
            collection(db, 'payin'),
            where('merchantId', '==', merchantId),
            where('status', '==', 'completed'),
            where('completedAt', '>=', dayStart),
            where('completedAt', '<=', dayEndTimestamp)
          );
          
          const unsub = onSnapshot(q, (snapshot) => {
            unsub(); // Unsubscribe immediately after first result
            resolve(snapshot);
          });
        });
        
        let dayPayinRevenue = 0;
        payinSnapshot.forEach(doc => {
          dayPayinRevenue += Number(doc.data().amount || 0);
        });
        
        // Fetch payouts for this day
        const payoutSnapshot = await new Promise((resolve) => {
          const q = query(
            collection(db, 'payouts'),
            where('createdBy', '==', merchantId),
            where('status', '==', 'completed'),
            where('completedAt', '>=', dayStart),
            where('completedAt', '<=', dayEndTimestamp)
          );
          
          const unsub = onSnapshot(q, (snapshot) => {
            unsub();
            resolve(snapshot);
          });
        });
        
        let dayPayoutAmount = 0;
        payoutSnapshot.forEach(doc => {
          dayPayoutAmount += Number(doc.data().amount || 0);
        });
        
        last7Days.push({
          day: date.toLocaleDateString('en-US', { weekday: 'short' }),
          payinAmount: dayPayinRevenue,
          payoutAmount: dayPayoutAmount,
          netAmount: dayPayinRevenue - dayPayoutAmount
        });
      }
      
      setStats(prev => ({
        ...prev,
        last7DaysRevenue: last7Days
      }));
      
    } catch (error) {
      console.error('Failed to fetch 7-day history:', error);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    const merchantId = auth.currentUser?.uid;
    if (merchantId) {
      await fetch7DayHistory(merchantId);
    }
    setRefreshing(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Dashboard</h1>
          <p className="text-gray-600">Welcome back! Here's your business overview.</p>
          <p className="text-xs text-gray-500 mt-1">
            Last updated: {lastUpdate.toLocaleTimeString('en-IN')} • Live updates enabled ⚡
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="mt-4 md:mt-0 flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Today's Net Revenue"
          value={`₹${stats.todayNetRevenue.toLocaleString('en-IN')}`}
          change={`${stats.revenueChangePercent > 0 ? '+' : ''}${stats.revenueChangePercent}%`}
          trend={stats.revenueChangePercent >= 0 ? 'up' : 'down'}
          icon={<DollarSign className="w-6 h-6" />}
          bgColor="bg-blue-500"
          subtitle={`Payin: ₹${stats.todayPayinRevenue.toLocaleString('en-IN')} | Payout: ₹${stats.todayPayoutAmount.toLocaleString('en-IN')}`}
        />
        
        <StatCard
          title="Total Transactions"
          value={stats.todayTotalTransactions}
          change={`Payin: ${stats.todayPayinTransactions} | Payout: ${stats.todayPayoutTransactions}`}
          trend="neutral"
          icon={<CreditCard className="w-6 h-6" />}
          bgColor="bg-green-500"
        />
        
        <StatCard
          title="Success Rate"
          value={`${stats.overallSuccessRate}%`}
          change={`${stats.todayPayinCompleted + stats.todayPayoutCompleted} completed`}
          trend={stats.overallSuccessRate >= 90 ? 'up' : 'down'}
          icon={<Activity className="w-6 h-6" />}
          bgColor="bg-purple-500"
        />
        
        <StatCard
          title="Available Balance"
          value={`₹${stats.availableBalance.toLocaleString('en-IN')}`}
          icon={<Wallet className="w-6 h-6" />}
          bgColor="bg-orange-500"
        />
      </div>

      {/* Additional Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <InfoCard
          icon={<Users className="w-5 h-5 text-blue-600" />}
          label="Today's Customers"
          value={stats.totalCustomers}
        />
        <InfoCard
          icon={<Zap className="w-5 h-5 text-purple-600" />}
          label="Avg Transaction"
          value={`₹${Math.round(stats.avgTransactionValue).toLocaleString('en-IN')}`}
        />
        <InfoCard
          icon={<ArrowDownCircle className="w-5 h-5 text-green-600" />}
          label="Payin Today"
          value={`₹${stats.todayPayinRevenue.toLocaleString('en-IN')}`}
        />
        <InfoCard
          icon={<ArrowUpCircle className="w-5 h-5 text-red-600" />}
          label="Payout Today"
          value={`₹${stats.todayPayoutAmount.toLocaleString('en-IN')}`}
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Revenue Chart */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-bold text-gray-800">Revenue Trend</h3>
              <p className="text-sm text-gray-500">Last 7 days performance (Net)</p>
            </div>
            <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
              View Details
            </button>
          </div>
          
          <div className="space-y-4">
            {stats.last7DaysRevenue.map((item, index) => {
              const amounts = stats.last7DaysRevenue.map(d => Math.abs(d.netAmount));
              const maxAmount = Math.max(...amounts, 1);
              const percentage = (Math.abs(item.netAmount) / maxAmount) * 100;
              const isPositive = item.netAmount >= 0;
              
              return (
                <div key={index} className="flex items-center gap-3">
                  <span className="text-xs font-medium text-gray-600 w-10">{item.day}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-8 overflow-hidden">
                    <div 
                      className={`h-full flex items-center justify-end pr-3 transition-all duration-500 ${
                        isPositive 
                          ? 'bg-gradient-to-r from-green-500 to-green-600' 
                          : 'bg-gradient-to-r from-red-500 to-red-600'
                      }`}
                      style={{ width: `${percentage}%` }}
                    >
                      {item.netAmount !== 0 && (
                        <span className="text-xs font-semibold text-white">
                          {isPositive ? '+' : ''}₹{(Math.abs(item.netAmount) / 1000).toFixed(0)}k
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Payin</span>
                <p className="font-bold text-green-600">
                  ₹{stats.last7DaysRevenue.reduce((sum, d) => sum + d.payinAmount, 0).toLocaleString('en-IN')}
                </p>
              </div>
              <div>
                <span className="text-gray-600">Payout</span>
                <p className="font-bold text-red-600">
                  ₹{stats.last7DaysRevenue.reduce((sum, d) => sum + d.payoutAmount, 0).toLocaleString('en-IN')}
                </p>
              </div>
              <div>
                <span className="text-gray-600">Net</span>
                <p className="font-bold text-gray-800">
                  ₹{stats.last7DaysRevenue.reduce((sum, d) => sum + d.netAmount, 0).toLocaleString('en-IN')}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Transaction Status */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-bold text-gray-800">Transaction Status</h3>
              <p className="text-sm text-gray-500">Today's breakdown (All Types)</p>
            </div>
          </div>
          
          <div className="space-y-4">
            <StatusRow
              label="Completed"
              count={stats.todayPayinCompleted + stats.todayPayoutCompleted}
              percentage={stats.overallSuccessRate}
              color="bg-green-500"
              icon={<CheckCircle className="w-4 h-4" />}
              subtitle={`Payin: ${stats.todayPayinCompleted} | Payout: ${stats.todayPayoutCompleted}`}
            />
            <StatusRow
              label="Pending"
              count={stats.todayPayinPending + stats.todayPayoutPending}
              percentage={
                stats.todayTotalTransactions > 0
                  ? ((stats.todayPayinPending + stats.todayPayoutPending) / stats.todayTotalTransactions * 100).toFixed(1)
                  : 0
              }
              color="bg-yellow-500"
              icon={<Clock className="w-4 h-4" />}
              subtitle={`Payin: ${stats.todayPayinPending} | Payout: ${stats.todayPayoutPending}`}
            />
            <StatusRow
              label="Rejected"
              count={stats.todayPayinRejected + stats.todayPayoutRejected}
              percentage={
                stats.todayTotalTransactions > 0
                  ? ((stats.todayPayinRejected + stats.todayPayoutRejected) / stats.todayTotalTransactions * 100).toFixed(1)
                  : 0
              }
              color="bg-red-500"
              icon={<XCircle className="w-4 h-4" />}
              subtitle={`Payin: ${stats.todayPayinRejected} | Payout: ${stats.todayPayoutRejected}`}
            />
          </div>
          
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total Transactions</span>
              <span className="font-bold text-gray-800">{stats.todayTotalTransactions}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-xl shadow-md p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-bold text-gray-800">Recent Transactions</h3>
            <p className="text-sm text-gray-500">Latest payment activities (Payin only)</p>
          </div>
          <div className="flex gap-2">
            <button className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
              <Download className="w-4 h-4" />
              Export
            </button>
            <button 
              onClick={() => window.location.href = '/merchant/transactions'}
              className="flex items-center gap-2 px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              View All
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">
                  Transaction ID
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">
                  Type
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">
                  Customer
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">
                  Amount
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">
                  Status
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">
                  Time
                </th>
              </tr>
            </thead>
            <tbody>
              {recentTransactions.length > 0 ? (
                recentTransactions.map((txn) => (
                  <TransactionRow key={txn.id} transaction={txn} />
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="text-center py-8 text-gray-500">
                    No recent transactions
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Stat Card Component
function StatCard({ title, value, change, trend, icon, bgColor, subtitle }) {
  return (
    <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className={`${bgColor} p-3 rounded-lg text-white`}>
          {icon}
        </div>
        {change && trend !== 'neutral' && (
          <div className={`flex items-center gap-1 text-sm font-semibold ${
            trend === 'up' ? 'text-green-600' : 'text-red-600'
          }`}>
            {trend === 'up' ? (
              <TrendingUp className="w-4 h-4" />
            ) : (
              <TrendingDown className="w-4 h-4" />
            )}
            {change}
          </div>
        )}
      </div>
      <h3 className="text-2xl font-bold text-gray-800 mb-1">{value}</h3>
      <p className="text-sm text-gray-500">{title}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
    </div>
  );
}

// Info Card Component
function InfoCard({ icon, label, value }) {
  return (
    <div className="bg-white rounded-lg shadow p-4 flex items-center gap-3">
      <div className="bg-gray-50 p-2 rounded-lg">
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-lg font-bold text-gray-800">{value}</p>
      </div>
    </div>
  );
}

// Status Row Component
function StatusRow({ label, count, percentage, color, icon, subtitle }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`${color} p-1 rounded text-white`}>
            {icon}
          </div>
          <span className="text-sm font-medium text-gray-700">{label}</span>
        </div>
        <span className="text-sm font-bold text-gray-800">{count}</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
        <div 
          className={`h-full ${color} transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
    </div>
  );
}

// Transaction Row Component
function TransactionRow({ transaction }) {
  const getStatusBadge = (status) => {
    const styles = {
      completed: 'bg-green-100 text-green-700',
      pending: 'bg-yellow-100 text-yellow-700',
      rejected: 'bg-red-100 text-red-700'
    };
    
    const icons = {
      completed: <CheckCircle className="w-3 h-3" />,
      pending: <Clock className="w-3 h-3" />,
      rejected: <XCircle className="w-3 h-3" />
    };
    
    return (
      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${styles[status]}`}>
        {icons[status]}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="py-4 px-4">
        <span className="font-mono text-sm font-medium text-gray-800">
          {transaction.id.substring(0, 12)}...
        </span>
      </td>
      <td className="py-4 px-4">
        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold">
          {transaction.type?.toUpperCase() || 'PAYIN'}
        </span>
      </td>
      <td className="py-4 px-4">
        <span className="text-sm text-gray-700">
          {transaction.userId || 'Guest'}
        </span>
      </td>
      <td className="py-4 px-4">
        <span className="text-sm font-semibold text-gray-800">
          ₹{(transaction.amount || 0).toLocaleString('en-IN')}
        </span>
      </td>
      <td className="py-4 px-4">
        {getStatusBadge(transaction.status || 'pending')}
      </td>
      <td className="py-4 px-4">
        <span className="text-sm text-gray-500">
          {formatTime(transaction.requestedAt || transaction.requestTime)}
        </span>
      </td>
    </tr>
  );
}