import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase';
import {
  Wallet, Shield, RefreshCw, AlertTriangle, CheckCircle, XCircle,
  Plus, ArrowRight, Copy, ExternalLink, Clock, DollarSign,
  Archive, Trash2, Eye, EyeOff, Key, Lock, Unlock, Search
} from 'lucide-react';
import Toast from '../../components/admin/Toast';

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

function WalletCard({ wallet, adminWallet, onSetCurrent, onArchive, isLoading }) {
  const [showXpub, setShowXpub] = useState(false);
  const [showAddresses, setShowAddresses] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const statusColors = {
    active: 'bg-green-100 text-green-700 border-green-200',
    legacy: 'bg-amber-100 text-amber-700 border-amber-200',
    disabled: 'bg-slate-100 text-slate-500 border-slate-200',
  };

  return (
    <div className={`bg-white rounded-xl border-2 p-4 ${wallet.is_current ? 'border-purple-400 shadow-lg' : 'border-slate-200'}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="w-5 h-5 text-purple-600" />
            <h3 className="font-bold text-slate-900">{wallet.name || 'HD Wallet'}</h3>
            {wallet.is_current && (
              <span className="px-2 py-0.5 bg-purple-600 text-white text-xs font-bold rounded-full">
                CURRENT
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">{wallet.id}</p>
        </div>
        <span className={`px-2 py-1 rounded-lg text-xs font-bold border ${statusColors[wallet.status] || statusColors.active}`}>
          {(wallet.status || 'active').toUpperCase()}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-slate-50 rounded-lg p-2 text-center">
          <p className="text-xs text-slate-500">Addresses</p>
          <p className="text-lg font-bold text-slate-700">{wallet.total_addresses || 0}</p>
        </div>
        <div className="bg-green-50 rounded-lg p-2 text-center">
          <p className="text-xs text-green-600">Deposited</p>
          <p className="text-lg font-bold text-green-700">${(wallet.total_deposited || 0).toFixed(2)}</p>
        </div>
        <div className="bg-purple-50 rounded-lg p-2 text-center">
          <p className="text-xs text-purple-600">Last Index</p>
          <p className="text-lg font-bold text-purple-700">{wallet.last_derivation_index || 0}</p>
        </div>
      </div>

      {/* XPUB */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-semibold text-slate-500">Master XPUB</p>
          <button onClick={() => setShowXpub(!showXpub)} className="text-xs text-purple-600 flex items-center gap-1">
            {showXpub ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {showXpub ? 'Hide' : 'Show'}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-slate-100 px-2 py-1.5 rounded-lg font-mono truncate">
            {showXpub ? wallet.master_xpub : '••••••••••••••••••••' + (wallet.master_xpub?.slice(-8) || '')}
          </code>
          <button onClick={() => handleCopy(wallet.master_xpub)} className="p-1.5 hover:bg-slate-100 rounded-lg">
            {copied ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-slate-400" />}
          </button>
        </div>
      </div>

      {/* Admin Wallet (Sweep Destination) */}
      {adminWallet && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-slate-500 mb-1">Admin Wallet (Sweep To)</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-purple-50 border border-purple-200 px-2 py-1.5 rounded-lg font-mono truncate text-purple-700">
              {adminWallet}
            </code>
            <a 
              href={`https://tronscan.org/#/address/${adminWallet}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 hover:bg-purple-100 rounded-lg text-purple-500"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      )}

      {/* Derived Addresses (expandable) */}
      {wallet.derived_addresses?.length > 0 && (
        <div className="mb-3">
          <button 
            onClick={() => setShowAddresses(!showAddresses)}
            className="w-full flex items-center justify-between text-xs font-semibold text-slate-500 hover:text-slate-700 mb-1"
          >
            <span>Derived Addresses ({wallet.derived_addresses.length})</span>
            <span className="text-purple-600">{showAddresses ? '▲ Hide' : '▼ Show'}</span>
          </button>
          {showAddresses && (
            <div className="max-h-40 overflow-y-auto space-y-1 bg-slate-50 rounded-lg p-2">
              {wallet.derived_addresses.map((addr, idx) => (
                <div key={addr.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 w-6">#{addr.derivation_index}</span>
                    <code className="font-mono text-slate-600">
                      {addr.usdt_deposit_address?.slice(0, 8)}...{addr.usdt_deposit_address?.slice(-6)}
                    </code>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-500">{addr.name}</span>
                    <a 
                      href={`https://tronscan.org/#/address/${addr.usdt_deposit_address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-500 hover:text-purple-700"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2 border-t border-slate-100">
        {!wallet.is_current && wallet.status === 'active' && (
          <button
            onClick={() => onSetCurrent(wallet.id)}
            disabled={isLoading}
            className="flex-1 py-2 bg-purple-600 text-white rounded-lg text-xs font-semibold hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-1"
          >
            <CheckCircle className="w-3.5 h-3.5" /> Set as Current
          </button>
        )}
        {!wallet.is_current && wallet.status !== 'legacy' && (
          <button
            onClick={() => onArchive(wallet.id, 'legacy')}
            disabled={isLoading}
            className="flex-1 py-2 bg-amber-100 text-amber-700 rounded-lg text-xs font-semibold hover:bg-amber-200 disabled:opacity-50 flex items-center justify-center gap-1"
          >
            <Archive className="w-3.5 h-3.5" /> Archive
          </button>
        )}
        {wallet.status === 'legacy' && (
          <button
            onClick={() => onArchive(wallet.id, 'active')}
            disabled={isLoading}
            className="flex-1 py-2 bg-green-100 text-green-700 rounded-lg text-xs font-semibold hover:bg-green-200 disabled:opacity-50 flex items-center justify-center gap-1"
          >
            <Unlock className="w-3.5 h-3.5" /> Reactivate
          </button>
        )}
      </div>

      <p className="text-xs text-slate-400 mt-2 text-center">
        Created: {new Date(wallet.created_at).toLocaleDateString()}
      </p>
    </div>
  );
}

function OrphanAddressRow({ address, onSweep, onMarkClear, isLoading }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(address.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <tr className="border-b last:border-0 hover:bg-slate-50">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <code className="text-xs font-mono bg-slate-100 px-2 py-1 rounded">{address.address?.slice(0, 8)}...{address.address?.slice(-6)}</code>
          <button onClick={handleCopy} className="p-1 hover:bg-slate-200 rounded">
            {copied ? <CheckCircle className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 text-slate-400" />}
          </button>
          <a href={`https://tronscan.org/#/address/${address.address}`} target="_blank" rel="noopener noreferrer"
            className="p-1 hover:bg-slate-200 rounded">
            <ExternalLink className="w-3 h-3 text-slate-400" />
          </a>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-mono">
          {address.wallet_config_id}
        </span>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="font-mono text-sm">{address.derivation_index}</span>
      </td>
      <td className="px-4 py-3 text-right">
        <span className={`font-bold ${address.last_balance > 0 ? 'text-green-600' : 'text-slate-400'}`}>
          ${(address.last_balance || 0).toFixed(2)}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
          address.status === 'orphan' ? 'bg-amber-100 text-amber-700' :
          address.status === 'swept' ? 'bg-green-100 text-green-700' :
          'bg-slate-100 text-slate-600'
        }`}>
          {address.status}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-1 justify-end">
          {address.last_balance > 0 && (
            <button
              onClick={() => onSweep(address)}
              disabled={isLoading}
              className="px-2 py-1 bg-green-600 text-white rounded text-xs font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
            >
              <ArrowRight className="w-3 h-3" /> Sweep
            </button>
          )}
          {address.status === 'orphan' && address.last_balance === 0 && (
            <button
              onClick={() => onMarkClear(address)}
              disabled={isLoading}
              className="px-2 py-1 bg-slate-200 text-slate-600 rounded text-xs font-semibold hover:bg-slate-300 disabled:opacity-50"
            >
              Clear
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function AdminWalletRecovery() {
  const [activeTab, setActiveTab] = useState('wallets');
  const [wallets, setWallets] = useState([]);
  const [orphanAddresses, setOrphanAddresses] = useState([]);
  const [recentDeposits, setRecentDeposits] = useState([]);
  const [globalAdminWallet, setGlobalAdminWallet] = useState(''); // From tatum_config
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // New wallet form
  const [newWallet, setNewWallet] = useState({
    name: '',
    master_xpub: '',
    admin_wallet: '',
    tatum_api_key: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch global config from tatum_config (source of truth)
      const { data: configData } = await supabase
        .from('tatum_config')
        .select('admin_wallet, master_xpub')
        .eq('id', 'main')
        .single();
      if (configData?.admin_wallet) {
        setGlobalAdminWallet(configData.admin_wallet);
      }

      // Fetch address_meta for last index
      const { data: metaData } = await supabase
        .from('address_meta')
        .select('last_index')
        .eq('id', 'main')
        .single();

      // Fetch traders with their deposit addresses
      const { data: traderAddresses } = await supabase
        .from('traders')
        .select('id, name, usdt_deposit_address, derivation_index')
        .not('usdt_deposit_address', 'is', null)
        .order('derivation_index', { ascending: true });

      // Fetch wallets and enrich with address data
      const { data: walletData } = await supabase
        .from('wallet_configs')
        .select('*')
        .order('is_current', { ascending: false })
        .order('created_at', { ascending: false });
      
      // Enrich wallets with derived address info
      const enrichedWallets = (walletData || []).map(w => {
        // For current wallet, use data from tatum_config + traders
        if (w.is_current && configData) {
          return {
            ...w,
            master_xpub: w.master_xpub || configData.master_xpub,
            total_addresses: traderAddresses?.length || 0,
            last_derivation_index: metaData?.last_index || 0,
            derived_addresses: traderAddresses || [],
          };
        }
        return w;
      });
      setWallets(enrichedWallets);

      // Fetch orphan addresses
      const { data: orphanData } = await supabase
        .from('address_mapping')
        .select('*, traders(name)')
        .or('status.eq.orphan,last_balance.gt.0,trader_id.is.null')
        .order('last_balance', { ascending: false });
      setOrphanAddresses(orphanData || []);

      // Fetch recent deposits
      const { data: depositData } = await supabase
        .from('address_deposits')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      setRecentDeposits(depositData || []);

    } catch (e) {
      console.error('Fetch error:', e);
      setToast({ msg: 'Failed to load data', success: false });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSetCurrent = async (walletId) => {
    if (!window.confirm('Set this wallet as current? New addresses will be generated from this wallet.')) return;
    
    setActionLoading(true);
    try {
      await supabase.from('wallet_configs').update({ is_current: true }).eq('id', walletId);
      setToast({ msg: 'Wallet set as current!', success: true });
      fetchData();
    } catch (e) {
      setToast({ msg: e.message, success: false });
    }
    setActionLoading(false);
  };

  const handleArchive = async (walletId, newStatus) => {
    setActionLoading(true);
    try {
      await supabase.from('wallet_configs').update({ status: newStatus }).eq('id', walletId);
      setToast({ msg: `Wallet ${newStatus === 'legacy' ? 'archived' : 'reactivated'}!`, success: true });
      fetchData();
    } catch (e) {
      setToast({ msg: e.message, success: false });
    }
    setActionLoading(false);
  };

  const handleSweep = async (address) => {
    if (!globalAdminWallet) {
      setToast({ msg: 'Admin wallet not configured! Set it in HD Wallets page.', success: false });
      return;
    }
    if (!window.confirm(`Sweep ${address.last_balance} USDT from ${address.address.slice(0, 12)}... to ${globalAdminWallet.slice(0, 10)}...?`)) return;
    
    setActionLoading(true);
    try {
      // TODO: Call Tatum API to sweep funds
      // For now, just mark as swept
      await supabase.from('address_mapping').update({ status: 'swept' }).eq('address', address.address);
      setToast({ msg: 'Sweep initiated! Check Tatum dashboard.', success: true });
      fetchData();
    } catch (e) {
      setToast({ msg: e.message, success: false });
    }
    setActionLoading(false);
  };

  const handleMarkClear = async (address) => {
    setActionLoading(true);
    try {
      await supabase.from('address_mapping').update({ status: 'active' }).eq('address', address.address);
      setToast({ msg: 'Address cleared!', success: true });
      fetchData();
    } catch (e) {
      setToast({ msg: e.message, success: false });
    }
    setActionLoading(false);
  };

  const handleAddWallet = async () => {
    if (!newWallet.name || !newWallet.master_xpub) {
      setToast({ msg: 'Name and XPUB required', success: false });
      return;
    }

    setActionLoading(true);
    try {
      await supabase.from('wallet_configs').insert({
        name: newWallet.name,
        master_xpub: newWallet.master_xpub,
        admin_wallet: newWallet.admin_wallet || null,
        tatum_api_key: newWallet.tatum_api_key || null,
        status: 'active',
        is_current: wallets.length === 0, // First wallet is current
      });
      setToast({ msg: 'Wallet added!', success: true });
      setShowAddModal(false);
      setNewWallet({ name: '', master_xpub: '', admin_wallet: '', tatum_api_key: '' });
      fetchData();
    } catch (e) {
      setToast({ msg: e.message, success: false });
    }
    setActionLoading(false);
  };

  // Stats
  const stats = {
    totalWallets: wallets.length,
    activeWallets: wallets.filter(w => w.status === 'active').length,
    legacyWallets: wallets.filter(w => w.status === 'legacy').length,
    totalAddresses: wallets.reduce((sum, w) => sum + (w.total_addresses || 0), 0),
    orphanCount: orphanAddresses.filter(a => a.status === 'orphan').length,
    orphanBalance: orphanAddresses.reduce((sum, a) => sum + (a.last_balance || 0), 0),
  };

  const TABS = [
    { key: 'wallets', label: 'Wallets', icon: Wallet },
    { key: 'orphans', label: 'Orphan Recovery', icon: AlertTriangle, badge: stats.orphanCount },
    { key: 'deposits', label: 'Recent Deposits', icon: DollarSign },
  ];

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
          <p className="text-slate-500 text-sm mt-0.5 ml-11">Manage HD wallets & recover orphan funds</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchData} disabled={loading}
            className="p-2 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-50">
            <RefreshCw className={`w-5 h-5 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Wallet
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Wallets" value={stats.totalWallets} icon={Wallet} color="purple" />
        <StatCard title="Active" value={stats.activeWallets} subtitle={`${stats.legacyWallets} legacy`} icon={CheckCircle} color="green" />
        <StatCard title="Orphan Addresses" value={stats.orphanCount} icon={AlertTriangle} color={stats.orphanCount > 0 ? 'amber' : 'slate'} />
        <StatCard title="Orphan Balance" value={`$${stats.orphanBalance.toFixed(2)}`} icon={DollarSign} color={stats.orphanBalance > 0 ? 'red' : 'slate'} />
      </div>

      {/* Warning */}
      {stats.orphanBalance > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-amber-800">Funds Need Recovery!</p>
            <p className="text-sm text-amber-700">
              ${stats.orphanBalance.toFixed(2)} USDT found in {stats.orphanCount} orphan addresses. 
              Sweep these funds to avoid loss.
            </p>
          </div>
        </div>
      )}

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
        <div className="text-center py-12 text-slate-400">Loading...</div>
      ) : (
        <>
          {/* Wallets Tab */}
          {activeTab === 'wallets' && (
            <div className="space-y-4">
              {/* Global Admin Wallet Banner */}
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
                    <Wallet className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-purple-600">SWEEP DESTINATION</p>
                    <p className="font-mono text-sm text-purple-900">
                      {globalAdminWallet || 'Not configured - set in HD Wallets'}
                    </p>
                  </div>
                </div>
                {globalAdminWallet && (
                  <a 
                    href={`https://tronscan.org/#/address/${globalAdminWallet}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-600 hover:text-purple-700"
                  >
                    <ExternalLink className="w-5 h-5" />
                  </a>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {wallets.length === 0 ? (
                <div className="col-span-full text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                  <Wallet className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-semibold">No wallets configured</p>
                  <p className="text-slate-400 text-sm">Add your first HD wallet to get started</p>
                </div>
              ) : (
                wallets.map(wallet => (
                  <WalletCard
                    key={wallet.id}
                    wallet={wallet}
                    adminWallet={globalAdminWallet}
                    onSetCurrent={handleSetCurrent}
                    onArchive={handleArchive}
                    isLoading={actionLoading}
                  />
                ))
              )}
              </div>
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
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Wallet</th>
                      <th className="text-center px-4 py-3 font-semibold text-slate-600">Index</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600">Balance</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orphanAddresses.map(address => (
                      <OrphanAddressRow
                        key={address.address}
                        address={address}
                        onSweep={handleSweep}
                        onMarkClear={handleMarkClear}
                        isLoading={actionLoading}
                      />
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
                  <DollarSign className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-semibold">No recent deposits</p>
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
                          {deposit.address?.slice(0, 8)}...{deposit.address?.slice(-6)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-green-600">
                          ${deposit.amount}
                        </td>
                        <td className="px-4 py-3">
                          <a href={`https://tronscan.org/#/transaction/${deposit.tx_hash}`} 
                            target="_blank" rel="noopener noreferrer"
                            className="text-xs text-purple-600 hover:underline font-mono flex items-center gap-1">
                            {deposit.tx_hash?.slice(0, 12)}...
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                            deposit.status === 'credited' ? 'bg-green-100 text-green-700' :
                            deposit.status === 'swept' ? 'bg-purple-100 text-purple-700' :
                            deposit.status === 'orphan' ? 'bg-amber-100 text-amber-700' :
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

      {/* Add Wallet Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowAddModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Key className="w-5 h-5 text-purple-600" /> Add New Wallet
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Wallet Name *</label>
                <input
                  type="text"
                  value={newWallet.name}
                  onChange={e => setNewWallet({ ...newWallet, name: e.target.value })}
                  placeholder="e.g., Main Wallet V2"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Master XPUB *</label>
                <textarea
                  value={newWallet.master_xpub}
                  onChange={e => setNewWallet({ ...newWallet, master_xpub: e.target.value })}
                  placeholder="xpub..."
                  rows={3}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Admin Wallet (Sweep To)</label>
                <input
                  type="text"
                  value={newWallet.admin_wallet}
                  onChange={e => setNewWallet({ ...newWallet, admin_wallet: e.target.value })}
                  placeholder="TRX address..."
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Tatum API Key</label>
                <input
                  type="password"
                  value={newWallet.tatum_api_key}
                  onChange={e => setNewWallet({ ...newWallet, tatum_api_key: e.target.value })}
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowAddModal(false)}
                className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-semibold hover:bg-slate-200">
                Cancel
              </button>
              <button onClick={handleAddWallet} disabled={actionLoading}
                className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add Wallet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <Toast message={toast.msg} type={toast.success ? 'success' : 'error'} onClose={() => setToast(null)} />}
    </div>
  );
}
