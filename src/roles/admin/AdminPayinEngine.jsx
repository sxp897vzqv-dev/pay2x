import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';
import {
  Cpu, Activity, TrendingUp, RefreshCw, CheckCircle, XCircle,
  Zap, Settings, BarChart3, Database, AlertTriangle
} from 'lucide-react';
import { Toast } from '../../components/admin';

export default function AdminPayinEngine() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [upis, setUpis] = useState([]);
  const [logs, setLogs] = useState([]);
  const [config, setConfig] = useState({});
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [editingConfig, setEditingConfig] = useState(false);
  const [editWeights, setEditWeights] = useState({});
  const [editEnableRandomness, setEditEnableRandomness] = useState(false);
  const [editRandomExponent, setEditRandomExponent] = useState(2);
  const [savingConfig, setSavingConfig] = useState(false);
  const [toast, setToast] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch UPI Pool
      const { data: upiData, error: upiError } = await supabase
        .from('upi_pool')
        .select('*')
        .order('daily_volume', { ascending: false });

      if (upiError) throw upiError;
      setUpis(upiData || []);

      // Fetch Selection Logs
      const { data: logData, error: logError } = await supabase
        .from('selection_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (!logError) setLogs(logData || []);

      // Fetch Engine Config
      const { data: configData } = await supabase
        .from('system_config')
        .select('*')
        .eq('key', 'payin_engine')
        .single();

      if (configData?.value) {
        setConfig(configData.value);
      }

      // Calculate stats
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const activeUpis = (upiData || []).filter(u => u.status === 'active');
      const todayVolume = (upiData || []).reduce((sum, u) => sum + (Number(u.daily_volume) || 0), 0);
      const todayTxns = (upiData || []).reduce((sum, u) => sum + (Number(u.daily_count) || 0), 0);

      setStats({
        totalUpisInPool: (upiData || []).length,
        activeUpis: activeUpis.length,
        todayTotalVolume: todayVolume,
        todayTotalTxns: todayTxns,
      });

      setError(null);
    } catch (err) {
      console.error('Fetch error:', err);
      setError(err.message);
    }
    setLoading(false);
  };

  // Realtime subscriptions
  useRealtimeSubscription('upi_pool', {
    onChange: fetchData,
  });

  useRealtimeSubscription('selection_logs', {
    onInsert: (newLog) => {
      setLogs(prev => [newLog, ...prev.slice(0, 19)]);
      setToast({ msg: `New selection: ₹${newLog.amount}`, success: true });
    },
  });

  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      const newConfig = {
        weights: editWeights,
        enableRandomness: editEnableRandomness,
        scoreExponent: editRandomExponent,
      };

      const { error } = await supabase
        .from('system_config')
        .upsert({
          key: 'payin_engine',
          value: newConfig,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      setConfig(newConfig);
      setToast({ msg: '✅ Config saved successfully!', success: true });
      setEditingConfig(false);
    } catch (err) {
      setToast({ msg: `❌ Error: ${err.message}`, success: false });
    }
    setSavingConfig(false);
  };

  const resetToDefaults = async () => {
    const defaultConfig = {
      weights: {
        successRate: 25,
        dailyLimitLeft: 20,
        cooldown: 15,
        amountMatch: 15,
        traderBalance: 10,
        bankHealth: 5,
        timeWindow: 5,
        recentFailures: 5,
      },
      enableRandomness: true,
      scoreExponent: 2,
    };

    try {
      const { error } = await supabase
        .from('system_config')
        .upsert({
          key: 'payin_engine',
          value: defaultConfig,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      setConfig(defaultConfig);
      setToast({ msg: '✅ Config reset to defaults!', success: true });
    } catch (err) {
      setToast({ msg: `❌ Error: ${err.message}`, success: false });
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <Cpu className="w-12 h-12 text-indigo-500 animate-pulse mx-auto mb-3" />
          <p className="text-slate-500 font-medium">Loading Engine Stats...</p>
        </div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-2" />
        <p className="text-red-700 font-medium">{error}</p>
        <button onClick={fetchData} className="mt-3 text-red-600 underline text-sm">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {toast && <Toast msg={toast.msg} success={toast.success} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl">
            <Cpu className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Payin Engine v2.0</h1>
            <p className="text-slate-500 text-xs">Smart UPI Selection • Supabase</p>
          </div>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="px-3 py-2 bg-indigo-100 text-indigo-700 rounded-lg text-sm font-medium flex items-center gap-1.5"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border p-3">
          <p className="text-xs text-slate-500 mb-1">UPIs in Pool</p>
          <p className="text-xl font-bold">{stats?.totalUpisInPool || 0}</p>
          <p className="text-xs text-green-600">{stats?.activeUpis || 0} active</p>
        </div>
        <div className="bg-white rounded-xl border p-3">
          <p className="text-xs text-slate-500 mb-1">Today Volume</p>
          <p className="text-xl font-bold text-green-600">₹{(stats?.todayTotalVolume || 0).toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border p-3">
          <p className="text-xs text-slate-500 mb-1">Today Txns</p>
          <p className="text-xl font-bold">{stats?.todayTotalTxns || 0}</p>
        </div>
        <div className="bg-white rounded-xl border p-3">
          <p className="text-xs text-slate-500 mb-1">Randomness</p>
          <p className="text-xl font-bold text-indigo-600">{config.enableRandomness ? 'ON' : 'OFF'}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
        {['overview', 'logs', 'config'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition ${
              activeTab === tab ? 'bg-white shadow text-indigo-600' : 'text-slate-600'
            }`}
          >
            {tab === 'overview' ? 'UPIs' : tab === 'logs' ? 'Logs' : 'Config'}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {/* UPI Performance Tab */}
        {activeTab === 'overview' && (
          <div className="divide-y">
            {upis.length > 0 ? (
              upis.map((upi) => (
                <div key={upi.id} className="p-3">
                  <div className="flex items-start justify-between mb-1">
                    <div>
                      <p className="font-mono text-sm font-medium">{upi.upi_id}</p>
                      <p className="text-xs text-slate-400">{upi.holder_name || upi.trader_id?.slice(0, 8)}</p>
                    </div>
                    <span className={`w-2 h-2 rounded-full mt-1.5 ${upi.status === 'active' ? 'bg-green-500' : 'bg-red-500'}`} />
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="px-2 py-0.5 bg-slate-100 rounded text-xs">{upi.bank_name || 'Unknown'}</span>
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">{upi.amount_tier || 'medium'}</span>
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">₹{(upi.daily_volume || 0).toLocaleString()}</span>
                    <span className="px-2 py-0.5 bg-slate-100 rounded text-xs">{upi.daily_count || 0} txns</span>
                    <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs">{upi.success_rate || 0}%</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-slate-400">
                <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No UPIs in pool</p>
              </div>
            )}
          </div>
        )}

        {/* Selection Logs Tab */}
        {activeTab === 'logs' && (
          <div className="divide-y">
            {logs.length > 0 ? (
              logs.map((log) => (
                <div key={log.id} className="p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold">₹{(log.amount || 0).toLocaleString()}</span>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        (log.score || 0) >= 70 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {log.score || 0}
                      </span>
                      {log.success ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                    </div>
                  </div>
                  <p className="font-mono text-sm text-slate-600">{log.selected_upi || 'None'}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {log.created_at 
                      ? new Date(log.created_at).toLocaleString('en-IN') 
                      : 'Unknown'
                    } • {log.attempts || 1} attempt(s)
                  </p>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-slate-400">
                <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No selection logs yet</p>
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
                      <p className="text-lg font-bold text-indigo-600">{value}</p>
                    </div>
                  ))}
                  {Object.keys(config.weights || {}).length === 0 && (
                    <p className="text-slate-400 text-sm col-span-2">No config found. Click "Reset to Defaults" to initialize.</p>
                  )}
                </div>
              )}
            </div>

            {/* Randomness & Exponent */}
            <div className="grid grid-cols-2 gap-2">
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
                  <p className="text-lg font-bold text-indigo-600">{config.enableRandomness ? 'ON' : 'OFF'}</p>
                )}
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500 mb-1">Score Exponent</p>
                {editingConfig ? (
                  <input
                    type="number" min="1" max="10" step="0.1"
                    value={editRandomExponent}
                    onChange={e => setEditRandomExponent(Number(e.target.value))}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm font-bold"
                  />
                ) : (
                  <p className="text-lg font-bold text-indigo-600">{config.scoreExponent ?? 2}</p>
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
                      setEditWeights({...(config.weights || {
                        successRate: 25,
                        dailyLimitLeft: 20,
                        cooldown: 15,
                        amountMatch: 15,
                        traderBalance: 10,
                        bankHealth: 5,
                        timeWindow: 5,
                        recentFailures: 5,
                      })});
                      setEditEnableRandomness(config.enableRandomness ?? true);
                      setEditRandomExponent(config.scoreExponent ?? 2);
                      setEditingConfig(true);
                    }}
                    className="flex-1 px-3 py-2 bg-indigo-100 text-indigo-700 rounded-lg text-sm font-medium"
                  >
                    Edit Config
                  </button>
                  <button
                    onClick={resetToDefaults}
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
