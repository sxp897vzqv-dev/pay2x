/**
 * Admin API Monitoring Dashboard
 * View rate limits, request logs, and webhook deliveries
 */

import { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { 
  BarChart3, 
  Clock, 
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Activity
} from 'lucide-react';

const StatCard = ({ title, value, subtitle, icon: Icon, color = 'blue' }) => {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
  };
  
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
        </div>
        <div className={`p-2 rounded-lg ${colors[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
};

const RequestLogsTab = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('api_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (!error) setLogs(data || []);
    setLoading(false);
  };

  const getStatusColor = (status) => {
    if (status >= 200 && status < 300) return 'text-green-600 bg-green-50';
    if (status >= 400 && status < 500) return 'text-amber-600 bg-amber-50';
    return 'text-red-600 bg-red-50';
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-gray-900">Recent API Requests</h3>
        <button onClick={fetchLogs} className="text-sm text-blue-600 flex items-center gap-1 hover:underline">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="pb-3 font-medium">Trace ID</th>
              <th className="pb-3 font-medium">Endpoint</th>
              <th className="pb-3 font-medium">Merchant</th>
              <th className="pb-3 font-medium">Status</th>
              <th className="pb-3 font-medium">Duration</th>
              <th className="pb-3 font-medium">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-400">
                  Loading...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-400">
                  No requests yet
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="py-3">
                    <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                      {log.trace_id?.slice(0, 16)}...
                    </code>
                  </td>
                  <td className="py-3">
                    <span className="font-medium text-gray-900">{log.method}</span>
                    <span className="text-gray-500 ml-1">{log.endpoint}</span>
                  </td>
                  <td className="py-3 text-gray-600">
                    {log.merchant_id?.slice(0, 8) || '-'}...
                  </td>
                  <td className="py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(log.response_status)}`}>
                      {log.response_status}
                    </span>
                    {log.error_code && (
                      <span className="ml-2 text-xs text-red-500">{log.error_code}</span>
                    )}
                  </td>
                  <td className="py-3 text-gray-600">
                    {log.response_time_ms}ms
                  </td>
                  <td className="py-3 text-gray-400 text-xs">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const WebhookDeliveriesTab = () => {
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWebhooks();
  }, []);

  const fetchWebhooks = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('webhook_deliveries')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (!error) setWebhooks(data || []);
    setLoading(false);
  };

  const retryWebhook = async (id) => {
    await supabase
      .from('webhook_deliveries')
      .update({ 
        status: 'pending', 
        next_attempt_at: new Date().toISOString() 
      })
      .eq('id', id);
    fetchWebhooks();
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-yellow-50 text-yellow-700',
      processing: 'bg-blue-50 text-blue-700',
      delivered: 'bg-green-50 text-green-700',
      failed: 'bg-red-50 text-red-700',
      exhausted: 'bg-gray-50 text-gray-700',
    };
    return styles[status] || 'bg-gray-50 text-gray-700';
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-gray-900">Webhook Deliveries</h3>
        <button onClick={fetchWebhooks} className="text-sm text-blue-600 flex items-center gap-1 hover:underline">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="pb-3 font-medium">Event</th>
              <th className="pb-3 font-medium">URL</th>
              <th className="pb-3 font-medium">Status</th>
              <th className="pb-3 font-medium">Attempts</th>
              <th className="pb-3 font-medium">Last Response</th>
              <th className="pb-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-400">
                  Loading...
                </td>
              </tr>
            ) : webhooks.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-400">
                  No webhooks yet
                </td>
              </tr>
            ) : (
              webhooks.map((wh) => (
                <tr key={wh.id} className="hover:bg-gray-50">
                  <td className="py-3">
                    <span className="font-medium text-gray-900">{wh.event_type}</span>
                    <br />
                    <span className="text-xs text-gray-400">{wh.event_id?.slice(0, 8)}...</span>
                  </td>
                  <td className="py-3 text-gray-600 max-w-xs truncate">
                    {wh.webhook_url}
                  </td>
                  <td className="py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(wh.status)}`}>
                      {wh.status}
                    </span>
                  </td>
                  <td className="py-3 text-gray-600">
                    {wh.attempt_count} / {wh.max_attempts}
                  </td>
                  <td className="py-3">
                    {wh.last_response_code && (
                      <span className={`text-xs ${wh.last_response_code >= 200 && wh.last_response_code < 300 ? 'text-green-600' : 'text-red-600'}`}>
                        HTTP {wh.last_response_code}
                      </span>
                    )}
                    {wh.last_error && (
                      <span className="text-xs text-red-500 block">{wh.last_error}</span>
                    )}
                  </td>
                  <td className="py-3">
                    {(wh.status === 'failed' || wh.status === 'exhausted') && (
                      <button
                        onClick={() => retryWebhook(wh.id)}
                        className="text-blue-600 text-sm hover:underline"
                      >
                        Retry
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const RateLimitsTab = () => {
  const [limits, setLimits] = useState({ config: [], recent: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLimits();
  }, []);

  const fetchLimits = async () => {
    setLoading(true);
    
    const { data: config } = await supabase
      .from('rate_limit_config')
      .select('*')
      .order('requests_per_minute', { ascending: true });

    const { data: recent } = await supabase
      .from('rate_limits')
      .select('merchant_id, endpoint, request_count')
      .gte('window_start', new Date(Date.now() - 60000).toISOString())
      .order('request_count', { ascending: false })
      .limit(20);

    setLimits({ config: config || [], recent: recent || [] });
    setLoading(false);
  };

  if (loading) {
    return <div className="py-8 text-center text-gray-400">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-gray-900 mb-4">Rate Limit Configuration</h3>
        <div className="grid grid-cols-4 gap-4">
          {limits.config?.map((plan) => (
            <div key={plan.plan} className="bg-gray-50 border rounded-lg p-4">
              <h4 className="font-medium text-gray-900 capitalize mb-3">{plan.plan}</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Per minute</span>
                  <span className="font-medium">{plan.requests_per_minute}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Per hour</span>
                  <span className="font-medium">{plan.requests_per_hour?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Per day</span>
                  <span className="font-medium">{plan.requests_per_day?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Burst</span>
                  <span className="font-medium">{plan.burst_limit}/s</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-gray-900 mb-4">Recent Activity (Last Minute)</h3>
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-gray-500">
                <th className="px-4 py-3 font-medium">Merchant</th>
                <th className="px-4 py-3 font-medium">Endpoint</th>
                <th className="px-4 py-3 font-medium">Requests</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {limits.recent?.length > 0 ? limits.recent.map((item, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{item.merchant_id?.slice(0, 8)}...</td>
                  <td className="px-4 py-3 text-gray-600">{item.endpoint}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{item.request_count}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-gray-400">
                    No recent activity
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default function AdminApiMonitoring() {
  const [activeTab, setActiveTab] = useState('requests');
  const [stats, setStats] = useState({
    totalRequests: 0,
    successRate: 0,
    avgResponseTime: 0,
    webhooksDelivered: 0,
    webhooksPending: 0,
  });

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { count: totalRequests } = await supabase
      .from('api_requests')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', today.toISOString());

    const { count: successCount } = await supabase
      .from('api_requests')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', today.toISOString())
      .gte('response_status', 200)
      .lt('response_status', 300);

    const { data: avgData } = await supabase
      .from('api_requests')
      .select('response_time_ms')
      .gte('created_at', today.toISOString())
      .limit(1000);

    const avgTime = avgData?.length 
      ? Math.round(avgData.reduce((a, b) => a + (b.response_time_ms || 0), 0) / avgData.length)
      : 0;

    const { count: delivered } = await supabase
      .from('webhook_deliveries')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'delivered');

    const { count: pending } = await supabase
      .from('webhook_deliveries')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    setStats({
      totalRequests: totalRequests || 0,
      successRate: totalRequests ? Math.round((successCount || 0) / totalRequests * 100) : 0,
      avgResponseTime: avgTime,
      webhooksDelivered: delivered || 0,
      webhooksPending: pending || 0,
    });
  };

  const tabs = [
    { id: 'requests', label: 'Request Logs' },
    { id: 'webhooks', label: 'Webhooks' },
    { id: 'ratelimits', label: 'Rate Limits' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">API Monitoring</h1>
        <p className="text-gray-500">Rate limits, request logs, and webhook deliveries</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4">
        <StatCard 
          title="Today's Requests" 
          value={stats.totalRequests.toLocaleString()} 
          icon={BarChart3}
          color="blue"
        />
        <StatCard 
          title="Success Rate" 
          value={`${stats.successRate}%`}
          icon={CheckCircle}
          color="green"
        />
        <StatCard 
          title="Avg Response Time" 
          value={`${stats.avgResponseTime}ms`}
          icon={Clock}
          color="blue"
        />
        <StatCard 
          title="Webhooks Delivered" 
          value={stats.webhooksDelivered}
          icon={CheckCircle}
          color="green"
        />
        <StatCard 
          title="Webhooks Pending" 
          value={stats.webhooksPending}
          icon={AlertTriangle}
          color="amber"
        />
      </div>

      {/* Tabs */}
      <div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === tab.id 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          {activeTab === 'requests' && <RequestLogsTab />}
          {activeTab === 'webhooks' && <WebhookDeliveriesTab />}
          {activeTab === 'ratelimits' && <RateLimitsTab />}
        </div>
      </div>
    </div>
  );
}
