import React, { useEffect, useState, useMemo, useCallback, memo } from "react";
import { supabase } from "../../../supabase";
import { useRealtimeSubscription } from "../../../hooks/useRealtimeSubscription";
import {
  CheckCircle, XCircle, Edit, Search, FileText, AlertCircle,
  MoreHorizontal, Download, TrendingUp, RefreshCw, Filter, X,
  Calendar, CreditCard, Hash, User, IndianRupee, Clock, Inbox
} from "lucide-react";
import { StatusBadge, RelativeTime, SkeletonCard, SuccessAnimation } from "../../../components/trader";
import { formatINR } from "../../../utils/format";

function exportToCSV(rows, columns, filename) {
  const csv = columns.map(c => c.header).join(",") + "\n" +
    rows.map(row => columns.map(c => {
      let v = row[c.key];
      if (typeof v === "string" && v.includes(",")) v = `"${v}"`;
      return v === undefined ? "" : v;
    }).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const TABS = [
  { key: "pending",   label: "Pending" },
  { key: "completed", label: "Completed" },
  { key: "rejected",  label: "Rejected" },
];

/* ─── Empty state ─── */
const EmptyState = memo(({ tab }) => {
  const map = {
    pending:   { title: "No Pending Payins",   msg: "You're all caught up!",        icon: Inbox },
    completed: { title: "No Completed Payins", msg: "Completed payins appear here.", icon: CheckCircle },
    rejected:  { title: "No Rejected Payins",  msg: "Rejected payins appear here.",  icon: XCircle },
  };
  const { title, msg, icon: Icon } = map[tab] || { title: "No Results", msg: "Try adjusting filters.", icon: Search };
  return (
    <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200">
      <div className="w-14 h-14 bg-white border border-slate-200 rounded-full mx-auto mb-3 flex items-center justify-center shadow-sm">
        <Icon className="w-6 h-6 text-slate-400" />
      </div>
      <h3 className="text-sm font-bold text-slate-700">{title}</h3>
      <p className="text-xs text-slate-400 mt-0.5">{msg}</p>
    </div>
  );
});
EmptyState.displayName = 'EmptyState';

/* ─── Payin Card ─── */
const PayinCard = memo(({ payin, onAccept, onReject, onEditAmount, isEditing, editValue, setEditValue, onEditConfirm, onEditCancel, onViewUser, processing, commissionRate }) => {
  const hasUtr    = Boolean(payin.utrId);
  const commission = Math.round((Number(payin.amount) * commissionRate) / 100);
  const [remainingTime, setRemainingTime] = useState(null);

  useEffect(() => {
    if (payin.status === 'pending' && !payin.utrId && payin.requestedAt?.seconds) {
      const update = () => {
        const rem = (15 * 60 * 1000) - (Date.now() - payin.requestedAt.seconds * 1000);
        if (rem > 0) setRemainingTime({ min: Math.floor(rem/60000), sec: Math.floor((rem%60000)/1000), expiring: rem < 180000 });
        else         setRemainingTime({ min: 0, sec: 0, expiring: true });
      };
      update();
      const iv = setInterval(update, 1000);
      return () => clearInterval(iv);
    }
  }, [payin.status, payin.utrId, payin.requestedAt]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-slate-300">
      <div className={`h-1 ${payin.status === 'completed' ? 'bg-green-500' : payin.status === 'rejected' ? 'bg-red-500' : 'bg-blue-500'}`} />
      <div className="p-3 space-y-3">

        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-xs text-slate-400">Transaction ID</p>
              <span className="text-xs text-slate-400">•</span>
              <RelativeTime date={payin.created_at} className="text-xs" />
            </div>
            <p className="font-mono text-sm font-bold text-slate-900 truncate bg-slate-50 px-2 py-1 rounded-lg inline-block" style={{ fontFamily: 'var(--font-mono)' }}>
              {payin.transactionId || payin.id.slice(-8)}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {payin.status === 'pending' && !hasUtr && remainingTime && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5 ${remainingTime.expiring ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                <Clock className="w-3 h-3" />
                {remainingTime.min}:{remainingTime.sec.toString().padStart(2,'0')}
              </span>
            )}
            <button onClick={() => onViewUser(payin.userId)} className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg">
              <MoreHorizontal className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Info grid 2×2 */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
            <div className="flex items-center gap-1 mb-1"><User className="w-3 h-3 text-green-600" /><p className="text-xs font-bold text-slate-400 uppercase">User</p></div>
            <p className="text-xs font-bold text-slate-800 truncate" style={{ fontFamily: 'var(--font-mono)' }}>{payin.userId}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
            <div className="flex items-center gap-1 mb-1"><CreditCard className="w-3 h-3 text-blue-600" /><p className="text-xs font-bold text-slate-400 uppercase">UPI</p></div>
            <p className="text-xs font-semibold text-slate-800 truncate" style={{ fontFamily: 'var(--font-mono)' }}>{payin.upiId}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
            <div className="flex items-center gap-1 mb-1"><Hash className="w-3 h-3 text-purple-600" /><p className="text-xs font-bold text-slate-400 uppercase">UTR</p></div>
            {payin.utrId
              ? <p className="text-xs font-bold text-slate-800 truncate" style={{ fontFamily: 'var(--font-mono)' }}>{payin.utrId}</p>
              : <p className="text-xs font-semibold text-amber-600 flex items-center gap-1 italic"><AlertCircle className="w-3 h-3" /> Pending</p>
            }
          </div>

          {/* Amount cell */}
          <div className="bg-green-50 rounded-lg p-2.5 border border-green-200">
            <div className="flex items-center gap-1 mb-1"><IndianRupee className="w-3 h-3 text-green-600" /><p className="text-xs font-bold text-slate-600 uppercase">Amount</p></div>
            {isEditing ? (
              <div className="flex items-center gap-1">
                <input type="number" className="flex-1 w-full px-2 py-1 border border-green-400 rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-green-500"
                  value={editValue} onChange={e => setEditValue(e.target.value)} />
                <button onClick={onEditConfirm} className="p-1 text-green-600 hover:bg-green-100 rounded"><CheckCircle className="w-4 h-4" /></button>
                <button onClick={onEditCancel}   className="p-1 text-red-500 hover:bg-red-100 rounded"><XCircle className="w-4 h-4" /></button>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-1">
                  <span className="text-base font-bold text-green-700">₹{payin.amount.toLocaleString('en-IN')}</span>
                  {payin.status === "pending" && (
                    <button onClick={() => onEditAmount(payin)} className="p-0.5 text-green-600 hover:bg-green-100 rounded"><Edit className="w-3 h-3" /></button>
                  )}
                </div>
                {payin.status === "pending" && <p className="text-xs text-green-600 font-semibold mt-0.5">Fee: ₹{commission} ({commissionRate}%)</p>}
              </div>
            )}
          </div>
        </div>

        {/* Proof link */}
        {payin.screenshotUrl && (
          <a href={payin.screenshotUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-xs font-semibold hover:bg-blue-100 active:bg-blue-200">
            <FileText className="w-3.5 h-3.5" /> View Proof
          </a>
        )}

        {/* UTR warning */}
        {payin.status === "pending" && !hasUtr && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-800 text-xs">UTR Required</p>
              <p className="text-xs text-amber-600 mt-0.5">Wait for UTR before accepting or rejecting.</p>
            </div>
          </div>
        )}

        {/* Action buttons */}
        {payin.status === "pending" && (
          <div className="flex gap-2 pt-1">
            <button onClick={() => onAccept(payin)} disabled={!hasUtr || processing}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed">
              <CheckCircle className="w-4 h-4" />{processing ? 'Processing…' : 'Accept'}
            </button>
            <button onClick={() => onReject(payin)} disabled={!hasUtr || processing}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed">
              <XCircle className="w-4 h-4" /> Reject
            </button>
          </div>
        )}

        {/* Status badge */}
        {payin.status !== "pending" && (
          <div className="flex items-center gap-2">
            <StatusBadge status={payin.status} size="md" />
            {payin.autoRejected && <span className="text-xs text-slate-500">(Time Expired)</span>}
          </div>
        )}
      </div>
    </div>
  );
}, (prev, next) => (
  prev.payin.id === next.payin.id &&
  prev.payin.status === next.payin.status &&
  prev.payin.amount === next.payin.amount &&
  prev.payin.utrId === next.payin.utrId &&
  prev.isEditing === next.isEditing &&
  prev.processing === next.processing
));
PayinCard.displayName = 'PayinCard';

/* ─── Main ─── */
export default function TraderPayin() {
  const [traderId,     setTraderId]     = useState(null);
  const [payins,       setPayins]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [activeTab,    setActiveTab]    = useState("pending");
  const [search,       setSearch]       = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFrom,     setDateFrom]     = useState("");
  const [dateTo,       setDateTo]       = useState("");
  const [amountFilter, setAmountFilter] = useState("all");
  const [editingId,    setEditingId]    = useState(null);
  const [editValue,    setEditValue]    = useState("");
  const [commissionRate, setCommissionRate] = useState(4);
  const [processing,   setProcessing]   = useState(false);
  const [showFilters,  setShowFilters]  = useState(false);
  const [userModal,    setUserModal]    = useState({ open: false, userId: null, data: null });

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setTraderId(user.id); // Store for realtime filter
      // Fetch commission rate (payin_commission column)
      const { data: trader } = await supabase.from('traders').select('payin_commission').eq('id', user.id).single();
      if (trader) setCommissionRate(trader.payin_commission || 4);
      // Fetch payins (limited to 100 for performance)
      const { data: rows } = await supabase
        .from('payins')
        .select('*')
        .eq('trader_id', user.id)
        .order('requested_at', { ascending: false })
        .limit(100);
      setPayins((rows || []).map(r => ({
        ...r,
        traderId: r.trader_id, upiId: r.upi_id, utrId: r.utr,
        userId: r.merchant_id, transactionId: r.transaction_id,
        screenshotUrl: r.screenshot_url, autoRejected: r.auto_rejected,
        // Use requested_at, fallback to created_at for timer
        requestedAt: (r.requested_at || r.created_at) ? { seconds: new Date(r.requested_at || r.created_at).getTime() / 1000 } : null,
        completedAt: r.completed_at ? { seconds: new Date(r.completed_at).getTime() / 1000 } : null,
        rejectedAt: r.rejected_at ? { seconds: new Date(r.rejected_at).getTime() / 1000 } : null,
      })));
      setLoading(false);
    };
    init();
  }, []);

  // Realtime: listen for all changes and filter client-side
  useRealtimeSubscription('payins', {
    // No filter - listen to all payins changes, filter client-side
    enabled: !!traderId,
    onChange: async (eventType, payload) => {
      console.log('📡 Payin realtime event:', eventType, payload?.new?.id);
      
      if (!traderId) return;
      const { data: rows } = await supabase.from('payins').select('*').eq('trader_id', traderId).order('requested_at', { ascending: false }).limit(100);
      setPayins((rows || []).map(r => ({
        ...r, traderId: r.trader_id, upiId: r.upi_id, utrId: r.utr,
        userId: r.merchant_id, transactionId: r.transaction_id,
        screenshotUrl: r.screenshot_url, autoRejected: r.auto_rejected,
        // Use requested_at, fallback to created_at for timer
        requestedAt: (r.requested_at || r.created_at) ? { seconds: new Date(r.requested_at || r.created_at).getTime() / 1000 } : null,
        completedAt: r.completed_at ? { seconds: new Date(r.completed_at).getTime() / 1000 } : null,
        rejectedAt: r.rejected_at ? { seconds: new Date(r.rejected_at).getTime() / 1000 } : null,
      })));
    },
  });

  /* Auto-reject expired (client-side backup - server cron handles this too) */
  useEffect(() => {
    const check = async () => {
      const now = Date.now();
      for (const p of payins.filter(p => p.status==='pending' && !p.utrId)) {
        if (p.requestedAt?.seconds && (now - p.requestedAt.seconds*1000)/60000 >= 15) {
          try {
            const ts = new Date().toISOString();
            await supabase.from('payins').update({
              status: 'rejected', rejected_at: ts,
              rejection_reason: 'Time expired – UTR not submitted within 15 minutes',
              auto_rejected: true, expired_at: ts,
            }).eq('id', p.id);
            setPayins(prev => prev.map(x => x.id === p.id ? { ...x, status: 'rejected', autoRejected: true } : x));
          } catch(e) { console.error(e); }
        }
      }
    };
    check();
    const iv = setInterval(check, 30000);
    return () => clearInterval(iv);
  }, [payins]);

  const filtered = useMemo(() => {
    let r = payins.filter(p => p.status === activeTab);
    if (debouncedSearch) { const s=debouncedSearch.toLowerCase(); r=r.filter(p => p.transactionId?.toLowerCase().includes(s)||p.userId?.toLowerCase().includes(s)||p.amount?.toString().includes(debouncedSearch)); }
    if (dateFrom) r=r.filter(p => (p.requestedAt?.seconds||0)*1000 >= new Date(dateFrom).getTime());
    if (dateTo)   r=r.filter(p => (p.requestedAt?.seconds||0)*1000 <= new Date(dateTo).getTime()+86399999);
    if (amountFilter==="high") r=r.filter(p => Number(p.amount)>10000);
    else if (amountFilter==="low") r=r.filter(p => Number(p.amount)<=10000);
    // Sort: completed by completedAt desc, rejected by rejectedAt desc, pending by requestedAt desc
    r.sort((a, b) => {
      if (activeTab === 'completed') return (b.completedAt?.seconds || 0) - (a.completedAt?.seconds || 0);
      if (activeTab === 'rejected') return (b.rejectedAt?.seconds || 0) - (a.rejectedAt?.seconds || 0);
      return (b.requestedAt?.seconds || 0) - (a.requestedAt?.seconds || 0);
    });
    return r;
  }, [payins, activeTab, debouncedSearch, dateFrom, dateTo, amountFilter]);

  const onAccept = useCallback(async (payin) => {
    setProcessing(true);
    try {
      const amount = Number(payin.amount);
      const traderComm = Math.round((amount * commissionRate) / 100);
      const ts = new Date().toISOString();
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Try RPC first (handles all balance updates atomically)
      const { data: result, error: rpcError } = await supabase.rpc('complete_payin', {
        p_payin_id: payin.id,
        p_trader_id: user.id
      });
      
      if (rpcError) {
        console.warn('RPC failed, using fallback:', rpcError.message);
        
        // Fallback: manual updates
        // Get USDT rate
        let usdtRate = 95; // Default fallback
        try {
          const { data: tatumConfig } = await supabase.from('tatum_config').select('admin_usdt_rate').single();
          if (tatumConfig?.admin_usdt_rate) usdtRate = tatumConfig.admin_usdt_rate;
        } catch (e) { console.warn('USDT rate fetch failed:', e); }
        
        // 1. Update payin status
        const { error: payinError } = await supabase
          .from('payins')
          .update({ status: 'completed', completed_at: ts, commission: traderComm })
          .eq('id', payin.id);
        if (payinError) throw new Error('Failed to update payin: ' + payinError.message);

        // 2. Update trader balance (deduct amount, add commission)
        const { data: td } = await supabase
          .from('traders')
          .select('id, balance, overall_commission')
          .or(`id.eq.${user.id},profile_id.eq.${user.id}`)
          .single();
        
        if (td) {
          const newBalance = (Number(td.balance) || 0) - amount + traderComm;
          await supabase.from('traders').update({
            balance: newBalance,
            overall_commission: (Number(td.overall_commission) || 0) + traderComm,
          }).eq('id', td.id);
        }

        // 3. Credit merchant balance (INR + USDT)
        const { data: merchant } = await supabase
          .from('merchants')
          .select('id, available_balance, usdt_balance, payin_commission, payin_commission_rate')
          .eq('id', payin.merchant_id || payin.userId)
          .single();
        
        if (merchant) {
          const merchantRate = merchant.payin_commission || merchant.payin_commission_rate || 0;
          const merchantFee = Math.round((amount * merchantRate) / 100);
          const merchantCredit = amount - merchantFee;
          const usdtCredit = Math.round((merchantCredit / usdtRate) * 100) / 100;
          
          await supabase.from('merchants').update({
            available_balance: (Number(merchant.available_balance) || 0) + merchantCredit,
            usdt_balance: (Number(merchant.usdt_balance) || 0) + usdtCredit,
          }).eq('id', merchant.id);
          
          // Update payin with USDT info
          await supabase.from('payins').update({
            net_amount_usdt: usdtCredit,
            usdt_rate_at_completion: usdtRate,
          }).eq('id', payin.id);
          
          // Add balance history entry
          await supabase.from('balance_history').insert({
            entity_type: 'merchant',
            entity_id: merchant.id,
            type: 'credit',
            reason: 'payin_completed',
            amount: merchantCredit,
            amount_usdt: usdtCredit,
            usdt_rate: usdtRate,
            note: `Payin #${payin.transactionId || payin.id.slice(-8)}`,
          });
        }
        
        // 4. Credit affiliate commission (if trader has one)
        try {
          await supabase.rpc('credit_affiliate_on_trader_transaction', {
            p_trader_id: td?.id || user.id,
            p_transaction_type: 'payin',
            p_transaction_id: payin.id,
            p_transaction_amount: amount,
            p_trader_earning: traderComm
          });
        } catch (affErr) {
          console.warn('Affiliate credit failed (non-critical):', affErr.message);
        }
      } else if (!result?.success) {
        throw new Error(result?.error || 'Failed to complete payin');
      }
      
      console.log('✅ Payin accepted:', { payinId: payin.id, amount, traderComm });
      
      // Update local state
      setPayins(prev => prev.map(x => x.id === payin.id ? { ...x, status: 'completed', commission: traderComm } : x));
    } catch(e) { 
      console.error('❌ Accept error:', e); 
      alert('Error: ' + e.message);
    }
    setProcessing(false);
  }, [commissionRate]);

  const onReject = useCallback(async (payin) => {
    setProcessing(true);
    try {
      await supabase.from('payins').update({ status: 'rejected', rejected_at: new Date().toISOString(), rejection_reason: 'Rejected by trader' }).eq('id', payin.id);
      setPayins(prev => prev.map(x => x.id === payin.id ? { ...x, status: 'rejected' } : x));
    }
    catch(e) { console.error(e); }
    setProcessing(false);
  }, []);

  const onEditAmount   = useCallback((p) => { setEditingId(p.id); setEditValue(p.amount); }, []);
  const onEditConfirm  = useCallback(async () => {
    if (!editValue||Number(editValue)<1000||Number(editValue)>50000) { alert("Amount must be ₹1,000–₹50,000"); return; }
    setProcessing(true);
    try {
      await supabase.from('payins').update({ amount: Number(editValue) }).eq('id', editingId);
      setPayins(prev => prev.map(x => x.id === editingId ? { ...x, amount: Number(editValue) } : x));
      setEditingId(null); setEditValue("");
    }
    catch(e) { alert("Error: "+e.message); }
    setProcessing(false);
  }, [editValue, editingId]);
  const onEditCancel = useCallback(() => { setEditingId(null); setEditValue(""); }, []);

  const onViewUser = useCallback(async (userId) => {
    try {
      const [piRes, poRes] = await Promise.all([
        supabase.from('payins').select('*').eq('merchant_id', userId).eq('status', 'completed').order('completed_at', { ascending: false }).limit(5),
        supabase.from('payouts').select('*').eq('merchant_id', userId).eq('status', 'completed').order('completed_at', { ascending: false }).limit(5),
      ]);
      const mapTs = r => ({ ...r, completedAt: r.completed_at ? { seconds: new Date(r.completed_at).getTime() / 1000 } : null });
      setUserModal({ open:true, userId, data:{ payins: (piRes.data||[]).map(mapTs), payouts: (poRes.data||[]).map(mapTs) } });
    } catch(e) { alert("Error: "+e.message); }
  }, []);

  const handleExport = useCallback(() => {
    exportToCSV(filtered, [
      {key:"transactionId",header:"Transaction ID"},{key:"userId",header:"User ID"},
      {key:"upiId",header:"UPI ID"},{key:"amount",header:"Amount"},
      {key:"status",header:"Status"},{key:"utrId",header:"UTR"}
    ], `payins-${activeTab}-${Date.now()}.csv`);
  }, [filtered, activeTab]);

  const stats = useMemo(() => {
    const pending   = payins.filter(p=>p.status==='pending').length;
    const completed = payins.filter(p=>p.status==='completed');
    return { pending, completedCount: completed.length, totalCommission: completed.reduce((s,p)=>s+Number(p.commission||0),0) };
  }, [payins]);

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Desktop header */}
      <div className="hidden sm:flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-sm"><TrendingUp className="w-5 h-5 text-white" /></div>
            Payin Management
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 ml-11">Process incoming payments</p>
        </div>
      </div>

      {/* Tabs + export */}
      <div className="flex gap-1.5 items-center">
        <div className="flex-1 flex gap-1 bg-slate-100 rounded-xl p-1 overflow-x-auto" style={{ scrollbarWidth:'none' }}>
          {TABS.map(tab => {
            const count = payins.filter(x=>x.status===tab.key).length;
            return (
              <button key={tab.key} onClick={()=>setActiveTab(tab.key)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab===tab.key ? 'bg-white text-green-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}>
                {tab.label}
                {count>0 && <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${activeTab===tab.key ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>{count}</span>}
              </button>
            );
          })}
        </div>
        <button onClick={handleExport} className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 active:bg-blue-200">
          <Download className="w-4 h-4 text-blue-600" />
        </button>
      </div>

      {/* Search + filter toggle */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent bg-white"
            placeholder="Search ID, user, amount…" value={search} onChange={e=>setSearch(e.target.value)} />
        </div>
        <button onClick={()=>setShowFilters(!showFilters)}
          className={`w-10 h-10 flex items-center justify-center rounded-xl border flex-shrink-0 ${
            showFilters ? 'bg-green-50 border-green-300 text-green-600' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
          }`}>
          <Filter className="w-4 h-4" />
        </button>
      </div>

      {/* Expanded filters */}
      {showFilters && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" /> From</label>
              <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-green-400" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" /> To</label>
              <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-green-400" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1 flex items-center gap-1"><IndianRupee className="w-3 h-3" /> Amount Filter</label>
            <select value={amountFilter} onChange={e=>setAmountFilter(e.target.value)} className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-green-400 bg-white">
              <option value="all">All Amounts</option>
              <option value="high">High (&gt;₹10k)</option>
              <option value="low">Low (≤₹10k)</option>
            </select>
          </div>
        </div>
      )}

      {/* Cards */}
      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i=><SkeletonCard key={i} />)}</div>
      ) : filtered.length===0 ? (
        <EmptyState tab={activeTab} />
      ) : (
        <div className="space-y-3">
          {filtered.map(p => (
            <PayinCard key={p.id} payin={p}
              onAccept={onAccept} onReject={onReject}
              isEditing={editingId===p.id} editValue={editValue} setEditValue={setEditValue}
              onEditAmount={onEditAmount} onEditConfirm={onEditConfirm} onEditCancel={onEditCancel}
              onViewUser={onViewUser} processing={processing} commissionRate={commissionRate} />
          ))}
        </div>
      )}

      {/* ── User History Modal ── */}
      {userModal.open && (
        <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={()=>setUserModal({open:false,userId:null,data:null})} />
          <div className="relative w-full sm:max-w-lg bg-white shadow-2xl rounded-t-2xl sm:rounded-2xl overflow-hidden mt-auto sm:mt-0 max-h-[85vh] flex flex-col">
            <div className="sm:hidden flex justify-center pt-2 pb-1"><div className="w-10 h-1 bg-slate-300 rounded-full" /></div>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">User History</h3>
                <p className="text-xs text-slate-400" style={{ fontFamily:'var(--font-mono)' }}>{userModal.userId}</p>
              </div>
              <button onClick={()=>setUserModal({open:false,userId:null,data:null})} className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              {/* Payins */}
              <div>
                <div className="flex items-center gap-2 mb-2"><div className="w-1.5 h-4 bg-green-500 rounded-full" /><h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide">Recent Payins</h4></div>
                {userModal.data?.payins?.length>0 ? (
                  <div className="space-y-1.5">
                    {userModal.data.payins.map((p,i) => (
                      <div key={i} className="flex justify-between items-center p-2.5 bg-green-50 rounded-lg border border-green-200">
                        <span className="font-bold text-green-700 text-sm">₹{p.amount?.toLocaleString('en-IN')}</span>
                        <span className="text-xs text-slate-500 bg-white px-2 py-0.5 rounded-md">
                          {new Date(p.completedAt?.seconds*1000).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-xs text-slate-400 bg-slate-50 p-2.5 rounded-lg">No recent payins</p>}
              </div>
              {/* Payouts */}
              <div>
                <div className="flex items-center gap-2 mb-2"><div className="w-1.5 h-4 bg-blue-500 rounded-full" /><h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide">Recent Payouts</h4></div>
                {userModal.data?.payouts?.length>0 ? (
                  <div className="space-y-1.5">
                    {userModal.data.payouts.map((p,i) => (
                      <div key={i} className="flex justify-between items-center p-2.5 bg-blue-50 rounded-lg border border-blue-200">
                        <span className="font-bold text-blue-700 text-sm">₹{p.amount?.toLocaleString('en-IN')}</span>
                        <span className="text-xs text-slate-500 bg-white px-2 py-0.5 rounded-md">
                          {new Date(p.completedAt?.seconds*1000).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-xs text-slate-400 bg-slate-50 p-2.5 rounded-lg">No recent payouts</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}