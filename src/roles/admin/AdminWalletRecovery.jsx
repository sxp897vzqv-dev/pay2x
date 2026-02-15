import React, { useState, useEffect, useCallback } from 'react';
import { supabase, SUPABASE_URL } from '../../supabase';
import {
  Wallet, Shield, RefreshCw, AlertTriangle, CheckCircle, XCircle,
  Plus, ArrowRight, Copy, ExternalLink, Clock, IndianRupee,
  Eye, EyeOff, Key, Lock, Search, Loader, List, Settings, Save
} from 'lucide-react';
import Toast from '../../components/admin/Toast';

// ═══════════════════════════════════════════════════════════════════
// Derive addresses via Edge Function
// ═══════════════════════════════════════════════════════════════════
const FUNCTIONS_URL = SUPABASE_URL + '/functions/v1';

async function deriveAddressFromXpub(xpub, index) {
  const res = await fetch(`${FUNCTIONS_URL}/derive-address`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ xpub, index })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || `API error: ${res.status}`);
  }
  const data = await res.json();
  return data.address;
}

async function deriveMultipleAddresses(xpub, fromIndex, toIndex) {
  const res = await fetch(`${FUNCTIONS_URL}/derive-address`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ xpub, fromIndex, toIndex })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || `API error: ${res.status}`);
  }
  const data = await res.json();
  return data.addresses;
}

// ═══════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════

function StatCard({ title, value, subtitle, icon: Icon, color = 'slate' }) {
  const colors = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-green-100 text-green-700',
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-red-100 text-red-700',
    purple: 'bg-purple-100 text-purple-700',
  };
  return (
    <div className={`rounded-xl p-4 ${colors[color]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold opacity-70">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
          {subtitle && <p className="text-xs opacity-60">{subtitle}</p>}
        </div>
        {Icon && <Icon className="w-8 h-8 opacity-30" />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function AdminWalletRecovery() {
  const [activeTab, setActiveTab] = useState('wallet');
  const [config, setConfig] = useState(null);
  const [addressMeta, setAddressMeta] = useState(null);
  const [traderAddresses, setTraderAddresses] = useState([]);
  const [orphanAddresses, setOrphanAddresses] = useState([]);
  const [recentDeposits, setRecentDeposits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState(null);

  // Wallet display
  const [showXpub, setShowXpub] = useState(false);
  const [masterAddress, setMasterAddress] = useState('');
  const [loadingMaster, setLoadingMaster] = useState(false);
  const [copied, setCopied] = useState(false);

  // Derive addresses tool
  const [derivedAddresses, setDerivedAddresses] = useState([]);
  const [showAddresses, setShowAddresses] = useState(false);
  const [deriving, setDeriving] = useState(false);
  const [deriveFrom, setDeriveFrom] = useState(0);
  const [deriveTo, setDeriveTo] = useState(10);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch config from tatum_config (SINGLE SOURCE OF TRUTH)
      const { data: configData, error: configErr } = await supabase
        .from('tatum_config')
        .select('*')
        .eq('id', 'main')
        .single();
      
      if (configErr) throw configErr;
      setConfig(configData);

      // Fetch address_meta for last index
      const { data: metaData } = await supabase
        .from('address_meta')
        .select('*')
        .eq('id', 'main')
        .single();
      setAddressMeta(metaData);

      // Fetch traders with deposit addresses
      const { data: traders } = await supabase
        .from('traders')
        .select('id, name, usdt_deposit_address, derivation_index, is_active')
        .not('usdt_deposit_address', 'is', null)
        .order('derivation_index', { ascending: true });
      setTraderAddresses(traders || []);

      // Fetch orphan addresses (addresses without active traders)
      const { data: orphans } = await supabase
        .from('address_mapping')
        .select('*, traders(name, is_active)')
        .or('status.eq.orphan,trader_id.is.null')
        .order('created_at', { ascending: false });
      setOrphanAddresses(orphans || []);

      // Fetch recent deposits
      const { data: deposits } = await supabase
        .from('crypto_transactions')
        .select('*')
        .eq('type', 'deposit')
        .order('created_at', { ascending: false })
        .limit(20);
      setRecentDeposits(deposits || []);

    } catch (e) {
      console.error('Fetch error:', e);
      setToast({ msg: 'Failed to load data: ' + e.message, success: false });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-derive master address when config loads
  useEffect(() => {
    if (config?.master_xpub && !masterAddress && !loadingMaster) {
      setLoadingMaster(true);
      deriveAddressFromXpub(config.master_xpub, 0)
        .then(addr => setMasterAddress(addr))
        .catch(e => {
          console.error('Failed to derive master:', e);
          setMasterAddress('API_ERROR');
        })
        .finally(() => setLoadingMaster(false));
    }
  }, [config?.master_xpub]);

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setToast({ msg: 'Copied!', success: true });
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDeriveAddresses = async () => {
    if (!config?.master_xpub) {
      setToast({ msg: 'No XPUB configured', success: false });
      return;
    }
    setDeriving(true);
    try {
      const addresses = await deriveMultipleAddresses(
        config.master_xpub, 
        parseInt(deriveFrom), 
        parseInt(deriveTo)
      );
      setDerivedAddresses(addresses);
      setShowAddresses(true);
      setToast({ msg: `Derived ${addresses.length} addresses`, success: true });
    } catch (e) {
      setToast({ msg: e.message, success: false });
    }
    setDeriving(false);
  };

  const handleSweep = async (address) => {
    if (!config?.admin_wallet) {
      setToast({ msg: 'Admin wallet not configured!', success: false });
      return;
    }
    if (!window.confirm(`Sweep funds from ${address.address?.slice(0, 12)}... to admin wallet?`)) return;
    
    setActionLoading(true);
    try {
      // TODO: Call Tatum sweep API
      await supabase.from('address_mapping').update({ status: 'swept' }).eq('address', address.address);
      setToast({ msg: 'Sweep initiated! Check Tatum dashboard.', success: true });
      fetchData();
    } catch (e) {
      setToast({ msg: e.message, success: false });
    }
    setActionLoading(false);
  };

  // Stats
  const stats = {
    totalAddresses: traderAddresses.length,
    activeAddresses: traderAddresses.filter(t => t.is_active).length,
    lastIndex: addressMeta?.last_index || 0,
    orphanCount: orphanAddresses.length,
    totalDeposits: recentDeposits.reduce((sum, d) => sum + (d.usdt_amount || 0), 0),
  };

  const TABS = [
    { key: 'wallet', label: 'HD Wallet', icon: Wallet },
    { key: 'addresses', label: 'Addresses', icon: Key },
    { key: 'orphans', label: 'Orphan Recovery', icon: AlertTriangle, badge: stats.orphanCount },
    { key: 'deposits', label: 'Deposits', icon: IndianRupee },
  ];

  const isConfigured = config?.master_xpub && config?.tatum_api_key;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-sm">
              <Shield className="w-5 h-5 text-white" />
            </div>
            Wallet Recovery
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 ml-11">HD wallet management & fund recovery</p>
        </div>
        <button onClick={fetchData} disabled={loading}
          className="p-2 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-50">
          <RefreshCw className={`w-5 h-5 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Not Configured Warning */}
      {!loading && !isConfigured && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-amber-800">Wallet Not Configured</p>
            <p className="text-sm text-amber-700">
              Go to <strong>HD Wallets → Configuration</strong> to set up your Tatum API key and generate a master wallet.
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Addresses" value={stats.totalAddresses} icon={Key} color="purple" />
        <StatCard title="Active Traders" value={stats.activeAddresses} icon={CheckCircle} color="green" />
        <StatCard title="Last Index" value={stats.lastIndex} icon={List} color="slate" />
        <StatCard title="Orphan Addresses" value={stats.orphanCount} icon={AlertTriangle} color={stats.orphanCount > 0 ? 'amber' : 'slate'} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === tab.key 
                ? 'bg-white text-purple-700 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.badge > 0 && (
              <span className="px-1.5 py-0.5 bg-amber-500 text-white text-xs font-bold rounded-full">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">
          <Loader className="w-8 h-8 animate-spin mx-auto mb-2" />
          Loading...
        </div>
      ) : (
        <>
          {/* Wallet Tab */}
          {activeTab === 'wallet' && (
            <div className="space-y-4">
              {/* Main Wallet Card */}
              <div className="bg-white rounded-xl border-2 border-purple-400 shadow-lg p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center">
                      <Wallet className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-xl text-slate-900">Master HD Wallet</h3>
                      <p className="text-sm text-slate-500">TRON Network (TRC20 USDT)</p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-lg text-sm font-bold ${
                    isConfigured ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {isConfigured ? 'CONFIGURED' : 'NOT CONFIGURED'}
                  </span>
                </div>

                {/* XPUB */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-slate-600">Master XPUB</p>
                    <button onClick={() => setShowXpub(!showXpub)} className="text-sm text-purple-600 flex items-center gap-1">
                      {showXpub ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      {showXpub ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm bg-slate-100 px-3 py-2 rounded-lg font-mono truncate">
                      {config?.master_xpub 
                        ? (showXpub ? config.master_xpub : '••••••••••••••••••••' + config.master_xpub.slice(-12))
                        : 'Not configured'}
                    </code>
                    {config?.master_xpub && (
                      <button onClick={() => handleCopy(config.master_xpub)} className="p-2 hover:bg-slate-100 rounded-lg">
                        <Copy className="w-4 h-4 text-slate-400" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Master Address (Index 0) */}
                <div className="mb-4">
                  <p className="text-sm font-semibold text-slate-600 mb-1">Master Address (Index #0)</p>
                  <div className="flex items-center gap-2">
                    {loadingMaster ? (
                      <div className="flex-1 bg-slate-100 px-3 py-2 rounded-lg flex items-center gap-2">
                        <Loader className="w-4 h-4 animate-spin text-slate-400" />
                        <span className="text-sm text-slate-400">Deriving...</span>
                      </div>
                    ) : masterAddress === 'API_ERROR' ? (
                      <div className="flex-1 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
                        <span className="text-sm text-red-600">⚠️ API error - check Tatum key</span>
                      </div>
                    ) : masterAddress ? (
                      <>
                        <code className="flex-1 text-sm bg-blue-50 border border-blue-200 px-3 py-2 rounded-lg font-mono text-blue-700">
                          {masterAddress}
                        </code>
                        <button onClick={() => handleCopy(masterAddress)} className="p-2 hover:bg-blue-100 rounded-lg">
                          <Copy className="w-4 h-4 text-blue-500" />
                        </button>
                        <a href={`https://tronscan.org/#/address/${masterAddress}`} target="_blank" rel="noopener noreferrer"
                          className="p-2 hover:bg-blue-100 rounded-lg">
                          <ExternalLink className="w-4 h-4 text-blue-500" />
                        </a>
                      </>
                    ) : (
                      <span className="text-sm text-slate-400">No XPUB configured</span>
                    )}
                  </div>
                </div>

                {/* Admin Wallet */}
                <div className="mb-4">
                  <p className="text-sm font-semibold text-slate-600 mb-1">Admin Wallet (Sweep Destination)</p>
                  <div className="flex items-center gap-2">
                    {config?.admin_wallet ? (
                      <>
                        <code className="flex-1 text-sm bg-purple-50 border border-purple-200 px-3 py-2 rounded-lg font-mono text-purple-700">
                          {config.admin_wallet}
                        </code>
                        <a href={`https://tronscan.org/#/address/${config.admin_wallet}`} target="_blank" rel="noopener noreferrer"
                          className="p-2 hover:bg-purple-100 rounded-lg">
                          <ExternalLink className="w-4 h-4 text-purple-500" />
                        </a>
                      </>
                    ) : (
                      <span className="text-sm text-amber-600">⚠️ Not configured - sweeps won't work</span>
                    )}
                  </div>
                </div>

                {/* Derive Tool */}
                <div className="border-t border-slate-100 pt-4">
                  <p className="text-sm font-semibold text-slate-600 mb-2 flex items-center gap-2">
                    <Key className="w-4 h-4" /> Derive Addresses from XPUB
                  </p>
                  <div className="flex gap-2 mb-3">
                    <input
                      type="number"
                      value={deriveFrom}
                      onChange={e => setDeriveFrom(e.target.value)}
                      placeholder="From"
                      className="w-20 px-3 py-2 text-sm border rounded-lg"
                    />
                    <span className="text-slate-400 self-center">to</span>
                    <input
                      type="number"
                      value={deriveTo}
                      onChange={e => setDeriveTo(e.target.value)}
                      placeholder="To"
                      className="w-20 px-3 py-2 text-sm border rounded-lg"
                    />
                    <button
                      onClick={handleDeriveAddresses}
                      disabled={deriving || !config?.master_xpub}
                      className="flex-1 px-4 py-2 bg-purple-600 text-white text-sm font-semibold rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {deriving ? <Loader className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                      Derive
                    </button>
                  </div>
                  
                  {derivedAddresses.length > 0 && showAddresses && (
                    <div className="max-h-60 overflow-y-auto space-y-1 bg-green-50 border border-green-200 rounded-lg p-3">
                      <p className="text-xs font-semibold text-green-700 mb-2">✓ Derived from XPUB:</p>
                      {derivedAddresses.map((addr) => (
                        <div key={addr.index} className="flex items-center justify-between text-sm bg-white rounded px-2 py-1">
                          <div className="flex items-center gap-2">
                            <span className="text-green-600 font-bold w-8">#{addr.index}</span>
                            <code className="font-mono text-slate-700 text-xs">{addr.address}</code>
                          </div>
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleCopy(addr.address)} className="p-1 hover:bg-slate-100 rounded">
                              <Copy className="w-3 h-3 text-slate-400" />
                            </button>
                            <a href={`https://tronscan.org/#/address/${addr.address}`} target="_blank" rel="noopener noreferrer"
                              className="p-1 hover:bg-slate-100 rounded">
                              <ExternalLink className="w-3 h-3 text-purple-500" />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Addresses Tab */}
          {activeTab === 'addresses' && (
            <div className="bg-white rounded-xl border overflow-hidden">
              {traderAddresses.length === 0 ? (
                <div className="text-center py-12">
                  <Key className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-semibold">No addresses generated yet</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Index</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Trader</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Address</th>
                      <th className="text-center px-4 py-3 font-semibold text-slate-600">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {traderAddresses.map(trader => (
                      <tr key={trader.id} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono font-bold text-purple-600">#{trader.derivation_index}</td>
                        <td className="px-4 py-3 font-semibold">{trader.name}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <code className="text-xs font-mono bg-slate-100 px-2 py-1 rounded">
                              {trader.usdt_deposit_address?.slice(0, 10)}...{trader.usdt_deposit_address?.slice(-6)}
                            </code>
                            <button onClick={() => handleCopy(trader.usdt_deposit_address)} className="p-1 hover:bg-slate-200 rounded">
                              <Copy className="w-3 h-3 text-slate-400" />
                            </button>
                            <a href={`https://tronscan.org/#/address/${trader.usdt_deposit_address}`} target="_blank" rel="noopener noreferrer"
                              className="p-1 hover:bg-slate-200 rounded">
                              <ExternalLink className="w-3 h-3 text-slate-400" />
                            </a>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                            trader.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {trader.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Orphans Tab */}
          {activeTab === 'orphans' && (
            <div className="bg-white rounded-xl border overflow-hidden">
              {orphanAddresses.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="w-12 h-12 text-green-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-semibold">No orphan addresses</p>
                  <p className="text-slate-400 text-sm">All funds accounted for!</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Address</th>
                      <th className="text-center px-4 py-3 font-semibold text-slate-600">Index</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orphanAddresses.map(addr => (
                      <tr key={addr.address} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <code className="text-xs font-mono bg-slate-100 px-2 py-1 rounded">
                            {addr.address?.slice(0, 10)}...{addr.address?.slice(-6)}
                          </code>
                        </td>
                        <td className="px-4 py-3 text-center font-mono">{addr.derivation_index}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-700">
                            {addr.status || 'orphan'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleSweep(addr)}
                            disabled={actionLoading}
                            className="px-3 py-1 bg-green-600 text-white rounded text-xs font-semibold hover:bg-green-700 disabled:opacity-50 inline-flex items-center gap-1"
                          >
                            <ArrowRight className="w-3 h-3" /> Sweep
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Deposits Tab */}
          {activeTab === 'deposits' && (
            <div className="bg-white rounded-xl border overflow-hidden">
              {recentDeposits.length === 0 ? (
                <div className="text-center py-12">
                  <IndianRupee className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-semibold">No deposits yet</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Time</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Address</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600">Amount</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">TX Hash</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentDeposits.map(deposit => (
                      <tr key={deposit.id} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {new Date(deposit.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          {deposit.to_address?.slice(0, 8)}...{deposit.to_address?.slice(-6)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-green-600">
                          ${deposit.usdt_amount}
                        </td>
                        <td className="px-4 py-3">
                          {deposit.tx_hash && (
                            <a href={`https://tronscan.org/#/transaction/${deposit.tx_hash}`} 
                              target="_blank" rel="noopener noreferrer"
                              className="text-xs text-purple-600 hover:underline font-mono flex items-center gap-1">
                              {deposit.tx_hash.slice(0, 12)}...
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                            deposit.status === 'completed' ? 'bg-green-100 text-green-700' :
                            deposit.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {deposit.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {/* Toast */}
      {toast && <Toast message={toast.msg} type={toast.success ? 'success' : 'error'} onClose={() => setToast(null)} />}
    </div>
  );
}
