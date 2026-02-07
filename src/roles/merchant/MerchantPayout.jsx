import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabase';
import {
  TrendingDown, Plus, Search, Download, Filter, X,
  RefreshCw, Calendar,
} from 'lucide-react';
import PayoutCard from './components/MerchantPayoutCard';
import CreatePayoutModal from './components/CreatePayoutModal';

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
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // Balance
      const { data: merchant } = await supabase.from('merchants').select('available_balance').eq('id', user.id).single();
      if (merchant) setAvailableBalance(merchant.available_balance || 0);
      // Payouts
      const { data } = await supabase.from('payouts').select('*').eq('merchant_id', user.id).order('created_at', { ascending: false }).limit(200);
      setPayouts((data || []).map(r => ({
        ...r,
        merchantId: r.merchant_id, payoutId: r.payout_id,
        beneficiaryName: r.beneficiary_name, paymentMode: r.payment_mode,
        upiId: r.upi_id, accountNumber: r.account_number, ifscCode: r.ifsc_code,
        failureReason: r.failure_reason,
        createdAt: r.created_at ? { seconds: new Date(r.created_at).getTime() / 1000 } : null,
      })));
      setLoading(false);
    };
    fetchData();
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const amount = Number(formData.amount);
    
    // Get merchant info with rates
    const { data: merchant } = await supabase
      .from('merchants')
      .select('available_balance, payout_rate')
      .eq('id', user.id)
      .single();
    
    if (!merchant) {
      alert('Error: Could not fetch merchant data');
      return;
    }
    
    const payoutRate = merchant.payout_rate || 2; // Default 2%
    const payoutFee = Math.round((amount * payoutRate) / 100);
    const totalRequired = amount + payoutFee;
    
    // Check balance
    if ((merchant.available_balance || 0) < totalRequired) {
      alert(`Insufficient balance!\n\nRequired: ₹${totalRequired.toLocaleString()} (₹${amount.toLocaleString()} + ₹${payoutFee.toLocaleString()} fee)\nAvailable: ₹${(merchant.available_balance || 0).toLocaleString()}`);
      return;
    }
    
    // Reserve amount (deduct from available)
    const { error: reserveError } = await supabase
      .from('merchants')
      .update({ 
        available_balance: (merchant.available_balance || 0) - totalRequired,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);
    
    if (reserveError) {
      alert('Error reserving balance: ' + reserveError.message);
      return;
    }
    
    // Create payout
    const { error: payoutError } = await supabase.from('payouts').insert({
      merchant_id: user.id,
      payout_id: 'PO' + Date.now(),
      beneficiary_name: formData.beneficiaryName,
      payment_mode: formData.paymentMode,
      upi_id: formData.paymentMode === 'upi' ? formData.upiId : null,
      account_number: formData.paymentMode === 'bank' ? formData.accountNumber : null,
      ifsc_code: formData.paymentMode === 'bank' ? formData.ifscCode : null,
      amount: amount,
      merchant_fee: payoutFee,
      purpose: formData.purpose,
      status: 'pending',
    });
    
    if (payoutError) {
      // Rollback balance reservation
      await supabase
        .from('merchants')
        .update({ available_balance: merchant.available_balance })
        .eq('id', user.id);
      alert('Error creating payout: ' + payoutError.message);
      return;
    }
    
    // Refresh balance
    setAvailableBalance((merchant.available_balance || 0) - totalRequired);
    setShowModal(false);
  };

  const handleCancelPayout = async (payoutId) => {
    if (!confirm('Cancel this payout? This cannot be undone.')) return;
    
    try {
      await supabase.from('payouts').update({
        status: 'failed',
        failure_reason: 'Cancelled by merchant',
      }).eq('id', payoutId);
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