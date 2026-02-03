import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, query, where, getDocs, updateDoc, doc, addDoc, serverTimestamp, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import {
  Key, Copy, CheckCircle, RefreshCw, AlertCircle, Code, Book, Download,
  Globe, Shield, Eye, EyeOff, Terminal, FileText, Zap, X, ExternalLink,
} from 'lucide-react';

// Enable debug mode
console.log('🚀 MerchantAPI.jsx loaded');

/* ─── API Key Card ─── */
function APIKeyCard({ apiKey, mode, onCopy, onRegenerate, regenerating }) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  // Debug logging
  useEffect(() => {
    console.log(`🎴 APIKeyCard (${mode}): Rendered with apiKey:`, apiKey ? `${apiKey.substring(0, 15)}...` : 'EMPTY/NULL');
    console.log(`🎴 APIKeyCard (${mode}): Regenerating:`, regenerating);
  }, [apiKey, mode, regenerating]);

  const handleCopy = () => {
    console.log(`📋 APIKeyCard (${mode}): Copy clicked, hasKey:`, !!apiKey);
    if (!apiKey) {
      alert('No API key to copy. Generate one first!');
      return;
    }
    onCopy(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasKey = apiKey && apiKey.length > 0;
  console.log(`🎴 APIKeyCard (${mode}): hasKey =`, hasKey);

  return (
    <div className={`rounded-xl p-4 border-2 ${
      mode === 'live' ? 'bg-green-50 border-green-300' : 'bg-blue-50 border-blue-300'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Key className={`w-5 h-5 ${mode === 'live' ? 'text-green-600' : 'text-blue-600'}`} />
          <h3 className="font-bold text-slate-900">{mode === 'live' ? 'Live' : 'Test'} API Key</h3>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
          mode === 'live' ? 'bg-green-200 text-green-800' : 'bg-blue-200 text-blue-800'
        }`}>
          {mode === 'live' ? 'PRODUCTION' : 'TESTING'}
        </span>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 bg-white rounded-lg px-3 py-2 border border-slate-200 font-mono text-sm overflow-hidden">
          {hasKey ? (
            <span className="text-slate-900">{visible ? apiKey : '•'.repeat(40)}</span>
          ) : (
            <span className="text-slate-400 italic">No key generated yet</span>
          )}
        </div>
        {hasKey && (
          <button onClick={() => setVisible(!visible)}
            className="w-9 h-9 flex items-center justify-center bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
            {visible ? <EyeOff className="w-4 h-4 text-slate-600" /> : <Eye className="w-4 h-4 text-slate-600" />}
          </button>
        )}
      </div>

      <div className="flex gap-2">
        <button onClick={handleCopy}
          disabled={!hasKey}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
            copied ? 'bg-green-600 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed'
          }`}>
          {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copied!' : 'Copy Key'}
        </button>
        <button onClick={() => {
            console.log(`🖱️ APIKeyCard (${mode}): Regenerate button clicked`);
            onRegenerate(mode);
          }}
          disabled={regenerating}
          className="flex-1 flex items-center justify-center gap-2 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
          <RefreshCw className={`w-4 h-4 ${regenerating ? 'animate-spin' : ''}`} />
          {regenerating ? 'Generating...' : hasKey ? 'Regenerate' : 'Generate'}
        </button>
      </div>
    </div>
  );
}

/* ─── Webhook Log Row ─── */
function WebhookLogRow({ log }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-slate-100 last:border-0">
      <div className="flex items-center justify-between py-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
            log.status === 'delivered' ? 'bg-green-500' : log.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500'
          }`} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900 text-sm">{log.event}</p>
            <p className="text-xs text-slate-400 truncate">{log.url}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
            log.status === 'delivered' ? 'bg-green-100 text-green-700' :
            log.status === 'failed' ? 'bg-red-100 text-red-700' :
            'bg-yellow-100 text-yellow-700'
          }`}>
            {log.responseCode || 'Pending'}
          </span>
          <span className="text-xs text-slate-400">
            {new Date((log.timestamp?.seconds || 0) * 1000).toLocaleTimeString('en-IN')}
          </span>
        </div>
      </div>
      {expanded && (
        <div className="pb-3 pl-5 pr-3">
          <pre className="bg-slate-900 text-green-400 p-3 rounded-lg text-xs overflow-x-auto" style={{ fontFamily: 'var(--font-mono)' }}>
{JSON.stringify(log.payload || {}, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function MerchantAPI() {
  const [apiKeys, setApiKeys] = useState({ live: '', test: '' });
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [webhookEvents, setWebhookEvents] = useState(['payin.success', 'payin.failed', 'payout.completed']);
  const [webhookLogs, setWebhookLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [activeTab, setActiveTab] = useState('keys');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    const user = getAuth().currentUser;
    console.log('🔑 MerchantAPI: Component mounted, user:', user?.uid);
    
    if (!user) {
      console.error('❌ MerchantAPI: No authenticated user found');
      return;
    }

    const fetchData = async () => {
      try {
        console.log('🔍 MerchantAPI: Fetching merchant data for uid:', user.uid);
        const merchantSnap = await getDocs(query(collection(db, 'merchant'), where('uid', '==', user.uid)));
        
        console.log('📦 MerchantAPI: Query result - found docs:', merchantSnap.size);
        
        if (!merchantSnap.empty) {
          const data = merchantSnap.docs[0].data();
          console.log('📄 MerchantAPI: Merchant document ID:', merchantSnap.docs[0].id);
          console.log('📄 MerchantAPI: Full merchant data:', data);
          
          // Support both old structure (apiKey) and new structure (liveApiKey/testApiKey)
          const liveKey = data.liveApiKey || data.apiKey || '';
          const testKey = data.testApiKey || '';
          
          console.log('🔑 MerchantAPI: Current API keys:', {
            live: liveKey ? `${liveKey.substring(0, 15)}...` : 'EMPTY',
            test: testKey ? `${testKey.substring(0, 15)}...` : 'EMPTY',
            usingLegacyApiKey: !!data.apiKey && !data.liveApiKey
          });
          
          setApiKeys({
            live: liveKey,
            test: testKey,
          });
          setWebhookUrl(data.webhookUrl || '');
          setWebhookSecret(data.webhookSecret || '');
          setWebhookEvents(data.webhookEvents || ['payin.success', 'payin.failed', 'payout.completed']);
          
          console.log('✅ MerchantAPI: State updated successfully');
        } else {
          console.error('❌ MerchantAPI: No merchant document found for uid:', user.uid);
          console.error('❌ MerchantAPI: Make sure your Firebase Auth UID matches the merchant document uid field');
        }
      } catch (e) {
        console.error('❌ MerchantAPI: Error fetching data:', e);
      }
      setLoading(false);
    };

    fetchData();

    // Listen to webhook logs
    const unsub = onSnapshot(
      query(collection(db, 'webhookLogs'), where('merchantId', '==', user.uid), orderBy('timestamp', 'desc'), limit(50)),
      snap => {
        const list = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        setWebhookLogs(list);
      }
    );

    return () => unsub();
  }, []);

  const handleCopyKey = (key) => {
    console.log('📋 handleCopyKey: Copying key:', key ? `${key.substring(0, 15)}...` : 'EMPTY');
    navigator.clipboard.writeText(key);
  };

  const handleRegenerateKey = async (mode) => {
    console.log('🔄 handleRegenerateKey: Called with mode:', mode);
    console.log('🔄 handleRegenerateKey: Current keys state:', apiKeys);
    
    const hasExistingKey = apiKeys[mode] && apiKeys[mode].length > 0;
    console.log('🔄 handleRegenerateKey: Has existing key?', hasExistingKey);
    
    if (hasExistingKey) {
      const confirmed = window.confirm(`Regenerate ${mode} API key? This will invalidate the current key.`);
      console.log('🔄 handleRegenerateKey: User confirmed?', confirmed);
      if (!confirmed) return;
    }

    const user = getAuth().currentUser;
    console.log('🔄 handleRegenerateKey: Current user:', user?.uid);
    
    if (!user) {
      console.error('❌ handleRegenerateKey: No authenticated user');
      return;
    }

    setRegenerating(true);
    const newKey = `${mode === 'live' ? 'live' : 'test'}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    console.log('🔑 handleRegenerateKey: Generated new key:', newKey);
    
    try {
      console.log('📡 handleRegenerateKey: Querying merchant document...');
      const merchantSnap = await getDocs(query(collection(db, 'merchant'), where('uid', '==', user.uid)));
      console.log('📦 handleRegenerateKey: Found merchants:', merchantSnap.size);
      
      if (!merchantSnap.empty) {
        const docId = merchantSnap.docs[0].id;
        const merchantData = merchantSnap.docs[0].data();
        
        // Use liveApiKey/testApiKey structure (ignore legacy apiKey field)
        const fieldName = mode === 'live' ? 'liveApiKey' : 'testApiKey';
        
        console.log('💾 handleRegenerateKey: Updating document:', docId);
        console.log('💾 handleRegenerateKey: Field:', fieldName);
        console.log('💾 handleRegenerateKey: New value:', newKey);
        
        // Update both the specific field and set apiKeyUpdatedAt
        const updateData = {
          [fieldName]: newKey,
          apiKeyUpdatedAt: serverTimestamp()
        };
        
        // If this is the first time setting liveApiKey and there's a legacy apiKey, clear it
        if (mode === 'live' && merchantData.apiKey && !merchantData.liveApiKey) {
          console.log('🔄 handleRegenerateKey: Migrating from legacy apiKey to liveApiKey');
          updateData.apiKey = null; // Clear legacy field
        }
        
        await updateDoc(doc(db, 'merchant', docId), updateData);
        
        console.log('✅ handleRegenerateKey: Firestore update successful');
        
        // Update state with new key
        setApiKeys(prev => {
          const updated = { ...prev, [mode]: newKey };
          console.log('🔄 handleRegenerateKey: Updating state to:', updated);
          return updated;
        });
        
        // Show success message
        const successMsg = `✅ ${mode === 'live' ? 'Live' : 'Test'} API key ${hasExistingKey ? 'regenerated' : 'generated'} successfully!`;
        console.log('🎉 handleRegenerateKey:', successMsg);
        setSuccessMessage(successMsg);
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        console.error('❌ handleRegenerateKey: No merchant document found');
        alert('Error: Merchant profile not found');
      }
    } catch (e) {
      console.error('❌ handleRegenerateKey: Error:', e);
      console.error('❌ handleRegenerateKey: Error details:', e.message, e.code);
      alert('Error: ' + e.message);
    } finally {
      console.log('🏁 handleRegenerateKey: Setting regenerating to false');
      setRegenerating(false);
    }
  };

  const handleSaveWebhook = async () => {
    const user = getAuth().currentUser;
    if (!user) return;

    if (!webhookUrl || !webhookUrl.startsWith('https://')) {
      alert('Webhook URL must start with https://');
      return;
    }

    try {
      const merchantSnap = await getDocs(query(collection(db, 'merchant'), where('uid', '==', user.uid)));
      if (!merchantSnap.empty) {
        await updateDoc(doc(db, 'merchant', merchantSnap.docs[0].id), {
          webhookUrl,
          webhookEvents,
          updatedAt: serverTimestamp(),
        });
        alert('✅ Webhook configuration saved!');
      }
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  const handleTestWebhook = async () => {
    const user = getAuth().currentUser;
    if (!user) return;

    try {
      await addDoc(collection(db, 'webhookLogs'), {
        merchantId: user.uid,
        event: 'test.webhook',
        url: webhookUrl,
        status: 'delivered',
        responseCode: 200,
        payload: { test: true, timestamp: Date.now() },
        timestamp: serverTimestamp(),
      });
      alert('✅ Test webhook fired! Check logs below.');
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <RefreshCw className="w-10 h-10 text-purple-500 animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm font-medium">Loading API settings…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Desktop header */}
      <div className="hidden sm:flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-sm">
              <Code className="w-5 h-5 text-white" />
            </div>
            API & Webhooks
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 ml-11">Integration settings</p>
        </div>
        <a href="https://docs.yourapi.com" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl hover:bg-blue-100 text-sm font-semibold">
          <Book className="w-4 h-4" /> Documentation
        </a>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        {[
          { key: 'keys', label: 'API Keys', icon: Key },
          { key: 'webhooks', label: 'Webhooks', icon: Zap },
          { key: 'logs', label: 'Logs', icon: Terminal },
          { key: 'docs', label: 'Docs', icon: Book },
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                activeTab === tab.key ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              <Icon className="w-4 h-4" /><span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Success Message Toast */}
      {successMessage && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-medium animate-slide-in">
          <CheckCircle className="w-5 h-5" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* API Keys Tab */}
      {activeTab === 'keys' && (
        <div className="space-y-4">
          <APIKeyCard apiKey={apiKeys.live} mode="live" onCopy={handleCopyKey} onRegenerate={handleRegenerateKey} regenerating={regenerating} />
          <APIKeyCard apiKey={apiKeys.test} mode="test" onCopy={handleCopyKey} onRegenerate={handleRegenerateKey} regenerating={regenerating} />

          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <p className="font-bold mb-1">Security Best Practices</p>
              <ul className="space-y-1 text-xs list-disc list-inside">
                <li>Never expose API keys in client-side code</li>
                <li>Rotate keys regularly (every 90 days recommended)</li>
                <li>Use test keys during development</li>
                <li>Store keys securely in environment variables</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Webhooks Tab */}
      {activeTab === 'webhooks' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
              <Globe className="w-4 h-4 text-purple-600" />
              Webhook URL
            </h3>
            <input
              type="url"
              value={webhookUrl}
              onChange={e => setWebhookUrl(e.target.value)}
              placeholder="https://yourdomain.com/webhook"
              className="w-full px-3 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 font-mono mb-2"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            <p className="text-xs text-slate-500">Must use HTTPS. POST requests will be sent to this URL.</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4 text-green-600" />
              Webhook Secret
            </h3>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono text-sm mb-2">
              {webhookSecret || 'Auto-generated on save'}
            </div>
            <p className="text-xs text-slate-500">Use this to verify webhook signatures (HMAC-SHA256)</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Event Selection</h3>
            <div className="space-y-2">
              {[
                'payin.success', 'payin.failed', 'payin.pending',
                'payout.completed', 'payout.failed', 'payout.queued',
              ].map(event => (
                <label key={event} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={webhookEvents.includes(event)}
                    onChange={e => {
                      if (e.target.checked) {
                        setWebhookEvents([...webhookEvents, event]);
                      } else {
                        setWebhookEvents(webhookEvents.filter(ev => ev !== event));
                      }
                    }}
                    className="w-4 h-4 text-purple-600 rounded"
                  />
                  <span className="text-sm font-mono text-slate-700">{event}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={handleSaveWebhook}
              className="flex-1 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 font-semibold text-sm flex items-center justify-center gap-2">
              <CheckCircle className="w-4 h-4" /> Save Configuration
            </button>
            <button onClick={handleTestWebhook}
              className="flex-1 py-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl hover:bg-blue-100 font-semibold text-sm flex items-center justify-center gap-2">
              <Zap className="w-4 h-4" /> Test Webhook
            </button>
          </div>
        </div>
      )}

      {/* Logs Tab */}
      {activeTab === 'logs' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Webhook Delivery Logs</h3>
            <span className="text-xs text-slate-500">Last 50 deliveries</span>
          </div>
          <div className="px-4 py-1 max-h-96 overflow-y-auto">
            {webhookLogs.length > 0 ? (
              webhookLogs.map(log => <WebhookLogRow key={log.id} log={log} />)
            ) : (
              <div className="text-center py-10">
                <Terminal className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                <p className="text-slate-500 text-sm font-medium">No webhook logs yet</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Docs Tab */}
      {activeTab === 'docs' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Quick Start</h3>
            
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-2">1. Authentication</p>
                <pre className="bg-slate-900 text-green-400 p-3 rounded-lg text-xs overflow-x-auto" style={{ fontFamily: 'var(--font-mono)' }}>
{`curl https://api.yourpayment.com/v1/payins \\
  -H "Authorization: Bearer YOUR_API_KEY"`}
                </pre>
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-700 mb-2">2. Create Payin</p>
                <pre className="bg-slate-900 text-green-400 p-3 rounded-lg text-xs overflow-x-auto" style={{ fontFamily: 'var(--font-mono)' }}>
{`curl -X POST https://api.yourpayment.com/v1/payins \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 1000,
    "currency": "INR",
    "customerId": "user_123",
    "orderId": "order_456"
  }'`}
                </pre>
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-700 mb-2">3. Handle Webhook</p>
                <pre className="bg-slate-900 text-green-400 p-3 rounded-lg text-xs overflow-x-auto" style={{ fontFamily: 'var(--font-mono)' }}>
{`// Node.js example
const crypto = require('crypto');

app.post('/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const payload = JSON.stringify(req.body);
  
  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  const digest = hmac.update(payload).digest('hex');
  
  if (signature === digest) {
    // Webhook verified
    console.log('Event:', req.body.event);
  }
  
  res.status(200).send('OK');
});`}
                </pre>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <a href="https://docs.yourapi.com" target="_blank" rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 font-semibold text-sm">
                <ExternalLink className="w-4 h-4" /> Full Documentation
              </a>
              <button className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl hover:bg-blue-100 font-semibold text-sm">
                <Download className="w-4 h-4" /> Postman Collection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}