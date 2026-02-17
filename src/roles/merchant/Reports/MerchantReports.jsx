import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabase';
import {
  BarChart3, Download, Calendar, TrendingUp, TrendingDown,
  CheckCircle, XCircle, Clock, Wallet, RefreshCw, ArrowUpRight,
  ArrowDownRight, Percent, IndianRupee, Activity, FileText,
} from 'lucide-react';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';

export default function MerchantReports() {
  const [loading, setLoading] = useState(true);
  const [merchant, setMerchant] = useState(null);
  const [dateRange, setDateRange] = useState('7d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [stats, setStats] = useState({});
  const [prevStats, setPrevStats] = useState({});
  const [dailyData, setDailyData] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (dateRange !== 'custom') {
      loadData();
    }
  }, [dateRange]);

  function getDateRange(range) {
    // Custom date range
    if (range === 'custom' && customFrom && customTo) {
      const start = new Date(`${customFrom}T00:00:00`);
      const end = new Date(`${customTo}T23:59:59`);
      const days = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
      const prevStart = new Date(start.getTime() - days * 24 * 60 * 60 * 1000);
      return { 
        start: start.toISOString(), 
        end: end.toISOString(),
        prevStart: prevStart.toISOString(), 
        prevEnd: start.toISOString() 
      };
    }
    
    // Preset ranges
    const now = new Date();
    const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : 365;
    const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const prevStart = new Date(start.getTime() - days * 24 * 60 * 60 * 1000);
    return { start: start.toISOString(), prevStart: prevStart.toISOString(), prevEnd: start.toISOString() };
  }

  function applyCustomRange() {
    if (customFrom && customTo) {
      setDateRange('custom');
      loadData();
    }
  }

  function clearCustomRange() {
    setCustomFrom('');
    setCustomTo('');
    setDateRange('7d');
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

      const { start, end, prevStart, prevEnd } = getDateRange(dateRange);

      // Current period payins
      let payinQuery = supabase
        .from('payins')
        .select('status, amount, commission, created_at, completed_at')
        .eq('merchant_id', merchantData.id)
        .gte('created_at', start);
      
      if (end) payinQuery = payinQuery.lte('created_at', end);
      const { data: payins } = await payinQuery;

      // Previous period payins (for comparison)
      const { data: prevPayins } = await supabase
        .from('payins')
        .select('status, amount')
        .eq('merchant_id', merchantData.id)
        .gte('created_at', prevStart)
        .lt('created_at', prevEnd);

      // Current period payouts
      let payoutQuery = supabase
        .from('payouts')
        .select('status, amount, commission, created_at')
        .eq('merchant_id', merchantData.id)
        .gte('created_at', start);
      
      if (end) payoutQuery = payoutQuery.lte('created_at', end);
      const { data: payouts } = await payoutQuery;

      // Calculate current stats
      const completedPayins = payins?.filter(p => p.status === 'completed') || [];
      const failedPayins = payins?.filter(p => ['failed', 'rejected', 'expired'].includes(p.status)) || [];
      const pendingPayins = payins?.filter(p => p.status === 'pending') || [];
      
      const completedPayouts = payouts?.filter(p => p.status === 'completed') || [];
      const pendingPayouts = payouts?.filter(p => ['pending', 'assigned', 'processing'].includes(p.status)) || [];

      const payinVolume = completedPayins.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const payinFees = completedPayins.reduce((sum, p) => sum + Number(p.commission || 0), 0);
      const payoutVolume = completedPayouts.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const payoutFees = completedPayouts.reduce((sum, p) => sum + Number(p.commission || 0), 0);

      const payinSuccessRate = payins?.length > 0 
        ? ((completedPayins.length / payins.length) * 100).toFixed(1) 
        : 0;

      // Average completion time (for completed payins)
      let avgCompletionTime = 0;
      const completedWithTime = completedPayins.filter(p => p.completed_at);
      if (completedWithTime.length > 0) {
        const totalTime = completedWithTime.reduce((sum, p) => {
          const created = new Date(p.created_at).getTime();
          const completed = new Date(p.completed_at).getTime();
          return sum + (completed - created);
        }, 0);
        avgCompletionTime = Math.round(totalTime / completedWithTime.length / 1000 / 60); // minutes
      }

      setStats({
        // Payins
        totalPayins: payins?.length || 0,
        completedPayins: completedPayins.length,
        failedPayins: failedPayins.length,
        pendingPayins: pendingPayins.length,
        payinVolume,
        payinFees,
        payinSuccessRate: Number(payinSuccessRate),
        avgPayinAmount: completedPayins.length > 0 ? payinVolume / completedPayins.length : 0,
        avgCompletionTime,
        // Payouts
        totalPayouts: payouts?.length || 0,
        completedPayouts: completedPayouts.length,
        pendingPayouts: pendingPayouts.length,
        payoutVolume,
        payoutFees,
        // Net
        netVolume: payinVolume - payoutVolume,
        totalFees: payinFees + payoutFees,
      });

      // Previous period stats for comparison
      const prevCompleted = prevPayins?.filter(p => p.status === 'completed') || [];
      const prevVolume = prevCompleted.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      setPrevStats({
        payinVolume: prevVolume,
        completedPayins: prevCompleted.length,
      });

      // Daily data for chart
      const dailyMap = {};
      payins?.forEach(p => {
        const day = new Date(p.created_at).toLocaleDateString('en-CA');
        if (!dailyMap[day]) {
          dailyMap[day] = { date: day, payinVolume: 0, payinCount: 0, payoutVolume: 0, payoutCount: 0 };
        }
        if (p.status === 'completed') {
          dailyMap[day].payinVolume += Number(p.amount || 0);
          dailyMap[day].payinCount++;
        }
      });
      payouts?.forEach(p => {
        const day = new Date(p.created_at).toLocaleDateString('en-CA');
        if (!dailyMap[day]) {
          dailyMap[day] = { date: day, payinVolume: 0, payinCount: 0, payoutVolume: 0, payoutCount: 0 };
        }
        if (p.status === 'completed') {
          dailyMap[day].payoutVolume += Number(p.amount || 0);
          dailyMap[day].payoutCount++;
        }
      });

      setDailyData(Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date)));

    } catch (err) {
      console.error('Error loading reports:', err);
    }
    setLoading(false);
  }

  async function exportCSV(type) {
    setExporting(true);
    try {
      const { start, end } = getDateRange(dateRange);
      const table = type === 'payins' ? 'payins' : 'payouts';
      
      let query = supabase
        .from(table)
        .select('*')
        .eq('merchant_id', merchant.id)
        .gte('created_at', start);
      
      if (end) query = query.lte('created_at', end);
      const { data } = await query.order('created_at', { ascending: false });

      if (!data || data.length === 0) {
        alert('No data to export');
        setExporting(false);
        return;
      }

      const headers = type === 'payins' 
        ? ['ID', 'Order ID', 'Amount', 'Commission', 'Status', 'UPI ID', 'UTR', 'Created', 'Completed']
        : ['ID', 'Amount', 'Commission', 'Status', 'Beneficiary', 'UTR', 'Created', 'Completed'];
      
      const rows = data.map(p => type === 'payins' ? [
        p.id, p.order_id || '', p.amount, p.commission || 0, p.status,
        p.upi_id || '', p.utr || '', p.created_at, p.completed_at || ''
      ] : [
        p.id, p.amount, p.commission || 0, p.status,
        p.beneficiary_name || '', p.utr || '', p.created_at, p.completed_at || ''
      ]);

      const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}_${dateRange}_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
      alert('Failed to export');
    }
    setExporting(false);
  }

  const formatCurrency = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN')}`;
  
  const getChange = (current, previous) => {
    if (!previous || previous === 0) return null;
    const change = ((current - previous) / previous) * 100;
    return change.toFixed(1);
  };

  const ChangeIndicator = ({ current, previous }) => {
    const change = getChange(current, previous);
    if (change === null) return null;
    const isPositive = Number(change) >= 0;
    return (
      <span className={`flex items-center gap-0.5 text-xs font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
        {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
        {Math.abs(Number(change))}%
      </span>
    );
  };

  if (loading) {
    return <LoadingSpinner message="Loading reports…" />;
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="hidden sm:block">
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl shadow-sm">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            Reports
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 ml-11">Performance analytics & insights</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={dateRange}
            onChange={(e) => {
              if (e.target.value !== 'custom') {
                setCustomFrom('');
                setCustomTo('');
              }
              setDateRange(e.target.value);
            }}
            className="px-3 py-2 border border-slate-300 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-400"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="365d">Last year</option>
            <option value="custom">Custom Range</option>
          </select>
          
          {dateRange === 'custom' && (
            <>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-400"
              />
              <span className="text-slate-400 text-sm">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-400"
              />
              <button
                onClick={applyCustomRange}
                disabled={!customFrom || !customTo}
                className="px-3 py-1.5 bg-purple-600 text-white text-sm font-semibold rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Apply
              </button>
            </>
          )}
          
          <button
            onClick={() => loadData()}
            className="p-2 border border-slate-300 rounded-xl hover:bg-slate-50"
          >
            <RefreshCw className="w-4 h-4 text-slate-600" />
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Payin Volume</span>
            <TrendingUp className="w-4 h-4 text-green-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{formatCurrency(stats.payinVolume)}</p>
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-slate-500">{stats.completedPayins} transactions</span>
            <ChangeIndicator current={stats.payinVolume} previous={prevStats.payinVolume} />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Payout Volume</span>
            <TrendingDown className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{formatCurrency(stats.payoutVolume)}</p>
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-slate-500">{stats.completedPayouts} payouts</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Success Rate</span>
            <Percent className="w-4 h-4 text-purple-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{stats.payinSuccessRate}%</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-green-600">{stats.completedPayins} ✓</span>
            <span className="text-xs text-red-600">{stats.failedPayins} ✗</span>
            <span className="text-xs text-amber-600">{stats.pendingPayins} ⏳</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Avg Time</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900">
            {stats.avgCompletionTime > 0 ? `${stats.avgCompletionTime}m` : '—'}
          </p>
          <span className="text-xs text-slate-500">to complete payin</span>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-900">Daily Volume</h3>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-500 rounded" /> Payins</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-500 rounded" /> Payouts</span>
          </div>
        </div>
        {dailyData.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-slate-400">
            <Activity className="w-8 h-8 mr-2" /> No data for selected period
          </div>
        ) : (
          <div className="h-40 flex items-end gap-1">
            {dailyData.slice(-30).map((day) => {
              const maxVol = Math.max(...dailyData.map(d => Math.max(d.payinVolume, d.payoutVolume))) || 1;
              const payinH = (day.payinVolume / maxVol) * 100;
              const payoutH = (day.payoutVolume / maxVol) * 100;
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                  <div className="w-full flex flex-col gap-0.5" style={{ height: '100%' }}>
                    <div className="bg-green-500 rounded-t w-full" style={{ height: `${Math.max(payinH, 1)}%` }} />
                    {day.payoutVolume > 0 && (
                      <div className="bg-blue-500 rounded-b w-full" style={{ height: `${Math.max(payoutH, 1)}%` }} />
                    )}
                  </div>
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10 pointer-events-none">
                    {day.date}<br />
                    In: {formatCurrency(day.payinVolume)}<br />
                    Out: {formatCurrency(day.payoutVolume)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {dailyData.length > 0 && (
          <div className="flex justify-between mt-2 text-xs text-slate-400">
            <span>{dailyData[Math.max(0, dailyData.length - 30)]?.date}</span>
            <span>{dailyData[dailyData.length - 1]?.date}</span>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Payin Summary */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-500" /> Payin Summary
            </h3>
            <button
              onClick={() => exportCSV('payins')}
              disabled={exporting}
              className="text-xs text-purple-600 hover:text-purple-700 font-semibold flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" /> Export
            </button>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">Total Transactions</span>
              <span className="font-semibold">{stats.totalPayins}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5 text-green-500" /> Completed
              </span>
              <span className="font-semibold text-green-600">{stats.completedPayins}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600 flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5 text-red-500" /> Failed
              </span>
              <span className="font-semibold text-red-600">{stats.failedPayins}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-500" /> Pending
              </span>
              <span className="font-semibold text-amber-600">{stats.pendingPayins}</span>
            </div>
            <div className="border-t border-slate-100 pt-3 flex justify-between items-center">
              <span className="text-sm text-slate-600">Avg Transaction</span>
              <span className="font-semibold">{formatCurrency(stats.avgPayinAmount)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">Total Fees Paid</span>
              <span className="font-semibold text-purple-600">{formatCurrency(stats.payinFees)}</span>
            </div>
          </div>
        </div>

        {/* Payout Summary */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-blue-500" /> Payout Summary
            </h3>
            <button
              onClick={() => exportCSV('payouts')}
              disabled={exporting}
              className="text-xs text-purple-600 hover:text-purple-700 font-semibold flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" /> Export
            </button>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">Total Requests</span>
              <span className="font-semibold">{stats.totalPayouts}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5 text-green-500" /> Completed
              </span>
              <span className="font-semibold text-green-600">{stats.completedPayouts}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-500" /> In Progress
              </span>
              <span className="font-semibold text-amber-600">{stats.pendingPayouts}</span>
            </div>
            <div className="border-t border-slate-100 pt-3 flex justify-between items-center">
              <span className="text-sm text-slate-600">Volume Paid Out</span>
              <span className="font-semibold">{formatCurrency(stats.payoutVolume)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">Total Fees Paid</span>
              <span className="font-semibold text-purple-600">{formatCurrency(stats.payoutFees)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Net Summary */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl p-4 text-white">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-purple-200 text-xs font-semibold uppercase mb-1">Net Flow</p>
            <p className="text-2xl font-bold">{formatCurrency(stats.netVolume)}</p>
            <p className="text-purple-200 text-xs">Payins - Payouts</p>
          </div>
          <div>
            <p className="text-purple-200 text-xs font-semibold uppercase mb-1">Total Fees</p>
            <p className="text-2xl font-bold">{formatCurrency(stats.totalFees)}</p>
            <p className="text-purple-200 text-xs">All commissions</p>
          </div>
          <div>
            <p className="text-purple-200 text-xs font-semibold uppercase mb-1">Transactions</p>
            <p className="text-2xl font-bold">{stats.totalPayins + stats.totalPayouts}</p>
            <p className="text-purple-200 text-xs">Total processed</p>
          </div>
        </div>
      </div>
    </div>
  );
}
