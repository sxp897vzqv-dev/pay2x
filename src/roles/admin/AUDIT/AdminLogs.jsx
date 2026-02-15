import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '../../../supabase';
import { Link } from 'react-router-dom';
import {
  FileText, Search, Filter, Download, RefreshCw, User, Calendar, Clock,
  IndianRupee, Settings, Shield, TrendingUp, TrendingDown, AlertCircle,
  Activity, CreditCard, Wallet, Key, LogIn, Database, BarChart3, X,
  AlertTriangle, Lock, Unlock, UserPlus, UserMinus, CheckCircle, Globe,
} from 'lucide-react';
import { logDataExported, logAuditEvent } from '../../../utils/auditLogger';

// Shared components
import { SearchInput, CardSkeleton } from '../../../components/admin';

/* ─── Action Configuration with Icons & Colors ─── */
const ACTION_CONFIG = {
  // Financial
  trader_balance_topup: { icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-100', label: 'Trader Balance Top Up', category: 'financial' },
  trader_balance_deduct: { icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-100', label: 'Trader Balance Deduct', category: 'financial' },
  merchant_balance_topup: { icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-100', label: 'Merchant Balance Top Up', category: 'financial' },
  merchant_balance_deduct: { icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-100', label: 'Merchant Balance Deduct', category: 'financial' },
  security_hold_added: { icon: Lock, color: 'text-orange-600', bg: 'bg-orange-100', label: 'Security Hold Added', category: 'financial' },
  security_hold_released: { icon: Unlock, color: 'text-blue-600', bg: 'bg-blue-100', label: 'Security Hold Released', category: 'financial' },
  usdt_deposit_address_generated: { icon: Wallet, color: 'text-purple-600', bg: 'bg-purple-100', label: 'USDT Address Generated', category: 'financial' },
  usdt_deposit_detected: { icon: AlertCircle, color: 'text-blue-600', bg: 'bg-blue-100', label: 'USDT Deposit Detected', category: 'financial' },
  usdt_deposit_credited: { icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-100', label: 'USDT Deposit Credited', category: 'financial' },
  usdt_sweep_completed: { icon: Activity, color: 'text-purple-600', bg: 'bg-purple-100', label: 'USDT Swept to Admin', category: 'financial' },
  settlement_approved: { icon: IndianRupee, color: 'text-green-600', bg: 'bg-green-100', label: 'Settlement Approved', category: 'financial' },
  settlement_completed: { icon: IndianRupee, color: 'text-green-600', bg: 'bg-green-100', label: 'Settlement Completed', category: 'financial' },
  
  // Entity Management
  trader_activated: { icon: UserPlus, color: 'text-green-600', bg: 'bg-green-100', label: 'Trader Activated', category: 'entity' },
  trader_deactivated: { icon: UserMinus, color: 'text-red-600', bg: 'bg-red-100', label: 'Trader Deactivated', category: 'entity' },
  merchant_activated: { icon: UserPlus, color: 'text-green-600', bg: 'bg-green-100', label: 'Merchant Activated', category: 'entity' },
  merchant_deactivated: { icon: UserMinus, color: 'text-red-600', bg: 'bg-red-100', label: 'Merchant Deactivated', category: 'entity' },
  trader_profile_updated: { icon: User, color: 'text-blue-600', bg: 'bg-blue-100', label: 'Trader Profile Updated', category: 'entity' },
  merchant_profile_updated: { icon: User, color: 'text-blue-600', bg: 'bg-blue-100', label: 'Merchant Profile Updated', category: 'entity' },
  
  // Operational (UPI - CRITICAL)
  upi_enabled: { icon: CreditCard, color: 'text-green-600', bg: 'bg-green-100', label: 'UPI Enabled', category: 'operational' },
  upi_disabled: { icon: CreditCard, color: 'text-red-600', bg: 'bg-red-100', label: 'UPI Disabled', category: 'operational' },
  upi_added: { icon: CreditCard, color: 'text-blue-600', bg: 'bg-blue-100', label: 'UPI Added', category: 'operational' },
  upi_deleted: { icon: CreditCard, color: 'text-red-600', bg: 'bg-red-100', label: 'UPI Deleted', category: 'operational' },
  payin_assigned: { icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-100', label: 'Payin Assigned', category: 'operational' },
  payout_completed: { icon: TrendingDown, color: 'text-green-600', bg: 'bg-green-100', label: 'Payout Completed', category: 'operational' },
  dispute_resolved: { icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-100', label: 'Dispute Resolved', category: 'operational' },
  
  // Security
  merchant_apikey_generated: { icon: Key, color: 'text-purple-600', bg: 'bg-purple-100', label: 'API Key Generated', category: 'security' },
  merchant_apikey_revoked: { icon: Key, color: 'text-red-600', bg: 'bg-red-100', label: 'API Key Revoked', category: 'security' },
  login_success: { icon: LogIn, color: 'text-green-600', bg: 'bg-green-100', label: 'Login Success', category: 'security' },
  login_failed: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-100', label: 'Login Failed', category: 'security' },
  data_exported: { icon: Download, color: 'text-blue-600', bg: 'bg-blue-100', label: 'Data Exported', category: 'security' },
  data_deleted: { icon: Database, color: 'text-red-600', bg: 'bg-red-100', label: 'Data Deleted', category: 'security' },
  
  // System Configuration
  settings_changed: { icon: Settings, color: 'text-purple-600', bg: 'bg-purple-100', label: 'Settings Changed', category: 'system' },
  tatum_apikey_changed: { icon: Key, color: 'text-purple-600', bg: 'bg-purple-100', label: 'Tatum API Key Changed', category: 'system' },
  admin_wallet_changed: { icon: Wallet, color: 'text-purple-600', bg: 'bg-purple-100', label: 'Admin Wallet Changed', category: 'system' },
  master_wallet_generated: { icon: Shield, color: 'text-green-600', bg: 'bg-green-100', label: 'Master Wallet Generated', category: 'system' },
  
  // Analytics
  report_generated: { icon: BarChart3, color: 'text-blue-600', bg: 'bg-blue-100', label: 'Report Generated', category: 'analytics' },
};

/* ─── Tabs Configuration ─── */
const TABS = [
  { key: 'all', label: 'All Events', icon: FileText, activeClass: 'border-slate-600 bg-slate-50 text-slate-700', badgeClass: 'bg-slate-200 text-slate-800' },
  { key: 'financial', label: 'Financial', icon: IndianRupee, activeClass: 'border-green-600 bg-green-50 text-green-700', badgeClass: 'bg-green-200 text-green-800' },
  { key: 'entity', label: 'Entity Mgmt', icon: User, activeClass: 'border-blue-600 bg-blue-50 text-blue-700', badgeClass: 'bg-blue-200 text-blue-800' },
  { key: 'operational', label: 'Operations', icon: Activity, activeClass: 'border-purple-600 bg-purple-50 text-purple-700', badgeClass: 'bg-purple-200 text-purple-800' },
  { key: 'security', label: 'Security', icon: Shield, activeClass: 'border-red-600 bg-red-50 text-red-700', badgeClass: 'bg-red-200 text-red-800' },
  { key: 'system', label: 'System', icon: Settings, activeClass: 'border-slate-600 bg-slate-50 text-slate-700', badgeClass: 'bg-slate-200 text-slate-800' },
];

/* ─── Severity Badge ─── */
function SeverityBadge({ severity }) {
  const config = {
    info: { color: 'bg-blue-100 text-blue-700', label: 'INFO' },
    warning: { color: 'bg-amber-100 text-amber-700', label: 'WARNING' },
    critical: { color: 'bg-red-100 text-red-700', label: 'CRITICAL' },
  };
  const s = config[severity] || config.info;
  return <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${s.color}`}>{s.label}</span>;
}

/* ─── Log Card ─── */
function LogCard({ log, onEntityClick, onIPClick }) { // 🔥 Phase 2.3: Add entity & IP click handlers
  const config = ACTION_CONFIG[log.action] || {
    icon: FileText,
    color: 'text-slate-600',
    bg: 'bg-slate-100',
    label: log.action || 'Action',
    category: 'system',
  };
  const Icon = config.icon;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Severity stripe */}
      <div
        className={`h-1 ${
          log.severity === 'critical' ? 'bg-red-500' : log.severity === 'warning' ? 'bg-amber-400' : 'bg-blue-500'
        }`}
      />
      <div className="p-3">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={`w-9 h-9 rounded-lg ${config.bg} flex items-center justify-center flex-shrink-0`}>
            <Icon className={`w-4 h-4 ${config.color}`} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Header row */}
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-semibold text-slate-900 text-sm">{config.label}</span>
              {log.severity && log.severity !== 'info' && <SeverityBadge severity={log.severity} />}
              {log.requiresReview && (
                <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-purple-100 text-purple-700">REVIEW</span>
              )}
            </div>

            {/* Entity link */}
            {(log.entityName || log.traderName) && (
              <div className="flex items-center gap-1.5 mb-1">
                {/* New schema */}
                {log.entityType === 'trader' && log.entityId ? (
                  <Link
                    to={`/admin/traders/${log.entityId}`}
                    className="text-xs text-indigo-600 font-semibold flex items-center gap-1 hover:underline"
                  >
                    <User className="w-3 h-3" /> {log.entityName}
                  </Link>
                ) : log.entityType === 'merchant' && log.entityId ? (
                  <Link
                    to={`/admin/merchants/${log.entityId}`}
                    className="text-xs text-indigo-600 font-semibold flex items-center gap-1 hover:underline"
                  >
                    <User className="w-3 h-3" /> {log.entityName}
                  </Link>
                ) : /* Old schema - backward compatibility */
                log.traderId && log.traderName ? (
                  <Link
                    to={`/admin/traders/${log.traderId}`}
                    className="text-xs text-indigo-600 font-semibold flex items-center gap-1 hover:underline"
                  >
                    <User className="w-3 h-3" /> {log.traderName}
                  </Link>
                ) : log.entityName ? (
                  <span className="text-xs text-slate-600 font-semibold flex items-center gap-1">
                    {log.entityType && <span className="capitalize">{log.entityType}:</span>} {log.entityName}
                  </span>
                ) : log.traderName ? (
                  <span className="text-xs text-slate-600 font-semibold flex items-center gap-1">
                    Trader: {log.traderName}
                  </span>
                ) : null}
              </div>
            )}

            {/* Amount (for financial actions) */}
            {(log.details?.amount || log.amount) && (
              <p className="text-sm font-bold text-green-600 mb-1">
                ₹{Number(log.details?.amount || log.amount).toLocaleString()}
              </p>
            )}

            {/* Balance change (before/after) */}
            {log.balanceBefore !== null && log.balanceBefore !== undefined && 
             log.balanceAfter !== null && log.balanceAfter !== undefined && (
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                <span>
                  Balance: ₹{Number(log.balanceBefore).toLocaleString()} → ₹{Number(log.balanceAfter).toLocaleString()}
                </span>
                <span
                  className={`font-bold ${
                    Number(log.balanceAfter) > Number(log.balanceBefore) ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {Number(log.balanceAfter) > Number(log.balanceBefore) ? '+' : ''}
                  ₹{Math.abs(Number(log.balanceAfter) - Number(log.balanceBefore)).toLocaleString()}
                </span>
              </div>
            )}

            {/* Before/After (generic state change) */}
            {log.details?.before && log.details?.after && (
              <div className="text-xs text-slate-500 mb-1">
                <span className="font-semibold">Changed:</span> {log.details.before} → {log.details.after}
              </div>
            )}

            {/* Note */}
            {(log.details?.note || log.note) && (
              <p className="text-xs text-slate-500 line-clamp-2 mb-1">{log.details?.note || log.note}</p>
            )}

            {/* Metadata summary */}
            {log.details?.metadata && (
              <div className="text-xs text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                {Object.entries(log.details.metadata).map(([key, value]) => (
                  <span key={key} className="bg-slate-50 px-2 py-0.5 rounded">
                    <span className="font-semibold">{key}:</span> {String(value).slice(0, 30)}
                  </span>
                ))}
              </div>
            )}

            {/* Footer: Performer + Timestamp + IP + Drill-Down */}
            <div className="flex items-center justify-between gap-3 text-xs text-slate-400 mt-2 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  <span className="font-semibold">{log.performedByName || 'Unknown'}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {log.createdAt?.seconds
                    ? new Date(log.createdAt.seconds * 1000).toLocaleString('en-IN', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })
                    : '—'}
                </div>
                {/* 🔥 Phase 2.3: IP Address (clickable to filter) */}
                {log.performedByIp && log.performedByIp !== 'unknown' && onIPClick && (
                  <button
                    onClick={() => onIPClick(log.performedByIp)}
                    className="flex items-center gap-1 px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded font-mono transition-colors"
                    title="Click to filter by this IP"
                  >
                    <Globe className="w-3 h-3" />
                    {log.performedByIp}
                  </button>
                )}
                {log.source && log.source !== 'admin_panel' && (
                  <span className="px-1.5 py-0.5 bg-slate-100 rounded text-xs font-semibold">{log.source}</span>
                )}
              </div>
              
              {/* 🔥 Phase 2.3: Drill-Down Button */}
              {log.entityType && log.entityId && log.entityName && onEntityClick && (
                <button
                  onClick={() => onEntityClick(log.entityType, log.entityId, log.entityName)}
                  className="flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg font-semibold transition-colors whitespace-nowrap text-xs"
                  title={`Show all logs for this ${log.entityType}`}
                >
                  <Filter className="w-3 h-3" />
                  Show All
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Constants ─── */
const PAGE_SIZE = 50;

/* ─── Main Component ─── */
export default function AdminLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [entityTypeFilter, setEntityTypeFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [datePreset, setDatePreset] = useState('all');

  // Map Supabase row → camelCase for LogCard compatibility
  const mapLog = (row) => ({
    ...row,
    createdAt: row.created_at ? { seconds: new Date(row.created_at).getTime() / 1000 } : null,
    entityType: row.entity_type,
    entityId: row.entity_id,
    entityName: row.entity_name,
    performedBy: row.performed_by,
    performedByName: row.performed_by_name,
    performedByRole: row.performed_by_role,
    performedByIp: row.performed_by_ip,
    balanceBefore: row.balance_before,
    balanceAfter: row.balance_after,
    requiresReview: row.requires_review,
  });

  // Initial load
  const fetchLogs = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('admin_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .range(0, PAGE_SIZE - 1);
      if (fetchError) throw fetchError;
      const mapped = (data || []).map(mapLog);
      setLogs(mapped);
      setHasMore((data || []).length === PAGE_SIZE);
    } catch (err) {
      console.error('AdminLogs fetch error:', err);
      setError(err.message || 'Failed to load audit logs');
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Load more logs (offset-based pagination)
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    
    setLoadingMore(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('admin_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .range(logs.length, logs.length + PAGE_SIZE - 1);
      if (fetchError) throw fetchError;
      const newLogs = (data || []).map(mapLog);
      setLogs((prev) => [...prev, ...newLogs]);
      setHasMore(newLogs.length === PAGE_SIZE);
    } catch (err) {
      console.error('Load more error:', err);
      setError('Failed to load more logs');
    }
    setLoadingMore(false);
  }, [logs.length, loadingMore, hasMore]);

  // 🔥 Phase 2.1: Debounced search (300ms delay like trader panels)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // 🔥 Phase 2.1: Date preset handler
  const applyDatePreset = (preset) => {
    setDatePreset(preset);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (preset) {
      case 'today':
        setDateFrom(today.toISOString().split('T')[0]);
        setDateTo(today.toISOString().split('T')[0]);
        break;
      case 'week':
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        setDateFrom(weekAgo.toISOString().split('T')[0]);
        setDateTo(today.toISOString().split('T')[0]);
        break;
      case 'month':
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        setDateFrom(monthAgo.toISOString().split('T')[0]);
        setDateTo(today.toISOString().split('T')[0]);
        break;
      case 'all':
      default:
        setDateFrom('');
        setDateTo('');
        break;
    }
  };

  // Filter logs by tab + search + filters
  const filtered = useMemo(() => {
    let result = logs;

    // Tab filter (category)
    if (activeTab !== 'all') {
      result = result.filter((l) => {
        const config = ACTION_CONFIG[l.action];
        return config?.category === activeTab || l.category === activeTab;
      });
    }

    // Action type filter
    if (actionFilter !== 'all') {
      result = result.filter((l) => l.action === actionFilter);
    }

    // Severity filter
    if (severityFilter !== 'all') {
      result = result.filter((l) => l.severity === severityFilter);
    }

    // 🔥 Phase 2.2: Entity type filter
    if (entityTypeFilter !== 'all') {
      result = result.filter((l) => l.entityType === entityTypeFilter);
    }

    // 🔥 Phase 2.1: Enhanced search (debounced, includes IP address)
    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase();
      result = result.filter(
        (l) =>
          l.entityName?.toLowerCase().includes(s) ||
          l.traderName?.toLowerCase().includes(s) ||
          l.performedByName?.toLowerCase().includes(s) ||
          l.action?.toLowerCase().includes(s) ||
          l.details?.note?.toLowerCase().includes(s) ||
          l.note?.toLowerCase().includes(s) ||
          l.performedByIp?.toLowerCase().includes(s) || // 🔥 IP address search
          l.entityId?.toLowerCase().includes(s) // 🔥 Entity ID search
      );
    }

    // Date range filter
    if (dateFrom) {
      result = result.filter((l) => (l.createdAt?.seconds || 0) * 1000 >= new Date(dateFrom).getTime());
    }
    if (dateTo) {
      result = result.filter((l) => (l.createdAt?.seconds || 0) * 1000 <= new Date(dateTo).getTime() + 86399999);
    }

    return result;
  }, [logs, activeTab, actionFilter, severityFilter, entityTypeFilter, debouncedSearch, dateFrom, dateTo]);

  // Get unique action types for filter dropdown
  const actionTypes = useMemo(() => {
    const types = new Set(logs.map((l) => l.action).filter(Boolean));
    return Array.from(types).sort();
  }, [logs]);

  // 🔥 Phase 2.2: Get unique entity types for filter dropdown
  const entityTypes = useMemo(() => {
    const types = new Set(logs.map((l) => l.entityType).filter(Boolean));
    return Array.from(types).sort();
  }, [logs]);

  // Memoized tab counts for performance
  const tabCounts = useMemo(() => {
    const counts = { all: logs.length };
    TABS.forEach((tab) => {
      if (tab.key !== 'all') {
        counts[tab.key] = logs.filter((l) => {
          const config = ACTION_CONFIG[l.action];
          return config?.category === tab.key || l.category === tab.key;
        }).length;
      }
    });
    return counts;
  }, [logs]);

  // 🧪 TEST: Create a test log entry (remove in production)
  const createTestLog = async () => {
    try {
      await logAuditEvent({
        action: 'settings_changed',
        category: 'system',
        entityType: 'system',
        entityId: 'test',
        entityName: 'Test Log Entry',
        details: {
          note: 'This is a test log created from AdminLogs page',
          before: 'old_value',
          after: 'new_value',
        },
        severity: 'info',
      });
      alert('✅ Test log created! It should appear in the list.');
    } catch (err) {
      alert('❌ Failed to create test log: ' + err.message);
      console.error(err);
    }
  };

  // Export filtered logs as CSV
  const handleExport = async () => {
    // Helper to escape CSV fields (wrap in quotes if contains comma, quote, or newline)
    const escapeCSV = (val) => {
      const str = String(val ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csv = [
      ['Date', 'Action', 'Category', 'Entity', 'Performer', 'Amount', 'Note', 'Severity'],
      ...filtered.map((l) => [
        l.createdAt?.seconds ? new Date(l.createdAt.seconds * 1000).toISOString() : '',
        l.action || '',
        l.category || '',
        l.entityName || l.traderName || '',
        l.performedByName || '',
        l.details?.amount || l.amount || '',
        l.details?.note || l.note || '',
        l.severity || 'info',
      ]),
    ]
      .map((r) => r.map(escapeCSV).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `admin-logs-${activeTab}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    // 🔥 AUDIT LOG: CSV Export (Week 4 - Security Logs)
    await logDataExported(
      'audit_logs',
      filtered.length,
      {
        tab: activeTab,
        dateFrom: dateFrom || 'all',
        dateTo: dateTo || 'all',
        severity: severityFilter,
        searchQuery: search || 'none',
      }
    );
  };

  // Clear all filters
  const clearFilters = () => {
    setSearch('');
    setActionFilter('all');
    setSeverityFilter('all');
    setEntityTypeFilter('all'); // 🔥 Phase 2.2
    setDateFrom('');
    setDateTo('');
    setDatePreset('all'); // 🔥 Phase 2.1
  };

  const hasActiveFilters = search || actionFilter !== 'all' || severityFilter !== 'all' || entityTypeFilter !== 'all' || dateFrom || dateTo;

  // 🔥 Phase 2.3: Drill-down - Filter by entity
  const handleEntityClick = (entityType, entityId, entityName) => {
    setEntityTypeFilter(entityType);
    setSearch(entityName); // Search by name to show all related logs
    setShowFilters(false); // Close filters panel
    window.scrollTo({ top: 0, behavior: 'smooth' }); // Scroll to top to see results
  };

  // 🔥 Phase 2.3: Drill-down - Filter by IP
  const handleIPClick = (ip) => {
    setSearch(ip);
    setShowFilters(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Header - Desktop */}
      <div className="hidden sm:flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-slate-600 to-slate-700 rounded-xl shadow-sm">
              <FileText className="w-5 h-5 text-white" />
            </div>
            Audit Logs
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 ml-11">
            Complete audit trail of all platform activities
          </p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 text-sm font-semibold active:scale-[0.97] transition-all"
        >
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Header - Mobile */}
      <div className="flex sm:hidden items-center justify-between">
        <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <FileText className="w-5 h-5 text-slate-600" />
          Audit Logs
        </h1>
        <div className="flex gap-2">
          <button
            onClick={createTestLog}
            className="px-3 py-2 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold hover:bg-indigo-200"
          >
            🧪 Test
          </button>
          <button
            onClick={handleExport}
            className="w-9 h-9 flex items-center justify-center bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
            title="Export CSV"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 🧪 TEST BANNER - Remove in production */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between">
        <p className="text-sm text-amber-700">
          <span className="font-semibold">Debug:</span> {logs.length} logs loaded, {error ? `Error: ${error}` : 'No errors'}
        </p>
        <button
          onClick={createTestLog}
          className="px-3 py-1.5 bg-amber-200 text-amber-800 rounded-lg text-xs font-bold hover:bg-amber-300"
        >
          🧪 Create Test Log
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            const count = tabCounts[tab.key] || 0;

            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 px-4 py-3 border-b-2 transition-all ${
                  isActive
                    ? tab.activeClass
                    : 'border-transparent hover:bg-slate-50 text-slate-500'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="font-semibold text-sm">{tab.label}</span>
                {count > 0 && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      isActive ? tab.badgeClass : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 🔥 Phase 2.2: Severity Quick Filters (Pills) */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs font-bold text-slate-500">Quick Filters:</span>
        <button
          onClick={() => setSeverityFilter(severityFilter === 'info' ? 'all' : 'info')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            severityFilter === 'info'
              ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-300'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <CheckCircle className="w-3 h-3 inline mr-1" />
          Info
        </button>
        <button
          onClick={() => setSeverityFilter(severityFilter === 'warning' ? 'all' : 'warning')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            severityFilter === 'warning'
              ? 'bg-amber-100 text-amber-700 ring-2 ring-amber-300'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <AlertTriangle className="w-3 h-3 inline mr-1" />
          Warning
        </button>
        <button
          onClick={() => setSeverityFilter(severityFilter === 'critical' ? 'all' : 'critical')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            severityFilter === 'critical'
              ? 'bg-red-100 text-red-700 ring-2 ring-red-300'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <AlertCircle className="w-3 h-3 inline mr-1" />
          Critical
        </button>
        <div className="h-4 w-px bg-slate-300"></div>
        {/* 🔥 Phase 2.1: Date Presets */}
        <button
          onClick={() => applyDatePreset('today')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            datePreset === 'today'
              ? 'bg-purple-100 text-purple-700 ring-2 ring-purple-300'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Today
        </button>
        <button
          onClick={() => applyDatePreset('week')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            datePreset === 'week'
              ? 'bg-purple-100 text-purple-700 ring-2 ring-purple-300'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          This Week
        </button>
        <button
          onClick={() => applyDatePreset('month')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            datePreset === 'month'
              ? 'bg-purple-100 text-purple-700 ring-2 ring-purple-300'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          This Month
        </button>
      </div>

      {/* Search + Filters */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search entity, performer, action, note, IP..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
          />
          {search && search !== debouncedSearch && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
              Searching...
            </span>
          )}
          {search && search === debouncedSearch && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`w-10 h-10 flex items-center justify-center rounded-xl border flex-shrink-0 transition-all ${
            showFilters || hasActiveFilters
              ? 'bg-slate-100 border-slate-300 text-slate-700'
              : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
          }`}
        >
          <Filter className="w-4 h-4" />
        </button>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="px-3 py-2 bg-red-50 text-red-600 rounded-xl text-xs font-semibold hover:bg-red-100 active:scale-[0.97] transition-all flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {/* Expanded Filters */}
      {showFilters && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Date From */}
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">
                <Calendar className="w-3 h-3 inline mr-1" />
                From Date
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>

            {/* Date To */}
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">
                <Calendar className="w-3 h-3 inline mr-1" />
                To Date
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>

            {/* Severity Filter */}
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">
                <AlertTriangle className="w-3 h-3 inline mr-1" />
                Severity
              </label>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-slate-400"
              >
                <option value="all">All Severities</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          {/* Action Type Filter */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">
              <Activity className="w-3 h-3 inline mr-1" />
              Action Type
            </label>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-slate-400"
            >
              <option value="all">All Actions ({actionTypes.length})</option>
              {actionTypes.map((type) => (
                <option key={type} value={type}>
                  {ACTION_CONFIG[type]?.label || type}
                </option>
              ))}
            </select>
          </div>

          {/* 🔥 Phase 2.2: Entity Type Filter */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">
              <User className="w-3 h-3 inline mr-1" />
              Entity Type
            </label>
            <select
              value={entityTypeFilter}
              onChange={(e) => setEntityTypeFilter(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-slate-400"
            >
              <option value="all">All Entity Types ({entityTypes.length})</option>
              {entityTypes.map((type) => (
                <option key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Results count */}
      <div className="flex items-center justify-between text-sm">
        <p className="text-slate-500">
          Showing <span className="font-bold text-slate-900">{filtered.length}</span> of{' '}
          <span className="font-bold text-slate-900">{logs.length}</span> logs
          {hasMore && <span className="text-slate-400"> (more available)</span>}
        </p>
        {loading && (
          <div className="flex items-center gap-2 text-slate-400">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Loading...
          </div>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-red-700">Failed to load audit logs</p>
            <p className="text-sm text-red-600">{error}</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm font-semibold hover:bg-red-200"
          >
            Retry
          </button>
        </div>
      )}

      {/* Log Cards */}
      {loading && logs.length === 0 ? (
        <div className="flex items-center justify-center py-12 bg-white rounded-xl border border-slate-200">
          <RefreshCw className="w-8 h-8 text-slate-500 animate-spin" />
        </div>
      ) : filtered.length > 0 ? (
        <>
          <div className="space-y-2.5">
            {filtered.map((log) => (
              <LogCard 
                key={log.id} 
                log={log} 
                onEntityClick={handleEntityClick} 
                onIPClick={handleIPClick}
              />
            ))}
          </div>

          {/* Load More Button */}
          {hasMore && !debouncedSearch && actionFilter === 'all' && severityFilter === 'all' && entityTypeFilter === 'all' && !dateFrom && !dateTo && (
            <div className="flex justify-center pt-4">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="px-6 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-200 disabled:opacity-50 flex items-center gap-2 active:scale-[0.97] transition-all"
              >
                {loadingMore ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Loading more...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Load More Logs
                  </>
                )}
              </button>
            </div>
          )}

          {/* Info when filters prevent load more */}
          {hasMore && (debouncedSearch || actionFilter !== 'all' || severityFilter !== 'all' || entityTypeFilter !== 'all' || dateFrom || dateTo) && (
            <p className="text-center text-xs text-slate-400 pt-2">
              Clear filters to load more logs
            </p>
          )}
        </>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <FileText className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No logs found</p>
          <p className="text-slate-400 text-sm mt-1">
            {logs.length === 0 ? 'No audit logs exist yet. Actions like balance changes, status updates, etc. will appear here.' : 'Try adjusting your filters'}
          </p>
          {logs.length === 0 && (
            <button
              onClick={createTestLog}
              className="mt-4 px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg text-sm font-semibold hover:bg-indigo-200"
            >
              🧪 Create Test Log
            </button>
          )}
        </div>
      )}
    </div>
  );
}
