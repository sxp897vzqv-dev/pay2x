import React, { useState, useEffect } from 'react';
import { getAuth } from 'firebase/auth';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../../firebase';
import { Code, Copy, CheckCircle, Key, Webhook as WebhookIcon, FileText, DollarSign, Settings as SettingsIcon } from 'lucide-react';

// ============= API DOCUMENTATION =============
export const MerchantApiDocs = () => {
  const [apiKey, setApiKey] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchApiKey();
  }, []);

  const fetchApiKey = async () => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) return;

    const q = query(collection(db, 'merchant'), where('uid', '==', user.uid));
    const snap = await getDocs(q);
    if (!snap.empty) {
      setApiKey(snap.docs[0].data().apiKey || '');
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">API Documentation</h1>
        <p className="text-slate-600 mt-1">Integration guide for Pay2x Payment Gateway</p>
      </div>

      {/* API Key Section */}
      <div className="bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl p-8 text-white">
        <div className="flex items-center gap-3 mb-4">
          <Key className="w-8 h-8" />
          <h2 className="text-2xl font-bold">Your API Key</h2>
        </div>
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 flex items-center justify-between">
          <code className="text-white font-mono text-sm break-all">{apiKey || 'Loading...'}</code>
          <button
            onClick={() => copyToClipboard(apiKey)}
            className="ml-4 p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
          >
            {copied ? <CheckCircle className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
          </button>
        </div>
        <p className="text-teal-100 text-sm mt-3">Keep this key secure. Do not share it publicly.</p>
      </div>

      {/* API Endpoints */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
        <h2 className="text-xl font-bold text-slate-900 mb-4">API Endpoints</h2>
        
        <div className="space-y-6">
          {/* Create Payin */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-semibold">POST</span>
              <code className="text-sm font-mono">/api/v1/payin/create</code>
            </div>
            <p className="text-sm text-slate-600 mb-3">Create a new payin transaction</p>
            <div className="bg-slate-50 rounded-lg p-4">
              <pre className="text-xs overflow-x-auto">
{`{
  "amount": 1000,
  "userId": "user_12345",
  "orderId": "order_xyz",
  "redirectUrl": "https://yoursite.com/success",
  "webhookUrl": "https://yoursite.com/webhook"
}`}
              </pre>
            </div>
          </div>

          {/* Check Status */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-semibold">GET</span>
              <code className="text-sm font-mono">/api/v1/transaction/status/:id</code>
            </div>
            <p className="text-sm text-slate-600">Check transaction status</p>
          </div>

          {/* Create Payout */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-semibold">POST</span>
              <code className="text-sm font-mono">/api/v1/payout/create</code>
            </div>
            <p className="text-sm text-slate-600 mb-3">Initiate a payout</p>
            <div className="bg-slate-50 rounded-lg p-4">
              <pre className="text-xs overflow-x-auto">
{`{
  "amount": 5000,
  "accountNumber": "1234567890",
  "ifscCode": "SBIN0001234",
  "accountName": "John Doe",
  "userId": "user_12345"
}`}
              </pre>
            </div>
          </div>
        </div>
      </div>

      {/* Authentication */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
        <h2 className="text-xl font-bold text-slate-900 mb-4">Authentication</h2>
        <p className="text-sm text-slate-600 mb-3">Include your API key in the request headers:</p>
        <div className="bg-slate-50 rounded-lg p-4">
          <pre className="text-xs overflow-x-auto">
{`Authorization: Bearer ${apiKey}
Content-Type: application/json`}
          </pre>
        </div>
      </div>

      {/* Response Codes */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
        <h2 className="text-xl font-bold text-slate-900 mb-4">Response Codes</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="font-mono">200</span>
            <span className="text-slate-600">Success</span>
          </div>
          <div className="flex justify-between">
            <span className="font-mono">400</span>
            <span className="text-slate-600">Bad Request</span>
          </div>
          <div className="flex justify-between">
            <span className="font-mono">401</span>
            <span className="text-slate-600">Unauthorized</span>
          </div>
          <div className="flex justify-between">
            <span className="font-mono">500</span>
            <span className="text-slate-600">Server Error</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============= WEBHOOKS =============
export const MerchantWebhooks = () => {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchWebhookUrl();
  }, []);

  const fetchWebhookUrl = async () => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) return;

    const q = query(collection(db, 'merchant'), where('uid', '==', user.uid));
    const snap = await getDocs(q);
    if (!snap.empty) {
      setWebhookUrl(snap.docs[0].data().webhookUrl || '');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) return;

      const q = query(collection(db, 'merchant'), where('uid', '==', user.uid));
      const snap = await getDocs(q);
      if (!snap.empty) {
        await updateDoc(doc(db, 'merchant', snap.docs[0].id), {
          webhookUrl,
        });
        alert('Webhook URL saved successfully!');
      }
    } catch (error) {
      alert('Error saving webhook URL: ' + error.message);
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Webhooks</h1>
        <p className="text-slate-600 mt-1">Configure webhook URLs for transaction updates</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center gap-3 mb-4">
          <WebhookIcon className="w-6 h-6 text-teal-600" />
          <h2 className="text-xl font-bold text-slate-900">Webhook Configuration</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Webhook URL
            </label>
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://yoursite.com/webhook"
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
            <p className="text-xs text-slate-500 mt-2">
              We'll send POST requests to this URL when transaction status changes
            </p>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Webhook URL'}
          </button>
        </div>
      </div>

      {/* Webhook Payload Example */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
        <h2 className="text-xl font-bold text-slate-900 mb-4">Webhook Payload Example</h2>
        <div className="bg-slate-50 rounded-lg p-4">
          <pre className="text-xs overflow-x-auto">
{`{
  "event": "transaction.completed",
  "transactionId": "txn_123456",
  "orderId": "order_xyz",
  "amount": 1000,
  "status": "completed",
  "timestamp": "2024-01-22T10:30:00Z"
}`}
          </pre>
        </div>
      </div>

      {/* Events */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
        <h2 className="text-xl font-bold text-slate-900 mb-4">Webhook Events</h2>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
              transaction.completed
            </span>
            <span className="text-sm text-slate-600">Payment successful</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
              transaction.failed
            </span>
            <span className="text-sm text-slate-600">Payment failed</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm font-medium">
              transaction.pending
            </span>
            <span className="text-sm text-slate-600">Payment pending</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============= SETTLEMENTS =============
export const MerchantSettlements = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Settlements</h1>
        <p className="text-slate-600 mt-1">View your settlement history and pending amounts</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white">
          <DollarSign className="w-8 h-8 mb-3 opacity-80" />
          <p className="text-green-100 text-sm mb-1">Settled Amount</p>
          <p className="text-3xl font-bold">₹0</p>
        </div>
        <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl p-6 text-white">
          <DollarSign className="w-8 h-8 mb-3 opacity-80" />
          <p className="text-yellow-100 text-sm mb-1">Pending Settlement</p>
          <p className="text-3xl font-bold">₹0</p>
        </div>
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white">
          <DollarSign className="w-8 h-8 mb-3 opacity-80" />
          <p className="text-blue-100 text-sm mb-1">Next Settlement</p>
          <p className="text-lg font-bold">T+1 (Tomorrow)</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-12 text-center">
        <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-900 mb-2">Settlement History</h2>
        <p className="text-slate-500">
          Your settlement history will appear here once transactions are settled
        </p>
      </div>
    </div>
  );
};

// ============= REPORTS =============
export const MerchantReports = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Reports</h1>
        <p className="text-slate-600 mt-1">Download transaction and financial reports</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 hover:shadow-md transition-all cursor-pointer">
          <FileText className="w-8 h-8 text-teal-600 mb-3" />
          <h3 className="font-bold text-slate-900 mb-2">Daily Report</h3>
          <p className="text-sm text-slate-600 mb-4">Download today's transaction summary</p>
          <button className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-medium">
            Download
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 hover:shadow-md transition-all cursor-pointer">
          <FileText className="w-8 h-8 text-blue-600 mb-3" />
          <h3 className="font-bold text-slate-900 mb-2">Monthly Report</h3>
          <p className="text-sm text-slate-600 mb-4">Download this month's complete report</p>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
            Download
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 hover:shadow-md transition-all cursor-pointer">
          <FileText className="w-8 h-8 text-purple-600 mb-3" />
          <h3 className="font-bold text-slate-900 mb-2">Custom Report</h3>
          <p className="text-sm text-slate-600 mb-4">Generate report for custom date range</p>
          <button className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium">
            Generate
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 hover:shadow-md transition-all cursor-pointer">
          <FileText className="w-8 h-8 text-orange-600 mb-3" />
          <h3 className="font-bold text-slate-900 mb-2">Settlement Report</h3>
          <p className="text-sm text-slate-600 mb-4">Download settlement summary</p>
          <button className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm font-medium">
            Download
          </button>
        </div>
      </div>
    </div>
  );
};

// ============= SETTINGS =============
export const MerchantSettings = () => {
  const [formData, setFormData] = useState({
    businessName: '',
    contactPerson: '',
    email: '',
    phone: '',
    webhookUrl: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) return;

    const q = query(collection(db, 'merchant'), where('uid', '==', user.uid));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const data = snap.docs[0].data();
      setFormData({
        businessName: data.businessName || '',
        contactPerson: data.contactPerson || '',
        email: data.email || '',
        phone: data.phone || '',
        webhookUrl: data.webhookUrl || '',
      });
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) return;

      const q = query(collection(db, 'merchant'), where('uid', '==', user.uid));
      const snap = await getDocs(q);
      if (!snap.empty) {
        await updateDoc(doc(db, 'merchant', snap.docs[0].id), formData);
        alert('Settings saved successfully!');
      }
    } catch (error) {
      alert('Error saving settings: ' + error.message);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-600 mt-1">Manage your merchant account settings</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center gap-3 mb-6">
          <SettingsIcon className="w-6 h-6 text-teal-600" />
          <h2 className="text-xl font-bold text-slate-900">Business Information</h2>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Business Name
              </label>
              <input
                type="text"
                value={formData.businessName}
                onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Contact Person
              </label>
              <input
                type="text"
                value={formData.contactPerson}
                onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                disabled
                className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Phone
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Webhook URL
            </label>
            <input
              type="url"
              value={formData.webhookUrl}
              onChange={(e) => setFormData({ ...formData, webhookUrl: e.target.value })}
              placeholder="https://yoursite.com/webhook"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>

          <div className="pt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};