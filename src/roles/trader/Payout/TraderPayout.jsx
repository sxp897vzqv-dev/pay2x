import React, { useState, useEffect } from 'react';
import { db, storage } from '../../../firebase';
import {
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  runTransaction,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getAuth } from 'firebase/auth';
import {
  DollarSign,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  RefreshCw,
  X,
  CreditCard,
  Building,
  User,
  Hash,
  Upload,
  Send,
  Wallet,
  TrendingDown,
  Loader,
  Zap,
  FileText,
  Calendar
} from 'lucide-react';
import { 
  immediateAutoAssignPayouts,
  completePayoutWithProof,
  cancelPayoutByTrader,
  cancelPayoutRequestByTrader
} from '../../../utils/Payoutassignmenthelper';

export default function TraderPayout() {
  const [workingBalance, setWorkingBalance] = useState(0);
  const [payoutCommission, setPayoutCommission] = useState(1);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('request');
  
  // Request state
  const [requestAmount, setRequestAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeRequest, setActiveRequest] = useState(null);
  
  // Assigned payouts state
  const [assignedPayouts, setAssignedPayouts] = useState([]);
  const [completedPayouts, setCompletedPayouts] = useState([]);
  const [selectedPayout, setSelectedPayout] = useState(null);
  const [processingPayout, setProcessingPayout] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const auth = getAuth();
  const traderId = auth.currentUser?.uid;

  // DERIVED STATE - Based on real-time data, no async needed
  const hasActiveRequest = activeRequest !== null;
  const hasAssignedPayouts = assignedPayouts.length > 0;
  
  // Can create request ONLY if: No active request AND no assigned payouts
  const canCreateRequest = !hasActiveRequest && !hasAssignedPayouts;
  
  // Can cancel request ONLY if: Has active request AND no assigned payouts
  const canCancelRequest = hasActiveRequest && !hasAssignedPayouts;

  useEffect(() => {
    if (!traderId) return;

    // Fetch trader balance and commission
    const fetchTraderData = async () => {
      try {
        const traderQuery = query(
          collection(db, 'trader'),
          where('uid', '==', traderId)
        );
        const traderSnap = await getDocs(traderQuery);
        
        if (!traderSnap.empty) {
          const data = traderSnap.docs[0].data();
          setWorkingBalance(data.workingBalance || 0);
          setPayoutCommission(data.payoutCommission || 1);
        }
      } catch (error) {
        console.error('Error fetching trader data:', error);
      }
    };

    fetchTraderData();

    // Real-time listener for payout requests
    const requestsQuery = query(
      collection(db, 'payoutRequest'),
      where('traderId', '==', traderId)
    );

    const unsubRequests = onSnapshot(requestsQuery, (snapshot) => {
      let active = null;

      snapshot.forEach(doc => {
        const data = { id: doc.id, ...doc.data() };
        
        // Active request: not completed and not cancelled
        if (data.status !== 'completed' && data.status !== 'cancelled') {
          active = data;
        }
      });

      setActiveRequest(active);
      setLoading(false);
    });

    // Real-time listener for assigned payouts
    const assignedQuery = query(
      collection(db, 'payouts'),
      where('traderId', '==', traderId),
      where('status', '==', 'assigned')
    );

    const unsubAssigned = onSnapshot(assignedQuery, (snapshot) => {
      const payouts = [];
      snapshot.forEach(doc => {
        payouts.push({ id: doc.id, ...doc.data() });
      });
      
      // Sort by assignedAt manually (oldest first)
      payouts.sort((a, b) => {
        const timeA = a.assignedAt?.seconds || 0;
        const timeB = b.assignedAt?.seconds || 0;
        return timeA - timeB;
      });
      
      setAssignedPayouts(payouts);
    });

    // Real-time listener for completed payouts
    const completedQuery = query(
      collection(db, 'payouts'),
      where('traderId', '==', traderId),
      where('status', '==', 'completed')
    );

    const unsubCompleted = onSnapshot(completedQuery, (snapshot) => {
      const payouts = [];
      snapshot.forEach(doc => {
        payouts.push({ id: doc.id, ...doc.data() });
      });
      
      // Sort by completedAt manually (newest first)
      payouts.sort((a, b) => {
        const timeA = a.completedAt?.seconds || 0;
        const timeB = b.completedAt?.seconds || 0;
        return timeB - timeA;
      });
      
      setCompletedPayouts(payouts);
    });

    return () => {
      unsubRequests();
      unsubAssigned();
      unsubCompleted();
    };
  }, [traderId]);

  const handleSubmitRequest = async () => {
    const amount = Number(requestAmount);
    
    if (!amount || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    
    if (amount > 100000) {
      alert('Maximum request is ₹1,00,000');
      return;
    }

    if (amount > workingBalance) {
      alert(`Insufficient balance. Available: ₹${workingBalance.toLocaleString()}`);
      return;
    }

    // Check using derived state (real-time)
    if (!canCreateRequest) {
      if (hasActiveRequest) {
        alert('⚠️ You already have an active payout request.\n\nComplete or cancel it first.');
      } else if (hasAssignedPayouts) {
        alert(`⚠️ You have ${assignedPayouts.length} assigned payout(s) to process.\n\nComplete or cancel them first.`);
      }
      return;
    }

    if (!window.confirm(`Request payout for ₹${amount.toLocaleString()}?\n\nPayouts will be assigned immediately.`)) {
      return;
    }

    setSubmitting(true);

    try {
      const result = await immediateAutoAssignPayouts(traderId, amount);

      alert(result.message);
      
      setRequestAmount('');
      
      // If payouts assigned, switch to assigned tab
      if (result.assignedCount > 0) {
        setActiveTab('assigned');
      }

    } catch (error) {
      console.error('Error:', error);
      alert('❌ Error: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!activeRequest) return;

    // Double-check using real-time state
    if (hasAssignedPayouts) {
      alert(`⚠️ Cannot cancel: You have ${assignedPayouts.length} assigned payout(s).\n\nPlease complete or cancel individual payouts first.`);
      return;
    }

    if (!window.confirm(
      `Cancel payout request?\n\n` +
      `Amount: ₹${activeRequest.requestedAmount.toLocaleString()}\n\n` +
      `This will remove your request from the waiting list.`
    )) {
      return;
    }

    try {
      await cancelPayoutRequestByTrader(activeRequest.id);
      alert('✅ Request cancelled!');
    } catch (error) {
      alert('❌ ' + error.message);
    }
  };

  const handleProcessPayout = (payout) => {
    setSelectedPayout(payout);
  };

  const handleUploadAndComplete = async (utrId, proofFile) => {
    if (!selectedPayout || !utrId || !proofFile) {
      alert('Please provide both UTR and proof');
      return;
    }

    if (proofFile.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }

    if (!proofFile.type.startsWith('image/')) {
      alert('Only image files allowed');
      return;
    }

    if (!window.confirm(
      `Complete payout?\n\n` +
      `Amount: ₹${selectedPayout.amount.toLocaleString()}\n` +
      `UTR: ${utrId}`
    )) {
      return;
    }

    setProcessingPayout(selectedPayout.id);
    setUploadProgress(0);

    try {
      const timestamp = Date.now();
      const filename = `${selectedPayout.id}-${timestamp}-${proofFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      const storageRef = ref(storage, `payout-proofs/${filename}`);

      const progressInterval = setInterval(() => {
        setUploadProgress(prev => prev >= 90 ? 90 : prev + 10);
      }, 200);

      try {
        await uploadBytes(storageRef, proofFile);
        clearInterval(progressInterval);
        setUploadProgress(95);

        const proofUrl = await getDownloadURL(storageRef);
        setUploadProgress(100);

        // Updated transaction with corrected commission logic
        await runTransaction(db, async (transaction) => {
          const payoutRef = doc(db, 'payouts', selectedPayout.id);
          
          // Get trader document
          const traderQuery = query(collection(db, 'trader'), where('uid', '==', traderId));
          const traderSnap = await getDocs(traderQuery);
          
          if (traderSnap.empty) throw new Error('Trader not found');
          
          const traderDocRef = doc(db, 'trader', traderSnap.docs[0].id);
          const traderData = traderSnap.docs[0].data();
          
          // Calculate commission
          const amount = Number(selectedPayout.amount);
          const commission = Math.round((amount * payoutCommission) / 100);
          const creditAmount = amount + commission; // Add commission to payout amount
          
          // Update payout
          transaction.update(payoutRef, {
            status: 'completed',
            completedAt: serverTimestamp(),
            traderId: traderId,
            utrId: utrId,
            proofUrl: proofUrl,
            commission: commission
          });
          
          // Update trader working balance
          transaction.update(traderDocRef, {
            workingBalance: (Number(traderData.workingBalance) || 0) + creditAmount,
            overallCommission: (Number(traderData.overallCommission) || 0) + commission
          });
        });

        const creditAmount = selectedPayout.amount + Math.round((selectedPayout.amount * payoutCommission) / 100);
        alert(`✅ Payout completed!\n\n₹${selectedPayout.amount.toLocaleString()} + ₹${Math.round((selectedPayout.amount * payoutCommission) / 100)} commission = ₹${creditAmount.toLocaleString()} added to working balance.`);
        setSelectedPayout(null);

        // Refresh balance
        const traderQuery = query(collection(db, 'trader'), where('uid', '==', traderId));
        const traderSnap = await getDocs(traderQuery);
        if (!traderSnap.empty) {
          setWorkingBalance(traderSnap.docs[0].data().workingBalance || 0);
        }

      } catch (uploadError) {
        clearInterval(progressInterval);
        console.error('Upload error:', uploadError);
        
        if (uploadError.code === 'storage/unauthorized' || 
            uploadError.message?.includes('CORS') ||
            uploadError.message?.includes('Access')) {
          alert(
            '❌ Storage Upload Error!\n\n' +
            'Firebase Storage rules need configuration.\n\n' +
            'Contact admin to update Storage rules.'
          );
        } else {
          alert('❌ Upload failed: ' + uploadError.message);
        }
      }

    } catch (error) {
      console.error('Error:', error);
      alert('❌ Error: ' + error.message);
    } finally {
      setProcessingPayout(null);
      setUploadProgress(0);
    }
  };

  const handleCancelPayout = async (payout, reason) => {
    if (!reason || reason.trim().length < 10) {
      alert('Please provide detailed reason (min 10 characters)');
      return;
    }

    if (!window.confirm(`Cancel payout?\n\nAmount: ₹${payout.amount.toLocaleString()}`)) {
      return;
    }

    setProcessingPayout(payout.id);

    try {
      await cancelPayoutByTrader(payout.id, reason);
      alert('✅ Payout cancelled! Returned to pool.');
    } catch (error) {
      alert('❌ Error: ' + error.message);
    } finally {
      setProcessingPayout(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  const totalAssignedAmount = assignedPayouts.reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalCompletedAmount = completedPayouts.reduce((sum, p) => sum + (p.amount || 0), 0);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-purple-500 to-blue-600 rounded-2xl">
            <TrendingDown className="w-8 h-8 text-white" />
          </div>
          Payout Management
        </h1>
        <p className="text-slate-600 mt-2">Request withdrawals and process assigned payouts</p>
      </div>

      {/* Active Request Banner */}
      {activeRequest && (
        <ActiveRequestBanner 
          request={activeRequest} 
          onCancel={handleCancelRequest}
          assignedCount={assignedPayouts.length}
          canCancel={canCancelRequest}
        />
      )}

      {/* Tabs */}
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={() => setActiveTab('request')}
          className={`px-6 py-3 rounded-xl font-semibold transition-all flex items-center gap-2 ${
            activeTab === 'request'
              ? 'bg-purple-600 text-white shadow-lg'
              : 'bg-white text-slate-700 border-2 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <DollarSign className="w-5 h-5" />
          Request Payout
        </button>
        <button
          onClick={() => setActiveTab('assigned')}
          data-tab="assigned"
          className={`px-6 py-3 rounded-xl font-semibold transition-all flex items-center gap-2 ${
            activeTab === 'assigned'
              ? 'bg-blue-600 text-white shadow-lg'
              : 'bg-white text-slate-700 border-2 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <CreditCard className="w-5 h-5" />
          Assigned Payouts
          {assignedPayouts.length > 0 && (
            <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5">
              {assignedPayouts.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-6 py-3 rounded-xl font-semibold transition-all flex items-center gap-2 ${
            activeTab === 'history'
              ? 'bg-green-600 text-white shadow-lg'
              : 'bg-white text-slate-700 border-2 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <FileText className="w-5 h-5" />
          History
          {completedPayouts.length > 0 && (
            <span className="bg-green-700 text-white text-xs rounded-full px-2 py-0.5">
              {completedPayouts.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'request' && (
        <RequestTab
          canCreate={canCreateRequest}
          requestAmount={requestAmount}
          setRequestAmount={setRequestAmount}
          workingBalance={workingBalance}
          submitting={submitting}
          onSubmit={handleSubmitRequest}
          activeRequest={activeRequest}
          assignedPayoutsCount={assignedPayouts.length}
        />
      )}

      {activeTab === 'assigned' && (
        <AssignedPayoutsTab
          payouts={assignedPayouts}
          totalAmount={totalAssignedAmount}
          onProcess={handleProcessPayout}
          onCancel={handleCancelPayout}
          processing={processingPayout}
        />
      )}

      {activeTab === 'history' && (
        <HistoryTab 
          payouts={completedPayouts}
          totalAmount={totalCompletedAmount}
        />
      )}

      {/* Process Modal */}
      {selectedPayout && (
        <ProcessPayoutModal
          payout={selectedPayout}
          onClose={() => setSelectedPayout(null)}
          onComplete={handleUploadAndComplete}
          isUploading={processingPayout === selectedPayout.id}
          uploadProgress={uploadProgress}
        />
      )}
    </div>
  );
}

// Active Request Banner
function ActiveRequestBanner({ request, onCancel, assignedCount, canCancel }) {
  const getStatusInfo = () => {
    switch (request.status) {
      case 'fully_assigned':
        return {
          color: 'bg-green-50 border-green-300',
          icon: <CheckCircle className="w-10 h-10 text-green-600" />,
          title: '✅ Fully Assigned',
          message: `All ${assignedCount} payouts ready to process!`
        };
      case 'partially_assigned':
        return {
          color: 'bg-yellow-50 border-yellow-300',
          icon: <Clock className="w-10 h-10 text-yellow-600" />,
          title: '⚠️ Partially Assigned',
          message: assignedCount > 0 
            ? `${assignedCount} payouts ready. ₹${(request.remainingAmount || 0).toLocaleString()} in waiting list.`
            : `All assigned payouts processed. ₹${(request.remainingAmount || 0).toLocaleString()} still in waiting list.`
        };
      case 'waiting':
        return {
          color: 'bg-blue-50 border-blue-300',
          icon: <Loader className="w-10 h-10 text-blue-600 animate-spin" />,
          title: '⏳ In Waiting List',
          message: 'No payouts available now. You\'ll get them when available.'
        };
      default:
        return null;
    }
  };

  const statusInfo = getStatusInfo();
  if (!statusInfo) return null;

  return (
    <div className={`rounded-2xl p-8 border-2 ${statusInfo.color}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4 flex-1">
          {statusInfo.icon}
          <div>
            <h3 className="text-2xl font-bold text-slate-900 mb-2">{statusInfo.title}</h3>
            <p className="text-lg text-slate-700 mb-3">
              Requested: <span className="font-bold">₹{(request.requestedAmount || 0).toLocaleString()}</span>
            </p>
            <p className="text-slate-600 mb-2">{statusInfo.message}</p>
            
            {(request.assignedAmount || 0) > 0 && (
              <div className="mt-3 p-3 bg-white/50 rounded-lg">
                <p className="text-sm font-semibold text-slate-700">
                  Total Assigned: ₹{(request.assignedAmount || 0).toLocaleString()}
                </p>
                {assignedCount > 0 && (
                  <p className="text-xs text-slate-600 mt-1">
                    Pending: {assignedCount} payouts
                  </p>
                )}
                {(request.remainingAmount || 0) > 0 && (
                  <p className="text-xs text-slate-600 mt-1">
                    Waiting: ₹{(request.remainingAmount || 0).toLocaleString()}
                  </p>
                )}
              </div>
            )}
            
            {assignedCount > 0 && (
              <button
                onClick={() => document.querySelector('[data-tab="assigned"]')?.click()}
                className="mt-3 text-sm text-blue-600 underline font-semibold"
              >
                → Go to "Assigned Payouts" to process them
              </button>
            )}
          </div>
        </div>
        
        {/* Show cancel ONLY if canCancel is true */}
        {canCancel && (
          <button
            onClick={onCancel}
            className="px-5 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 font-semibold flex items-center gap-2 transition-all"
          >
            <X className="w-4 h-4" />
            Cancel Request
          </button>
        )}
        
        {/* Show message if can't cancel due to assigned payouts */}
        {!canCancel && assignedCount > 0 && (
          <div className="px-5 py-3 bg-slate-100 text-slate-600 rounded-xl text-sm font-semibold">
            Complete payouts to cancel
          </div>
        )}
      </div>
    </div>
  );
}

// Request Tab
function RequestTab({ canCreate, requestAmount, setRequestAmount, workingBalance, submitting, onSubmit, activeRequest, assignedPayoutsCount }) {
  if (!canCreate) {
    return (
      <div className="bg-yellow-50 border-2 border-yellow-300 rounded-2xl p-8 text-center">
        <AlertCircle className="w-16 h-16 text-yellow-600 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-slate-900 mb-2">Cannot Create New Request</h3>
        
        {activeRequest && (
          <>
            <p className="text-slate-700 mb-4 font-semibold">
              You already have an active payout request
            </p>
            <div className="bg-white/50 rounded-xl p-4 mb-4">
              <p className="text-sm text-slate-700">
                <span className="font-bold">Active Request:</span> ₹{(activeRequest.requestedAmount || 0).toLocaleString()}
              </p>
              <p className="text-sm text-slate-600 mt-1">
                Status: {activeRequest.status?.replace('_', ' ').toUpperCase()}
              </p>
            </div>
          </>
        )}
        
        {assignedPayoutsCount > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
            <p className="text-sm font-bold text-red-900 mb-2">
              ⚠️ You have {assignedPayoutsCount} assigned payout{assignedPayoutsCount > 1 ? 's' : ''} to process
            </p>
            <button
              onClick={() => document.querySelector('[data-tab="assigned"]')?.click()}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold text-sm"
            >
              → Go to Assigned Payouts
            </button>
          </div>
        )}
        
        <p className="text-sm text-slate-600">
          {assignedPayoutsCount > 0 
            ? 'Complete or cancel all assigned payouts to create a new request.'
            : activeRequest && assignedPayoutsCount === 0
            ? 'Cancel your current request or wait for payouts to be assigned.'
            : 'Complete your active request first.'}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-md border-2 border-slate-200 p-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Create Payout Request</h2>
        <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <Zap className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-900">
            <p className="font-bold mb-1">Instant Auto-Assignment!</p>
            <p>Payouts will be assigned immediately when you submit. No waiting for approval!</p>
          </div>
        </div>
      </div>
      
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">
            Request Amount *
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-semibold text-lg">
              ₹
            </span>
            <input
              type="number"
              value={requestAmount}
              onChange={(e) => setRequestAmount(e.target.value)}
              placeholder="Enter amount"
              min="1"
              max="100000"
              className="w-full pl-12 pr-4 py-4 border-2 border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-xl font-bold"
            />
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Maximum: ₹1,00,000 | Available: ₹{workingBalance.toLocaleString()}
          </p>
        </div>

        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-900">
              <p className="font-semibold mb-2">How it works:</p>
              <ul className="space-y-1 text-xs">
                <li>• System assigns oldest unassigned payouts (FIFO)</li>
                <li>• If enough payouts: Fully assigned instantly</li>
                <li>• If partial: Get available now + rest when available</li>
                <li>• If none: Added to waiting list, get them when available</li>
              </ul>
            </div>
          </div>
        </div>

        <button
          onClick={onSubmit}
          disabled={submitting || !requestAmount}
          className="w-full py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl hover:from-purple-700 hover:to-blue-700 transition-all font-bold text-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin" />
              Processing...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Send className="w-5 h-5" />
              Request Payout (Instant Assignment)
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

function AssignedPayoutsTab({ payouts, totalAmount, onProcess, onCancel, processing }) {
  if (payouts.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-md border-2 border-slate-200 p-12 text-center">
        <CheckCircle className="w-16 h-16 text-slate-300 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-slate-900 mb-2">All Clear!</h3>
        <p className="text-slate-600">No payouts assigned.</p>
        <p className="text-sm text-slate-500 mt-2">
          Create a request to get payouts assigned.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white">
          <p className="text-blue-100 text-sm mb-1">Pending Payouts</p>
          <p className="text-4xl font-bold">{payouts.length}</p>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white">
          <p className="text-green-100 text-sm mb-1">Total Amount</p>
          <p className="text-3xl font-bold">₹{totalAmount.toLocaleString()}</p>
        </div>
      </div>

      <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <AlertCircle className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
          <div className="text-sm text-blue-900">
            <p className="font-bold mb-2">Processing Instructions:</p>
            <ol className="space-y-1 list-decimal list-inside text-xs">
              <li>Process payment through your bank</li>
              <li>Enter UTR and upload proof</li>
              <li>Click Complete (balance increases automatically)</li>
              <li>If issue, cancel with reason (returns to pool)</li>
            </ol>
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        {payouts.map((payout) => (
          <PayoutCard
            key={payout.id}
            payout={payout}
            onProcess={onProcess}
            onCancel={onCancel}
            isProcessing={processing === payout.id}
          />
        ))}
      </div>
    </div>
  );
}

function HistoryTab({ payouts, totalAmount }) {
  if (payouts.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-md border-2 border-slate-200 p-12 text-center">
        <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-slate-900 mb-2">No History Yet</h3>
        <p className="text-slate-600">Complete payouts to see them here</p>
      </div>
    );
  }

  const groupedPayouts = payouts.reduce((groups, payout) => {
    const date = payout.completedAt?.toDate() || new Date();
    const dateKey = date.toLocaleDateString('en-IN', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(payout);
    return groups;
  }, {});

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 text-white">
          <p className="text-purple-100 text-sm mb-1">Total Completed</p>
          <p className="text-4xl font-bold">{payouts.length}</p>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white">
          <p className="text-green-100 text-sm mb-1">Total Earned</p>
          <p className="text-3xl font-bold">₹{totalAmount.toLocaleString()}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-md border-2 border-slate-200 p-6">
        <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
          <FileText className="w-6 h-6" />
          Completed Payouts History
        </h2>
        
        <div className="space-y-6">
          {Object.entries(groupedPayouts).map(([date, dayPayouts]) => (
            <div key={date}>
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-4 h-4 text-slate-500" />
                <h3 className="font-bold text-slate-700">{date}</h3>
                <span className="text-sm text-slate-500">
                  ({dayPayouts.length} payout{dayPayouts.length > 1 ? 's' : ''})
                </span>
              </div>
              
              <div className="space-y-3 ml-6">
                {dayPayouts.map((payout) => (
                  <CompletedPayoutCard key={payout.id} payout={payout} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CompletedPayoutCard({ payout }) {
  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    try {
      if (timestamp.toDate) {
        return timestamp.toDate().toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit'
        });
      }
      return 'N/A';
    } catch {
      return 'N/A';
    }
  };

  return (
    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 hover:bg-slate-100 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-lg">
            <CheckCircle className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900">
              ₹{(payout.amount || 0).toLocaleString()}
            </p>
            <p className="text-xs text-slate-500">
              {formatDate(payout.completedAt)}
            </p>
          </div>
        </div>
        <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold">
          COMPLETED
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        {payout.utrId && (
          <div>
            <p className="text-slate-500 text-xs">UTR</p>
            <p className="font-mono font-semibold text-slate-900">{payout.utrId}</p>
          </div>
        )}
        {payout.userId && (
          <div>
            <p className="text-slate-500 text-xs">User ID</p>
            <p className="font-mono text-slate-900">{payout.userId.substring(0, 12)}...</p>
          </div>
        )}
        {payout.accountNumber && (
          <div>
            <p className="text-slate-500 text-xs">Account</p>
            <p className="font-mono text-slate-900">***{payout.accountNumber.slice(-4)}</p>
          </div>
        )}
        {payout.upiId && (
          <div>
            <p className="text-slate-500 text-xs">UPI</p>
            <p className="font-mono text-slate-900">{payout.upiId}</p>
          </div>
        )}
      </div>

      {payout.proofUrl && (
        <div className="mt-3 pt-3 border-t border-slate-200">
          <a
            href={payout.proofUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1"
          >
            <FileText className="w-4 h-4" />
            View Proof
          </a>
        </div>
      )}
    </div>
  );
}

function PayoutCard({ payout, onProcess, onCancel, isProcessing }) {
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    try {
      if (timestamp.toDate) return timestamp.toDate().toLocaleString();
      return 'N/A';
    } catch {
      return 'N/A';
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-md border-2 border-slate-200 p-6 hover:shadow-lg transition-all">
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-green-100 rounded-xl">
            <DollarSign className="w-8 h-8 text-green-600" />
          </div>
          <div>
            <p className="text-3xl font-bold text-slate-900">
              ₹{(payout.amount || 0).toLocaleString()}
            </p>
            <p className="text-sm text-slate-500 mt-1">
              Assigned: {formatDate(payout.assignedAt)}
            </p>
          </div>
        </div>
        <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-bold flex items-center gap-1">
          <Clock className="w-3 h-3" />
          PENDING
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <DetailItem icon={<User className="w-4 h-4" />} label="User ID" value={payout.userId || '-'} />
        <DetailItem icon={<User className="w-4 h-4" />} label="Account Holder" value={payout.accountHolderName || '-'} />
        
        {payout.paymentMethod === 'upi' ? (
          <DetailItem icon={<CreditCard className="w-4 h-4" />} label="UPI ID" value={payout.upiId || '-'} />
        ) : (
          <>
            <DetailItem icon={<Hash className="w-4 h-4" />} label="Account Number" value={payout.accountNumber || '-'} />
            <DetailItem icon={<Building className="w-4 h-4" />} label="IFSC Code" value={payout.ifscCode || '-'} />
          </>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => onProcess(payout)}
          disabled={isProcessing}
          className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors font-bold disabled:opacity-50"
        >
          <CheckCircle className="w-5 h-5" />
          {isProcessing ? 'Processing...' : 'Complete'}
        </button>
        <button
          onClick={() => setShowCancelModal(true)}
          disabled={isProcessing}
          className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors font-bold disabled:opacity-50"
        >
          <XCircle className="w-5 h-5" />
          Cancel
        </button>
      </div>

      {showCancelModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b">
              <h3 className="text-xl font-bold">Cancel Payout</h3>
            </div>
            <div className="p-6">
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Enter reason (min 10 characters)..."
                rows={4}
                className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div className="p-6 border-t flex gap-3">
              <button
                onClick={() => setShowCancelModal(false)}
                className="flex-1 px-4 py-2 border-2 border-slate-300 rounded-xl hover:bg-slate-50 font-semibold"
              >
                Go Back
              </button>
              <button
                onClick={() => {
                  onCancel(payout, cancelReason);
                  setShowCancelModal(false);
                  setCancelReason('');
                }}
                disabled={cancelReason.trim().length < 10}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 font-semibold disabled:opacity-50"
              >
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailItem({ icon, label, value }) {
  return (
    <div className="flex items-start gap-2">
      <div className="p-2 bg-slate-100 rounded-lg text-slate-600">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-500 mb-0.5">{label}</p>
        <p className="font-semibold text-slate-900 text-sm truncate">{value}</p>
      </div>
    </div>
  );
}

function ProcessPayoutModal({ payout, onClose, onComplete, isUploading, uploadProgress }) {
  const [utrId, setUtrId] = useState('');
  const [proofFile, setProofFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setProofFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold">Complete Payout</h3>
            <p className="text-sm text-slate-600">Amount: ₹{(payout.amount || 0).toLocaleString()}</p>
          </div>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="p-2 hover:bg-slate-100 rounded-lg disabled:opacity-50"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-slate-50 rounded-xl p-4">
            <h4 className="font-bold mb-3">Payment Details:</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">User ID:</span>
                <span className="font-semibold">{payout.userId || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Account:</span>
                <span className="font-mono font-semibold">{payout.accountNumber || payout.upiId || 'N/A'}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold mb-2">
              UTR / Reference Number *
            </label>
            <input
              type="text"
              value={utrId}
              onChange={(e) => setUtrId(e.target.value)}
              placeholder="Enter transaction reference"
              disabled={isUploading}
              className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:ring-2 focus:ring-green-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-sm font-bold mb-2">
              Proof Screenshot *
            </label>
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center">
              {previewUrl ? (
                <div className="space-y-3">
                  <img src={previewUrl} alt="Preview" className="max-h-64 mx-auto rounded-lg" />
                  <button
                    onClick={() => { setProofFile(null); setPreviewUrl(null); }}
                    disabled={isUploading}
                    className="text-sm text-red-600 font-semibold"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div>
                  <Upload className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                  <label className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer font-semibold">
                    Choose File
                    <input type="file" accept="image/*" onChange={handleFileChange} disabled={isUploading} className="hidden" />
                  </label>
                  <p className="text-xs text-slate-500 mt-2">Max 5MB | JPG, PNG</p>
                </div>
              )}
            </div>
          </div>

          {isUploading && (
            <div className="bg-blue-50 rounded-xl p-4">
              <div className="flex justify-between mb-2">
                <span className="text-sm font-semibold text-blue-900">Uploading...</span>
                <span className="text-sm font-bold text-blue-900">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div className="h-full bg-blue-600 transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t flex gap-3">
          <button
            onClick={onClose}
            disabled={isUploading}
            className="flex-1 px-6 py-3 border-2 border-slate-300 rounded-xl hover:bg-slate-50 font-bold disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onComplete(utrId, proofFile)}
            disabled={!utrId || !proofFile || isUploading}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 font-bold disabled:opacity-50"
          >
            {isUploading ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5" />
                Complete
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}