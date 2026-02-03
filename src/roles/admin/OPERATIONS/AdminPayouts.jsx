import React, { useEffect, useState, useMemo } from 'react';
import { db } from '../../../firebase';
import {
  collection, query, onSnapshot, orderBy, where, getDocs, doc, updateDoc, deleteDoc, serverTimestamp, limit,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { Link, useSearchParams } from 'react-router-dom';
import {
  TrendingDown, Search, Filter, Download, RefreshCw, Eye, User, Calendar, Clock,
  Hash, CreditCard, Building, CheckCircle, XCircle, AlertCircle, X, Trash2,
  RotateCcw, Loader, MoreVertical, ExternalLink, FileText,
} from 'lucide-react';

/* ─── Toast ─── */
function Toast({ msg, success, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-50 ${success ? 'bg-green-600' : 'bg-red-600'} text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-medium`} style={{ top: 60 }}>
      {success ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
      <span>{msg}</span>
    </div>
  );
}

/* ─── Payout Card (Mobile) ─── */
function PayoutCard({ payout, onView, onRemove, onReassign, showActions = false }) {
  const [showMenu, setShowMenu] = useState(false);
  const statusStyles = {
    completed: { bg: 'bg-green-100', text: 'text-green-700', stripe: 'bg-green-500' },
    assigned: { bg: 'bg-blue-100', text: 'text-blue-700', stripe: 'bg-blue-500' },
    pending: { bg: 'bg-amber-100', text: 'text-amber-700', stripe: 'bg-amber-500' },
    cancelled: { bg: 'bg-red-100', text: 'text-red-700', stripe: 'bg-red-500' },
    cancelled_by_trader: { bg: 'bg-red-100', text: 'text-red-700', stripe: 'bg-red-500' },
  };
  const style = statusStyles[payout.status] || statusStyles.pending;
  
  // Calculate time elapsed - handle both assignedAt and createdAt
  const timestamp = payout.assignedAt || payout.createdAt;
  const timeElapsed = timestamp?.seconds
    ? Math.floor((Date.now() - timestamp.seconds * 1000) / (1000 * 60))
    : 0;
  const isOverdue = payout.status === 'assigned' && timeElapsed > 60;

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${isOverdue ? 'border-orange-300' : 'border-slate-200'}`}>
      <div className={`h-1 ${isOverdue ? 'bg-orange-500' : style.stripe}`} />
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <p className="font-mono text-xs text-slate-400">{payout.id?.slice(0, 12)}...</p>
            <p className="text-lg font-bold text-blue-600">₹{(payout.amount || 0).toLocaleString()}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${style.bg} ${style.text}`}>
              {payout.status?.toUpperCase().replace('_', ' ')}
            </span>
            {isOverdue && <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-orange-100 text-orange-700">OVERDUE</span>}
            {showActions && (
              <div className="relative">
                <button onClick={() => setShowMenu(!showMenu)} className="p-1 hover:bg-slate-100 rounded-lg">
                  <MoreVertical className="w-4 h-4 text-slate-500" />
                </button>
                {showMenu && (
                  <div className="absolute right-0 mt-1 w-40 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-20">
                    <button onClick={() => { onView(payout); setShowMenu(false); }} className="w-full px-3 py-2 text-left text-xs hover:bg-slate-50 flex items-center gap-2">
                      <Eye className="w-3.5 h-3.5" /> View Details
                    </button>
                    {onReassign && (
                      <button onClick={() => { onReassign(payout); setShowMenu(false); }} className="w-full px-3 py-2 text-left text-xs hover:bg-purple-50 text-purple-600 flex items-center gap-2">
                        <RotateCcw className="w-3.5 h-3.5" /> Reassign to Pool
                      </button>
                    )}
                    {onRemove && (
                      <button onClick={() => { onRemove(payout); setShowMenu(false); }} className="w-full px-3 py-2 text-left text-xs hover:bg-red-50 text-red-600 flex items-center gap-2">
                        <Trash2 className="w-3.5 h-3.5" /> Remove Payout
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2 text-xs">
          <div className="flex items-center gap-1.5 text-slate-500"><User className="w-3 h-3" /><span className="truncate">{payout.traderId?.slice(0, 8) || payout.userId?.slice(0, 8) || '—'}</span></div>
          <div className="flex items-center gap-1.5 text-slate-500">{payout.upiId ? <CreditCard className="w-3 h-3" /> : <Building className="w-3 h-3" />}<span className="truncate">{payout.upiId || payout.accountNumber || '—'}</span></div>
          <div className="flex items-center gap-1.5 text-slate-500"><Hash className="w-3 h-3" /><span className="truncate">{payout.utrId || 'No UTR'}</span></div>
          <div className="flex items-center gap-1.5 text-slate-500"><Clock className="w-3 h-3" /><span className={timeElapsed > 60 ? 'text-orange-600 font-bold' : ''}>{timeElapsed}m ago</span></div>
        </div>
        {payout.cancelReason && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-2 mb-2">
            <p className="text-xs text-red-700 line-clamp-2"><span className="font-bold">Reason:</span> {payout.cancelReason}</p>
          </div>
        )}
        <div className="flex gap-2">
          {payout.traderId && <Link to={`/admin/traders/${payout.traderId}`} className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-slate-50 text-slate-600 border border-slate-200 rounded-lg text-xs font-semibold hover:bg-slate-100"><Eye className="w-3 h-3" /> Trader</Link>}
          {payout.proofUrl && <a href={payout.proofUrl} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg text-xs font-semibold hover:bg-blue-100"><FileText className="w-3 h-3" /> Proof</a>}
          <button onClick={() => onView(payout)} className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg text-xs font-semibold hover:bg-indigo-100"><Eye className="w-3 h-3" /> Details</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Waiting Request Card ─── */
function WaitingRequestCard({ request, onView }) {
  return (
    <div className="bg-white rounded-xl border-2 border-blue-200 shadow-sm overflow-hidden">
      <div className="h-1 bg-blue-500" />
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <Loader className="w-4 h-4 text-blue-600 animate-spin" />
            <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${
              request.status === 'waiting' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {request.status === 'waiting' ? 'WAITING' : request.status?.toUpperCase().replace('_', ' ') || 'PARTIAL'}
            </span>
          </div>
          <button onClick={() => onView(request)} className="p-1.5 hover:bg-slate-100 rounded-lg"><Eye className="w-4 h-4 text-slate-500" /></button>
        </div>
        <div className="mb-2">
          <p className="text-xs text-slate-400">Trader</p>
          <p className="text-sm font-bold text-slate-900 truncate">{request.trader?.name || request.traderId?.slice(0, 12) || '—'}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center mb-2">
          <div className="bg-slate-50 rounded-lg p-2">
            <p className="text-xs text-slate-400">Requested</p>
            <p className="text-sm font-bold text-slate-900">₹{(request.requestedAmount || 0).toLocaleString()}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-2">
            <p className="text-xs text-green-600">Assigned</p>
            <p className="text-sm font-bold text-green-700">₹{(request.assignedAmount || 0).toLocaleString()}</p>
          </div>
          <div className="bg-orange-50 rounded-lg p-2">
            <p className="text-xs text-orange-600">Waiting</p>
            <p className="text-sm font-bold text-orange-700">₹{(request.remainingAmount || 0).toLocaleString()}</p>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {request.requestedAt?.seconds ? new Date(request.requestedAt.seconds * 1000).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
          </span>
          {request.assignedPayouts?.length > 0 && <span className="text-green-600 font-semibold">{request.assignedPayouts.length} assigned</span>}
        </div>
      </div>
    </div>
  );
}

/* ─── Details Modal ─── */
function DetailsModal({ item, type, onClose }) {
  if (!item) return null;
  const isRequest = type === 'request';
  const statusColors = { completed: 'bg-green-100 text-green-700', assigned: 'bg-blue-100 text-blue-700', pending: 'bg-amber-100 text-amber-700', waiting: 'bg-blue-100 text-blue-700', partially_assigned: 'bg-amber-100 text-amber-700', fully_assigned: 'bg-green-100 text-green-700', cancelled: 'bg-red-100 text-red-700', cancelled_by_trader: 'bg-red-100 text-red-700' };

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-xl bg-white shadow-2xl rounded-t-2xl sm:rounded-2xl overflow-hidden mt-auto sm:mt-0 max-h-[90vh] flex flex-col">
        <div className="sm:hidden flex justify-center pt-2 pb-1"><div className="w-10 h-1 bg-slate-300 rounded-full" /></div>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-900">{isRequest ? 'Request Details' : 'Payout Details'}</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg"><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl p-5 text-center text-white">
            <p className="text-blue-200 text-xs mb-1">Amount</p>
            <p className="text-3xl font-bold">₹{(item.amount || item.requestedAmount || 0).toLocaleString()}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {isRequest ? (
              <>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">Trader</p><p className="text-sm font-semibold truncate">{item.trader?.name || item.traderId?.slice(0, 15)}</p></div>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">Status</p><span className={`inline-block px-2 py-0.5 rounded-lg text-xs font-bold ${statusColors[item.status] || 'bg-slate-100 text-slate-700'}`}>{item.status?.toUpperCase().replace('_', ' ')}</span></div>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">Requested</p><p className="text-sm font-semibold">₹{(item.requestedAmount || 0).toLocaleString()}</p></div>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">Assigned</p><p className="text-sm font-semibold">₹{(item.assignedAmount || 0).toLocaleString()}</p></div>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">Remaining</p><p className="text-sm font-semibold">₹{(item.remainingAmount || 0).toLocaleString()}</p></div>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">Payouts</p><p className="text-sm font-semibold">{item.assignedPayouts?.length || 0}</p></div>
              </>
            ) : (
              <>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">ID</p><p className="text-xs font-mono font-semibold truncate">{item.id}</p></div>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">Status</p><span className={`inline-block px-2 py-0.5 rounded-lg text-xs font-bold ${statusColors[item.status] || 'bg-slate-100 text-slate-700'}`}>{item.status?.toUpperCase().replace('_', ' ')}</span></div>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">User ID</p><p className="text-xs font-mono font-semibold truncate">{item.userId || '—'}</p></div>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">Trader ID</p><p className="text-xs font-mono font-semibold truncate">{item.traderId?.slice(0, 15) || '—'}</p></div>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">UPI/Account</p><p className="text-xs font-mono font-semibold truncate">{item.upiId || item.accountNumber || '—'}</p></div>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">IFSC</p><p className="text-xs font-mono font-semibold truncate">{item.ifscCode || '—'}</p></div>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">UTR</p><p className="text-xs font-mono font-semibold truncate">{item.utrId || '—'}</p></div>
                <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-400 mb-0.5">Commission</p><p className="text-sm font-semibold">{item.commission ? `₹${item.commission}` : '—'}</p></div>
              </>
            )}
          </div>
          {item.cancelReason && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-xs font-bold text-red-800 mb-1">Cancel Reason:</p>
              <p className="text-sm text-red-700">{item.cancelReason}</p>
            </div>
          )}
          {item.proofUrl && (
            <a href={item.proofUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 w-full py-3 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl font-semibold text-sm hover:bg-blue-100">
              <ExternalLink className="w-4 h-4" /> View Proof
            </a>
          )}
        </div>
        <div className="px-4 py-3 border-t border-slate-100">
          <button onClick={onClose} className="w-full py-3 bg-slate-900 text-white rounded-xl font-semibold hover:bg-slate-800 active:scale-[0.98]">Close</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Skeleton ─── */
function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse">
      <div className="flex justify-between mb-3"><div className="h-4 bg-slate-200 rounded w-20" /><div className="h-4 bg-slate-200 rounded w-16" /></div>
      <div className="h-6 bg-slate-200 rounded w-24 mb-3" />
      <div className="grid grid-cols-2 gap-2 mb-3">{[1,2,3,4].map(i => <div key={i} className="h-4 bg-slate-100 rounded" />)}</div>
      <div className="flex gap-2"><div className="flex-1 h-8 bg-slate-100 rounded-lg" /><div className="flex-1 h-8 bg-slate-100 rounded-lg" /></div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT - FIXED VERSION
   
   FIXES:
   1. Simplified queries without orderBy (avoids index issues)
   2. Client-side sorting instead of Firestore orderBy
   3. Better error handling with fallback queries
   4. Fixed payoutRequest query (status-based, not inWaitingList)
   5. Added debug logging
   ═══════════════════════════════════════════════════════════════ */
export default function AdminPayouts() {
  const [searchParams] = useSearchParams();
  const auth = getAuth();
  const adminId = auth.currentUser?.uid;

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
  const traderFilter = searchParams.get('trader');

  // ═══════════════════════════════════════════════════════════════
  // FIX 1: Fetch ALL payouts without orderBy, sort client-side
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    setLoading(true);
    setError(null);
    
    // Simple query - no orderBy, no compound indexes needed
    let q;
    if (traderFilter) {
      q = query(collection(db, 'payouts'), where('traderId', '==', traderFilter));
    } else {
      q = collection(db, 'payouts'); // Just get all documents
    }

    console.log('[AdminPayouts] Setting up payouts listener...');
    
    const unsub = onSnapshot(q,
      (snap) => {
        const list = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        
        // Sort client-side by createdAt or assignedAt (newest first)
        list.sort((a, b) => {
          const timeA = (a.createdAt?.seconds || a.assignedAt?.seconds || 0);
          const timeB = (b.createdAt?.seconds || b.assignedAt?.seconds || 0);
          return timeB - timeA;
        });
        
        console.log(`[AdminPayouts] Loaded ${list.length} payouts`);
        console.log('[AdminPayouts] Sample payout:', list[0]);
        
        setPayouts(list);
        setLoading(false);
      },
      (err) => {
        console.error('[AdminPayouts] Error loading payouts:', err);
        setError(`Failed to load payouts: ${err.message}`);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [traderFilter]);

  // ═══════════════════════════════════════════════════════════════
  // FIX 2: Fetch waiting requests - check for BOTH possible schemas
  // payoutRequest collection uses status field, not inWaitingList
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    console.log('[AdminPayouts] Setting up waiting requests listener...');
    
    // Try status-based query first (matches TraderPayout.jsx logic)
    // Active requests are those NOT completed and NOT cancelled
    const q = collection(db, 'payoutRequest');
    
    const unsub = onSnapshot(q,
      async (snap) => {
        const requests = [];
        
        for (const docSnap of snap.docs) {
          const data = { id: docSnap.id, ...docSnap.data() };
          
          // Filter for "waiting" requests - status is not completed/cancelled
          // AND has remaining amount OR is in waiting status
          const isWaiting = 
            (data.status === 'waiting') ||
            (data.status === 'partially_assigned') ||
            (data.inWaitingList === true) ||
            (data.remainingAmount > 0 && data.status !== 'completed' && data.status !== 'cancelled');
          
          if (!isWaiting) continue;
          
          // Lookup trader info
          if (data.traderId) {
            try {
              const traderQ = query(collection(db, 'trader'), where('uid', '==', data.traderId));
              const traderSnap = await getDocs(traderQ);
              if (!traderSnap.empty) {
                data.trader = traderSnap.docs[0].data();
              }
            } catch (err) {
              console.error('[AdminPayouts] Error fetching trader:', err);
            }
          }
          
          requests.push(data);
        }
        
        // Sort by requestedAt (oldest first - FIFO)
        requests.sort((a, b) => {
          const timeA = a.requestedAt?.seconds || 0;
          const timeB = b.requestedAt?.seconds || 0;
          return timeA - timeB;
        });
        
        console.log(`[AdminPayouts] Loaded ${requests.length} waiting requests`);
        console.log('[AdminPayouts] Sample request:', requests[0]);
        
        setWaitingRequests(requests);
      },
      (err) => {
        console.error('[AdminPayouts] Error loading waiting requests:', err);
        // Don't set error state, just log - waiting list is optional
      }
    );

    return () => unsub();
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // Computed Data - Filter payouts by status
  // ═══════════════════════════════════════════════════════════════
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
      const assignedTime = p.assignedAt?.seconds ? p.assignedAt.seconds * 1000 : 0;
      return assignedTime > 0 && assignedTime < oneHourAgo;
    });
  }, [assignedPayouts]);

  // Stats
  const stats = useMemo(() => ({
    waiting: waitingRequests.length,
    waitingAmount: waitingRequests.reduce((sum, r) => sum + (r.remainingAmount || r.requestedAmount || 0), 0),
    pending: pendingPayouts.length,
    pendingAmount: pendingPayouts.reduce((sum, p) => sum + (p.amount || 0), 0),
    assigned: assignedPayouts.length,
    assignedAmount: assignedPayouts.reduce((sum, p) => sum + (p.amount || 0), 0),
    overdue: overduePayouts.length,
    overdueAmount: overduePayouts.reduce((sum, p) => sum + (p.amount || 0), 0),
    cancelled: cancelledPayouts.length,
    cancelledAmount: cancelledPayouts.reduce((sum, p) => sum + (p.amount || 0), 0),
    completed: completedPayouts.length,
    completedAmount: completedPayouts.reduce((sum, p) => sum + (p.amount || 0), 0),
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
    
    // Apply search filter
    if (search) {
      const s = search.toLowerCase();
      data = data.filter(p => 
        p.id?.toLowerCase().includes(s) || 
        p.utrId?.toLowerCase().includes(s) || 
        p.traderId?.toLowerCase().includes(s) || 
        p.userId?.toLowerCase().includes(s) ||
        p.upiId?.toLowerCase().includes(s) || 
        p.accountNumber?.toLowerCase().includes(s) ||
        p.amount?.toString().includes(s)
      );
    }
    
    // Apply date filters
    if (dateFrom) {
      const fromTime = new Date(dateFrom).getTime();
      data = data.filter(p => {
        const time = (p.createdAt?.seconds || p.assignedAt?.seconds || 0) * 1000;
        return time >= fromTime;
      });
    }
    if (dateTo) {
      const toTime = new Date(dateTo).getTime() + 86399999;
      data = data.filter(p => {
        const time = (p.createdAt?.seconds || p.assignedAt?.seconds || 0) * 1000;
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
      await deleteDoc(doc(db, 'payouts', payout.id));
      setToast({ msg: '✅ Payout removed', success: true });
    } catch (err) {
      console.error('Error removing payout:', err);
      setToast({ msg: '❌ Error: ' + err.message, success: false });
    }
    setProcessing(false);
  };

  const handleReassignPayout = async (payout) => {
    if (!window.confirm(`Reassign payout to pool?\n\nAmount: ₹${payout.amount?.toLocaleString()}\n\nThis will make it available for assignment again.`)) return;
    setProcessing(true);
    try {
      await updateDoc(doc(db, 'payouts', payout.id), { 
        status: 'pending', 
        traderId: null, 
        assignedAt: null, 
        cancelReason: null, 
        reassignedAt: serverTimestamp(), 
        reassignedBy: adminId 
      });
      setToast({ msg: '✅ Payout returned to pool', success: true });
    } catch (err) {
      console.error('Error reassigning payout:', err);
      setToast({ msg: '❌ Error: ' + err.message, success: false });
    }
    setProcessing(false);
  };

  const handleExport = () => {
    const exportData = activeTab === 'waiting' ? waitingRequests : currentData;
    const headers = activeTab === 'waiting' 
      ? ['ID', 'Trader ID', 'Trader Name', 'Requested', 'Assigned', 'Remaining', 'Status', 'Date'] 
      : ['ID', 'Amount', 'Status', 'Trader ID', 'User ID', 'UPI/Account', 'UTR', 'Date'];
    const rows = exportData.map(item => activeTab === 'waiting'
      ? [item.id, item.traderId || '', item.trader?.name || '', item.requestedAmount || 0, item.assignedAmount || 0, item.remainingAmount || 0, item.status || '', item.requestedAt?.seconds ? new Date(item.requestedAt.seconds * 1000).toISOString() : '']
      : [item.id, item.amount || 0, item.status || '', item.traderId || '', item.userId || '', item.upiId || item.accountNumber || '', item.utrId || '', item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000).toISOString() : '']);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); 
    a.href = url; 
    a.download = `payouts-${activeTab}-${Date.now()}.csv`; 
    a.click();
    URL.revokeObjectURL(url);
  };

  // Tab configuration - added 'pending' and 'all' tabs
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
      {selectedItem && <DetailsModal item={selectedItem} type={modalType} onClose={() => setSelectedItem(null)} />}

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
          <button onClick={() => window.location.reload()} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 text-sm font-semibold"><RefreshCw className="w-4 h-4" /> Refresh</button>
        </div>
      </div>

      {/* Mobile Header */}
      <div className="flex sm:hidden items-center justify-between">
        <h1 className="text-lg font-bold text-slate-900">Payouts ({stats.total})</h1>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="p-2 bg-slate-100 rounded-xl"><Download className="w-4 h-4 text-slate-600" /></button>
          <button onClick={() => window.location.reload()} className="p-2 bg-indigo-600 rounded-xl"><RefreshCw className="w-4 h-4 text-white" /></button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-red-800">
            <span className="font-bold">Error:</span> {error}
            <button onClick={() => window.location.reload()} className="ml-2 underline">Retry</button>
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

      {/* Debug Info - Remove in production */}
      {payouts.length === 0 && !loading && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-yellow-800">
            <span className="font-bold">Debug:</span> No payouts loaded. Check browser console for details. 
            Make sure the 'payouts' collection exists in Firestore.
          </div>
        </div>
      )}

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
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input type="text" placeholder="Search ID, UTR, trader, user, account, amount..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
          </div>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{[1,2,3,4,5,6].map(i => <SkeletonCard key={i} />)}</div>
      ) : activeTab === 'waiting' ? (
        currentData.length > 0 ? (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2.5">
              <Loader className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5 animate-spin" />
              <div className="text-xs text-blue-800"><span className="font-bold">Waiting List:</span> Traders waiting for payouts. They'll auto-receive when new payouts become available.</div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {currentData.map(request => <WaitingRequestCard key={request.id} request={request} onView={(r) => handleViewDetails(r, 'request')} />)}
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