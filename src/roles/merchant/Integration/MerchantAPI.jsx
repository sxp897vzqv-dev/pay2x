import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../../supabase';
import { logMerchantActivity, MERCHANT_ACTIONS } from '../../../utils/merchantActivityLogger';
import {
  Key, Copy, CheckCircle, RefreshCw, AlertCircle, Code,
  Globe, Shield, Eye, EyeOff, Terminal, Zap,
} from 'lucide-react';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';

/* ─── Test Mode Toggle ─── */
function TestModeToggle() {
  const context = useOutletContext();
  const testMode = context?.testMode || false;
  const toggleTestMode = context?.toggleTestMode;

  return (
    <button
      onClick={toggleTestMode}
      className={`relative w-14 h-7 rounded-full transition-colors duration-200 ${
        testMode ? 'bg-amber-500' : 'bg-slate-300'
      }`}
    >
      <div
        className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
          testMode ? 'left-8' : 'left-1'
        }`}
      />
      <span className="sr-only">{testMode ? 'Disable' : 'Enable'} test mode</span>
    </button>
  );
}

/* ─── API Key Card ─── */
function APIKeyCard({ apiKey, mode, onCopy, onRegenerate, regenerating }) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!apiKey) {
      alert('No API key to copy. Generate one first!');
      return;
    }
    onCopy(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasKey = apiKey && apiKey.length > 0;

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
        <button onClick={() => onRegenerate(mode)}
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
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      try {
        const { data } = await supabase.from('merchants').select('*').eq('profile_id', user.id).single();
        if (data) {
          setApiKeys({ live: data.live_api_key || data.api_key || '', test: data.test_api_key || '' });
          setWebhookUrl(data.webhook_url || '');
          setWebhookSecret(data.webhook_secret || '');
          setWebhookEvents(data.webhook_events || ['payin.success', 'payin.failed', 'payout.completed']);
          
          // Webhook logs - use merchant.id, not user.id
          const { data: logs } = await supabase.from('webhook_logs').select('*').eq('merchant_id', data.id).order('timestamp', { ascending: false }).limit(50);
          setWebhookLogs((logs || []).map(l => ({ ...l, merchantId: l.merchant_id, responseCode: l.response_code, timestamp: l.timestamp ? { seconds: new Date(l.timestamp).getTime() / 1000 } : null })));
        }
      } catch (e) { console.error('Error fetching API data:', e); }
      setLoading(false);
    };
    fetchData();
  }, []);

  const handleCopyKey = (key) => {
    navigator.clipboard.writeText(key);
  };

  const handleRegenerateKey = async (mode) => {
    const hasExistingKey = apiKeys[mode] && apiKeys[mode].length > 0;
    
    if (hasExistingKey) {
      const confirmed = window.confirm(`Regenerate ${mode} API key? This will invalidate the current key.`);
      if (!confirmed) return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get merchant ID first
    const { data: merchant } = await supabase.from('merchants').select('id').eq('profile_id', user.id).single();
    if (!merchant) {
      alert('Merchant not found');
      return;
    }

    setRegenerating(true);
    const newKey = `${mode === 'live' ? 'live' : 'test'}_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    try {
      const fieldName = mode === 'live' ? 'live_api_key' : 'test_api_key';
      const updateData = { [fieldName]: newKey, api_key_updated_at: new Date().toISOString() };
      await supabase.from('merchants').update(updateData).eq('id', merchant.id);
      setApiKeys(prev => ({ ...prev, [mode]: newKey }));
      
      // Log activity (critical action)
      await logMerchantActivity(MERCHANT_ACTIONS.API_KEY_REGENERATED, {
        details: { 
          key_type: mode,
          action: hasExistingKey ? 'regenerated' : 'generated',
          key_prefix: newKey.substring(0, 10) + '...'
        }
      });
      
      const successMsg = `✅ ${mode === 'live' ? 'Live' : 'Test'} API key ${hasExistingKey ? 'regenerated' : 'generated'} successfully!`;
      setSuccessMessage(successMsg);
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (e) {
      console.error('Error regenerating key:', e);
      alert('Error: ' + e.message);
    } finally {
      setRegenerating(false);
    }
  };

  const handleSaveWebhook = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (!webhookUrl || !webhookUrl.startsWith('https://')) { alert('Webhook URL must start with https://'); return; }
    try {
      await supabase.from('merchants').update({ webhook_url: webhookUrl, webhook_events: webhookEvents }).eq('id', user.id);
      
      // Log activity
      await logMerchantActivity(MERCHANT_ACTIONS.WEBHOOK_URL_UPDATED, {
        details: { 
          webhook_url: webhookUrl,
          events: webhookEvents
        }
      });
      
      alert('✅ Webhook configuration saved!');
    } catch (e) { alert('Error: ' + e.message); }
  };

  const handleTestWebhook = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    try {
      await supabase.from('webhook_logs').insert({
        merchant_id: user.id, event: 'test.webhook', url: webhookUrl,
        status: 'delivered', response_code: 200,
        payload: { test: true, timestamp: Date.now() },
      });
      
      // Log activity
      await logMerchantActivity(MERCHANT_ACTIONS.WEBHOOK_TEST_SENT, {
        details: { webhook_url: webhookUrl }
      });
      
      alert('✅ Test webhook fired! Check logs below.');
    } catch (e) { alert('Error: ' + e.message); }
  };

  if (loading) {
    return <LoadingSpinner message="Loading API settings…" />;
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
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        {[
          { key: 'keys', label: 'API Keys', icon: Key },
          { key: 'webhooks', label: 'Webhooks', icon: Zap },
          { key: 'logs', label: 'Logs', icon: Terminal },
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
          {/* Test Mode Toggle */}
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <Shield className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Test Mode</h3>
                  <p className="text-sm text-slate-600">Use test API key for sandbox transactions</p>
                </div>
              </div>
              <TestModeToggle />
            </div>
          </div>

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

    </div>
  );
}
