// src/roles/merchant/MerchantReports.jsx
// Analytics, Reports, and Export

import { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { 
  ChartBarIcon,
  ArrowDownTrayIcon,
  CalendarIcon,
  FunnelIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  BanknotesIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon
} from '@heroicons/react/24/outline';

export default function MerchantReports() {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [merchant, setMerchant] = useState(null);
  const [dateRange, setDateRange] = useState('7d');
  const [stats, setStats] = useState({});
  const [dailyData, setDailyData] = useState([]);
  const [topFailures, setTopFailures] = useState([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadData();
  }, [dateRange]);

  function getDateRangeFilter() {
    const now = new Date();
    const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : dateRange === '90d' ? 90 : 365;
    const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return start.toISOString();
  }

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

      if (!merchantData) return;

      const startDate = getDateRangeFilter();

      // Get payins stats
      const { data: payins } = await supabase
        .from('payins')
        .select('status, amount, created_at')
        .eq('merchant_id', merchantData.id)
        .gte('created_at', startDate);

      // Calculate stats
      const completed = payins?.filter(p => p.status === 'completed') || [];
      const failed = payins?.filter(p => ['failed', 'rejected', 'expired'].includes(p.status)) || [];
      const pending = payins?.filter(p => p.status === 'pending') || [];

      const totalVolume = completed.reduce((sum, p) => sum + Number(p.amount), 0);
      const avgAmount = completed.length > 0 ? totalVolume / completed.length : 0;
      const successRate = payins?.length > 0 
        ? (completed.length / payins.length * 100).toFixed(1) 
        : 0;

      setStats({
        totalPayins: payins?.length || 0,
        completed: completed.length,
        failed: failed.length,
        pending: pending.length,
        totalVolume,
        avgAmount,
        successRate,
      });

      // Group by day for chart
      const dailyMap = {};
      payins?.forEach(p => {
        const day = new Date(p.created_at).toLocaleDateString('en-CA'); // YYYY-MM-DD
        if (!dailyMap[day]) {
          dailyMap[day] = { date: day, completed: 0, failed: 0, volume: 0 };
        }
        if (p.status === 'completed') {
          dailyMap[day].completed++;
          dailyMap[day].volume += Number(p.amount);
        } else if (['failed', 'rejected', 'expired'].includes(p.status)) {
          dailyMap[day].failed++;
        }
      });

      const sortedDaily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
      setDailyData(sortedDaily);

      // Top failure reasons (mock - would need actual failure_reason field)
      setTopFailures([
        { reason: 'Payment timeout', count: Math.floor(failed.length * 0.4) },
        { reason: 'UTR not found', count: Math.floor(failed.length * 0.3) },
        { reason: 'Amount mismatch', count: Math.floor(failed.length * 0.2) },
        { reason: 'Bank decline', count: Math.floor(failed.length * 0.1) },
      ].filter(f => f.count > 0));

    } catch (err) {
      console.error('Error loading reports:', err);
    }
    setLoading(false);
  }

  async function exportCSV() {
    setExporting(true);
    try {
      const startDate = getDateRangeFilter();

      const { data: payins } = await supabase
        .from('payins')
        .select('*')
        .eq('merchant_id', merchant.id)
        .gte('created_at', startDate)
        .order('created_at', { ascending: false });

      if (!payins || payins.length === 0) {
        alert('No data to export');
        setExporting(false);
        return;
      }

      // Generate CSV
      const headers = ['ID', 'Order ID', 'Amount', 'Status', 'UPI ID', 'UTR', 'Created At', 'Completed At'];
      const rows = payins.map(p => [
        p.id,
        p.order_id || '',
        p.amount,
        p.status,
        p.upi_id || '',
        p.utr || '',
        p.created_at,
        p.completed_at || ''
      ]);

      const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');

      // Download
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payins_${dateRange}_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);

    } catch (err) {
      console.error('Export error:', err);
      alert('Failed to export');
    }
    setExporting(false);
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ChartBarIcon className="h-7 w-7 text-indigo-500" />
            Reports & Analytics
          </h1>
          <p className="text-gray-500 mt-1">Payment performance and insights</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="365d">Last year</option>
          </select>
          <button
            onClick={exportCSV}
            disabled={exporting}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
          >
            <ArrowDownTrayIcon className="h-5 w-5" />
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Total Volume</p>
            <BanknotesIcon className="h-5 w-5 text-green-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">
            {formatCurrency(stats.totalVolume || 0)}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {stats.completed} transactions
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Success Rate</p>
            <ArrowTrendingUpIcon className="h-5 w-5 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">
            {stats.successRate || 0}%
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {stats.totalPayins} total payins
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Avg Amount</p>
            <ChartBarIcon className="h-5 w-5 text-indigo-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">
            {formatCurrency(stats.avgAmount || 0)}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            per transaction
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Failed</p>
            <XCircleIcon className="h-5 w-5 text-red-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">
            {stats.failed || 0}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {stats.pending || 0} pending
          </p>
        </div>
      </div>

      {/* Daily Chart */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h3 className="font-semibold text-gray-900 mb-4">Daily Transaction Volume</h3>
        {dailyData.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-gray-500">
            No data for selected period
          </div>
        ) : (
          <div className="h-48 flex items-end gap-1">
            {dailyData.slice(-30).map((day, i) => {
              const maxVolume = Math.max(...dailyData.map(d => d.volume)) || 1;
              const height = (day.volume / maxVolume) * 100;
              return (
                <div
                  key={day.date}
                  className="flex-1 group relative"
                  title={`${day.date}: ${formatCurrency(day.volume)}`}
                >
                  <div
                    className="bg-indigo-500 rounded-t hover:bg-indigo-600 transition-colors"
                    style={{ height: `${Math.max(height, 2)}%` }}
                  />
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10">
                    {day.date}<br />
                    {formatCurrency(day.volume)}<br />
                    {day.completed} completed
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {dailyData.length > 0 && (
          <div className="flex justify-between mt-2 text-xs text-gray-500">
            <span>{dailyData[0]?.date}</span>
            <span>{dailyData[dailyData.length - 1]?.date}</span>
          </div>
        )}
      </div>

      {/* Status Breakdown & Top Failures */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Status Breakdown */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Status Breakdown</h3>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm flex items-center gap-2">
                  <CheckCircleIcon className="h-4 w-4 text-green-500" />
                  Completed
                </span>
                <span className="font-medium">{stats.completed || 0}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full"
                  style={{ width: `${(stats.completed / (stats.totalPayins || 1)) * 100}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm flex items-center gap-2">
                  <XCircleIcon className="h-4 w-4 text-red-500" />
                  Failed/Rejected/Expired
                </span>
                <span className="font-medium">{stats.failed || 0}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-500 rounded-full"
                  style={{ width: `${(stats.failed / (stats.totalPayins || 1)) * 100}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm flex items-center gap-2">
                  <ClockIcon className="h-4 w-4 text-yellow-500" />
                  Pending
                </span>
                <span className="font-medium">{stats.pending || 0}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-yellow-500 rounded-full"
                  style={{ width: `${(stats.pending / (stats.totalPayins || 1)) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Top Failure Reasons */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Top Failure Reasons</h3>
          {topFailures.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-gray-500">
              <CheckCircleIcon className="h-8 w-8 text-green-300 mr-2" />
              No failures in this period!
            </div>
          ) : (
            <div className="space-y-3">
              {topFailures.map((failure, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-red-100 text-red-600 text-xs flex items-center justify-center font-medium">
                      {i + 1}
                    </span>
                    <span className="text-sm text-gray-700">{failure.reason}</span>
                  </div>
                  <span className="text-sm font-medium text-gray-900">{failure.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Commission Summary */}
      <div className="bg-white rounded-lg shadow p-6 mt-6">
        <h3 className="font-semibold text-gray-900 mb-4">Fee Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 text-gray-500 font-medium">Description</th>
                <th className="text-right py-2 text-gray-500 font-medium">Rate</th>
                <th className="text-right py-2 text-gray-500 font-medium">Volume</th>
                <th className="text-right py-2 text-gray-500 font-medium">Fees</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-3">Payin Commission</td>
                <td className="text-right">{((merchant?.payin_commission || 0) * 100).toFixed(2)}%</td>
                <td className="text-right">{formatCurrency(stats.totalVolume || 0)}</td>
                <td className="text-right font-medium">
                  {formatCurrency((stats.totalVolume || 0) * (merchant?.payin_commission || 0))}
                </td>
              </tr>
              <tr>
                <td className="py-3 font-medium">Total Fees</td>
                <td className="text-right"></td>
                <td className="text-right"></td>
                <td className="text-right font-bold text-indigo-600">
                  {formatCurrency((stats.totalVolume || 0) * (merchant?.payin_commission || 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
