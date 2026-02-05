import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import {
  TrendingUp, Download, Calendar, PieChart, BarChart3, Activity,
  RefreshCw, ArrowUpRight, ArrowDownRight, Filter, FileText,
} from 'lucide-react';
import StatCard from '../../components/admin/StatCard';

/* ─── Simple Bar Chart Component ─── */
function SimpleBarChart({ data, title }) {
  const maxValue = Math.max(...data.map(d => d.value));

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <h3 className="text-sm font-bold text-slate-900 mb-4">{title}</h3>
      <div className="space-y-3">
        {data.map((item, i) => (
          <div key={i}>
            <div className="flex items-center justify-between mb-1 text-xs">
              <span className="font-semibold text-slate-700">{item.label}</span>
              <span className="font-bold text-purple-600">{item.value}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-purple-500 to-blue-500 h-2 rounded-full transition-all"
                style={{ width: `${(item.value / maxValue) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Simple Line Chart ─── */
function SimpleLineChart({ data, title }) {
  const maxValue = Math.max(...data.map(d => d.value));
  const points = data.map((d, i) => ({
    x: (i / (data.length - 1)) * 100,
    y: 100 - ((d.value / maxValue) * 80),
  }));

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <h3 className="text-sm font-bold text-slate-900 mb-4">{title}</h3>
      <svg viewBox="0 0 100 100" className="w-full h-32">
        <path
          d={pathD}
          fill="none"
          stroke="url(#gradient)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
        </defs>
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2" fill="#8b5cf6" />
        ))}
      </svg>
      <div className="flex justify-between mt-2 text-xs text-slate-500">
        {data.map((d, i) => (
          <span key={i}>{d.label}</span>
        ))}
      </div>
    </div>
  );
}

export default function MerchantAnalytics() {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('7d');
  const [stats, setStats] = useState({
    totalVolume: 0,
    transactionCount: 0,
    successRate: 0,
    avgTicketSize: 0,
    previousVolume: 0,
    previousTransactionCount: 0,
    previousSuccessRate: 0,
    previousAvgTicketSize: 0,
  });
  const [volumeData, setVolumeData] = useState([]);
  const [methodData, setMethodData] = useState([]);
  const [hourlyData, setHourlyData] = useState([]);

  useEffect(() => {
    fetchAnalytics();
  }, [dateRange]);

  const fetchAnalytics = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      const now = new Date();
      const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
      const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      const previousStartDate = new Date(startDate.getTime() - days * 24 * 60 * 60 * 1000);

      const { data: payins } = await supabase.from('payins').select('amount, status, payment_method, created_at')
        .eq('merchant_id', user.id).gte('created_at', startDate.toISOString()).limit(500);

      const { data: prevPayins } = await supabase.from('payins').select('amount, status')
        .eq('merchant_id', user.id).gte('created_at', previousStartDate.toISOString()).lt('created_at', startDate.toISOString()).limit(500);

      let totalVolume = 0, successCount = 0;
      const methodCounts = {}, dailyVolumes = {}, hourCounts = Array(24).fill(0);

      (payins || []).forEach(data => {
        const amount = Number(data.amount || 0);
        totalVolume += amount;
        if (data.status === 'success' || data.status === 'completed') successCount++;
        const method = data.payment_method || 'UPI';
        methodCounts[method] = (methodCounts[method] || 0) + 1;
        const date = new Date(data.created_at);
        const dateKey = date.toLocaleDateString('en-IN');
        dailyVolumes[dateKey] = (dailyVolumes[dateKey] || 0) + amount;
        hourCounts[date.getHours()]++;
      });

      let previousVolume = 0, previousSuccessCount = 0;
      (prevPayins || []).forEach(data => {
        previousVolume += Number(data.amount || 0);
        if (data.status === 'success' || data.status === 'completed') previousSuccessCount++;
      });

      const totalCount = (payins || []).length;
      const successRate = totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 0;
      const avgTicketSize = totalCount > 0 ? Math.round(totalVolume / totalCount) : 0;

      const previousCount = (prevPayins || []).length;
      const previousSuccessRate = previousCount > 0 ? Math.round((previousSuccessCount / previousCount) * 100) : 0;
      const previousAvgTicketSize = previousCount > 0 ? Math.round(previousVolume / previousCount) : 0;

      setStats({
        totalVolume,
        transactionCount: totalCount,
        successRate,
        avgTicketSize,
        previousVolume,
        previousTransactionCount: previousCount,
        previousSuccessRate,
        previousAvgTicketSize,
      });

      // Volume chart data
      const volumeArray = Object.entries(dailyVolumes)
        .slice(-7)
        .map(([label, value]) => ({ label: label.split('/')[0], value }));
      setVolumeData(volumeArray);

      // Method distribution
      const methodArray = Object.entries(methodCounts)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value);
      setMethodData(methodArray);

      // Peak hours
      const topHours = hourCounts
        .map((count, hour) => ({ label: `${hour}:00`, value: count }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);
      setHourlyData(topHours);

    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  // Calculate growth percentages
  const volumeGrowth = stats.previousVolume > 0 
    ? ((stats.totalVolume - stats.previousVolume) / stats.previousVolume * 100).toFixed(1)
    : (stats.totalVolume > 0 ? '+100' : '0');
  const txnGrowth = stats.previousTransactionCount > 0
    ? ((stats.transactionCount - stats.previousTransactionCount) / stats.previousTransactionCount * 100).toFixed(1)
    : (stats.transactionCount > 0 ? '+100' : '0');
  const successRateGrowth = stats.previousSuccessRate > 0
    ? (stats.successRate - stats.previousSuccessRate).toFixed(1)
    : (stats.successRate > 0 ? `+${stats.successRate}` : '0');
  const avgTicketGrowth = stats.previousAvgTicketSize > 0
    ? ((stats.avgTicketSize - stats.previousAvgTicketSize) / stats.previousAvgTicketSize * 100).toFixed(1)
    : (stats.avgTicketSize > 0 ? '+100' : '0');

  const handleExportReport = () => {
    const csv = [
      ['Metric', 'Value'],
      ['Total Volume', `₹${stats.totalVolume}`],
      ['Transaction Count', stats.transactionCount],
      ['Success Rate', `${stats.successRate}%`],
      ['Avg Ticket Size', `₹${stats.avgTicketSize}`],
    ].map(r => r.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-${dateRange}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <RefreshCw className="w-10 h-10 text-purple-500 animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm font-medium">Loading analytics…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Desktop header */}
      <div className="hidden sm:flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-sm">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            Analytics
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 ml-11">Business insights</p>
        </div>
        <button onClick={handleExportReport}
          className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 text-green-700 rounded-xl hover:bg-green-100 text-sm font-semibold">
          <Download className="w-4 h-4" /> Export Report
        </button>
      </div>

      {/* Date range pills */}
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {[
          { label: 'Last 7 Days', value: '7d' },
          { label: 'Last 30 Days', value: '30d' },
          { label: 'Last 90 Days', value: '90d' },
        ].map(range => (
          <button
            key={range.value}
            onClick={() => setDateRange(range.value)}
            className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              dateRange === range.value
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {range.label}
          </button>
        ))}
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          title="Total Volume"
          value={`₹${(stats.totalVolume / 1000).toFixed(1)}k`}
          icon={TrendingUp}
          color="green"
          trend={Number(volumeGrowth)}
        />
        <StatCard
          title="Transactions"
          value={stats.transactionCount}
          icon={Activity}
          color="blue"
          trend={Number(txnGrowth)}
        />
        <StatCard
          title="Success Rate"
          value={`${stats.successRate}%`}
          icon={PieChart}
          color="purple"
          trend={Number(successRateGrowth)}
        />
        <StatCard
          title="Avg Ticket"
          value={`₹${stats.avgTicketSize}`}
          icon={FileText}
          color="orange"
          trend={Number(avgTicketGrowth)}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SimpleLineChart data={volumeData} title="Transaction Volume Trend" />
        <SimpleBarChart data={methodData} title="Payment Method Distribution" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SimpleBarChart data={hourlyData} title="Peak Transaction Hours" />
        
        {/* Comparison card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <h3 className="text-sm font-bold text-slate-900 mb-4">Period Comparison</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
              <div>
                <p className="text-xs text-green-600 font-semibold">Current Period</p>
                <p className="text-lg font-bold text-green-900">₹{stats.totalVolume.toLocaleString()}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-600" />
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <div>
                <p className="text-xs text-slate-600 font-semibold">Previous Period</p>
                <p className="text-lg font-bold text-slate-900">₹{stats.previousVolume.toLocaleString()}</p>
              </div>
              <BarChart3 className="w-8 h-8 text-slate-400" />
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-200">
              <span className="text-xs text-slate-600 font-semibold">Growth</span>
              <span className={`text-sm font-bold flex items-center gap-1 ${Number(volumeGrowth) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {Number(volumeGrowth) >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                {Number(volumeGrowth) >= 0 ? '+' : ''}{volumeGrowth}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Insights */}
      <div className="bg-gradient-to-br from-purple-50 to-blue-50 border border-purple-200 rounded-xl p-4">
        <h3 className="text-sm font-bold text-purple-900 mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Key Insights
        </h3>
        <ul className="space-y-2 text-sm text-purple-800">
          {hourlyData.length > 0 && (
            <li className="flex items-start gap-2">
              <span className="text-purple-500 font-bold">•</span>
              <span>Peak transaction hour: {hourlyData[0]?.label} ({hourlyData[0]?.value} transactions)</span>
            </li>
          )}
          {methodData.length > 0 && (
            <li className="flex items-start gap-2">
              <span className="text-purple-500 font-bold">•</span>
              <span>{methodData[0]?.label} is the most preferred payment method ({methodData[0]?.value} transactions)</span>
            </li>
          )}
          <li className="flex items-start gap-2">
            <span className="text-purple-500 font-bold">•</span>
            <span>Success rate {Number(successRateGrowth) >= 0 ? 'improved' : 'declined'} by {Math.abs(Number(successRateGrowth))}% compared to previous period</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-purple-500 font-bold">•</span>
            <span>Total volume {Number(volumeGrowth) >= 0 ? 'increased' : 'decreased'} by {Math.abs(Number(volumeGrowth))}% vs previous {dateRange}</span>
          </li>
        </ul>
      </div>
    </div>
  );
}