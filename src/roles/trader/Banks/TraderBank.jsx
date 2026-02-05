import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../../firebase';
import {
  Edit, Trash2, Plus, Building2, Wallet, RefreshCw, X, Copy, Shield,
  Briefcase, DollarSign, CheckCircle, AlertCircle, Smartphone, Hash, User,
} from 'lucide-react';
import Toast from '../../../components/admin/Toast';

const CARD_TYPES = [
  { key: 'currentMerchantUpis',   title: 'Current Merchant QR',  icon: Shield,    color: '#059669', bgColor: '#ecfdf5', borderColor: '#a7f3d0', ringClass: 'focus:ring-green-400',   fields: ['upiId','holderName'] },
  { key: 'corporateMerchantUpis', title: 'Corporate Merchant QR',icon: Briefcase, color: '#2563eb', bgColor: '#eff6ff', borderColor: '#bfdbfe', ringClass: 'focus:ring-blue-400',    fields: ['upiId','holderName'] },
  { key: 'normalUpis',            title: 'Normal UPI IDs',       icon: Wallet,    color: '#7c3aed', bgColor: '#f5f3ff', borderColor: '#c4b5fd', ringClass: 'focus:ring-purple-400',  fields: ['upiId','holderName'] },
  { key: 'bigUpis',               title: 'Big Deposit UPI',      icon: DollarSign,color: '#ea580c', bgColor: '#fff7ed', borderColor: '#fdba74', ringClass: 'focus:ring-orange-400',  fields: ['upiId','holderName'], requiresOtherUpi: true },
  { key: 'impsAccounts',          title: 'IMPS Bank Accounts',   icon: Building2, color: '#4f46e5', bgColor: '#eef2ff', borderColor: '#a5b4fc', ringClass: 'focus:ring-indigo-400',  fields: ['accountNumber','ifscCode','holderName'] },
];

/* ─── Toggle ─── */
function Switch({ checked, onChange, disabled }) {
  return (
    <button onClick={onChange} disabled={disabled}
      className={`relative w-12 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
        disabled ? 'opacity-40 cursor-not-allowed bg-slate-300' : checked ? 'bg-green-500' : 'bg-slate-300'
      }`}>
      <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-200 shadow-sm ${checked ? 'translate-x-6' : 'translate-x-0'}`} />
    </button>
  );
}

/* ─── Account Card ─── */
function AccountCard({ entry, onToggle, onEdit, onDelete, disabled }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (text) => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  return (
    <div className={`relative rounded-xl border p-3 transition-all duration-200 ${entry.active ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-50 border-slate-200 opacity-70'}`}>
      <div className={`absolute top-0 left-0 w-1 h-full rounded-l-xl ${entry.active ? 'bg-green-500' : 'bg-slate-300'}`} />
      <div className="pl-3">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex-1 min-w-0">
            {entry.upiId && (
              <div className="flex items-center gap-1.5">
                <p className="font-mono text-sm font-bold text-slate-900 truncate" style={{ fontFamily: 'var(--font-mono)' }}>{entry.upiId}</p>
                <button onClick={() => handleCopy(entry.upiId)} className="p-1 hover:bg-slate-100 rounded flex-shrink-0">
                  {copied ? <CheckCircle className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                </button>
              </div>
            )}
            {entry.accountNumber && (
              <div className="space-y-0.5">
                <p className="font-mono text-xs font-bold text-slate-900" style={{ fontFamily: 'var(--font-mono)' }}>Acc: {entry.accountNumber}</p>
                <p className="font-mono text-xs text-slate-500" style={{ fontFamily: 'var(--font-mono)' }}>IFSC: {entry.ifscCode}</p>
              </div>
            )}
            <p className="text-xs text-slate-500 mt-1">{entry.holderName}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Switch checked={!!entry.active} onChange={onToggle} disabled={disabled && !entry.active} />
            <button onClick={onEdit}   className="w-8 h-8 flex items-center justify-center hover:bg-blue-50  rounded-lg"><Edit   className="w-3.5 h-3.5 text-blue-600" /></button>
            <button onClick={onDelete} className="w-8 h-8 flex items-center justify-center hover:bg-red-50   rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-500"  /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TraderBank() {
  const [traderId,      setTraderId]      = useState(null);
  const [form,          setForm]          = useState({});
  const [editIndex,     setEditIndex]     = useState(null);
  const [openModal,     setOpenModal]     = useState(null);
  const [traderData,    setTraderData]    = useState({});
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [workingBalance,setWorkingBalance]= useState(0);   // ← derived
  const [toast,         setToast]         = useState(null);
  const [filterType,    setFilterType]    = useState('all'); // 'all' or card.key

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      setTraderId(user.uid);
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, 'trader', user.uid));
        if (snap.exists()) {
          const d = snap.data();
          setTraderData(d);
          /* ✅ BUG FIX: derive workingBalance — field doesn't exist in Firestore */
          const wb = (Number(d.balance) || 0) - (Number(d.securityHold) || 0);
          setWorkingBalance(wb);
          if (wb < 30000) await autoDisableUPIs(user.uid, d);
        }
      } catch (e) { console.error(e); setToast({ msg: 'Error loading data', success: false }); }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const autoDisableUPIs = async (uid, data) => {
    try {
      const updated = { ...data };
      let changed = false;
      for (const type of ['currentMerchantUpis','corporateMerchantUpis','normalUpis','bigUpis']) {
        if (Array.isArray(updated[type])) {
          updated[type] = updated[type].map(e => {
            if (e.active) { changed = true; return { ...e, active: false }; }
            return e;
          });
        }
      }
      if (changed) {
        await setDoc(doc(db, 'trader', uid), updated, { merge: true });
        setTraderData(updated);
        setToast({ msg: '⚠️ UPIs disabled – working balance below ₹30,000', success: false });
      }
    } catch (e) { console.error(e); }
  };

  const hasOtherActiveUPI = () =>
    ['currentMerchantUpis','corporateMerchantUpis','normalUpis'].some(t => (traderData[t]||[]).some(e => e.active));

  const saveToSavedBanks = async (entry, type, isDelete = false) => {
    try {
      const id = `${traderId}_${entry.upiId || entry.accountNumber}_${type}`;
      await setDoc(doc(db, 'savedBanks', id), {
        traderId, type,
        upiId: entry.upiId || null, accountNumber: entry.accountNumber || null,
        ifscCode: entry.ifscCode || null, holderName: entry.holderName || null,
        isActive: entry.active || false, isDeleted: isDelete,
        deletedAt: isDelete ? serverTimestamp() : null,
        lastModified: serverTimestamp(),
        ...(isDelete ? {} : { addedAt: serverTimestamp() }),
      }, { merge: true });
    } catch (e) { console.error(e); }
  };

  const handleInputChange = (key, e) => {
    let v = e.target.value;
    if (key === 'ifscCode') v = v.toUpperCase();
    setForm({ ...form, [key]: v });
  };

  const validateForm = (type) => {
    const ct = CARD_TYPES.find(c => c.key === type);
    for (const f of ct.fields) {
      if (!form[f] || !form[f].trim()) { setToast({ msg: `Please fill in ${f.replace(/([A-Z])/g,' $1').trim()}`, success: false }); return false; }
    }
    if (form.ifscCode && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(form.ifscCode))      { setToast({ msg: 'Invalid IFSC. E.g. SBIN0001234', success: false }); return false; }
    if (form.accountNumber && !/^\d{9,18}$/.test(form.accountNumber))          { setToast({ msg: 'Account must be 9–18 digits', success: false }); return false; }
    if (form.upiId && !/^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/.test(form.upiId))    { setToast({ msg: 'Invalid UPI. E.g. name@paytm', success: false }); return false; }
    return true;
  };

  const handleAdd = async (type) => {
    if (!validateForm(type)) return;
    setSaving(true);
    try {
      const entry    = { ...form, active: false };
      const existing = traderData[type] || [];
      const isDup    = existing.some((item, idx) => {
        if (idx === editIndex) return false;
        const a = { ...item }; const b = { ...entry }; delete a.active; delete b.active;
        return JSON.stringify(a) === JSON.stringify(b);
      });
      if (isDup) { setToast({ msg: 'This account already exists', success: false }); setSaving(false); return; }

      let arr;
      if (editIndex !== null) { arr = [...existing]; arr[editIndex] = entry; }
      else { arr = [...existing, entry]; await saveToSavedBanks(entry, type); }

      await setDoc(doc(db, 'trader', traderId), { [type]: arr }, { merge: true });
      setTraderData(prev => ({ ...prev, [type]: arr }));
      setOpenModal(null); setForm({}); setEditIndex(null);
      setToast({ msg: editIndex !== null ? '✅ Account updated!' : '✅ Account added!', success: true });
    } catch (e) { console.error(e); setToast({ msg: 'Error saving account', success: false }); }
    setSaving(false);
  };

  const syncPool = async (entry, active, type) => {
    try {
      const id  = entry.upiId || entry.accountNumber;
      const ref = doc(db, 'upi_pool', id);
      if (active) {
        await setDoc(ref, {
          upiId: entry.upiId||'', accountNumber: entry.accountNumber||'',
          traderId, type, priority: traderData.priority||'Normal',
          active: true, holderName: entry.holderName||'', ifscCode: entry.ifscCode||'',
        });
      } else { await deleteDoc(ref); }
    } catch (e) { console.error(e); }
  };

  const toggleActive = async (type, index) => {
    /* ✅ BUG FIX: guard now uses computed workingBalance, not the missing field */
    if (workingBalance < 30000) { setToast({ msg: '❌ Working balance below ₹30,000. Please recharge.', success: false }); return; }
    const ct      = CARD_TYPES.find(c => c.key === type);
    const current = traderData[type][index];
    if (ct.requiresOtherUpi && !current.active && !hasOtherActiveUPI()) {
      setToast({ msg: '❌ Enable another UPI type first to activate Big Deposit UPI', success: false }); return;
    }
    try {
      const arr = [...(traderData[type]||[])];
      arr[index].active = !arr[index].active;
      setTraderData(prev => ({ ...prev, [type]: arr }));
      await setDoc(doc(db, 'trader', traderId), { [type]: arr }, { merge: true });
      await syncPool(arr[index], arr[index].active, type);
      await saveToSavedBanks(arr[index], type);
    } catch (e) {
      console.error(e);
      setToast({ msg: 'Error updating status', success: false });
      const arr = [...(traderData[type]||[])]; arr[index].active = !arr[index].active;
      setTraderData(prev => ({ ...prev, [type]: arr }));
    }
  };

  const handleDelete = async (type, index) => {
    if (!window.confirm('Delete this account?')) return;
    try {
      const arr = [...(traderData[type]||[])];
      const [deleted] = arr.splice(index, 1);
      await setDoc(doc(db, 'trader', traderId), { [type]: arr }, { merge: true });
      await deleteDoc(doc(db, 'upi_pool', deleted.upiId || deleted.accountNumber));
      await saveToSavedBanks(deleted, type, true);
      setTraderData(prev => ({ ...prev, [type]: arr }));
      setToast({ msg: '✅ Account deleted!', success: true });
    } catch (e) { console.error(e); setToast({ msg: 'Error deleting account', success: false }); }
  };

  const handleEdit = (card, index) => { setForm(traderData[card.key][index]); setEditIndex(index); setOpenModal(card); };

  const handleRefresh = async () => {
    if (!traderId) return;
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'trader', traderId));
      if (snap.exists()) {
        const d = snap.data();
        setTraderData(d);
        setWorkingBalance((Number(d.balance)||0) - (Number(d.securityHold)||0));
      }
    } catch (e) { setToast({ msg: 'Error refreshing', success: false }); }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Header skeleton */}
        <div className="space-y-2">
          <div className="h-8 bg-slate-200 rounded w-1/3 animate-pulse"></div>
          <div className="h-4 bg-slate-200 rounded w-1/2 animate-pulse"></div>
        </div>

        {/* Balance card skeleton */}
        <div className="bg-gradient-to-br from-purple-600 to-blue-600 rounded-2xl p-4">
          <div className="h-4 bg-white/20 rounded w-1/4 mb-3 animate-pulse"></div>
          <div className="h-10 bg-white/20 rounded w-1/2 animate-pulse"></div>
        </div>

        {/* Cards skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="h-4 bg-slate-200 rounded w-1/2 animate-pulse"></div>
                <div className="h-6 bg-slate-200 rounded-full w-12 animate-pulse"></div>
              </div>
              <div className="space-y-2">
                <div className="h-3 bg-slate-200 rounded w-full animate-pulse"></div>
                <div className="h-3 bg-slate-200 rounded w-3/4 animate-pulse"></div>
              </div>
            </div>
          ))}
        </div>

        {/* UPI list skeleton */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="h-4 bg-slate-200 rounded w-1/4 animate-pulse"></div>
          </div>
          <div className="divide-y divide-slate-100">
            {[1, 2, 3].map(i => (
              <div key={i} className="px-4 py-3 flex items-center justify-between">
                <div className="space-y-2 flex-1">
                  <div className="h-3 bg-slate-200 rounded w-2/3 animate-pulse"></div>
                  <div className="h-2 bg-slate-200 rounded w-1/2 animate-pulse"></div>
                </div>
                <div className="h-8 w-16 bg-slate-200 rounded-lg animate-pulse"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* Desktop header */}
      <div className="hidden sm:flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-sm"><Building2 className="w-5 h-5 text-white" /></div>
            Bank & UPI
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 ml-11">Manage payment accounts</p>
        </div>
        <button onClick={handleRefresh} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 text-sm font-semibold">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Mobile refresh */}
      <div className="flex sm:hidden justify-end">
        <button onClick={handleRefresh} className="p-2 bg-purple-50 border border-purple-200 rounded-xl hover:bg-purple-100 active:bg-purple-200">
          <RefreshCw className="w-4 h-4 text-purple-600" />
        </button>
      </div>

      {/* Low balance warning */}
      {workingBalance < 30000 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 flex items-start gap-2.5">
          <AlertCircle className="w-4.5 h-4.5 text-orange-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-orange-800 text-sm">Low Balance</p>
            <p className="text-xs text-orange-600 mt-0.5">Working balance ₹{workingBalance.toLocaleString()} is below ₹30,000. UPIs are disabled until you recharge.</p>
          </div>
        </div>
      )}

      {/* Filter Pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilterType('all')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            filterType === 'all' ? 'bg-slate-700 text-white ring-2 ring-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          All Types
          <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${filterType === 'all' ? 'bg-white/20' : 'bg-slate-200 text-slate-600'}`}>
            {CARD_TYPES.reduce((sum, card) => sum + (traderData[card.key] || []).length, 0)}
          </span>
        </button>
        {CARD_TYPES.map(card => {
          const Icon = card.icon;
          const count = (traderData[card.key] || []).length;
          const activeCount = (traderData[card.key] || []).filter(e => e.active).length;
          return (
            <button
              key={card.key}
              onClick={() => setFilterType(card.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filterType === card.key ? `ring-2` : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              style={filterType === card.key ? { backgroundColor: card.bgColor, color: card.color, borderColor: card.borderColor, ringColor: card.color } : {}}
            >
              <Icon className="w-3.5 h-3.5" />
              {card.title.replace(' UPI IDs', '').replace(' Bank Accounts', '').replace(' Deposit UPI', '')}
              <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${
                filterType === card.key ? 'bg-white/60' : 'bg-slate-200 text-slate-600'
              }`}>
                {count > 0 && `${activeCount}/${count}`}
                {count === 0 && '0'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Card sections */}
      <div className="space-y-3">
        {CARD_TYPES.filter(card => filterType === 'all' || filterType === card.key).map(card => {
          const Icon        = card.icon;
          const entries     = traderData[card.key] || [];
          const activeCount = entries.filter(e => e.active).length;
          const canToggleBig = card.requiresOtherUpi ? hasOtherActiveUPI() : true;

          return (
            <div key={card.key} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2.5" style={{ backgroundColor: card.bgColor }}>
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: card.bgColor, border: `1px solid ${card.borderColor}` }}>
                    <Icon className="w-4 h-4" style={{ color: card.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-bold text-slate-900 truncate">{card.title}</h2>
                    {card.requiresOtherUpi && (
                      <p className="text-xs text-amber-600 font-medium flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> Requires other UPI active
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{ color: card.color, backgroundColor: card.bgColor, border: `1px solid ${card.borderColor}` }}>
                    {activeCount} Active
                  </span>
                  <button onClick={() => { setOpenModal(card); setForm({}); setEditIndex(null); }}
                    className="w-8 h-8 flex items-center justify-center text-white rounded-lg hover:opacity-90 active:scale-[0.95] flex-shrink-0"
                    style={{ backgroundColor: card.color }}>
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* List */}
              <div className="p-3">
                {entries.length === 0 ? (
                  <div className="text-center py-5">
                    <Icon className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                    <p className="text-slate-500 text-xs font-medium">No accounts yet – tap + to add</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {entries.map((entry, idx) => (
                      <AccountCard key={idx} entry={entry}
                        onToggle={() => toggleActive(card.key, idx)}
                        onEdit={() => handleEdit(card, idx)}
                        onDelete={() => handleDelete(card.key, idx)}
                        disabled={card.requiresOtherUpi && !entry.active && !canToggleBig}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── ADD / EDIT MODAL ── */}
      {openModal && (
        <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setOpenModal(null); setForm({}); setEditIndex(null); }} />
          <div className="relative w-full sm:w-full sm:max-w-md bg-white shadow-2xl sm:rounded-2xl rounded-t-2xl overflow-hidden mt-auto sm:mt-0 max-h-[90vh] sm:max-h-[85vh] flex flex-col">
            {/* Handle */}
            <div className="sm:hidden flex justify-center pt-2 pb-1"><div className="w-10 h-1 bg-slate-300 rounded-full" /></div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">{editIndex !== null ? 'Edit' : 'Add'} {openModal.title}</h3>
              <button onClick={() => { setOpenModal(null); setForm({}); setEditIndex(null); }} className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {openModal.fields.map((field, idx) => (
                <div key={field}>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide flex items-center gap-1.5">
                    {field === 'upiId'          && <Smartphone className="w-3.5 h-3.5 text-purple-600" />}
                    {field === 'accountNumber'  && <Building2   className="w-3.5 h-3.5 text-blue-600" />}
                    {field === 'ifscCode'       && <Hash        className="w-3.5 h-3.5 text-green-600" />}
                    {field === 'holderName'     && <User        className="w-3.5 h-3.5 text-slate-500" />}
                    {field.replace(/([A-Z])/g, ' $1').trim()} *
                  </label>
                  {/* ✅ FIX: use Tailwind ring class instead of broken inline focusRingColor */}
                  <input
                    type="text"
                    value={form[field] || ''}
                    placeholder={
                      field === 'upiId' ? 'e.g. name@paytm' :
                      field === 'ifscCode' ? 'e.g. SBIN0001234' :
                      field === 'accountNumber' ? '9–18 digit number' : 'Enter name'
                    }
                    className={`w-full px-3 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:border-transparent ${openModal.ringClass} ${
                      ['ifscCode','upiId','accountNumber'].includes(field) ? 'font-mono' : ''
                    }`}
                    style={['ifscCode','upiId','accountNumber'].includes(field) ? { fontFamily: 'var(--font-mono)' } : {}}
                    onChange={(e) => handleInputChange(field, e)}
                    autoFocus={idx === 0}
                  />
                  {field === 'ifscCode'       && <p className="text-xs text-slate-400 mt-1">Example: SBIN0001234</p>}
                  {field === 'accountNumber'  && <p className="text-xs text-slate-400 mt-1">Must be 9–18 digits</p>}
                  {field === 'upiId'          && <p className="text-xs text-slate-400 mt-1">Example: name@paytm, phone@ybl</p>}
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-slate-100 flex gap-2.5">
              <button onClick={() => { setOpenModal(null); setForm({}); setEditIndex(null); }}
                className="flex-1 py-3 border border-slate-300 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 active:bg-slate-100">Cancel</button>
              <button onClick={() => handleAdd(openModal.key)}
                disabled={openModal.fields.some(f => !form[f]) || saving}
                className="flex-1 py-3 text-white rounded-xl text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.97]"
                style={{ backgroundColor: openModal.color }}>
                {saving ? <><RefreshCw className="animate-spin w-4 h-4" /> Saving…</> : (editIndex !== null ? 'Update Account' : 'Add Account')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}