import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../../../supabase';
import { useRealtimeSubscription } from '../../../hooks/useRealtimeSubscription';
import { useSearchParams, Link } from 'react-router-dom';
import {
  TrendingDown, Download, RefreshCw, User, Calendar, Clock,
  CheckCircle, XCircle, AlertCircle, X, Loader, Cpu, ChevronRight,
  ArrowUpDown, ArrowUp, ArrowDown, Volume2, VolumeX, Radio,
  ChevronLeft, IndianRupee, CheckSquare, Square, Trash2, RotateCcw,
} from 'lucide-react';

// Shared components
import { Toast, SearchInput, CardSkeleton } from '../../../components/admin';

// Extracted components
import PayoutCard, { WaitingRequestCard } from './components/PayoutCard';
import PayoutDetailsModal from './components/PayoutDetailsModal';

/* ─── Main Component ─── */
export default function AdminPayouts() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [adminId, setAdminId] = useState(null);

  const [payouts, setPayouts] = useState([]);
  const [traders, setTraders] = useState({}); // trader_id -> trader data
  const [waitingRequests, setWaitingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState('assigned');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [modalType, setModalType] = useState('payout');
  const [statusFilter, setStatusFilter] = useState('all');
  
  // New states for enhanced features
  const [amountFilter, setAmountFilter] = useState('all'); // all, <5k, 5k-20k, >20k
  const [sortBy, setSortBy] = useState('date'); // date, amount
  const [sortOrder, setSortOrder] = useState('desc'); // asc, desc
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('payoutSoundEnabled') !== 'false');
  const [page, setPage] = useState(1);
  const pageSize = 30;
  
  const audioRef = useRef(null);
  const traderFilter = searchParams.get('trader');
  const merchantFilter = searchParams.get('merchant');

  // Get admin ID from Supabase auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAdminId(session?.user?.id || null);
    });
  }, []);

  // Fetch payouts with trader join
  const fetchPayouts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let q = supabase.from('payouts').select('*').limit(500);
      if (traderFilter) {
        q = q.eq('trader_id', traderFilter);
      }
      if (merchantFilter) {
        q = q.eq('merchant_id', merchantFilter);
      }

      const { data, error: fetchError } = await q;
      if (fetchError) throw fetchError;

      const list = data || [];
      
      // Fetch trader names for all unique trader_ids
      const traderIds = [...new Set(list.map(p => p.trader_id).filter(Boolean))];
      if (traderIds.length > 0) {
        const { data: traderData } = await supabase
          .from('traders')
          .select('id, name, phone')
          .in('id', traderIds);
        
        const traderMap = {};
        (traderData || []).forEach(t => { traderMap[t.id] = t; });
        setTraders(traderMap);
      }

      setPayouts(list);
    } catch (err) {
      setError(`Failed to load payouts: ${err.message}`);
    }
    setLoading(false);
  }, [traderFilter, merchantFilter]);

  useEffect(() => {
    fetchPayouts();
  }, [fetchPayouts]);

  // Play sound on new payout
  const playNotificationSound = useCallback(() => {
    if (soundEnabled && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  }, [soundEnabled]);

  // Toggle sound and persist
  const toggleSound = () => {
    const newValue = !soundEnabled;
    setSoundEnabled(newValue);
    localStorage.setItem('payoutSoundEnabled', newValue.toString());
  };

  // Realtime subscription
  useRealtimeSubscription('payouts', {
    filter: statusFilter !== 'all' ? `status=eq.${statusFilter}` : undefined,
    onInsert: (newPayout) => {
      setPayouts(prev => [newPayout, ...prev].slice(0, 500));
      setToast({ type: 'info', message: `New payout: ₹${newPayout.amount?.toLocaleString()}` });
      playNotificationSound();
    },
    onUpdate: (updated) => {
      setPayouts(prev => prev.map(p => p.id === updated.id ? updated : p));
    },
  });

  // Fetch waiting requests
  const fetchWaitingRequests = useCallback(async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('payout_requests')
        .select('*')
        .limit(50);

      if (fetchError) throw fetchError;

      const requests = [];
      for (const row of (data || [])) {
        const isWaiting =
          (row.status === 'waiting') ||
          (row.status === 'partially_assigned') ||
          (row.in_waiting_list === true) ||
          (row.remaining_amount > 0 && row.status !== 'completed' && row.status !== 'cancelled');

        if (!isWaiting) continue;

        if (row.trader_id) {
          try {
            const { data: traderData } = await supabase
              .from('traders')
              .select('*')
              .eq('id', row.trader_id)
              .single();
            if (traderData) row.trader = traderData;
          } catch (_err) {}
        }

        requests.push(row);
      }

      requests.sort((a, b) => {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return timeA - timeB;
      });

      setWaitingRequests(requests);
    } catch (_err) {}
  }, []);

  useEffect(() => {
    fetchWaitingRequests();
  }, [fetchWaitingRequests]);

  // Computed Data
  const assignedPayouts = useMemo(() => payouts.filter(p => p.status === 'assigned'), [payouts]);
  const pendingPayouts = useMemo(() => payouts.filter(p => p.status === 'pending' || !p.status), [payouts]);
  const completedPayouts = useMemo(() => payouts.filter(p => p.status === 'completed'), [payouts]);
  const cancelledPayouts = useMemo(() => payouts.filter(p => 
    p.status === 'cancelled' || p.status === 'cancelled_by_trader' || p.status === 'failed'
  ), [payouts]);
  const overduePayouts = useMemo(() => {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    return assignedPayouts.filter(p => {
      const assignedTime = p.assigned_at ? new Date(p.assigned_at).getTime() : 0;
      return assignedTime > 0 && assignedTime < oneHourAgo;
    });
  }, [assignedPayouts]);

  // Stats
  const stats = useMemo(() => ({
    waiting: waitingRequests.length,
    waitingAmount: waitingRequests.reduce((sum, r) => sum + (Number(r.remaining_amount) || Number(r.amount) || 0), 0),
    pending: pendingPayouts.length,
    pendingAmount: pendingPayouts.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
    assigned: assignedPayouts.length,
    assignedAmount: assignedPayouts.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
    overdue: overduePayouts.length,
    overdueAmount: overduePayouts.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
    cancelled: cancelledPayouts.length,
    cancelledAmount: cancelledPayouts.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
    completed: completedPayouts.length,
    completedAmount: completedPayouts.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
    total: payouts.length,
  }), [waitingRequests, pendingPayouts, assignedPayouts, overduePayouts, cancelledPayouts, completedPayouts, payouts]);

  // Get Current Tab Data with all filters
  const currentData = useMemo(() => {
    let data = [];
    switch (activeTab) {
      case 'waiting': return waitingRequests;
      case 'pending': data = pendingPayouts; break;
      case 'assigned': data = assignedPayouts; break;
      case 'overdue': data = overduePayouts; break;
      case 'cancelled': data = cancelledPayouts; break;
      case 'completed': data = completedPayouts; break;
      case 'all': data = payouts; break;
      default: data = assignedPayouts;
    }
    
    // Search filter
    if (search) {
      const s = search.toLowerCase();
      data = data.filter(p => 
        p.id?.toLowerCase().includes(s) || 
        p.utr?.toLowerCase().includes(s) || 
        p.trader_id?.toLowerCase().includes(s) || 
        p.merchant_id?.toLowerCase().includes(s) ||
        p.upi_id?.toLowerCase().includes(s) || 
        p.account_number?.toLowerCase().includes(s) ||
        p.amount?.toString().includes(s) ||
        traders[p.trader_id]?.name?.toLowerCase().includes(s)
      );
    }
    
    // Date filter
    if (dateFrom) {
      const fromTime = new Date(dateFrom).getTime();
      data = data.filter(p => {
        const time = (p.created_at || p.assigned_at) ? new Date(p.created_at || p.assigned_at).getTime() : 0;
        return time >= fromTime;
      });
    }
    if (dateTo) {
      const toTime = new Date(dateTo).getTime() + 86399999;
      data = data.filter(p => {
        const time = (p.created_at || p.assigned_at) ? new Date(p.created_at || p.assigned_at).getTime() : 0;
        return time <= toTime;
      });
    }
    
    // Amount filter
    if (amountFilter !== 'all') {
      data = data.filter(p => {
        const amt = Number(p.amount) || 0;
        if (amountFilter === '<5k') return amt < 5000;
        if (amountFilter === '5k-20k') return amt >= 5000 && amt <= 20000;
        if (amountFilter === '>20k') return amt > 20000;
        return true;
      });
    }
    
    // Sorting
    data = [...data].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'amount') {
        cmp = (Number(a.amount) || 0) - (Number(b.amount) || 0);
      } else {
        const timeA = new Date(a.created_at || a.assigned_at || 0).getTime();
        const timeB = new Date(b.created_at || b.assigned_at || 0).getTime();
        cmp = timeA - timeB;
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
    
    return data;
  }, [activeTab, waitingRequests, pendingPayouts, assignedPayouts, overduePayouts, cancelledPayouts, completedPayouts, payouts, search, dateFrom, dateTo, amountFilter, sortBy, sortOrder, traders]);

  // Paginated data
  const paginatedData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return currentData.slice(start, start + pageSize);
  }, [currentData, page, pageSize]);

  const totalPages = Math.ceil(currentData.length / pageSize);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [activeTab, search, dateFrom, dateTo, amountFilter]);

  // Filtered stats for summary bar
  const filteredStats = useMemo(() => ({
    count: currentData.length,
    amount: currentData.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
  }), [currentData]);

  const handleViewDetails = (item, type = 'payout') => { 
    setSelectedItem(item); 
    setModalType(type); 
  };

  // Click-to-filter handlers
  const handleFilterByTrader = (traderId) => {
    setSearchParams({ trader: traderId });
  };
  
  const handleFilterByMerchant = (merchantId) => {
    setSearchParams({ merchant: merchantId });
  };
  
  const clearEntityFilter = () => {
    setSearchParams({});
  };

  // Selection handlers
  const toggleSelection = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === paginatedData.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedData.map(p => p.id)));
    }
  };

  const handleRemovePayout = async (payout) => {
    if (!window.confirm(`⚠️ Permanently remove payout?\n\nAmount: ₹${payout.amount?.toLocaleString()}\n\nThis cannot be undone.`)) return;
    setProcessing(true);
    try {
      const { error: deleteError } = await supabase.from('payouts').delete().eq('id', payout.id);
      if (deleteError) throw deleteError;
      setToast({ msg: '✅ Payout removed', success: true });
      fetchPayouts();
    } catch (err) {
      setToast({ msg: '❌ Error: ' + err.message, success: false });
    }
    setProcessing(false);
  };

  const handleReassignPayout = async (payout) => {
    if (!window.confirm(`Reassign payout to pool?\n\nAmount: ₹${payout.amount?.toLocaleString()}\n\nThis will make it available for assignment again.`)) return;
    setProcessing(true);
    try {
      const { error: updateError } = await supabase.from('payouts').update({ 
        status: 'pending', trader_id: null, assigned_at: null,
      }).eq('id', payout.id);
      if (updateError) throw updateError;
      setToast({ msg: '✅ Payout returned to pool', success: true });
      fetchPayouts();
    } catch (err) {
      setToast({ msg: '❌ Error: ' + err.message, success: false });
    }
    setProcessing(false);
  };

  // Bulk actions
  const handleBulkReassign = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Reassign ${selectedIds.size} payouts to pool?`)) return;
    setProcessing(true);
    try {
      const { error: updateError } = await supabase.from('payouts')
        .update({ status: 'pending', trader_id: null, assigned_at: null })
        .in('id', Array.from(selectedIds));
      if (updateError) throw updateError;
      setToast({ msg: `✅ ${selectedIds.size} payouts returned to pool`, success: true });
      setSelectedIds(new Set());
      fetchPayouts();
    } catch (err) {
      setToast({ msg: '❌ Error: ' + err.message, success: false });
    }
    setProcessing(false);
  };

  const handleBulkRemove = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`⚠️ Permanently remove ${selectedIds.size} payouts?\n\nThis cannot be undone.`)) return;
    setProcessing(true);
    try {
      const { error: deleteError } = await supabase.from('payouts').delete().in('id', Array.from(selectedIds));
      if (deleteError) throw deleteError;
      setToast({ msg: `✅ ${selectedIds.size} payouts removed`, success: true });
      setSelectedIds(new Set());
      fetchPayouts();
    } catch (err) {
      setToast({ msg: '❌ Error: ' + err.message, success: false });
    }
    setProcessing(false);
  };

  const handleCancelRequest = async (request) => {
    if (!window.confirm(`Cancel waiting request?\n\nTrader: ${request.trader?.name || request.trader_id}\nAmount: ₹${request.amount?.toLocaleString()}`)) return;
    setProcessing(true);
    try {
      await supabase.from('payouts').update({ payout_request_id: null }).eq('payout_request_id', request.id);
      const { error: deleteError } = await supabase.from('payout_requests').delete().eq('id', request.id);
      if (deleteError) throw deleteError;
      setToast({ msg: '✅ Request cancelled', success: true });
      fetchWaitingRequests();
    } catch (err) {
      setToast({ msg: '❌ Error: ' + err.message, success: false });
    }
    setProcessing(false);
  };

  const handleClearAllWaiting = async () => {
    if (!window.confirm(`⚠️ Clear ALL ${waitingRequests.length} waiting requests?`)) return;
    setProcessing(true);
    try {
      const requestIds = waitingRequests.map(r => r.id);
      for (const id of requestIds) {
        await supabase.from('payouts').update({ payout_request_id: null }).eq('payout_request_id', id);
      }
      const { error: deleteError } = await supabase.from('payout_requests').delete().in('id', requestIds);
      if (deleteError) throw deleteError;
      setToast({ msg: `✅ Cleared ${waitingRequests.length} waiting requests`, success: true });
      setWaitingRequests([]);
    } catch (err) {
      setToast({ msg: '❌ Error: ' + err.message, success: false });
    }
    setProcessing(false);
  };

  const handleExport = () => {
    const escapeCSV = (val) => {
      const str = String(val ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) return `"${str.replace(/"/g, '""')}"`;
      return str;
    };
    const exportData = activeTab === 'waiting' ? waitingRequests : currentData;
    const headers = activeTab === 'waiting' 
      ? ['ID', 'Trader ID', 'Trader Name', 'Amount', 'Status', 'Date'] 
      : ['ID', 'Amount', 'Status', 'Trader ID', 'Trader Name', 'Merchant ID', 'UPI/Account', 'UTR', 'Date'];
    const rows = exportData.map(item => activeTab === 'waiting'
      ? [item.id, item.trader_id || '', item.trader?.name || '', Number(item.amount) || 0, item.status || '', item.created_at || '']
      : [item.id, Number(item.amount) || 0, item.status || '', item.trader_id || '', traders[item.trader_id]?.name || '', item.merchant_id || '', item.upi_id || item.account_number || '', item.utr || '', item.created_at || '']);
    const csv = [headers, ...rows.map(r => r.map(escapeCSV))].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `payouts-${activeTab}-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // Tab configuration
  const tabs = [
    { key: 'waiting', label: 'Waiting', count: stats.waiting, icon: Loader, color: 'blue' },
    { key: 'pending', label: 'Pending', count: stats.pending, icon: Clock, color: 'slate' },
    { key: 'assigned', label: 'Assigned', count: stats.assigned, icon: User, color: 'amber' },
    { key: 'overdue', label: 'Overdue', count: stats.overdue, icon: AlertCircle, color: 'orange' },
    { key: 'cancelled', label: 'Cancelled', count: stats.cancelled, icon: XCircle, color: 'red' },
    { key: 'completed', label: 'Completed', count: stats.completed, icon: CheckCircle, color: 'green' },
  ];
  const tabColors = { 
    waiting: 'bg-blue-600', pending: 'bg-slate-600', assigned: 'bg-amber-600', 
    overdue: 'bg-orange-600', cancelled: 'bg-red-600', completed: 'bg-green-600', all: 'bg-purple-600',
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* Audio for notification sound */}
      <audio ref={audioRef} src="https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3" preload="auto" />
      
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      {selectedItem && <PayoutDetailsModal item={selectedItem} type={modalType} onClose={() => setSelectedItem(null)} traders={traders} />}

      {/* Header */}
      <div className="hidden sm:flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-sm"><TrendingDown className="w-5 h-5 text-white" /></div>
            Payout Management
            {/* Live indicator */}
            <span className="flex items-center gap-1.5 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold">
              <Radio className="w-3 h-3 animate-pulse" /> Live
            </span>
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 ml-11">
            {stats.total} total payouts • {stats.assigned} assigned • {stats.completed} completed
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Sound toggle */}
          <button onClick={toggleSound} className={`p-2 rounded-xl ${soundEnabled ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'}`} title={soundEnabled ? 'Sound On' : 'Sound Off'}>
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <Link to="/admin/payout-engine" className="flex items-center gap-1.5 px-3 py-2 bg-blue-100 text-blue-700 rounded-xl hover:bg-blue-200 text-sm font-medium">
            <Cpu className="w-4 h-4" /> Engine <ChevronRight className="w-3 h-3" />
          </Link>
          <button onClick={handleExport} className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 text-sm font-semibold"><Download className="w-4 h-4" /> Export</button>
          <button onClick={fetchPayouts} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 text-sm font-semibold"><RefreshCw className="w-4 h-4" /> Refresh</button>
        </div>
      </div>

      {/* Mobile Header */}
      <div className="flex sm:hidden items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold text-slate-900">Payouts ({stats.total})</h1>
          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-bold">
            <Radio className="w-2.5 h-2.5 animate-pulse" /> Live
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleSound} className={`p-2 rounded-xl ${soundEnabled ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'}`}>
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button onClick={handleExport} className="p-2 bg-slate-100 rounded-xl"><Download className="w-4 h-4 text-slate-600" /></button>
          <button onClick={fetchPayouts} className="p-2 bg-indigo-600 rounded-xl"><RefreshCw className="w-4 h-4 text-white" /></button>
        </div>
      </div>

      {/* Entity Filter Banner */}
      {(traderFilter || merchantFilter) && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-indigo-700">
            <User className="w-4 h-4" />
            <span className="font-semibold">Filtering by {traderFilter ? 'Trader' : 'Merchant'}:</span>
            <span className="font-mono text-xs bg-indigo-100 px-2 py-0.5 rounded">{traderFilter || merchantFilter}</span>
            {traders[traderFilter]?.name && <span className="text-indigo-600">({traders[traderFilter].name})</span>}
          </div>
          <button onClick={clearEntityFilter} className="text-indigo-600 hover:text-indigo-800 text-sm font-medium flex items-center gap-1">
            <X className="w-4 h-4" /> Clear
          </button>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-red-800">
            <span className="font-bold">Error:</span> {error}
            <button onClick={fetchPayouts} className="ml-2 underline">Retry</button>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-3 text-white">
          <p className="text-blue-100 text-xs mb-0.5">Waiting</p>
          <p className="text-2xl font-bold">{stats.waiting}</p>
          <p className="text-blue-200 text-xs">₹{(stats.waitingAmount / 1000).toFixed(0)}k</p>
        </div>
        <div className="bg-gradient-to-br from-slate-500 to-slate-600 rounded-xl p-3 text-white">
          <p className="text-slate-100 text-xs mb-0.5">Pending</p>
          <p className="text-2xl font-bold">{stats.pending}</p>
          <p className="text-slate-200 text-xs">₹{(stats.pendingAmount / 1000).toFixed(0)}k</p>
        </div>
        <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-3 text-white">
          <p className="text-amber-100 text-xs mb-0.5">Assigned</p>
          <p className="text-2xl font-bold">{stats.assigned}</p>
          <p className="text-amber-200 text-xs">₹{(stats.assignedAmount / 1000).toFixed(0)}k</p>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-3 text-white">
          <p className="text-orange-100 text-xs mb-0.5">Overdue</p>
          <p className="text-2xl font-bold">{stats.overdue}</p>
          <p className="text-orange-200 text-xs">₹{(stats.overdueAmount / 1000).toFixed(0)}k</p>
        </div>
        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-3 text-white">
          <p className="text-red-100 text-xs mb-0.5">Cancelled</p>
          <p className="text-2xl font-bold">{stats.cancelled}</p>
          <p className="text-red-200 text-xs">₹{(stats.cancelledAmount / 1000).toFixed(0)}k</p>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-3 text-white">
          <p className="text-green-100 text-xs mb-0.5">Completed</p>
          <p className="text-2xl font-bold">{stats.completed}</p>
          <p className="text-green-200 text-xs">₹{(stats.completedAmount / 100000).toFixed(1)}L</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${isActive ? `${tabColors[tab.key]} text-white shadow-md` : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
              <Icon className={`w-3.5 h-3.5 ${isActive && tab.key === 'waiting' ? 'animate-spin' : ''}`} />
              {tab.label}
              <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${isActive ? 'bg-white/20' : 'bg-slate-100 text-slate-600'}`}>{tab.count}</span>
            </button>
          );
        })}
      </div>

      {/* Search & Filters */}
      {activeTab !== 'waiting' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          {/* Search Row */}
          <div className="flex gap-2">
            <SearchInput value={search} onChange={setSearch} placeholder="Search ID, UTR, trader name, merchant, account, amount..." accentColor="indigo" className="flex-1" />
          </div>
          
          {/* Filters Row */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Date Presets */}
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: 'Today', getRange: () => { const t = new Date().toISOString().split('T')[0]; return [t, t]; } },
                { label: 'Yesterday', getRange: () => { const d = new Date(); d.setDate(d.getDate() - 1); const t = d.toISOString().split('T')[0]; return [t, t]; } },
                { label: 'Last 7 Days', getRange: () => { const t = new Date().toISOString().split('T')[0]; const d = new Date(); d.setDate(d.getDate() - 7); return [d.toISOString().split('T')[0], t]; } },
                { label: 'This Month', getRange: () => { const now = new Date(); const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]; return [start, now.toISOString().split('T')[0]]; } },
                { label: 'Last Month', getRange: () => { const now = new Date(); const start = new Date(now.getFullYear(), now.getMonth() - 1, 1); const end = new Date(now.getFullYear(), now.getMonth(), 0); return [start.toISOString().split('T')[0], end.toISOString().split('T')[0]]; } },
              ].map(preset => {
                const [pFrom, pTo] = preset.getRange();
                const isActive = dateFrom === pFrom && dateTo === pTo;
                return (
                  <button key={preset.label} onClick={() => { setDateFrom(pFrom); setDateTo(pTo); }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${isActive ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {preset.label}
                  </button>
                );
              })}
            </div>
            
            {/* Custom Date Range */}
            <div className="flex items-center gap-2 sm:ml-auto">
              <Calendar className="w-4 h-4 text-slate-400" />
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 w-32" />
              <span className="text-slate-400 text-xs">to</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 w-32" />
              {(dateFrom || dateTo) && (
                <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg" title="Clear dates">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          
          {/* Amount Filter & Sorting Row */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-slate-100">
            {/* Amount Range Pills */}
            <div className="flex items-center gap-2">
              <IndianRupee className="w-4 h-4 text-slate-400" />
              <div className="flex gap-1.5">
                {[
                  { label: 'All', value: 'all' },
                  { label: '< ₹5K', value: '<5k' },
                  { label: '₹5K-20K', value: '5k-20k' },
                  { label: '> ₹20K', value: '>20k' },
                ].map(opt => (
                  <button key={opt.value} onClick={() => setAmountFilter(opt.value)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${amountFilter === opt.value ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Sorting */}
            <div className="flex items-center gap-2 sm:ml-auto">
              <ArrowUpDown className="w-4 h-4 text-slate-400" />
              <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                <option value="date">Sort by Date</option>
                <option value="amount">Sort by Amount</option>
              </select>
              <button onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')} className="p-1.5 bg-slate-100 rounded-lg hover:bg-slate-200" title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}>
                {sortOrder === 'asc' ? <ArrowUp className="w-4 h-4 text-slate-600" /> : <ArrowDown className="w-4 h-4 text-slate-600" />}
              </button>
            </div>
          </div>
          
          {/* Active Filter Summary */}
          {(dateFrom || dateTo || search || amountFilter !== 'all') && (
            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <span className="text-xs text-slate-500">Filtering:</span>
              <div className="flex flex-wrap gap-1.5">
                {search && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium">
                    "{search.slice(0, 15)}{search.length > 15 ? '...' : ''}"
                    <button onClick={() => setSearch('')}><X className="w-3 h-3" /></button>
                  </span>
                )}
                {(dateFrom || dateTo) && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium">
                    {dateFrom && dateTo ? `${dateFrom} → ${dateTo}` : dateFrom ? `From ${dateFrom}` : `Until ${dateTo}`}
                    <button onClick={() => { setDateFrom(''); setDateTo(''); }}><X className="w-3 h-3" /></button>
                  </span>
                )}
                {amountFilter !== 'all' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                    Amount: {amountFilter}
                    <button onClick={() => setAmountFilter('all')}><X className="w-3 h-3" /></button>
                  </span>
                )}
              </div>
              <button onClick={() => { setSearch(''); setDateFrom(''); setDateTo(''); setAmountFilter('all'); }} className="ml-auto text-xs text-red-600 hover:text-red-700 font-medium">Clear All</button>
            </div>
          )}
        </div>
      )}

      {/* Filtered Summary Bar */}
      {activeTab !== 'waiting' && currentData.length > 0 && (
        <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
          <div className="flex items-center gap-4">
            <span className="text-sm font-semibold text-slate-700">
              Showing <span className="text-indigo-600">{currentData.length}</span> payouts
            </span>
            <span className="text-sm text-slate-500">•</span>
            <span className="text-sm font-semibold text-slate-700">
              Total: <span className="text-green-600">₹{filteredStats.amount.toLocaleString()}</span>
            </span>
          </div>
          
          {/* Bulk Actions */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{selectedIds.size} selected</span>
              <button onClick={handleBulkReassign} disabled={processing} className="flex items-center gap-1 px-2.5 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-xs font-semibold hover:bg-purple-200 disabled:opacity-50">
                <RotateCcw className="w-3.5 h-3.5" /> Reassign
              </button>
              <button onClick={handleBulkRemove} disabled={processing} className="flex items-center gap-1 px-2.5 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-semibold hover:bg-red-200 disabled:opacity-50">
                <Trash2 className="w-3.5 h-3.5" /> Remove
              </button>
              <button onClick={() => setSelectedIds(new Set())} className="p-1.5 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Bulk Select Header */}
      {activeTab !== 'waiting' && paginatedData.length > 0 && ['overdue', 'cancelled', 'pending', 'assigned'].includes(activeTab) && (
        <div className="flex items-center gap-3 px-1">
          <button onClick={selectAll} className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-700">
            {selectedIds.size === paginatedData.length ? <CheckSquare className="w-4 h-4 text-indigo-600" /> : <Square className="w-4 h-4" />}
            {selectedIds.size === paginatedData.length ? 'Deselect All' : 'Select All'}
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <CardSkeleton count={6} />
        </div>
      ) : activeTab === 'waiting' ? (
        currentData.length > 0 ? (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-start gap-2.5">
                <Loader className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5 animate-spin" />
                <div className="text-xs text-blue-800"><span className="font-bold">Waiting List:</span> Traders waiting for payouts. Auto-assigned when available.</div>
              </div>
              <button onClick={handleClearAllWaiting} disabled={processing} className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 text-xs font-semibold disabled:opacity-50">
                <X className="w-3.5 h-3.5" /> Clear All
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {currentData.map(request => <WaitingRequestCard key={request.id} request={request} onView={(r) => handleViewDetails(r, 'request')} onCancel={handleCancelRequest} />)}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <p className="text-slate-700 font-semibold">No Waiting Requests</p>
            <p className="text-xs text-slate-400 mt-1">All trader requests have been assigned!</p>
          </div>
        )
      ) : paginatedData.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {paginatedData.map(payout => (
            <PayoutCard 
              key={payout.id} 
              payout={payout}
              traderName={traders[payout.trader_id]?.name}
              selected={selectedIds.has(payout.id)}
              onToggleSelect={() => toggleSelection(payout.id)}
              showCheckbox={['overdue', 'cancelled', 'pending', 'assigned'].includes(activeTab)}
              onView={(p) => handleViewDetails(p, 'payout')}
              onRemove={['overdue', 'cancelled', 'pending'].includes(activeTab) ? handleRemovePayout : null}
              onReassign={['overdue', 'cancelled', 'assigned'].includes(activeTab) ? handleReassignPayout : null}
              onFilterByTrader={handleFilterByTrader}
              onFilterByMerchant={handleFilterByMerchant}
              showActions={['overdue', 'cancelled', 'assigned', 'pending'].includes(activeTab)} 
            />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          {activeTab === 'overdue' ? (
            <><CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" /><p className="text-slate-700 font-semibold">No Overdue Payouts</p><p className="text-xs text-slate-400 mt-1">All assigned payouts are being processed on time!</p></>
          ) : activeTab === 'cancelled' ? (
            <><CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" /><p className="text-slate-700 font-semibold">No Cancelled Payouts</p><p className="text-xs text-slate-400 mt-1">No payouts have been cancelled</p></>
          ) : activeTab === 'pending' ? (
            <><Clock className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-slate-700 font-semibold">No Pending Payouts</p><p className="text-xs text-slate-400 mt-1">All payouts have been assigned to traders</p></>
          ) : (
            <><TrendingDown className="w-12 h-12 text-slate-200 mx-auto mb-3" /><p className="text-slate-500 font-medium">No payouts found</p><p className="text-xs text-slate-400 mt-1">{search || dateFrom || dateTo || amountFilter !== 'all' ? 'Try adjusting your filters' : 'No data in this category'}</p></>
          )}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="flex items-center gap-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-slate-50">
            <ChevronLeft className="w-4 h-4" /> Prev
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) pageNum = i + 1;
              else if (page <= 3) pageNum = i + 1;
              else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
              else pageNum = page - 2 + i;
              return (
                <button key={pageNum} onClick={() => setPage(pageNum)}
                  className={`w-9 h-9 rounded-xl text-sm font-semibold ${page === pageNum ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                  {pageNum}
                </button>
              );
            })}
          </div>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="flex items-center gap-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-slate-50">
            Next <ChevronRight className="w-4 h-4" />
          </button>
          <span className="text-xs text-slate-400 ml-2">Page {page} of {totalPages}</span>
        </div>
      )}
    </div>
  );
}
