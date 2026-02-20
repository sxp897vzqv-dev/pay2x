import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase, SUPABASE_URL } from '../../../supabase';
import { createTrader } from '../../../utils/adminApi';
import { Link, useNavigate } from 'react-router-dom';
import TwoFactorModal, { useTwoFactorVerification } from '../../../components/TwoFactorModal';
import { TwoFactorActions } from '../../../hooks/useTwoFactor';
import {
  Users, Search, Filter, Plus, RefreshCw, Eye, CheckCircle, AlertCircle,
  Wallet, Phone, Mail, Download, UserPlus, ToggleLeft, ToggleRight, X,
  User, Lock, IndianRupee, Shield, MessageCircle, Key, Copy, MoreVertical,
  Trash2, Edit, EyeOff,
} from 'lucide-react';
import { logDataDeleted } from '../../../utils/auditLogger';

// Shared components
import { Toast, FilterPills, SearchInput, CardSkeleton } from '../../../components/admin';

// Extracted components
import TraderModal from './components/TraderModal';
import TraderCard from './components/TraderCard';

/* ─── Map Supabase row → camelCase for child components ─── */
const mapTrader = (row) => ({
  ...row,
  isActive: row.is_active,
  active: row.is_active,
  status: row.is_active ? 'active' : 'inactive',
  payinCommission: row.payin_commission,
  payoutCommission: row.payout_commission,
  commissionRate: row.payin_commission,
  overallCommission: row.overall_commission,
  securityHold: row.security_hold,
  workingBalance: (Number(row.balance) || 0) - (Number(row.security_hold) || 0),
  telegramId: row.telegram,
  telegramGroupLink: row.telegram_group_link,
  usdtDepositAddress: row.usdt_deposit_address,
  lastOnlineAt: row.last_online_at,
  createdAt: row.created_at ? { seconds: new Date(row.created_at).getTime() / 1000 } : null,
  updatedAt: row.updated_at ? { seconds: new Date(row.updated_at).getTime() / 1000 } : null,
});

/* ─── Main Component ─── */
export default function AdminTraderList() {
  const [traders, setTraders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedTrader, setSelectedTrader] = useState(null);
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();
  
  // 2FA
  const { requireVerification, TwoFactorModal: TwoFactorModalComponent } = useTwoFactorVerification();

  const fetchTraders = useCallback(async () => {
    const { data, error } = await supabase
      .from('traders')
      .select('*')
      .or('is_deleted.is.null,is_deleted.eq.false') // Exclude soft-deleted
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) { console.error(error); setLoading(false); return; }
    setTraders((data || []).map(mapTrader));
    setLoading(false);
  }, []);

  useEffect(() => { fetchTraders(); }, [fetchTraders]);

  const filtered = useMemo(() => {
    let result = traders;
    if (statusFilter === 'active') result = result.filter(t => t.active || t.isActive || t.status === 'active');
    else if (statusFilter === 'inactive') result = result.filter(t => !t.active && !t.isActive && t.status !== 'active');
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(t =>
        t.name?.toLowerCase().includes(s) ||
        t.email?.toLowerCase().includes(s) ||
        t.phone?.includes(s) ||
        t.telegramId?.toLowerCase().includes(s) ||
        t.id?.toLowerCase().includes(s)
      );
    }
    return result;
  }, [traders, statusFilter, search]);

  const stats = useMemo(() => ({
    total: traders.length,
    active: traders.filter(t => t.active || t.isActive || t.status === 'active').length,
    inactive: traders.filter(t => !t.active && !t.isActive && t.status !== 'active').length,
    withAddress: traders.filter(t => t.usdtDepositAddress).length,
    totalBalance: traders.reduce((sum, t) => sum + (t.balance || 0), 0),
  }), [traders]);

  // Generate USDT address using Edge Function (includes auto 20 TRX topup)
  const generateTatumAddress = async (traderId) => {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-trader-wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ traderId }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to generate address');
      }

      console.log('✅ Address generated:', data.address);
      if (data.activated) {
        console.log('✅ Address activated with TRX, txId:', data.activationTxId);
      } else if (data.activationError) {
        console.warn('⚠️ Address activation failed:', data.activationError);
      }

      return data.address;
    } catch (error) {
      console.error('Error generating Tatum address:', error);
      throw error;
    }
  };

  // Save trader (create or update)
  const handleSaveTrader = async (formData) => {
    try {
      if (selectedTrader) {
        const { password, ...updateData } = formData;
        const workingBalance = (Number(updateData.balance) || 0) - (Number(updateData.securityHold) || 0);

        await supabase.from('traders').update({
          name: updateData.name,
          phone: updateData.phone || '',
          payin_commission: Number(updateData.payinCommission) || 4,
          payout_commission: Number(updateData.payoutCommission) || 1,
          balance: Number(updateData.balance) || 0,
          security_hold: Number(updateData.securityHold) || 0,
          telegram: updateData.telegramId || '',
          telegram_group_link: updateData.telegramGroupLink || '',
          is_active: updateData.active,
        }).eq('id', selectedTrader.id);

        setToast({ msg: '✅ Trader updated successfully!', success: true });
      } else {
        // Password is auto-generated and emailed to trader
        const result = await createTrader({
          email: formData.email,
          name: formData.name,
          phone: formData.phone || '',
          priority: formData.priority || 'Normal',
          payinCommission: Number(formData.payinCommission) || 4,
          payoutCommission: Number(formData.payoutCommission) || 1,
          balance: Number(formData.balance) || 0,
          securityHold: Number(formData.securityHold) || 0,
          telegramId: formData.telegramId || '',
          telegramGroupLink: formData.telegramGroupLink || '',
          active: formData.active !== undefined ? formData.active : true,
        });

        const uid = result.uid;

        // Link to affiliate if selected
        if (formData.affiliateId) {
          await supabase.from('affiliate_traders').insert({
            affiliate_id: formData.affiliateId,
            trader_id: uid,
            commission_rate: Number(formData.affiliateCommission) || 5
          });
          
          // Also update trader's affiliate_id for quick reference
          await supabase.from('traders').update({
            affiliate_id: formData.affiliateId
          }).eq('id', uid);
        }

        // Generate USDT address
        try {
          await generateTatumAddress(uid);
          setToast({ msg: '✅ Trader created' + (formData.affiliateId ? ' with affiliate link' : '') + ' and USDT address!', success: true });
        } catch (error) {
          console.error('USDT address generation failed:', error);
          setToast({ msg: '✅ Trader created! USDT address failed - generate from menu.', success: true });
        }
      }

      setShowModal(false);
      setSelectedTrader(null);
      fetchTraders();
    } catch (error) {
      console.error('Error saving trader:', error);
      throw error;
    }
  };

  // Regenerate USDT address
  const handleRegenerateAddress = async (trader) => {
    if (!window.confirm(`${trader.usdtDepositAddress ? 'Regenerate' : 'Generate'} USDT address for ${trader.name}?`)) return;

    try {
      await generateTatumAddress(trader.id);
      setToast({ msg: '✅ USDT address ' + (trader.usdtDepositAddress ? 'regenerated' : 'generated') + '!', success: true });
      fetchTraders();
    } catch (error) {
      setToast({ msg: '❌ Error: ' + error.message, success: false });
    }
  };

  // Delete trader (2FA protected) - Soft delete to preserve audit trail
  const doDeleteTrader = async (trader) => {
    try {
      // Soft delete: mark as deleted instead of hard delete
      // Hard delete fails due to FK constraints (payins, payouts, disputes, etc.)
      const { error } = await supabase
        .from('traders')
        .update({ 
          is_active: false,
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', trader.id);
      
      if (error) {
        console.error('Delete error:', error);
        throw new Error(error.message || 'Failed to delete trader');
      }
      
      await logDataDeleted(
        'trader',
        trader.id,
        trader.name || 'Unknown Trader',
        'Trader soft-deleted by admin (preserved for audit trail)'
      );
      
      setToast({ msg: '✅ Trader deleted', success: true });
      fetchTraders();
    } catch (error) {
      setToast({ msg: '❌ Error: ' + error.message, success: false });
    }
  };

  const handleDeleteTrader = (trader) => {
    if (!window.confirm(`Delete ${trader.name}?\n\nThis cannot be undone.`)) return;
    requireVerification('Delete Trader', TwoFactorActions.DELETE_ENTITY, () => doDeleteTrader(trader));
  };

  // Toggle status (2FA protected)
  const doToggleStatus = async (trader) => {
    const isActive = trader.active || trader.isActive || trader.status === 'active';
    try {
      await supabase.from('traders').update({
        is_active: !isActive,
      }).eq('id', trader.id);
      setToast({ msg: `Trader ${!isActive ? 'activated' : 'deactivated'}`, success: true });
      fetchTraders();
    } catch (error) {
      setToast({ msg: 'Error: ' + error.message, success: false });
    }
  };

  const handleToggleStatus = (trader) => {
    requireVerification('Deactivate Trader', TwoFactorActions.DEACTIVATE_ENTITY, () => doToggleStatus(trader));
  };

  // Export
  const handleExport = () => {
    const csv = [
      ['ID', 'Name', 'Email', 'Phone', 'Status', 'Balance', 'Security Hold', 'Payin %', 'Payout %', 'USDT Address'],
      ...filtered.map(t => [
        t.id, t.name || '', t.email || '', t.phone || '',
        (t.active || t.isActive) ? 'Active' : 'Inactive',
        t.balance || 0, t.securityHold || 0,
        t.payinCommission || t.commissionRate || 4,
        t.payoutCommission || 1,
        t.usdtDepositAddress || '',
      ]),
    ].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `traders-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* Modal */}
      {showModal && (
        <TraderModal
          trader={selectedTrader}
          onClose={() => { setShowModal(false); setSelectedTrader(null); }}
          onSave={handleSaveTrader}
        />
      )}

      {/* Desktop header */}
      <div className="hidden sm:flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-sm">
              <Users className="w-5 h-5 text-white" />
            </div>
            Traders
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 ml-11">Cloud Functions (Admin stays logged in)</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 text-sm font-semibold">
            <Download className="w-4 h-4" /> Export
          </button>
          <button onClick={() => { setSelectedTrader(null); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 text-sm font-semibold">
            <UserPlus className="w-4 h-4" /> Add Trader
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl p-4 text-white">
          <p className="text-indigo-100 text-xs mb-1">Total Traders</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 text-white">
          <p className="text-green-100 text-xs mb-1">Active</p>
          <p className="text-2xl font-bold">{stats.active}</p>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 text-white">
          <p className="text-purple-100 text-xs mb-1">With USDT</p>
          <p className="text-2xl font-bold">{stats.withAddress}</p>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-4 text-white">
          <p className="text-orange-100 text-xs mb-1">Total Balance</p>
          <p className="text-2xl font-bold">₹{(stats.totalBalance / 1000).toFixed(0)}k</p>
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

      {/* Search + filter */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input type="text" placeholder="Search name, email, phone, telegram..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
        </div>
        <button onClick={() => setShowFilters(!showFilters)}
          className={`w-10 h-10 flex items-center justify-center rounded-xl border flex-shrink-0 ${
            showFilters ? 'bg-indigo-50 border-indigo-300 text-indigo-600' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
          }`}>
          <Filter className="w-4 h-4" />
        </button>
        <button onClick={() => { setSelectedTrader(null); setShowModal(true); }}
          className="sm:hidden w-10 h-10 flex items-center justify-center rounded-xl bg-indigo-600 text-white flex-shrink-0">
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
          {filtered.map(trader => (
            <TraderCard
              key={trader.id}
              trader={trader}
              onEdit={(t) => { setSelectedTrader(t); setShowModal(true); }}
              onDelete={handleDeleteTrader}
              onToggleStatus={handleToggleStatus}
              onRegenerateAddress={handleRegenerateAddress}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <Users className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No traders found</p>
          <p className="text-xs text-slate-400 mt-1">
            {search || statusFilter !== 'all' ? 'Try adjusting your filters' : 'Create your first trader to get started'}
          </p>
          {!search && statusFilter === 'all' && (
            <button onClick={() => { setSelectedTrader(null); setShowModal(true); }}
              className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700">
              <UserPlus className="w-4 h-4 inline mr-1" /> Add Trader
            </button>
          )}
        </div>
      )}
      
      {/* 2FA Modal */}
      <TwoFactorModalComponent />
    </div>
  );
}
