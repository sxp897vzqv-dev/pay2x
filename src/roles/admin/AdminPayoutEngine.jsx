import React, { useState, useEffect } from 'react';
import {
  Cpu, Activity, TrendingUp, RefreshCw, CheckCircle, XCircle,
  Zap, Settings, BarChart3, Users, AlertTriangle, ChevronDown,
  ChevronUp, Clock, Award, Ban
} from 'lucide-react';
import { Toast } from '../../components/admin';

const API_BASE = 'https://us-central1-pay2x-4748c.cloudfunctions.net';

export default function AdminPayoutEngine() {
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('traders');
  const [expandedLog, setExpandedLog] = useState(null);
  const [editingConfig, setEditingConfig] = useState(false);
  const [editWeights, setEditWeights] = useState({});
  const [editMinScore, setEditMinScore] = useState(20);
  const [editMaxActive, setEditMaxActive] = useState(10);
  const [editEnableRandomness, setEditEnableRandomness] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [toast, setToast] = useState(null);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/getPayoutEngineStats`);
      const data = await response.json();
      if (data.success) {
        setStats(data);
        setError(null);
      } else {
        setError(data.error || 'Unknown error');
      }
    } catch (err) {
      console.error('Fetch error:', err);
      setError(err.message);
    }
    setLoading(false);
  };

  const autoAssign = async () => {
    setAssigning(true);
    try {
      const response = await fetch(`${API_BASE}/autoAssignPayouts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (data.success) {
        alert(`✅ Assigned ${data.assigned} payouts${data.failed > 0 ? `, ${data.failed} failed` : ''}`);
        fetchStats();
      } else {
        alert(`❌ Error: ${data.error}`);
      }
    } catch (err) {
      alert(`❌ Error: ${err.message}`);
    }
    setAssigning(false);
  };

  const initEngine = async () => {
    try {
      const response = await fetch(`${API_BASE}/initPayoutEngine`);
      const data = await response.json();
      if (data.success) {
        setToast({ msg: '✅ Payout Engine config reset to defaults!', success: true });
        fetchStats();
      } else {
        setToast({ msg: `❌ Error: ${data.error}`, success: false });
      }
    } catch (err) {
      setToast({ msg: `❌ Error: ${err.message}`, success: false });
    }
  };

  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      const response = await fetch(`${API_BASE}/updatePayoutEngineConfig`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weights: editWeights,
          minScoreThreshold: editMinScore,
          maxActivePayouts: editMaxActive,
          enableRandomness: editEnableRandomness,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setToast({ msg: '✅ Config saved successfully!', success: true });
        setEditingConfig(false);
        fetchStats();
      } else {
        setToast({ msg: `❌ Error: ${data.error}`, success: false });
      }
    } catch (err) {
      setToast({ msg: `❌ Error: ${err.message}`, success: false });
    }
    setSavingConfig(false);
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <Cpu className="w-12 h-12 text-purple-500 animate-pulse mx-auto mb-3" />
          <p className="text-slate-500 font-medium">Loading Payout Engine...</p>
        </div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-2" />
        <p className="text-red-700 font-medium">{error}</p>
        <div className="flex gap-2 justify-center mt-3">
          <button onClick={fetchStats} className="text-red-600 underline text-sm">Retry</button>
          <button onClick={initEngine} className="text-indigo-600 underline text-sm">Init Engine</button>
        </div>
      </div>
    );
  }

  const summary = stats?.summary || {};
  const recentSelections = stats?.recentSelections || [];
  const traderPerformance = stats?.traderPerformance || [];
  const config = stats?.config || {};

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && <Toast msg={toast.msg} success={toast.success} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl">
            <Cpu className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Payout Engine v1.0</h1>
            <p className="text-slate-500 text-xs">Smart Trader Selection</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={autoAssign}
            disabled={assigning}
            className="px-3 py-2 bg-purple-100 text-purple-700 rounded-lg text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
          >
            <Zap className="w-4 h-4" />
            {assigning ? 'Assigning...' : 'Auto Assign'}
          </button>
          <button
            onClick={fetchStats}
            disabled={loading}
            className="px-3 py-2 bg-indigo-100 text-indigo-700 rounded-lg text-sm font-medium flex items-center gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border p-3">
          <p className="text-xs text-slate-500 mb-1">Active Traders</p>
          <p className="text-xl font-bold">{summary.totalTraders || 0}</p>
          <p className="text-xs text-purple-600">{summary.totalActivePayouts || 0} active payouts</p>
        </div>
        <div className="bg-white rounded-xl border p-3">
          <p className="text-xs text-slate-500 mb-1">Today Volume</p>
          <p className="text-xl font-bold text-green-600">₹{(summary.todayVolume || 0).toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border p-3">
          <p className="text-xs text-slate-500 mb-1">Today Payouts</p>
          <p className="text-xl font-bold">{summary.todayTotalPayouts || 0}</p>
        </div>
        <div className="bg-white rounded-xl border p-3">
          <p className="text-xs text-slate-500 mb-1">Completed Today</p>
          <p className="text-xl font-bold text-green-600">{summary.todayCompleted || 0}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
        {['traders', 'logs', 'config'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition ${
              activeTab === tab ? 'bg-white shadow text-purple-600' : 'text-slate-600'
            }`}
          >
            {tab === 'traders' ? 'Traders' : tab === 'logs' ? 'Selection Logs' : 'Config'}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-xl border overflow-hidden">

        {/* Trader Performance Tab */}
        {activeTab === 'traders' && (
          <div className="divide-y">
            {traderPerformance.length > 0 ? (
              traderPerformance.map((trader, i) => (
                <div key={i} className="p-3">
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${trader.isOnline ? 'bg-green-500' : 'bg-slate-300'}`} />
                      <div>
                        <p className="font-medium text-sm">{trader.traderName}</p>
                        <p className="text-xs text-slate-400 font-mono">{trader.traderId.substring(0, 12)}...</p>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                      trader.priority === 'high' ? 'bg-amber-100 text-amber-700' :
                      trader.priority === 'low' ? 'bg-slate-100 text-slate-500' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {trader.priority}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {/* Active payouts */}
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      trader.activePayouts > 0 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {trader.activePayouts} active
                    </span>

                    {/* Today completed */}
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                      {trader.todayCompleted} done today
                    </span>

                    {/* Today volume */}
                    {trader.todayVolume > 0 && (
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs">
                        ₹{trader.todayVolume.toLocaleString()}
                      </span>
                    )}

                    {/* Cancels */}
                    {trader.todayCancelled > 0 && (
                      <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">
                        {trader.todayCancelled} cancelled
                      </span>
                    )}

                    {/* Success rate */}
                    {trader.successRate !== null && (
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        trader.successRate >= 90 ? 'bg-green-100 text-green-700' :
                        trader.successRate >= 70 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {trader.successRate}% success
                      </span>
                    )}

                    {/* Avg speed */}
                    {trader.avgCompletionMinutes && (
                      <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs flex items-center gap-0.5">
                        <Clock className="w-3 h-3" />
                        {trader.avgCompletionMinutes.toFixed(0)}min avg
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-slate-400">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No trader data</p>
                <button onClick={initEngine} className="mt-2 text-purple-600 text-sm underline">
                  Init Payout Engine
                </button>
              </div>
            )}
          </div>
        )}

        {/* Selection Logs Tab - with expandable reasoning */}
        {activeTab === 'logs' && (
          <div className="divide-y">
            {recentSelections.length > 0 ? (
              recentSelections.map((log, i) => (
                <div key={i} className="p-3">
                  {/* Log Header */}
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => setExpandedLog(expandedLog === i ? null : i)}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">₹{(log.amount || 0).toLocaleString()}</span>
                        <span className="text-xs text-slate-400">{log.amountTier}</span>
                      </div>
                      {log.selectedTrader ? (
                        <p className="text-sm text-slate-700 mt-0.5">
                          → <span className="font-medium">{log.selectedTrader.traderName}</span>
                          <span className="text-slate-400 ml-1">score {log.selectedTrader.score}</span>
                        </p>
                      ) : (
                        <p className="text-sm text-red-500 mt-0.5">No trader selected</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {log.success ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                      {expandedLog === i ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {/* Timestamp */}
                  <p className="text-xs text-slate-400 mt-1">
                    {log.timestamp?._seconds
                      ? new Date(log.timestamp._seconds * 1000).toLocaleString()
                      : 'Unknown'
                    } • {log.attempts || 1} attempt(s)
                  </p>

                  {/* Expanded: Why this trader was selected */}
                  {expandedLog === i && (
                    <div className="mt-3 space-y-3">
                      {/* Why Selected - The main reason */}
                      {log.selectedTrader?.whySelected && (
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                          <p className="text-xs font-semibold text-purple-700 mb-1 flex items-center gap-1">
                            <Award className="w-3.5 h-3.5" />
                            Why this trader was selected
                          </p>
                          <p className="text-sm text-purple-900">{log.selectedTrader.whySelected}</p>
                        </div>
                      )}

                      {/* Selected trader's factor breakdown */}
                      {log.selectedTrader?.summary && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                          <p className="text-xs font-semibold text-green-700 mb-1">Summary</p>
                          <p className="text-sm text-green-900">{log.selectedTrader.summary}</p>
                        </div>
                      )}

                      {/* All candidates comparison */}
                      {log.candidates && log.candidates.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-slate-600">All Candidates</p>
                          {log.candidates.map((candidate, j) => (
                            <div
                              key={j}
                              className={`rounded-lg p-2.5 text-sm ${
                                candidate.traderId === log.selectedTrader?.traderId
                                  ? 'bg-green-50 border border-green-200'
                                  : 'bg-slate-50 border border-slate-200'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium flex items-center gap-1.5">
                                  {candidate.traderId === log.selectedTrader?.traderId && (
                                    <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                                  )}
                                  {candidate.traderName}
                                </span>
                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                  candidate.score >= 70 ? 'bg-green-100 text-green-700' :
                                  candidate.score >= 40 ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-red-100 text-red-700'
                                }`}>
                                  {candidate.score}
                                </span>
                              </div>

                              {/* Factor breakdown */}
                              {candidate.reasons && (
                                <div className="space-y-0.5 mt-1.5">
                                  {Object.entries(candidate.reasons).map(([factor, reason]) => (
                                    <p key={factor} className="text-xs text-slate-600">
                                      <span className="text-slate-400 capitalize">{factor.replace(/([A-Z])/g, ' $1')}:</span>{' '}
                                      {reason}
                                    </p>
                                  ))}
                                </div>
                              )}

                              {/* Summary */}
                              {candidate.summary && (
                                <p className="text-xs text-slate-500 mt-1.5 italic">{candidate.summary}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-slate-400">
                <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No selection logs yet</p>
                <p className="text-xs mt-1">Logs appear when the engine assigns payouts</p>
              </div>
            )}
          </div>
        )}

        {/* Config Tab */}
        {activeTab === 'config' && (
          <div className="p-4 space-y-4">
            <div>
              <h3 className="font-semibold text-slate-900 mb-3">Scoring Weights</h3>
              {editingConfig ? (
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(editWeights).map(([key, value]) => (
                    <div key={key} className="bg-slate-50 rounded-lg p-3">
                      <label className="text-xs text-slate-500 capitalize block mb-1">
                        {key.replace(/([A-Z])/g, ' $1')}
                      </label>
                      <input
                        type="number" min="0" max="100"
                        value={value}
                        onChange={e => setEditWeights(prev => ({...prev, [key]: Number(e.target.value)}))}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm font-bold"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(config.weights || {}).map(([key, value]) => (
                    <div key={key} className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs text-slate-500 capitalize">{key.replace(/([A-Z])/g, ' $1')}</p>
                      <p className="text-lg font-bold text-purple-600">{value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500 mb-1">Min Score Threshold</p>
                {editingConfig ? (
                  <input
                    type="number" min="0" max="100"
                    value={editMinScore}
                    onChange={e => setEditMinScore(Number(e.target.value))}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm font-bold"
                  />
                ) : (
                  <p className="text-lg font-bold">{config.minScoreThreshold || 20}</p>
                )}
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500 mb-1">Max Active Payouts</p>
                {editingConfig ? (
                  <input
                    type="number" min="1" max="100"
                    value={editMaxActive}
                    onChange={e => setEditMaxActive(Number(e.target.value))}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm font-bold"
                  />
                ) : (
                  <p className="text-lg font-bold">{config.maxActivePayouts || 10}</p>
                )}
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500 mb-1">Enable Randomness</p>
                {editingConfig ? (
                  <button
                    onClick={() => setEditEnableRandomness(prev => !prev)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-bold ${editEnableRandomness ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                  >
                    {editEnableRandomness ? 'ON' : 'OFF'}
                  </button>
                ) : (
                  <p className="text-lg font-bold text-purple-600">{config.enableRandomness ? 'ON' : 'OFF'}</p>
                )}
              </div>
            </div>

            {/* Edit / Save / Cancel buttons */}
            <div className="flex gap-2">
              {editingConfig ? (
                <>
                  <button
                    onClick={saveConfig}
                    disabled={savingConfig}
                    className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    {savingConfig ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditingConfig(false)}
                    className="flex-1 px-3 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setEditWeights({...(config.weights || {})});
                      setEditMinScore(config.minScoreThreshold || 20);
                      setEditMaxActive(config.maxActivePayouts || 10);
                      setEditEnableRandomness(config.enableRandomness || false);
                      setEditingConfig(true);
                    }}
                    className="flex-1 px-3 py-2 bg-purple-100 text-purple-700 rounded-lg text-sm font-medium"
                  >
                    Edit Config
                  </button>
                  <button
                    onClick={initEngine}
                    className="flex-1 px-3 py-2 bg-amber-100 text-amber-700 rounded-lg text-sm font-medium"
                  >
                    Reset to Defaults
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
