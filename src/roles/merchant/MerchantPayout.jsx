import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
import {
  collection, query, where, onSnapshot, addDoc, serverTimestamp, orderBy, getDocs, updateDoc, doc,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import {
  TrendingDown, Plus, Search, Download, Filter, X, CheckCircle, XCircle,
  Clock, AlertCircle, Building, CreditCard, User, Hash, RefreshCw, Calendar, Ban,
} from 'lucide-react';

/* ─── Payout Card ─── */
function PayoutCard({ payout, onCancel }) {
  const statusColors = {
    queued: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: Clock },
    processing: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', icon: RefreshCw },
    completed: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', icon: CheckCircle },
    failed: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: XCircle },
  };

  const status = statusColors[payout.status] || statusColors.queued;
  const StatusIcon = status.icon;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className={`h-1 ${payout.status === 'completed' ? 'bg-green-500' : payout.status === 'failed' ? 'bg-red-500' : 'bg-blue-500'}`} />
      <div className="p-3 space-y-3">

        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 mb-0.5">Payout ID</p>
            <p className="font-mono text-sm font-bold text-slate-900 truncate bg-slate-50 px-2 py-1 rounded-lg inline-block" style={{ fontFamily: 'var(--font-mono)' }}>
              {payout.payoutId || payout.id.slice(-8)}
            </p>
          </div>
          <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${status.bg} ${status.border} ${status.text} flex items-center gap-1 border flex-shrink-0`}>
            <StatusIcon className={`w-3 h-3 ${payout.status === 'processing' ? 'animate-spin' : ''}`} />
            {payout.status?.toUpperCase()}
          </span>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
            <div className="flex items-center gap-1 mb-1">
              <User className="w-3 h-3 text-purple-600" />
              <p className="text-xs font-bold text-slate-400 uppercase">Beneficiary</p>
            </div>
            <p className="text-xs font-bold text-slate-800 truncate">{payout.beneficiaryName || 'N/A'}</p>
          </div>

          <div className="bg-blue-50 rounded-lg p-2.5 border border-blue-200">
            <div className="flex items-center gap-1 mb-1">
              <CreditCard className="w-3 h-3 text-blue-600" />
              <p className="text-xs font-bold text-slate-600 uppercase">Amount</p>
            </div>
            <p className="text-base font-bold text-blue-700">₹{payout.amount?.toLocaleString()}</p>
          </div>

          {payout.paymentMode === 'upi' ? (
            <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100 col-span-2">
              <div className="flex items-center gap-1 mb-1">
                <CreditCard className="w-3 h-3 text-green-600" />
                <p className="text-xs font-bold text-slate-400 uppercase">UPI ID</p>
              </div>
              <p className="text-xs font-semibold text-slate-800" style={{ fontFamily: 'var(--font-mono)' }}>
                {payout.upiId || 'N/A'}
              </p>
            </div>
          ) : (
            <>
              <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                <div className="flex items-center gap-1 mb-1">
                  <Building className="w-3 h-3 text-indigo-600" />
                  <p className="text-xs font-bold text-slate-400 uppercase">Account</p>
                </div>
                <p className="text-xs font-bold text-slate-800 truncate" style={{ fontFamily: 'var(--font-mono)' }}>
                  ***{payout.accountNumber?.slice(-4) || 'N/A'}
                </p>
              </div>
              <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                <div className="flex items-center gap-1 mb-1">
                  <Hash className="w-3 h-3 text-teal-600" />
                  <p className="text-xs font-bold text-slate-400 uppercase">IFSC</p>
                </div>
                <p className="text-xs font-semibold text-slate-800" style={{ fontFamily: 'var(--font-mono)' }}>
                  {payout.ifscCode || 'N/A'}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Trader info (if processing/completed) */}
        {payout.traderId && (
          <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 rounded-lg border border-purple-200 text-xs">
            <User className="w-3.5 h-3.5 text-purple-600" />
            <span className="font-semibold text-purple-900">
              Assigned to: {payout.traderName || payout.traderId.slice(0, 8)}
            </span>
          </div>
        )}

        {/* UTR (if completed) */}
        {payout.utrId && (
          <div className="flex items-center justify-between px-3 py-2 bg-green-50 rounded-lg border border-green-200 text-xs">
            <span className="font-semibold text-green-900">UTR: {payout.utrId}</span>
            {payout.proofUrl && (
              <a href={payout.proofUrl} target="_blank" rel="noopener noreferrer" className="text-green-600 underline flex items-center gap-1">
                View Proof
              </a>
            )}
          </div>
        )}

        {/* Failure reason */}
        {payout.status === 'failed' && payout.failureReason && (
          <div className="flex items-start gap-2 px-3 py-2 bg-red-50 rounded-lg border border-red-200 text-xs">
            <AlertCircle className="w-3.5 h-3.5 text-red-600 flex-shrink-0 mt-0.5" />
            <span className="text-red-800">{payout.failureReason}</span>
          </div>
        )}

        {/* Timestamp */}
        <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-100">
          <div className="flex items-center gap-1">
            <Clock size={11} />
            {new Date((payout.createdAt?.seconds || 0) * 1000).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
          </div>
          {payout.purpose && (
            <span className="text-slate-600 capitalize">{payout.purpose}</span>
          )}
        </div>

        {/* Cancel button for queued payouts */}
        {payout.status === 'queued' && (
          <button
            onClick={() => onCancel(payout.id)}
            className="w-full py-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-semibold hover:bg-red-100 flex items-center justify-center gap-1"
          >
            <Ban className="w-3.5 h-3.5" />
            Cancel Payout
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Create Payout Modal ─── */
function CreatePayoutModal({ onClose, onSubmit, availableBalance }) {
  const [form, setForm] = useState({
    beneficiaryName: '',
    paymentMode: 'upi',
    upiId: '',
    accountNumber: '',
    ifscCode: '',
    amount: '',
    purpose: 'withdrawal',
  });
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (key, value) => {
    if (key === 'ifscCode') value = value.toUpperCase();
    setForm({ ...form, [key]: value });
  };

  const validate = () => {
    if (!form.beneficiaryName.trim()) { alert('Enter beneficiary name'); return false; }
    if (!form.amount || Number(form.amount) <= 0) { alert('Enter valid amount'); return false; }
    if (Number(form.amount) > availableBalance) { alert(`Insufficient balance. Available: ₹${availableBalance}`); return false; }
    
    if (form.paymentMode === 'upi') {
      if (!form.upiId || !/^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/.test(form.upiId)) {
        alert('Invalid UPI ID'); return false;
      }
    } else {
      if (!form.accountNumber || !/^\d{9,18}$/.test(form.accountNumber)) {
        alert('Account number must be 9-18 digits'); return false;
      }
      if (!form.ifscCode || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(form.ifscCode)) {
        alert('Invalid IFSC code'); return false;
      }
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      await onSubmit(form);
      onClose();
    } catch (e) {
      alert('Error: ' + e.message);
    }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-white shadow-2xl rounded-t-2xl sm:rounded-2xl overflow-hidden mt-auto sm:mt-0 max-h-[90vh] flex flex-col">
        {/* Handle */}
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 bg-slate-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-900">Create Payout</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Available balance */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
            <p className="text-xs text-blue-600 mb-0.5">Available Balance</p>
            <p className="text-2xl font-bold text-blue-900">₹{availableBalance.toLocaleString()}</p>
          </div>

          {/* Beneficiary name */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide flex items-center gap-1">
              <User className="w-3.5 h-3.5" /> Beneficiary Name *
            </label>
            <input
              type="text"
              value={form.beneficiaryName}
              onChange={e => handleChange('beneficiaryName', e.target.value)}
              placeholder="Enter name"
              className="w-full px-3 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            />
          </div>

          {/* Payment mode */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Payment Mode *</label>
            <div className="flex gap-2.5">
              <button
                onClick={() => handleChange('paymentMode', 'upi')}
                className={`flex-1 p-3 rounded-xl border-2 transition-all text-center ${
                  form.paymentMode === 'upi' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-300 bg-white'
                }`}
              >
                <CreditCard className={`w-5 h-5 mx-auto mb-1 ${form.paymentMode === 'upi' ? 'text-blue-600' : 'text-slate-300'}`} />
                <p className={`text-sm font-bold ${form.paymentMode === 'upi' ? 'text-blue-800' : 'text-slate-500'}`}>UPI</p>
              </button>
              <button
                onClick={() => handleChange('paymentMode', 'bank')}
                className={`flex-1 p-3 rounded-xl border-2 transition-all text-center ${
                  form.paymentMode === 'bank' ? 'border-green-500 bg-green-50' : 'border-slate-200 hover:border-green-300 bg-white'
                }`}
              >
                <Building className={`w-5 h-5 mx-auto mb-1 ${form.paymentMode === 'bank' ? 'text-green-600' : 'text-slate-300'}`} />
                <p className={`text-sm font-bold ${form.paymentMode === 'bank' ? 'text-green-800' : 'text-slate-500'}`}>Bank</p>
              </button>
            </div>
          </div>

          {/* Payment details */}
          {form.paymentMode === 'upi' ? (
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide flex items-center gap-1">
                <CreditCard className="w-3.5 h-3.5" /> UPI ID *
              </label>
              <input
                type="text"
                value={form.upiId}
                onChange={e => handleChange('upiId', e.target.value)}
                placeholder="name@paytm"
                className="w-full px-3 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent font-mono"
                style={{ fontFamily: 'var(--font-mono)' }}
              />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide flex items-center gap-1">
                  <Building className="w-3.5 h-3.5" /> Account Number *
                </label>
                <input
                  type="text"
                  value={form.accountNumber}
                  onChange={e => handleChange('accountNumber', e.target.value)}
                  placeholder="9-18 digit number"
                  className="w-full px-3 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent font-mono"
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide flex items-center gap-1">
                  <Hash className="w-3.5 h-3.5" /> IFSC Code *
                </label>
                <input
                  type="text"
                  value={form.ifscCode}
                  onChange={e => handleChange('ifscCode', e.target.value)}
                  placeholder="SBIN0001234"
                  className="w-full px-3 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent font-mono"
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
              </div>
            </>
          )}

          {/* Amount */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Amount *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-semibold">₹</span>
              <input
                type="number"
                value={form.amount}
                onChange={e => handleChange('amount', e.target.value)}
                placeholder="0"
                className="w-full pl-8 pr-3 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent font-bold"
              />
            </div>
          </div>

          {/* Purpose */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Purpose</label>
            <select
              value={form.purpose}
              onChange={e => handleChange('purpose', e.target.value)}
              className="w-full px-3 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            >
              <option value="withdrawal">Withdrawal</option>
              <option value="refund">Refund</option>
              <option value="settlement">Settlement</option>
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-100 flex gap-2.5">
          <button
            onClick={onClose}
            className="flex-1 py-3 border border-slate-300 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 active:bg-slate-100"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 active:scale-[0.97] disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {submitting ? <><RefreshCw className="w-4 h-4 animate-spin" /> Creating…</> : 'Create Payout'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Component ─── */
export default function MerchantPayout() {
  const [payouts, setPayouts] = useState([]);
  const [availableBalance, setAvailableBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const user = getAuth().currentUser;
    if (!user) return;

    // Fetch balance
    const fetchBalance = async () => {
      try {
        const merchantSnap = await getDocs(query(collection(db, 'merchant'), where('uid', '==', user.uid)));
        if (!merchantSnap.empty) {
          setAvailableBalance(merchantSnap.docs[0].data().availableBalance || 0);
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchBalance();

    // Listen to payouts
    const unsub = onSnapshot(
      query(collection(db, "merchantPayouts"), where("merchantId", "==", user.uid), orderBy("createdAt", "desc")),
      snap => {
        const list = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        setPayouts(list);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    let r = payouts;
    if (statusFilter !== "all") r = r.filter(p => p.status === statusFilter);
    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase();
      r = r.filter(p => 
        p.payoutId?.toLowerCase().includes(s) || 
        p.beneficiaryName?.toLowerCase().includes(s) ||
        p.upiId?.toLowerCase().includes(s)
      );
    }
    if (dateFrom) r = r.filter(p => (p.createdAt?.seconds || 0) * 1000 >= new Date(dateFrom).getTime());
    if (dateTo) r = r.filter(p => (p.createdAt?.seconds || 0) * 1000 <= new Date(dateTo).getTime() + 86399999);
    return r;
  }, [payouts, statusFilter, debouncedSearch, dateFrom, dateTo]);

  const stats = useMemo(() => ({
    total: payouts.length,
    queued: payouts.filter(p => p.status === 'queued').length,
    processing: payouts.filter(p => p.status === 'processing').length,
    completed: payouts.filter(p => p.status === 'completed').length,
    failed: payouts.filter(p => p.status === 'failed').length,
  }), [payouts]);

  const handleCreatePayout = async (formData) => {
    const user = getAuth().currentUser;
    if (!user) return;

    await addDoc(collection(db, 'merchantPayouts'), {
      merchantId: user.uid,
      payoutId: 'PO' + Date.now(),
      beneficiaryName: formData.beneficiaryName,
      paymentMode: formData.paymentMode,
      upiId: formData.paymentMode === 'upi' ? formData.upiId : null,
      accountNumber: formData.paymentMode === 'bank' ? formData.accountNumber : null,
      ifscCode: formData.paymentMode === 'bank' ? formData.ifscCode : null,
      amount: Number(formData.amount),
      purpose: formData.purpose,
      status: 'queued',
      createdAt: serverTimestamp(),
    });

    setShowModal(false);
  };

  const handleCancelPayout = async (payoutId) => {
    if (!confirm('Cancel this payout? This cannot be undone.')) return;
    
    try {
      await updateDoc(doc(db, 'merchantPayouts', payoutId), {
        status: 'failed',
        failureReason: 'Cancelled by merchant',
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  const handleExport = () => {
    const csv = [
      ['Payout ID', 'Beneficiary', 'Amount', 'Status', 'Payment Mode', 'Created At'],
      ...filtered.map(p => [
        p.payoutId || '',
        p.beneficiaryName || '',
        p.amount || 0,
        p.status || '',
        p.paymentMode || '',
        new Date((p.createdAt?.seconds || 0) * 1000).toLocaleString(),
      ])
    ].map(r => r.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payouts-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <RefreshCw className="w-10 h-10 text-blue-500 animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm font-medium">Loading payouts…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Desktop header */}
      <div className="hidden sm:flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-sm">
              <TrendingDown className="w-5 h-5 text-white" />
            </div>
            Payouts
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 ml-11">Manage outgoing payments</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-sm font-semibold"
        >
          <Plus className="w-4 h-4" /> Create Payout
        </button>
      </div>

      {/* Mobile create button */}
      <div className="flex sm:hidden justify-end">
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-sm font-semibold active:scale-[0.96]"
        >
          <Plus className="w-4 h-4" /> Create
        </button>
      </div>

      {/* Balance card */}
      <div className="bg-gradient-to-r from-blue-500 to-cyan-600 rounded-xl p-4 text-white shadow-md">
        <p className="text-blue-100 text-xs mb-1">Available for Payout</p>
        <p className="text-3xl font-bold">₹{availableBalance.toLocaleString()}</p>
      </div>

      {/* Status pills */}
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {[
          { label: 'All', value: stats.total, color: 'bg-slate-100 text-slate-700', key: 'all' },
          { label: 'Queued', value: stats.queued, color: 'bg-blue-100 text-blue-700', key: 'queued' },
          { label: 'Processing', value: stats.processing, color: 'bg-yellow-100 text-yellow-700', key: 'processing' },
          { label: 'Completed', value: stats.completed, color: 'bg-green-100 text-green-700', key: 'completed' },
          { label: 'Failed', value: stats.failed, color: 'bg-red-100 text-red-700', key: 'failed' },
        ].map(pill => (
          <button
            key={pill.key}
            onClick={() => setStatusFilter(pill.key)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              statusFilter === pill.key ? `${pill.color} ring-2 ring-offset-1 ring-current` : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
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
          <input
            type="text"
            placeholder="Search payout, beneficiary…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent bg-white"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`w-10 h-10 flex items-center justify-center rounded-xl border flex-shrink-0 ${
            showFilters ? 'bg-blue-50 border-blue-300 text-blue-600' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
          }`}
        >
          <Filter className="w-4 h-4" />
        </button>
        <button
          onClick={handleExport}
          className="w-10 h-10 flex items-center justify-center bg-green-50 border border-green-200 rounded-xl hover:bg-green-100 active:bg-green-200 flex-shrink-0"
        >
          <Download className="w-4 h-4 text-green-600" />
        </button>
      </div>

      {/* Expanded filters */}
      {showFilters && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> From
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> To
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
          </div>
        </div>
      )}

      {/* Cards */}
      {filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map(p => (
            <PayoutCard key={p.id} payout={p} onCancel={handleCancelPayout} />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <TrendingDown className="w-10 h-10 text-slate-200 mx-auto mb-2" />
          <p className="text-slate-500 text-sm font-medium">No payouts found</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {statusFilter !== "all" || search || dateFrom || dateTo ? "Try adjusting your filters" : "Create your first payout"}
          </p>
        </div>
      )}

      {/* Create Payout Modal */}
      {showModal && (
        <CreatePayoutModal
          onClose={() => setShowModal(false)}
          onSubmit={handleCreatePayout}
          availableBalance={availableBalance}
        />
      )}
    </div>
  );
}