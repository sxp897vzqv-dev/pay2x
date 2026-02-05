import React, { useEffect, useState, useMemo, useCallback, memo } from "react";
import { db } from "../../../firebase";
import {
  collection, query, where, onSnapshot, updateDoc, doc,
  serverTimestamp, runTransaction, getDocs, orderBy, limit
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import {
  CheckCircle, XCircle, Edit, Search, FileText, AlertCircle,
  MoreHorizontal, Download, TrendingUp, RefreshCw, Filter, X,
  Calendar, CreditCard, Hash, User, DollarSign, Clock, Inbox
} from "lucide-react";

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

/* ─── Skeleton ─── */
const SkeletonCard = memo(() => (
  <div className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse space-y-3">
    <div className="flex justify-between">
      <div className="h-3 bg-slate-200 rounded w-24" />
      <div className="h-3 bg-slate-200 rounded w-16" />
    </div>
    <div className="grid grid-cols-2 gap-2">
      {[1,2,3,4].map(i => (
        <div key={i} className="bg-slate-50 rounded-lg p-2.5">
          <div className="h-2 bg-slate-200 rounded w-12 mb-1.5" />
          <div className="h-3 bg-slate-200 rounded w-16" />
        </div>
      ))}
    </div>
    <div className="flex gap-2">
      <div className="flex-1 h-10 bg-slate-200 rounded-xl" />
      <div className="flex-1 h-10 bg-slate-200 rounded-xl" />
    </div>
  </div>
));
SkeletonCard.displayName = 'SkeletonCard';

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
        const rem = (25 * 60 * 1000) - (Date.now() - payin.requestedAt.seconds * 1000);
        if (rem > 0) setRemainingTime({ min: Math.floor(rem/60000), sec: Math.floor((rem%60000)/1000), expiring: rem < 300000 });
        else         setRemainingTime({ min: 0, sec: 0, expiring: true });
      };
      update();
      const iv = setInterval(update, 1000);
      return () => clearInterval(iv);
    }
  }, [payin.status, payin.utrId, payin.requestedAt]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className={`h-1 ${payin.status === 'completed' ? 'bg-green-500' : payin.status === 'rejected' ? 'bg-red-500' : 'bg-blue-500'}`} />
      <div className="p-3 space-y-3">

        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 mb-0.5">Transaction ID</p>
            <p className="font-mono text-sm font-bold text-slate-900 truncate bg-slate-50 px-2 py-1 rounded-lg inline-block" style={{ fontFamily: 'var(--font-mono)' }}>
              {payin.transactionId || payin.id.slice(-8)}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {payin.status === 'pending' && !hasUtr && remainingTime && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-lg flex items-center gap-0.5 ${remainingTime.expiring ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
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
            <div className="flex items-center gap-1 mb-1"><DollarSign className="w-3 h-3 text-green-600" /><p className="text-xs font-bold text-slate-600 uppercase">Amount</p></div>
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
          <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${
            payin.status === "completed" ? "bg-green-100 text-green-800 border border-green-200" : "bg-red-100 text-red-800 border border-red-200"
          }`}>
            {payin.status === "completed" ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
            <span className="capitalize">{payin.status}{payin.autoRejected ? ' (Time Expired)' : ''}</span>
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
    const user = getAuth().currentUser;
    if (!user) return;
    const fetchComm = async () => {
      const s = await getDocs(query(collection(db,'trader'), where('uid','==',user.uid)));
      if (!s.empty) setCommissionRate(s.docs[0].data().commissionRate || 4);
    };
    fetchComm();
    const unsub = onSnapshot(
      query(collection(db,"payin"), where("traderId","==",user.uid), orderBy("requestedAt","desc"), limit(200)),
      snap => { const d=[]; snap.forEach(doc => d.push({id:doc.id,...doc.data()})); setPayins(d); setLoading(false); }
    );
    return () => unsub();
  }, []);

  /* Auto-reject expired */
  useEffect(() => {
    const check = async () => {
      const now = Date.now();
      for (const p of payins.filter(p => p.status==='pending' && !p.utrId)) {
        if (p.requestedAt?.seconds && (now - p.requestedAt.seconds*1000)/60000 >= 25) {
          try {
            await updateDoc(doc(db,"payin",p.id), {
              status:"rejected", rejectedAt: serverTimestamp(),
              rejectionReason:"Time expired – UTR not submitted within 25 minutes",
              autoRejected:true, expiredAt: serverTimestamp()
            });
          } catch(e) { console.error(e); }
        }
      }
    };
    check();
    const iv = setInterval(check, 60000);
    return () => clearInterval(iv);
  }, [payins]);

  const filtered = useMemo(() => {
    let r = payins.filter(p => p.status === activeTab);
    if (debouncedSearch) { const s=debouncedSearch.toLowerCase(); r=r.filter(p => p.transactionId?.toLowerCase().includes(s)||p.userId?.toLowerCase().includes(s)||p.amount?.toString().includes(debouncedSearch)); }
    if (dateFrom) r=r.filter(p => (p.requestedAt?.seconds||0)*1000 >= new Date(dateFrom).getTime());
    if (dateTo)   r=r.filter(p => (p.requestedAt?.seconds||0)*1000 <= new Date(dateTo).getTime()+86399999);
    if (amountFilter==="high") r=r.filter(p => Number(p.amount)>10000);
    else if (amountFilter==="low") r=r.filter(p => Number(p.amount)<=10000);
    return r;
  }, [payins, activeTab, debouncedSearch, dateFrom, dateTo, amountFilter]);

  const onAccept = useCallback(async (payin) => {
    setProcessing(true);
    try {
      await runTransaction(db, async (tx) => {
        const payinRef = doc(db,"payin",payin.id);
        const comm = Math.round((Number(payin.amount)*commissionRate)/100);
        tx.update(payinRef, { status:"completed", completedAt: serverTimestamp(), commission: comm });
        const user = getAuth().currentUser;
        const tSnap = await getDocs(query(collection(db,'trader'), where('uid','==',user.uid)));
        if (!tSnap.empty) {
          const tRef = doc(db,'trader',tSnap.docs[0].id);
          const td   = tSnap.docs[0].data();
          tx.update(tRef, {
            balance: (Number(td.balance)||0) - Number(payin.amount) + comm,
            overallCommission: (Number(td.overallCommission)||0) + comm,
          });
        }
      });
    } catch(e) { console.error(e); }
    setProcessing(false);
  }, [commissionRate]);

  const onReject = useCallback(async (payin) => {
    setProcessing(true);
    try { await updateDoc(doc(db,"payin",payin.id), { status:"rejected", rejectedAt: serverTimestamp(), rejectionReason:"Rejected by trader" }); }
    catch(e) { console.error(e); }
    setProcessing(false);
  }, []);

  const onEditAmount   = useCallback((p) => { setEditingId(p.id); setEditValue(p.amount); }, []);
  const onEditConfirm  = useCallback(async () => {
    if (!editValue||Number(editValue)<1000||Number(editValue)>50000) { alert("Amount must be ₹1,000–₹50,000"); return; }
    setProcessing(true);
    try { await updateDoc(doc(db,"payin",editingId), { amount: Number(editValue) }); setEditingId(null); setEditValue(""); }
    catch(e) { alert("Error: "+e.message); }
    setProcessing(false);
  }, [editValue, editingId]);
  const onEditCancel = useCallback(() => { setEditingId(null); setEditValue(""); }, []);

  const onViewUser = useCallback(async (userId) => {
    try {
      const [piS, poS] = await Promise.all([
        getDocs(query(collection(db,"payin"),  where("userId","==",userId), where("status","==","completed"), orderBy("completedAt","desc"), limit(5))),
        getDocs(query(collection(db,"payouts"),where("userId","==",userId), where("status","==","completed"), orderBy("completedAt","desc"), limit(5))),
      ]);
      const pi=[],po=[];
      piS.forEach(d=>pi.push(d.data())); poS.forEach(d=>po.push(d.data()));
      setUserModal({ open:true, userId, data:{payins:pi, payouts:po} });
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
            <label className="block text-xs font-bold text-slate-500 mb-1 flex items-center gap-1"><DollarSign className="w-3 h-3" /> Amount Filter</label>
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