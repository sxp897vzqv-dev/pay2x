import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../supabase';
import {
  Wallet, Settings, RefreshCw, Search, Filter, Plus, Copy, Eye, EyeOff,
  ArrowUpRight, ArrowDownRight, AlertCircle, CheckCircle, Clock, Download,
  User, ExternalLink, Key, Shield, Zap, TrendingUp, Database, X, Check,
  ChevronDown, ChevronRight, Edit, Save, Trash2,
} from 'lucide-react';

/* ─────────────────────────────────────────────────────────────────────────────
   TABS
───────────────────────────────────────────────────────────────────────────── */

const TABS = [
  { key: 'traders', label: 'Trader Wallets', icon: User },
  { key: 'transactions', label: 'Transactions', icon: ArrowUpRight },
  { key: 'rates', label: 'USDT Rates', icon: TrendingUp },
  { key: 'config', label: 'Configuration', icon: Settings },
];

/* ─────────────────────────────────────────────────────────────────────────────
   TATUM API HELPERS
───────────────────────────────────────────────────────────────────────────── */

const TATUM_API_URL = 'https://api.tatum.io/v3';

async function tatumRequest(endpoint, options = {}, apiKey) {
  const res = await fetch(`${TATUM_API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Tatum API error: ${res.status}`);
  }
  return res.json();
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────────── */

export default function AdminWallets() {
  const [activeTab, setActiveTab] = useState('traders');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Data
  const [config, setConfig] = useState(null);
  const [wallets, setWallets] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [stats, setStats] = useState({});
  const [tradersWithoutWallet, setTradersWithoutWallet] = useState([]);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState(null);

  // Fetch all data
  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    
    try {
      const [configRes, metaRes, walletsRes, txRes, statsRes, tradersRes] = await Promise.all([
        supabase.from('tatum_config').select('*').eq('id', 'main').single(),
        supabase.from('address_meta').select('last_index').eq('id', 'main').single(),
        supabase.from('v_trader_wallets').select('*'),
        supabase.from('v_wallet_transactions').select('*').limit(100),
        supabase.from('v_wallet_stats').select('*').single(),
        supabase.from('traders').select('id, name, phone').eq('is_active', true),
      ]);
      
      // Map tatum_config fields to expected format
      if (configRes.data) {
        setConfig({
          ...configRes.data,
          xpub: configRes.data.master_xpub,
          mnemonic_encrypted: configRes.data.master_mnemonic,
          tatum_api_key_encrypted: configRes.data.tatum_api_key,
          admin_wallet_address: configRes.data.admin_wallet,
          network: 'tron',
          token: 'USDT',
          contract_address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
          last_derivation_index: metaRes.data?.last_index || 0,
        });
      }
      if (walletsRes.data) setWallets(walletsRes.data);
      if (txRes.data) setTransactions(txRes.data);
      if (statsRes.data) setStats(statsRes.data);
      
      // Find traders without wallets
      if (tradersRes.data && walletsRes.data) {
        const walletTraderIds = new Set(walletsRes.data.map(w => w.trader_id));
        const noWallet = tradersRes.data.filter(t => !walletTraderIds.has(t.id));
        setTradersWithoutWallet(noWallet);
      }
    } catch (e) {
      console.error('Error fetching wallet data:', e);
    }
    
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { fetchData(); }, []);

  // Refresh balances from Tatum
  const refreshBalances = async () => {
    if (!config?.tatum_api_key_encrypted) {
      alert('Please configure Tatum API key first');
      return;
    }
    
    setRefreshing(true);
    try {
      // In production, this would call your backend Edge Function
      // which decrypts the API key and calls Tatum
      for (const wallet of wallets) {
        try {
          // Simulated - replace with actual Edge Function call
          const balanceRes = await supabase.functions.invoke('get-wallet-balance', {
            body: { address: wallet.address }
          });
          
          if (balanceRes.data) {
            await supabase.rpc('update_wallet_balance', {
              p_address: wallet.address,
              p_balance_trx: balanceRes.data.trx || 0,
              p_balance_usdt: balanceRes.data.usdt || 0,
            });
          }
        } catch (e) {
          console.error(`Error updating balance for ${wallet.address}:`, e);
        }
      }
      await fetchData(true);
    } catch (e) {
      alert('Error refreshing balances: ' + e.message);
    }
    setRefreshing(false);
  };

  // Filtered wallets
  const filteredWallets = useMemo(() => {
    if (!searchQuery) return wallets;
    const q = searchQuery.toLowerCase();
    return wallets.filter(w => 
      w.trader_name?.toLowerCase().includes(q) ||
      w.address?.toLowerCase().includes(q) ||
      w.trader_phone?.includes(q)
    );
  }, [wallets, searchQuery]);

  // Copy to clipboard
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    // Could add toast notification here
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm font-medium">Loading wallets…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Wallet className="w-7 h-7 text-orange-600" />
            HD Wallets
          </h1>
          <p className="text-slate-500 text-sm mt-1">TRX/USDT wallet management via Tatum</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowGenerateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-xl hover:bg-orange-700 text-sm font-semibold"
          >
            <Plus className="w-4 h-4" /> Generate Wallet
          </button>
          <button
            onClick={refreshBalances}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-200 text-sm font-semibold disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh Balances
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard 
          title="Total Wallets" 
          value={stats.total_wallets || 0} 
          icon={Wallet} 
          color="orange" 
          isCount 
        />
        <StatCard 
          title="USDT Balance" 
          value={stats.total_usdt_balance || 0} 
          icon={TrendingUp} 
          color="green"
          suffix=" USDT"
        />
        <StatCard 
          title="TRX Balance" 
          value={stats.total_trx_balance || 0} 
          icon={Zap} 
          color="blue"
          suffix=" TRX"
        />
        <StatCard 
          title="24h Deposits" 
          value={stats.deposits_24h || 0} 
          icon={ArrowDownRight} 
          color="emerald"
          suffix=" USDT"
        />
        <StatCard 
          title="Pending Txs" 
          value={stats.pending_transactions || 0} 
          icon={Clock} 
          color="yellow"
          isCount
        />
      </div>

      {/* Admin Wallet Quick View */}
      <div className="bg-gradient-to-r from-orange-500 to-amber-500 rounded-xl p-4 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-orange-100 text-xs font-semibold uppercase tracking-wide mb-1">Admin Wallet</p>
            {stats.admin_wallet ? (
              <div className="flex items-center gap-2">
                <code className="text-sm font-mono bg-white/20 px-2 py-1 rounded">{stats.admin_wallet}</code>
                <button onClick={() => copyToClipboard(stats.admin_wallet)} className="p-1 hover:bg-white/20 rounded">
                  <Copy className="w-4 h-4" />
                </button>
                <a 
                  href={`https://tronscan.org/#/address/${stats.admin_wallet}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="p-1 hover:bg-white/20 rounded"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            ) : (
              <p className="text-orange-200 text-sm">Not configured</p>
            )}
          </div>
          <button 
            onClick={() => setShowConfigModal(true)}
            className="flex items-center gap-2 px-3 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-semibold"
          >
            <Settings className="w-4 h-4" /> Configure
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="border-b border-slate-200">
          <div className="flex overflow-x-auto">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                    isActive
                      ? 'border-orange-600 text-orange-600 bg-orange-50/50'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  {tab.key === 'traders' && (
                    <span className="text-xs bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full ml-1">
                      {wallets.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-4">
          {activeTab === 'traders' && (
            <TraderWalletsTab
              wallets={filteredWallets}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onViewWallet={setSelectedWallet}
              onCopy={copyToClipboard}
              onRefresh={() => fetchData(true)}
            />
          )}
          {activeTab === 'transactions' && (
            <TransactionsTab transactions={transactions} onCopy={copyToClipboard} />
          )}
          {activeTab === 'rates' && (
            <RatesTab />
          )}
          {activeTab === 'config' && (
            <ConfigTab 
              config={config} 
              onUpdate={() => fetchData(true)} 
              tradersWithoutWallet={tradersWithoutWallet}
            />
          )}
        </div>
      </div>

      {/* Wallet Detail Modal */}
      {selectedWallet && (
        <WalletDetailModal 
          wallet={selectedWallet} 
          onClose={() => setSelectedWallet(null)}
          onCopy={copyToClipboard}
        />
      )}

      {/* Config Modal */}
      {showConfigModal && (
        <ConfigModal 
          config={config}
          onClose={() => setShowConfigModal(false)}
          onSuccess={() => { setShowConfigModal(false); fetchData(true); }}
        />
      )}

      {/* Generate Wallet Modal */}
      {showGenerateModal && (
        <GenerateWalletModal
          traders={tradersWithoutWallet}
          onClose={() => setShowGenerateModal(false)}
          onSuccess={() => { setShowGenerateModal(false); fetchData(true); }}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   STAT CARD
───────────────────────────────────────────────────────────────────────────── */

function StatCard({ title, value, icon: Icon, color, isCount, suffix = '' }) {
  const colors = {
    orange: 'bg-orange-50 text-orange-600 border-orange-200',
    green: 'bg-green-50 text-green-600 border-green-200',
    blue: 'bg-blue-50 text-blue-600 border-blue-200',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    yellow: 'bg-yellow-50 text-yellow-600 border-yellow-200',
  };

  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4" />
        <span className="text-xs font-semibold uppercase tracking-wide opacity-75">{title}</span>
      </div>
      <p className="text-xl font-bold">
        {isCount ? value.toLocaleString() : Number(value).toFixed(2)}{suffix}
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   TRADER WALLETS TAB
───────────────────────────────────────────────────────────────────────────── */

function TraderWalletsTab({ wallets, searchQuery, setSearchQuery, onViewWallet, onCopy, onRefresh }) {
  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search by trader name, phone, or address..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
        />
      </div>

      {/* Wallets Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-3 px-3 font-semibold text-slate-600">Trader</th>
              <th className="text-left py-3 px-3 font-semibold text-slate-600">Address</th>
              <th className="text-right py-3 px-3 font-semibold text-slate-600">USDT</th>
              <th className="text-right py-3 px-3 font-semibold text-slate-600">TRX</th>
              <th className="text-center py-3 px-3 font-semibold text-slate-600">Last Check</th>
              <th className="text-center py-3 px-3 font-semibold text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {wallets.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-slate-400">
                  <Wallet className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p>No wallets found</p>
                </td>
              </tr>
            ) : (
              wallets.map(wallet => (
                <tr key={wallet.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
                        <User className="w-4 h-4 text-orange-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{wallet.trader_name}</p>
                        <p className="text-xs text-slate-500">{wallet.trader_phone}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-slate-100 px-2 py-1 rounded font-mono">
                        {wallet.address?.slice(0, 8)}...{wallet.address?.slice(-6)}
                      </code>
                      <button onClick={() => onCopy(wallet.address)} className="text-slate-400 hover:text-slate-600">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <a 
                        href={`https://tronscan.org/#/address/${wallet.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-400 hover:text-orange-600"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <span className={`font-semibold ${Number(wallet.balance_usdt) > 0 ? 'text-green-600' : 'text-slate-400'}`}>
                      {Number(wallet.balance_usdt || 0).toFixed(2)}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <span className={`font-medium ${Number(wallet.balance_trx) > 0 ? 'text-blue-600' : 'text-slate-400'}`}>
                      {Number(wallet.balance_trx || 0).toFixed(2)}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center text-xs text-slate-500">
                    {wallet.last_balance_check 
                      ? new Date(wallet.last_balance_check).toLocaleString()
                      : 'Never'}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <button
                      onClick={() => onViewWallet(wallet)}
                      className="p-1.5 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   TRANSACTIONS TAB
───────────────────────────────────────────────────────────────────────────── */

function TransactionsTab({ transactions, onCopy }) {
  const typeIcons = {
    deposit: { icon: ArrowDownRight, color: 'text-green-600 bg-green-100' },
    withdrawal: { icon: ArrowUpRight, color: 'text-blue-600 bg-blue-100' },
    sweep: { icon: ArrowUpRight, color: 'text-purple-600 bg-purple-100' },
    gas_topup: { icon: Zap, color: 'text-yellow-600 bg-yellow-100' },
  };

  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-700',
    confirmed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left py-3 px-3 font-semibold text-slate-600">Type</th>
            <th className="text-left py-3 px-3 font-semibold text-slate-600">Trader</th>
            <th className="text-left py-3 px-3 font-semibold text-slate-600">TX Hash</th>
            <th className="text-right py-3 px-3 font-semibold text-slate-600">Amount</th>
            <th className="text-center py-3 px-3 font-semibold text-slate-600">Status</th>
            <th className="text-center py-3 px-3 font-semibold text-slate-600">Time</th>
          </tr>
        </thead>
        <tbody>
          {transactions.length === 0 ? (
            <tr>
              <td colSpan={6} className="text-center py-12 text-slate-400">
                <Database className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p>No transactions yet</p>
              </td>
            </tr>
          ) : (
            transactions.map(tx => {
              const typeStyle = typeIcons[tx.tx_type] || typeIcons.deposit;
              const Icon = typeStyle.icon;
              return (
                <tr key={tx.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${typeStyle.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                  </td>
                  <td className="py-3 px-3 text-slate-700">{tx.trader_name || '-'}</td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-slate-100 px-2 py-1 rounded font-mono">
                        {tx.tx_hash?.slice(0, 10)}...{tx.tx_hash?.slice(-6)}
                      </code>
                      <button onClick={() => onCopy(tx.tx_hash)} className="text-slate-400 hover:text-slate-600">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <a 
                        href={`https://tronscan.org/#/transaction/${tx.tx_hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-400 hover:text-orange-600"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <span className="font-semibold">{Number(tx.amount).toFixed(2)}</span>
                    <span className="text-slate-500 text-xs ml-1">{tx.token}</span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statusColors[tx.status] || statusColors.pending}`}>
                      {tx.status}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center text-xs text-slate-500">
                    {new Date(tx.created_at).toLocaleString()}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   CONFIG TAB
───────────────────────────────────────────────────────────────────────────── */

function ConfigTab({ config, onUpdate, tradersWithoutWallet }) {
  return (
    <div className="space-y-6">
      {/* Current Config */}
      <div className="bg-slate-50 rounded-xl p-4 space-y-4">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
          <Settings className="w-4 h-4" /> Current Configuration
        </h3>
        
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-slate-500">Network</p>
            <p className="font-semibold text-slate-900">{config?.network?.toUpperCase() || 'Not set'}</p>
          </div>
          <div>
            <p className="text-slate-500">Token</p>
            <p className="font-semibold text-slate-900">{config?.token || 'Not set'}</p>
          </div>
          <div>
            <p className="text-slate-500">Contract</p>
            <code className="text-xs bg-white px-2 py-1 rounded">
              {config?.contract_address?.slice(0, 12)}...
            </code>
          </div>
          <div>
            <p className="text-slate-500">Last Derivation Index</p>
            <p className="font-semibold text-slate-900">{config?.last_derivation_index || 0}</p>
          </div>
          <div>
            <p className="text-slate-500">HD Wallet</p>
            <p className="font-semibold text-slate-900">
              {config?.xpub ? (
                <span className="text-green-600 flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" /> Configured
                </span>
              ) : (
                <span className="text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" /> Not set
                </span>
              )}
            </p>
          </div>
          <div>
            <p className="text-slate-500">Tatum API Key</p>
            <p className="font-semibold text-slate-900">
              {config?.tatum_api_key_encrypted ? (
                <span className="text-green-600 flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" /> Configured
                </span>
              ) : (
                <span className="text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" /> Not set
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Traders without wallets */}
      {tradersWithoutWallet.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <h3 className="font-semibold text-yellow-800 flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4" /> 
            Traders Without Wallets ({tradersWithoutWallet.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {tradersWithoutWallet.slice(0, 10).map(t => (
              <span key={t.id} className="text-sm bg-white border border-yellow-300 px-2 py-1 rounded-lg">
                {t.name}
              </span>
            ))}
            {tradersWithoutWallet.length > 10 && (
              <span className="text-sm text-yellow-700">+{tradersWithoutWallet.length - 10} more</span>
            )}
          </div>
        </div>
      )}

      {/* Setup Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="font-semibold text-blue-800 flex items-center gap-2 mb-2">
          <Shield className="w-4 h-4" /> Setup Instructions
        </h3>
        <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
          <li>Get your Tatum API key from <a href="https://tatum.io" target="_blank" rel="noopener noreferrer" className="underline">tatum.io</a></li>
          <li>Generate an HD wallet using Tatum's API</li>
          <li>Enter the mnemonic and xpub in configuration</li>
          <li>Set your admin withdrawal wallet address</li>
          <li>Generate wallets for each trader</li>
        </ol>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   CONFIG MODAL
───────────────────────────────────────────────────────────────────────────── */

function ConfigModal({ config, onClose, onSuccess }) {
  const [tatumApiKey, setTatumApiKey] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [xpub, setXpub] = useState(config?.xpub || '');
  const [adminWallet, setAdminWallet] = useState(config?.admin_wallet_address || '');
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Generate new HD wallet via Tatum
  const generateHDWallet = async () => {
    if (!tatumApiKey) {
      alert('Please enter Tatum API key first');
      return;
    }
    
    setGenerating(true);
    try {
      const res = await tatumRequest('/tron/wallet', {
        method: 'GET',
      }, tatumApiKey);
      
      setMnemonic(res.mnemonic);
      setXpub(res.xpub);
    } catch (e) {
      alert('Error generating wallet: ' + e.message);
    }
    setGenerating(false);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      // Map to tatum_config column names
      const updates = {
        updated_at: new Date().toISOString(),
      };
      
      // Only update these if provided (don't overwrite with empty)
      if (tatumApiKey) updates.tatum_api_key = tatumApiKey;
      if (mnemonic) updates.master_mnemonic = mnemonic;
      if (xpub) updates.master_xpub = xpub;
      if (adminWallet) updates.admin_wallet = adminWallet;
      
      // Update tatum_config (always exists with id='main')
      const { error } = await supabase
        .from('tatum_config')
        .update(updates)
        .eq('id', 'main');
      
      if (error) throw error;
      onSuccess();
    } catch (e) {
      alert('Error saving config: ' + e.message);
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">Wallet Configuration</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
          {/* Tatum API Key */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Tatum API Key
            </label>
            <input
              type="password"
              value={tatumApiKey}
              onChange={e => setTatumApiKey(e.target.value)}
              placeholder={config?.tatum_api_key_encrypted ? '••••••••••••' : 'Enter API key'}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm"
            />
          </div>

          {/* HD Wallet Section */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">HD Wallet</h3>
              <button
                onClick={generateHDWallet}
                disabled={generating || !tatumApiKey}
                className="flex items-center gap-1 text-sm text-orange-600 hover:text-orange-700 disabled:opacity-50"
              >
                <Zap className="w-4 h-4" />
                {generating ? 'Generating...' : 'Generate New'}
              </button>
            </div>

            {/* Mnemonic */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Mnemonic (24 words)
              </label>
              <div className="relative">
                <textarea
                  value={mnemonic}
                  onChange={e => setMnemonic(e.target.value)}
                  placeholder={config?.mnemonic_encrypted ? '••• ••• ••• (already set)' : 'Enter or generate mnemonic'}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono resize-none"
                  rows={2}
                  style={{ WebkitTextSecurity: showMnemonic ? 'none' : 'disc' }}
                />
                <button
                  type="button"
                  onClick={() => setShowMnemonic(!showMnemonic)}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                >
                  {showMnemonic ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-red-500 mt-1">⚠️ Keep this secure! Anyone with the mnemonic controls all wallets.</p>
            </div>

            {/* XPUB */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Extended Public Key (xpub)
              </label>
              <input
                type="text"
                value={xpub}
                onChange={e => setXpub(e.target.value)}
                placeholder="xpub..."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono"
              />
            </div>
          </div>

          {/* Admin Wallet */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Admin Withdrawal Wallet
            </label>
            <input
              type="text"
              value={adminWallet}
              onChange={e => setAdminWallet(e.target.value)}
              placeholder="T..."
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono"
            />
            <p className="text-xs text-slate-500 mt-1">USDT will be swept to this address</p>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50">
          <button
            onClick={handleSave}
            disabled={loading}
            className="w-full py-3 bg-orange-600 text-white rounded-xl font-semibold hover:bg-orange-700 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   GENERATE WALLET MODAL
───────────────────────────────────────────────────────────────────────────── */

function GenerateWalletModal({ traders, onClose, onSuccess }) {
  const [selectedTrader, setSelectedTrader] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleGenerate = async () => {
    if (!selectedTrader) return;
    
    setLoading(true);
    try {
      // Get tatum config
      const { data: config, error: configError } = await supabase
        .from('tatum_config')
        .select('*')
        .eq('id', 'main')
        .single();
      
      if (configError || !config?.master_xpub || !config?.tatum_api_key) {
        throw new Error('Tatum not configured. Please set up API key and master wallet first.');
      }
      
      // Get next derivation index manually
      const { data: metaRow } = await supabase
        .from('address_meta')
        .select('last_index')
        .eq('id', 'main')
        .single();
      
      const derivationIndex = (metaRow?.last_index || 0) + 1;
      
      // Call Tatum API to derive address
      const tatumRes = await fetch(
        `https://api.tatum.io/v3/tron/address/${config.master_xpub}/${derivationIndex}`,
        { headers: { 'x-api-key': config.tatum_api_key } }
      );
      
      if (!tatumRes.ok) {
        const err = await tatumRes.json();
        throw new Error(err.message || 'Tatum API error');
      }
      
      const addressData = await tatumRes.json();
      
      // Update trader with new address
      await supabase.from('traders').update({
        usdt_deposit_address: addressData.address,
        derivation_index: derivationIndex,
        address_generated_at: new Date().toISOString(),
      }).eq('id', selectedTrader);
      
      // Create address mapping
      await supabase.from('address_mapping').upsert({
        address: addressData.address,
        trader_id: selectedTrader,
        derivation_index: derivationIndex,
      });
      
      // Update derivation index counter
      await supabase.from('address_meta').update({
        last_index: derivationIndex,
        last_updated: new Date().toISOString(),
      }).eq('id', 'main');
      
      setResult({
        address: addressData.address,
        derivationIndex,
      });
      
      onSuccess();
    } catch (e) {
      alert('Error generating wallet: ' + e.message);
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">Generate Trader Wallet</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-4">
          {traders.length === 0 ? (
            <div className="text-center py-6">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
              <p className="text-slate-600">All traders have wallets!</p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Select Trader</label>
                <select
                  value={selectedTrader}
                  onChange={e => setSelectedTrader(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm"
                >
                  <option value="">Choose trader...</option>
                  {traders.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.phone})</option>
                  ))}
                </select>
              </div>

              {result && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-green-800 mb-2">Wallet Generated!</p>
                  <code className="text-xs bg-white px-2 py-1 rounded block break-all">{result.address}</code>
                  <p className="text-xs text-green-600 mt-1">Derivation index: {result.derivationIndex}</p>
                </div>
              )}

              <button
                onClick={handleGenerate}
                disabled={loading || !selectedTrader}
                className="w-full py-3 bg-orange-600 text-white rounded-xl font-semibold hover:bg-orange-700 disabled:opacity-50"
              >
                {loading ? 'Generating...' : 'Generate Wallet'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   WALLET DETAIL MODAL
───────────────────────────────────────────────────────────────────────────── */

function WalletDetailModal({ wallet, onClose, onCopy }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">Wallet Details</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center">
              <User className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <p className="font-bold text-slate-900">{wallet.trader_name}</p>
              <p className="text-sm text-slate-500">{wallet.trader_phone}</p>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 space-y-3">
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1">Address</p>
              <div className="flex items-center gap-2">
                <code className="text-sm bg-white px-2 py-1 rounded font-mono break-all flex-1">
                  {wallet.address}
                </code>
                <button onClick={() => onCopy(wallet.address)} className="p-1.5 hover:bg-slate-200 rounded">
                  <Copy className="w-4 h-4 text-slate-500" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">USDT Balance</p>
                <p className="text-xl font-bold text-green-600">{Number(wallet.balance_usdt || 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">TRX Balance</p>
                <p className="text-xl font-bold text-blue-600">{Number(wallet.balance_trx || 0).toFixed(2)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs font-semibold text-slate-500">Derivation Index</p>
                <p className="font-mono">{wallet.derivation_index}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500">Total Deposits</p>
                <p>{Number(wallet.total_deposits || 0).toFixed(2)} USDT</p>
              </div>
            </div>
          </div>

          <a
            href={`https://tronscan.org/#/address/${wallet.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2.5 bg-slate-100 text-slate-700 rounded-xl font-semibold hover:bg-slate-200"
          >
            <ExternalLink className="w-4 h-4" /> View on TronScan
          </a>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   RATES TAB - USDT Rate Tracking
───────────────────────────────────────────────────────────────────────────── */

function RatesTab() {
  const [config, setConfig] = useState(null);
  const [rateHistory, setRateHistory] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({ totalProfit: 0, avgMargin: 0, depositCount: 0 });

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch current config
      const { data: configData } = await supabase
        .from('tatum_config')
        .select('admin_usdt_rate, default_usdt_rate, rate_updated_at, rate_source, rate_offers')
        .eq('id', 'main')
        .single();
      
      if (configData) setConfig(configData);

      // Fetch rate history
      const { data: historyData } = await supabase
        .from('usdt_rate_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (historyData) setRateHistory(historyData);

      // Fetch deposits with profit tracking
      const { data: depositData } = await supabase
        .from('crypto_transactions')
        .select('*')
        .eq('type', 'deposit')
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (depositData) {
        setDeposits(depositData);
        
        // Calculate stats
        const totalProfit = depositData.reduce((sum, d) => sum + (d.total_profit || 0), 0);
        const avgMargin = depositData.length > 0 
          ? depositData.reduce((sum, d) => sum + (d.profit_per_usdt || 0), 0) / depositData.length 
          : 0;
        setStats({ 
          totalProfit: Math.round(totalProfit * 100) / 100, 
          avgMargin: Math.round(avgMargin * 100) / 100,
          depositCount: depositData.length 
        });
      }
    } catch (e) {
      console.error('Error fetching rate data:', e);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const refreshRate = async () => {
    setRefreshing(true);
    try {
      // Use supabase client to invoke function
      const { data, error } = await supabase.functions.invoke('update-usdt-rate', {
        body: {}
      });
      
      if (error) throw error;
      if (data?.success) {
        await fetchData();
      } else {
        alert('Failed to refresh rate: ' + (data?.error || 'Unknown error'));
      }
    } catch (e) {
      alert('Error: ' + e.message);
    }
    setRefreshing(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current Rates */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-4 text-white">
          <p className="text-green-100 text-xs font-semibold uppercase mb-1">Admin Rate (Binance P2P)</p>
          <p className="text-3xl font-bold">₹{config?.admin_usdt_rate || '—'}</p>
          <p className="text-green-200 text-xs mt-1">What we receive per USDT</p>
        </div>
        
        <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl p-4 text-white">
          <p className="text-blue-100 text-xs font-semibold uppercase mb-1">Trader Rate</p>
          <p className="text-3xl font-bold">₹{config?.default_usdt_rate || '—'}</p>
          <p className="text-blue-200 text-xs mt-1">What traders get (Admin - ₹1)</p>
        </div>
        
        <div className="bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl p-4 text-white">
          <p className="text-purple-100 text-xs font-semibold uppercase mb-1">Total Profit</p>
          <p className="text-3xl font-bold">₹{stats.totalProfit.toLocaleString()}</p>
          <p className="text-purple-200 text-xs mt-1">{stats.depositCount} deposits • Avg ₹{stats.avgMargin}/USDT</p>
        </div>
      </div>

      {/* Rate Info & Refresh */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-600">
            <span className="font-semibold">Source:</span> {config?.rate_source || 'binance_p2p'} • 
            <span className="font-semibold ml-2">Last Update:</span> {config?.rate_updated_at 
              ? new Date(config.rate_updated_at).toLocaleString('en-IN') 
              : 'Never'}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Filters: UPI/IMPS payments, >₹2L liquidity, avg of top 5 offers
          </p>
        </div>
        <button
          onClick={refreshRate}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh Now
        </button>
      </div>

      {/* Binance P2P Offers */}
      {config?.rate_offers && config.rate_offers.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
            <h3 className="font-semibold text-slate-900">Top 5 Binance P2P Offers (UPI/IMPS)</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {config.rate_offers.map((offer, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 bg-slate-100 rounded-full flex items-center justify-center text-xs font-bold text-slate-600">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-semibold text-slate-900">{offer.nickName}</p>
                    <p className="text-xs text-slate-500">{offer.surplusAmount?.toFixed(0)} USDT available</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-green-600">₹{offer.price}</p>
                  <p className="text-xs text-slate-500">{offer.payTypes?.join(', ')}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deposit Profit Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Deposit Profit Tracking</h3>
          <span className="text-xs text-slate-500">{deposits.length} deposits</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left py-2 px-3 font-semibold text-slate-600">Date</th>
                <th className="text-left py-2 px-3 font-semibold text-slate-600">Trader</th>
                <th className="text-right py-2 px-3 font-semibold text-slate-600">USDT</th>
                <th className="text-right py-2 px-3 font-semibold text-slate-600">Admin Rate</th>
                <th className="text-right py-2 px-3 font-semibold text-slate-600">Trader Rate</th>
                <th className="text-right py-2 px-3 font-semibold text-slate-600">INR Credited</th>
                <th className="text-right py-2 px-3 font-semibold text-slate-600 text-green-600">Profit</th>
              </tr>
            </thead>
            <tbody>
              {deposits.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">No deposits yet</td>
                </tr>
              ) : (
                deposits.map(deposit => (
                  <tr key={deposit.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 px-3 text-slate-600">
                      {new Date(deposit.created_at).toLocaleDateString('en-IN')}
                    </td>
                    <td className="py-2 px-3 font-medium text-slate-900">
                      {deposit.trader_name || deposit.trader_id?.slice(0, 8)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono">
                      {deposit.usdt_amount?.toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-600">
                      ₹{deposit.admin_rate || '—'}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-600">
                      ₹{deposit.trader_rate || '—'}
                    </td>
                    <td className="py-2 px-3 text-right font-semibold text-blue-600">
                      ₹{deposit.amount?.toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-green-600">
                      ₹{(deposit.total_profit || 0).toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rate History */}
      {rateHistory.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
            <h3 className="font-semibold text-slate-900">Rate History</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left py-2 px-3 font-semibold text-slate-600">Time</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-600">Admin Rate</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-600">Trader Rate</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-600">Margin</th>
                </tr>
              </thead>
              <tbody>
                {rateHistory.slice(0, 20).map(rate => (
                  <tr key={rate.id} className="border-b border-slate-100">
                    <td className="py-2 px-3 text-slate-600">
                      {new Date(rate.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="py-2 px-3 text-right font-semibold text-green-600">₹{rate.admin_rate}</td>
                    <td className="py-2 px-3 text-right font-semibold text-blue-600">₹{rate.trader_rate}</td>
                    <td className="py-2 px-3 text-right text-slate-500">₹{rate.margin}</td>
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
