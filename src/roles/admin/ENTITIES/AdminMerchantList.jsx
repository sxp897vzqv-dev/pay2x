import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '../../../supabase';
import { createMerchant } from '../../../utils/adminApi';
import { Link, useNavigate } from 'react-router-dom';
import {
  Store, Search, Filter, Plus, Eye, CheckCircle, AlertCircle,
  ToggleLeft, ToggleRight, Download, Globe, Key, RefreshCw, X,
  User, Mail, Phone, Building, Link as LinkIcon, IndianRupee,
  MoreVertical, Edit, Trash2, EyeOff, Copy, Shield,
} from 'lucide-react';
import { logDataDeleted } from '../../../utils/auditLogger';

// Shared components
import { Toast, FilterPills, SearchInput, CardSkeleton } from '../../../components/admin';

// Extracted components
import MerchantModal from './components/MerchantModal';
import MerchantCard from './components/MerchantCard';

/* ─── Generate API Keys ─── */
function generateApiKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'pk_live_';
  for (let i = 0; i < 32; i++) key += chars.charAt(Math.floor(Math.random() * chars.length));
  return key;
}

function generateSecretKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'sk_live_';
  for (let i = 0; i < 32; i++) key += chars.charAt(Math.floor(Math.random() * chars.length));
  return key;
}

/* ─── Map Supabase row → camelCase for child components ─── */
const mapMerchant = (row) => ({
  ...row,
  isActive: row.is_active,
  active: row.is_active,
  status: row.is_active ? 'active' : 'inactive',
  businessName: row.business_name,
  payinCommission: row.payin_commission_rate,
  payoutCommission: row.payout_commission_rate,
  liveApiKey: row.live_api_key,
  apiKey: row.live_api_key,
  webhookUrl: row.webhook_url,
  webhookSecret: row.webhook_secret,
  callbackUrl: row.callback_url,
  totalVolume: row.total_volume || 0,
  totalOrders: row.total_orders || 0,
  successRate: row.success_rate || 0,
  disputeCount: row.dispute_count || 0,
  createdAt: row.created_at ? { seconds: new Date(row.created_at).getTime() / 1000 } : null,
  updatedAt: row.updated_at ? { seconds: new Date(row.updated_at).getTime() / 1000 } : null,
});

/* ─── Main Component ─── */
export default function AdminMerchantList() {
  const [merchants, setMerchants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [selectedMerchant, setSelectedMerchant] = useState(null);
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();

  const fetchMerchants = useCallback(async () => {
    const { data, error } = await supabase
      .from('merchants')
      .select('*')
      .or('is_deleted.is.null,is_deleted.eq.false') // Exclude soft-deleted
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      console.error('Error loading merchants:', error);
      setToast({ msg: 'Error loading merchants: ' + error.message, success: false });
      setLoading(false);
      return;
    }
    setMerchants((data || []).map(mapMerchant));
    setLoading(false);
  }, []);

  useEffect(() => { fetchMerchants(); }, [fetchMerchants]);

  const filtered = useMemo(() => {
    let result = merchants;
    if (statusFilter === 'active') result = result.filter(m => m.active || m.isActive || m.status === 'active');
    else if (statusFilter === 'inactive') result = result.filter(m => !m.active && !m.isActive && m.status !== 'active');
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(m =>
        m.name?.toLowerCase().includes(s) ||
        m.businessName?.toLowerCase().includes(s) ||
        m.email?.toLowerCase().includes(s) ||
        m.id?.toLowerCase().includes(s)
      );
    }
    return result;
  }, [merchants, statusFilter, search]);

  const stats = useMemo(() => ({
    total: merchants.length,
    active: merchants.filter(m => m.active || m.isActive || m.status === 'active').length,
    inactive: merchants.filter(m => !m.active && !m.isActive && m.status !== 'active').length,
    totalVolume: merchants.reduce((sum, m) => sum + (m.totalVolume || 0), 0),
  }), [merchants]);

  // Save merchant (create or update)
  const handleSaveMerchant = async (formData) => {
    try {
      if (selectedMerchant) {
        const { password, ...updateData } = formData;

        await supabase.from('merchants').update({
          name: updateData.name || updateData.businessName,
          business_name: updateData.businessName || updateData.name,
          phone: updateData.phone || '',
          website: updateData.website || '',
          callback_url: updateData.callbackUrl || '',
          webhook_url: updateData.webhookUrl || '',
          payin_commission_rate: Number(updateData.payinCommission),
          payout_commission_rate: Number(updateData.payoutCommission),
          is_active: updateData.active,
        }).eq('id', selectedMerchant.id);

        setToast({ msg: '✅ Merchant updated successfully!', success: true });
      } else {
        // Password is auto-generated and emailed to merchant
        await createMerchant({
          email: formData.email,
          name: formData.name || formData.businessName,
          businessName: formData.businessName || formData.name,
          phone: formData.phone || '',
          website: formData.website || '',
          callbackUrl: formData.callbackUrl || '',
          webhookUrl: formData.webhookUrl || '',
          payinCommissionRate: Number(formData.payinCommission),
          payoutCommissionRate: Number(formData.payoutCommission),
          active: formData.active !== undefined ? formData.active : true,
        });

        setToast({ msg: '✅ Merchant created successfully!', success: true });
      }

      setShowModal(false);
      setSelectedMerchant(null);
      fetchMerchants();
    } catch (error) {
      console.error('Error saving merchant:', error);
      throw error;
    }
  };

  // Delete merchant (2FA protected) - Soft delete to preserve audit trail
  const doDeleteMerchant = async (merchant) => {
    try {
      // Soft delete: mark as deleted instead of hard delete
      // Hard delete fails due to FK constraints (payins, payouts, disputes, etc.)
      const { error } = await supabase
        .from('merchants')
        .update({ 
          is_active: false,
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', merchant.id);
      
      if (error) {
        console.error('Delete error:', error);
        throw new Error(error.message || 'Failed to delete merchant');
      }
      
      await logDataDeleted(
        'merchant',
        merchant.id,
        merchant.businessName || merchant.name || 'Unknown Merchant',
        'Merchant soft-deleted by admin (preserved for audit trail)'
      );
      
      setToast({ msg: '✅ Merchant deleted', success: true });
      fetchMerchants();
    } catch (error) {
      setToast({ msg: '❌ Error: ' + error.message, success: false });
    }
  };

  const handleDeleteMerchant = (merchant) => {
    if (!window.confirm(`Delete ${merchant.businessName || merchant.name}?\n\nThis cannot be undone.`)) return;
    doDeleteMerchant(merchant);
  };

  // Toggle status (2FA protected)
  const doToggleStatus = async (merchant) => {
    const isActive = merchant.active || merchant.isActive || merchant.status === 'active';
    try {
      await supabase.from('merchants').update({
        is_active: !isActive,
      }).eq('id', merchant.id);
      setToast({ msg: `Merchant ${!isActive ? 'activated' : 'deactivated'}`, success: true });
      fetchMerchants();
    } catch (error) {
      setToast({ msg: 'Error: ' + error.message, success: false });
    }
  };

  const handleToggleStatus = (merchant) => {
    doToggleStatus(merchant);
  };

  // Export
  const handleExport = () => {
    const csv = [
      ['ID', 'Name', 'Email', 'Phone', 'Status', 'Total Orders', 'Total Volume', 'API Key'],
      ...filtered.map(m => [
        m.id,
        m.businessName || m.name || '',
        m.email || '',
        m.phone || '',
        (m.active || m.isActive) ? 'Active' : 'Inactive',
        m.totalOrders || 0,
        m.totalVolume || 0,
        m.apiKey || '',
      ]),
    ].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `merchants-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* Modal */}
      {showModal && (
        <MerchantModal
          merchant={selectedMerchant}
          onClose={() => { setShowModal(false); setSelectedMerchant(null); }}
          onSave={handleSaveMerchant}
        />
      )}

      {/* Desktop header */}
      <div className="hidden sm:flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl shadow-sm">
              <Store className="w-5 h-5 text-white" />
            </div>
            Merchants
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 ml-11">Manage business accounts</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 text-sm font-semibold">
            <Download className="w-4 h-4" /> Export
          </button>
          <button onClick={() => { setSelectedMerchant(null); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-xl hover:bg-orange-700 text-sm font-semibold">
            <Plus className="w-4 h-4" /> Add Merchant
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-4 text-white">
          <p className="text-orange-100 text-xs mb-1">Total Merchants</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 text-white">
          <p className="text-green-100 text-xs mb-1">Active</p>
          <p className="text-2xl font-bold">{stats.active}</p>
        </div>
        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-4 text-white">
          <p className="text-red-100 text-xs mb-1">Inactive</p>
          <p className="text-2xl font-bold">{stats.inactive}</p>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 text-white">
          <p className="text-purple-100 text-xs mb-1">Total Volume</p>
          <p className="text-2xl font-bold">₹{(stats.totalVolume / 100000).toFixed(1)}L</p>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 overflow-x-auto px-1 py-1 -mx-1" style={{ scrollbarWidth: 'none' }}>
        {[
          { label: 'All', value: stats.total, key: 'all', activeBg: 'bg-slate-200', activeText: 'text-slate-800' },
          { label: 'Active', value: stats.active, key: 'active', activeBg: 'bg-green-100', activeText: 'text-green-700' },
          { label: 'Inactive', value: stats.inactive, key: 'inactive', activeBg: 'bg-red-100', activeText: 'text-red-700' },
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

      {/* Search */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input type="text" placeholder="Search name, email..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" />
        </div>
        <button onClick={() => { setSelectedMerchant(null); setShowModal(true); }}
          className="sm:hidden w-10 h-10 flex items-center justify-center rounded-xl bg-orange-600 text-white flex-shrink-0">
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map(i => <CardSkeleton key={i} />)}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(merchant => (
            <MerchantCard
              key={merchant.id}
              merchant={merchant}
              onEdit={(m) => { setSelectedMerchant(m); setShowModal(true); }}
              onDelete={handleDeleteMerchant}
              onToggleStatus={handleToggleStatus}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <Store className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No merchants found</p>
          <p className="text-xs text-slate-400 mt-1">
            {search || statusFilter !== 'all' ? 'Try adjusting your filters' : 'Create your first merchant to get started'}
          </p>
          {!search && statusFilter === 'all' && (
            <button onClick={() => { setSelectedMerchant(null); setShowModal(true); }}
              className="mt-4 px-4 py-2 bg-orange-600 text-white rounded-xl text-sm font-semibold hover:bg-orange-700">
              <Plus className="w-4 h-4 inline mr-1" /> Add Merchant
            </button>
          )}
        </div>
      )}
      
    </div>
  );
}
