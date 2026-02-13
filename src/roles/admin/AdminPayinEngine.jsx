import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';
import {
  Zap, RefreshCw, AlertTriangle, CheckCircle, Clock, XCircle,
  TrendingUp, TrendingDown, DollarSign, Activity, RotateCcw, Filter,
  BarChart3, Building2, Timer, Bell, Shield, Users, MapPin, Navigation
} from 'lucide-react';
import Toast from '../../components/admin/Toast';

const REFRESH_INTERVAL = 30000;

const CIRCUIT_COLORS = {
  CLOSED: 'bg-green-100 text-green-800 border-green-200',
  OPEN: 'bg-red-100 text-red-800 border-red-200',
  HALF_OPEN: 'bg-amber-100 text-amber-800 border-amber-200',
};

const TIER_LABELS = {
  micro: '₹100-1K',
  small: '₹1K-5K',
  medium: '₹5K-15K',
  large: '₹15K-50K',
  xlarge: '₹50K-1L',
};

export default function AdminPayinEngine() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  
  // Dashboard data
  const [stats, setStats] = useState(null);
  const [recentPayins, setRecentPayins] = useState([]);
  const [alerts, setAlerts] = useState([]);
  
  // Engine data
  const [upis, setUpis] = useState([]);
  const [circuits, setCircuits] = useState([]);
  const [logs, setLogs] = useState([]);
  
  const [toast, setToast] = useState(null);
  const [tierFilter, setTierFilter] = useState('all');
  const [geoFilter, setGeoFilter] = useState('all'); // all, city, state, boosted
  const [lastUpdate, setLastUpdate] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Real-time stats
      const { data: statsData } = await supabase.rpc('get_engine_realtime_stats');
      setStats(statsData);

      // Circuit breaker status
      const { data: circuitData } = await supabase.rpc('get_bank_circuit_status');
      setCircuits(circuitData || []);

      // Unacknowledged alerts
      const { data: alertData } = await supabase
        .from('engine_alerts')
        .select('*')
        .eq('acknowledged', false)
        .order('created_at', { ascending: false })
        .limit(10);
      setAlerts(alertData || []);

      // Recent payins
      const { data: payinData } = await supabase
        .from('payins')
        .select('id, amount, status, upi_id, created_at')
        .order('created_at', { ascending: false })
        .limit(15);
      setRecentPayins(payinData || []);

      // UPIs
      const { data: upiData } = await supabase
        .from('upi_pool')
        .select(`*, traders:trader_id (name)`)
        .order('success_rate', { ascending: false });
      setUpis(upiData || []);

      // Selection logs
      const { data: logData } = await supabase
        .from('selection_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      setLogs(logData || []);

      setLastUpdate(new Date());
    } catch (e) {
      console.error('Fetch error:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  const acknowledgeAlert = async (alertId) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase
        .from('engine_alerts')
        .update({ acknowledged: true, acknowledged_by: user.id, acknowledged_at: new Date().toISOString() })
        .eq('id', alertId);
      setAlerts(prev => prev.filter(a => a.id !== alertId));
      setToast({ msg: '✅ Alert acknowledged', success: true });
    } catch (e) {
      setToast({ msg: '❌ Failed', success: false });
    }
  };

  const handleResetCircuit = async (bankName) => {
    try {
      const { data, error } = await supabase.rpc('reset_bank_circuit', { p_bank_name: bankName });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      setToast({ msg: `✅ ${bankName} circuit reset`, success: true });
      fetchData();
    } catch (e) {
      setToast({ msg: '❌ ' + e.message, success: false });
    }
  };

  const handleUpdateUpiTier = async (upiId, tier) => {
    try {
      await supabase.from('upi_pool').update({ amount_tier: tier }).eq('id', upiId);
      setToast({ msg: '✅ Tier updated', success: true });
      fetchData();
    } catch (e) {
      setToast({ msg: '❌ ' + e.message, success: false });
    }
  };

  const getSuccessColor = (rate) => {
    if (rate >= 90) return 'text-green-600';
    if (rate >= 70) return 'text-amber-600';
    return 'text-red-600';
  };

  const getStatusBadge = (status) => {
    const styles = {
      completed: 'bg-green-100 text-green-700',
      pending: 'bg-amber-100 text-amber-700',
      assigned: 'bg-blue-100 text-blue-700',
      failed: 'bg-red-100 text-red-700',
      expired: 'bg-slate-100 text-slate-600',
    };
    return styles[status] || 'bg-slate-100 text-slate-600';
  };

  const filteredUpis = tierFilter === 'all' ? upis : upis.filter(u => u.amount_tier === tierFilter);
  const openCircuits = circuits.filter(c => c.state === 'OPEN');
  const engineStats = {
    totalUpis: upis.length,
    activeUpis: upis.filter(u => u.status === 'active').length,
    blockedBanks: openCircuits.length,
    avgSuccess: upis.length > 0 ? (upis.reduce((s, u) => s + (u.success_rate || 0), 0) / upis.length).toFixed(1) : 0,
  };

  return (
    <div className="space-y-6">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Zap className="w-6 h-6 text-purple-600" />
            Payin Engine v4.0
          </h1>
          <p className="text-slate-500 text-sm flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            Live • {lastUpdate?.toLocaleTimeString() || '—'}
          </p>
        </div>
        <button onClick={fetchData} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Bell className="w-5 h-5 text-red-600" />
            <span className="font-bold text-red-800">{alerts.length} Alert(s)</span>
          </div>
          {alerts.slice(0, 2).map(alert => (
            <div key={alert.id} className="flex items-center justify-between bg-white rounded-lg p-3 border border-red-100 mb-2">
              <div>
                <p className="font-semibold text-slate-900">{alert.title}</p>
                <p className="text-xs text-slate-500">{alert.message}</p>
              </div>
              <button onClick={() => acknowledgeAlert(alert.id)}
                className="px-3 py-1 text-xs font-semibold bg-red-100 text-red-700 rounded-lg hover:bg-red-200">
                Ack
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Circuit Alert */}
      {openCircuits.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-4">
          <AlertTriangle className="w-8 h-8 text-amber-600" />
          <div>
            <p className="font-bold text-amber-900">{openCircuits.length} Bank(s) BLOCKED</p>
            <p className="text-sm text-amber-700">{openCircuits.map(c => c.bank_name.toUpperCase()).join(', ')}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        {[
          { key: 'dashboard', label: 'Live Dashboard', icon: Activity },
          { key: 'upis', label: 'UPI Pool', icon: DollarSign },
          { key: 'circuits', label: 'Circuit Breaker', icon: Shield },
          { key: 'logs', label: 'Selection Logs', icon: Timer },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === tab.key ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.key === 'circuits' && openCircuits.length > 0 && (
              <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-bold">{openCircuits.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* DASHBOARD TAB */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border p-4">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-semibold text-slate-500 uppercase">Requests (1h)</span>
              </div>
              <p className="text-2xl font-bold text-slate-900">{stats?.requests_1h || 0}</p>
              <p className="text-xs text-slate-400">{stats?.requests_15m || 0} in 15m</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-green-600" />
                <span className="text-xs font-semibold text-slate-500 uppercase">Success Rate</span>
              </div>
              <p className={`text-2xl font-bold ${getSuccessColor(stats?.success_rate_1h || 0)}`}>
                {stats?.success_rate_1h || 0}%
              </p>
              <p className="text-xs text-slate-400">{stats?.success_1h || 0} completed</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-green-600" />
                <span className="text-xs font-semibold text-slate-500 uppercase">Volume (1h)</span>
              </div>
              <p className="text-2xl font-bold text-green-600">₹{((stats?.volume_1h || 0) / 1000).toFixed(1)}K</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <div className="flex items-center gap-2 mb-1">
                <XCircle className="w-4 h-4 text-red-600" />
                <span className="text-xs font-semibold text-slate-500 uppercase">Failed</span>
              </div>
              <p className="text-2xl font-bold text-red-600">{stats?.failed_1h || 0}</p>
            </div>
          </div>

          {/* Two Column */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Top Banks */}
            <div className="bg-white rounded-xl border p-4">
              <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-purple-600" /> Top Banks (1h)
              </h3>
              {stats?.top_banks?.length > 0 ? (
                <div className="space-y-3">
                  {stats.top_banks.map((bank, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold">{i + 1}</span>
                        <span className="font-semibold text-slate-800 uppercase">{bank.bank || 'Unknown'}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-slate-500">{bank.count} txns</span>
                        <span className={`font-bold ${getSuccessColor(bank.success_rate)}`}>{bank.success_rate}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-slate-400 text-sm">No data yet</p>}
            </div>

            {/* Recent Transactions */}
            <div className="bg-white rounded-xl border p-4">
              <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Timer className="w-4 h-4 text-blue-600" /> Recent Transactions
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {recentPayins.map(p => (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="text-xs text-slate-500">{new Date(p.created_at).toLocaleTimeString()}</p>
                      <p className="font-mono text-xs">{p.upi_id || '—'}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">₹{p.amount?.toLocaleString()}</p>
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${getStatusBadge(p.status)}`}>{p.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* UPIS TAB */}
      {activeTab === 'upis' && (
        <div className="space-y-4">
          {/* Quick Stats */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border p-3 text-center">
              <p className="text-2xl font-bold text-slate-900">{engineStats.totalUpis}</p>
              <p className="text-xs text-slate-500">Total UPIs</p>
            </div>
            <div className="bg-white rounded-xl border p-3 text-center">
              <p className="text-2xl font-bold text-green-600">{engineStats.activeUpis}</p>
              <p className="text-xs text-slate-500">Active</p>
            </div>
            <div className="bg-white rounded-xl border p-3 text-center">
              <p className="text-2xl font-bold text-red-600">{engineStats.blockedBanks}</p>
              <p className="text-xs text-slate-500">Banks Blocked</p>
            </div>
            <div className="bg-white rounded-xl border p-3 text-center">
              <p className="text-2xl font-bold text-purple-600">{engineStats.avgSuccess}%</p>
              <p className="text-xs text-slate-500">Avg Success</p>
            </div>
          </div>

          {/* Tier Filter */}
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setTierFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${tierFilter === 'all' ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
              All
            </button>
            {Object.entries(TIER_LABELS).map(([tier, label]) => (
              <button key={tier} onClick={() => setTierFilter(tier)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${tierFilter === tier ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {label}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">UPI</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Trader</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Bank</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> Location</span>
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Tier</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Success</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Daily</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredUpis.map(upi => (
                  <tr key={upi.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs">{upi.upi_id}</td>
                    <td className="px-4 py-3">{upi.traders?.name || '—'}</td>
                    <td className="px-4 py-3">{upi.bank_name || '—'}</td>
                    <td className="px-4 py-3">
                      {upi.bank_city ? (
                        <span className="flex items-center gap-1 text-xs">
                          <MapPin className="w-3 h-3 text-blue-500" />
                          <span className="font-medium">{upi.bank_city}</span>
                          {upi.bank_state && <span className="text-slate-400">({upi.bank_state})</span>}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">Not set</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <select value={upi.amount_tier || 'medium'} onChange={(e) => handleUpdateUpiTier(upi.id, e.target.value)}
                        className="text-xs border rounded px-2 py-1">
                        {Object.entries(TIER_LABELS).map(([t, l]) => <option key={t} value={t}>{l}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-semibold ${getSuccessColor(upi.success_rate || 0)}`}>{(upi.success_rate || 0).toFixed(1)}%</span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500">₹{(upi.daily_volume || 0).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${upi.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                        {upi.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CIRCUITS TAB */}
      {activeTab === 'circuits' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h3 className="font-semibold text-blue-900 mb-1">Circuit Breaker</h3>
            <p className="text-sm text-blue-700">
              Banks with &gt;30% failure in 15 min → OPEN (blocked). After 10 min → HALF_OPEN (testing). Success → CLOSED.
            </p>
          </div>

          {circuits.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-xl border">
              <CheckCircle className="w-12 h-12 text-green-300 mx-auto mb-3" />
              <p className="text-slate-500">All banks healthy</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {circuits.map(circuit => (
                <div key={circuit.bank_name}
                  className={`rounded-xl border p-4 ${circuit.state === 'OPEN' ? 'bg-red-50 border-red-200' : circuit.state === 'HALF_OPEN' ? 'bg-amber-50 border-amber-200' : 'bg-white'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {circuit.state === 'OPEN' ? <XCircle className="w-8 h-8 text-red-500" /> :
                       circuit.state === 'HALF_OPEN' ? <Clock className="w-8 h-8 text-amber-500" /> :
                       <CheckCircle className="w-8 h-8 text-green-500" />}
                      <div>
                        <h3 className="font-bold text-slate-900 uppercase">{circuit.bank_name}</h3>
                        <p className="text-sm text-slate-500">{circuit.active_upis} UPIs</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm text-slate-500">Failure Rate</p>
                        <p className={`text-lg font-bold ${circuit.failure_rate > 0.3 ? 'text-red-600' : 'text-green-600'}`}>
                          {(circuit.failure_rate * 100).toFixed(1)}%
                        </p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-sm font-bold border ${CIRCUIT_COLORS[circuit.state]}`}>{circuit.state}</span>
                      {circuit.state !== 'CLOSED' && (
                        <button onClick={() => handleResetCircuit(circuit.bank_name)}
                          className="p-2 bg-white border rounded-lg hover:bg-slate-50" title="Reset">
                          <RotateCcw className="w-4 h-4 text-slate-600" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* LOGS TAB */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          {/* Geo Filter */}
          <div className="flex gap-2 flex-wrap items-center">
            <MapPin className="w-4 h-4 text-slate-400" />
            <button onClick={() => setGeoFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${geoFilter === 'all' ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
              All
            </button>
            <button onClick={() => setGeoFilter('boosted')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${geoFilter === 'boosted' ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
              🌍 Geo Boosted
            </button>
            <button onClick={() => setGeoFilter('city')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${geoFilter === 'city' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
              📍 City Match
            </button>
            <button onClick={() => setGeoFilter('state')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${geoFilter === 'state' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
              🗺️ State Match
            </button>
          </div>

          {/* Geo Stats */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border p-3 text-center">
              <p className="text-2xl font-bold text-slate-900">{logs.length}</p>
              <p className="text-xs text-slate-500">Total Selections</p>
            </div>
            <div className="bg-white rounded-xl border p-3 text-center">
              <p className="text-2xl font-bold text-green-600">{logs.filter(l => l.geo_boost > 0).length}</p>
              <p className="text-xs text-slate-500">Geo Boosted</p>
            </div>
            <div className="bg-white rounded-xl border p-3 text-center">
              <p className="text-2xl font-bold text-blue-600">{logs.filter(l => l.geo_match === 'city').length}</p>
              <p className="text-xs text-slate-500">City Matches</p>
            </div>
            <div className="bg-white rounded-xl border p-3 text-center">
              <p className="text-2xl font-bold text-amber-600">{logs.filter(l => l.geo_match === 'state').length}</p>
              <p className="text-xs text-slate-500">State Matches</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Time</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">UPI</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Bank</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Amount</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Tier</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> Geo</span>
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Score</th>
                </tr>
              </thead>
              <tbody>
                {logs
                  .filter(log => {
                    if (geoFilter === 'all') return true;
                    if (geoFilter === 'boosted') return log.geo_boost > 0;
                    if (geoFilter === 'city') return log.geo_match === 'city';
                    if (geoFilter === 'state') return log.geo_match === 'state';
                    return true;
                  })
                  .map(log => (
                  <tr key={log.id} className={`border-b last:border-0 hover:bg-slate-50 ${log.geo_boost > 0 ? 'bg-green-50/50' : ''}`}>
                    <td className="px-4 py-3 text-xs text-slate-500">{new Date(log.created_at).toLocaleTimeString()}</td>
                    <td className="px-4 py-3 font-mono text-xs">{log.upi_id}</td>
                    <td className="px-4 py-3">{log.bank_name || '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold">₹{log.amount?.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        log.tier_match === 'exact' ? 'bg-green-100 text-green-700' :
                        log.tier_match === 'adjacent' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                      }`}>{log.tier_match || log.amount_tier || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      {log.geo_match && log.geo_match !== 'none' ? (
                        <div className="flex flex-col gap-0.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${
                            log.geo_match === 'city' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {log.geo_match === 'city' ? '📍' : '🗺️'} {log.geo_match}
                            {log.geo_boost > 0 && <span className="text-green-600">+{log.geo_boost}</span>}
                          </span>
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            {log.user_city || '?'} <Navigation className="w-2 h-2" /> {log.upi_city || '?'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-bold text-purple-600">{log.score}</span>
                      {log.geo_boost > 0 && (
                        <span className="ml-1 text-xs text-green-600">(+{log.geo_boost})</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
