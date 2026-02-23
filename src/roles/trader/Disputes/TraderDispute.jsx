import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { supabase } from '../../../supabase';
import { useRealtimeSubscription } from '../../../hooks/useRealtimeSubscription';
import {
  AlertCircle, RefreshCw, Search, Filter, Bell, BellOff, Volume2, VolumeX, Calendar, X, Download,
} from "lucide-react";
import Toast from '../../../components/admin/Toast';
import DisputeNotifications from './components/DisputeNotifications';
import DisputeCard from './components/DisputeCard';
import ConversationModal from './components/ConversationModal';

const notificationManager = new DisputeNotifications();

/* ─── Main Page ─── */
export default function TraderDispute() {
  const [disputes, setDisputes] = useState([]);
  const [traderId, setTraderId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedDispute, setSelectedDispute] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('disputeSoundEnabled');
    return saved !== null ? saved === 'true' : true;
  });
  const [toast, setToast] = useState(null);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [newDisputeAlert, setNewDisputeAlert] = useState(false);
  const isFirstLoad = useRef(true);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch disputes
  const fetchDisputes = useCallback(async (isRefresh = false, checkForNew = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); setRefreshing(false); return; }
    
    // Get actual trader ID (auth user.id = profile_id, not trader.id)
    const { data: traderData } = await supabase
      .from('traders')
      .select('id')
      .or(`id.eq.${user.id},profile_id.eq.${user.id}`)
      .single();
    
    const actualTraderId = traderData?.id || user.id;
    setTraderId(actualTraderId);

    const { data } = await supabase
      .from('disputes')
      .select('*')
      .eq('trader_id', actualTraderId)
      .order('created_at', { ascending: false })
      .limit(200);

    setDisputes(data || []);
    setLoading(false);
    setRefreshing(false);
    
    // Check for new disputes (sound + notification)
    // Skip on first load to avoid sounds for existing disputes
    if (checkForNew && !isFirstLoad.current) {
      const hasNew = notificationManager.checkNewDisputes(data || []);
      if (hasNew) {
        setToast({ type: 'warning', message: '🔔 New dispute received!' });
        setNewDisputeAlert(true);
        // Clear alert animation after 3 seconds
        setTimeout(() => setNewDisputeAlert(false), 3000);
      }
    }
    isFirstLoad.current = false;
  }, []);

  // Initial fetch
  useEffect(() => { fetchDisputes(); }, [fetchDisputes]);

  // Memoize realtime callbacks to prevent subscription churn
  const handleDisputeInsert = useCallback((newRecord) => {
    console.log('📡 New dispute received:', newRecord?.id);
    fetchDisputes(true, true); // checkForNew=true on insert
  }, [fetchDisputes]);

  const handleDisputeUpdate = useCallback((newRecord) => {
    console.log('📡 Dispute updated:', newRecord?.id, 'status:', newRecord?.status);
    // Play sound if dispute needs trader attention (pending or routed_to_trader)
    const needsAttention = newRecord?.status === 'routed_to_trader' || newRecord?.status === 'pending';
    fetchDisputes(true, needsAttention);
  }, [fetchDisputes]);

  // Realtime subscription for disputes - only enable after traderId is known
  useRealtimeSubscription('disputes', {
    filter: `trader_id=eq.${traderId}`,
    enabled: !!traderId,
    onInsert: handleDisputeInsert,
    onUpdate: handleDisputeUpdate,
  });

  // Realtime subscription for dispute messages - updates conversation & unread counts
  const handleMessageChange = useCallback(() => {
    console.log('📡 Dispute message changed');
    // Refresh unread counts
    const fetchUnread = async () => {
      const counts = {};
      for (const dispute of disputes) {
        const { count } = await supabase
          .from('dispute_messages')
          .select('*', { count: 'exact', head: true })
          .eq('dispute_id', dispute.id)
          .neq('from', 'trader')
          .eq('read_by_trader', false);
        counts[dispute.id] = count || 0;
      }
      setUnreadCounts(counts);
    };
    if (disputes.length > 0) fetchUnread();
  }, [disputes]);

  useRealtimeSubscription('dispute_messages', {
    enabled: disputes.length > 0,
    onChange: handleMessageChange,
  });

  // Sync sound toggle with notification manager + persist
  useEffect(() => {
    notificationManager.toggleSound(soundEnabled);
    localStorage.setItem('disputeSoundEnabled', String(soundEnabled));
  }, [soundEnabled]);

  // Load unread message counts
  useEffect(() => {
    const fetchUnread = async () => {
      const counts = {};
      for (const dispute of disputes) {
        const { count } = await supabase
          .from('dispute_messages')
          .select('*', { count: 'exact', head: true })
          .eq('dispute_id', dispute.id)
          .neq('from', 'trader')
          .eq('read_by_trader', false);
        counts[dispute.id] = count || 0;
      }
      setUnreadCounts(counts);
    };
    if (disputes.length > 0) fetchUnread();
  }, [disputes]);

  // Request notification permission on mount
  useEffect(() => {
    const checkPermission = async () => {
      if ('Notification' in window && Notification.permission === 'granted') {
        notificationManager.enabled = true;
        setNotificationsEnabled(true);
      }
    };
    checkPermission();
  }, []);

  const handleEnableNotifications = async () => {
    const granted = await notificationManager.requestPermission();
    if (granted) {
      setNotificationsEnabled(true);
      setToast({ type: 'success', message: 'Notifications enabled!' });
    } else {
      setToast({ type: 'error', message: 'Notification permission denied' });
    }
  };

  const filtered = useMemo(() => {
    let r = disputes;
    if (statusFilter !== 'all') {
      if (statusFilter === 'pending') {
        r = r.filter(d => d.status === 'pending' || d.status === 'routed_to_trader');
      } else {
        r = r.filter(d => d.status === statusFilter);
      }
    }
    if (typeFilter !== 'all') r = r.filter(d => d.type === typeFilter);
    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase();
      r = r.filter(d => 
        d.dispute_id?.toLowerCase().includes(s) ||
        d.upi_id?.toLowerCase().includes(s) || 
        d.utr?.toLowerCase().includes(s) ||
        d.reason?.toLowerCase().includes(s)
      );
    }
    // Date filters
    if (dateFrom) r = r.filter(d => new Date(d.created_at) >= new Date(dateFrom));
    if (dateTo) r = r.filter(d => new Date(d.created_at) <= new Date(dateTo + 'T23:59:59'));
    return r;
  }, [disputes, statusFilter, typeFilter, debouncedSearch, dateFrom, dateTo]);

  const stats = useMemo(() => ({
    total: disputes.length,
    pending: disputes.filter(d => d.status === 'pending' || d.status === 'routed_to_trader').length,
    accepted: disputes.filter(d => d.status === 'trader_accepted').length,
    rejected: disputes.filter(d => d.status === 'trader_rejected').length,
  }), [disputes]);

  const handleResponseSubmit = async ({ action, note, proofUrl }) => {
    if (!selectedDispute) return;
    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://jrzyndtowwwcydgcagcr.supabase.co';
      const response = await fetch(`${SUPABASE_URL}/functions/v1/trader-dispute-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          disputeId: selectedDispute.id,
          response: action === 'accept' ? 'accepted' : 'rejected',
          statement: note || '',
          proofUrl: proofUrl || null,
        }),
      });
      
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Failed to submit response');
      
      notificationManager.markAsSeen(selectedDispute.id);
      setSelectedDispute(null);
      setToast({ type: 'success', message: data.message });
      
      // Refresh disputes list to show updated status
      fetchDisputes(true);
    } catch (e) {
      setToast({ type: 'error', message: 'Error: ' + e.message });
    }
  };

  const handleViewConversation = (dispute) => {
    setSelectedDispute(dispute);
    notificationManager.markAsSeen(dispute.id);
  };

  const handleExport = () => {
    const csv = [
      ['Dispute ID', 'Type', 'Amount', 'UPI', 'UTR', 'Status', 'Reason', 'Created'],
      ...filtered.map(d => [
        d.dispute_id || d.id,
        d.type || '',
        d.amount || 0,
        d.upi_id || '',
        d.utr || '',
        d.status || '',
        `"${(d.reason || '').replace(/"/g, '""')}"`,
        new Date(d.created_at).toLocaleString(),
      ])
    ].map(r => r.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trader-disputes-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm font-medium">Loading disputes…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* Desktop header */}
      <div className="hidden sm:flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl shadow-sm">
              <AlertCircle className="w-5 h-5 text-white" />
            </div>
            Disputes
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 ml-11">Respond to merchant disputes</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => fetchDisputes(true)} disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-200 text-sm font-semibold disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => {
              const newState = !soundEnabled;
              setSoundEnabled(newState);
              if (newState) {
                // Play test sound when enabling
                setTimeout(() => notificationManager.playSound(), 100);
              }
            }}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold ${
              soundEnabled
                ? 'bg-green-50 border border-green-200 text-green-700'
                : 'bg-slate-100 border border-slate-200 text-slate-500'
            }`}
            title={soundEnabled ? 'Sound alerts on - click to disable' : 'Sound alerts off - click to enable'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button
            onClick={handleEnableNotifications}
            disabled={notificationsEnabled}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold ${
              notificationsEnabled
                ? 'bg-green-50 border border-green-200 text-green-700'
                : 'bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100'
            }`}
          >
            {notificationsEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
            {notificationsEnabled ? 'On' : 'Notify'}
          </button>
        </div>
      </div>

      {/* Mobile buttons */}
      <div className="flex sm:hidden justify-between items-center gap-2">
        <button onClick={() => fetchDisputes(true)} disabled={refreshing}
          className="p-2 bg-slate-100 border border-slate-200 rounded-xl hover:bg-slate-200 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 text-slate-600 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const newState = !soundEnabled;
              setSoundEnabled(newState);
              if (newState) {
                // Play test sound when enabling
                setTimeout(() => notificationManager.playSound(), 100);
              }
            }}
            className={`p-2 rounded-xl ${
              soundEnabled
                ? 'bg-green-50 border border-green-200 text-green-600'
                : 'bg-slate-100 border border-slate-200 text-slate-400'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          {!notificationsEnabled && (
            <button onClick={handleEnableNotifications}
              className="flex items-center gap-2 px-3 py-2 bg-amber-500 text-white rounded-xl text-xs font-bold">
              <Bell className="w-3.5 h-3.5" /> Alerts
            </button>
          )}
        </div>
      </div>

      {/* Summary card */}
      {stats.pending > 0 && (
        <div className={`bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl p-4 text-white transition-all ${
          newDisputeAlert ? 'ring-4 ring-amber-300 ring-opacity-75 animate-pulse' : ''
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-amber-100 text-xs font-semibold">Awaiting Response</p>
              <p className="text-2xl font-bold flex items-center gap-2">
                {stats.pending}
                {newDisputeAlert && (
                  <span className="text-xs bg-white/30 px-2 py-0.5 rounded-full animate-bounce">NEW!</span>
                )}
              </p>
            </div>
            <div className="text-right">
              <p className="text-amber-100 text-xs">Total</p>
              <p className="text-lg font-bold">{stats.total}</p>
            </div>
          </div>
        </div>
      )}

      {/* Status pills */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'All', value: stats.total, color: 'bg-slate-100 text-slate-700', key: 'all' },
          { label: 'Pending', value: stats.pending, color: 'bg-amber-100 text-amber-700', key: 'pending' },
          { label: 'Accepted', value: stats.accepted, color: 'bg-green-100 text-green-700', key: 'trader_accepted' },
          { label: 'Rejected', value: stats.rejected, color: 'bg-red-100 text-red-700', key: 'trader_rejected' },
        ].map(pill => (
          <button key={pill.key} onClick={() => setStatusFilter(pill.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              statusFilter === pill.key ? `${pill.color} shadow-sm` : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}>
            {pill.label}
            <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${statusFilter === pill.key ? 'bg-white/60' : 'bg-slate-200 text-slate-600'}`}>
              {pill.value}
            </span>
          </button>
        ))}
      </div>

      {/* Search + filters + export */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input type="text" placeholder="Search dispute, UTR, UPI..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent bg-white" />
        </div>
        <button onClick={() => setShowFilters(!showFilters)}
          className={`w-10 h-10 flex items-center justify-center rounded-xl border flex-shrink-0 ${
            showFilters || dateFrom || dateTo ? 'bg-amber-50 border-amber-300 text-amber-600' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
          }`}>
          <Filter className="w-4 h-4" />
        </button>
        <button onClick={handleExport}
          className="w-10 h-10 flex items-center justify-center bg-slate-100 border border-slate-200 rounded-xl hover:bg-slate-200 flex-shrink-0">
          <Download className="w-4 h-4 text-slate-600" />
        </button>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-3">
          {/* Type filter */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Type</label>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white">
              <option value="all">All Types</option>
              <option value="payin">Payin</option>
              <option value="payout">Payout</option>
            </select>
          </div>
          {/* Date filters */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> From
              </label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-amber-400" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> To
              </label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-amber-400" />
            </div>
          </div>
          {(dateFrom || dateTo || typeFilter !== 'all') && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); setTypeFilter('all'); }} 
              className="text-xs text-amber-600 font-semibold flex items-center gap-1 hover:text-amber-700">
              <X className="w-3 h-3" /> Clear all filters
            </button>
          )}
        </div>
      )}

      {/* Cards */}
      {filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map(d => (
            <DisputeCard
              key={d.id}
              dispute={d}
              onViewConversation={handleViewConversation}
              unreadCount={unreadCounts[d.id] || 0}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <AlertCircle className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No disputes found</p>
          <p className="text-xs text-slate-400 mt-1">
            {statusFilter !== 'all' || typeFilter !== 'all' || search || dateFrom || dateTo ? 'Try adjusting your filters' : 'No active disputes'}
          </p>
        </div>
      )}

      {selectedDispute && (
        <ConversationModal
          dispute={selectedDispute}
          onClose={() => setSelectedDispute(null)}
          onSubmit={handleResponseSubmit}
        />
      )}
    </div>
  );
}
