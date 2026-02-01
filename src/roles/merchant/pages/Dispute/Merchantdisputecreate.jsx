import React, { useState, useEffect } from 'react';
import { db, storage } from '../../../../firebase';
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  onSnapshot,
  orderBy,
  doc,
  getDoc,
  getDocs,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getAuth } from 'firebase/auth';
import {
  AlertCircle,
  Upload,
  Send,
  X,
  CheckCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  Paperclip,
  AlertTriangle,
  Clock,
  XCircle,
  RefreshCw,
  Eye,
  Plus,
} from 'lucide-react';

// Dispute Card Component
function DisputeCard({ dispute, onRedispute, onView }) {
  const isPayin = dispute.type === 'payin';
  
  const getStatusConfig = () => {
    switch (dispute.status) {
      case 'pending':
        return { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: Clock };
      case 'approved':
        return { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle };
      case 'rejected':
        return { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle };
      default:
        return { bg: 'bg-gray-100', text: 'text-gray-700', icon: Clock };
    }
  };

  const statusConfig = getStatusConfig();
  const StatusIcon = statusConfig.icon;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 hover:shadow-md transition-all">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded text-xs font-bold flex items-center gap-1 ${statusConfig.bg} ${statusConfig.text}`}>
            <StatusIcon size={12} />
            {dispute.status?.toUpperCase()}
          </span>
          <span className={`px-2 py-1 rounded text-xs font-bold flex items-center gap-1 ${
            isPayin ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
          }`}>
            {isPayin ? <ArrowDownCircle size={12} /> : <ArrowUpCircle size={12} />}
            {dispute.type?.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Transaction ID */}
      <div className="mb-3">
        <p className="text-xs text-slate-500 mb-1">
          {isPayin ? 'Transaction ID' : 'Payout ID'}
        </p>
        <p className="font-mono font-bold text-slate-900 text-sm">
          {isPayin ? dispute.transactionId : dispute.payoutId}
        </p>
      </div>

      {/* Amount */}
      <div className="bg-green-50 rounded-lg p-2 mb-3">
        <p className="text-xs text-green-700 mb-1">Amount</p>
        <p className="text-xl font-bold text-green-900">₹{(dispute.amount || 0).toLocaleString()}</p>
      </div>

      {/* Reason Preview */}
      <div className="mb-3">
        <p className="text-xs text-slate-500 mb-1">Reason</p>
        <p className="text-sm text-slate-700 line-clamp-2">{dispute.reason}</p>
      </div>

      {/* Trader Response (if rejected) */}
      {dispute.status === 'rejected' && dispute.traderNote && (
        <div className="mb-3 bg-red-50 border-l-2 border-red-400 rounded p-2">
          <p className="text-xs text-red-700 font-semibold mb-1">Trader's Response</p>
          <p className="text-xs text-red-900">{dispute.traderNote}</p>
        </div>
      )}

      {/* Date */}
      <div className="text-xs text-slate-400 mb-3 flex items-center gap-1">
        <Clock size={12} />
        {new Date((dispute.createdAt?.seconds || 0) * 1000).toLocaleString()}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => onView(dispute)}
          className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-all text-sm font-semibold"
        >
          <Eye size={16} />
          View
        </button>
        {dispute.status === 'rejected' && (
          <button
            onClick={() => onRedispute(dispute)}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-all text-sm font-semibold"
          >
            <RefreshCw size={16} />
            Re-dispute
          </button>
        )}
      </div>
    </div>
  );
}

// View Dispute Modal
function ViewDisputeModal({ dispute, onClose }) {
  if (!dispute) return null;
  
  const isPayin = dispute.type === 'payin';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-slate-800 text-white p-6 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold">Dispute Details</h3>
            <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Status */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Status</p>
            <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-bold ${
              dispute.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
              dispute.status === 'approved' ? 'bg-green-100 text-green-700' :
              'bg-red-100 text-red-700'
            }`}>
              {dispute.status?.toUpperCase()}
            </span>
          </div>

          {/* Transaction Info */}
          <div className="bg-slate-50 rounded-lg p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-slate-500 mb-1">Type</p>
                <p className="font-semibold">{dispute.type?.toUpperCase()}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Amount</p>
                <p className="font-bold text-green-600 text-lg">₹{dispute.amount?.toLocaleString()}</p>
              </div>
            </div>

            {isPayin ? (
              <>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Transaction ID</p>
                  <p className="font-mono text-sm">{dispute.transactionId}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">UTR Number</p>
                  <p className="font-mono text-sm">{dispute.utrNumber}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Sender Name</p>
                  <p className="font-mono text-sm">{dispute.senderName}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Receiver UPI ID</p>
                  <p className="font-mono text-sm">{dispute.receiverUpiId}</p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Payout ID</p>
                  <p className="font-mono text-sm">{dispute.payoutId}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Account Number</p>
                  <p className="font-mono text-sm">{dispute.accountNumber}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">IFSC Code</p>
                  <p className="font-mono text-sm">{dispute.ifscCode}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Holder Name</p>
                  <p className="font-mono text-sm">{dispute.holderName}</p>
                </div>
              </>
            )}
          </div>

          {/* Reason */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Your Reason</p>
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <p className="text-sm text-slate-900">{dispute.reason}</p>
            </div>
          </div>

          {/* Receipt (for payin) */}
          {isPayin && dispute.receiptUrl && (
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-2">Receipt</p>
              <img
                src={dispute.receiptUrl}
                alt="Receipt"
                className="w-full rounded-lg border border-slate-200 cursor-pointer"
                onClick={() => window.open(dispute.receiptUrl, '_blank')}
              />
            </div>
          )}

          {/* Trader Response */}
          {dispute.traderNote && (
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-2">Trader's Response</p>
              <div className={`p-4 rounded-lg border-l-4 ${
                dispute.status === 'approved' 
                  ? 'bg-green-50 border-green-400'
                  : 'bg-red-50 border-red-400'
              }`}>
                <p className="text-sm">{dispute.traderNote}</p>
              </div>
            </div>
          )}

          {/* Trader Proof (if rejected) */}
          {dispute.status === 'rejected' && dispute.proofUrl && (
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-2">Trader's Proof</p>
              <img
                src={dispute.proofUrl}
                alt="Trader Proof"
                className="w-full rounded-lg border border-slate-200 cursor-pointer"
                onClick={() => window.open(dispute.proofUrl, '_blank')}
              />
            </div>
          )}

          {/* Timestamps */}
          <div className="text-xs text-slate-500 space-y-1">
            <p>Created: {new Date((dispute.createdAt?.seconds || 0) * 1000).toLocaleString()}</p>
            {dispute.respondedAt && (
              <p>Responded: {new Date((dispute.respondedAt?.seconds || 0) * 1000).toLocaleString()}</p>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-800 font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MerchantDisputeManagement() {
  const [activeTab, setActiveTab] = useState('create'); // 'create' or 'list'
  const [disputes, setDisputes] = useState([]);
  const [disputeType, setDisputeType] = useState('payin');
  const [submitting, setSubmitting] = useState(false);
  const [merchantId, setMerchantId] = useState(null);
  const [merchantName, setMerchantName] = useState('');
  const [receiptFile, setReceiptFile] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedDispute, setSelectedDispute] = useState(null);

  // Payin form fields
  const [payinForm, setPayinForm] = useState({
    transactionId: '',
    userId: '',
    amount: '',
    senderName: '',
    utrNumber: '',
    receiverUpiId: '',
    reason: '',
  });

  // Payout form fields
  const [payoutForm, setPayoutForm] = useState({
    payoutId: '',
    amount: '',
    accountNumber: '',
    ifscCode: '',
    upiId: '',
    holderName: '',
    reason: '',
  });

  useEffect(() => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (user) {
      setMerchantId(user.uid);
      getDoc(doc(db, 'merchants', user.uid)).then((docSnap) => {
        if (docSnap.exists()) {
          setMerchantName(docSnap.data().name || 'Merchant');
        }
      });

      // Listen to disputes
      const q = query(
        collection(db, 'disputes'),
        where('merchantId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const data = [];
        snapshot.forEach((doc) => {
          data.push({ id: doc.id, ...doc.data() });
        });
        setDisputes(data);
      });

      return () => unsubscribe();
    }
  }, []);

  const handleReceiptChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('File size must be less than 5MB');
        return;
      }
      setReceiptFile(file);
    }
  };

  const handlePayinChange = (field, value) => {
    setPayinForm({ ...payinForm, [field]: value });
  };

  const handlePayoutChange = (field, value) => {
    setPayoutForm({ ...payoutForm, [field]: value });
  };

  const validatePayinForm = () => {
    if (!payinForm.transactionId.trim()) return alert('Transaction ID is required'), false;
    if (!payinForm.userId.trim()) return alert('User ID is required'), false;
    if (!payinForm.amount || payinForm.amount <= 0) return alert('Valid amount is required'), false;
    if (!payinForm.senderName.trim()) return alert('Sender name is required'), false;
    if (!payinForm.utrNumber.trim()) return alert('UTR number is required'), false;
    if (!payinForm.receiverUpiId.trim()) return alert('Receiver UPI ID is required'), false;
    if (!payinForm.reason.trim() || payinForm.reason.length < 20) return alert('Reason must be at least 20 characters'), false;
    if (!receiptFile) return alert('Receipt is required'), false;
    return true;
  };

  const validatePayoutForm = () => {
    if (!payoutForm.payoutId.trim()) return alert('Payout ID is required'), false;
    if (!payoutForm.amount || payoutForm.amount <= 0) return alert('Valid amount is required'), false;
    if (!payoutForm.accountNumber.trim()) return alert('Account number is required'), false;
    if (!payoutForm.ifscCode.trim()) return alert('IFSC code is required'), false;
    if (!payoutForm.upiId.trim()) return alert('UPI ID is required'), false;
    if (!payoutForm.holderName.trim()) return alert('Holder name is required'), false;
    if (!payoutForm.reason.trim() || payoutForm.reason.length < 20) return alert('Reason must be at least 20 characters'), false;
    return true;
  };

  const handleSubmit = async () => {
    if (disputeType === 'payin') {
      if (!validatePayinForm()) return;
    } else {
      if (!validatePayoutForm()) return;
    }

    setSubmitting(true);

    try {
      let receiptUrl = null;
      let traderId = null;

      // Upload receipt for payin
      if (disputeType === 'payin' && receiptFile) {
        const storageRef = ref(storage, `disputes/${merchantId}/${Date.now()}_${receiptFile.name}`);
        await uploadBytes(storageRef, receiptFile);
        receiptUrl = await getDownloadURL(storageRef);
      }

      // Find traderId based on UPI ID from address mapping
      if (disputeType === 'payin') {
        // Search in upi_pool collection for the UPI ID
        const addressQuery = query(
          collection(db, 'upi_pool'),
          where('upiId', '==', payinForm.receiverUpiId.trim())
        );
        const addressSnapshot = await getDocs(addressQuery);
        
        if (!addressSnapshot.empty) {
          const addressDoc = addressSnapshot.docs[0];
          traderId = addressDoc.data().traderId;
        }

        if (!traderId) {
          alert('Could not find trader for this UPI ID. Please verify the Receiver UPI ID is correct.');
          setSubmitting(false);
          return;
        }
      } else {
        // For payout, search in payouts collection
        const payoutQuery = query(
          collection(db, 'payouts'),
          where('merchantId', '==', merchantId),
          where('orderId', '==', payoutForm.payoutId.trim())
        );
        const payoutSnapshot = await getDocs(payoutQuery);
        
        if (!payoutSnapshot.empty) {
          const payoutDoc = payoutSnapshot.docs[0];
          traderId = payoutDoc.data().traderId;
        }

        if (!traderId) {
          alert('Could not find trader for this Payout ID. Please verify the Payout ID is correct.');
          setSubmitting(false);
          return;
        }
      }

      const disputeData = {
        type: disputeType,
        merchantId: merchantId,
        merchantName: merchantName,
        traderId: traderId, // Trader ID from address mapping or payout
        status: 'pending',
        createdAt: serverTimestamp(),
      };

      if (disputeType === 'payin') {
        disputeData.transactionId = payinForm.transactionId.trim();
        disputeData.userId = payinForm.userId.trim();
        disputeData.amount = Number(payinForm.amount);
        disputeData.senderName = payinForm.senderName.trim();
        disputeData.utrNumber = payinForm.utrNumber.trim();
        disputeData.receiverUpiId = payinForm.receiverUpiId.trim();
        disputeData.reason = payinForm.reason.trim();
        disputeData.receiptUrl = receiptUrl;
        disputeData.upiId = payinForm.receiverUpiId.trim(); // For routing
      } else {
        disputeData.payoutId = payoutForm.payoutId.trim();
        disputeData.amount = Number(payoutForm.amount);
        disputeData.accountNumber = payoutForm.accountNumber.trim();
        disputeData.ifscCode = payoutForm.ifscCode.trim();
        disputeData.upiId = payoutForm.upiId.trim();
        disputeData.holderName = payoutForm.holderName.trim();
        disputeData.reason = payoutForm.reason.trim();
        disputeData.orderId = payoutForm.payoutId.trim(); // For routing
      }

      await addDoc(collection(db, 'disputes'), disputeData);

      alert('Dispute created successfully!');
      setActiveTab('list');

      // Reset form
      if (disputeType === 'payin') {
        setPayinForm({
          transactionId: '',
          userId: '',
          amount: '',
          senderName: '',
          utrNumber: '',
          receiverUpiId: '',
          reason: '',
        });
        setReceiptFile(null);
      } else {
        setPayoutForm({
          payoutId: '',
          amount: '',
          accountNumber: '',
          ifscCode: '',
          upiId: '',
          holderName: '',
          reason: '',
        });
      }
    } catch (error) {
      console.error('Error creating dispute:', error);
      alert('Error creating dispute: ' + error.message);
    }

    setSubmitting(false);
  };

  const handleRedispute = (dispute) => {
    setActiveTab('create');
    setDisputeType(dispute.type);

    if (dispute.type === 'payin') {
      setPayinForm({
        transactionId: dispute.transactionId || '',
        userId: dispute.userId || '',
        amount: dispute.amount || '',
        senderName: dispute.senderName || '',
        utrNumber: dispute.utrNumber || '',
        receiverUpiId: dispute.receiverUpiId || '',
        reason: dispute.reason || '',
      });
    } else {
      setPayoutForm({
        payoutId: dispute.payoutId || '',
        amount: dispute.amount || '',
        accountNumber: dispute.accountNumber || '',
        ifscCode: dispute.ifscCode || '',
        upiId: dispute.upiId || '',
        holderName: dispute.holderName || '',
        reason: dispute.reason || '',
      });
    }
  };

  const filteredDisputes = disputes.filter(d => 
    statusFilter === 'all' || d.status === statusFilter
  );

  const stats = {
    total: disputes.length,
    pending: disputes.filter(d => d.status === 'pending').length,
    approved: disputes.filter(d => d.status === 'approved').length,
    rejected: disputes.filter(d => d.status === 'rejected').length,
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-2xl shadow-xl p-6 text-white">
        <h1 className="text-3xl font-bold flex items-center gap-3 mb-2">
          <AlertCircle className="w-8 h-8" />
          Dispute Management
        </h1>
        <p className="text-orange-100">Create and track your disputes</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-slate-600 to-slate-700 rounded-xl p-4 text-white">
          <p className="text-slate-200 text-xs mb-1">Total</p>
          <p className="text-3xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-gradient-to-br from-yellow-500 to-orange-500 rounded-xl p-4 text-white">
          <p className="text-yellow-100 text-xs mb-1">Pending</p>
          <p className="text-3xl font-bold">{stats.pending}</p>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-4 text-white">
          <p className="text-green-100 text-xs mb-1">Approved</p>
          <p className="text-3xl font-bold">{stats.approved}</p>
        </div>
        <div className="bg-gradient-to-br from-red-500 to-rose-600 rounded-xl p-4 text-white">
          <p className="text-red-100 text-xs mb-1">Rejected</p>
          <p className="text-3xl font-bold">{stats.rejected}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-3 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('create')}
          className={`px-6 py-3 font-semibold transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'create'
              ? 'border-orange-600 text-orange-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Plus size={20} />
          Create Dispute
        </button>
        <button
          onClick={() => setActiveTab('list')}
          className={`px-6 py-3 font-semibold transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'list'
              ? 'border-orange-600 text-orange-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Eye size={20} />
          My Disputes ({disputes.length})
        </button>
      </div>

      {/* Create Tab */}
      {activeTab === 'create' && (
        <div className="space-y-6">
          {/* Type Selection */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Dispute Type</h3>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setDisputeType('payin')}
                className={`p-5 rounded-xl border-2 transition-all ${
                  disputeType === 'payin'
                    ? 'border-blue-500 bg-blue-50 shadow-md'
                    : 'border-slate-200 hover:border-blue-300'
                }`}
              >
                <ArrowDownCircle
                  className={`w-8 h-8 mx-auto mb-2 ${
                    disputeType === 'payin' ? 'text-blue-600' : 'text-slate-400'
                  }`}
                />
                <p
                  className={`font-bold ${
                    disputeType === 'payin' ? 'text-blue-900' : 'text-slate-600'
                  }`}
                >
                  Payin Dispute
                </p>
              </button>
              <button
                onClick={() => setDisputeType('payout')}
                className={`p-5 rounded-xl border-2 transition-all ${
                  disputeType === 'payout'
                    ? 'border-purple-500 bg-purple-50 shadow-md'
                    : 'border-slate-200 hover:border-purple-300'
                }`}
              >
                <ArrowUpCircle
                  className={`w-8 h-8 mx-auto mb-2 ${
                    disputeType === 'payout' ? 'text-purple-600' : 'text-slate-400'
                  }`}
                />
                <p
                  className={`font-bold ${
                    disputeType === 'payout' ? 'text-purple-900' : 'text-slate-600'
                  }`}
                >
                  Payout Dispute
                </p>
              </button>
            </div>
          </div>

          {/* Payin Form */}
          {disputeType === 'payin' && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Payin Details</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Transaction ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={payinForm.transactionId}
                    onChange={(e) => handlePayinChange('transactionId', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="TXN123456"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    User ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={payinForm.userId}
                    onChange={(e) => handlePayinChange('userId', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="user123"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Amount (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={payinForm.amount}
                    onChange={(e) => handlePayinChange('amount', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="1000"
                    min="1"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Sender Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={payinForm.senderName}
                    onChange={(e) => handlePayinChange('senderName', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="John Doe"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    UTR Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={payinForm.utrNumber}
                    onChange={(e) => handlePayinChange('utrNumber', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="UTR123456789"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Receiver UPI ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={payinForm.receiverUpiId}
                    onChange={(e) => handlePayinChange('receiverUpiId', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="receiver@paytm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={payinForm.reason}
                  onChange={(e) => handlePayinChange('reason', e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  placeholder="Explain the issue in detail (minimum 20 characters)..."
                />
                <p className="text-xs text-slate-500 mt-1">
                  {payinForm.reason.length} / 1000 characters
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Upload Receipt <span className="text-red-500">*</span>
                </label>
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 hover:border-blue-400 transition-all bg-slate-50">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleReceiptChange}
                    className="hidden"
                    id="receipt-upload"
                  />
                  <label
                    htmlFor="receipt-upload"
                    className="cursor-pointer flex flex-col items-center gap-2"
                  >
                    <Upload className="w-10 h-10 text-slate-400" />
                    <p className="font-semibold text-slate-700">Click to upload receipt</p>
                    <p className="text-xs text-slate-500">PNG, JPG (Max 5MB)</p>
                  </label>
                </div>
                {receiptFile && (
                  <div className="mt-2 flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center gap-2">
                      <Paperclip className="w-4 h-4 text-blue-600" />
                      <span className="text-sm text-blue-900 font-medium">
                        {receiptFile.name}
                      </span>
                    </div>
                    <button
                      onClick={() => setReceiptFile(null)}
                      className="p-1 hover:bg-blue-100 rounded"
                    >
                      <X className="w-4 h-4 text-blue-700" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Payout Form */}
          {disputeType === 'payout' && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Payout Details</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Payout ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={payoutForm.payoutId}
                    onChange={(e) => handlePayoutChange('payoutId', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="PAYOUT123456"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Amount (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={payoutForm.amount}
                    onChange={(e) => handlePayoutChange('amount', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="1000"
                    min="1"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Account Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={payoutForm.accountNumber}
                    onChange={(e) => handlePayoutChange('accountNumber', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="1234567890"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    IFSC Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={payoutForm.ifscCode}
                    onChange={(e) => handlePayoutChange('ifscCode', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="SBIN0001234"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    UPI ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={payoutForm.upiId}
                    onChange={(e) => handlePayoutChange('upiId', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="user@paytm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Holder Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={payoutForm.holderName}
                    onChange={(e) => handlePayoutChange('holderName', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="John Doe"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={payoutForm.reason}
                  onChange={(e) => handlePayoutChange('reason', e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                  placeholder="Explain the issue in detail (minimum 20 characters)..."
                />
                <p className="text-xs text-slate-500 mt-1">
                  {payoutForm.reason.length} / 1000 characters
                </p>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <div className="flex gap-4">
            <button
              onClick={() => {
                if (disputeType === 'payin') {
                  setPayinForm({
                    transactionId: '',
                    userId: '',
                    amount: '',
                    senderName: '',
                    utrNumber: '',
                    receiverUpiId: '',
                    reason: '',
                  });
                  setReceiptFile(null);
                } else {
                  setPayoutForm({
                    payoutId: '',
                    amount: '',
                    accountNumber: '',
                    ifscCode: '',
                    upiId: '',
                    holderName: '',
                    reason: '',
                  });
                }
              }}
              className="flex-1 px-6 py-3 border-2 border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-semibold"
            >
              Reset Form
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg hover:from-orange-600 hover:to-red-600 transition-all font-bold disabled:opacity-50 shadow-lg flex items-center justify-center gap-2"
            >
              <Send size={20} />
              {submitting ? 'Submitting...' : 'Submit Dispute'}
            </button>
          </div>
        </div>
      )}

      {/* List Tab */}
      {activeTab === 'list' && (
        <div className="space-y-4">
          {/* Filter */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 font-medium"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {/* Disputes Grid */}
          {filteredDisputes.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDisputes.map((dispute) => (
                <DisputeCard
                  key={dispute.id}
                  dispute={dispute}
                  onRedispute={handleRedispute}
                  onView={setSelectedDispute}
                />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
              <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600 font-medium">No disputes found</p>
            </div>
          )}
        </div>
      )}

      {/* View Modal */}
      {selectedDispute && (
        <ViewDisputeModal
          dispute={selectedDispute}
          onClose={() => setSelectedDispute(null)}
        />
      )}
    </div>
  );
}