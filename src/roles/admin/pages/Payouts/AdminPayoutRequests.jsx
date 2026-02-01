import React, { useState, useEffect } from 'react';
import { db } from '../../../../firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  getDocs
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  X,
  Eye,
  RefreshCw,
  Trash2,
  RotateCcw,
  DollarSign,
  TrendingDown,
  Users,
  Loader
} from 'lucide-react';
import {
  getPayoutsPendingOverOneHour,
  getCancelledPayouts,
  removePayoutByAdmin,
  reassignPayoutToPool
} from '../../../../utils/Payoutassignmenthelper';

export default function AdminPayoutManagement() {
  const [activeTab, setActiveTab] = useState('waiting'); // 'waiting' | 'assigned' | 'overdue' | 'cancelled'
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  
  // Requests in waiting list
  const [waitingRequests, setWaitingRequests] = useState([]);
  
  // Payouts data
  const [allPayouts, setAllPayouts] = useState([]);
  const [overduePayouts, setOverduePayouts] = useState([]);
  const [cancelledPayouts, setCancelledPayouts] = useState([]);

  const auth = getAuth();
  const adminId = auth.currentUser?.uid;

  useEffect(() => {
    loadAllData();

    // Real-time listeners
    const unsubRequests = setupRequestsListener();
    const unsubPayouts = setupPayoutsListener();

    // Refresh overdue and cancelled every 30 seconds
    const interval = setInterval(() => {
      loadOverduePayouts();
      loadCancelledPayouts();
    }, 30000);

    return () => {
      unsubRequests();
      unsubPayouts();
      clearInterval(interval);
    };
  }, []);

  const setupRequestsListener = () => {
    const requestsQuery = query(
      collection(db, 'payoutRequest'),
      where('inWaitingList', '==', true),
      orderBy('requestedAt', 'asc')
    );

    return onSnapshot(requestsQuery, async (snapshot) => {
      const requestsData = [];
      
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        
        let traderData = null;
        if (data.traderId) {
          try {
            const traderQuery = query(
              collection(db, 'trader'),
              where('uid', '==', data.traderId)
            );
            const traderSnap = await getDocs(traderQuery);
            if (!traderSnap.empty) {
              traderData = traderSnap.docs[0].data();
            }
          } catch (err) {
            console.error('Error fetching trader:', err);
          }
        }

        requestsData.push({
          id: docSnap.id,
          ...data,
          trader: traderData,
        });
      }

      setWaitingRequests(requestsData);
      setLoading(false);
    });
  };

  const setupPayoutsListener = () => {
    const payoutsQuery = query(
      collection(db, 'payouts'),
      where('status', '==', 'assigned'),
      orderBy('assignedAt', 'asc')
    );

    return onSnapshot(payoutsQuery, (snapshot) => {
      const payouts = [];
      snapshot.forEach(doc => {
        payouts.push({ id: doc.id, ...doc.data() });
      });
      setAllPayouts(payouts);
    });
  };

  const loadAllData = async () => {
    setLoading(true);
    await Promise.all([
      loadOverduePayouts(),
      loadCancelledPayouts()
    ]);
    setLoading(false);
  };

  const loadOverduePayouts = async () => {
    try {
      const payouts = await getPayoutsPendingOverOneHour();
      setOverduePayouts(payouts);
    } catch (error) {
      console.error('Error loading overdue:', error);
    }
  };

  const loadCancelledPayouts = async () => {
    try {
      const payouts = await getCancelledPayouts();
      setCancelledPayouts(payouts);
    } catch (error) {
      console.error('Error loading cancelled:', error);
    }
  };

  const handleRemovePayout = async (payoutId, amount) => {
    if (!window.confirm(
      `⚠️ Permanently remove?\n\n` +
      `Amount: ₹${amount.toLocaleString()}\n\n` +
      `This CANNOT be undone.`
    )) {
      return;
    }

    setProcessing(true);

    try {
      await removePayoutByAdmin(payoutId, adminId);
      alert('✅ Payout removed');
      loadAllData();
    } catch (error) {
      alert('❌ Error: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleReassignPayout = async (payoutId, amount) => {
    if (!window.confirm(
      `Reassign to pool?\n\n` +
      `Amount: ₹${amount.toLocaleString()}\n\n` +
      `Will trigger waiting list processing.`
    )) {
      return;
    }

    setProcessing(true);

    try {
      await reassignPayoutToPool(payoutId);
      alert('✅ Returned to pool! Waiting list will be processed.');
      loadAllData();
    } catch (error) {
      alert('❌ Error: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-purple-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  const stats = {
    waitingRequests: waitingRequests.length,
    totalWaitingAmount: waitingRequests.reduce((sum, r) => sum + (r.remainingAmount || 0), 0),
    allAssigned: allPayouts.length,
    overdue: overduePayouts.length,
    cancelled: cancelledPayouts.length,
    totalAssignedAmount: allPayouts.reduce((sum, p) => sum + (p.amount || 0), 0),
    totalOverdueAmount: overduePayouts.reduce((sum, p) => sum + (p.amount || 0), 0),
    totalCancelledAmount: cancelledPayouts.reduce((sum, p) => sum + (p.amount || 0), 0)
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-purple-500 to-blue-600 rounded-2xl">
              <TrendingDown className="w-8 h-8 text-white" />
            </div>
            Payout Monitoring
          </h1>
          <p className="text-slate-600 mt-1">Monitor waiting list, assigned, and problematic payouts</p>
        </div>
        <button
          onClick={loadAllData}
          className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-semibold"
        >
          <RefreshCw className="w-5 h-5" />
          Refresh All
        </button>
      </div>

      {/* Info Banner */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200 rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <CheckCircle className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
          <div className="text-sm text-blue-900">
            <p className="font-bold mb-1">ℹ️ Auto-Assignment System Active</p>
            <p>
              No admin approval needed! Payouts are auto-assigned immediately when traders request. 
              Your role is to monitor and handle issues only.
            </p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white">
          <p className="text-blue-100 text-xs mb-1">Waiting List</p>
          <p className="text-3xl font-bold">{stats.waitingRequests}</p>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 text-white">
          <p className="text-purple-100 text-xs mb-1">Waiting ₹</p>
          <p className="text-xl font-bold">₹{(stats.totalWaitingAmount / 1000).toFixed(0)}k</p>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 text-white">
          <p className="text-green-100 text-xs mb-1">Assigned</p>
          <p className="text-3xl font-bold">{stats.allAssigned}</p>
        </div>
        <div className="bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl p-4 text-white">
          <p className="text-teal-100 text-xs mb-1">Assigned ₹</p>
          <p className="text-xl font-bold">₹{(stats.totalAssignedAmount / 1000).toFixed(0)}k</p>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-4 text-white">
          <p className="text-orange-100 text-xs mb-1">Overdue</p>
          <p className="text-3xl font-bold">{stats.overdue}</p>
        </div>
        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-4 text-white">
          <p className="text-red-100 text-xs mb-1">Cancelled</p>
          <p className="text-3xl font-bold">{stats.cancelled}</p>
        </div>
        <div className="bg-gradient-to-br from-pink-500 to-pink-600 rounded-xl p-4 text-white">
          <p className="text-pink-100 text-xs mb-1">Issues ₹</p>
          <p className="text-xl font-bold">₹{((stats.totalOverdueAmount + stats.totalCancelledAmount) / 1000).toFixed(0)}k</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={() => setActiveTab('waiting')}
          className={`px-6 py-3 rounded-xl font-semibold transition-all flex items-center gap-2 ${
            activeTab === 'waiting'
              ? 'bg-blue-600 text-white shadow-lg'
              : 'bg-white text-slate-700 border-2 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Loader className="w-5 h-5" />
          Waiting List ({stats.waitingRequests})
        </button>
        <button
          onClick={() => setActiveTab('assigned')}
          className={`px-6 py-3 rounded-xl font-semibold transition-all flex items-center gap-2 ${
            activeTab === 'assigned'
              ? 'bg-green-600 text-white shadow-lg'
              : 'bg-white text-slate-700 border-2 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <CheckCircle className="w-5 h-5" />
          Assigned ({stats.allAssigned})
        </button>
        <button
          onClick={() => setActiveTab('overdue')}
          className={`px-6 py-3 rounded-xl font-semibold transition-all flex items-center gap-2 ${
            activeTab === 'overdue'
              ? 'bg-orange-600 text-white shadow-lg'
              : 'bg-white text-slate-700 border-2 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Clock className="w-5 h-5" />
          Overdue ({stats.overdue})
        </button>
        <button
          onClick={() => setActiveTab('cancelled')}
          className={`px-6 py-3 rounded-xl font-semibold transition-all flex items-center gap-2 ${
            activeTab === 'cancelled'
              ? 'bg-red-600 text-white shadow-lg'
              : 'bg-white text-slate-700 border-2 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <XCircle className="w-5 h-5" />
          Cancelled ({stats.cancelled})
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'waiting' && (
        <WaitingListTab
          requests={waitingRequests}
          onViewDetails={setSelectedItem}
        />
      )}

      {activeTab === 'assigned' && (
        <AssignedPayoutsTab
          payouts={allPayouts}
          onRemove={handleRemovePayout}
          onReassign={handleReassignPayout}
          onViewDetails={setSelectedItem}
          processing={processing}
        />
      )}

      {activeTab === 'overdue' && (
        <OverduePayoutsTab
          payouts={overduePayouts}
          onRemove={handleRemovePayout}
          onReassign={handleReassignPayout}
          onViewDetails={setSelectedItem}
          processing={processing}
        />
      )}

      {activeTab === 'cancelled' && (
        <CancelledPayoutsTab
          payouts={cancelledPayouts}
          onRemove={handleRemovePayout}
          onReassign={handleReassignPayout}
          onViewDetails={setSelectedItem}
          processing={processing}
        />
      )}

      {/* Details Modal */}
      {selectedItem && (
        <DetailsModal
          item={selectedItem}
          type={activeTab === 'waiting' ? 'request' : 'payout'}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  );
}

// Waiting List Tab
function WaitingListTab({ requests, onViewDetails }) {
  if (requests.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-md border-2 border-slate-200 p-12 text-center">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-slate-900 mb-2">No Waiting Requests</h3>
        <p className="text-slate-600">All requests have been fully assigned!</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <Loader className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1 animate-spin" />
          <div className="text-sm text-blue-900">
            <p className="font-bold mb-1">Waiting List Info</p>
            <p>
              These traders are waiting for payouts to become available. 
              They will auto-receive payouts when merchants create new ones or traders cancel.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {requests.map((request) => (
          <WaitingRequestCard
            key={request.id}
            request={request}
            onViewDetails={onViewDetails}
          />
        ))}
      </div>
    </div>
  );
}

// Waiting Request Card
function WaitingRequestCard({ request, onViewDetails }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border-2 border-blue-200 p-6 hover:shadow-md transition-all">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <Loader className="w-5 h-5 text-blue-600 animate-spin" />
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
              {request.status === 'waiting' ? 'FULL WAITING' : 'PARTIAL'}
            </span>
          </div>
          <p className="text-sm font-semibold text-slate-900 mb-1">{request.trader?.name || request.traderId}</p>
        </div>
        <button onClick={() => onViewDetails(request)} className="p-2 hover:bg-slate-100 rounded-lg">
          <Eye className="w-5 h-5 text-slate-600" />
        </button>
      </div>

      <div className="space-y-2 mb-4 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">Requested:</span>
          <span className="font-bold text-slate-900">₹{request.requestedAmount.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Assigned:</span>
          <span className="font-semibold text-green-600">₹{(request.assignedAmount || 0).toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Waiting:</span>
          <span className="font-bold text-orange-600">₹{request.remainingAmount.toLocaleString()}</span>
        </div>
        <div className="flex justify-between pt-2 border-t border-slate-200">
          <span className="text-slate-500">Since:</span>
          <span className="font-medium text-slate-700 text-xs">
            {request.requestedAt?.toDate().toLocaleString()}
          </span>
        </div>
      </div>

      {request.assignedPayouts && request.assignedPayouts.length > 0 && (
        <div className="p-2 bg-green-50 rounded-lg">
          <p className="text-xs text-green-900 font-semibold">
            ✅ {request.assignedPayouts.length} payouts assigned already
          </p>
        </div>
      )}
    </div>
  );
}

// Assigned Payouts Tab
function AssignedPayoutsTab({ payouts, onRemove, onReassign, onViewDetails, processing }) {
  if (payouts.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-md border-2 border-slate-200 p-12 text-center">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <p className="text-slate-600 text-lg">No assigned payouts</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-md border-2 border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 border-b-2 border-slate-200">
            <tr>
              <th className="text-left py-4 px-4 text-sm font-bold text-slate-700">ID</th>
              <th className="text-left py-4 px-4 text-sm font-bold text-slate-700">Amount</th>
              <th className="text-left py-4 px-4 text-sm font-bold text-slate-700">Trader</th>
              <th className="text-left py-4 px-4 text-sm font-bold text-slate-700">Time</th>
              <th className="text-left py-4 px-4 text-sm font-bold text-slate-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {payouts.map((payout) => (
              <PayoutRow
                key={payout.id}
                payout={payout}
                onRemove={onRemove}
                onViewDetails={onViewDetails}
                processing={processing}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Overdue Tab
function OverduePayoutsTab({ payouts, onRemove, onReassign, onViewDetails, processing }) {
  if (payouts.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-md border-2 border-slate-200 p-12 text-center">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <p className="text-slate-600 text-lg">No overdue payouts! All on time.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-orange-50 border-2 border-orange-200 rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <AlertCircle className="w-6 h-6 text-orange-600 flex-shrink-0 mt-1" />
          <div className="text-sm text-orange-900">
            <p className="font-bold mb-1">⚠️ Attention Required</p>
            <p>Pending &gt;1 hour. Contact trader or reassign.</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-md border-2 border-orange-300 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-orange-50 border-b-2 border-orange-200">
              <tr>
                <th className="text-left py-4 px-4 text-sm font-bold text-orange-900">ID</th>
                <th className="text-left py-4 px-4 text-sm font-bold text-orange-900">Amount</th>
                <th className="text-left py-4 px-4 text-sm font-bold text-orange-900">Trader</th>
                <th className="text-left py-4 px-4 text-sm font-bold text-orange-900">Pending</th>
                <th className="text-left py-4 px-4 text-sm font-bold text-orange-900">Actions</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((payout) => (
                <OverdueRow
                  key={payout.id}
                  payout={payout}
                  onRemove={onRemove}
                  onReassign={onReassign}
                  onViewDetails={onViewDetails}
                  processing={processing}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Cancelled Tab
function CancelledPayoutsTab({ payouts, onRemove, onReassign, onViewDetails, processing }) {
  if (payouts.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-md border-2 border-slate-200 p-12 text-center">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <p className="text-slate-600 text-lg">No cancelled payouts</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <XCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
          <div className="text-sm text-red-900">
            <p className="font-bold mb-1">Trader Cancelled</p>
            <p>Review reason and decide to reassign or remove.</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-md border-2 border-red-300 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-red-50 border-b-2 border-red-200">
              <tr>
                <th className="text-left py-4 px-4 text-sm font-bold text-red-900">ID</th>
                <th className="text-left py-4 px-4 text-sm font-bold text-red-900">Amount</th>
                <th className="text-left py-4 px-4 text-sm font-bold text-red-900">Trader</th>
                <th className="text-left py-4 px-4 text-sm font-bold text-red-900">Reason</th>
                <th className="text-left py-4 px-4 text-sm font-bold text-red-900">Actions</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((payout) => (
                <CancelledRow
                  key={payout.id}
                  payout={payout}
                  onRemove={onRemove}
                  onReassign={onReassign}
                  onViewDetails={onViewDetails}
                  processing={processing}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Table Row Components
function PayoutRow({ payout, onRemove, onViewDetails, processing }) {
  const timeElapsed = payout.assignedAt 
    ? Math.floor((Date.now() - payout.assignedAt.toDate().getTime()) / (1000 * 60))
    : 0;

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50">
      <td className="py-4 px-4">
        <span className="font-mono text-sm">{payout.id.substring(0, 10)}...</span>
      </td>
      <td className="py-4 px-4">
        <span className="font-bold">₹{(payout.amount || 0).toLocaleString()}</span>
      </td>
      <td className="py-4 px-4">
        <span className="font-mono text-xs text-slate-600">{payout.traderId?.substring(0, 12)}...</span>
      </td>
      <td className="py-4 px-4">
        <span className={`text-sm font-semibold ${timeElapsed > 60 ? 'text-red-600' : 'text-slate-600'}`}>
          {timeElapsed}m
        </span>
      </td>
      <td className="py-4 px-4">
        <div className="flex gap-2">
          <button onClick={() => onViewDetails(payout)} className="p-2 hover:bg-blue-100 rounded-lg">
            <Eye className="w-4 h-4 text-blue-600" />
          </button>
          <button
            onClick={() => onRemove(payout.id, payout.amount)}
            disabled={processing}
            className="p-2 hover:bg-red-100 rounded-lg disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4 text-red-600" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function OverdueRow({ payout, onRemove, onReassign, onViewDetails, processing }) {
  return (
    <tr className="border-b border-orange-100 hover:bg-orange-50">
      <td className="py-4 px-4">
        <span className="font-mono text-sm">{payout.id.substring(0, 10)}...</span>
      </td>
      <td className="py-4 px-4">
        <span className="font-bold">₹{(payout.amount || 0).toLocaleString()}</span>
      </td>
      <td className="py-4 px-4">
        <span className="font-mono text-xs">{payout.traderId?.substring(0, 12)}...</span>
      </td>
      <td className="py-4 px-4">
        <span className="text-sm font-bold text-red-600">
          {Math.floor(payout.pendingDuration / 60)}h {payout.pendingDuration % 60}m
        </span>
      </td>
      <td className="py-4 px-4">
        <div className="flex gap-2">
          <button onClick={() => onViewDetails(payout)} className="p-2 hover:bg-blue-100 rounded-lg">
            <Eye className="w-4 h-4 text-blue-600" />
          </button>
          <button
            onClick={() => onReassign(payout.id, payout.amount)}
            disabled={processing}
            className="p-2 hover:bg-purple-100 rounded-lg disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4 text-purple-600" />
          </button>
          <button
            onClick={() => onRemove(payout.id, payout.amount)}
            disabled={processing}
            className="p-2 hover:bg-red-100 rounded-lg disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4 text-red-600" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function CancelledRow({ payout, onRemove, onReassign, onViewDetails, processing }) {
  return (
    <tr className="border-b border-red-100 hover:bg-red-50">
      <td className="py-4 px-4">
        <span className="font-mono text-sm">{payout.id.substring(0, 10)}...</span>
      </td>
      <td className="py-4 px-4">
        <span className="font-bold">₹{(payout.amount || 0).toLocaleString()}</span>
      </td>
      <td className="py-4 px-4">
        <span className="font-mono text-xs">{payout.traderId?.substring(0, 12)}...</span>
      </td>
      <td className="py-4 px-4">
        <span className="text-sm text-red-700 max-w-[200px] truncate block">
          {payout.cancelReason || 'No reason'}
        </span>
      </td>
      <td className="py-4 px-4">
        <div className="flex gap-2">
          <button onClick={() => onViewDetails(payout)} className="p-2 hover:bg-blue-100 rounded-lg">
            <Eye className="w-4 h-4 text-blue-600" />
          </button>
          <button
            onClick={() => onReassign(payout.id, payout.amount)}
            disabled={processing}
            className="p-2 hover:bg-purple-100 rounded-lg disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4 text-purple-600" />
          </button>
          <button
            onClick={() => onRemove(payout.id, payout.amount)}
            disabled={processing}
            className="p-2 hover:bg-red-100 rounded-lg disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4 text-red-600" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// Details Modal
function DetailsModal({ item, type, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h3 className="text-xl font-bold">
            {type === 'request' ? 'Waiting Request Details' : 'Payout Details'}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl p-6 text-center">
            <p className="text-sm text-slate-600 mb-1">Amount</p>
            <p className="text-4xl font-bold">₹{(item.amount || item.requestedAmount || 0).toLocaleString()}</p>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            {type === 'request' ? (
              <>
                <DetailBox label="Trader" value={item.trader?.name || item.traderId} />
                <DetailBox label="Status" value={item.status?.toUpperCase().replace('_', ' ')} badge />
                <DetailBox label="Requested" value={`₹${item.requestedAmount.toLocaleString()}`} />
                <DetailBox label="Assigned" value={`₹${(item.assignedAmount || 0).toLocaleString()}`} />
                <DetailBox label="Waiting" value={`₹${item.remainingAmount.toLocaleString()}`} />
                <DetailBox label="Payouts" value={`${item.assignedPayouts?.length || 0} assigned`} />
              </>
            ) : (
              <>
                <DetailBox label="ID" value={item.id.substring(0, 20) + '...'} />
                <DetailBox label="User" value={item.userId || '-'} />
                <DetailBox label="Trader" value={item.traderId?.substring(0, 20) || '-'} mono />
                <DetailBox label="Status" value={item.status?.toUpperCase().replace('_', ' ')} badge />
                <DetailBox label="Account" value={item.accountNumber || item.upiId || '-'} mono />
                <DetailBox label="IFSC" value={item.ifscCode || '-'} />
              </>
            )}
          </div>

          {item.cancelReason && (
            <div className="bg-red-50 rounded-xl p-4">
              <p className="text-sm font-bold text-red-900 mb-1">Cancel Reason:</p>
              <p className="text-sm text-red-800">{item.cancelReason}</p>
            </div>
          )}
        </div>

        <div className="p-6 border-t">
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-slate-900 text-white rounded-xl hover:bg-slate-800 font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailBox({ label, value, mono, badge }) {
  if (badge) {
    const colors = {
      'FULLY ASSIGNED': 'bg-green-100 text-green-700',
      'PARTIALLY ASSIGNED': 'bg-yellow-100 text-yellow-700',
      'WAITING': 'bg-blue-100 text-blue-700',
      'ASSIGNED': 'bg-blue-100 text-blue-700',
      'COMPLETED': 'bg-green-100 text-green-700',
      'CANCELLED BY TRADER': 'bg-red-100 text-red-700',
    };
    const color = colors[value] || 'bg-gray-100 text-gray-700';
    
    return (
      <div className="bg-slate-50 rounded-lg p-3">
        <p className="text-xs text-slate-500 mb-1">{label}</p>
        <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${color}`}>
          {value}
        </span>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 rounded-lg p-3">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-sm font-semibold ${mono ? 'font-mono' : ''} truncate`}>
        {value}
      </p>
    </div>
  );
}