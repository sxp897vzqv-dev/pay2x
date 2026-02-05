import React, { useEffect, useState, useMemo } from "react";
import { supabase } from '../../../supabase';
import { useRealtimeSubscription } from '../../../hooks/useRealtimeSubscription';
import {
  AlertCircle, RefreshCw, Search, Filter, Bell, BellOff,
} from "lucide-react";
import Toast from '../../../components/admin/Toast';
import DisputeNotifications from './components/DisputeNotifications';
import DisputeCard from './components/DisputeCard';
import ConversationModal from './components/ConversationModal';

const notificationManager = new DisputeNotifications();

/* ─── Main Page ─── */
export default function TraderDispute() {
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedDispute, setSelectedDispute] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [toast, setToast] = useState(null);
  const [unreadCounts, setUnreadCounts] = useState({});

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Load disputes
  useEffect(() => {
    const fetchDisputes = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('disputes')
        .select('*')
        .eq('trader_id', user.id)
        .order('created_at', { ascending: false })
        .limit(200);
      const mapped = (data || []).map(d => ({
        ...d,
        traderId: d.trader_id, merchantId: d.merchant_id,
        orderId: d.order_id || d.payin_id || d.payout_id,
        upiId: d.upi_id, traderNote: d.trader_note,
        traderAction: d.trader_action, proofUrl: d.proof_url,
        createdAt: d.created_at ? { seconds: new Date(d.created_at).getTime() / 1000 } : null,
        respondedAt: d.responded_at ? { seconds: new Date(d.responded_at).getTime() / 1000 } : null,
      }));
      setDisputes(mapped);
      setLoading(false);
      if (notificationsEnabled) notificationManager.checkNewDisputes(mapped);
    };
    fetchDisputes();
  }, [notificationsEnabled]);

  // Realtime: refresh on dispute changes
  useRealtimeSubscription('disputes', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('disputes').select('*').eq('trader_id', user.id).order('created_at', { ascending: false }).limit(200);
    setDisputes((data || []).map(d => ({
      ...d, traderId: d.trader_id, merchantId: d.merchant_id,
      orderId: d.order_id || d.payin_id || d.payout_id,
      upiId: d.upi_id, traderNote: d.trader_note,
      traderAction: d.trader_action, proofUrl: d.proof_url,
      createdAt: d.created_at ? { seconds: new Date(d.created_at).getTime() / 1000 } : null,
      respondedAt: d.responded_at ? { seconds: new Date(d.responded_at).getTime() / 1000 } : null,
    })));
  });

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
      setToast({ msg: '✅ Notifications enabled!', success: true });
    } else {
      setToast({ msg: '❌ Notification permission denied', success: false });
    }
  };

  const filtered = useMemo(() => {
    let r = disputes;
    if (statusFilter !== 'all') r = r.filter(d => d.status === statusFilter);
    if (typeFilter !== 'all') r = r.filter(d => d.type === typeFilter);
    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase();
      r = r.filter(d => d.orderId?.toLowerCase().includes(s) || d.upiId?.toLowerCase().includes(s) || d.reason?.toLowerCase().includes(s));
    }
    return r;
  }, [disputes, statusFilter, typeFilter, debouncedSearch]);

  const stats = useMemo(() => ({
    total: disputes.length,
    pending: disputes.filter(d => d.status === 'pending').length,
    approved: disputes.filter(d => d.status === 'approved').length,
    rejected: disputes.filter(d => d.status === 'rejected').length,
  }), [disputes]);

  const handleResponseSubmit = async ({ action, note, proofUrl }) => {
    if (!selectedDispute) return;
    try {
      await supabase.from('disputes').update({
        status: action === 'accept' ? 'approved' : 'rejected',
        trader_note: note,
        trader_action: action,
        proof_url: proofUrl || null,
        responded_at: new Date().toISOString(),
      }).eq('id', selectedDispute.id);
      
      // Mark as seen
      notificationManager.markAsSeen(selectedDispute.id);
      
      setSelectedDispute(null);
      setToast({ msg: `✅ Dispute ${action === 'accept' ? 'accepted' : 'rejected'}`, success: true });
    } catch (e) {
      setToast({ msg: '❌ Error: ' + e.message, success: false });
    }
  };

  const handleViewConversation = (dispute) => {
    setSelectedDispute(dispute);
    notificationManager.markAsSeen(dispute.id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <RefreshCw className="w-10 h-10 text-amber-500 animate-spin mx-auto mb-3" />
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
            <AlertCircle className="w-6 h-6 text-amber-600" /> Disputes
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">Respond to merchant disputes</p>
        </div>
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
          {notificationsEnabled ? 'Notifications On' : 'Enable Notifications'}
        </button>
      </div>

      {/* Notification banner (mobile) */}
      {!notificationsEnabled && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2">
          <BellOff className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-amber-900">Get instant alerts</p>
            <p className="text-xs text-amber-700 mt-0.5">Enable notifications for new disputes</p>
          </div>
          <button
            onClick={handleEnableNotifications}
            className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 flex-shrink-0"
          >
            Enable
          </button>
        </div>
      )}

      {/* Status pills */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'All', value: stats.total, color: 'bg-slate-100 text-slate-700', key: 'all' },
          { label: 'Pending', value: stats.pending, color: 'bg-amber-100 text-amber-700', key: 'pending' },
          { label: 'Approved', value: stats.approved, color: 'bg-green-100 text-green-700', key: 'approved' },
          { label: 'Rejected', value: stats.rejected, color: 'bg-red-100 text-red-700', key: 'rejected' },
        ].map(pill => (
          <button key={pill.key} onClick={() => setStatusFilter(pill.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              statusFilter === pill.key ? `${pill.color} ring-2 ring-current` : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}>
            {pill.label}
            <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${statusFilter === pill.key ? 'bg-white/60' : 'bg-slate-200 text-slate-600'}`}>{pill.value}</span>
          </button>
        ))}
      </div>

      {/* Search + filter toggle */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input type="text" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent bg-white" />
        </div>
        <button onClick={() => setShowFilters(!showFilters)}
          className={`w-10 h-10 flex items-center justify-center rounded-xl border flex-shrink-0 ${
            showFilters ? 'bg-amber-50 border-amber-300 text-amber-600' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
          }`}>
          <Filter className="w-4 h-4" />
        </button>
      </div>

      {showFilters && (
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white">
            <option value="all">All Types</option>
            <option value="payin">Payin</option>
            <option value="payout">Payout</option>
          </select>
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
          <AlertCircle className="w-10 h-10 text-slate-200 mx-auto mb-2" />
          <p className="text-slate-500 text-sm font-medium">No disputes found</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {statusFilter !== 'all' || typeFilter !== 'all' || search ? 'Try adjusting your filters' : 'No active disputes'}
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
