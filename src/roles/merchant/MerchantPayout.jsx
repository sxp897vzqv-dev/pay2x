import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../supabase';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';
import {
  TrendingDown, Plus, Search, Download, Filter, X,
  RefreshCw, Calendar, Wallet,
} from 'lucide-react';
import PayoutCard from './components/MerchantPayoutCard';
import CreatePayoutModal from './components/CreatePayoutModal';
import { Toast } from '../../components/admin';

/* ─── Main Component ─── */
export default function MerchantPayout() {
  const [payouts, setPayouts] = useState([]);
  const [merchantId, setMerchantId] = useState(null);
  const [availableBalance, setAvailableBalance] = useState(0);
  const [payoutRate, setPayoutRate] = useState(2);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [toast, setToast] = useState(null);
  const [newPayoutIds, setNewPayoutIds] = useState(new Set());

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch data
  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); setRefreshing(false); return; }

    try {
      // Get merchant info
      const { data: merchant } = await supabase
        .from('merchants')
        .select('id, available_balance, payout_rate')
        .eq('profile_id', user.id)
        .single();

      if (merchant) {
        setMerchantId(merchant.id);
        setAvailableBalance(merchant.available_balance || 0);
        setPayoutRate(merchant.payout_rate || 2);
      }

      // Get payouts
      const { data } = await supabase
        .from('payouts')
        .select('*')
        .eq('merchant_id', merchant?.id)
        .order('created_at', { ascending: false })
        .limit(200);

      setPayouts(data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  // Initial fetch
  useEffect(() => { fetchData(); }, [fetchData]);

  // Real-time subscription
  useRealtimeSubscription('payouts', {
    filter: merchantId ? `merchant_id=eq.${merchantId}` : undefined,
    onInsert: (newPayout) => {
      setPayouts(prev => [newPayout, ...prev]);
      setNewPayoutIds(prev => new Set([...prev, newPayout.id]));
      setToast({ type: 'info', message: `New payout: ₹${newPayout.amount?.toLocaleString()}` });
      setTimeout(() => {
        setNewPayoutIds(prev => {
          const next = new Set(prev);
          next.delete(newPayout.id);
          return next;
        });
      }, 5000);
    },
    onUpdate: (updated) => {
      setPayouts(prev => prev.map(p => p.id === updated.id ? updated : p));
      if (updated.status === 'completed') {
        setToast({ type: 'success', message: `Payout completed: ₹${updated.amount?.toLocaleString()}` });
      } else if (updated.status === 'failed') {
        setToast({ type: 'error', message: `Payout failed: ${updated.failure_reason || 'Unknown error'}` });
      }
    },
  });

  // Also subscribe to merchant balance updates
  useRealtimeSubscription('merchants', {
    filter: merchantId ? `id=eq.${merchantId}` : undefined,
    onUpdate: (updated) => {
      setAvailableBalance(updated.available_balance || 0);
    },
  });

  const filtered = useMemo(() => {
    let r = payouts;
    if (statusFilter !== "all") {
      if (statusFilter === "failed") {
        r = r.filter(p => p.status === 'failed' || p.status === 'cancelled' || p.status === 'rejected');
      } else {
        r = r.filter(p => p.status === statusFilter);
      }
    }
    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase();
      r = r.filter(p => 
        p.payout_id?.toLowerCase().includes(s) || 
        p.beneficiary_name?.toLowerCase().includes(s) ||
        p.upi_id?.toLowerCase().includes(s)
      );
    }
    if (dateFrom) r = r.filter(p => new Date(p.created_at) >= new Date(dateFrom));
    if (dateTo) r = r.filter(p => new Date(p.created_at) <= new Date(dateTo + 'T23:59:59'));
    return r;
  }, [payouts, statusFilter, debouncedSearch, dateFrom, dateTo]);

  const stats = useMemo(() => ({
    total: payouts.length,
    pending: payouts.filter(p => p.status === 'pending').length,
    assigned: payouts.filter(p => p.status === 'assigned').length,
    processing: payouts.filter(p => p.status === 'processing').length,
    completed: payouts.filter(p => p.status === 'completed').length,
    failed: payouts.filter(p => p.status === 'failed' || p.status === 'cancelled' || p.status === 'rejected').length,
  }), [payouts]);

  const handleCreatePayout = async (formData) => {
    if (!merchantId) {
      setToast({ type: 'error', message: 'Error: Merchant not loaded' });
      return;
    }

    const amount = Number(formData.amount);
    
    // Validate amount limits (no balance check - merchants can go negative)
    if (amount < 100) {
      setToast({ type: 'error', message: 'Minimum amount is ₹100' });
      return;
    }
    if (amount > 200000) {
      setToast({ type: 'error', message: 'Maximum amount is ₹2,00,000' });
      return;
    }
    
    const rate = payoutRate || 2;
    const payoutFee = Math.round((amount * rate) / 100);
    const totalDeduct = amount + payoutFee;
    
    // Deduct from balance (can go negative - merchant settles later)
    const newBalance = availableBalance - totalDeduct;
    const { error: updateError } = await supabase
      .from('merchants')
      .update({ available_balance: newBalance, updated_at: new Date().toISOString() })
      .eq('id', merchantId);
    
    if (updateError) {
      console.error('Balance update error:', updateError);
      // Continue anyway
    }
    
    // Create payout
    const { error: payoutError } = await supabase.from('payouts').insert({
      merchant_id: merchantId,
      payout_id: 'PO' + Date.now(),
      txn_id: 'PO' + Date.now(),
      beneficiary_name: formData.beneficiaryName,
      payment_mode: formData.paymentMode,
      upi_id: formData.paymentMode === 'upi' ? formData.upiId : null,
      account_number: formData.paymentMode === 'bank' ? formData.accountNumber : null,
      ifsc_code: formData.paymentMode === 'bank' ? formData.ifscCode : null,
      amount: amount,
      merchant_fee: payoutFee,
      commission: payoutFee,
      purpose: formData.purpose,
      status: 'pending',
    });
    
    if (payoutError) {
      // Rollback balance
      await supabase.from('merchants').update({ available_balance: availableBalance }).eq('id', merchantId);
      setToast({ type: 'error', message: 'Error: ' + payoutError.message });
      return;
    }
    
    setAvailableBalance(newBalance);
    setShowModal(false);
    setToast({ type: 'success', message: `Payout of ₹${amount.toLocaleString()} created! Fee: ₹${payoutFee.toLocaleString()}` });
  };

  const handleCancelPayout = async (payoutId) => {
    if (!confirm('Cancel this payout? Amount will be refunded to your balance.')) return;
    
    try {
      // Use RPC function for atomic cancel + refund
      const { data, error } = await supabase.rpc('cancel_merchant_payout', {
        p_payout_id: payoutId
      });
      
      if (error) {
        setToast({ type: 'error', message: 'Error: ' + error.message });
        return;
      }
      
      if (!data?.success) {
        setToast({ type: 'error', message: data?.error || 'Failed to cancel payout' });
        return;
      }
      
      // Update local balance
      if (data.new_balance !== undefined) {
        setAvailableBalance(data.new_balance);
      }
      
      // Refresh payouts list
      fetchData(true);
      
      setToast({ type: 'success', message: data.message || `Payout cancelled. ₹${data.refunded?.toLocaleString()} refunded.` });
    } catch (e) {
      setToast({ type: 'error', message: 'Error: ' + e.message });
    }
  };

  const handleExport = () => {
    const csv = [
      ['Payout ID', 'Beneficiary', 'Amount', 'Status', 'Payment Mode', 'Created At'],
      ...filtered.map(p => [
        p.payout_id || '',
        p.beneficiary_name || '',
        p.amount || 0,
        p.status || '',
        p.payment_mode || '',
        new Date(p.created_at).toLocaleString(),
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
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm font-medium">Loading payouts…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Toast */}
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

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
        <div className="flex items-center gap-2">
          <button onClick={() => fetchData(true)} disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-200 text-sm font-semibold disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-sm font-semibold"
          >
            <Plus className="w-4 h-4" /> Create Payout
          </button>
        </div>
      </div>

      {/* Mobile buttons */}
      <div className="flex sm:hidden justify-between items-center">
        <button onClick={() => fetchData(true)} disabled={refreshing}
          className="p-2 bg-slate-100 border border-slate-200 rounded-xl hover:bg-slate-200 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 text-slate-600 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-sm font-semibold active:scale-[0.96]"
        >
          <Plus className="w-4 h-4" /> Create
        </button>
      </div>

      {/* Balance card (like Trader) */}
      <div className="bg-gradient-to-r from-blue-600 to-cyan-600 rounded-2xl p-4 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-blue-100 text-xs font-semibold uppercase tracking-wide mb-0.5">Available Balance</p>
            <p className="text-3xl font-bold">₹{availableBalance.toLocaleString()}</p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1.5 text-blue-200 text-xs">
              <Wallet className="w-3.5 h-3.5" />
              <span>Payout Fee: {payoutRate}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Status pills */}
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {[
          { label: 'All', value: stats.total, color: 'bg-slate-100 text-slate-700', key: 'all' },
          { label: 'Pending', value: stats.pending, color: 'bg-yellow-100 text-yellow-700', key: 'pending' },
          { label: 'Assigned', value: stats.assigned, color: 'bg-blue-100 text-blue-700', key: 'assigned' },
          { label: 'Processing', value: stats.processing, color: 'bg-amber-100 text-amber-700', key: 'processing' },
          { label: 'Completed', value: stats.completed, color: 'bg-green-100 text-green-700', key: 'completed' },
          { label: 'Failed', value: stats.failed, color: 'bg-red-100 text-red-700', key: 'failed' },
        ].map(pill => (
          <button
            key={pill.key}
            onClick={() => setStatusFilter(pill.key)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              statusFilter === pill.key ? `${pill.color} shadow-sm` : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
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
          className="w-10 h-10 flex items-center justify-center bg-slate-100 border border-slate-200 rounded-xl hover:bg-slate-200 active:bg-slate-300 flex-shrink-0"
        >
          <Download className="w-4 h-4 text-slate-600" />
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
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }} 
              className="text-xs text-blue-600 font-semibold flex items-center gap-1 hover:text-blue-700">
              <X className="w-3 h-3" /> Clear filters
            </button>
          )}
        </div>
      )}

      {/* Cards */}
      {filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map(p => (
            <PayoutCard 
              key={p.id} 
              payout={p} 
              onCancel={handleCancelPayout}
              isNew={newPayoutIds.has(p.id)}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <TrendingDown className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-semibold mb-1">No payouts found</p>
          <p className="text-xs text-slate-400">
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
          payoutRate={payoutRate}
        />
      )}
    </div>
  );
}
