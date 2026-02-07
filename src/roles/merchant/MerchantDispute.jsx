import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabase';
import {
  AlertCircle, Plus, Search, Filter, X,
  RefreshCw,
} from 'lucide-react';
import DisputeCard from './components/MerchantDisputeCard';
import CreateDisputeModal from './components/MerchantCreateDisputeModal';

export default function MerchantDispute() {
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const fetchDisputes = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('disputes').select('*').eq('merchant_id', user.id).order('created_at', { ascending: false }).limit(200);
      setDisputes((data || []).map(d => ({
        ...d,
        merchantId: d.merchant_id, disputeId: d.dispute_id,
        transactionId: d.transaction_id, evidenceUrl: d.evidence_url,
        createdAt: d.created_at ? { seconds: new Date(d.created_at).getTime() / 1000 } : null,
      })));
      setLoading(false);
    };
    fetchDisputes();
  }, []);

  const filtered = useMemo(() => {
    let r = disputes;
    if (statusFilter !== 'all') r = r.filter(d => d.status === statusFilter);
    if (search) {
      const s = search.toLowerCase();
      r = r.filter(d => 
        d.disputeId?.toLowerCase().includes(s) || 
        d.transactionId?.toLowerCase().includes(s) ||
        d.reason?.toLowerCase().includes(s)
      );
    }
    return r;
  }, [disputes, statusFilter, search]);

  const stats = useMemo(() => ({
    total: disputes.length,
    open: disputes.filter(d => d.status === 'open').length,
    under_review: disputes.filter(d => d.status === 'under_review').length,
    resolved: disputes.filter(d => d.status === 'resolved').length,
    lost: disputes.filter(d => d.status === 'lost').length,
  }), [disputes]);

  const handleCreateDispute = async (formData, evidence) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let evidenceUrl = null;
    if (evidence) {
      const filename = `${Date.now()}_${evidence.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      const { error: upErr } = await supabase.storage.from('dispute-proofs').upload(filename, evidence);
      if (!upErr) {
        const { data: urlData } = supabase.storage.from('dispute-proofs').getPublicUrl(filename);
        evidenceUrl = urlData.publicUrl;
      }
    }

    // Create dispute
    const { data: dispute, error: insertError } = await supabase.from('disputes').insert({
      merchant_id: user.id,
      dispute_id: 'DSP' + Date.now(),
      transaction_id: formData.transactionId,
      payin_id: formData.type === 'payin' ? formData.payinId : null,
      payout_id: formData.type === 'payout' ? formData.payoutId : null,
      upi_id: formData.upiId || null,
      utr: formData.utr || null,
      amount: Number(formData.amount),
      reason: formData.reason,
      type: formData.type,
      evidence_url: evidenceUrl,
      status: 'pending',
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }).select().single();

    if (!insertError && dispute) {
      // Auto-route dispute to trader
      try {
        const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://jrzyndtowwwcydgcagcr.supabase.co';
        await fetch(`${SUPABASE_URL}/functions/v1/route-dispute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ disputeId: dispute.id }),
        });
      } catch (routeErr) {
        console.error('Auto-route failed:', routeErr);
      }
    }

    setShowModal(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <RefreshCw className="w-10 h-10 text-red-500 animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm font-medium">Loading disputes…</p>
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
            <div className="p-2 bg-gradient-to-br from-red-500 to-red-600 rounded-xl shadow-sm">
              <AlertCircle className="w-5 h-5 text-white" />
            </div>
            Disputes
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 ml-11">Manage transaction disputes</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 text-sm font-semibold">
          <Plus className="w-4 h-4" /> File Dispute
        </button>
      </div>

      {/* Mobile create button */}
      <div className="flex sm:hidden justify-end">
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 text-sm font-semibold active:scale-[0.96]">
          <Plus className="w-4 h-4" /> File
        </button>
      </div>

      {/* Status pills */}
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {[
          { label: 'All', value: stats.total, color: 'bg-slate-100 text-slate-700', key: 'all' },
          { label: 'Open', value: stats.open, color: 'bg-yellow-100 text-yellow-700', key: 'open' },
          { label: 'Under Review', value: stats.under_review, color: 'bg-blue-100 text-blue-700', key: 'under_review' },
          { label: 'Resolved', value: stats.resolved, color: 'bg-green-100 text-green-700', key: 'resolved' },
          { label: 'Lost', value: stats.lost, color: 'bg-red-100 text-red-700', key: 'lost' },
        ].map(pill => (
          <button key={pill.key} onClick={() => setStatusFilter(pill.key)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              statusFilter === pill.key ? `${pill.color} ring-2 ring-offset-1 ring-current` : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}>
            {pill.label}
            <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${statusFilter === pill.key ? 'bg-white/60' : 'bg-slate-200 text-slate-600'}`}>
              {pill.value}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search disputes…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent bg-white"
          />
        </div>
      </div>

      {/* Cards */}
      {filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map(d => (
            <DisputeCard key={d.id} dispute={d} onViewDetails={(dispute) => alert(`View details for ${dispute.disputeId}`)} />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <AlertCircle className="w-10 h-10 text-slate-200 mx-auto mb-2" />
          <p className="text-slate-500 text-sm font-medium">No disputes found</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {statusFilter !== 'all' || search ? 'Try adjusting your filters' : 'File a dispute to get started'}
          </p>
        </div>
      )}

      {showModal && <CreateDisputeModal onClose={() => setShowModal(false)} onSubmit={handleCreateDispute} />}
    </div>
  );
}