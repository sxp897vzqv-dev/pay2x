import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { getDailySummaries, generateDailySummary, createExportJob, getExportJobs } from '../../utils/enterprise';
import { BarChart3, Download, Calendar, TrendingUp, TrendingDown, RefreshCw, FileText, Clock, CheckCircle, XCircle, Shield } from 'lucide-react';
import TwoFactorModal, { useTwoFactorVerification } from '../../components/TwoFactorModal';
import { TwoFactorActions } from '../../hooks/useTwoFactor';

export default function AdminReports() {
  const [summaries, setSummaries] = useState([]);
  const [exports, setExports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('daily');
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });
  const [generating, setGenerating] = useState(false);
  
  // 2FA
  const { requireVerification, TwoFactorModal: TwoFactorModalComponent } = useTwoFactorVerification();

  useEffect(() => { fetchData(); }, [dateRange]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [summariesData, exportsData] = await Promise.all([
        getDailySummaries(dateRange.start, dateRange.end),
        getExportJobs(20)
      ]);
      setSummaries(summariesData);
      setExports(exportsData);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleGenerateToday = async () => {
    setGenerating(true);
    try {
      await generateDailySummary(new Date().toISOString().split('T')[0]);
      fetchData();
    } catch (e) {
      console.error(e);
      alert('Failed to generate summary');
    }
    setGenerating(false);
  };

  const doExport = async (type) => {
    try {
      await createExportJob(type, {}, dateRange.start, dateRange.end);
      fetchData();
      alert(`Export job created for ${type}. Check exports tab.`);
    } catch (e) {
      console.error(e);
      alert('Failed to create export job');
    }
  };

  const handleExport = (type) => {
    requireVerification('Export Sensitive Data', TwoFactorActions.EXPORT_SENSITIVE, () => doExport(type));
  };

  const totals = summaries.reduce((acc, s) => ({
    payinCount: acc.payinCount + (s.total_payin_count || 0),
    payinAmount: acc.payinAmount + Number(s.total_payin_amount || 0),
    payoutCount: acc.payoutCount + (s.total_payout_count || 0),
    payoutAmount: acc.payoutAmount + Number(s.total_payout_amount || 0),
    revenue: acc.revenue + Number(s.total_revenue || 0),
  }), { payinCount: 0, payinAmount: 0, payoutCount: 0, payoutAmount: 0, revenue: 0 });

  const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-6 h-6" />
            Reports & Analytics
          </h1>
          <p className="text-gray-400 text-sm mt-1">Daily summaries and data exports</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleGenerateToday}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
            Generate Today
          </button>
        </div>
      </div>

      {/* Date Range */}
      <div className="flex gap-3 items-center">
        <Calendar className="w-4 h-4 text-gray-400" />
        <input
          type="date"
          value={dateRange.start}
          onChange={(e) => setDateRange(d => ({ ...d, start: e.target.value }))}
          className="bg-[#1a1a2e] border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
        />
        <span className="text-gray-500">to</span>
        <input
          type="date"
          value={dateRange.end}
          onChange={(e) => setDateRange(d => ({ ...d, end: e.target.value }))}
          className="bg-[#1a1a2e] border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
        />
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-white/5">
          <p className="text-gray-400 text-sm">Total Payins</p>
          <p className="text-2xl font-bold text-green-400">{totals.payinCount.toLocaleString()}</p>
          <p className="text-sm text-gray-500">{formatCurrency(totals.payinAmount)}</p>
        </div>
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-white/5">
          <p className="text-gray-400 text-sm">Total Payouts</p>
          <p className="text-2xl font-bold text-blue-400">{totals.payoutCount.toLocaleString()}</p>
          <p className="text-sm text-gray-500">{formatCurrency(totals.payoutAmount)}</p>
        </div>
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-white/5">
          <p className="text-gray-400 text-sm">Volume</p>
          <p className="text-2xl font-bold text-white">{formatCurrency(totals.payinAmount + totals.payoutAmount)}</p>
        </div>
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-white/5">
          <p className="text-gray-400 text-sm">Revenue</p>
          <p className="text-2xl font-bold text-emerald-400">{formatCurrency(totals.revenue)}</p>
        </div>
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-white/5">
          <p className="text-gray-400 text-sm">Days</p>
          <p className="text-2xl font-bold text-white">{summaries.length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10">
        {[
          { key: 'daily', label: 'Daily Summaries' },
          { key: 'exports', label: 'Data Exports' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'text-indigo-400 border-b-2 border-indigo-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'daily' ? (
        <DailySummariesTab summaries={summaries} loading={loading} />
      ) : (
        <ExportsTab exports={exports} onExport={handleExport} loading={loading} />
      )}
    </div>
  );
}

function DailySummariesTab({ summaries, loading }) {
  const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading...</div>;
  }

  if (summaries.length === 0) {
    return (
      <div className="bg-[#1a1a2e] rounded-xl border border-white/5 p-8 text-center">
        <BarChart3 className="w-12 h-12 text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400">No summaries for this period</p>
        <p className="text-gray-500 text-sm">Click "Generate Today" to create a summary</p>
      </div>
    );
  }

  return (
    <div className="bg-[#1a1a2e] rounded-xl border border-white/5 overflow-hidden">
      <table className="w-full">
        <thead className="bg-black/20">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Date</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Payins</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Payouts</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Success Rate</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Revenue</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Disputes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {summaries.map(s => (
            <tr key={s.id} className="hover:bg-white/5">
              <td className="px-4 py-3 text-white font-medium">
                {new Date(s.summary_date).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })}
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-green-400">{s.total_payin_count || 0}</span>
                <span className="text-gray-500 text-sm ml-2">{formatCurrency(s.total_payin_amount)}</span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-blue-400">{s.total_payout_count || 0}</span>
                <span className="text-gray-500 text-sm ml-2">{formatCurrency(s.total_payout_amount)}</span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className={Number(s.payin_success_rate) >= 80 ? 'text-green-400' : 'text-yellow-400'}>
                  {Number(s.payin_success_rate || 0).toFixed(1)}%
                </span>
              </td>
              <td className="px-4 py-3 text-right text-emerald-400 font-medium">
                {formatCurrency(s.total_revenue)}
              </td>
              <td className="px-4 py-3 text-right">
                <span className={s.dispute_count > 0 ? 'text-red-400' : 'text-gray-500'}>
                  {s.dispute_count || 0}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExportsTab({ exports, onExport, loading }) {
  const EXPORT_TYPES = [
    { key: 'payins', label: 'Payins', icon: TrendingUp },
    { key: 'payouts', label: 'Payouts', icon: TrendingDown },
    { key: 'settlements', label: 'Settlements', icon: FileText },
    { key: 'disputes', label: 'Disputes', icon: FileText },
  ];

  const STATUS_CONFIG = {
    pending: { color: 'yellow', icon: Clock },
    generating: { color: 'blue', icon: RefreshCw },
    completed: { color: 'green', icon: CheckCircle },
    failed: { color: 'red', icon: XCircle },
  };

  return (
    <div className="space-y-6">
      {/* Export Buttons */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {EXPORT_TYPES.map(type => (
          <button
            key={type.key}
            onClick={() => onExport(type.key)}
            className="bg-[#1a1a2e] rounded-xl p-4 border border-white/5 hover:border-indigo-500/50 transition-colors text-left"
          >
            <type.icon className="w-8 h-8 text-indigo-400 mb-2" />
            <p className="text-white font-medium">Export {type.label}</p>
            <p className="text-gray-500 text-sm">Download as CSV</p>
          </button>
        ))}
      </div>

      {/* Recent Exports */}
      <div>
        <h3 className="text-white font-medium mb-3">Recent Exports</h3>
        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : exports.length === 0 ? (
          <div className="bg-[#1a1a2e] rounded-xl border border-white/5 p-6 text-center text-gray-500">
            No exports yet
          </div>
        ) : (
          <div className="space-y-2">
            {exports.map(exp => {
              const statusCfg = STATUS_CONFIG[exp.status] || STATUS_CONFIG.pending;
              const StatusIcon = statusCfg.icon;

              return (
                <div key={exp.id} className="bg-[#1a1a2e] rounded-lg border border-white/5 p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-white text-sm capitalize">{exp.export_type} Export</p>
                      <p className="text-gray-500 text-xs">
                        {new Date(exp.created_at).toLocaleString()} • {exp.row_count || '-'} rows
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`flex items-center gap-1 px-2 py-1 text-xs rounded bg-${statusCfg.color}-500/20 text-${statusCfg.color}-400`}>
                      <StatusIcon className="w-3 h-3" />
                      {exp.status}
                    </span>
                    {exp.status === 'completed' && exp.file_path && (
                      <a
                        href={`${supabase.storageUrl}/object/public/exports/${exp.file_path}`}
                        download
                        className="p-2 bg-green-600 hover:bg-green-700 rounded text-white"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {/* 2FA Modal */}
      <TwoFactorModalComponent />
    </div>
  );
}
