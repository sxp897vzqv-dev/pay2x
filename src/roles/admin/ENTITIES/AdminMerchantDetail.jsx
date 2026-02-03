import React, { useEffect, useState } from 'react';
import { db } from '../../../firebase';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Store, ArrowLeft, RefreshCw, Edit, Save, CheckCircle, AlertCircle, Globe, Mail, Phone, Key, Eye, TrendingUp, TrendingDown, ToggleLeft, ToggleRight, Activity, Calendar, Shield, Copy } from 'lucide-react';

function Toast({ msg, success, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return <div className={`fixed left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-50 ${success ? 'bg-green-600' : 'bg-red-600'} text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-medium`} style={{ top: 60 }}>{success ? <CheckCircle size={18} /> : <AlertCircle size={18} />}<span>{msg}</span></div>;
}

function TabButton({ active, icon: Icon, label, onClick }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${active ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
      <Icon className="w-4 h-4" />{label}
    </button>
  );
}

function ProfileTab({ merchant, onUpdate, saving }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const isActive = merchant.isActive || merchant.status === 'active';

  useEffect(() => { setForm({ name: merchant.name || merchant.businessName || '', email: merchant.email || '', phone: merchant.phone || '', website: merchant.website || '' }); }, [merchant]);

  const handleSave = async () => { await onUpdate(form); setEditing(false); };

  return (
    <div className="space-y-4">
      <div className={`rounded-xl p-4 ${isActive ? 'bg-green-50 border border-green-200' : 'bg-slate-50 border border-slate-200'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isActive ? 'bg-green-100' : 'bg-slate-200'}`}><Store className={`w-5 h-5 ${isActive ? 'text-green-600' : 'text-slate-500'}`} /></div>
            <div>
              <h3 className="font-bold text-slate-900">{merchant.name || merchant.businessName || 'Unnamed'}</h3>
              <p className="text-xs text-slate-500 font-mono" style={{ fontFamily: 'var(--font-mono)' }}>ID: {merchant.id}</p>
            </div>
          </div>
          <span className={`px-3 py-1 rounded-lg text-sm font-bold ${isActive ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>{isActive ? 'ACTIVE' : 'INACTIVE'}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-400 mb-1">Total Orders</p><p className="text-lg font-bold text-slate-900">{merchant.totalOrders || 0}</p></div>
        <div className="bg-white rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-400 mb-1">Total Volume</p><p className="text-lg font-bold text-green-600">₹{(merchant.totalVolume || 0).toLocaleString()}</p></div>
        <div className="bg-white rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-400 mb-1">Success Rate</p><p className="text-lg font-bold text-blue-600">{merchant.successRate || 0}%</p></div>
        <div className="bg-white rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-400 mb-1">Disputes</p><p className="text-lg font-bold text-amber-600">{merchant.disputeCount || 0}</p></div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Profile Details</h3>
          {!editing ? <button onClick={() => setEditing(true)} className="text-xs text-indigo-600 font-semibold flex items-center gap-1"><Edit className="w-3.5 h-3.5" /> Edit</button> : (
            <div className="flex gap-2">
              <button onClick={() => setEditing(false)} className="text-xs text-slate-500 font-semibold">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="text-xs text-indigo-600 font-semibold flex items-center gap-1">{saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save</button>
            </div>
          )}
        </div>
        <div className="p-4 space-y-4">
          {[{ key: 'name', label: 'Business Name', icon: Store }, { key: 'email', label: 'Email', icon: Mail }, { key: 'phone', label: 'Phone', icon: Phone }, { key: 'website', label: 'Website', icon: Globe }].map(field => {
            const Icon = field.icon;
            return (
              <div key={field.key} className="flex items-center gap-3">
                <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0"><Icon className="w-4 h-4 text-slate-500" /></div>
                <div className="flex-1">
                  <p className="text-xs text-slate-400 mb-0.5">{field.label}</p>
                  {editing ? <input type="text" value={form[field.key] || ''} onChange={e => setForm({ ...form, [field.key]: e.target.value })} className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" /> : <p className="text-sm font-semibold text-slate-900">{merchant[field.key] || '—'}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function APITab({ merchant, setToast }) {
  const [copied, setCopied] = useState('');
  const copyKey = (key, label) => { navigator.clipboard.writeText(key); setCopied(label); setToast({ msg: `${label} copied!`, success: true }); setTimeout(() => setCopied(''), 2000); };

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
        <Shield className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800">API keys are sensitive. Never share them publicly.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100"><h3 className="text-sm font-bold text-slate-900">API Credentials</h3></div>
        <div className="p-4 space-y-4">
          {[{ key: 'apiKey', label: 'API Key' }, { key: 'secretKey', label: 'Secret Key' }, { key: 'webhookUrl', label: 'Webhook URL' }].map(field => (
            <div key={field.key}>
              <p className="text-xs font-bold text-slate-500 mb-1.5">{field.label}</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  <p className="font-mono text-sm text-slate-700 truncate" style={{ fontFamily: 'var(--font-mono)' }}>{merchant[field.key] || '—'}</p>
                </div>
                {merchant[field.key] && (
                  <button onClick={() => copyKey(merchant[field.key], field.label)} className={`p-2 rounded-lg border ${copied === field.label ? 'bg-green-50 border-green-200' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                    {copied === field.label ? <CheckCircle className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-slate-500" />}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ActivityTab({ merchant }) {
  const [activity, setActivity] = useState({ payins: [], payouts: [], disputes: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActivity = async () => {
      try {
        const [payinsSnap, payoutsSnap, disputesSnap] = await Promise.all([
          getDocs(query(collection(db, 'payin'), where('merchantId', '==', merchant.id), orderBy('requestedAt', 'desc'), limit(10))),
          getDocs(query(collection(db, 'payouts'), where('merchantId', '==', merchant.id), orderBy('createdAt', 'desc'), limit(10))),
          getDocs(query(collection(db, 'disputes'), where('merchantId', '==', merchant.id), orderBy('createdAt', 'desc'), limit(10))),
        ]);
        const payins = [], payouts = [], disputes = [];
        payinsSnap.forEach(d => payins.push({ id: d.id, ...d.data() }));
        payoutsSnap.forEach(d => payouts.push({ id: d.id, ...d.data() }));
        disputesSnap.forEach(d => disputes.push({ id: d.id, ...d.data() }));
        setActivity({ payins, payouts, disputes });
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    if (merchant.id) fetchActivity();
  }, [merchant.id]);

  if (loading) return <div className="flex items-center justify-center py-12"><RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      {[{ key: 'payins', label: 'Recent Payins', icon: TrendingUp, iconColor: 'text-green-600' }, { key: 'payouts', label: 'Recent Payouts', icon: TrendingDown, iconColor: 'text-blue-600' }, { key: 'disputes', label: 'Recent Disputes', icon: AlertCircle, iconColor: 'text-amber-600' }].map(sec => {
        const Icon = sec.icon;
        const items = activity[sec.key];
        return (
          <div key={sec.key} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100"><h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Icon className={`w-4 h-4 ${sec.iconColor}`} />{sec.label}</h3></div>
            <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
              {items.length > 0 ? items.map(p => (
                <div key={p.id} className="px-4 py-2.5 flex items-center justify-between">
                  <div>
                    <p className={`text-sm font-bold ${sec.key === 'payins' ? 'text-green-600' : sec.key === 'payouts' ? 'text-blue-600' : 'text-slate-900'}`}>₹{(p.amount || 0).toLocaleString()}</p>
                    <p className="text-xs text-slate-400">{(p.requestedAt || p.createdAt)?.seconds ? new Date((p.requestedAt || p.createdAt).seconds * 1000).toLocaleDateString('en-IN') : '—'}</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${p.status === 'completed' || p.status === 'approved' ? 'bg-green-100 text-green-700' : p.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{p.status?.toUpperCase()}</span>
                </div>
              )) : <p className="text-sm text-slate-400 text-center py-4">No {sec.key} yet</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminMerchantDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [merchant, setMerchant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'profile');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, 'merchants', id), (snap) => {
      if (snap.exists()) setMerchant({ id: snap.id, ...snap.data() });
      else setMerchant(null);
      setLoading(false);
    });
    return () => unsub();
  }, [id]);

  const handleUpdate = async (updates) => {
    setSaving(true);
    try { await updateDoc(doc(db, 'merchants', id), updates); setToast({ msg: 'Merchant updated', success: true }); }
    catch (e) { console.error(e); setToast({ msg: 'Failed to update', success: false }); }
    setSaving(false);
  };

  const handleToggleStatus = async () => {
    const newStatus = !(merchant.isActive || merchant.status === 'active');
    await handleUpdate({ isActive: newStatus, status: newStatus ? 'active' : 'inactive' });
  };

  if (loading) return <div className="flex items-center justify-center min-h-[50vh]"><RefreshCw className="w-10 h-10 text-indigo-500 animate-spin" /></div>;
  if (!merchant) return <div className="text-center py-12"><Store className="w-12 h-12 text-slate-200 mx-auto mb-3" /><p className="text-slate-500 font-medium">Merchant not found</p><button onClick={() => navigate('/admin/merchants')} className="mt-4 text-indigo-600 font-semibold text-sm">← Back</button></div>;

  const isActive = merchant.isActive || merchant.status === 'active';

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/admin/merchants')} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 text-sm font-medium"><ArrowLeft className="w-4 h-4" /> Back</button>
        <button onClick={handleToggleStatus} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold ${isActive ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
          {isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}{isActive ? 'Deactivate' : 'Activate'}
        </button>
      </div>

      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        <TabButton active={activeTab === 'profile'} icon={Store} label="Profile" onClick={() => setActiveTab('profile')} />
        <TabButton active={activeTab === 'api'} icon={Key} label="API Keys" onClick={() => setActiveTab('api')} />
        <TabButton active={activeTab === 'activity'} icon={Activity} label="Activity" onClick={() => setActiveTab('activity')} />
      </div>

      {activeTab === 'profile' && <ProfileTab merchant={merchant} onUpdate={handleUpdate} saving={saving} />}
      {activeTab === 'api' && <APITab merchant={merchant} setToast={setToast} />}
      {activeTab === 'activity' && <ActivityTab merchant={merchant} />}
    </div>
  );
}