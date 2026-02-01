import React, { useState, useEffect } from 'react';
import { db } from '../../../../firebase';
import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  onSnapshot,
  orderBy,
  query,
  where,
  increment
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  Users, Plus, Edit, Trash2, Key, Eye, EyeOff, 
  CheckCircle, XCircle, Search, Download, RefreshCw,
  AlertCircle, Copy, Check, Shield, Wallet, Send,
  TrendingUp, TrendingDown, Clock, DollarSign,
  ExternalLink, FileText
} from 'lucide-react';

// Import settlement utilities
import {
  formatUSDT,
  formatINR,
  getBalanceStatus,
  validateTxHash,
  parseBalanceData
} from '../../../merchant/pages/Settlement/Settlementutils';

export default function AdminMerchants() {
  const [activeTab, setActiveTab] = useState('merchants'); // 'merchants' | 'settlements'
  const [merchants, setMerchants] = useState([]);
  const [withdrawalRequests, setWithdrawalRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [editingMerchant, setEditingMerchant] = useState(null);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState({});
  const [showApiKey, setShowApiKey] = useState({});
  const [txHash, setTxHash] = useState('');
  const [txHashError, setTxHashError] = useState('');
  const [processing, setProcessing] = useState(false);
  
  // Form state
  const [form, setForm] = useState({
    email: '',
    password: '',
    businessName: '',
    contactPerson: '',
    phone: '',
    webhookUrl: '',
    testMode: true,
    active: true,
    initialBalance: 2000, // Default USDT balance
    payinCommissionRate: 5,
    payoutCommissionRate: 2
  });
  
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchMerchants();
    setupWithdrawalListener();
  }, []);

  const fetchMerchants = async () => {
    setLoading(true);
    try {
      const snapshot = await getDocs(collection(db, 'merchant'));
      const merchantsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setMerchants(merchantsData);
    } catch (error) {
      console.error('Error fetching merchants:', error);
      alert('Failed to load merchants');
    } finally {
      setLoading(false);
    }
  };

  const setupWithdrawalListener = () => {
    const q = query(
      collection(db, 'withdrawalRequests'),
      orderBy('requestedAt', 'desc')
    );

    onSnapshot(q, (snapshot) => {
      const requests = [];
      snapshot.forEach((doc) => {
        requests.push({ id: doc.id, ...doc.data() });
      });
      setWithdrawalRequests(requests);
    });
  };

  // Generate secure API key
  const generateApiKey = () => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return 'sk_live_' + Array.from(array, byte => 
      byte.toString(16).padStart(2, '0')
    ).join('');
  };

  // Generate webhook secret
  const generateWebhookSecret = () => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return 'whsec_' + Array.from(array, byte => 
      byte.toString(16).padStart(2, '0')
    ).join('');
  };

  // Validate form
  const validateForm = () => {
    const errors = {};
    
    if (!form.email) errors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(form.email)) errors.email = 'Email is invalid';
    
    if (!editingMerchant && !form.password) errors.password = 'Password is required';
    else if (!editingMerchant && form.password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }
    
    if (!form.businessName) errors.businessName = 'Business name is required';
    
    if (form.webhookUrl && !form.webhookUrl.startsWith('http')) {
      errors.webhookUrl = 'Webhook URL must start with http:// or https://';
    }

    if (!form.initialBalance || form.initialBalance < 0) {
      errors.initialBalance = 'Initial balance must be greater than 0';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Create new merchant using Cloud Function
  const handleCreateMerchant = async () => {
    if (!validateForm()) return;
    
    setSaving(true);
    try {
      const apiKey = generateApiKey();
      const webhookSecret = generateWebhookSecret();
      
      // Call Cloud Function to create merchant
      const functions = getFunctions();
      const createMerchantFunction = httpsCallable(functions, 'createMerchant');
      
      const result = await createMerchantFunction({
        email: form.email,
        password: form.password,
        businessName: form.businessName,
        contactPerson: form.contactPerson || '',
        phone: form.phone || '',
        webhookUrl: form.webhookUrl || '',
        testMode: form.testMode,
        active: form.active,
        initialBalance: Number(form.initialBalance),
        payinCommissionRate: Number(form.payinCommissionRate),
        payoutCommissionRate: Number(form.payoutCommissionRate),
        apiKey: apiKey,
        webhookSecret: webhookSecret
      });
      
      if (result.data.success) {
        const message = `✅ Merchant Created Successfully!

Business: ${form.businessName}
Email: ${form.email}
Password: ${form.password}
Initial Balance: ${form.initialBalance} USDT
UID: ${result.data.uid}

🔑 API Credentials:
API Key: ${apiKey}
Webhook Secret: ${webhookSecret}

✅ Firebase Auth user created
✅ User role assigned (merchant)
✅ Merchant account configured

⚠️ IMPORTANT: Save these credentials!
They will not be shown again.`;
        
        alert(message);
        await navigator.clipboard.writeText(apiKey);
        
        setShowModal(false);
        resetForm();
        fetchMerchants();
      }
      
    } catch (error) {
      console.error('Error creating merchant:', error);
      
      let errorMessage = 'Failed to create merchant: ';
      
      if (error.code === 'functions/unauthenticated') {
        errorMessage += 'You must be logged in as admin';
      } else if (error.code === 'functions/permission-denied') {
        errorMessage += 'Only admins can create merchants';
      } else if (error.code === 'functions/invalid-argument') {
        errorMessage += error.message;
      } else if (error.message.includes('email-already-exists')) {
        errorMessage += 'Email already exists. Please use a different email.';
      } else {
        errorMessage += error.message;
      }
      
      alert(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  // Update merchant
  const handleUpdateMerchant = async () => {
    if (!validateForm()) return;
    
    setSaving(true);
    try {
      const merchantRef = doc(db, 'merchant', editingMerchant.id);
      
      await updateDoc(merchantRef, {
        businessName: form.businessName,
        contactPerson: form.contactPerson || '',
        phone: form.phone || '',
        webhookUrl: form.webhookUrl || '',
        testMode: form.testMode,
        active: form.active,
        isActive: form.active,
        payinCommissionRate: Number(form.payinCommissionRate),
        payoutCommissionRate: Number(form.payoutCommissionRate),
        updatedAt: serverTimestamp()
      });
      
      alert('✅ Merchant updated successfully!');
      setShowModal(false);
      setEditingMerchant(null);
      resetForm();
      fetchMerchants();
      
    } catch (error) {
      console.error('Error updating merchant:', error);
      alert('Failed to update merchant: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  // Delete merchant
  const handleDeleteMerchant = async (merchantId) => {
    if (!confirm('Are you sure you want to delete this merchant? This action cannot be undone.')) {
      return;
    }
    
    try {
      await deleteDoc(doc(db, 'merchant', merchantId));
      alert('✅ Merchant deleted successfully!');
      fetchMerchants();
    } catch (error) {
      console.error('Error deleting merchant:', error);
      alert('Failed to delete merchant: ' + error.message);
    }
  };

  // Regenerate API key
  const handleRegenerateApiKey = async (merchant) => {
    if (!confirm('Regenerate API key? The old key will stop working immediately!')) {
      return;
    }
    
    try {
      const newApiKey = generateApiKey();
      const merchantRef = doc(db, 'merchant', merchant.id);
      
      await updateDoc(merchantRef, {
        apiKey: newApiKey,
        apiKeyUpdatedAt: serverTimestamp()
      });
      
      alert(`✅ New API Key Generated:

${newApiKey}

⚠️ Update this in merchant's integration immediately!`);
      
      await navigator.clipboard.writeText(newApiKey);
      fetchMerchants();
    } catch (error) {
      console.error('Error regenerating API key:', error);
      alert('Failed to regenerate API key');
    }
  };

  // Toggle merchant active status
  const toggleMerchantStatus = async (merchant) => {
    try {
      const merchantRef = doc(db, 'merchant', merchant.id);
      await updateDoc(merchantRef, {
        active: !merchant.active,
        isActive: !merchant.active,
        updatedAt: serverTimestamp()
      });
      fetchMerchants();
    } catch (error) {
      console.error('Error toggling status:', error);
      alert('Failed to update status');
    }
  };

  // Approve withdrawal
 const handleApproveWithdrawal = async () => {
  if (!selectedRequest) return;

  const error = validateTxHash(txHash);
  if (error) {
    setTxHashError(error);
    return;
  }

  // Confirm before processing
  if (!window.confirm(`Confirm withdrawal approval:

Merchant: ${selectedRequest.merchantName}
Amount: ${formatUSDT(selectedRequest.amount)} USDT
TRC Address: ${selectedRequest.trcAddress}
TX Hash: ${txHash}

This will deduct ${formatUSDT(selectedRequest.amount)} USDT from merchant's balance.

Proceed?`)) {
    return;
  }

  setProcessing(true);
  try {
    // STEP 1: Find merchant document by UID
    console.log('🔍 Finding merchant with UID:', selectedRequest.merchantId);
    
    const merchantQuery = query(
      collection(db, 'merchant'),
      where('uid', '==', selectedRequest.merchantId)
    );
    const merchantSnapshot = await getDocs(merchantQuery);

    if (merchantSnapshot.empty) {
      console.error('❌ Merchant not found for UID:', selectedRequest.merchantId);
      throw new Error('Merchant not found. Cannot process withdrawal.');
    }

    const merchantDoc = merchantSnapshot.docs[0];
    const merchantRef = doc(db, 'merchant', merchantDoc.id);
    const currentMerchantData = merchantDoc.data();
    
    console.log('✅ Found merchant:', merchantDoc.id);
    console.log('📊 Current balance:', currentMerchantData.currentBalance);

    // STEP 2: Validate merchant has sufficient balance
    const currentBalance = Number(currentMerchantData.currentBalance) || 0;
    const withdrawalAmount = Number(selectedRequest.amount);

    if (currentBalance < withdrawalAmount) {
      throw new Error(`Insufficient balance. Merchant has ${formatUSDT(currentBalance)} USDT but requested ${formatUSDT(withdrawalAmount)} USDT.`);
    }

    // STEP 3: Calculate new balance
    const newBalance = Number((currentBalance - withdrawalAmount).toFixed(2));
    const totalWithdrawn = Number(currentMerchantData.totalUSDTWithdrawn || 0) + withdrawalAmount;

    console.log('💰 Balance calculation:');
    console.log('  Current:', currentBalance);
    console.log('  Withdrawal:', withdrawalAmount);
    console.log('  New:', newBalance);

    // STEP 4: Update withdrawal request status FIRST
    await updateDoc(doc(db, 'withdrawalRequests', selectedRequest.id), {
      status: 'completed',
      txHash: txHash,
      processedAt: serverTimestamp(),
      completedAt: serverTimestamp(),
      cancellable: false,
      processedBy: 'admin'
    });
    console.log('✅ Withdrawal request marked as completed');

    // STEP 5: Update merchant balance
    await updateDoc(merchantRef, {
      currentBalance: newBalance, // Set exact new balance (don't use increment!)
      totalUSDTWithdrawn: totalWithdrawn,
      lastBalanceUpdate: serverTimestamp(),
      lastWithdrawalAt: serverTimestamp()
    });
    console.log('✅ Merchant balance updated to:', newBalance);

    // STEP 6: Log balance transaction
    await addDoc(collection(db, 'balanceTransactions'), {
      merchantId: selectedRequest.merchantId,
      type: 'withdrawal',
      amount: withdrawalAmount,
      balanceBefore: currentBalance,
      balanceAfter: newBalance,
      change: -withdrawalAmount,
      description: `Withdrawal approved - ${formatUSDT(withdrawalAmount)} USDT to ${selectedRequest.trcAddress.slice(0, 10)}...`,
      relatedWithdrawalId: selectedRequest.id,
      txHash: txHash,
      source: 'admin',
      createdAt: serverTimestamp()
    });
    console.log('✅ Balance transaction logged');

    alert(`✅ Withdrawal Approved Successfully!

Merchant: ${selectedRequest.merchantName}
Amount: ${formatUSDT(withdrawalAmount)} USDT
Previous Balance: ${formatUSDT(currentBalance)} USDT
New Balance: ${formatUSDT(newBalance)} USDT

TX Hash: ${txHash}`);
    
    setShowProcessModal(false);
    setSelectedRequest(null);
    setTxHash('');
    setTxHashError('');
    fetchMerchants();

  } catch (error) {
    console.error('❌ Error approving withdrawal:', error);
    alert(`Failed to approve withdrawal: ${error.message}\n\nPlease check console for details.`);
  } finally {
    setProcessing(false);
  }
};

  // Reject withdrawal
  const handleRejectWithdrawal = async (request) => {
    const reason = prompt('Enter rejection reason:');
    if (!reason) return;

    try {
      await updateDoc(doc(db, 'withdrawalRequests', request.id), {
        status: 'rejected',
        rejectionReason: reason,
        processedAt: serverTimestamp()
      });

      alert('✅ Withdrawal request rejected');
    } catch (error) {
      console.error('Error rejecting withdrawal:', error);
      alert('Failed to reject withdrawal');
    }
  };

  // Copy to clipboard
  const handleCopy = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(prev => ({ ...prev, [id]: true }));
      setTimeout(() => {
        setCopied(prev => ({ ...prev, [id]: false }));
      }, 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  // Reset form
  const resetForm = () => {
    setForm({
      email: '',
      password: '',
      businessName: '',
      contactPerson: '',
      phone: '',
      webhookUrl: '',
      testMode: true,
      active: true,
      initialBalance: 2000,
      payinCommissionRate: 5,
      payoutCommissionRate: 2
    });
    setFormErrors({});
  };

  // Open edit modal
  const openEditModal = (merchant) => {
    setEditingMerchant(merchant);
    setForm({
      email: merchant.email,
      password: '',
      businessName: merchant.businessName,
      contactPerson: merchant.contactPerson || '',
      phone: merchant.phone || '',
      webhookUrl: merchant.webhookUrl || '',
      testMode: merchant.testMode,
      active: merchant.active,
      initialBalance: merchant.currentBalance || 2000,
      payinCommissionRate: merchant.payinCommissionRate || 5,
      payoutCommissionRate: merchant.payoutCommissionRate || 2
    });
    setShowModal(true);
  };

  // Filter merchants
  const filteredMerchants = merchants.filter(merchant => {
    const query = searchQuery.toLowerCase();
    return (
      merchant.businessName?.toLowerCase().includes(query) ||
      merchant.email?.toLowerCase().includes(query) ||
      merchant.merchantId?.toLowerCase().includes(query)
    );
  });

  // Calculate stats
  const stats = {
    total: merchants.length,
    active: merchants.filter(m => m.active).length,
    inactive: merchants.filter(m => !m.active).length,
    testMode: merchants.filter(m => m.testMode).length,
    totalBalance: merchants.reduce((sum, m) => sum + (m.currentBalance || 0), 0),
    totalCommission: merchants.reduce((sum, m) => sum + (m.totalCommissionPaidUSDT || 0), 0),
    pendingWithdrawals: withdrawalRequests.filter(r => r.status === 'pending').length
  };

  const pendingRequests = withdrawalRequests.filter(r => r.status === 'pending');

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['Business Name', 'Email', 'Contact Person', 'Phone', 'Status', 'Test Mode', 'Balance (USDT)', 'Total Revenue'];
    const rows = filteredMerchants.map(m => [
      m.businessName,
      m.email,
      m.contactPerson || '-',
      m.phone || '-',
      m.active ? 'Active' : 'Inactive',
      m.testMode ? 'Yes' : 'No',
      m.currentBalance || 0,
      m.totalRevenue || 0
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `merchants_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading merchants...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Merchant Management</h1>
          <p className="text-gray-600">Create, manage merchants and process settlements</p>
        </div>
        <div className="flex gap-3 mt-4 md:mt-0">
          <button
            onClick={fetchMerchants}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={() => {
              resetForm();
              setEditingMerchant(null);
              setShowModal(true);
            }}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Merchant
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('merchants')}
          className={`px-6 py-3 font-semibold transition-all ${
            activeTab === 'merchants'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Merchants
          </div>
        </button>
        <button
          onClick={() => setActiveTab('settlements')}
          className={`px-6 py-3 font-semibold transition-all relative ${
            activeTab === 'settlements'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5" />
            Settlements
            {pendingRequests.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {pendingRequests.length}
              </span>
            )}
          </div>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {activeTab === 'merchants' ? (
          <>
            <StatCard
              label="Total Merchants"
              value={stats.total}
              icon={<Users className="w-6 h-6" />}
              color="blue"
            />
            <StatCard
              label="Active"
              value={stats.active}
              icon={<CheckCircle className="w-6 h-6" />}
              color="green"
            />
            <StatCard
              label="Inactive"
              value={stats.inactive}
              icon={<XCircle className="w-6 h-6" />}
              color="red"
            />
            <StatCard
              label="Test Mode"
              value={stats.testMode}
              icon={<AlertCircle className="w-6 h-6" />}
              color="yellow"
            />
          </>
        ) : (
          <>
            <StatCard
              label="Total Balance"
              value={`${formatUSDT(stats.totalBalance)} USDT`}
              icon={<DollarSign className="w-6 h-6" />}
              color="blue"
            />
            <StatCard
              label="Total Commission"
              value={`${formatUSDT(stats.totalCommission)} USDT`}
              icon={<TrendingUp className="w-6 h-6" />}
              color="green"
            />
            <StatCard
              label="Pending Withdrawals"
              value={stats.pendingWithdrawals}
              icon={<Clock className="w-6 h-6" />}
              color="yellow"
            />
            <StatCard
              label="Merchants"
              value={stats.total}
              icon={<Users className="w-6 h-6" />}
              color="purple"
            />
          </>
        )}
      </div>

      {/* Content Based on Active Tab */}
      {activeTab === 'merchants' ? (
        <>
          {/* Search */}
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by business name, email, or merchant ID..."
                className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Merchants Table */}
          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-gray-600">
                      Business
                    </th>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-gray-600">
                      Contact
                    </th>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-gray-600">
                      API Key
                    </th>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-gray-600">
                      Balance (USDT)
                    </th>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-gray-600">
                      Status
                    </th>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-gray-600">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMerchants.length > 0 ? (
                    filteredMerchants.map((merchant) => (
                      <MerchantRow
                        key={merchant.id}
                        merchant={merchant}
                        onEdit={() => openEditModal(merchant)}
                        onDelete={() => handleDeleteMerchant(merchant.id)}
                        onToggleStatus={() => toggleMerchantStatus(merchant)}
                        onRegenerateKey={() => handleRegenerateApiKey(merchant)}
                        onCopy={handleCopy}
                        copied={copied}
                        showApiKey={showApiKey}
                        setShowApiKey={setShowApiKey}
                      />
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" className="text-center py-12 text-gray-500">
                        {searchQuery ? (
                          <>
                            <Search className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                            <p>No merchants found matching "{searchQuery}"</p>
                          </>
                        ) : (
                          <>
                            <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                            <p>No merchants yet</p>
                            <button
                              onClick={() => setShowModal(true)}
                              className="mt-4 text-blue-600 hover:text-blue-700 font-medium"
                            >
                              Create your first merchant
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Settlement Tab Content */}
          {pendingRequests.length > 0 && (
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-6 border-2 border-amber-200 mb-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-amber-500 rounded-xl">
                  <AlertCircle className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-800">
                    Pending Withdrawal Requests ({pendingRequests.length})
                  </h3>
                  <p className="text-gray-600 text-sm">Review and process withdrawal requests</p>
                </div>
              </div>

              <div className="space-y-4">
                {pendingRequests.map((request) => (
                  <WithdrawalRequestCard
                    key={request.id}
                    request={request}
                    onApprove={() => {
                      setSelectedRequest(request);
                      setShowProcessModal(true);
                    }}
                    onReject={() => handleRejectWithdrawal(request)}
                    onCopy={handleCopy}
                    copied={copied}
                  />
                ))}
              </div>
            </div>
          )}

          {/* All Merchants Balance Table */}
          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-800">Merchant Balances</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b-2 border-gray-200">
                  <tr>
                    <th className="text-left py-4 px-6 font-bold text-gray-700">Merchant</th>
                    <th className="text-left py-4 px-6 font-bold text-gray-700">Balance</th>
                    <th className="text-left py-4 px-6 font-bold text-gray-700">Investment</th>
                    <th className="text-left py-4 px-6 font-bold text-gray-700">Commission Paid</th>
                    <th className="text-left py-4 px-6 font-bold text-gray-700">Withdrawn</th>
                    <th className="text-left py-4 px-6 font-bold text-gray-700">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMerchants.map((merchant) => (
                    <SettlementRow key={merchant.id} merchant={merchant} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Withdrawal History */}
          <div className="bg-white rounded-xl shadow-md overflow-hidden mt-6">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-800">Withdrawal History</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b-2 border-gray-200">
                  <tr>
                    <th className="text-left py-3 px-6 font-bold text-gray-700">Date</th>
                    <th className="text-left py-3 px-6 font-bold text-gray-700">Merchant</th>
                    <th className="text-left py-3 px-6 font-bold text-gray-700">Amount</th>
                    <th className="text-left py-3 px-6 font-bold text-gray-700">Status</th>
                    <th className="text-left py-3 px-6 font-bold text-gray-700">TX Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {withdrawalRequests.length > 0 ? (
                    withdrawalRequests.map((request) => (
                      <tr key={request.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-6">
                          {request.requestedAt?.toDate().toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </td>
                        <td className="py-3 px-6 font-semibold">{request.merchantName}</td>
                        <td className="py-3 px-6 font-bold">{formatUSDT(request.amount)} USDT</td>
                        <td className="py-3 px-6">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            request.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                            request.status === 'completed' ? 'bg-green-100 text-green-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {request.status?.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-6">
                          {request.txHash ? (
                            <a
                              href={`https://tronscan.org/#/transaction/${request.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-700 flex items-center gap-1"
                            >
                              <code className="text-xs">{request.txHash.slice(0, 8)}...</code>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" className="text-center py-8 text-gray-500">
                        No withdrawal requests found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <MerchantModal
          isEdit={!!editingMerchant}
          form={form}
          setForm={setForm}
          formErrors={formErrors}
          saving={saving}
          onSave={editingMerchant ? handleUpdateMerchant : handleCreateMerchant}
          onClose={() => {
            setShowModal(false);
            setEditingMerchant(null);
            resetForm();
          }}
        />
      )}

      {/* Process Withdrawal Modal */}
      {showProcessModal && selectedRequest && (
        <ProcessWithdrawalModal
          request={selectedRequest}
          txHash={txHash}
          setTxHash={setTxHash}
          error={txHashError}
          processing={processing}
          onApprove={handleApproveWithdrawal}
          onClose={() => {
            setShowProcessModal(false);
            setSelectedRequest(null);
            setTxHash('');
            setTxHashError('');
          }}
          onCopy={handleCopy}
          copied={copied}
        />
      )}
    </div>
  );
}

// Stat Card Component
function StatCard({ label, value, icon, color }) {
  const colors = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    red: 'bg-red-100 text-red-600',
    yellow: 'bg-yellow-100 text-yellow-600',
    purple: 'bg-purple-100 text-purple-600'
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <div className={`${colors[color]} p-3 rounded-lg`}>
          {icon}
        </div>
      </div>
      <p className="text-3xl font-bold text-gray-800">{value}</p>
      <p className="text-sm text-gray-600 mt-1">{label}</p>
    </div>
  );
}

// Merchant Row Component (same as before but with USDT balance)
function MerchantRow({ merchant, onEdit, onDelete, onToggleStatus, onRegenerateKey, onCopy, copied, showApiKey, setShowApiKey }) {
  const maskApiKey = (key) => {
    if (!key) return '';
    return key.substring(0, 12) + '•'.repeat(Math.max(0, key.length - 16)) + key.substring(key.length - 4);
  };

  const balanceStatus = getBalanceStatus(merchant.currentBalance || 0);

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="py-4 px-6">
        <div>
          <p className="font-semibold text-gray-800">{merchant.businessName}</p>
          <p className="text-sm text-gray-500">{merchant.email}</p>
          {merchant.testMode && (
            <span className="inline-block mt-1 px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full">
              Test Mode
            </span>
          )}
        </div>
      </td>
      <td className="py-4 px-6">
        <p className="text-sm text-gray-700">{merchant.contactPerson || '-'}</p>
        <p className="text-sm text-gray-500">{merchant.phone || '-'}</p>
      </td>
      <td className="py-4 px-6">
        <div className="flex items-center gap-2">
          <code className="text-xs font-mono text-gray-700">
            {showApiKey[merchant.id] ? merchant.apiKey : maskApiKey(merchant.apiKey)}
          </code>
          <button
            onClick={() => setShowApiKey(prev => ({ ...prev, [merchant.id]: !prev[merchant.id] }))}
            className="p-1 hover:bg-gray-200 rounded transition-colors"
          >
            {showApiKey[merchant.id] ? (
              <EyeOff className="w-4 h-4 text-gray-600" />
            ) : (
              <Eye className="w-4 h-4 text-gray-600" />
            )}
          </button>
          <button
            onClick={() => onCopy(merchant.apiKey, `api-${merchant.id}`)}
            className="p-1 hover:bg-gray-200 rounded transition-colors"
          >
            {copied[`api-${merchant.id}`] ? (
              <Check className="w-4 h-4 text-green-600" />
            ) : (
              <Copy className="w-4 h-4 text-gray-600" />
            )}
          </button>
        </div>
      </td>
      <td className="py-4 px-6">
        <p className="font-semibold text-gray-800">
          {formatUSDT(merchant.currentBalance || 0)} USDT
        </p>
        <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
          balanceStatus.status === 'healthy' ? 'bg-green-100 text-green-700' :
          balanceStatus.status === 'warning' ? 'bg-yellow-100 text-yellow-700' :
          'bg-red-100 text-red-700'
        }`}>
          {balanceStatus.message}
        </span>
      </td>
      <td className="py-4 px-6">
        <button
          onClick={onToggleStatus}
          className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold transition-colors ${
            merchant.active
              ? 'bg-green-100 text-green-700 hover:bg-green-200'
              : 'bg-red-100 text-red-700 hover:bg-red-200'
          }`}
        >
          {merchant.active ? (
            <>
              <CheckCircle className="w-4 h-4" />
              Active
            </>
          ) : (
            <>
              <XCircle className="w-4 h-4" />
              Inactive
            </>
          )}
        </button>
      </td>
      <td className="py-4 px-6">
        <div className="flex items-center gap-2">
          <button
            onClick={onEdit}
            className="p-2 hover:bg-blue-100 rounded-lg transition-colors text-blue-600"
            title="Edit"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={onRegenerateKey}
            className="p-2 hover:bg-green-100 rounded-lg transition-colors text-green-600"
            title="Regenerate API Key"
          >
            <Key className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-2 hover:bg-red-100 rounded-lg transition-colors text-red-600"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// Settlement Row Component
function SettlementRow({ merchant }) {
  const balanceData = parseBalanceData(merchant);
  const balanceStatus = getBalanceStatus(balanceData.currentBalance);

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="py-4 px-6">
        <div>
          <p className="font-semibold text-gray-900">{merchant.businessName}</p>
          <p className="text-xs text-gray-500">{merchant.email}</p>
        </div>
      </td>
      <td className="py-4 px-6">
        <div>
          <p className="font-bold text-lg text-gray-900">{formatUSDT(balanceData.currentBalance)} USDT</p>
          <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
            balanceStatus.status === 'healthy' ? 'bg-green-100 text-green-700' :
            balanceStatus.status === 'warning' ? 'bg-yellow-100 text-yellow-700' :
            'bg-red-100 text-red-700'
          }`}>
            {balanceStatus.message}
          </span>
        </div>
      </td>
      <td className="py-4 px-6">
        <p className="font-semibold text-gray-900">{formatUSDT(balanceData.initialCredit)} USDT</p>
      </td>
      <td className="py-4 px-6">
        <p className="font-semibold text-red-600">{formatUSDT(balanceData.totalCommissionUSDT)} USDT</p>
        <p className="text-xs text-gray-500">{formatINR(balanceData.totalCommissionINR)}</p>
      </td>
      <td className="py-4 px-6">
        <p className="font-semibold text-green-600">{formatUSDT(balanceData.totalWithdrawn)} USDT</p>
      </td>
      <td className="py-4 px-6">
        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${
          merchant.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
        }`}>
          {merchant.isActive ? (
            <>
              <CheckCircle className="w-3 h-3" />
              Active
            </>
          ) : (
            <>
              <XCircle className="w-3 h-3" />
              Inactive
            </>
          )}
        </span>
      </td>
    </tr>
  );
}

// Withdrawal Request Card Component
function WithdrawalRequestCard({ request, onApprove, onReject, onCopy, copied }) {
  return (
    <div className="bg-white rounded-xl border-2 border-gray-200 p-6 shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h4 className="font-bold text-gray-900 text-lg">{request.merchantName}</h4>
            <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-semibold">
              PENDING
            </span>
          </div>
          <p className="text-sm text-gray-500">
            Requested {request.requestedAt?.toDate().toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-extrabold text-blue-600">{formatUSDT(request.amount)} USDT</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-600 mb-1">Balance Before</p>
          <p className="font-bold text-gray-900">{formatUSDT(request.balanceBefore)} USDT</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-600 mb-1">Balance After</p>
          <p className="font-bold text-gray-900">{formatUSDT(request.balanceAfter)} USDT</p>
        </div>
      </div>

      <div className="bg-blue-50 rounded-lg p-4 mb-4 border border-blue-200">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-bold text-blue-900">TRC-20 Address:</p>
          <button
            onClick={() => onCopy(request.trcAddress, `trc-${request.id}`)}
            className="p-1 hover:bg-blue-100 rounded transition-colors"
          >
            {copied[`trc-${request.id}`] ? (
              <Check className="w-4 h-4 text-green-600" />
            ) : (
              <Copy className="w-4 h-4 text-blue-600" />
            )}
          </button>
        </div>
        <code className="text-xs text-blue-800 font-mono break-all">{request.trcAddress}</code>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onApprove}
          className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors font-bold shadow-lg"
        >
          <CheckCircle className="w-5 h-5" />
          Approve & Process
        </button>
        <button
          onClick={onReject}
          className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors font-bold shadow-lg"
        >
          <XCircle className="w-5 h-5" />
          Reject
        </button>
      </div>
    </div>
  );
}

// Process Withdrawal Modal Component
function ProcessWithdrawalModal({ request, txHash, setTxHash, error, processing, onApprove, onClose, onCopy, copied }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-xl font-bold text-gray-900">Process Withdrawal Request</h3>
          <p className="text-sm text-gray-600 mt-1">{request.merchantName}</p>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl p-6 border-2 border-blue-200">
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-2">Withdrawal Amount</p>
              <p className="text-4xl font-extrabold text-blue-600">{formatUSDT(request.amount)} USDT</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              Send USDT to this TRC-20 Address:
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-gray-100 rounded-xl p-4 font-mono text-sm break-all">
                {request.trcAddress}
              </div>
              <button
                onClick={() => onCopy(request.trcAddress, 'modal-trc')}
                className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
              >
                {copied['modal-trc'] ? (
                  <Check className="w-5 h-5" />
                ) : (
                  <Copy className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              Enter Transaction Hash *
            </label>
            <input
              type="text"
              value={txHash}
              onChange={(e) => setTxHash(e.target.value)}
              placeholder="Enter 64-character transaction hash"
              className={`w-full px-4 py-3 border-2 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm ${
                error ? 'border-red-300' : 'border-gray-300'
              }`}
            />
            {error && (
              <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {error}
              </p>
            )}
          </div>

          <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-amber-900">Important:</p>
                <ul className="text-xs text-amber-800 mt-2 space-y-1">
                  <li>• Verify transaction hash on blockchain</li>
                  <li>• Ensure USDT sent to correct address</li>
                  <li>• Merchant balance updated immediately</li>
                  <li>• This action cannot be undone</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 border-2 border-gray-300 rounded-xl hover:bg-gray-50 transition-colors font-bold"
          >
            Cancel
          </button>
          <button
            onClick={onApprove}
            disabled={processing || !txHash}
            className="flex-1 px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {processing ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5" />
                Confirm & Approve
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Merchant Modal Component (with settlement fields added)
function MerchantModal({ isEdit, form, setForm, formErrors, saving, onSave, onClose }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-800">
            {isEdit ? 'Edit Merchant' : 'Create New Merchant'}
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <XCircle className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Business Information */}
          <div>
            <h4 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" />
              Business Information
            </h4>
            
            <div className="space-y-4">
              <InputField
                label="Business Name"
                required
                value={form.businessName}
                onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                error={formErrors.businessName}
                placeholder="Enter business name"
              />

              <InputField
                label="Contact Person"
                value={form.contactPerson}
                onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                placeholder="Enter contact person name"
              />

              <InputField
                label="Phone"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+91 98765 43210"
              />
            </div>
          </div>

          {/* Account Credentials */}
          <div>
            <h4 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Key className="w-5 h-5 text-green-600" />
              Account Credentials
            </h4>
            
            <div className="space-y-4">
              <InputField
                label="Email"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                error={formErrors.email}
                placeholder="merchant@example.com"
                disabled={isEdit}
              />

              {!isEdit && (
                <InputField
                  label="Password"
                  type="password"
                  required
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  error={formErrors.password}
                  placeholder="Enter strong password (min 8 characters)"
                />
              )}
            </div>
          </div>

          {/* Settlement Configuration */}
          <div>
            <h4 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-purple-600" />
              Settlement Configuration
            </h4>
            
            <div className="space-y-4">
              <InputField
                label="Initial USDT Balance"
                type="number"
                required
                value={form.initialBalance}
                onChange={(e) => setForm({ ...form, initialBalance: e.target.value })}
                error={formErrors.initialBalance}
                placeholder="2000"
                disabled={isEdit}
              />

              <div className="grid grid-cols-2 gap-4">
                <InputField
                  label="Payin Commission Rate (%)"
                  type="number"
                  required
                  value={form.payinCommissionRate}
                  onChange={(e) => setForm({ ...form, payinCommissionRate: e.target.value })}
                  placeholder="5"
                  min="0"
                  max="100"
                  step="0.1"
                />

                <InputField
                  label="Payout Commission Rate (%)"
                  type="number"
                  required
                  value={form.payoutCommissionRate}
                  onChange={(e) => setForm({ ...form, payoutCommissionRate: e.target.value })}
                  placeholder="2"
                  min="0"
                  max="100"
                  step="0.1"
                />
              </div>
            </div>
          </div>

          {/* Webhook Configuration */}
          <div>
            <h4 className="font-semibold text-gray-800 mb-4">Webhook Configuration</h4>
            
            <InputField
              label="Webhook URL"
              type="url"
              value={form.webhookUrl}
              onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })}
              error={formErrors.webhookUrl}
              placeholder="https://yoursite.com/api/webhook"
            />
          </div>

          {/* Settings */}
          <div>
            <h4 className="font-semibold text-gray-800 mb-4">Settings</h4>
            
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.testMode}
                  onChange={(e) => setForm({ ...form, testMode: e.target.checked })}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <div>
                  <p className="font-medium text-gray-800">Test Mode</p>
                  <p className="text-sm text-gray-500">Enable test mode for this merchant</p>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <div>
                  <p className="font-medium text-gray-800">Active</p>
                  <p className="text-sm text-gray-500">Allow this merchant to process payments</p>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                {isEdit ? 'Updating...' : 'Creating...'}
              </>
            ) : (
              <>
                {isEdit ? 'Update Merchant' : 'Create Merchant'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Input Field Component
function InputField({ label, required, error, ...props }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        {...props}
        className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 transition-colors ${
          error
            ? 'border-red-300 focus:ring-red-500'
            : 'border-gray-300 focus:ring-blue-500'
        } ${props.disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
      />
      {error && (
        <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
          <AlertCircle className="w-4 h-4" />
          {error}
        </p>
      )}
    </div>
  );
}