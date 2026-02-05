import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabase';
import { Bell, AlertCircle, TrendingDown, TrendingUp, X } from 'lucide-react';

const LAST_SEEN_KEY = 'pay2x_notif_last_seen';

function getLastSeen() {
  try {
    const ts = localStorage.getItem(LAST_SEEN_KEY);
    return ts ? Number(ts) : 0;
  } catch {
    return 0;
  }
}

function setLastSeen(ts) {
  try {
    localStorage.setItem(LAST_SEEN_KEY, String(ts));
  } catch {}
}

function toMillis(val) {
  if (!val) return 0;
  if (val.toMillis) return val.toMillis(); // Firestore Timestamp
  if (val.seconds) return val.seconds * 1000;
  if (typeof val === 'number') return val;
  return new Date(val).getTime() || 0;
}

export default function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [disputes, setDisputes] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [payins, setPayins] = useState([]);
  const [lastSeen, setLastSeenState] = useState(getLastSeen);
  const containerRef = useRef(null);
  const navigate = useNavigate();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Fetch notifications (polling instead of real-time for now)
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const [dRes, pRes, iRes] = await Promise.all([
          supabase.from('disputes').select('*').in('status', ['pending', 'routed_to_trader', 'trader_accepted', 'trader_rejected']).order('created_at', { ascending: false }).limit(10),
          supabase.from('payouts').select('*').eq('status', 'pending').order('created_at', { ascending: false }).limit(10),
          supabase.from('payins').select('*').eq('status', 'pending').order('created_at', { ascending: false }).limit(10),
        ]);
        const mapTs = (r) => ({ ...r, createdAt: r.created_at ? { seconds: new Date(r.created_at).getTime() / 1000 } : null, requestedAt: r.requested_at ? { seconds: new Date(r.requested_at).getTime() / 1000 } : null });
        setDisputes((dRes.data || []).map(mapTs));
        setPayouts((pRes.data || []).map(mapTs));
        setPayins((iRes.data || []).map(mapTs));
      } catch (e) { console.warn('Notification fetch error:', e); }
    };
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, []);

  // Count new items since last seen
  const countNew = (items, timeField) => {
    return items.filter((item) => {
      const ts = toMillis(item[timeField]);
      return ts > lastSeen;
    }).length;
  };

  const newDisputeCount = countNew(disputes, 'createdAt');
  const newPayoutCount = countNew(payouts, 'createdAt');
  const newPayinCount = countNew(payins, 'requestedAt');
  const totalBadge = newDisputeCount + newPayoutCount + newPayinCount;

  const handleMarkAllSeen = () => {
    const now = Date.now();
    setLastSeen(now);
    setLastSeenState(now);
  };

  const handleNavigate = (path) => {
    navigate(path);
    setOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-9 h-9 flex items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-700 relative"
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
        {totalBadge > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 shadow-sm">
            {totalBadge > 99 ? '99+' : totalBadge}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden z-50">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Notifications</h3>
            <button
              onClick={handleMarkAllSeen}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Mark all seen
            </button>
          </div>

          {/* Notification items */}
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
            {/* Disputes */}
            {disputes.length > 0 && (
              <button
                onClick={() => handleNavigate('/admin/disputes')}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    🔴 {disputes.length} dispute{disputes.length !== 1 ? 's' : ''} need attention
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {newDisputeCount > 0 ? `${newDisputeCount} new` : 'All seen'}
                  </p>
                </div>
              </button>
            )}

            {/* Payouts */}
            {payouts.length > 0 && (
              <button
                onClick={() => handleNavigate('/admin/payouts')}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                  <TrendingDown className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    🟡 {payouts.length} payout{payouts.length !== 1 ? 's' : ''} pending
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {newPayoutCount > 0 ? `${newPayoutCount} new` : 'All seen'}
                  </p>
                </div>
              </button>
            )}

            {/* Payins */}
            {payins.length > 0 && (
              <button
                onClick={() => handleNavigate('/admin/payins')}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    🟡 {payins.length} payin{payins.length !== 1 ? 's' : ''} pending
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {newPayinCount > 0 ? `${newPayinCount} new` : 'All seen'}
                  </p>
                </div>
              </button>
            )}

            {/* Empty state */}
            {disputes.length === 0 && payouts.length === 0 && payins.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
                All clear — no pending items! 🎉
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
