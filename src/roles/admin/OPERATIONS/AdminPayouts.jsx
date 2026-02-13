import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '../../../supabase';
import { useRealtimeSubscription } from '../../../hooks/useRealtimeSubscription';
import { useSearchParams } from 'react-router-dom';
import {
  TrendingDown, Filter, Download, RefreshCw, User, Calendar, Clock,
  CheckCircle, XCircle, AlertCircle, X, Loader,
} from 'lucide-react';

// Shared components
import { Toast, SearchInput, CardSkeleton } from '../../../components/admin';

// Extracted components
import PayoutCard, { WaitingRequestCard } from './components/PayoutCard';
import PayoutDetailsModal from './components/PayoutDetailsModal';

/* ─── Main Component ─── */
export default function AdminPayouts() {
  const [searchParams] = useSearchParams();
  const [adminId, setAdminId] = useState(null);

  const [payouts, setPayouts] = useState([]);
  const [waitingRequests, setWaitingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState('assigned');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [modalType, setModalType] = useState('payout');
  const [statusFilter, setStatusFilter] = useState('all');
  const traderFilter = searchParams.get('trader');

  // Get admin ID from Supabase auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAdminId(session?.user?.id || null);
    });
  }, []);

  // Fetch payouts
  const fetchPayouts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let q = supabase.from('payouts').select('*').limit(200);
      if (traderFilter) {
        q = q.eq('trader_id', traderFilter);
      }

      const { data, error: fetchError } = await q;
      if (fetchError) throw fetchError;

      const list = data || [];
      // Sort client-side by created_at or assigned_at (newest first)
      list.sort((a, b) => {
        const timeA = new Date(a.created_at || a.assigned_at || 0).getTime();
        const timeB = new Date(b.created_at || b.assigned_at || 0).getTime();
        return timeB - timeA;
      });

      setPayouts(list);
    } catch (err) {
      setError(`Failed to load payouts: ${err.message}`);
    }
    setLoading(false);
  }, [traderFilter]);

  useEffect(() => {
    fetchPayouts();
  }, [fetchPayouts]);

  // Realtime: filter by status to reduce load
  useRealtimeSubscription('payouts', {
    filter: statusFilter !== 'all' ? `status=eq.${statusFilter}` : undefined,
    onInsert: (newPayout) => {
      setPayouts(prev => [newPayout, ...prev].slice(0, 100)); // Keep limited
      setToast({ type: 'info', message: `New payout: ₹${newPayout.amount}` });
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

        // Lookup trader info if trader_id exists
        if (row.trader_id) {
          try {
            const { data: traderData } = await supabase
              .from('traders')
              .select('*')
              .eq('id', row.trader_id)
              .single();
            if (traderData) {
              row.trader = traderData;
            }
          } catch (_err) {
            // Trader lookup failed, continue without trader info
          }
        }

        requests.push(row);
      }

      // Sort by created_at (oldest first - FIFO)
      requests.sort((a, b) => {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return timeA - timeB;
      });

      setWaitingRequests(requests);
    } catch (_err) {
      // Don't set error state - waiting list is optional
    }
  }, []);

  useEffect(() => {
    fetchWaitingRequests();
  }, [fetchWaitingRequests]);

  // Computed Data
  const assignedPayouts = useMemo(() => {
    return payouts.filter(p => p.status === 'assigned');
  }, [payouts]);
  
  const pendingPayouts = useMemo(() => {
    return payouts.filter(p => p.status === 'pending' || !p.status);
  }, [payouts]);
  
  const completedPayouts = useMemo(() => {
    return payouts.filter(p => p.status === 'completed');
  }, [payouts]);
  
  const cancelledPayouts = useMemo(() => {
    return payouts.filter(p => 
      p.status === 'cancelled' || 
      p.status === 'cancelled_by_trader' ||
      p.status === 'failed'
    );
  }, [payouts]);

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

  // Get Current Tab Data
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
    
    if (search) {
      const s = search.toLowerCase();
      data = data.filter(p => 
        p.id?.toLowerCase().includes(s) || 
        p.utr?.toLowerCase().includes(s) || 
        p.trader_id?.toLowerCase().includes(s) || 
        p.merchant_id?.toLowerCase().includes(s) ||
        p.upi_id?.toLowerCase().includes(s) || 
        p.account_number?.toLowerCase().includes(s) ||
        p.amount?.toString().includes(s)
      );
    }
    
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
    
    return data;
  }, [activeTab, waitingRequests, pendingPayouts, assignedPayouts, overduePayouts, cancelledPayouts, completedPayouts, payouts, search, dateFrom, dateTo]);

  const handleViewDetails = (item, type = 'payout') => { 
    setSelectedItem(item); 
    setModalType(type); 
  };

  const handleRemovePayout = async (payout) => {
    if (!window.confirm(`⚠️ Permanently remove payout?\n\nAmount: ₹${payout.amount?.toLocaleString()}\n\nThis cannot be undone.`)) return;
    setProcessing(true);
    try {
      const { error: deleteError } = await supabase.from('payouts').delete().eq('id', payout.id);
      if (deleteError) throw deleteError;
      setToast({ msg: '✅ Payout removed', success: true });
      fetchPayouts(); // Refresh list
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
        status: 'pending', 
        trader_id: null, 
        assigned_at: null,
      }).eq('id', payout.id);
      if (updateError) throw updateError;
      setToast({ msg: '✅ Payout returned to pool', success: true });
      fetchPayouts(); // Refresh list
    } catch (err) {
      setToast({ msg: '❌ Error: ' + err.message, success: false });
    }
    setProcessing(false);
  };

  // Cancel a single waiting request
  const handleCancelRequest = async (request) => {
    if (!window.confirm(`Cancel waiting request?\n\nTrader: ${request.trader?.name || request.trader_id}\nAmount: ₹${request.amount?.toLocaleString()}\n\nLinked payouts will be unlinked but kept.`)) return;
    setProcessing(true);
    try {
      // Step 1: Unlink any payouts that reference this request
      await supabase.from('payouts').update({ payout_request_id: null }).eq('payout_request_id', request.id);
      
      // Step 2: Now delete the request
      const { error: deleteError } = await supabase.from('payout_requests').delete().eq('id', request.id);
      if (deleteError) throw deleteError;
      
      setToast({ msg: '✅ Request cancelled', success: true });
      fetchWaitingRequests();
    } catch (err) {
      setToast({ msg: '❌ Error: ' + err.message, success: false });
    }
    setProcessing(false);
  };

  // Clear all waiting requests
  const handleClearAllWaiting = async () => {
    if (!window.confirm(`⚠️ Clear ALL waiting requests?\n\nThis will cancel ${waitingRequests.length} pending requests.\nLinked payouts will be unlinked but kept.\n\nThis cannot be undone.`)) return;
    setProcessing(true);
    try {
      // Step 1: Get all request IDs
      const requestIds = waitingRequests.map(r => r.id);
      
      // Step 2: Unlink all payouts that reference these requests
      for (const id of requestIds) {
        await supabase.from('payouts').update({ payout_request_id: null }).eq('payout_request_id', id);
      }
      
      // Step 3: Delete all requests
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
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    
    const exportData = activeTab === 'waiting' ? waitingRequests : currentData;
    const headers = activeTab === 'waiting' 
      ? ['ID', 'Trader ID', 'Trader Name', 'Amount', 'Status', 'Date'] 
      : ['ID', 'Amount', 'Status', 'Trader ID', 'Merchant ID', 'UPI/Account', 'UTR', 'Date'];
    const rows = exportData.map(item => activeTab === 'waiting'
      ? [item.id, item.trader_id || '', item.trader?.name || '', Number(item.amount) || 0, item.status || '', item.created_at || '']
      : [item.id, Number(item.amount) || 0, item.status || '', item.trader_id || '', item.merchant_id || '', item.upi_id || item.account_number || '', item.utr || '', item.created_at || '']);
    const csv = [headers, ...rows.map(r => r.map(escapeCSV))].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); 
    a.href = url; 
    a.download = `payouts-${activeTab}-${Date.now()}.csv`; 
    a.click();
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
    waiting: 'bg-blue-600', 
    pending: 'bg-slate-600',
    assigned: 'bg-amber-600', 
    overdue: 'bg-orange-600', 
    cancelled: 'bg-red-600', 
    completed: 'bg-green-600',
    all: 'bg-purple-600',
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      {selectedItem && <PayoutDetailsModal item={selectedItem} type={modalType} onClose={() => setSelectedItem(null)} />}

      {/* Header */}
      <div className="hidden sm:flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-sm"><TrendingDown className="w-5 h-5 text-white" /></div>
            Payout Management
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 ml-11">
            {stats.total} total payouts • {stats.assigned} assigned • {stats.completed} completed
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 text-sm font-semibold"><Download className="w-4 h-4" /> Export</button>
          <button onClick={fetchPayouts} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 text-sm font-semibold"><RefreshCw className="w-4 h-4" /> Refresh</button>
        </div>
      </div>

      {/* Mobile Header */}
      <div className="flex sm:hidden items-center justify-between">
        <h1 className="text-lg font-bold text-slate-900">Payouts ({stats.total})</h1>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="p-2 bg-slate-100 rounded-xl"><Download className="w-4 h-4 text-slate-600" /></button>
          <button onClick={fetchPayouts} className="p-2 bg-indigo-600 rounded-xl"><RefreshCw className="w-4 h-4 text-white" /></button>
        </div>
      </div>

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
        <div className="flex gap-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search ID, UTR, trader, merchant, account, amount..."
            accentColor="indigo"
            className="flex-1"
          />
          <button onClick={() => setShowFilters(!showFilters)}
            className={`w-10 h-10 flex items-center justify-center rounded-xl border flex-shrink-0 ${showFilters ? 'bg-indigo-50 border-indigo-300 text-indigo-600' : 'bg-white border-slate-200 text-slate-500'}`}>
            <Filter className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Date Filters */}
      {showFilters && activeTab !== 'waiting' && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" /> From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" /> To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" />
          </div>
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
                <div className="text-xs text-blue-800"><span className="font-bold">Waiting List:</span> Traders waiting for payouts. They'll auto-receive when new payouts become available.</div>
              </div>
              <button 
                onClick={handleClearAllWaiting}
                disabled={processing}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 text-xs font-semibold disabled:opacity-50"
              >
                <X className="w-3.5 h-3.5" />
                Clear All
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
      ) : currentData.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {currentData.slice(0, 100).map(payout => (
            <PayoutCard key={payout.id} payout={payout}
              onView={(p) => handleViewDetails(p, 'payout')}
              onRemove={['overdue', 'cancelled', 'pending'].includes(activeTab) ? handleRemovePayout : null}
              onReassign={['overdue', 'cancelled', 'assigned'].includes(activeTab) ? handleReassignPayout : null}
              showActions={['overdue', 'cancelled', 'assigned', 'pending'].includes(activeTab)} />
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
            <><TrendingDown className="w-12 h-12 text-slate-200 mx-auto mb-3" /><p className="text-slate-500 font-medium">No payouts found</p><p className="text-xs text-slate-400 mt-1">{search || dateFrom || dateTo ? 'Try adjusting your filters' : 'No data in this category'}</p></>
          )}
        </div>
      )}

      {currentData.length > 100 && <p className="text-center text-xs text-slate-400">Showing 100 of {currentData.length} results</p>}
    </div>
  );
}
