import React, { useEffect, useState } from 'react';
import { 
  collection, 
  query, 
  getDocs, 
  where, 
  Timestamp,
  orderBy,
  limit 
} from 'firebase/firestore';
import { db } from '../../../../firebase';
import {
  TrendingUp,
  TrendingDown,
  Users,
  Building2,
  CreditCard,
  Wallet,
  AlertCircle,
  Activity,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';

// Reusable Stat Card Component
const StatCard = ({ title, value, change, icon: Icon, trend, color = 'blue' }) => {
  const colorClasses = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    purple: 'from-purple-500 to-purple-600',
    orange: 'from-orange-500 to-orange-600',
    red: 'from-red-500 to-red-600',
    indigo: 'from-indigo-500 to-indigo-600',
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm hover:shadow-lg transition-all duration-300 p-6 border border-slate-100">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-600 mb-1">{title}</p>
          <h3 className="text-3xl font-bold text-slate-900 mb-2">{value}</h3>
          {change !== undefined && (
            <div className={`flex items-center gap-1 text-sm font-medium ${
              trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-slate-500'
            }`}>
              {trend === 'up' ? (
                <ArrowUpRight className="w-4 h-4" />
              ) : trend === 'down' ? (
                <ArrowDownRight className="w-4 h-4" />
              ) : null}
              <span>{change}</span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-xl bg-gradient-to-br ${colorClasses[color]} shadow-lg`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );
};

// Recent Activity Item
const ActivityItem = ({ type, user, amount, time, status }) => {
  const typeConfig = {
    payin: { icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
    payout: { icon: TrendingDown, color: 'text-blue-600', bg: 'bg-blue-50' },
    dispute: { icon: AlertCircle, color: 'text-orange-600', bg: 'bg-orange-50' },
  };

  const config = typeConfig[type] || typeConfig.payin;
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-4 py-3 px-4 hover:bg-slate-50 rounded-lg transition-colors">
      <div className={`p-2 rounded-lg ${config.bg}`}>
        <Icon className={`w-5 h-5 ${config.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 truncate">{user}</p>
        <p className="text-xs text-slate-500">{time}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold text-slate-900">₹{amount.toLocaleString()}</p>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          status === 'completed' ? 'bg-green-100 text-green-700' :
          status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
          'bg-red-100 text-red-700'
        }`}>
          {status}
        </span>
      </div>
    </div>
  );
};

const AdminDashboard = () => {
  const [stats, setStats] = useState({
    totalTraders: 0,
    totalMerchants: 0,
    todayPayins: 0,
    todayPayouts: 0,
    pendingDisputes: 0,
    totalRevenue: 0,
    activeUsers: 0,
    successRate: 0,
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // Get today's date range
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStart = Timestamp.fromDate(today);

      // Fetch counts
      const [tradersSnap, merchantsSnap, payinsSnap, payoutsSnap, disputesSnap] = await Promise.all([
        getDocs(collection(db, 'trader')),
        getDocs(collection(db, 'merchant')),
        getDocs(query(
          collection(db, 'payin'),
          where('requestedAt', '>=', todayStart)
        )),
        getDocs(query(
          collection(db, 'payouts'),
          where('requestTime', '>=', todayStart)
        )),
        getDocs(query(
          collection(db, 'disputes'),
          where('status', '==', 'pending')
        )),
      ]);

      // Calculate totals
      let todayPayinsTotal = 0;
      let todayPayoutsTotal = 0;
      let totalRevenue = 0;
      let completedCount = 0;

      payinsSnap.forEach(doc => {
        const data = doc.data();
        todayPayinsTotal += Number(data.amount || 0);
        totalRevenue += Number(data.commission || 0);
        if (data.status === 'completed') completedCount++;
      });

      payoutsSnap.forEach(doc => {
        todayPayoutsTotal += Number(doc.data().amount || 0);
      });

      const successRate = payinsSnap.size > 0 
        ? Math.round((completedCount / payinsSnap.size) * 100) 
        : 0;

      setStats({
        totalTraders: tradersSnap.size,
        totalMerchants: merchantsSnap.size,
        todayPayins: todayPayinsTotal,
        todayPayouts: todayPayoutsTotal,
        pendingDisputes: disputesSnap.size,
        totalRevenue,
        activeUsers: tradersSnap.size + merchantsSnap.size,
        successRate,
      });

      // Fetch recent activity
      const recentPayins = await getDocs(
        query(
          collection(db, 'payin'),
          orderBy('requestedAt', 'desc'),
          limit(10)
        )
      );

      const activities = [];
      recentPayins.forEach(doc => {
        const data = doc.data();
        activities.push({
          type: 'payin',
          user: data.userId || 'Unknown',
          amount: Number(data.amount || 0),
          time: data.requestedAt?.toDate().toLocaleString() || 'N/A',
          status: data.status || 'pending',
        });
      });

      setRecentActivity(activities);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-600 mt-1">Welcome back! Here's what's happening today.</p>
        </div>
        <button 
          onClick={fetchDashboardData}
          className="px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors shadow-sm flex items-center gap-2"
        >
          <Activity className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Traders"
          value={stats.totalTraders}
          icon={Users}
          color="blue"
        />
        <StatCard
          title="Total Merchants"
          value={stats.totalMerchants}
          icon={Building2}
          color="purple"
        />
        <StatCard
          title="Today's Payins"
          value={`₹${stats.todayPayins.toLocaleString()}`}
          change="+12.5%"
          trend="up"
          icon={TrendingUp}
          color="green"
        />
        <StatCard
          title="Today's Payouts"
          value={`₹${stats.todayPayouts.toLocaleString()}`}
          change="-3.2%"
          trend="down"
          icon={TrendingDown}
          color="orange"
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Pending Disputes"
          value={stats.pendingDisputes}
          icon={AlertCircle}
          color="red"
        />
        <StatCard
          title="Total Revenue"
          value={`₹${stats.totalRevenue.toLocaleString()}`}
          change="+8.1%"
          trend="up"
          icon={DollarSign}
          color="indigo"
        />
        <StatCard
          title="Success Rate"
          value={`${stats.successRate}%`}
          icon={Activity}
          color="green"
        />
        <StatCard
          title="Active Users"
          value={stats.activeUsers}
          icon={Users}
          color="blue"
        />
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900">Recent Activity</h2>
          <button className="text-sm text-purple-600 hover:text-purple-700 font-medium">
            View All
          </button>
        </div>
        <div className="space-y-1">
          {recentActivity.length > 0 ? (
            recentActivity.map((activity, index) => (
              <ActivityItem key={index} {...activity} />
            ))
          ) : (
            <p className="text-center text-slate-500 py-8">No recent activity</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;