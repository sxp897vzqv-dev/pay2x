import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../../supabase';
import { useRealtimeSubscription } from '../../../hooks/useRealtimeSubscription';
import { logMerchantActivity, MERCHANT_ACTIONS } from '../../../utils/merchantActivityLogger';
import {
  ArrowUpRight, Plus, Search, Download, Filter, X,
  RefreshCw, Calendar, Wallet, Clock, CheckCircle, AlertTriangle,
  TrendingUp, Loader2, ShieldCheck,
} from 'lucide-react';
import PayoutCard from './components/MerchantPayoutCard';
import CreatePayoutModal from './components/CreatePayoutModal';
import { Toast } from '../../../components/admin';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';

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
        .select('id, available_balance, payout_commission_rate')
        .eq('profile_id', user.id)
        .single();

      if (merchant) {
        setMerchantId(merchant.id);
        setAvailableBalance(merchant.available_balance || 0);
        setPayoutRate(merchant.payout_commission_rate ?? 2);
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
      } else if (statusFilter === "pendingVerification") {
        r = r.filter(p => p.status === 'completed' && p.verification_status && p.verification_status !== 'verified');
      } else if (statusFilter === "completed") {
        r = r.filter(p => p.status === 'completed' && (!p.verification_status || p.verification_status === 'verified'));
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

  const stats = useMemo(() => {
    const totalAmount = payouts.filter(p => p.status === 'completed').reduce((a, p) => a + (p.amount || 0), 0);
    const pendingAmount = payouts.filter(p => ['pending', 'assigned', 'processing'].includes(p.status)).reduce((a, p) => a + (p.amount || 0), 0);
    
    return {
      total: payouts.length,
      pending: payouts.filter(p => p.status === 'pending').length,
      assigned: payouts.filter(p => p.status === 'assigned').length,
      processing: payouts.filter(p => p.status === 'processing').length,
      pendingVerification: payouts.filter(p => p.status === 'completed' && p.verification_status && p.verification_status !== 'verified').length,
      completed: payouts.filter(p => p.status === 'completed' && (!p.verification_status || p.verification_status === 'verified')).length,
      failed: payouts.filter(p => p.status === 'failed' || p.status === 'cancelled' || p.status === 'rejected').length,
      totalAmount,
      pendingAmount,
    };
  }, [payouts]);

  const handleCreatePayout = async (formData) => {
    if (!merchantId) {
      setToast({ type: 'error', message: 'Error: Merchant not loaded' });
      return;
    }

    const amount = Number(formData.amount);
    
    // Validate amount limits
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
    
    // Create payout request
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
      setToast({ type: 'error', message: 'Error: ' + payoutError.message });
      return;
    }
    
    // Log activity
    await logMerchantActivity(MERCHANT_ACTIONS.PAYOUT_CREATED, {
      entityType: 'payout',
      details: {
        amount: amount,
        fee: payoutFee,
        payment_mode: formData.paymentMode,
        beneficiary_name: formData.beneficiaryName,
      }
    });
    
    setShowModal(false);
    setToast({ type: 'success', message: `Payout request created! ₹${amount.toLocaleString()} + ₹${payoutFee.toLocaleString()} fee will be deducted on completion.` });
  };

  const handleCancelPayout = async (payoutId) => {
    if (!confirm('Cancel this payout request?')) return;
    
    try {
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
      
      // Log activity
      await logMerchantActivity(MERCHANT_ACTIONS.PAYOUT_CANCELLED, {
        entityType: 'payout',
        entityId: payoutId,
        details: { refunded_amount: data.refunded_amount }
      });
      
      // Refresh payouts list
      fetchData(true);
      
      setToast({ type: 'success', message: data.message || 'Payout cancelled.' });
    } catch (e) {
      setToast({ type: 'error', message: 'Error: ' + e.message });
    }
  };

  const handleExport = () => {
    const csv = [
      ['Payout ID', 'Beneficiary', 'Amount', 'Fee', 'Status', 'Payment Mode', 'Created At'],
      ...filtered.map(p => [
        p.payout_id || '',
        p.beneficiary_name || '',
        p.amount || 0,
        p.merchant_fee || 0,
        p.status || '',
        p.payment_mode || '',
        new Date(p.created_at).toLocaleString(),
      ])
    ].map(r => r.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payouts-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <LoadingSpinner message="Loading payouts…" color="purple" />;
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto px-1">
      {/* Toast */}
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg shadow-purple-500/20">
              <ArrowUpRight className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Payouts</h1>
              <p className="text-slate-500 text-sm">Send money to bank accounts & UPI</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => fetchData(true)} 
              disabled={refreshing}
              className="p-2.5 bg-slate-100 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-200 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl hover:from-purple-600 hover:to-purple-700 text-sm font-semibold shadow-lg shadow-purple-500/20 transition-all active:scale-[0.97]"
            >
              <Plus className="w-4 h-4" /> 
              <span className="hidden sm:inline">Create Payout</span>
              <span className="sm:hidden">Create</span>
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Available Balance */}
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 text-white shadow-lg shadow-purple-500/20 col-span-2 sm:col-span-1">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-4 h-4 text-purple-200" />
            <span className="text-xs font-medium text-purple-200">Available</span>
          </div>
          <p className="text-2xl font-bold">₹{availableBalance.toLocaleString()}</p>
        </div>

        {/* Completed */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-xs font-medium text-slate-500">Completed</span>
          </div>
          <p className="text-xl font-bold text-slate-900">{stats.completed}</p>
          <p className="text-xs text-green-600 font-medium">₹{stats.totalAmount.toLocaleString()}</p>
        </div>

        {/* In Progress */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-medium text-slate-500">In Progress</span>
          </div>
          <p className="text-xl font-bold text-slate-900">{stats.pending + stats.assigned + stats.processing}</p>
          <p className="text-xs text-amber-600 font-medium">₹{stats.pendingAmount.toLocaleString()}</p>
        </div>

        {/* Failed */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span className="text-xs font-medium text-slate-500">Failed</span>
          </div>
          <p className="text-xl font-bold text-slate-900">{stats.failed}</p>
          <p className="text-xs text-slate-400 font-medium">transactions</p>
        </div>
      </div>

      {/* Status Pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
        {[
          { label: 'All', value: stats.total, color: 'bg-slate-100 text-slate-700 border-slate-200', key: 'all' },
          { label: 'Pending', value: stats.pending, color: 'bg-yellow-50 text-yellow-700 border-yellow-200', key: 'pending' },
          { label: 'Assigned', value: stats.assigned, color: 'bg-blue-50 text-blue-700 border-blue-200', key: 'assigned' },
          { label: 'Processing', value: stats.processing, color: 'bg-amber-50 text-amber-700 border-amber-200', key: 'processing' },
          { label: 'Verifying', value: stats.pendingVerification, color: 'bg-orange-50 text-orange-700 border-orange-200', key: 'pendingVerification' },
          { label: 'Completed', value: stats.completed, color: 'bg-green-50 text-green-700 border-green-200', key: 'completed' },
          { label: 'Failed', value: stats.failed, color: 'bg-red-50 text-red-700 border-red-200', key: 'failed' },
        ].map(pill => (
          <button
            key={pill.key}
            onClick={() => setStatusFilter(pill.key)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
              statusFilter === pill.key 
                ? `${pill.color} shadow-sm` 
                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {pill.label}
            <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${
              statusFilter === pill.key ? 'bg-white/60' : 'bg-slate-100 text-slate-600'
            }`}>
              {pill.value}
            </span>
          </button>
        ))}
      </div>

      {/* Search + Filters + Export */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search payout ID, beneficiary, UPI…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent bg-white"
          />
          {search && (
            <button 
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`w-10 h-10 flex items-center justify-center rounded-xl border flex-shrink-0 transition-colors ${
            showFilters || dateFrom || dateTo
              ? 'bg-purple-50 border-purple-300 text-purple-600' 
              : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
          }`}
        >
          <Filter className="w-4 h-4" />
        </button>
        <button
          onClick={handleExport}
          className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 active:bg-slate-100 flex-shrink-0 transition-colors"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>

      {/* Expanded Filters */}
      {showFilters && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-3 shadow-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> From Date
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> To Date
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
              />
            </div>
          </div>
          {(dateFrom || dateTo) && (
            <button 
              onClick={() => { setDateFrom(''); setDateTo(''); }} 
              className="text-xs text-purple-600 font-semibold flex items-center gap-1 hover:text-purple-700"
            >
              <X className="w-3 h-3" /> Clear date filters
            </button>
          )}
        </div>
      )}

      {/* Payouts List */}
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
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm">
          <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <ArrowUpRight className="w-8 h-8 text-purple-300" />
          </div>
          <p className="text-slate-700 font-semibold mb-1">No payouts found</p>
          <p className="text-sm text-slate-400 mb-4">
            {statusFilter !== "all" || search || dateFrom || dateTo 
              ? "Try adjusting your filters" 
              : "Create your first payout to send money"}
          </p>
          {!search && !dateFrom && !dateTo && statusFilter === 'all' && (
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> Create Payout
            </button>
          )}
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
