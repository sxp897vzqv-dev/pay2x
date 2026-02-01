import React, { useState, useEffect } from 'react';
import { db, auth } from '../../../../firebase';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, orderBy, limit as fbLimit } from 'firebase/firestore';
import {
  Key, Link2, Shield, Copy, Check, RefreshCw, Send,
  Eye, EyeOff, AlertTriangle, Save, TestTube, X, User,
  Mail, Phone, Building, Globe, Code, Webhook, 
  Activity, Settings as SettingsIcon, Lock, ExternalLink
} from 'lucide-react';

export default function MerchantSettings() {
  const [merchantData, setMerchantData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('api'); // api, webhook, business, security
  const [copied, setCopied] = useState({});
  const [showSecrets, setShowSecrets] = useState({});
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookLogs, setWebhookLogs] = useState([]);
  
  // Form state
  const [form, setForm] = useState({
    // Business Info
    businessName: '',
    contactPerson: '',
    email: '',
    phone: '',
    website: '',
    
    // API Settings
    webhookUrl: '',
    testMode: true,
    
    // Notification Settings
    emailNotifications: true,
    webhookNotifications: true
  });

  useEffect(() => {
    fetchMerchantData();
    fetchWebhookLogs();
  }, []);

  const fetchMerchantData = async () => {
    setLoading(true);
    try {
      const merchantId = auth.currentUser.uid;
      const docSnap = await getDoc(doc(db, 'merchant', merchantId));
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        setMerchantData(data);
        setForm({
          businessName: data.businessName || '',
          contactPerson: data.contactPerson || '',
          email: data.email || '',
          phone: data.phone || '',
          website: data.website || '',
          webhookUrl: data.webhookUrl || '',
          testMode: data.testMode !== false,
          emailNotifications: data.emailNotifications !== false,
          webhookNotifications: data.webhookNotifications !== false
        });
      }
    } catch (error) {
      console.error('Failed to fetch merchant data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchWebhookLogs = async () => {
    try {
      const merchantId = auth.currentUser.uid;
      const q = query(
        collection(db, 'webhookLogs'),
        where('merchantId', '==', merchantId),
        orderBy('sentAt', 'desc'),
        fbLimit(10)
      );
      
      const snapshot = await getDocs(q);
      const logs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setWebhookLogs(logs);
    } catch (error) {
      console.error('Failed to fetch webhook logs:', error);
    }
  };

  const handleCopy = async (text, field) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(prev => ({ ...prev, [field]: true }));
      setTimeout(() => {
        setCopied(prev => ({ ...prev, [field]: false }));
      }, 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const generateApiKey = () => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return 'sk_live_' + Array.from(array, byte => 
      byte.toString(16).padStart(2, '0')
    ).join('');
  };

  const generateWebhookSecret = () => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return 'whsec_' + Array.from(array, byte => 
      byte.toString(16).padStart(2, '0')
    ).join('');
  };

  const regenerateApiKey = async () => {
    if (!confirm('⚠️ Regenerate API Key?\n\nYour current API key will stop working immediately. Update your integration before regenerating.\n\nContinue?')) {
      return;
    }
    
    setSaving(true);
    try {
      const merchantId = auth.currentUser.uid;
      const newApiKey = generateApiKey();
      
      await updateDoc(doc(db, 'merchant', merchantId), {
        apiKey: newApiKey,
        apiKeyUpdatedAt: new Date()
      });
      
      setMerchantData(prev => ({ ...prev, apiKey: newApiKey }));
      alert('✅ API Key regenerated successfully!\n\nNew Key: ' + newApiKey + '\n\n⚠️ Update this in your integration immediately!');
      
      // Auto copy new key
      await handleCopy(newApiKey, 'apiKey');
      
    } catch (error) {
      console.error('Failed to regenerate API key:', error);
      alert('❌ Failed to regenerate API key. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const regenerateWebhookSecret = async () => {
    if (!confirm('⚠️ Regenerate Webhook Secret?\n\nYour current webhook secret will be invalidated. You will need to update it in your application.\n\nContinue?')) {
      return;
    }
    
    setSaving(true);
    try {
      const merchantId = auth.currentUser.uid;
      const newSecret = generateWebhookSecret();
      
      await updateDoc(doc(db, 'merchant', merchantId), {
        webhookSecret: newSecret,
        webhookSecretUpdatedAt: new Date()
      });
      
      setMerchantData(prev => ({ ...prev, webhookSecret: newSecret }));
      alert('✅ Webhook Secret regenerated successfully!\n\nNew Secret: ' + newSecret + '\n\n⚠️ Update this in your webhook handler!');
      
      // Auto copy new secret
      await handleCopy(newSecret, 'webhookSecret');
      
    } catch (error) {
      console.error('Failed to regenerate webhook secret:', error);
      alert('❌ Failed to regenerate webhook secret. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const merchantId = auth.currentUser.uid;
      
      await updateDoc(doc(db, 'merchant', merchantId), {
        businessName: form.businessName,
        contactPerson: form.contactPerson,
        phone: form.phone,
        website: form.website,
        webhookUrl: form.webhookUrl,
        testMode: form.testMode,
        emailNotifications: form.emailNotifications,
        webhookNotifications: form.webhookNotifications,
        updatedAt: new Date()
      });
      
      alert('✅ Settings saved successfully!');
      fetchMerchantData();
      
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('❌ Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const testWebhook = async () => {
    if (!form.webhookUrl) {
      alert('⚠️ Please enter a webhook URL first.');
      return;
    }
    
    setTestingWebhook(true);
    try {
      const testPayload = {
        event: 'payment.test',
        timestamp: Date.now(),
        data: {
          payinId: 'test_' + Date.now(),
          orderId: 'TEST_ORDER_123',
          amount: 1000,
          status: 'completed',
          utrId: 'TEST123456789',
          test: true,
          message: 'This is a test webhook from Pay2X'
        }
      };
      
      const response = await fetch(form.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Event': 'payment.test',
          'User-Agent': 'Pay2X-Webhooks/1.0'
        },
        body: JSON.stringify(testPayload)
      });
      
      if (response.ok) {
        alert(`✅ Webhook test successful!\n\nStatus: ${response.status} ${response.statusText}\n\nYour webhook endpoint is working correctly!`);
      } else {
        const text = await response.text();
        alert(`⚠️ Webhook test failed!\n\nStatus: ${response.status} ${response.statusText}\n\nResponse: ${text.substring(0, 200)}\n\nPlease check your endpoint and try again.`);
      }
      
      fetchWebhookLogs();
      
    } catch (error) {
      console.error('Webhook test failed:', error);
      alert(`❌ Webhook test failed!\n\nError: ${error.message}\n\nPlease check:\n• URL is correct and accessible\n• Endpoint accepts POST requests\n• No firewall blocking the request`);
    } finally {
      setTestingWebhook(false);
    }
  };

  const toggleTestMode = async () => {
    const newMode = !form.testMode;
    const message = newMode 
      ? '🧪 Switch to Test Mode?\n\nTest mode allows safe testing without processing real payments.'
      : '🔴 Switch to Live Mode?\n\nLive mode will process REAL payments. Make sure your integration is ready!';
    
    if (!confirm(message)) {
      return;
    }
    
    setSaving(true);
    try {
      const merchantId = auth.currentUser.uid;
      await updateDoc(doc(db, 'merchant', merchantId), {
        testMode: newMode,
        updatedAt: new Date()
      });
      
      setForm(prev => ({ ...prev, testMode: newMode }));
      alert(newMode ? '✅ Switched to Test Mode' : '✅ Switched to Live Mode');
      
    } catch (error) {
      console.error('Failed to toggle mode:', error);
      alert('Failed to switch mode');
    } finally {
      setSaving(false);
    }
  };

  const maskSecret = (secret) => {
    if (!secret) return '';
    return secret.substring(0, 10) + '•'.repeat(Math.max(0, secret.length - 14)) + secret.substring(secret.length - 4);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'api', label: 'API Keys', icon: Key },
    { id: 'webhook', label: 'Webhooks', icon: Webhook },
    { id: 'business', label: 'Business Info', icon: Building },
    { id: 'security', label: 'Security', icon: Shield }
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Settings</h1>
        <p className="text-gray-600">Manage your account, API keys, and integration settings</p>
      </div>

      {/* Test Mode Banner */}
      {form.testMode && (
        <div className="mb-6 bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg">
          <div className="flex items-center gap-3">
            <TestTube className="w-6 h-6 text-yellow-600" />
            <div className="flex-1">
              <h3 className="font-semibold text-yellow-800">Test Mode Active</h3>
              <p className="text-sm text-yellow-700 mt-1">
                You're in test mode. No real payments will be processed. Switch to live mode when ready.
              </p>
            </div>
            <button
              onClick={toggleTestMode}
              className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors text-sm font-medium"
            >
              Go Live
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-md mb-6">
        <div className="border-b border-gray-200">
          <div className="flex overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-4 font-medium transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'api' && (
            <APIKeysTab
              merchantData={merchantData}
              form={form}
              showSecrets={showSecrets}
              setShowSecrets={setShowSecrets}
              copied={copied}
              handleCopy={handleCopy}
              regenerateApiKey={regenerateApiKey}
              saving={saving}
              maskSecret={maskSecret}
            />
          )}

          {activeTab === 'webhook' && (
            <WebhookTab
              merchantData={merchantData}
              form={form}
              setForm={setForm}
              webhookLogs={webhookLogs}
              testingWebhook={testingWebhook}
              testWebhook={testWebhook}
              saveSettings={saveSettings}
              saving={saving}
              regenerateWebhookSecret={regenerateWebhookSecret}
              showSecrets={showSecrets}
              setShowSecrets={setShowSecrets}
              copied={copied}
              handleCopy={handleCopy}
              maskSecret={maskSecret}
              fetchWebhookLogs={fetchWebhookLogs}
            />
          )}

          {activeTab === 'business' && (
            <BusinessInfoTab
              form={form}
              setForm={setForm}
              saveSettings={saveSettings}
              saving={saving}
            />
          )}

          {activeTab === 'security' && (
            <SecurityTab
              form={form}
              toggleTestMode={toggleTestMode}
              saving={saving}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// API Keys Tab
function APIKeysTab({ merchantData, form, showSecrets, setShowSecrets, copied, handleCopy, regenerateApiKey, saving, maskSecret }) {
  return (
    <div className="space-y-6">
      {/* API Key Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-800">API Key</h3>
            <p className="text-sm text-gray-600 mt-1">
              Use this key to authenticate API requests
            </p>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
            form.testMode 
              ? 'bg-yellow-100 text-yellow-700'
              : 'bg-green-100 text-green-700'
          }`}>
            {form.testMode ? 'Test Mode' : 'Live Mode'}
          </span>
        </div>

        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center gap-3 mb-3">
            <code className="flex-1 text-sm font-mono text-gray-800 break-all">
              {showSecrets.apiKey ? merchantData?.apiKey : maskSecret(merchantData?.apiKey)}
            </code>
            <button
              onClick={() => setShowSecrets(prev => ({ ...prev, apiKey: !prev.apiKey }))}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
              title={showSecrets.apiKey ? 'Hide' : 'Show'}
            >
              {showSecrets.apiKey ? (
                <EyeOff className="w-5 h-5 text-gray-600" />
              ) : (
                <Eye className="w-5 h-5 text-gray-600" />
              )}
            </button>
            <button
              onClick={() => handleCopy(merchantData?.apiKey, 'apiKey')}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
              title="Copy"
            >
              {copied.apiKey ? (
                <Check className="w-5 h-5 text-green-600" />
              ) : (
                <Copy className="w-5 h-5 text-gray-600" />
              )}
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={regenerateApiKey}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 text-sm"
            >
              <RefreshCw className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
              Regenerate Key
            </button>
          </div>
        </div>

        {/* Warning */}
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>⚠️ Keep your API key secret!</strong> Never share it publicly or commit it to version control.
          </p>
        </div>
      </div>

      {/* Usage Example */}
      <div>
        <h3 className="text-lg font-bold text-gray-800 mb-4">Usage Example</h3>
        <div className="bg-gray-900 rounded-lg p-4">
          <pre className="text-sm text-gray-100 overflow-x-auto">
{`curl -X POST https://api.pay2x.com/v1/payin/create \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 1000,
    "userId": "customer_123",
    "orderId": "ORDER_001"
  }'`}
          </pre>
        </div>
      </div>

      {/* API Documentation Link */}
      <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
        <div className="flex items-start gap-3">
          <Code className="w-5 h-5 text-purple-600 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-semibold text-purple-900">Need integration help?</h4>
            <p className="text-sm text-purple-800 mt-1">
              Check out our complete API documentation with code examples in multiple languages.
            </p>
            <a
              href="/merchant/documentation"
              className="inline-flex items-center gap-1 mt-3 text-sm text-purple-600 hover:text-purple-700 font-medium"
            >
              View API Documentation
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// Webhook Tab
function WebhookTab({ 
  merchantData, 
  form, 
  setForm, 
  webhookLogs, 
  testingWebhook, 
  testWebhook, 
  saveSettings, 
  saving,
  regenerateWebhookSecret,
  showSecrets,
  setShowSecrets,
  copied,
  handleCopy,
  maskSecret,
  fetchWebhookLogs
}) {
  return (
    <div className="space-y-6">
      {/* Webhook URL */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Webhook URL
        </label>
        <input
          type="url"
          value={form.webhookUrl}
          onChange={(e) => setForm(prev => ({ ...prev, webhookUrl: e.target.value }))}
          placeholder="https://your-site.com/api/webhook"
          className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-500 mt-2">
          We'll send payment notifications to this URL. Must be HTTPS in production.
        </p>
      </div>

      {/* Webhook Secret */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Webhook Secret
        </label>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center gap-3 mb-3">
            <code className="flex-1 text-sm font-mono text-gray-800 break-all">
              {showSecrets.webhookSecret ? merchantData?.webhookSecret : maskSecret(merchantData?.webhookSecret)}
            </code>
            <button
              onClick={() => setShowSecrets(prev => ({ ...prev, webhookSecret: !prev.webhookSecret }))}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            >
              {showSecrets.webhookSecret ? (
                <EyeOff className="w-5 h-5 text-gray-600" />
              ) : (
                <Eye className="w-5 h-5 text-gray-600" />
              )}
            </button>
            <button
              onClick={() => handleCopy(merchantData?.webhookSecret, 'webhookSecret')}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            >
              {copied.webhookSecret ? (
                <Check className="w-5 h-5 text-green-600" />
              ) : (
                <Copy className="w-5 h-5 text-gray-600" />
              )}
            </button>
          </div>

          <button
            onClick={regenerateWebhookSecret}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
            Regenerate Secret
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Use this secret to verify webhook signatures and ensure requests come from Pay2X.
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={saveSettings}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Settings'}
        </button>

        <button
          onClick={testWebhook}
          disabled={testingWebhook || !form.webhookUrl}
          className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
        >
          {testingWebhook ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Testing...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Send Test Webhook
            </>
          )}
        </button>
      </div>

      {/* Integration Guide */}
      <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
        <h4 className="font-semibold text-green-900 mb-2">Webhook Integration Guide</h4>
        <ol className="text-sm text-green-800 space-y-1 list-decimal list-inside">
          <li>Set up a POST endpoint at your webhook URL</li>
          <li>Verify the webhook signature using your secret</li>
          <li>Respond with 200 OK within 5 seconds</li>
          <li>Process the payment data asynchronously</li>
        </ol>
        <a
          href="/merchant/documentation#webhooks"
          className="inline-flex items-center gap-1 mt-3 text-sm text-green-600 hover:text-green-700 font-medium"
        >
          View Webhook Documentation
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      {/* Webhook Logs */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">Recent Webhook Deliveries</h3>
          <button
            onClick={fetchWebhookLogs}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Timestamp</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Event</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Status</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Response</th>
              </tr>
            </thead>
            <tbody>
              {webhookLogs.length > 0 ? (
                webhookLogs.map((log) => (
                  <WebhookLogRow key={log.id} log={log} />
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="text-center py-8 text-gray-500">
                    No webhook deliveries yet
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

// Business Info Tab
function BusinessInfoTab({ form, setForm, saveSettings, saving }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Business Name
          </label>
          <input
            type="text"
            value={form.businessName}
            onChange={(e) => setForm(prev => ({ ...prev, businessName: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Contact Person
          </label>
          <input
            type="text"
            value={form.contactPerson}
            onChange={(e) => setForm(prev => ({ ...prev, contactPerson: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Email
          </label>
          <input
            type="email"
            value={form.email}
            disabled
            className="w-full border border-gray-300 rounded-lg px-4 py-3 bg-gray-100 cursor-not-allowed"
          />
          <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Phone
          </label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))}
            placeholder="+91 98765 43210"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Website
          </label>
          <input
            type="url"
            value={form.website}
            onChange={(e) => setForm(prev => ({ ...prev, website: e.target.value }))}
            placeholder="https://your-website.com"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <button
        onClick={saveSettings}
        disabled={saving}
        className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
      >
        <Save className="w-4 h-4" />
        {saving ? 'Saving...' : 'Save Changes'}
      </button>
    </div>
  );
}

// Security Tab
function SecurityTab({ form, toggleTestMode, saving }) {
  return (
    <div className="space-y-6">
      {/* Test/Live Mode */}
      <div className="p-6 border border-gray-200 rounded-lg">
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-lg ${form.testMode ? 'bg-yellow-100' : 'bg-green-100'}`}>
            {form.testMode ? (
              <TestTube className="w-6 h-6 text-yellow-600" />
            ) : (
              <Activity className="w-6 h-6 text-green-600" />
            )}
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-800">
              {form.testMode ? 'Test Mode' : 'Live Mode'}
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              {form.testMode 
                ? 'Test mode is active. No real payments will be processed.'
                : 'Live mode is active. Real payments are being processed.'}
            </p>
            <button
              onClick={toggleTestMode}
              disabled={saving}
              className={`mt-4 px-6 py-2 rounded-lg font-medium transition-colors ${
                form.testMode
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-yellow-600 text-white hover:bg-yellow-700'
              }`}
            >
              {form.testMode ? 'Switch to Live Mode' : 'Switch to Test Mode'}
            </button>
          </div>
        </div>
      </div>

      {/* Security Best Practices */}
      <div className="p-6 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="font-bold text-blue-900 mb-4">🔒 Security Best Practices</h3>
        <ul className="space-y-2 text-sm text-blue-800">
          <li className="flex items-start gap-2">
            <Check className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <span>Always verify webhook signatures before processing payments</span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <span>Store API keys in environment variables, never in code</span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <span>Use HTTPS for all API requests and webhook endpoints</span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <span>Regenerate API keys regularly for enhanced security</span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <span>Monitor webhook logs for suspicious activity</span>
          </li>
        </ul>
      </div>

      {/* Account Info */}
      <div className="p-6 border border-gray-200 rounded-lg">
        <h3 className="font-bold text-gray-800 mb-4">Account Information</h3>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Account Status:</span>
            <span className="font-semibold text-green-600">Active</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Mode:</span>
            <span className="font-semibold">
              {form.testMode ? 'Test' : 'Live'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Webhook Log Row Component
function WebhookLogRow({ log }) {
  const formatDateTime = (timestamp) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status) => {
    const styles = {
      success: 'bg-green-100 text-green-700',
      failed: 'bg-red-100 text-red-700',
      pending: 'bg-yellow-100 text-yellow-700'
    };

    const icons = {
      success: <Check className="w-3 h-3" />,
      failed: <X className="w-3 h-3" />,
      pending: <RefreshCw className="w-3 h-3" />
    };

    return (
      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${styles[status] || styles.pending}`}>
        {icons[status] || icons.pending}
        {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Pending'}
      </span>
    );
  };

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="py-3 px-4 text-sm text-gray-700">
        {formatDateTime(log.sentAt)}
      </td>
      <td className="py-3 px-4 text-sm font-mono text-gray-700">
        {log.event || 'payment.completed'}
      </td>
      <td className="py-3 px-4">
        {getStatusBadge(log.status)}
      </td>
      <td className="py-3 px-4 text-sm text-gray-600">
        {log.statusCode || '-'}
      </td>
    </tr>
  );
}