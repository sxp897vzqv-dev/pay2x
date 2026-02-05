import React, { useEffect, useState } from 'react';
import { db } from '../../../firebase';
import {
  doc, getDoc, updateDoc, collection, query, where, getDocs, onSnapshot,
  orderBy, limit, addDoc, serverTimestamp,
} from 'firebase/firestore';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  User, Wallet, CreditCard, Activity, ArrowLeft, RefreshCw, Edit, Save,
  CheckCircle, AlertCircle, Phone, Mail, Calendar, Shield, Lock, Plus,
  Minus, TrendingUp, TrendingDown, ToggleLeft, ToggleRight, Clock,
  DollarSign, Send,
} from 'lucide-react';
import { 
  logBalanceTopup, 
  logBalanceDeduct, 
  logSecurityHoldAdded, 
  logSecurityHoldReleased,
  logTraderActivated,
  logTraderDeactivated,
  logAuditEvent,
} from '../../../utils/auditLogger';

// Shared components
import { Toast } from '../../../components/admin';

/* ─── Tab Button ─── */
function TabButton({ active, icon: Icon, label, onClick, badge }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
        active ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
      {badge !== undefined && badge > 0 && (
        <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${
          active ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'
        }`}>{badge}</span>
      )}
    </button>
  );
}

/* ─── Profile Tab ─── */
function ProfileTab({ trader, onUpdate, saving }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});

  useEffect(() => {
    setForm({
      name: trader.name || '',
      email: trader.email || '',
      phone: trader.phone || '',
      commissionRate: trader.commissionRate || 4,
      payoutCommission: trader.payoutCommission || 1,
      priority: trader.priority || 'Normal',
    });
  }, [trader]);

  const handleSave = async () => {
    await onUpdate(form);
    setEditing(false);
  };

  const isActive = trader.isActive || trader.status === 'active';
  const workingBalance = (Number(trader.balance) || 0) - (Number(trader.securityHold) || 0);

  return (
    <div className="space-y-4">
      {/* Status banner */}
      <div className={`rounded-xl p-4 ${isActive ? 'bg-green-50 border border-green-200' : 'bg-slate-50 border border-slate-200'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isActive ? 'bg-green-100' : 'bg-slate-200'}`}>
              <User className={`w-5 h-5 ${isActive ? 'text-green-600' : 'text-slate-500'}`} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">{trader.name || 'Unnamed Trader'}</h3>
              <p className="text-xs text-slate-500 font-mono" style={{ fontFamily: 'var(--font-mono)' }}>ID: {trader.id}</p>
            </div>
          </div>
          <span className={`px-3 py-1 rounded-lg text-sm font-bold ${isActive ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>
            {isActive ? 'ACTIVE' : 'INACTIVE'}
          </span>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <p className="text-xs text-slate-400 mb-1">Working Balance</p>
          <p className="text-lg font-bold text-green-600">₹{workingBalance.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <p className="text-xs text-slate-400 mb-1">Security Hold</p>
          <p className="text-lg font-bold text-orange-600">₹{(trader.securityHold || 0).toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <p className="text-xs text-slate-400 mb-1">Total Commission</p>
          <p className="text-lg font-bold text-purple-600">₹{(trader.overallCommission || 0).toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <p className="text-xs text-slate-400 mb-1">Priority</p>
          <p className="text-lg font-bold text-indigo-600">{trader.priority || 'Normal'}</p>
        </div>
      </div>

      {/* Profile details */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Profile Details</h3>
          {!editing ? (
            <button onClick={() => setEditing(true)} className="text-xs text-indigo-600 font-semibold flex items-center gap-1">
              <Edit className="w-3.5 h-3.5" /> Edit
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setEditing(false)} className="text-xs text-slate-500 font-semibold">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="text-xs text-indigo-600 font-semibold flex items-center gap-1">
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
              </button>
            </div>
          )}
        </div>
        <div className="p-4 space-y-4">
          {[
            { key: 'name', label: 'Full Name', icon: User, type: 'text' },
            { key: 'email', label: 'Email', icon: Mail, type: 'email' },
            { key: 'phone', label: 'Phone', icon: Phone, type: 'tel' },
            { key: 'commissionRate', label: 'Payin Commission (%)', icon: DollarSign, type: 'number' },
            { key: 'payoutCommission', label: 'Payout Commission (%)', icon: DollarSign, type: 'number' },
            { key: 'priority', label: 'Priority', icon: Shield, type: 'select', options: ['Low', 'Normal', 'High', 'VIP'] },
          ].map(field => {
            const Icon = field.icon;
            return (
              <div key={field.key} className="flex items-center gap-3">
                <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-slate-500" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-slate-400 mb-0.5">{field.label}</p>
                  {editing ? (
                    field.type === 'select' ? (
                      <select value={form[field.key] || ''} onChange={e => setForm({ ...form, [field.key]: e.target.value })}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                        {field.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    ) : (
                      <input type={field.type} value={form[field.key] || ''}
                        onChange={e => setForm({ ...form, [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value })}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    )
                  ) : (
                    <p className="text-sm font-semibold text-slate-900">{trader[field.key] || '—'}{field.key.includes('Commission') && '%'}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Timestamps */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <Calendar className="w-4 h-4" />
          <span>Created: {trader.createdAt?.seconds ? new Date(trader.createdAt.seconds * 1000).toLocaleDateString('en-IN') : '—'}</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Balance Tab ─── */
function BalanceTab({ trader, setToast }) {
  const [amount, setAmount] = useState('');
  const [action, setAction] = useState('topup');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);

  const workingBalance = (Number(trader.balance) || 0) - (Number(trader.securityHold) || 0);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'transactions'), where('traderId', '==', trader.id), orderBy('createdAt', 'desc'), limit(20)));
        const list = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        setHistory(list);
      } catch (e) { console.error(e); }
    };
    if (trader.id) fetchHistory();
  }, [trader.id]);

  const handleSubmit = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { setToast({ msg: 'Enter a valid amount', success: false }); return; }
    if (!note.trim()) { setToast({ msg: 'Please add a note', success: false }); return; }

    setSaving(true);
    try {
      const updates = {};
      let txType = '';
      const balanceBefore = Number(trader.balance) || 0;
      const securityBefore = Number(trader.securityHold) || 0;

      switch (action) {
        case 'topup':
          updates.balance = balanceBefore + amt;
          txType = 'admin_topup';
          break;
        case 'deduct':
          if (amt > workingBalance) { setToast({ msg: 'Cannot deduct more than working balance', success: false }); setSaving(false); return; }
          updates.balance = balanceBefore - amt;
          txType = 'admin_deduct';
          break;
        case 'security_add':
          updates.securityHold = securityBefore + amt;
          txType = 'security_hold_add';
          break;
        case 'security_release':
          if (amt > securityBefore) { setToast({ msg: 'Cannot release more than current hold', success: false }); setSaving(false); return; }
          updates.securityHold = securityBefore - amt;
          txType = 'security_hold_release';
          break;
      }

      // Update Firestore
      await updateDoc(doc(db, 'trader', trader.id), updates);
      
      // Create transaction record
      await addDoc(collection(db, 'transactions'), { 
        traderId: trader.id, 
        type: txType, 
        amount: amt, 
        note, 
        createdAt: serverTimestamp(), 
        adminAction: true 
      });

      // 🔥 AUDIT LOG: Balance/Hold Changes (Priority #2)
      switch (action) {
        case 'topup':
          await logBalanceTopup(
            trader.id,
            trader.name || 'Unknown Trader',
            amt,
            balanceBefore,
            updates.balance,
            note
          );
          break;
        case 'deduct':
          await logBalanceDeduct(
            trader.id,
            trader.name || 'Unknown Trader',
            amt,
            balanceBefore,
            updates.balance,
            note
          );
          break;
        case 'security_add':
          await logSecurityHoldAdded(
            trader.id,
            trader.name || 'Unknown Trader',
            amt,
            securityBefore,
            updates.securityHold,
            note
          );
          break;
        case 'security_release':
          await logSecurityHoldReleased(
            trader.id,
            trader.name || 'Unknown Trader',
            amt,
            securityBefore,
            updates.securityHold,
            note
          );
          break;
      }

      setToast({ msg: 'Balance updated successfully', success: true });
      setAmount(''); setNote('');

      const snap = await getDocs(query(collection(db, 'transactions'), where('traderId', '==', trader.id), orderBy('createdAt', 'desc'), limit(20)));
      const list = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      setHistory(list);
    } catch (e) { console.error(e); setToast({ msg: 'Failed to update balance', success: false }); }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-4 text-white">
          <p className="text-green-100 text-xs font-semibold mb-1">Working Balance</p>
          <p className="text-2xl font-bold">₹{workingBalance.toLocaleString()}</p>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl p-4 text-white">
          <p className="text-orange-100 text-xs font-semibold mb-1">Security Hold</p>
          <p className="text-2xl font-bold">₹{(trader.securityHold || 0).toLocaleString()}</p>
        </div>
      </div>

      <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
        <p className="text-xs text-slate-500">Total: <span className="font-bold text-slate-900">₹{(trader.balance || 0).toLocaleString()}</span> = Working + Hold</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100"><h3 className="text-sm font-bold text-slate-900">Balance Action</h3></div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: 'topup', label: 'Top Up', icon: Plus, bg: '#f0fdf4', border: '#22c55e' },
              { key: 'deduct', label: 'Deduct', icon: Minus, bg: '#fef2f2', border: '#ef4444' },
              { key: 'security_add', label: 'Add Hold', icon: Lock, bg: '#fff7ed', border: '#f97316' },
              { key: 'security_release', label: 'Release Hold', icon: Shield, bg: '#eff6ff', border: '#3b82f6' },
            ].map(opt => {
              const Icon = opt.icon;
              const isSelected = action === opt.key;
              return (
                <button key={opt.key} onClick={() => setAction(opt.key)}
                  className="p-3 rounded-xl border-2 transition-all text-left"
                  style={{ borderColor: isSelected ? opt.border : '#e2e8f0', backgroundColor: isSelected ? opt.bg : '#fff' }}>
                  <Icon className="w-5 h-5 mb-1" style={{ color: isSelected ? opt.border : '#94a3b8' }} />
                  <p className={`text-sm font-semibold ${isSelected ? 'text-slate-900' : 'text-slate-600'}`}>{opt.label}</p>
                </button>
              );
            })}
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Amount *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">₹</span>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0"
                className="w-full pl-8 pr-3 py-3 border border-slate-300 rounded-xl text-lg font-bold focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Note *</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Reason for this action..." rows={2}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
          </div>
          <button onClick={handleSubmit} disabled={saving || !amount || !note.trim()}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-40 flex items-center justify-center gap-2">
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {saving ? 'Processing...' : 'Apply Action'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100"><h3 className="text-sm font-bold text-slate-900">Balance History</h3></div>
        <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
          {history.length > 0 ? history.map(tx => (
            <div key={tx.id} className="px-4 py-3 flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${tx.type?.includes('topup') || tx.type?.includes('release') ? 'bg-green-100' : 'bg-red-100'}`}>
                {tx.type?.includes('topup') || tx.type?.includes('release') ? <Plus className="w-4 h-4 text-green-600" /> : <Minus className="w-4 h-4 text-red-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 capitalize">{tx.type?.replace(/_/g, ' ') || 'Transaction'}</p>
                <p className="text-xs text-slate-400">{tx.createdAt?.seconds ? new Date(tx.createdAt.seconds * 1000).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</p>
              </div>
              <p className={`text-sm font-bold ${tx.type?.includes('topup') || tx.type?.includes('release') ? 'text-green-600' : 'text-red-600'}`}>
                {tx.type?.includes('topup') || tx.type?.includes('release') ? '+' : '−'}₹{(Number(tx.amount) || 0).toLocaleString()}
              </p>
            </div>
          )) : (
            <div className="p-6 text-center"><Clock className="w-8 h-8 text-slate-200 mx-auto mb-2" /><p className="text-sm text-slate-500">No history yet</p></div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── UPIs Tab ─── */
function UPIsTab({ trader }) {
  const categories = [
    { key: 'currentMerchantUpis', label: 'Current Merchant QR', bg: '#f0fdf4', badge: '#dcfce7', badgeText: '#16a34a' },
    { key: 'corporateMerchantUpis', label: 'Corporate Merchant QR', bg: '#eff6ff', badge: '#dbeafe', badgeText: '#2563eb' },
    { key: 'normalUpis', label: 'Normal UPI IDs', bg: '#faf5ff', badge: '#e9d5ff', badgeText: '#9333ea' },
    { key: 'bigUpis', label: 'Big Deposit UPI', bg: '#fff7ed', badge: '#fed7aa', badgeText: '#ea580c' },
    { key: 'impsAccounts', label: 'IMPS Bank Accounts', bg: '#eef2ff', badge: '#c7d2fe', badgeText: '#4f46e5' },
  ];

  return (
    <div className="space-y-4">
      {categories.map(cat => {
        const items = trader[cat.key] || [];
        return (
          <div key={cat.key} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between" style={{ backgroundColor: cat.bg }}>
              <h3 className="text-sm font-bold text-slate-900">{cat.label}</h3>
              <span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{ backgroundColor: cat.badge, color: cat.badgeText }}>
                {items.filter(u => u.active).length} Active
              </span>
            </div>
            <div className="p-3">
              {items.length > 0 ? (
                <div className="space-y-2">
                  {items.map((item, idx) => (
                    <div key={idx} className={`p-3 rounded-lg border ${item.active ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-mono text-sm font-bold text-slate-900" style={{ fontFamily: 'var(--font-mono)' }}>{item.upiId || item.accountNumber}</p>
                          {item.ifscCode && <p className="font-mono text-xs text-slate-500" style={{ fontFamily: 'var(--font-mono)' }}>IFSC: {item.ifscCode}</p>}
                          <p className="text-xs text-slate-400 mt-0.5">{item.holderName}</p>
                        </div>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${item.active ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}`}>
                          {item.active ? 'ACTIVE' : 'OFF'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400 text-center py-4">No accounts added</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Activity Tab ─── */
function ActivityTab({ trader }) {
  const [activity, setActivity] = useState({ payins: [], payouts: [], disputes: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActivity = async () => {
      try {
        const [payinsSnap, payoutsSnap, disputesSnap] = await Promise.all([
          getDocs(query(collection(db, 'payin'), where('traderId', '==', trader.id), orderBy('requestedAt', 'desc'), limit(10))),
          getDocs(query(collection(db, 'payouts'), where('traderId', '==', trader.id), orderBy('createdAt', 'desc'), limit(10))),
          getDocs(query(collection(db, 'disputes'), where('traderId', '==', trader.id), orderBy('createdAt', 'desc'), limit(10))),
        ]);
        const payins = [], payouts = [], disputes = [];
        payinsSnap.forEach(d => payins.push({ id: d.id, ...d.data() }));
        payoutsSnap.forEach(d => payouts.push({ id: d.id, ...d.data() }));
        disputesSnap.forEach(d => disputes.push({ id: d.id, ...d.data() }));
        setActivity({ payins, payouts, disputes });
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    if (trader.id) fetchActivity();
  }, [trader.id]);

  if (loading) return <div className="flex items-center justify-center py-12"><RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" /></div>;

  const sections = [
    { key: 'payins', label: 'Recent Payins', icon: TrendingUp, iconColor: 'text-green-600', link: `/admin/payins?trader=${trader.id}` },
    { key: 'payouts', label: 'Recent Payouts', icon: TrendingDown, iconColor: 'text-blue-600', link: `/admin/payouts?trader=${trader.id}` },
    { key: 'disputes', label: 'Recent Disputes', icon: AlertCircle, iconColor: 'text-amber-600', link: `/admin/disputes?trader=${trader.id}` },
  ];

  return (
    <div className="space-y-4">
      {sections.map(sec => {
        const Icon = sec.icon;
        const items = activity[sec.key];
        return (
          <div key={sec.key} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Icon className={`w-4 h-4 ${sec.iconColor}`} />{sec.label}</h3>
              <Link to={sec.link} className="text-xs text-indigo-600 font-semibold">View All</Link>
            </div>
            <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
              {items.length > 0 ? items.map(p => (
                <div key={p.id} className="px-4 py-2.5 flex items-center justify-between">
                  <div>
                    <p className={`text-sm font-bold ${sec.key === 'payins' ? 'text-green-600' : sec.key === 'payouts' ? 'text-blue-600' : 'text-slate-900'}`}>
                      ₹{(Number(p.amount) || 0).toLocaleString()}
                    </p>
                    <p className="text-xs text-slate-400">
                      {(p.requestedAt || p.createdAt)?.seconds ? new Date((p.requestedAt || p.createdAt).seconds * 1000).toLocaleDateString('en-IN') : '—'}
                    </p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${
                    p.status === 'completed' || p.status === 'approved' ? 'bg-green-100 text-green-700' :
                    p.status === 'pending' || p.status === 'assigned' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                  }`}>{p.status?.toUpperCase()}</span>
                </div>
              )) : <p className="text-sm text-slate-400 text-center py-4">No {sec.key} yet</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Main Component ─── */
export default function AdminTraderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [trader, setTrader] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'profile');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, 'trader', id), (snap) => {
      if (snap.exists()) setTrader({ id: snap.id, ...snap.data() });
      else setTrader(null);
      setLoading(false);
    });
    return () => unsub();
  }, [id]);

  const handleUpdate = async (updates) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'trader', id), updates);
      
      // 🔥 AUDIT LOG: Trader Profile Updates (Week 3)
      // Check which fields were updated (excluding status changes, those are logged separately)
      const changedFields = Object.keys(updates).filter(key => 
        key !== 'isActive' && 
        key !== 'status' && 
        updates[key] !== trader[key]
      );
      
      if (changedFields.length > 0) {
        const changes = {};
        changedFields.forEach(field => {
          changes[field] = { before: trader[field], after: updates[field] };
        });
        
        await logAuditEvent({
          action: 'trader_profile_updated',
          category: 'entity',
          entityType: 'trader',
          entityId: trader.id,
          entityName: trader.name || 'Unknown Trader',
          details: {
            note: `Updated fields: ${changedFields.join(', ')}`,
            metadata: changes,
          },
          severity: 'info',
        });
      }
      
      setToast({ msg: 'Trader updated successfully', success: true });
    } catch (e) { console.error(e); setToast({ msg: 'Failed to update trader', success: false }); }
    setSaving(false);
  };

  const handleToggleStatus = async () => {
    const newStatus = !(trader.isActive || trader.status === 'active');
    await handleUpdate({ isActive: newStatus, status: newStatus ? 'active' : 'inactive' });
    
    // 🔥 AUDIT LOG: Trader Activation/Deactivation (Week 3)
    if (newStatus) {
      await logTraderActivated(
        trader.id,
        trader.name || 'Unknown Trader',
        'Admin toggled trader to active status'
      );
    } else {
      await logTraderDeactivated(
        trader.id,
        trader.name || 'Unknown Trader',
        'Admin toggled trader to inactive status'
      );
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-[50vh]"><RefreshCw className="w-10 h-10 text-indigo-500 animate-spin" /></div>;
  if (!trader) return (
    <div className="text-center py-12">
      <User className="w-12 h-12 text-slate-200 mx-auto mb-3" />
      <p className="text-slate-500 font-medium">Trader not found</p>
      <button onClick={() => navigate('/admin/traders')} className="mt-4 text-indigo-600 font-semibold text-sm">← Back to Traders</button>
    </div>
  );

  const isActive = trader.isActive || trader.status === 'active';
  const upiCount = (trader.currentMerchantUpis?.length || 0) + (trader.corporateMerchantUpis?.length || 0) + (trader.normalUpis?.length || 0) + (trader.bigUpis?.length || 0) + (trader.impsAccounts?.length || 0);

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/admin/traders')} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 text-sm font-medium">
          <ArrowLeft className="w-4 h-4" /> Back to Traders
        </button>
        <button onClick={handleToggleStatus}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
            isActive ? 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100' : 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
          }`}>
          {isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
          {isActive ? 'Deactivate' : 'Activate'}
        </button>
      </div>

      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        <TabButton active={activeTab === 'profile'} icon={User} label="Profile" onClick={() => setActiveTab('profile')} />
        <TabButton active={activeTab === 'balance'} icon={Wallet} label="Balance" onClick={() => setActiveTab('balance')} />
        <TabButton active={activeTab === 'upis'} icon={CreditCard} label="UPIs" onClick={() => setActiveTab('upis')} badge={upiCount} />
        <TabButton active={activeTab === 'activity'} icon={Activity} label="Activity" onClick={() => setActiveTab('activity')} />
      </div>

      {activeTab === 'profile' && <ProfileTab trader={trader} onUpdate={handleUpdate} saving={saving} />}
      {activeTab === 'balance' && <BalanceTab trader={trader} setToast={setToast} />}
      {activeTab === 'upis' && <UPIsTab trader={trader} />}
      {activeTab === 'activity' && <ActivityTab trader={trader} />}
    </div>
  );
}