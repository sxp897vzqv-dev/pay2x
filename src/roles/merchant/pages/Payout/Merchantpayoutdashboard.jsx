import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../../../firebase';
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  onSnapshot
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import {
  Code,
  FileSpreadsheet,
  PenTool,
  DollarSign,
  RefreshCw,
  CreditCard,
  Building2,
  AlertCircle
} from 'lucide-react';
import APITab from './APITab';
import ExcelTab from './ExcelTab';
import ManualTab from './ManualTab';

const MerchantPayoutDashboard = () => {
  const [activeTab, setActiveTab] = useState('excel');
  const [merchantId, setMerchantId] = useState('');
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (user) {
      setMerchantId(user.uid);
      
      // Listen to payouts
      const q = query(
        collection(db, 'payouts'),
        where('createdBy', '==', user.uid),
        orderBy('requestTime', 'desc')
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const data = [];
        snapshot.forEach((doc) => {
          data.push({ id: doc.id, ...doc.data() });
        });
        setPayouts(data);
        setLoading(false);
      });

      return () => unsubscribe();
    }
  }, [refreshKey]);

  const stats = useMemo(() => {
    const pending = payouts.filter(p => p.status === 'pending').length;
    const completed = payouts.filter(p => p.status === 'completed').length;
    const totalAmount = payouts.reduce((sum, p) => sum + (p.amount || 0), 0);
    const pendingAmount = payouts
      .filter(p => p.status === 'pending')
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    return { pending, completed, totalAmount, pendingAmount };
  }, [payouts]);

  const tabs = [
    { key: 'api', label: 'API Integration', icon: Code },
    { key: 'excel', label: 'Excel Upload', icon: FileSpreadsheet },
    { key: 'manual', label: 'Manual Entry', icon: PenTool }
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-purple-500 to-blue-600 rounded-2xl shadow-lg">
              <DollarSign className="w-8 h-8 text-white" />
            </div>
            Payout Dashboard
          </h1>
          <p className="text-slate-600 mt-2 font-medium text-lg">
            Create and manage merchant payouts
          </p>
        </div>
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-semibold shadow-md"
        >
          <RefreshCw className="w-5 h-5" />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-yellow-400 to-orange-500 rounded-2xl p-6 text-white shadow-lg">
          <p className="text-yellow-100 text-sm mb-1 font-semibold">Pending Payouts</p>
          <p className="text-4xl font-extrabold">{stats.pending}</p>
        </div>
        <div className="bg-gradient-to-br from-green-400 to-emerald-500 rounded-2xl p-6 text-white shadow-lg">
          <p className="text-green-100 text-sm mb-1 font-semibold">Completed</p>
          <p className="text-4xl font-extrabold">{stats.completed}</p>
        </div>
        <div className="bg-gradient-to-br from-purple-400 to-purple-600 rounded-2xl p-6 text-white shadow-lg">
          <p className="text-purple-100 text-sm mb-1 font-semibold">Total Amount</p>
          <p className="text-2xl font-extrabold">Rs.{(stats.totalAmount / 1000).toFixed(1)}k</p>
        </div>
        <div className="bg-gradient-to-br from-blue-400 to-blue-600 rounded-2xl p-6 text-white shadow-lg">
          <p className="text-blue-100 text-sm mb-1 font-semibold">Pending Amount</p>
          <p className="text-2xl font-extrabold">Rs.{(stats.pendingAmount / 1000).toFixed(1)}k</p>
        </div>
      </div>

      {/* Method Tabs */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-3 px-6 py-4 rounded-2xl font-bold shadow-md transition-all whitespace-nowrap ${
                activeTab === tab.key
                  ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-xl scale-105'
                  : 'bg-white text-slate-700 border-2 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-5 h-5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'api' && <APITab merchantId={merchantId} />}
        {activeTab === 'excel' && (
          <ExcelTab
            merchantId={merchantId}
            onPayoutsCreated={() => setRefreshKey(k => k + 1)}
          />
        )}
        {activeTab === 'manual' && (
          <ManualTab
            merchantId={merchantId}
            onPayoutsCreated={() => setRefreshKey(k => k + 1)}
          />
        )}
      </div>

      {/* Recent Payouts */}
      <div className="bg-white rounded-2xl p-6 border-2 border-slate-200">
        <h3 className="text-lg font-bold text-slate-900 mb-4">Recent Payouts</h3>
        
        {loading ? (
          <div className="text-center py-8">
            <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
            <p className="text-slate-600">Loading...</p>
          </div>
        ) : payouts.length === 0 ? (
          <div className="text-center py-8">
            <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-600">No payouts yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="text-left py-3 px-3 font-bold text-slate-700">User ID</th>
                  <th className="text-left py-3 px-3 font-bold text-slate-700">Payment Method</th>
                  <th className="text-left py-3 px-3 font-bold text-slate-700">Amount</th>
                  <th className="text-left py-3 px-3 font-bold text-slate-700">Status</th>
                  <th className="text-left py-3 px-3 font-bold text-slate-700">Created</th>
                  <th className="text-left py-3 px-3 font-bold text-slate-700">Method</th>
                </tr>
              </thead>
              <tbody>
                {payouts.slice(0, 10).map((payout) => (
                  <tr key={payout.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-3 font-mono text-xs">{payout.userId}</td>
                    <td className="py-3 px-3">
                      {payout.paymentMethod === 'upi' ? (
                        <span className="flex items-center gap-1 text-purple-600">
                          <CreditCard className="w-4 h-4" />
                          {payout.upiId}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-blue-600">
                          <Building2 className="w-4 h-4" />
                          {payout.accountNumber}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 font-bold">Rs.{payout.amount?.toLocaleString()}</td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          payout.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-700'
                            : payout.status === 'completed'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {payout.status?.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-xs">
                      {payout.requestTime?.toDate().toLocaleDateString()}
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-1 bg-slate-100 rounded-lg text-xs font-semibold">
                        {payout.creationMethod?.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default MerchantPayoutDashboard;