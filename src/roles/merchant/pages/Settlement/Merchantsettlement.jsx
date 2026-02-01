import React, { useState, useEffect } from 'react';
import { db } from '../../../../firebase';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  onSnapshot,
  orderBy
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import {
  DollarSign,
  TrendingDown,
  TrendingUp,
  Send,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  Download,
  Eye,
  Wallet,
  Ban,
  Info
} from 'lucide-react';
import {
  validateTRCAddress,
  canWithdraw,
  formatUSDT,
  formatINR,
  getBalanceStatus,
  parseBalanceData,
  convertToUSDT
} from './settlementUtils';

export default function MerchantSettlement() {
  const [merchantData, setMerchantData] = useState(null);
  const [withdrawalRequests, setWithdrawalRequests] = useState([]);
  const [balanceHistory, setBalanceHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawForm, setWithdrawForm] = useState({
    amount: '',
    trcAddress: ''
  });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) return;

    // Real-time listener for merchant data (FIXED: Now using onSnapshot)
    setupMerchantListener(user.uid);
    setupWithdrawalListener(user.uid);
    setupBalanceHistoryListener(user.uid);

    // Cleanup listeners on unmount
    return () => {
      // Listeners auto-cleanup
    };
  }, []);

  // FIXED: Real-time merchant data listener
  const setupMerchantListener = (uid) => {
    const q = query(collection(db, 'merchant'), where('uid', '==', uid));
    
    onSnapshot(q, 
      (snapshot) => {
        if (!snapshot.empty) {
          const data = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
          setMerchantData(data);
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching merchant data:', error);
        setLoading(false);
      }
    );
  };

  // FIXED: Added error handler
  const setupWithdrawalListener = (uid) => {
    // FIXED: Removed orderBy to avoid index requirement, will sort in frontend
    const q = query(
      collection(db, 'withdrawalRequests'),
      where('merchantId', '==', uid)
    );

    onSnapshot(q, 
      (snapshot) => {
        const requests = [];
        snapshot.forEach((doc) => {
          requests.push({ id: doc.id, ...doc.data() });
        });
        
        // Sort by requestedAt in frontend
        requests.sort((a, b) => {
          const dateA = a.requestedAt?.toDate() || new Date(0);
          const dateB = b.requestedAt?.toDate() || new Date(0);
          return dateB - dateA; // Descending
        });
        
        setWithdrawalRequests(requests);
      },
      (error) => {
        console.error('Error fetching withdrawal requests:', error);
      }
    );
  };

  // FIXED: Added error handler
  const setupBalanceHistoryListener = (uid) => {
    // FIXED: Removed orderBy to avoid index requirement, will sort in frontend
    const q = query(
      collection(db, 'balanceTransactions'),
      where('merchantId', '==', uid)
    );

    onSnapshot(q, 
      (snapshot) => {
        const history = [];
        snapshot.forEach((doc) => {
          history.push({ id: doc.id, ...doc.data() });
        });
        
        // Sort by createdAt in frontend
        history.sort((a, b) => {
          const dateA = a.createdAt?.toDate() || new Date(0);
          const dateB = b.createdAt?.toDate() || new Date(0);
          return dateB - dateA; // Descending
        });
        
        setBalanceHistory(history);
      },
      (error) => {
        console.error('Error fetching balance history:', error);
      }
    );
  };

  // IMPROVED: Better validation with balance locking
  const validateWithdrawalForm = () => {
    const errors = {};
    const amount = Number(withdrawForm.amount);
    
    // Calculate available balance (FIXED: Account for pending withdrawals)
    const pendingWithdrawals = withdrawalRequests.filter(r => r.status === 'pending');
    const totalPendingAmount = pendingWithdrawals.reduce((sum, r) => sum + r.amount, 0);
    const availableBalance = (merchantData?.currentBalance || 0) - totalPendingAmount;

    // Check if merchant already has pending withdrawal
    if (pendingWithdrawals.length > 0) {
      errors.general = `You have ${pendingWithdrawals.length} pending withdrawal(s) totaling ${formatUSDT(totalPendingAmount)} USDT. Please wait for approval or cancel existing requests.`;
    }

    // Amount validation
    if (!withdrawForm.amount || amount <= 0) {
      errors.amount = 'Please enter a valid amount';
    } else if (amount < 10) {
      errors.amount = 'Minimum withdrawal is 10 USDT';
    } else if (amount > availableBalance) {
      errors.amount = `Insufficient available balance. Available: ${formatUSDT(availableBalance)} USDT (${formatUSDT(totalPendingAmount)} USDT pending)`;
    } else if (amount > 10000) {
      errors.amount = 'Maximum withdrawal is 10,000 USDT per request';
    } else if (amount > (merchantData?.currentBalance || 0)) {
      errors.amount = 'Amount exceeds total balance';
    }

    // TRC Address validation
    const trcError = validateTRCAddress(withdrawForm.trcAddress);
    if (trcError) {
      errors.trcAddress = trcError;
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Withdrawal request submission
  const handleWithdrawalRequest = async () => {
    if (!validateWithdrawalForm()) return;

    // Confirmation dialog
    const amount = Number(withdrawForm.amount);
    const confirmMessage = `Confirm Withdrawal Request:
    
Amount: ${formatUSDT(amount)} USDT
TRC-20 Address: ${withdrawForm.trcAddress}

⚠️ Important:
• Double-check your TRC-20 address
• Withdrawals are processed manually (1-24 hours)
• You cannot modify the request once submitted
• You can cancel if still pending

Proceed with withdrawal request?`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setSubmitting(true);
    try {
      const auth = getAuth();
      const user = auth.currentUser;

      await addDoc(collection(db, 'withdrawalRequests'), {
        merchantId: user.uid,
        merchantName: merchantData.businessName || merchantData.name || merchantData.email,
        amount: amount,
        trcAddress: withdrawForm.trcAddress,
        balanceBefore: merchantData.currentBalance,
        balanceAfter: merchantData.currentBalance - amount,
        status: 'pending',
        cancellable: true, // NEW: Can be cancelled while pending
        requestedAt: serverTimestamp(),
        
        // Additional metadata
        requestedFrom: 'merchant_portal',
        ipAddress: null, // You can add IP tracking if needed
        userAgent: navigator.userAgent
      });

      alert('✅ Withdrawal request submitted successfully!\n\nYour request is pending admin approval.\nYou will be notified once processed.');
      setShowWithdrawModal(false);
      setWithdrawForm({ amount: '', trcAddress: '' });
      setFormErrors({});
    } catch (error) {
      console.error('Error submitting withdrawal:', error);
      alert('❌ Failed to submit withdrawal request: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  // NEW: Cancel withdrawal request
  const handleCancelWithdrawal = async (requestId) => {
    if (!window.confirm('Are you sure you want to cancel this withdrawal request?')) {
      return;
    }

    setCancelling(requestId);
    try {
      await updateDoc(doc(db, 'withdrawalRequests', requestId), {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
        cancelledBy: 'merchant',
        cancellable: false
      });

      alert('✅ Withdrawal request cancelled successfully!');
    } catch (error) {
      console.error('Error cancelling withdrawal:', error);
      alert('❌ Failed to cancel withdrawal request: ' + error.message);
    } finally {
      setCancelling(null);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Loading settlement data...</p>
        </div>
      </div>
    );
  }

  if (!merchantData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <p className="text-slate-800 font-semibold text-xl">Merchant account not found</p>
          <p className="text-slate-600 mt-2">Please contact support</p>
        </div>
      </div>
    );
  }

  const balanceData = parseBalanceData(merchantData);
  const balanceStatus = getBalanceStatus(balanceData.currentBalance);
  const pendingWithdrawals = withdrawalRequests.filter(r => r.status === 'pending');
  const totalPendingAmount = pendingWithdrawals.reduce((sum, r) => sum + r.amount, 0);
  const availableBalance = balanceData.currentBalance - totalPendingAmount;

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-purple-500 to-blue-600 rounded-2xl shadow-lg">
              <Wallet className="w-8 h-8 text-white" />
            </div>
            Settlement & Balance
          </h1>
          <p className="text-slate-600 mt-2 font-medium text-lg">
            Manage your USDT balance and withdrawals
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-semibold shadow-md"
        >
          <RefreshCw className="w-5 h-5" />
          Refresh
        </button>
      </div>

      {/* Current Balance Card - IMPROVED */}
      <div className={`bg-gradient-to-br ${
        balanceStatus.status === 'healthy' ? 'from-green-500 to-emerald-600' :
        balanceStatus.status === 'warning' ? 'from-yellow-500 to-orange-600' :
        'from-red-500 to-red-600'
      } rounded-3xl p-8 text-white shadow-2xl`}>
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-white/80 text-sm font-semibold mb-2">Total Balance</p>
            <h2 className="text-5xl font-extrabold">{formatUSDT(balanceData.currentBalance)} USDT</h2>
            <p className="text-white/70 mt-2">≈ {formatINR(balanceData.currentBalance * 80)}</p>
            
            {/* NEW: Show pending withdrawals */}
            {totalPendingAmount > 0 && (
              <div className="mt-4 bg-white/20 rounded-lg p-3">
                <p className="text-sm font-semibold mb-1">Balance Breakdown:</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Total Balance:</span>
                    <span className="font-bold">{formatUSDT(balanceData.currentBalance)} USDT</span>
                  </div>
                  <div className="flex justify-between text-red-200">
                    <span>Pending Withdrawals:</span>
                    <span className="font-bold">-{formatUSDT(totalPendingAmount)} USDT</span>
                  </div>
                  <div className="border-t border-white/30 pt-1 flex justify-between font-bold">
                    <span>Available:</span>
                    <span>{formatUSDT(availableBalance)} USDT</span>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className={`px-4 py-2 rounded-xl ${
            balanceStatus.status === 'healthy' ? 'bg-white/20' :
            balanceStatus.status === 'warning' ? 'bg-white/20' :
            'bg-white/30'
          }`}>
            <p className="text-sm font-bold">{balanceStatus.message}</p>
          </div>
        </div>

        {balanceStatus.status !== 'healthy' && (
          <div className="bg-white/20 rounded-xl p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">Low Balance Alert</p>
              <p className="text-white/90 text-sm mt-1">
                Your balance is running low. Consider adding funds to continue processing payments.
              </p>
            </div>
          </div>
        )}

        <div className="flex gap-4">
          <button
            onClick={() => setShowWithdrawModal(true)}
            disabled={availableBalance < 10 || pendingWithdrawals.length > 0}
            className="flex-1 bg-white text-slate-900 px-6 py-4 rounded-xl hover:bg-white/90 transition-colors font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Send className="w-5 h-5" />
            Withdraw USDT
          </button>
        </div>
        
        {pendingWithdrawals.length > 0 && (
          <p className="mt-3 text-center text-sm text-white/80">
            ⚠️ You have {pendingWithdrawals.length} pending withdrawal(s). Wait for approval or cancel to request new withdrawal.
          </p>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Initial Credit"
          value={`${formatUSDT(balanceData.initialCredit)} USDT`}
          icon={<DollarSign className="w-6 h-6" />}
          color="blue"
        />
        <StatCard
          label="Total Commission Paid"
          value={`${formatUSDT(balanceData.totalCommissionUSDT)} USDT`}
          icon={<TrendingDown className="w-6 h-6" />}
          color="red"
        />
        <StatCard
          label="Total Withdrawn"
          value={`${formatUSDT(balanceData.totalWithdrawn)} USDT`}
          icon={<TrendingUp className="w-6 h-6" />}
          color="green"
        />
        <StatCard
          label="Pending Withdrawals"
          value={`${formatUSDT(totalPendingAmount)} USDT`}
          icon={<Clock className="w-6 h-6" />}
          color="yellow"
        />
      </div>

      {/* Commission Summary */}
      <div className="bg-white rounded-2xl p-6 border-2 border-slate-200 shadow-md">
        <h3 className="text-lg font-bold text-slate-900 mb-4">Commission Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-sm text-slate-600 mb-2">Payin Commission ({balanceData.payinRate}%)</p>
            <div className="bg-red-50 rounded-xl p-4 border border-red-200">
              <p className="text-2xl font-bold text-red-700">
                {formatINR(balanceData.totalPayins * balanceData.payinRate / 100)}
              </p>
              <p className="text-sm text-red-600 mt-1">
                On {formatINR(balanceData.totalPayins)} payins
              </p>
            </div>
          </div>
          <div>
            <p className="text-sm text-slate-600 mb-2">Payout Commission ({balanceData.payoutRate}%)</p>
            <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
              <p className="text-2xl font-bold text-orange-700">
                {formatINR(balanceData.totalPayouts * balanceData.payoutRate / 100)}
              </p>
              <p className="text-sm text-orange-600 mt-1">
                On {formatINR(balanceData.totalPayouts)} payouts
              </p>
            </div>
          </div>
        </div>
        <div className="mt-6 p-4 bg-purple-50 rounded-xl border border-purple-200">
          <div className="flex justify-between items-center">
            <span className="text-sm font-bold text-purple-700">Total Commission Paid:</span>
            <span className="text-xl font-extrabold text-purple-700">
              {formatINR(balanceData.totalCommissionINR)} 
              <span className="text-sm ml-2">({formatUSDT(balanceData.totalCommissionUSDT)} USDT)</span>
            </span>
          </div>
        </div>
      </div>

      {/* Withdrawal Requests - IMPROVED with Cancel Button */}
      <div className="bg-white rounded-2xl p-6 border-2 border-slate-200 shadow-md">
        <h3 className="text-lg font-bold text-slate-900 mb-4">Withdrawal Requests</h3>
        
        {withdrawalRequests.length === 0 ? (
          <div className="text-center py-8">
            <Send className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600">No withdrawal requests yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="text-left py-3 px-3 font-bold text-slate-700">Date</th>
                  <th className="text-left py-3 px-3 font-bold text-slate-700">Amount</th>
                  <th className="text-left py-3 px-3 font-bold text-slate-700">TRC Address</th>
                  <th className="text-left py-3 px-3 font-bold text-slate-700">Status</th>
                  <th className="text-left py-3 px-3 font-bold text-slate-700">TX Hash</th>
                  <th className="text-left py-3 px-3 font-bold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {withdrawalRequests.map((request) => (
                  <tr key={request.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-3">
                      {request.requestedAt?.toDate().toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </td>
                    <td className="py-3 px-3 font-bold">
                      {formatUSDT(request.amount)} USDT
                    </td>
                    <td className="py-3 px-3">
                      <code className="text-xs">{request.trcAddress?.slice(0, 10)}...{request.trcAddress?.slice(-6)}</code>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        request.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                        request.status === 'completed' ? 'bg-green-100 text-green-700' :
                        request.status === 'cancelled' ? 'bg-gray-100 text-gray-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {request.status?.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {request.txHash ? (
                        <a
                          href={`https://tronscan.org/#/transaction/${request.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-700 flex items-center gap-1"
                        >
                          <Eye className="w-4 h-4" />
                          View
                        </a>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      {/* NEW: Cancel button */}
                      {request.status === 'pending' && request.cancellable !== false && (
                        <button
                          onClick={() => handleCancelWithdrawal(request.id)}
                          disabled={cancelling === request.id}
                          className="flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-xs font-semibold disabled:opacity-50"
                        >
                          {cancelling === request.id ? (
                            <>
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              Cancelling...
                            </>
                          ) : (
                            <>
                              <Ban className="w-3 h-3" />
                              Cancel
                            </>
                          )}
                        </button>
                      )}
                      {request.status === 'cancelled' && (
                        <span className="text-xs text-slate-500">
                          Cancelled {request.cancelledAt?.toDate().toLocaleDateString()}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Balance History */}
      <div className="bg-white rounded-2xl p-6 border-2 border-slate-200 shadow-md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">Balance Transaction History</h3>
          <button
            onClick={() => {/* Export CSV */}}
            className="flex items-center gap-2 px-4 py-2 border-2 border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-sm font-semibold"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>

        {balanceHistory.length === 0 ? (
          <div className="text-center py-8">
            <Clock className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600">No transaction history yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="text-left py-3 px-3 font-bold text-slate-700">Date</th>
                  <th className="text-left py-3 px-3 font-bold text-slate-700">Type</th>
                  <th className="text-left py-3 px-3 font-bold text-slate-700">Change</th>
                  <th className="text-left py-3 px-3 font-bold text-slate-700">Balance</th>
                  <th className="text-left py-3 px-3 font-bold text-slate-700">Description</th>
                </tr>
              </thead>
              <tbody>
                {balanceHistory.slice(0, 20).map((tx) => (
                  <tr key={tx.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-3">
                      {tx.createdAt?.toDate().toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short'
                      })}
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-1 bg-slate-100 rounded-lg text-xs font-semibold">
                        {tx.type?.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`font-bold ${tx.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {tx.change >= 0 ? '+' : ''}{formatUSDT(tx.change)} USDT
                      </span>
                    </td>
                    <td className="py-3 px-3 font-bold">
                      {formatUSDT(tx.balanceAfter)} USDT
                    </td>
                    <td className="py-3 px-3 text-slate-600">
                      {tx.description || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Withdrawal Modal - IMPROVED */}
      {showWithdrawModal && (
        <WithdrawalModal
          balance={balanceData.currentBalance}
          availableBalance={availableBalance}
          pendingAmount={totalPendingAmount}
          form={withdrawForm}
          setForm={setWithdrawForm}
          errors={formErrors}
          submitting={submitting}
          onSubmit={handleWithdrawalRequest}
          onClose={() => {
            setShowWithdrawModal(false);
            setWithdrawForm({ amount: '', trcAddress: '' });
            setFormErrors({});
          }}
        />
      )}
    </div>
  );
}

// Stat Card Component
function StatCard({ label, value, icon, color }) {
  const colors = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    red: 'from-red-500 to-red-600',
    yellow: 'from-yellow-500 to-orange-600',
    purple: 'from-purple-500 to-purple-600'
  };

  return (
    <div className="bg-white rounded-xl p-5 border-2 border-slate-200 shadow-sm">
      <div className={`w-12 h-12 bg-gradient-to-br ${colors[color]} rounded-xl flex items-center justify-center text-white mb-3`}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-slate-900 mb-1">{value}</p>
      <p className="text-sm text-slate-600 font-medium">{label}</p>
    </div>
  );
}

// Withdrawal Modal Component - IMPROVED
function WithdrawalModal({ balance, availableBalance, pendingAmount, form, setForm, errors, submitting, onSubmit, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-6 border-b border-slate-200">
          <h3 className="text-xl font-bold text-slate-900">Withdraw USDT</h3>
          <div className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Total Balance:</span>
              <span className="font-bold">{formatUSDT(balance)} USDT</span>
            </div>
            {pendingAmount > 0 && (
              <div className="flex justify-between text-red-600">
                <span>Pending:</span>
                <span className="font-bold">-{formatUSDT(pendingAmount)} USDT</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-1">
              <span className="text-slate-900 font-semibold">Available:</span>
              <span className="font-bold text-green-600">{formatUSDT(availableBalance)} USDT</span>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* General error message */}
          {errors.general && (
            <div className="p-3 bg-red-50 rounded-xl border border-red-200 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{errors.general}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              Amount (USDT) *
            </label>
            <input
              type="number"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="Enter amount"
              min="10"
              max={availableBalance}
              step="0.01"
              className={`w-full px-4 py-3 border-2 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent font-bold text-lg ${
                errors.amount ? 'border-red-300' : 'border-slate-300'
              }`}
            />
            {errors.amount && (
              <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {errors.amount}
              </p>
            )}
            <p className="mt-2 text-xs text-slate-500">Minimum: 10 USDT • Maximum: {formatUSDT(availableBalance)} USDT</p>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              TRC-20 Address *
            </label>
            <input
              type="text"
              value={form.trcAddress}
              onChange={(e) => setForm({ ...form, trcAddress: e.target.value })}
              placeholder="TXYZabc123..."
              className={`w-full px-4 py-3 border-2 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm ${
                errors.trcAddress ? 'border-red-300' : 'border-slate-300'
              }`}
            />
            {errors.trcAddress && (
              <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {errors.trcAddress}
              </p>
            )}
            <p className="mt-2 text-xs text-slate-500">Your TRC-20 USDT wallet address</p>
          </div>

          <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
            <p className="text-sm text-amber-900 font-semibold mb-1">Important Notice:</p>
            <ul className="text-xs text-amber-800 space-y-1">
              <li>• Double-check your TRC-20 address</li>
              <li>• Withdrawals are processed manually by admin</li>
              <li>• Processing time: 1-24 hours</li>
              <li>• You can cancel the request while it's pending</li>
              <li>• Maximum 1 pending withdrawal at a time</li>
            </ul>
          </div>
        </div>

        <div className="p-6 border-t border-slate-200 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 border-2 border-slate-300 rounded-xl hover:bg-slate-50 transition-colors font-bold"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={submitting || errors.general}
            className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                Request Withdrawal
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}