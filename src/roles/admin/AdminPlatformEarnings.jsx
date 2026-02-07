import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabase';
import {
  DollarSign, TrendingUp, TrendingDown, Calendar,
  RefreshCw, Download, PieChart, BarChart3
} from 'lucide-react';

const StatCard = ({ title, value, subtitle, icon: Icon, color = 'green' }) => {
  const colors = {
    green: 'bg-green-50 border-green-200 text-green-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
  };
  
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4" />
        <span className="text-xs font-bold uppercase tracking-wide opacity-75">{title}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {subtitle && <p className="text-xs mt-1 opacity-75">{subtitle}</p>}
    </div>
  );
};

export default function AdminPlatformEarnings() {
  const [earnings, setEarnings] = useState([]);
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('7d');
  const [viewMode, setViewMode] = useState('list');

  useEffect(() => {
    fetchData();
  }, [dateRange]);

  const fetchData = async () => {
    setLoading(true);
    
    // Calculate date filter
    const now = new Date();
    let startDate = new Date();
    if (dateRange === '7d') startDate.setDate(now.getDate() - 7);
    else if (dateRange === '30d') startDate.setDate(now.getDate() - 30);
    else if (dateRange === '90d') startDate.setDate(now.getDate() - 90);
    else startDate = new Date(0); // All time
    
    // Fetch earnings
    const { data: earningsData } = await supabase
      .from('platform_earnings')
      .select('*')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(500);
    
    setEarnings(earningsData || []);
    
    // Fetch summary view
    const { data: summaryData } = await supabase
      .from('platform_earnings_summary')
      .select('*')
      .limit(30);
    
    setSummary(summaryData || []);
    setLoading(false);
  };

  const stats = useMemo(() => {
    const totalProfit = earnings.reduce((sum, e) => sum + Number(e.platform_profit || 0), 0);
    const totalVolume = earnings.reduce((sum, e) => sum + Number(e.transaction_amount || 0), 0);
    const payinProfit = earnings.filter(e => e.type === 'payin').reduce((sum, e) => sum + Number(e.platform_profit || 0), 0);
    const payoutProfit = earnings.filter(e => e.type === 'payout').reduce((sum, e) => sum + Number(e.platform_profit || 0), 0);
    const merchantFees = earnings.reduce((sum, e) => sum + Number(e.merchant_fee || 0), 0);
    const traderFees = earnings.reduce((sum, e) => sum + Number(e.trader_fee || 0), 0);
    
    return {
      totalProfit,
      totalVolume,
      payinProfit,
      payoutProfit,
      merchantFees,
      traderFees,
      transactionCount: earnings.length,
      avgProfitMargin: totalVolume > 0 ? ((totalProfit / totalVolume) * 100).toFixed(2) : 0,
    };
  }, [earnings]);

  const handleExport = () => {
    const csv = [
      ['Date', 'Type', 'Amount', 'Merchant Fee', 'Trader Fee', 'Platform Profit', 'Merchant ID', 'Trader ID'],
      ...earnings.map(e => [
        new Date(e.created_at).toLocaleString(),
        e.type,
        e.transaction_amount,
        e.merchant_fee,
        e.trader_fee,
        e.platform_profit,
        e.merchant_id,
        e.trader_id,
      ])
    ].map(r => r.join(',')).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `platform-earnings-${Date.now()}.csv`;
    a.click();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <RefreshCw className="w-10 h-10 text-green-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl shadow-sm">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
            Platform Earnings
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 ml-11">Track profits from payins & payouts</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={dateRange}
            onChange={e => setDateRange(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All time</option>
          </select>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700"
          >
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Profit"
          value={`₹${stats.totalProfit.toLocaleString()}`}
          subtitle={`${stats.transactionCount} transactions`}
          icon={DollarSign}
          color="green"
        />
        <StatCard
          title="Payin Profit"
          value={`₹${stats.payinProfit.toLocaleString()}`}
          subtitle="From payments received"
          icon={TrendingUp}
          color="blue"
        />
        <StatCard
          title="Payout Profit"
          value={`₹${stats.payoutProfit.toLocaleString()}`}
          subtitle="From payments sent"
          icon={TrendingDown}
          color="purple"
        />
        <StatCard
          title="Avg Margin"
          value={`${stats.avgProfitMargin}%`}
          subtitle={`On ₹${stats.totalVolume.toLocaleString()} volume`}
          icon={PieChart}
          color="amber"
        />
      </div>

      {/* Fee Breakdown */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-slate-500" />
          Fee Breakdown
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-4 bg-slate-50 rounded-lg">
            <p className="text-xs text-slate-500 mb-1">Merchant Fees Collected</p>
            <p className="text-xl font-bold text-slate-900">₹{stats.merchantFees.toLocaleString()}</p>
          </div>
          <div className="text-center p-4 bg-slate-50 rounded-lg">
            <p className="text-xs text-slate-500 mb-1">Trader Fees Paid</p>
            <p className="text-xl font-bold text-slate-900">₹{stats.traderFees.toLocaleString()}</p>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
            <p className="text-xs text-green-600 mb-1">Platform Keeps</p>
            <p className="text-xl font-bold text-green-700">₹{stats.totalProfit.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Daily Summary */}
      {summary.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-500" />
            Daily Summary
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 px-3 font-semibold text-slate-600">Date</th>
                  <th className="text-left py-2 px-3 font-semibold text-slate-600">Type</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-600">Transactions</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-600">Volume</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-600">Merchant Fees</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-600">Trader Fees</th>
                  <th className="text-right py-2 px-3 font-semibold text-green-600">Profit</th>
                </tr>
              </thead>
              <tbody>
                {summary.slice(0, 14).map((row, i) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 px-3">{new Date(row.date).toLocaleDateString()}</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        row.type === 'payin' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {row.type}
                      </span>
                    </td>
                    <td className="text-right py-2 px-3">{row.transaction_count}</td>
                    <td className="text-right py-2 px-3">₹{Number(row.total_volume || 0).toLocaleString()}</td>
                    <td className="text-right py-2 px-3">₹{Number(row.total_merchant_fees || 0).toLocaleString()}</td>
                    <td className="text-right py-2 px-3">₹{Number(row.total_trader_fees || 0).toLocaleString()}</td>
                    <td className="text-right py-2 px-3 font-bold text-green-600">
                      ₹{Number(row.total_profit || 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Transactions */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="font-bold text-slate-900 mb-3">Recent Transactions</h3>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {earnings.slice(0, 50).map((e, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  e.type === 'payin' ? 'bg-green-100' : 'bg-blue-100'
                }`}>
                  {e.type === 'payin' ? (
                    <TrendingUp className="w-4 h-4 text-green-600" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-blue-600" />
                  )}
                </div>
                <div>
                  <p className="font-semibold text-slate-900 text-sm">
                    ₹{Number(e.transaction_amount).toLocaleString()}
                  </p>
                  <p className="text-xs text-slate-500">
                    {new Date(e.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-bold text-green-600 text-sm">
                  +₹{Number(e.platform_profit).toLocaleString()}
                </p>
                <p className="text-xs text-slate-500">
                  Fee: ₹{Number(e.merchant_fee).toLocaleString()} → ₹{Number(e.trader_fee).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
