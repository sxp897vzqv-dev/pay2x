// src/roles/merchant/MerchantWebhooks.jsx
// Webhook logs, retry, and tester

import { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { 
  BoltIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  PaperAirplaneIcon,
  EyeIcon,
  FunnelIcon
} from '@heroicons/react/24/outline';

export default function MerchantWebhooks() {
  const [activeTab, setActiveTab] = useState('logs');
  const [loading, setLoading] = useState(true);
  const [merchant, setMerchant] = useState(null);
  const [webhookLogs, setWebhookLogs] = useState([]);
  const [selectedLog, setSelectedLog] = useState(null);
  const [filter, setFilter] = useState('all');
  const [testUrl, setTestUrl] = useState('');
  const [testPayload, setTestPayload] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: merchantData } = await supabase
        .from('merchants')
        .select('*')
        .eq('profile_id', user.id)
        .single();
      setMerchant(merchantData);
      setTestUrl(merchantData?.webhook_url || '');

      if (merchantData) {
        const { data: logs } = await supabase
          .from('webhook_logs')
          .select('*')
          .eq('merchant_id', merchantData.id)
          .order('created_at', { ascending: false })
          .limit(100);
        setWebhookLogs(logs || []);
      }

      // Set default test payload
      setTestPayload(JSON.stringify({
        event: 'payment.completed',
        timestamp: Date.now(),
        data: {
          payinId: 'test_' + Date.now(),
          orderId: 'ORDER_123',
          amount: 500,
          status: 'completed',
          utrId: '123456789012'
        }
      }, null, 2));
    } catch (err) {
      console.error('Error loading webhooks:', err);
    }
    setLoading(false);
  }

  async function retryWebhook(log) {
    if (!confirm('Retry sending this webhook?')) return;

    try {
      // In production, call an Edge Function to retry
      const response = await fetch(log.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(log.request_body)
      });

      const newStatus = response.ok ? 'success' : 'failed';
      
      await supabase
        .from('webhook_logs')
        .update({
          attempt_number: log.attempt_number + 1,
          status: newStatus,
          response_status: response.status,
        })
        .eq('id', log.id);

      loadData();
    } catch (err) {
      console.error('Retry failed:', err);
      alert('Retry failed: ' + err.message);
    }
  }

  async function sendTestWebhook() {
    if (!testUrl) {
      alert('Please enter a webhook URL');
      return;
    }

    setSending(true);
    setTestResult(null);

    try {
      let payload;
      try {
        payload = JSON.parse(testPayload);
      } catch {
        alert('Invalid JSON payload');
        setSending(false);
        return;
      }

      const startTime = Date.now();
      const response = await fetch(testUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Pay2X-Test': 'true'
        },
        body: JSON.stringify(payload)
      });

      const duration = Date.now() - startTime;
      let responseBody = '';
      try {
        responseBody = await response.text();
      } catch {}

      setTestResult({
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
        duration,
        body: responseBody
      });

      // Log test webhook
      await supabase.from('webhook_logs').insert({
        merchant_id: merchant.id,
        event_type: 'test',
        webhook_url: testUrl,
        request_body: payload,
        response_status: response.status,
        response_body: responseBody,
        response_time_ms: duration,
        status: response.ok ? 'success' : 'failed',
      });

    } catch (err) {
      setTestResult({
        success: false,
        error: err.message
      });
    }
    setSending(false);
  }

  const filteredLogs = webhookLogs.filter(log => {
    if (filter === 'all') return true;
    return log.status === filter;
  });

  function getStatusBadge(status) {
    const badges = {
      success: { icon: CheckCircleIcon, class: 'bg-green-100 text-green-700' },
      failed: { icon: XCircleIcon, class: 'bg-red-100 text-red-700' },
      pending: { icon: ClockIcon, class: 'bg-yellow-100 text-yellow-700' },
      retrying: { icon: ArrowPathIcon, class: 'bg-blue-100 text-blue-700' },
    };
    const badge = badges[status] || badges.pending;
    const Icon = badge.icon;
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 ${badge.class}`}>
        <Icon className="h-3 w-3" />
        {status}
      </span>
    );
  }

  function formatDate(date) {
    return new Date(date).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BoltIcon className="h-7 w-7 text-indigo-500" />
          Webhooks
        </h1>
        <p className="text-gray-500 mt-1">Monitor webhook deliveries and test your endpoint</p>
      </div>

      {/* Webhook URL Display */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Current Webhook URL</p>
            <p className="font-mono text-sm mt-1">
              {merchant?.webhook_url || <span className="text-gray-400">Not configured</span>}
            </p>
          </div>
          <a 
            href="/merchant/settings" 
            className="text-sm text-indigo-600 hover:underline"
          >
            Edit in Settings
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('logs')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'logs'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Webhook Logs
          </button>
          <button
            onClick={() => setActiveTab('tester')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'tester'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Webhook Tester
          </button>
        </nav>
      </div>

      {/* Logs Tab */}
      {activeTab === 'logs' && (
        <div className="bg-white rounded-lg shadow">
          {/* Filters */}
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FunnelIcon className="h-5 w-5 text-gray-400" />
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="text-sm border-gray-300 rounded-lg"
              >
                <option value="all">All Status</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
                <option value="pending">Pending</option>
                <option value="retrying">Retrying</option>
              </select>
            </div>
            <button
              onClick={loadData}
              className="p-2 hover:bg-gray-100 rounded-lg"
              title="Refresh"
            >
              <ArrowPathIcon className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          {filteredLogs.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <BoltIcon className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No webhook logs found</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredLogs.map(log => (
                <div key={log.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {getStatusBadge(log.status)}
                      <span className="font-medium text-gray-900">{log.event_type}</span>
                      <span className="text-sm text-gray-500">
                        HTTP {log.response_status || '—'}
                      </span>
                      {log.response_time_ms && (
                        <span className="text-sm text-gray-400">
                          {log.response_time_ms}ms
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">
                        {formatDate(log.created_at)}
                      </span>
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="p-2 hover:bg-gray-100 rounded-lg"
                        title="View details"
                      >
                        <EyeIcon className="h-4 w-4 text-gray-500" />
                      </button>
                      {log.status === 'failed' && (
                        <button
                          onClick={() => retryWebhook(log)}
                          className="p-2 hover:bg-indigo-50 rounded-lg"
                          title="Retry"
                        >
                          <ArrowPathIcon className="h-4 w-4 text-indigo-600" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-gray-500 mt-2 truncate font-mono">
                    {log.webhook_url}
                  </p>
                  {log.error_message && (
                    <p className="text-sm text-red-600 mt-1">{log.error_message}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tester Tab */}
      {activeTab === 'tester' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Test Webhook Endpoint</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Webhook URL
              </label>
              <input
                type="url"
                value={testUrl}
                onChange={(e) => setTestUrl(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                placeholder="https://your-server.com/webhook"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payload (JSON)
              </label>
              <textarea
                value={testPayload}
                onChange={(e) => setTestPayload(e.target.value)}
                rows={10}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
              />
            </div>

            <button
              onClick={sendTestWebhook}
              disabled={sending}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
            >
              <PaperAirplaneIcon className="h-5 w-5" />
              {sending ? 'Sending...' : 'Send Test Webhook'}
            </button>
          </div>

          {testResult && (
            <div className={`mt-6 p-4 rounded-lg ${testResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <h4 className={`font-medium ${testResult.success ? 'text-green-800' : 'text-red-800'}`}>
                {testResult.success ? '✓ Webhook Delivered Successfully' : '✗ Webhook Failed'}
              </h4>
              {testResult.status && (
                <p className="text-sm mt-2">
                  Status: {testResult.status} {testResult.statusText}
                </p>
              )}
              {testResult.duration && (
                <p className="text-sm">Response time: {testResult.duration}ms</p>
              )}
              {testResult.error && (
                <p className="text-sm text-red-600 mt-2">{testResult.error}</p>
              )}
              {testResult.body && (
                <div className="mt-3">
                  <p className="text-sm font-medium">Response Body:</p>
                  <pre className="mt-1 text-xs bg-white p-2 rounded overflow-x-auto max-h-32">
                    {testResult.body}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Log Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSelectedLog(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Webhook Details</h3>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Event</p>
                  <p className="font-medium">{selectedLog.event_type}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Status</p>
                  {getStatusBadge(selectedLog.status)}
                </div>
                <div>
                  <p className="text-sm text-gray-500">HTTP Status</p>
                  <p className="font-medium">{selectedLog.response_status || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Response Time</p>
                  <p className="font-medium">{selectedLog.response_time_ms || '—'}ms</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Attempt</p>
                  <p className="font-medium">#{selectedLog.attempt_number}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Sent At</p>
                  <p className="font-medium">{formatDate(selectedLog.created_at)}</p>
                </div>
              </div>

              <div>
                <p className="text-sm text-gray-500 mb-1">URL</p>
                <p className="font-mono text-sm bg-gray-50 p-2 rounded break-all">
                  {selectedLog.webhook_url}
                </p>
              </div>

              <div>
                <p className="text-sm text-gray-500 mb-1">Request Body</p>
                <pre className="font-mono text-xs bg-gray-50 p-3 rounded overflow-x-auto max-h-48">
                  {JSON.stringify(selectedLog.request_body, null, 2)}
                </pre>
              </div>

              {selectedLog.response_body && (
                <div>
                  <p className="text-sm text-gray-500 mb-1">Response Body</p>
                  <pre className="font-mono text-xs bg-gray-50 p-3 rounded overflow-x-auto max-h-48">
                    {selectedLog.response_body}
                  </pre>
                </div>
              )}

              {selectedLog.error_message && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-800">{selectedLog.error_message}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
