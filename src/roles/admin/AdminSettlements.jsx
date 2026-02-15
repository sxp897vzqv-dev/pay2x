import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabase';
import { Search, CheckCircle, Clock, XCircle, RefreshCw, Wallet, User, Building, Copy } from 'lucide-react';

const STATUS_CONFIG = {
  pending: { color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: Clock, label: 'Pending' },
  processing: { color: 'bg-blue-100 text-blue-700 border-blue-200', icon: RefreshCw, label: 'Processing' },
  completed: { color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle, label: 'Completed' },
  failed: { color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle, label: 'Failed' },
  rejected: { color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle, label: 'Rejected' },
};

export default function AdminSettlements() {
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [processing, setProcessing] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('merchant_settlements')
        .select('*, merchants(id, name, email, business_name)')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setSettlements(data || []);
    } catch (e) {
      console.error('Error fetching settlements:', e);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = useMemo(() => {
    let result = settlements;
    if (statusFilter !== 'all') {
      result = result.filter(s => s.status === statusFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(s => 
        s.merchants?.name?.toLowerCase().includes(q) ||
        s.merchants?.email?.toLowerCase().includes(q) ||
        s.usdt_address?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [settlements, statusFilter, search]);

  const stats = useMemo(() => ({
    total: settlements.length,
    pending: settlements.filter(s => s.status === 'pending').length,
    completed: settlements.filter(s => s.status === 'completed').length,
    rejected: settlements.filter(s => s.status === 'rejected' || s.status === 'failed').length,
    pendingAmount: settlements.filter(s => s.status === 'pending').reduce((sum, s) => sum + Number(s.amount || 0), 0),
  }), [settlements]);

  const handleApprove = async (settlement) => {
    if (!confirm(`Approve settlement of ₹${settlement.amount.toLocaleString()} to ${settlement.usdt_address}?`)) return;
    
    setProcessing(settlement.id);
    try {
      // Update settlement status
      const { error } = await supabase
        .from('merchant_settlements')
        .update({ 
          status: 'completed',
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', settlement.id);
      
      if (error) throw error;
      
      // Clear pending_settlement on merchant (already deducted from available_balance)
      await supabase
        .from('merchants')
        .update({ 
          pending_settlement: 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', settlement.merchant_id);
      
      fetchData();
      alert('Settlement approved!');
    } catch (e) {
      alert('Error: ' + e.message);
    }
    setProcessing(null);
  };

  const handleReject = async (settlement) => {
    const reason = prompt('Rejection reason:');
    if (!reason) return;
    
    setProcessing(settlement.id);
    try {
      // Update settlement status
      const { error } = await supabase
        .from('merchant_settlements')
        .update({ 
          status: 'rejected',
          rejection_reason: reason,
          updated_at: new Date().toISOString()
        })
        .eq('id', settlement.id);
      
      if (error) throw error;
      
      // Refund the amount back to merchant
      const { data: merchant } = await supabase
        .from('merchants')
        .select('available_balance, pending_settlement')
        .eq('id', settlement.merchant_id)
        .single();
      
      if (merchant) {
        await supabase
          .from('merchants')
          .update({ 
            available_balance: (merchant.available_balance || 0) + Number(settlement.amount),
            pending_settlement: 0,
            updated_at: new Date().toISOString()
          })
          .eq('id', settlement.merchant_id);
      }
      
      fetchData();
      alert('Settlement rejected. Amount refunded to merchant.');
    } catch (e) {
      alert('Error: ' + e.message);
    }
    setProcessing(null);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('Copied!');
  };

  const formatDate = (date) => date ? new Date(date).toLocaleString('en-IN', { 
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' 
  }) : '-';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Wallet className="w-6 h-6 text-indigo-600" />
            Merchant Settlements
          </h1>
          <p className="text-slate-500 text-sm mt-1">Approve or reject merchant withdrawal requests</p>
        </div>
        <button onClick={fetchData} className="p-2 bg-slate-100 rounded-lg hover:bg-slate-200">
          <RefreshCw className="w-5 h-5 text-slate-600" />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <p className="text-slate-500 text-sm">Total Requests</p>
          <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
        </div>
        <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
          <p className="text-yellow-700 text-sm">Pending</p>
          <p className="text-2xl font-bold text-yellow-800">{stats.pending}</p>
          <p className="text-sm text-yellow-600">₹{stats.pendingAmount.toLocaleString()}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 border border-green-200">
          <p className="text-green-700 text-sm">Completed</p>
          <p className="text-2xl font-bold text-green-800">{stats.completed}</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4 border border-red-200">
          <p className="text-red-700 text-sm">Rejected</p>
          <p className="text-2xl font-bold text-red-800">{stats.rejected}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search merchant or address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <div className="flex gap-2">
          {['pending', 'completed', 'rejected', 'all'].map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition ${
                statusFilter === status 
                  ? 'bg-indigo-600 text-white' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Merchant</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Amount</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">USDT Address</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Requested</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No settlements found</td></tr>
            ) : filtered.map(s => {
              const StatusIcon = STATUS_CONFIG[s.status]?.icon || Clock;
              return (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                        <Building className="w-4 h-4 text-indigo-600" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{s.merchants?.name || s.merchants?.business_name || '-'}</p>
                        <p className="text-xs text-slate-500">{s.merchants?.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="font-bold text-slate-900">₹{Number(s.amount).toLocaleString()}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <code className="text-xs bg-slate-100 px-2 py-1 rounded font-mono">
                        {s.usdt_address?.slice(0, 8)}...{s.usdt_address?.slice(-6)}
                      </code>
                      <button onClick={() => copyToClipboard(s.usdt_address)} className="p-1 hover:bg-slate-100 rounded">
                        <Copy className="w-3 h-3 text-slate-400" />
                      </button>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{s.network || 'TRC20'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center">
                      <span className={`flex items-center gap-1 px-2 py-1 text-xs rounded-full border ${STATUS_CONFIG[s.status]?.color || 'bg-slate-100 text-slate-600'}`}>
                        <StatusIcon className="w-3 h-3" />
                        {STATUS_CONFIG[s.status]?.label || s.status}
                      </span>
                    </div>
                    {s.rejection_reason && (
                      <p className="text-xs text-red-500 text-center mt-1">{s.rejection_reason}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {formatDate(s.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {s.status === 'pending' && (
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleApprove(s)}
                          disabled={processing === s.id}
                          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg disabled:opacity-50"
                        >
                          {processing === s.id ? '...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => handleReject(s)}
                          disabled={processing === s.id}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                    {s.status === 'completed' && (
                      <span className="text-xs text-green-600">Processed {formatDate(s.processed_at)}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
