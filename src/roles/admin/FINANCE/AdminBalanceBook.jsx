import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../supabase';
import {
  BookOpen, TrendingUp, TrendingDown, DollarSign, Search, Filter,
  ChevronDown, ChevronRight, Calendar, Download, RefreshCw, Plus,
  ArrowUpRight, ArrowDownRight, Building2, User, Wallet, Eye,
  FileText, PieChart, BarChart3, X, Check, AlertCircle,
} from 'lucide-react';

/* ─────────────────────────────────────────────────────────────────────────────
   TABS
───────────────────────────────────────────────────────────────────────────── */

const TABS = [
  { key: 'ledger', label: 'Journal Entries', icon: BookOpen },
  { key: 'accounts', label: 'Chart of Accounts', icon: Wallet },
  { key: 'trial', label: 'Trial Balance', icon: BarChart3 },
  { key: 'pnl', label: 'Profit & Loss', icon: PieChart },
];

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────────── */

export default function AdminBalanceBook() {
  const [activeTab, setActiveTab] = useState('ledger');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Data
  const [journalEntries, setJournalEntries] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [trialBalance, setTrialBalance] = useState([]);
  const [profitLoss, setProfitLoss] = useState([]);
  const [summary, setSummary] = useState({ totalRevenue: 0, totalExpenses: 0, netProfit: 0 });
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  
  // Modals
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);

  // Fetch data
  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    
    try {
      const [entriesRes, accountsRes, trialRes, pnlRes] = await Promise.all([
        supabase
          .from('journal_entries')
          .select(`
            *,
            journal_lines (
              id, account_code, entry_type, amount, description, balance_after,
              accounts:account_id (name, entity_type, entity_id)
            )
          `)
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('v_account_balances')
          .select('*')
          .order('code'),
        supabase
          .from('v_trial_balance')
          .select('*'),
        supabase
          .from('v_profit_loss')
          .select('*'),
      ]);

      if (entriesRes.data) setJournalEntries(entriesRes.data);
      if (accountsRes.data) setAccounts(accountsRes.data);
      if (trialRes.data) setTrialBalance(trialRes.data);
      if (pnlRes.data) {
        setProfitLoss(pnlRes.data);
        const revenue = pnlRes.data.filter(r => r.category === 'Revenue').reduce((s, r) => s + Number(r.amount || 0), 0);
        const expenses = pnlRes.data.filter(r => r.category === 'Expenses').reduce((s, r) => s + Number(r.amount || 0), 0);
        setSummary({ totalRevenue: revenue, totalExpenses: expenses, netProfit: revenue - expenses });
      }
    } catch (e) {
      console.error('Error fetching balance book:', e);
    }
    
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { fetchData(); }, []);

  // Filtered entries
  const filteredEntries = useMemo(() => {
    return journalEntries.filter(entry => {
      // Search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchDesc = entry.description?.toLowerCase().includes(q);
        const matchRef = entry.reference_id?.toLowerCase().includes(q);
        const matchNum = entry.entry_number?.toString().includes(q);
        if (!matchDesc && !matchRef && !matchNum) return false;
      }
      
      // Date range
      if (dateFrom && new Date(entry.entry_date) < new Date(dateFrom)) return false;
      if (dateTo && new Date(entry.entry_date) > new Date(dateTo + 'T23:59:59')) return false;
      
      // Type filter
      if (filterType !== 'all' && entry.reference_type !== filterType) return false;
      
      return true;
    });
  }, [journalEntries, searchQuery, dateFrom, dateTo, filterType]);

  // Export CSV
  const handleExport = () => {
    const rows = [['Date', 'Entry #', 'Type', 'Description', 'Amount', 'Status']];
    filteredEntries.forEach(e => {
      rows.push([
        e.entry_date,
        e.entry_number,
        e.reference_type,
        e.description,
        e.total_amount,
        e.status
      ]);
    });
    
    const csv = rows.map(r => r.map(c => `"${c || ''}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `balance-book-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm font-medium">Loading balance book…</p>
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
            <BookOpen className="w-7 h-7 text-blue-600" />
            Balance Book
          </h1>
          <p className="text-slate-500 text-sm mt-1">Double-entry accounting ledger</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-200 text-sm font-semibold"
          >
            <Download className="w-4 h-4" /> Export
          </button>
          <button
            onClick={() => setShowAdjustmentModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-sm font-semibold"
          >
            <Plus className="w-4 h-4" /> Adjustment
          </button>
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="p-2 bg-slate-100 border border-slate-200 rounded-xl hover:bg-slate-200 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 text-slate-600 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard title="Total Revenue" value={summary.totalRevenue} icon={TrendingUp} color="green" />
        <SummaryCard title="Total Expenses" value={summary.totalExpenses} icon={TrendingDown} color="red" />
        <SummaryCard title="Net Profit" value={summary.netProfit} icon={DollarSign} color={summary.netProfit >= 0 ? 'blue' : 'red'} />
        <SummaryCard title="Journal Entries" value={journalEntries.length} icon={FileText} color="purple" isCount />
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
                      ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-4">
          {activeTab === 'ledger' && (
            <JournalEntriesTab
              entries={filteredEntries}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              dateFrom={dateFrom}
              setDateFrom={setDateFrom}
              dateTo={dateTo}
              setDateTo={setDateTo}
              filterType={filterType}
              setFilterType={setFilterType}
              showFilters={showFilters}
              setShowFilters={setShowFilters}
              onViewEntry={setSelectedEntry}
            />
          )}
          {activeTab === 'accounts' && (
            <ChartOfAccountsTab accounts={accounts} onViewAccount={setSelectedAccount} />
          )}
          {activeTab === 'trial' && (
            <TrialBalanceTab data={trialBalance} />
          )}
          {activeTab === 'pnl' && (
            <ProfitLossTab data={profitLoss} summary={summary} />
          )}
        </div>
      </div>

      {/* Entry Detail Modal */}
      {selectedEntry && (
        <EntryDetailModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
      )}

      {/* Account Ledger Modal */}
      {selectedAccount && (
        <AccountLedgerModal account={selectedAccount} onClose={() => setSelectedAccount(null)} />
      )}

      {/* Adjustment Modal */}
      {showAdjustmentModal && (
        <AdjustmentModal
          onClose={() => setShowAdjustmentModal(false)}
          onSuccess={() => { setShowAdjustmentModal(false); fetchData(true); }}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   SUMMARY CARD
───────────────────────────────────────────────────────────────────────────── */

function SummaryCard({ title, value, icon: Icon, color, isCount }) {
  const colors = {
    green: 'bg-green-50 text-green-600 border-green-200',
    red: 'bg-red-50 text-red-600 border-red-200',
    blue: 'bg-blue-50 text-blue-600 border-blue-200',
    purple: 'bg-purple-50 text-purple-600 border-purple-200',
  };

  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4" />
        <span className="text-xs font-semibold uppercase tracking-wide opacity-75">{title}</span>
      </div>
      <p className="text-2xl font-bold">
        {isCount ? value.toLocaleString() : `₹${Math.abs(value).toLocaleString()}`}
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   JOURNAL ENTRIES TAB
───────────────────────────────────────────────────────────────────────────── */

function JournalEntriesTab({
  entries, searchQuery, setSearchQuery, dateFrom, setDateFrom, dateTo, setDateTo,
  filterType, setFilterType, showFilters, setShowFilters, onViewEntry
}) {
  const typeOptions = ['all', 'payin', 'payout', 'dispute', 'settlement', 'adjustment'];
  
  return (
    <div className="space-y-4">
      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search entries..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-4 py-2.5 border rounded-xl text-sm font-semibold transition-colors ${
            showFilters ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Filter className="w-4 h-4" />
          Filters
          {(dateFrom || dateTo || filterType !== 'all') && (
            <span className="w-2 h-2 bg-blue-500 rounded-full" />
          )}
        </button>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">From Date</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">To Date</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Type</label>
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              >
                {typeOptions.map(t => (
                  <option key={t} value={t}>{t === 'all' ? 'All Types' : t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
          {(dateFrom || dateTo || filterType !== 'all') && (
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); setFilterType('all'); }}
              className="text-xs text-blue-600 font-semibold hover:text-blue-700"
            >
              Clear Filters
            </button>
          )}
        </div>
      )}

      {/* Entries Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-3 px-3 font-semibold text-slate-600">#</th>
              <th className="text-left py-3 px-3 font-semibold text-slate-600">Date</th>
              <th className="text-left py-3 px-3 font-semibold text-slate-600">Type</th>
              <th className="text-left py-3 px-3 font-semibold text-slate-600">Description</th>
              <th className="text-right py-3 px-3 font-semibold text-slate-600">Amount</th>
              <th className="text-center py-3 px-3 font-semibold text-slate-600">Lines</th>
              <th className="text-center py-3 px-3 font-semibold text-slate-600">Action</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-slate-400">
                  <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p>No journal entries found</p>
                </td>
              </tr>
            ) : (
              entries.map(entry => (
                <tr key={entry.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-3 font-mono text-xs text-slate-500">#{entry.entry_number}</td>
                  <td className="py-3 px-3 text-slate-700">{entry.entry_date}</td>
                  <td className="py-3 px-3">
                    <TypeBadge type={entry.reference_type} />
                  </td>
                  <td className="py-3 px-3 text-slate-700 max-w-xs truncate">{entry.description}</td>
                  <td className="py-3 px-3 text-right font-semibold text-slate-900">
                    ₹{Number(entry.total_amount || 0).toLocaleString()}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full">
                      {entry.line_count} lines
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <button
                      onClick={() => onViewEntry(entry)}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
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
   CHART OF ACCOUNTS TAB
───────────────────────────────────────────────────────────────────────────── */

function ChartOfAccountsTab({ accounts, onViewAccount }) {
  const [expandedTypes, setExpandedTypes] = useState(['asset', 'liability', 'revenue', 'expense']);
  
  const groupedAccounts = useMemo(() => {
    const groups = { asset: [], liability: [], equity: [], revenue: [], expense: [] };
    accounts.forEach(acc => {
      if (groups[acc.account_type]) {
        groups[acc.account_type].push(acc);
      }
    });
    return groups;
  }, [accounts]);

  const toggleType = (type) => {
    setExpandedTypes(prev => 
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const typeLabels = {
    asset: { label: 'Assets', color: 'blue', icon: TrendingUp },
    liability: { label: 'Liabilities', color: 'orange', icon: TrendingDown },
    equity: { label: 'Equity', color: 'purple', icon: Wallet },
    revenue: { label: 'Revenue', color: 'green', icon: DollarSign },
    expense: { label: 'Expenses', color: 'red', icon: DollarSign },
  };

  return (
    <div className="space-y-4">
      {Object.entries(groupedAccounts).map(([type, accs]) => {
        if (accs.length === 0) return null;
        const { label, color, icon: Icon } = typeLabels[type];
        const isExpanded = expandedTypes.includes(type);
        const total = accs.reduce((s, a) => s + Number(a.current_balance || 0), 0);

        return (
          <div key={type} className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              onClick={() => toggleType(type)}
              className={`w-full flex items-center justify-between px-4 py-3 bg-${color}-50 hover:bg-${color}-100 transition-colors`}
            >
              <div className="flex items-center gap-3">
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                <Icon className={`w-5 h-5 text-${color}-600`} />
                <span className="font-semibold text-slate-900">{label}</span>
                <span className="text-xs text-slate-500">({accs.length} accounts)</span>
              </div>
              <span className={`font-bold ${total >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
                ₹{Math.abs(total).toLocaleString()}
              </span>
            </button>
            
            {isExpanded && (
              <div className="divide-y divide-slate-100">
                {accs.map(acc => (
                  <div
                    key={acc.id}
                    className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 cursor-pointer"
                    onClick={() => onViewAccount(acc)}
                  >
                    <div className="flex items-center gap-3">
                      <code className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{acc.code}</code>
                      <span className="text-sm text-slate-700">{acc.name}</span>
                      {acc.entity_type && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                          {acc.entity_type}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`font-semibold text-sm ${Number(acc.current_balance) >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
                        ₹{Math.abs(Number(acc.current_balance || 0)).toLocaleString()}
                      </span>
                      <Eye className="w-4 h-4 text-slate-400" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   TRIAL BALANCE TAB
───────────────────────────────────────────────────────────────────────────── */

function TrialBalanceTab({ data }) {
  const totalDebits = data.reduce((s, r) => s + Number(r.debit_balance || 0), 0);
  const totalCredits = data.reduce((s, r) => s + Number(r.credit_balance || 0), 0);
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

  return (
    <div className="space-y-4">
      {/* Balance Status */}
      <div className={`flex items-center gap-2 px-4 py-3 rounded-xl ${isBalanced ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
        {isBalanced ? <Check className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
        <span className="font-semibold">
          {isBalanced ? 'Books are balanced ✓' : 'Warning: Books are not balanced!'}
        </span>
      </div>

      {/* Trial Balance Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-slate-300">
              <th className="text-left py-3 px-3 font-semibold text-slate-600">Code</th>
              <th className="text-left py-3 px-3 font-semibold text-slate-600">Account</th>
              <th className="text-left py-3 px-3 font-semibold text-slate-600">Type</th>
              <th className="text-right py-3 px-3 font-semibold text-slate-600">Debit</th>
              <th className="text-right py-3 px-3 font-semibold text-slate-600">Credit</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="py-2.5 px-3 font-mono text-xs text-slate-500">{row.code}</td>
                <td className="py-2.5 px-3 text-slate-700">{row.name}</td>
                <td className="py-2.5 px-3">
                  <span className="text-xs capitalize text-slate-500">{row.account_type}</span>
                </td>
                <td className="py-2.5 px-3 text-right font-medium">
                  {Number(row.debit_balance) > 0 ? `₹${Number(row.debit_balance).toLocaleString()}` : '-'}
                </td>
                <td className="py-2.5 px-3 text-right font-medium">
                  {Number(row.credit_balance) > 0 ? `₹${Number(row.credit_balance).toLocaleString()}` : '-'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 bg-slate-50">
              <td colSpan={3} className="py-3 px-3 font-bold text-slate-900">TOTAL</td>
              <td className="py-3 px-3 text-right font-bold text-slate-900">₹{totalDebits.toLocaleString()}</td>
              <td className="py-3 px-3 text-right font-bold text-slate-900">₹{totalCredits.toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   PROFIT & LOSS TAB
───────────────────────────────────────────────────────────────────────────── */

function ProfitLossTab({ data, summary }) {
  const revenue = data.filter(r => r.category === 'Revenue');
  const expenses = data.filter(r => r.category === 'Expenses');

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className={`text-center py-6 rounded-xl ${summary.netProfit >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
        <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-1">Net Profit</p>
        <p className={`text-4xl font-bold ${summary.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          ₹{Math.abs(summary.netProfit).toLocaleString()}
        </p>
        <p className="text-sm text-slate-500 mt-2">
          Revenue: ₹{summary.totalRevenue.toLocaleString()} − Expenses: ₹{summary.totalExpenses.toLocaleString()}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Revenue */}
        <div className="border border-green-200 rounded-xl overflow-hidden">
          <div className="bg-green-50 px-4 py-3 border-b border-green-200">
            <h3 className="font-semibold text-green-800 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Revenue
            </h3>
          </div>
          <div className="divide-y divide-slate-100">
            {revenue.length === 0 ? (
              <p className="text-center py-6 text-slate-400">No revenue recorded</p>
            ) : (
              revenue.map((r, i) => (
                <div key={i} className="flex justify-between px-4 py-2.5">
                  <span className="text-sm text-slate-700">{r.name}</span>
                  <span className="font-semibold text-green-600">₹{Number(r.amount).toLocaleString()}</span>
                </div>
              ))
            )}
            <div className="flex justify-between px-4 py-3 bg-green-50 font-bold">
              <span>Total Revenue</span>
              <span className="text-green-700">₹{summary.totalRevenue.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Expenses */}
        <div className="border border-red-200 rounded-xl overflow-hidden">
          <div className="bg-red-50 px-4 py-3 border-b border-red-200">
            <h3 className="font-semibold text-red-800 flex items-center gap-2">
              <TrendingDown className="w-4 h-4" /> Expenses
            </h3>
          </div>
          <div className="divide-y divide-slate-100">
            {expenses.length === 0 ? (
              <p className="text-center py-6 text-slate-400">No expenses recorded</p>
            ) : (
              expenses.map((r, i) => (
                <div key={i} className="flex justify-between px-4 py-2.5">
                  <span className="text-sm text-slate-700">{r.name}</span>
                  <span className="font-semibold text-red-600">₹{Number(r.amount).toLocaleString()}</span>
                </div>
              ))
            )}
            <div className="flex justify-between px-4 py-3 bg-red-50 font-bold">
              <span>Total Expenses</span>
              <span className="text-red-700">₹{summary.totalExpenses.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   TYPE BADGE
───────────────────────────────────────────────────────────────────────────── */

function TypeBadge({ type }) {
  const styles = {
    payin: 'bg-green-100 text-green-700',
    payout: 'bg-blue-100 text-blue-700',
    dispute: 'bg-orange-100 text-orange-700',
    settlement: 'bg-purple-100 text-purple-700',
    adjustment: 'bg-slate-100 text-slate-700',
    opening: 'bg-yellow-100 text-yellow-700',
  };

  return (
    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${styles[type] || styles.adjustment}`}>
      {type}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   ENTRY DETAIL MODAL
───────────────────────────────────────────────────────────────────────────── */

function EntryDetailModal({ entry, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Journal Entry #{entry.entry_number}</h2>
            <p className="text-sm text-slate-500">{entry.entry_date}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-4 overflow-y-auto max-h-[60vh]">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-slate-500">Type</p>
              <TypeBadge type={entry.reference_type} />
            </div>
            <div>
              <p className="text-slate-500">Total Amount</p>
              <p className="font-bold text-slate-900">₹{Number(entry.total_amount).toLocaleString()}</p>
            </div>
          </div>
          
          <div>
            <p className="text-slate-500 text-sm mb-1">Description</p>
            <p className="text-slate-900">{entry.description}</p>
          </div>

          {/* Journal Lines */}
          <div>
            <p className="text-slate-500 text-sm mb-2">Entries</p>
            <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left py-2 px-3 font-semibold">Account</th>
                  <th className="text-right py-2 px-3 font-semibold">Debit</th>
                  <th className="text-right py-2 px-3 font-semibold">Credit</th>
                </tr>
              </thead>
              <tbody>
                {(entry.journal_lines || []).map(line => (
                  <tr key={line.id} className="border-t border-slate-100">
                    <td className="py-2 px-3">
                      <code className="text-xs bg-slate-100 px-1 rounded mr-2">{line.account_code}</code>
                      {line.accounts?.name || line.description}
                    </td>
                    <td className="py-2 px-3 text-right font-medium">
                      {line.entry_type === 'debit' ? `₹${Number(line.amount).toLocaleString()}` : '-'}
                    </td>
                    <td className="py-2 px-3 text-right font-medium">
                      {line.entry_type === 'credit' ? `₹${Number(line.amount).toLocaleString()}` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   ACCOUNT LEDGER MODAL
───────────────────────────────────────────────────────────────────────────── */

function AccountLedgerModal({ account, onClose }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLedger = async () => {
      const { data } = await supabase
        .from('v_entity_ledger')
        .select('*')
        .eq('account_code', account.code)
        .order('created_at', { ascending: false })
        .limit(100);
      
      setEntries(data || []);
      setLoading(false);
    };
    fetchLedger();
  }, [account.code]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{account.name}</h2>
            <p className="text-sm text-slate-500">Account: {account.code} • Balance: ₹{Math.abs(Number(account.current_balance)).toLocaleString()}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : entries.length === 0 ? (
            <p className="text-center py-12 text-slate-400">No transactions for this account</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 px-2 font-semibold text-slate-600">Date</th>
                  <th className="text-left py-2 px-2 font-semibold text-slate-600">Description</th>
                  <th className="text-right py-2 px-2 font-semibold text-slate-600">Debit</th>
                  <th className="text-right py-2 px-2 font-semibold text-slate-600">Credit</th>
                  <th className="text-right py-2 px-2 font-semibold text-slate-600">Balance</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id} className="border-b border-slate-100">
                    <td className="py-2 px-2 text-slate-500">{e.entry_date}</td>
                    <td className="py-2 px-2 text-slate-700">{e.entry_description}</td>
                    <td className="py-2 px-2 text-right">
                      {e.entry_type === 'debit' ? `₹${Number(e.amount).toLocaleString()}` : '-'}
                    </td>
                    <td className="py-2 px-2 text-right">
                      {e.entry_type === 'credit' ? `₹${Number(e.amount).toLocaleString()}` : '-'}
                    </td>
                    <td className="py-2 px-2 text-right font-medium">
                      ₹{Number(e.balance_after || 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   ADJUSTMENT MODAL
───────────────────────────────────────────────────────────────────────────── */

function AdjustmentModal({ onClose, onSuccess }) {
  const [entityType, setEntityType] = useState('merchant');
  const [entities, setEntities] = useState([]);
  const [selectedEntity, setSelectedEntity] = useState('');
  const [amount, setAmount] = useState('');
  const [isCredit, setIsCredit] = useState(true);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingEntities, setLoadingEntities] = useState(true);

  useEffect(() => {
    const fetchEntities = async () => {
      setLoadingEntities(true);
      const table = entityType === 'merchant' ? 'merchants' : 'traders';
      const { data } = await supabase
        .from(table)
        .select('id, name, business_name')
        .order('name');
      setEntities(data || []);
      setSelectedEntity('');
      setLoadingEntities(false);
    };
    fetchEntities();
  }, [entityType]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedEntity || !amount || !reason) return;
    
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase.rpc('record_adjustment_ledger', {
        p_entity_type: entityType,
        p_entity_id: selectedEntity,
        p_amount: parseFloat(amount),
        p_is_credit: isCredit,
        p_reason: reason,
        p_admin_id: user?.id
      });
      
      if (error) throw error;
      onSuccess();
    } catch (err) {
      alert('Error: ' + err.message);
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">Manual Adjustment</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Entity Type */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Entity Type</label>
            <div className="flex gap-2">
              {['merchant', 'trader'].map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setEntityType(type)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    entityType === type
                      ? 'bg-blue-100 text-blue-700 border-2 border-blue-300'
                      : 'bg-slate-100 text-slate-600 border-2 border-transparent'
                  }`}
                >
                  {type === 'merchant' ? <Building2 className="w-4 h-4 inline mr-1" /> : <User className="w-4 h-4 inline mr-1" />}
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Entity Select */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Select {entityType}</label>
            <select
              value={selectedEntity}
              onChange={e => setSelectedEntity(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm"
              disabled={loadingEntities}
              required
            >
              <option value="">Select...</option>
              {entities.map(e => (
                <option key={e.id} value={e.id}>
                  {e.business_name || e.name}
                </option>
              ))}
            </select>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Amount (₹)</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm"
              min="0.01"
              step="0.01"
              required
            />
          </div>

          {/* Credit/Debit */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Type</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsCredit(true)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  isCredit
                    ? 'bg-green-100 text-green-700 border-2 border-green-300'
                    : 'bg-slate-100 text-slate-600 border-2 border-transparent'
                }`}
              >
                <ArrowUpRight className="w-4 h-4 inline mr-1" /> Credit (Add)
              </button>
              <button
                type="button"
                onClick={() => setIsCredit(false)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  !isCredit
                    ? 'bg-red-100 text-red-700 border-2 border-red-300'
                    : 'bg-slate-100 text-slate-600 border-2 border-transparent'
                }`}
              >
                <ArrowDownRight className="w-4 h-4 inline mr-1" /> Debit (Subtract)
              </button>
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Reason</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Enter reason for adjustment..."
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm resize-none"
              rows={3}
              required
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !selectedEntity || !amount || !reason}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing...' : 'Create Adjustment'}
          </button>
        </form>
      </div>
    </div>
  );
}
