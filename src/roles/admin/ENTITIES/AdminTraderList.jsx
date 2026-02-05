import React, { useEffect, useState, useMemo } from 'react';
import { db } from '../../../firebase';
import {
  collection, query, doc, updateDoc, onSnapshot, orderBy, limit, setDoc, getDoc, serverTimestamp, deleteDoc,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users, Search, Filter, Plus, RefreshCw, Eye, CheckCircle, AlertCircle,
  Wallet, Phone, Mail, Download, UserPlus, ToggleLeft, ToggleRight, X,
  User, Lock, DollarSign, Shield, MessageCircle, Key, Copy, MoreVertical,
  Trash2, Edit, EyeOff,
} from 'lucide-react';
import { logDataDeleted } from '../../../utils/auditLogger';

// Shared components
import { Toast, FilterPills, SearchInput, CardSkeleton } from '../../../components/admin';

// Extracted components
import TraderModal from './components/TraderModal';
import TraderCard from './components/TraderCard';

// Initialize Firebase Functions
const functions = getFunctions();

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

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'trader'), orderBy('createdAt', 'desc'), limit(100)),
      (snap) => {
        const list = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        setTraders(list);
        setLoading(false);
      },
      (err) => { console.error(err); setLoading(false); }
    );
    return () => unsub();
  }, []);

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

  // Generate USDT address using Tatum
  const generateTatumAddress = async (traderId) => {
    try {
      const configDoc = await getDoc(doc(db, 'system', 'tatumConfig'));
      if (!configDoc.exists() || !configDoc.data().masterWallet) {
        throw new Error('Master wallet not configured. Please generate master wallet in Settings first.');
      }

      const config = configDoc.data();
      const { tatumApiKey, masterWallet } = config;

      if (!tatumApiKey || !masterWallet.xpub) {
        throw new Error('Tatum API key or XPUB not found');
      }

      const metaDoc = await getDoc(doc(db, 'system', 'addressMeta'));
      const nextIndex = metaDoc.exists() ? (metaDoc.data().lastIndex || 0) + 1 : 1;

      const response = await fetch(`https://api.tatum.io/v3/tron/address/${masterWallet.xpub}/${nextIndex}`, {
        method: 'GET',
        headers: { 'x-api-key': tatumApiKey },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to generate address');
      }

      const addressData = await response.json();

      await updateDoc(doc(db, 'trader', traderId), {
        usdtDepositAddress: addressData.address,
        derivationIndex: nextIndex,
        mnemonic: masterWallet.mnemonic,
        addressGeneratedAt: serverTimestamp(),
      });

      await setDoc(doc(db, 'system', 'addressMeta'), {
        lastIndex: nextIndex,
        lastUpdated: serverTimestamp(),
      }, { merge: true });

      await setDoc(doc(db, 'addressMapping', addressData.address), {
        traderId: traderId,
        derivationIndex: nextIndex,
        createdAt: serverTimestamp(),
      });

      return addressData.address;
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

        await updateDoc(doc(db, 'trader', selectedTrader.id), {
          name: updateData.name,
          phone: updateData.phone || '',
          priority: updateData.priority || 'Normal',
          payinCommission: Number(updateData.payinCommission) || 4,
          payoutCommission: Number(updateData.payoutCommission) || 1,
          commissionRate: Number(updateData.payinCommission) || 4,
          balance: Number(updateData.balance) || 0,
          securityHold: Number(updateData.securityHold) || 0,
          workingBalance: workingBalance,
          telegramId: updateData.telegramId || '',
          telegramGroupLink: updateData.telegramGroupLink || '',
          active: updateData.active,
          isActive: updateData.active,
          status: updateData.active ? 'active' : 'inactive',
          updatedAt: serverTimestamp(),
          lastModified: serverTimestamp(),
        });

        setToast({ msg: '✅ Trader updated successfully!', success: true });
      } else {
        const createTraderComplete = httpsCallable(functions, 'createTraderComplete');

        const result = await createTraderComplete({
          email: formData.email,
          password: formData.password,
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
        
        if (!result.data.success) {
          throw new Error(result.data.message || 'Failed to create trader');
        }

        const uid = result.data.uid;

        // Generate USDT address
        try {
          await generateTatumAddress(uid);
          setToast({ msg: '✅ Trader created with USDT address!', success: true });
        } catch (error) {
          console.error('USDT address generation failed:', error);
          setToast({ msg: '✅ Trader created! USDT address failed - generate from menu.', success: true });
        }
      }

      setShowModal(false);
      setSelectedTrader(null);
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
    } catch (error) {
      setToast({ msg: '❌ Error: ' + error.message, success: false });
    }
  };

  // Delete trader
  const handleDeleteTrader = async (trader) => {
    if (!window.confirm(`Delete ${trader.name}?\n\nThis cannot be undone.`)) return;

    try {
      await deleteDoc(doc(db, 'trader', trader.id));
      if (trader.usdtDepositAddress) {
        await deleteDoc(doc(db, 'addressMapping', trader.usdtDepositAddress)).catch(() => {});
      }
      
      await logDataDeleted(
        'trader',
        trader.id,
        trader.name || 'Unknown Trader',
        trader.usdtDepositAddress 
          ? 'Trader and associated USDT deposit address permanently deleted by admin'
          : 'Trader permanently deleted by admin'
      );
      
      setToast({ msg: '✅ Trader deleted', success: true });
    } catch (error) {
      setToast({ msg: '❌ Error: ' + error.message, success: false });
    }
  };

  // Toggle status
  const handleToggleStatus = async (trader) => {
    const isActive = trader.active || trader.isActive || trader.status === 'active';
    try {
      await updateDoc(doc(db, 'trader', trader.id), {
        active: !isActive,
        isActive: !isActive,
        status: !isActive ? 'active' : 'inactive',
      });
      setToast({ msg: `Trader ${!isActive ? 'activated' : 'deactivated'}`, success: true });
    } catch (error) {
      setToast({ msg: 'Error: ' + error.message, success: false });
    }
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
    </div>
  );
}
