import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../../supabase';
import { 
  CreditCard, ArrowRight, Copy, CheckCircle, Clock, AlertCircle, 
  Send, AlertTriangle, IndianRupee, Loader2, XCircle,
  MessageSquare, RotateCcw, Search, Eye, Key, Play, Zap
} from 'lucide-react';

const API_BASE_URL = 'https://api.pay2x.io';

const ApiTest = () => {
  const context = useOutletContext();
  const testMode = context?.testMode || false;

  // API Key
  const [apiKey, setApiKey] = useState('');
  const [loadingKey, setLoadingKey] = useState(true);

  // Active tab
  const [activeTab, setActiveTab] = useState('payin');

  // Payin state
  const [payinAmount, setPayinAmount] = useState('500');
  const [payinStep, setPayinStep] = useState('input');
  const [payinData, setPayinData] = useState(null);
  const [utrInput, setUtrInput] = useState('');
  const [payinLoading, setPayinLoading] = useState(false);
  const [payinError, setPayinError] = useState('');
  const [payinTimer, setPayinTimer] = useState(600);
  const [copied, setCopied] = useState(false);
  const [switchingUpi, setSwitchingUpi] = useState(false);

  // Payin Status
  const [statusPayinId, setStatusPayinId] = useState('');
  const [statusResult, setStatusResult] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);

  // Payout state
  const [payoutAmount, setPayoutAmount] = useState('5000');
  const [payoutStep, setPayoutStep] = useState('input');
  const [payoutData, setPayoutData] = useState(null);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutError, setPayoutError] = useState('');
  const [bankDetails, setBankDetails] = useState({
    accountName: 'Test User',
    accountNumber: '1234567890123',
    ifsc: 'SBIN0001234',
    upiId: 'testuser@okaxis'
  });

  // Payout Status
  const [statusPayoutId, setStatusPayoutId] = useState('');
  const [payoutStatusResult, setPayoutStatusResult] = useState(null);
  const [payoutStatusLoading, setPayoutStatusLoading] = useState(false);

  // Dispute state
  const [disputeType, setDisputeType] = useState('payment_not_received');
  const [disputeUpiId, setDisputeUpiId] = useState('');
  const [disputePayinId, setDisputePayinId] = useState('');
  const [disputePayoutId, setDisputePayoutId] = useState('');
  const [disputeUtr, setDisputeUtr] = useState('');
  const [disputeAmount, setDisputeAmount] = useState('');
  const [disputeComment, setDisputeComment] = useState('');
  const [disputeUserId, setDisputeUserId] = useState('customer_123');
  const [disputeLoading, setDisputeLoading] = useState(false);
  const [disputeResult, setDisputeResult] = useState(null);

  // Dispute Status
  const [statusDisputeId, setStatusDisputeId] = useState('');
  const [disputeStatusResult, setDisputeStatusResult] = useState(null);
  const [disputeStatusLoading, setDisputeStatusLoading] = useState(false);

  // Load merchant's API key
  useEffect(() => {
    const loadApiKey = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: merchant } = await supabase
          .from('merchants')
          .select('live_api_key, test_api_key')
          .eq('profile_id', user.id)
          .single();

        if (merchant) {
          const key = testMode ? merchant.test_api_key : merchant.live_api_key;
          setApiKey(key || '');
        }
      } catch (e) {
        console.error('Error loading API key:', e);
      }
      setLoadingKey(false);
    };

    loadApiKey();
  }, [testMode]);

  // Timer countdown
  useEffect(() => {
    if (payinStep === 'payment' && payinTimer > 0) {
      const interval = setInterval(() => setPayinTimer(prev => prev - 1), 1000);
      return () => clearInterval(interval);
    }
  }, [payinStep, payinTimer]);

  // Poll payin status
  useEffect(() => {
    if (payinStep === 'pending' && payinData?.payinId && apiKey) {
      const poll = setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/v1/payin/status?payinId=${payinData.payinId}`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
          });
          const data = await res.json();
          const status = data.status || data.payin?.status;
          
          if (status === 'completed') {
            setPayinStep('completed');
            clearInterval(poll);
          } else if (['rejected', 'failed', 'expired'].includes(status)) {
            setPayinStep('failed');
            setPayinError(data.reason || 'Payment was rejected');
            clearInterval(poll);
          }
        } catch (e) {
          console.error('Poll error:', e);
        }
      }, 5000);
      return () => clearInterval(poll);
    }
  }, [payinStep, payinData, apiKey]);

  const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ─── PAYIN ───
  const handleCreatePayin = async () => {
    if (!apiKey) { setPayinError('API Key required'); return; }
    const amount = Number(payinAmount);
    if (amount < 500 || amount > 50000) { setPayinError('Amount must be ₹500 - ₹50,000'); return; }

    setPayinLoading(true);
    setPayinError('');

    try {
      const res = await fetch(`${API_BASE_URL}/v1/payin/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          amount,
          orderId: `TEST_${Date.now()}`,
          userId: `test_user_${Date.now()}`,
          metadata: { source: 'merchant_api_test' }
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || data.error || 'Failed');

      setPayinData({
        payinId: data.payinId || data.payment_id,
        upiId: data.upiId || data.upi_id,
        holderName: data.holderName || data.holder_name,
        amount: data.amount,
        attemptNumber: data.attempt_number || 1,
        maxAttempts: data.max_attempts || 3,
        fallbackAvailable: data.fallback_available ?? true
      });
      setPayinTimer(data.timer || 600);
      setPayinStep('payment');
    } catch (e) {
      setPayinError(e.message);
    }
    setPayinLoading(false);
  };

  const handleSubmitUtr = async () => {
    if (!utrInput || utrInput.length < 10) { setPayinError('Valid UTR required (min 10 chars)'); return; }
    setPayinLoading(true);
    setPayinError('');

    try {
      const res = await fetch(`${API_BASE_URL}/v1/payin/submit-utr`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ payinId: payinData.payinId, utrId: utrInput })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || data.error || 'Failed');
      setPayinStep('pending');
    } catch (e) {
      setPayinError(e.message);
    }
    setPayinLoading(false);
  };

  const handleSwitchUpi = async () => {
    setSwitchingUpi(true);
    setPayinError('');

    try {
      const res = await fetch(`${API_BASE_URL}/v1/payin/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ payinId: payinData.payinId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || data.error || 'Failed');

      setPayinData(prev => ({
        ...prev,
        payinId: data.payment_id || data.payinId,
        upiId: data.upi_id || data.upiId,
        holderName: data.holder_name || data.holderName,
        attemptNumber: data.attempt_number,
        maxAttempts: data.max_attempts,
        fallbackAvailable: data.fallback_available
      }));
      setUtrInput('');
    } catch (e) {
      setPayinError(e.message);
    }
    setSwitchingUpi(false);
  };

  const handleCheckPayinStatus = async () => {
    if (!statusPayinId) { setStatusResult({ error: 'Enter Payin ID' }); return; }
    setStatusLoading(true);
    setStatusResult(null);

    try {
      const res = await fetch(`${API_BASE_URL}/v1/payin/status?payinId=${statusPayinId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || data.error || 'Failed');
      setStatusResult(data);
    } catch (e) {
      setStatusResult({ error: e.message });
    }
    setStatusLoading(false);
  };

  const resetPayin = () => {
    setPayinStep('input');
    setPayinData(null);
    setUtrInput('');
    setPayinError('');
    setPayinTimer(600);
  };

  // ─── PAYOUT ───
  const handleCreatePayout = async () => {
    if (!apiKey) { setPayoutError('API Key required'); return; }
    const amount = Number(payoutAmount);
    if (amount < 5000 || amount > 50000) { setPayoutError('Amount must be ₹5,000 - ₹50,000'); return; }
    if (!bankDetails.accountNumber || !bankDetails.ifsc || !bankDetails.upiId) {
      setPayoutError('Account Number, IFSC, and UPI ID required');
      return;
    }

    setPayoutLoading(true);
    setPayoutError('');

    try {
      const res = await fetch(`${API_BASE_URL}/v1/payout/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          amount,
          orderId: `PAYOUT_${Date.now()}`,
          accountName: bankDetails.accountName,
          accountNumber: bankDetails.accountNumber,
          ifscCode: bankDetails.ifsc,
          upiId: bankDetails.upiId,
          metadata: { source: 'merchant_api_test' }
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || data.error || 'Failed');

      setPayoutData({
        payoutId: data.payoutId || data.payout_id,
        amount: data.amount,
        status: data.status || 'pending'
      });
      setPayoutStep('pending');
    } catch (e) {
      setPayoutError(e.message);
    }
    setPayoutLoading(false);
  };

  const handleCheckPayoutStatus = async () => {
    if (!statusPayoutId) { setPayoutStatusResult({ error: 'Enter Payout ID' }); return; }
    setPayoutStatusLoading(true);
    setPayoutStatusResult(null);

    try {
      const res = await fetch(`${API_BASE_URL}/v1/payout/status?payoutId=${statusPayoutId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || data.error || 'Failed');
      setPayoutStatusResult(data);
    } catch (e) {
      setPayoutStatusResult({ error: e.message });
    }
    setPayoutStatusLoading(false);
  };

  const resetPayout = () => {
    setPayoutStep('input');
    setPayoutData(null);
    setPayoutError('');
  };

  // ─── DISPUTE ───
  const isPayinDispute = ['payment_not_received', 'wrong_amount', 'duplicate_payment'].includes(disputeType);

  const handleCreateDispute = async () => {
    if (!apiKey) { setDisputeResult({ error: 'API Key required' }); return; }
    if (isPayinDispute && !disputeUpiId && !disputePayinId) {
      setDisputeResult({ error: 'UPI ID or Payin ID required' });
      return;
    }
    if (!isPayinDispute && !disputePayoutId) {
      setDisputeResult({ error: 'Payout ID required' });
      return;
    }
    if (!disputeAmount) { setDisputeResult({ error: 'Amount required' }); return; }

    setDisputeLoading(true);
    setDisputeResult(null);

    try {
      const body = {
        type: disputeType,
        amount: Number(disputeAmount),
        userId: disputeUserId,
        comment: disputeComment || undefined
      };

      if (isPayinDispute) {
        if (disputeUpiId) body.upiId = disputeUpiId;
        if (disputePayinId) body.payinId = disputePayinId;
        if (disputeUtr) body.utr = disputeUtr;
      } else {
        if (disputePayoutId) body.payoutId = disputePayoutId;
      }

      const res = await fetch(`${API_BASE_URL}/v1/dispute/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || data.error || 'Failed');

      setDisputeResult({
        success: true,
        disputeId: data.disputeId || data.dispute_id,
        message: data.message || 'Dispute created'
      });
    } catch (e) {
      setDisputeResult({ error: e.message });
    }
    setDisputeLoading(false);
  };

  const handleCheckDisputeStatus = async () => {
    if (!statusDisputeId) { setDisputeStatusResult({ error: 'Enter Dispute ID' }); return; }
    setDisputeStatusLoading(true);
    setDisputeStatusResult(null);

    try {
      const res = await fetch(`${API_BASE_URL}/v1/dispute/status?disputeId=${statusDisputeId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || data.error || 'Failed');
      setDisputeStatusResult(data);
    } catch (e) {
      setDisputeStatusResult({ error: e.message });
    }
    setDisputeStatusLoading(false);
  };

  const TabButton = ({ id, label, icon: Icon }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex-1 flex items-center justify-center gap-2 py-3 font-semibold transition-all ${
        activeTab === id
          ? 'bg-white text-purple-700 shadow-sm border-b-2 border-purple-500'
          : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      <Icon className="w-4 h-4" />
      <span>{label}</span>
    </button>
  );

  if (loadingKey) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl">
              <Play className="w-5 h-5 text-white" />
            </div>
            API Playground
          </h1>
          <p className="text-slate-500 text-sm mt-1">Test all API endpoints with your key</p>
        </div>
        <div className={`px-3 py-1.5 rounded-full text-xs font-bold ${
          testMode ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
        }`}>
          {testMode ? 'TEST MODE' : 'LIVE MODE'}
        </div>
      </div>

      {/* API Key Input */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-100 rounded-lg">
            <Key className="w-5 h-5 text-slate-600" />
          </div>
          <div className="flex-1">
            <label className="text-xs text-slate-500 uppercase tracking-wide">API Key</label>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste your API key here..."
              className="w-full px-0 py-1 border-0 font-mono text-sm focus:ring-0 bg-transparent"
            />
          </div>
          {apiKey && (
            <div className="flex items-center gap-1 text-green-600">
              <CheckCircle className="w-4 h-4" />
              <span className="text-xs font-medium">Ready</span>
            </div>
          )}
        </div>
      </div>

      {/* No API Key Warning */}
      {!apiKey && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-800">No API Key</p>
            <p className="text-sm text-amber-700">
              Go to <strong>API & Webhooks</strong> to generate your API key, or paste one above.
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex bg-slate-100 rounded-t-xl overflow-hidden">
        <TabButton id="payin" label="Payin" icon={CreditCard} />
        <TabButton id="payout" label="Payout" icon={Send} />
        <TabButton id="dispute" label="Dispute" icon={AlertTriangle} />
      </div>

      <div className="bg-white rounded-b-xl border border-slate-200 shadow-sm overflow-hidden -mt-6">
        {/* ─── PAYIN TAB ─── */}
        {activeTab === 'payin' && (
          <div className="p-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Create Payin */}
              <div className="space-y-4">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-green-600" />
                  Create Payin
                </h3>

                {payinStep === 'input' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Amount (₹500 - ₹50,000)</label>
                      <div className="relative">
                        <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                          type="number"
                          value={payinAmount}
                          onChange={(e) => setPayinAmount(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                      </div>
                    </div>

                    {payinError && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-sm text-red-700">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {payinError}
                      </div>
                    )}

                    <button
                      onClick={handleCreatePayin}
                      disabled={payinLoading || !apiKey}
                      className="w-full py-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {payinLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Zap className="w-4 h-4" /> POST /v1/payin/create</>}
                    </button>
                  </>
                )}

                {payinStep === 'payment' && payinData && (
                  <div className="space-y-4">
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center gap-2">
                      <Clock className="w-5 h-5 text-yellow-600" />
                      <span className="text-sm text-yellow-800">Time: <strong>{formatTime(payinTimer)}</strong></span>
                    </div>

                    <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
                      <div>
                        <label className="text-xs text-slate-500">UPI ID</label>
                        <div className="flex gap-2 mt-1">
                          <input type="text" value={payinData.upiId} readOnly className="flex-1 px-3 py-2 bg-white border rounded-lg font-mono text-sm" />
                          <button onClick={() => copyToClipboard(payinData.upiId)} className="px-3 py-2 bg-green-600 text-white rounded-lg">
                            {copied ? <CheckCircle className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div><span className="text-slate-500">Holder:</span> <strong>{payinData.holderName}</strong></div>
                        <div><span className="text-slate-500">Amount:</span> <strong className="text-green-600">₹{payinData.amount}</strong></div>
                      </div>
                      <div className="text-xs text-slate-500">ID: <span className="font-mono">{payinData.payinId}</span></div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">UTR / Transaction ID</label>
                      <input
                        type="text"
                        value={utrInput}
                        onChange={(e) => setUtrInput(e.target.value)}
                        placeholder="e.g., 412345678901"
                        className="w-full px-4 py-3 border border-slate-300 rounded-xl font-mono"
                      />
                    </div>

                    {payinError && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{payinError}</div>}

                    <button onClick={handleSubmitUtr} disabled={payinLoading || !utrInput} className="w-full py-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2">
                      {payinLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Send className="w-4 h-4" /> PATCH /v1/payin/submit-utr</>}
                    </button>

                    {payinData?.fallbackAvailable && (
                      <button onClick={handleSwitchUpi} disabled={switchingUpi} className="w-full py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 flex items-center justify-center gap-2 border">
                        {switchingUpi ? <Loader2 className="w-5 h-5 animate-spin" /> : <><RotateCcw className="w-4 h-4" /> POST /v1/payin/switch</>}
                      </button>
                    )}
                  </div>
                )}

                {payinStep === 'pending' && (
                  <div className="text-center py-8 space-y-4">
                    <Loader2 className="w-12 h-12 text-green-500 animate-spin mx-auto" />
                    <h3 className="font-semibold">Verifying Payment...</h3>
                    <p className="text-sm text-slate-500">Polling every 5s</p>
                  </div>
                )}

                {payinStep === 'completed' && (
                  <div className="text-center py-8 space-y-4">
                    <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
                    <h3 className="font-semibold text-green-700">Payment Successful!</h3>
                    <button onClick={resetPayin} className="px-4 py-2 bg-slate-100 rounded-lg">New Payment</button>
                  </div>
                )}

                {payinStep === 'failed' && (
                  <div className="text-center py-8 space-y-4">
                    <XCircle className="w-16 h-16 text-red-500 mx-auto" />
                    <h3 className="font-semibold text-red-700">Payment Failed</h3>
                    <p className="text-sm text-slate-600">{payinError}</p>
                    <button onClick={resetPayin} className="px-4 py-2 bg-slate-100 rounded-lg">Try Again</button>
                  </div>
                )}
              </div>

              {/* Check Status */}
              <div className="space-y-4">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <Search className="w-5 h-5 text-blue-600" />
                  Check Status
                </h3>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Payin ID</label>
                  <input
                    type="text"
                    value={statusPayinId}
                    onChange={(e) => setStatusPayinId(e.target.value)}
                    placeholder="Enter Payin ID"
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl font-mono text-sm"
                  />
                </div>

                <button onClick={handleCheckPayinStatus} disabled={statusLoading || !apiKey} className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {statusLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Eye className="w-4 h-4" /> GET /v1/payin/status</>}
                </button>

                {statusResult && (
                  <div className={`rounded-xl p-4 ${statusResult.error ? 'bg-red-50 border border-red-200' : 'bg-slate-50 border border-slate-200'}`}>
                    {statusResult.error ? (
                      <p className="text-red-700 text-sm">{statusResult.error}</p>
                    ) : (
                      <pre className="text-xs font-mono overflow-auto max-h-48">{JSON.stringify(statusResult, null, 2)}</pre>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── PAYOUT TAB ─── */}
        {activeTab === 'payout' && (
          <div className="p-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <Send className="w-5 h-5 text-blue-600" />
                  Create Payout
                </h3>

                {payoutStep === 'input' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Amount (₹5,000 - ₹50,000)</label>
                      <div className="relative">
                        <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input type="number" value={payoutAmount} onChange={(e) => setPayoutAmount(e.target.value)} className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl" />
                      </div>
                    </div>

                    <input type="text" value={bankDetails.accountName} onChange={(e) => setBankDetails({ ...bankDetails, accountName: e.target.value })} placeholder="Account Name" className="w-full px-4 py-3 border border-slate-300 rounded-xl" />
                    <input type="text" value={bankDetails.accountNumber} onChange={(e) => setBankDetails({ ...bankDetails, accountNumber: e.target.value })} placeholder="Account Number *" className="w-full px-4 py-3 border border-slate-300 rounded-xl font-mono" />
                    <input type="text" value={bankDetails.ifsc} onChange={(e) => setBankDetails({ ...bankDetails, ifsc: e.target.value.toUpperCase() })} placeholder="IFSC Code *" className="w-full px-4 py-3 border border-slate-300 rounded-xl font-mono uppercase" />
                    <input type="text" value={bankDetails.upiId} onChange={(e) => setBankDetails({ ...bankDetails, upiId: e.target.value })} placeholder="UPI ID *" className="w-full px-4 py-3 border border-slate-300 rounded-xl font-mono" />

                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">⚡ Both Bank & UPI required</div>

                    {payoutError && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{payoutError}</div>}

                    <button onClick={handleCreatePayout} disabled={payoutLoading || !apiKey} className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                      {payoutLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Zap className="w-4 h-4" /> POST /v1/payout/create</>}
                    </button>
                  </>
                )}

                {payoutStep === 'pending' && (
                  <div className="text-center py-8 space-y-4">
                    <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto" />
                    <h3 className="font-semibold">Payout Created</h3>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                      <p>ID: <span className="font-mono">{payoutData?.payoutId}</span></p>
                      <p>Amount: ₹{payoutData?.amount}</p>
                    </div>
                    <button onClick={resetPayout} className="px-4 py-2 bg-slate-100 rounded-lg">New Payout</button>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <Search className="w-5 h-5 text-blue-600" />
                  Check Status
                </h3>

                <input type="text" value={statusPayoutId} onChange={(e) => setStatusPayoutId(e.target.value)} placeholder="Payout ID or Order ID" className="w-full px-4 py-3 border border-slate-300 rounded-xl font-mono text-sm" />

                <button onClick={handleCheckPayoutStatus} disabled={payoutStatusLoading || !apiKey} className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {payoutStatusLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Eye className="w-4 h-4" /> GET /v1/payout/status</>}
                </button>

                {payoutStatusResult && (
                  <div className={`rounded-xl p-4 ${payoutStatusResult.error ? 'bg-red-50 border border-red-200' : 'bg-slate-50 border border-slate-200'}`}>
                    {payoutStatusResult.error ? <p className="text-red-700 text-sm">{payoutStatusResult.error}</p> : <pre className="text-xs font-mono overflow-auto max-h-48">{JSON.stringify(payoutStatusResult, null, 2)}</pre>}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── DISPUTE TAB ─── */}
        {activeTab === 'dispute' && (
          <div className="p-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-orange-600" />
                  Create Dispute
                </h3>

                <select value={disputeType} onChange={(e) => setDisputeType(e.target.value)} className="w-full px-4 py-3 border border-slate-300 rounded-xl">
                  <optgroup label="Payin Disputes">
                    <option value="payment_not_received">payment_not_received</option>
                    <option value="wrong_amount">wrong_amount</option>
                    <option value="duplicate_payment">duplicate_payment</option>
                  </optgroup>
                  <optgroup label="Payout Disputes">
                    <option value="payout_not_received">payout_not_received</option>
                  </optgroup>
                </select>

                {isPayinDispute ? (
                  <>
                    <input type="text" value={disputeUpiId} onChange={(e) => setDisputeUpiId(e.target.value)} placeholder="UPI ID" className="w-full px-4 py-3 border border-slate-300 rounded-xl font-mono" />
                    <input type="text" value={disputePayinId} onChange={(e) => setDisputePayinId(e.target.value)} placeholder="OR Payin ID" className="w-full px-4 py-3 border border-slate-300 rounded-xl font-mono" />
                    <input type="text" value={disputeUtr} onChange={(e) => setDisputeUtr(e.target.value)} placeholder="UTR (optional)" className="w-full px-4 py-3 border border-slate-300 rounded-xl font-mono" />
                  </>
                ) : (
                  <input type="text" value={disputePayoutId} onChange={(e) => setDisputePayoutId(e.target.value)} placeholder="Payout ID or Order ID *" className="w-full px-4 py-3 border border-slate-300 rounded-xl font-mono" />
                )}

                <input type="number" value={disputeAmount} onChange={(e) => setDisputeAmount(e.target.value)} placeholder="Amount *" className="w-full px-4 py-3 border border-slate-300 rounded-xl" />
                <input type="text" value={disputeUserId} onChange={(e) => setDisputeUserId(e.target.value)} placeholder="User ID" className="w-full px-4 py-3 border border-slate-300 rounded-xl" />
                <textarea value={disputeComment} onChange={(e) => setDisputeComment(e.target.value)} placeholder="Comment" rows={2} className="w-full px-4 py-3 border border-slate-300 rounded-xl resize-none" />

                {disputeResult && (
                  <div className={`rounded-lg p-3 ${disputeResult.error ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
                    {disputeResult.error ? <p className="text-red-700 text-sm">{disputeResult.error}</p> : (
                      <div className="text-green-700 text-sm">
                        <p className="font-semibold">✓ {disputeResult.message}</p>
                        <p className="font-mono text-xs mt-1">ID: {disputeResult.disputeId}</p>
                      </div>
                    )}
                  </div>
                )}

                <button onClick={handleCreateDispute} disabled={disputeLoading || !apiKey} className="w-full py-3 bg-orange-600 text-white font-semibold rounded-xl hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {disputeLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><MessageSquare className="w-4 h-4" /> POST /v1/dispute/create</>}
                </button>
              </div>

              <div className="space-y-4">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <Search className="w-5 h-5 text-orange-600" />
                  Check Status
                </h3>

                <input type="text" value={statusDisputeId} onChange={(e) => setStatusDisputeId(e.target.value)} placeholder="Dispute ID" className="w-full px-4 py-3 border border-slate-300 rounded-xl font-mono text-sm" />

                <button onClick={handleCheckDisputeStatus} disabled={disputeStatusLoading || !apiKey} className="w-full py-3 bg-orange-600 text-white font-semibold rounded-xl hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {disputeStatusLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Eye className="w-4 h-4" /> GET /v1/dispute/status</>}
                </button>

                {disputeStatusResult && (
                  <div className={`rounded-xl p-4 ${disputeStatusResult.error ? 'bg-red-50 border border-red-200' : 'bg-slate-50 border border-slate-200'}`}>
                    {disputeStatusResult.error ? <p className="text-red-700 text-sm">{disputeStatusResult.error}</p> : <pre className="text-xs font-mono overflow-auto max-h-48">{JSON.stringify(disputeStatusResult, null, 2)}</pre>}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="bg-slate-800 rounded-xl p-4 text-white flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-400">Base URL:</span>
          <code className="text-green-400">{API_BASE_URL}</code>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <span>Rate: <span className="text-white">60/min</span></span>
          <span>Payin: <span className="text-white">₹500-50K</span></span>
          <span>Payout: <span className="text-white">₹5K-50K</span></span>
        </div>
      </div>
    </div>
  );
};

export default ApiTest;
