import React, { useEffect, useState } from 'react';
import { db } from '../../../firebase';
import { doc, onSnapshot, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { useParams, useNavigate } from 'react-router-dom';
import { UserCircle, ArrowLeft, RefreshCw, Mail, Phone, Calendar, TrendingUp, TrendingDown, Clock, Eye } from 'lucide-react';

function TabButton({ active, icon: Icon, label, onClick }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${active ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
      <Icon className="w-4 h-4" />{label}
    </button>
  );
}

function OverviewTab({ user }) {
  return (
    <div className="space-y-4">
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center">
            <UserCircle className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">{user.name || user.email || 'Anonymous User'}</h3>
            <p className="text-xs text-slate-500 font-mono" style={{ fontFamily: 'var(--font-mono)' }}>ID: {user.id}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-green-50 rounded-xl border border-green-200 p-4">
          <p className="text-xs text-green-600 mb-1 font-semibold">Total Payins</p>
          <p className="text-2xl font-bold text-green-700">{user.totalPayins || 0}</p>
          <p className="text-xs text-green-600 mt-1">₹{(user.totalPayinAmount || 0).toLocaleString()}</p>
        </div>
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
          <p className="text-xs text-blue-600 mb-1 font-semibold">Total Payouts</p>
          <p className="text-2xl font-bold text-blue-700">{user.totalPayouts || 0}</p>
          <p className="text-xs text-blue-600 mt-1">₹{(user.totalPayoutAmount || 0).toLocaleString()}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100"><h3 className="text-sm font-bold text-slate-900">User Info</h3></div>
        <div className="p-4 space-y-3">
          {[{ icon: Mail, label: 'Email', value: user.email }, { icon: Phone, label: 'Phone', value: user.phone }, { icon: Calendar, label: 'Joined', value: user.createdAt?.seconds ? new Date(user.createdAt.seconds * 1000).toLocaleDateString('en-IN') : '—' }].map((item, i) => {
            const Icon = item.icon;
            return (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center"><Icon className="w-4 h-4 text-slate-500" /></div>
                <div><p className="text-xs text-slate-400">{item.label}</p><p className="text-sm font-semibold text-slate-900">{item.value || '—'}</p></div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TransactionsTab({ userId, type }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const collectionName = type === 'payins' ? 'payin' : 'payouts';
  const dateField = type === 'payins' ? 'requestedAt' : 'createdAt';

  useEffect(() => {
    const fetch = async () => {
      try {
        const snap = await getDocs(query(collection(db, collectionName), where('userId', '==', userId), orderBy(dateField, 'desc'), limit(50)));
        const list = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        setTransactions(list);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    fetch();
  }, [userId, collectionName, dateField]);

  if (loading) return <div className="flex items-center justify-center py-12"><RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" /></div>;

  const isPayin = type === 'payins';

  return (
    <div className="space-y-2">
      {transactions.length > 0 ? transactions.map(tx => (
        <div key={tx.id} className="bg-white rounded-xl border border-slate-200 p-3">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <p className="font-mono text-xs text-slate-400" style={{ fontFamily: 'var(--font-mono)' }}>{tx.id?.slice(0, 12)}</p>
              <p className={`text-lg font-bold ${isPayin ? 'text-green-600' : 'text-blue-600'}`}>₹{(tx.amount || 0).toLocaleString()}</p>
            </div>
            <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${tx.status === 'completed' ? 'bg-green-100 text-green-700' : tx.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{tx.status?.toUpperCase()}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{tx[dateField]?.seconds ? new Date(tx[dateField].seconds * 1000).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</span>
            {tx.utrId && <span className="font-mono" style={{ fontFamily: 'var(--font-mono)' }}>UTR: {tx.utrId}</span>}
          </div>
          {tx.screenshotUrl && <a href={tx.screenshotUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 font-semibold"><Eye className="w-3 h-3" /> View Proof</a>}
        </div>
      )) : (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          {isPayin ? <TrendingUp className="w-10 h-10 text-slate-200 mx-auto mb-2" /> : <TrendingDown className="w-10 h-10 text-slate-200 mx-auto mb-2" />}
          <p className="text-slate-500 font-medium">No {type} yet</p>
        </div>
      )}
    </div>
  );
}

export default function AdminUserDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, 'users', id), (snap) => {
      if (snap.exists()) setUser({ id: snap.id, ...snap.data() });
      else setUser(null);
      setLoading(false);
    });
    return () => unsub();
  }, [id]);

  if (loading) return <div className="flex items-center justify-center min-h-[50vh]"><RefreshCw className="w-10 h-10 text-indigo-500 animate-spin" /></div>;
  if (!user) return (
    <div className="text-center py-12">
      <UserCircle className="w-12 h-12 text-slate-200 mx-auto mb-3" />
      <p className="text-slate-500 font-medium">User not found</p>
      <button onClick={() => navigate('/admin/users')} className="mt-4 text-indigo-600 font-semibold text-sm">← Back to Users</button>
    </div>
  );

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <button onClick={() => navigate('/admin/users')} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 text-sm font-medium">
        <ArrowLeft className="w-4 h-4" /> Back to Users
      </button>

      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        <TabButton active={activeTab === 'overview'} icon={UserCircle} label="Overview" onClick={() => setActiveTab('overview')} />
        <TabButton active={activeTab === 'payins'} icon={TrendingUp} label="Payins" onClick={() => setActiveTab('payins')} />
        <TabButton active={activeTab === 'payouts'} icon={TrendingDown} label="Payouts" onClick={() => setActiveTab('payouts')} />
      </div>

      {activeTab === 'overview' && <OverviewTab user={user} />}
      {activeTab === 'payins' && <TransactionsTab userId={id} type="payins" />}
      {activeTab === 'payouts' && <TransactionsTab userId={id} type="payouts" />}
    </div>
  );
}