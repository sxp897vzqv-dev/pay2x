import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '../../../supabase';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, Search, RefreshCw } from 'lucide-react';

// Shared components
import { Toast, FilterPills, SearchInput, CardSkeleton } from '../../../components/admin';

// Extracted components
import DisputeCard from './components/DisputeCard';

export default function AdminDisputes() {
  const [searchParams] = useSearchParams();
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [toast, setToast] = useState(null);
  const traderFilter = searchParams.get('trader');

  const fetchDisputes = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from('disputes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (traderFilter) {
        q = q.eq('trader_id', traderFilter);
      }

      const { data, error } = await q;
      if (error) throw error;
      setDisputes(data || []);
    } catch (err) {
      console.error('Disputes fetch error:', err);
    }
    setLoading(false);
  }, [traderFilter]);

  useEffect(() => {
    fetchDisputes();
  }, [fetchDisputes]);

  const filtered = useMemo(() => {
    let result = disputes;
    if (statusFilter !== 'all') result = result.filter(d => d.status === statusFilter);
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(d =>
        d.id?.toLowerCase().includes(s) ||
        d.reason?.toLowerCase().includes(s) ||
        d.description?.toLowerCase().includes(s) ||
        d.trader_id?.toLowerCase().includes(s) ||
        d.merchant_id?.toLowerCase().includes(s)
      );
    }
    return result;
  }, [disputes, statusFilter, search]);

  const stats = useMemo(() => ({
    total: disputes.length,
    pending: disputes.filter(d => d.status === 'pending').length,
    approved: disputes.filter(d => d.status === 'admin_approved').length,
    rejected: disputes.filter(d => d.status === 'admin_rejected').length,
  }), [disputes]);

  const handleResolve = async (dispute, decision) => {
    if (!window.confirm(`${decision === 'approved' ? 'Approve' : 'Reject'} this dispute for ₹${dispute.amount?.toLocaleString()}?`)) return;
    try {
      const statusMap = { approved: 'admin_approved', rejected: 'admin_rejected' };
      const newStatus = statusMap[decision] || decision;

      const { error } = await supabase.from('disputes').update({
        status: newStatus,
        admin_decision: decision,
        admin_resolved_at: new Date().toISOString(),
      }).eq('id', dispute.id);

      if (error) throw error;
      setToast({ msg: `Dispute ${decision}`, success: decision === 'approved' });
      fetchDisputes(); // Refresh list
    } catch (e) {
      setToast({ msg: 'Failed to update dispute', success: false });
    }
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className="hidden sm:flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl shadow-sm"><AlertCircle className="w-5 h-5 text-white" /></div>Disputes
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 ml-11">Resolve merchant disputes</p>
        </div>
      </div>

      <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl p-4 text-white">
        <div className="flex items-center justify-between">
          <div><p className="text-amber-100 text-xs font-semibold">Pending Resolution</p><p className="text-2xl font-bold">{stats.pending}</p></div>
          <div className="text-right"><p className="text-amber-100 text-xs">Total</p><p className="text-lg font-bold">{stats.total}</p></div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto px-1 py-1 -mx-1" style={{ scrollbarWidth: 'none' }}>
        {[
          { label: 'All', value: stats.total, key: 'all', activeBg: 'bg-slate-200', activeText: 'text-slate-800' },
          { label: 'Pending', value: stats.pending, key: 'pending', activeBg: 'bg-amber-100', activeText: 'text-amber-700' },
          { label: 'Approved', value: stats.approved, key: 'admin_approved', activeBg: 'bg-green-100', activeText: 'text-green-700' },
          { label: 'Rejected', value: stats.rejected, key: 'admin_rejected', activeBg: 'bg-red-100', activeText: 'text-red-700' },
        ].map(pill => {
          const isActive = statusFilter === pill.key;
          return (
            <button key={pill.key} onClick={() => setStatusFilter(pill.key)} 
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                isActive ? `${pill.activeBg} ${pill.activeText} shadow-sm` : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}>
              {pill.label}
              <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${isActive ? 'bg-white/70' : 'bg-slate-200 text-slate-600'}`}>
                {pill.value}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input type="text" placeholder="Search reason, description, trader..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
        </div>
      </div>

      {loading ? <div className="flex items-center justify-center py-12"><RefreshCw className="w-8 h-8 text-amber-500 animate-spin" /></div> : filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{filtered.map(dispute => <DisputeCard key={dispute.id} dispute={dispute} onResolve={handleResolve} />)}</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center"><AlertCircle className="w-12 h-12 text-slate-200 mx-auto mb-3" /><p className="text-slate-500 font-medium">No disputes found</p></div>
      )}
    </div>
  );
}
