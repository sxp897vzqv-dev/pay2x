import React, { useEffect, useState } from 'react';
import { supabase } from '../../../supabase';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Store, ArrowLeft, RefreshCw, Edit, Save, CheckCircle, AlertCircle, Globe, Mail, Phone, Key, Eye, TrendingUp, TrendingDown, ToggleLeft, ToggleRight, Activity, Calendar, Shield, Copy, Wallet, Plus, Minus, Send, Clock } from 'lucide-react';
import {
  logMerchantActivated,
  logMerchantDeactivated,
  logAuditEvent,
  logMerchantAPIKeyGenerated,
  logMerchantBalanceTopup,
  logMerchantBalanceDeduct,
} from '../../../utils/auditLogger';
import ResetPasswordButton from './components/ResetPasswordButton';

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

// Map Supabase merchant row → camelCase for child components
function mapMerchant(row) {
  if (!row) return null;
  return {
    ...row,
    isActive: row.is_active ?? row.status === 'active',
    businessName: row.business_name || row.name,
    name: row.name || row.business_name,
    apiKey: row.api_key || row.live_api_key,
    secretKey: row.secret_key,
    webhookUrl: row.webhook_url,
    totalOrders: row.total_orders || 0,
    totalVolume: row.total_volume || 0,
    successRate: row.success_rate || 0,
    disputeCount: row.dispute_count || 0,
    createdAt: row.created_at ? { seconds: new Date(row.created_at).getTime() / 1000 } : null,
  };
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
        
        {/* Password Reset Section */}
        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-700">Password</p>
            <p className="text-xs text-slate-400">Reset merchant's login password</p>
          </div>
          <ResetPasswordButton email={merchant.email} name={merchant.name || merchant.businessName} />
        </div>
      </div>
    </div>
  );
}

/* ─── Balance Tab ─── */
function BalanceTab({ merchant, setToast, onRefresh }) {
  const [amount, setAmount] = useState('');
  const [action, setAction] = useState('topup');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);

  const availableBalance = Number(merchant.available_balance) || 0;
  const pendingBalance = Number(merchant.pending_balance) || 0;

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const { data } = await supabase
          .from('balance_history')
          .select('*')
          .eq('entity_type', 'merchant')
          .eq('entity_id', merchant.id)
          .order('created_at', { ascending: false })
          .limit(20);
        setHistory(data || []);
      } catch (e) { console.error(e); }
    };
    if (merchant.id) fetchHistory();
  }, [merchant.id]);

  const handleSubmit = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { setToast({ msg: 'Enter a valid amount', success: false }); return; }
    if (!note.trim()) { setToast({ msg: 'Please add a note', success: false }); return; }

    setSaving(true);
    try {
      const balanceBefore = availableBalance;
      let newBalance = balanceBefore;
      let reason = '';

      if (action === 'topup') {
        newBalance = balanceBefore + amt;
        reason = 'admin_topup';
      } else if (action === 'deduct') {
        if (amt > balanceBefore) { 
          setToast({ msg: 'Cannot deduct more than available balance', success: false }); 
          setSaving(false); 
          return; 
        }
        newBalance = balanceBefore - amt;
        reason = 'admin_deduct';
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Update merchant balance
      const { error: updateError } = await supabase.from('merchants').update({ 
        available_balance: newBalance,
        updated_at: new Date().toISOString(),
      }).eq('id', merchant.id);

      if (updateError) throw updateError;

      // Create balance history entry
      const { error: historyError } = await supabase.from('balance_history').insert({
        entity_type: 'merchant',
        entity_id: merchant.id,
        amount: action === 'topup' ? amt : -amt,
        balance_before: balanceBefore,
        balance_after: newBalance,
        reason: reason,
        actor_id: user?.id || null,
        actor_role: 'admin',
        note: note,
      });

      if (historyError) {
        console.error('Balance history error:', historyError);
        // Non-fatal, continue
      }

      // Audit logs
      if (action === 'topup') {
        await logMerchantBalanceTopup(merchant.id, merchant.name || merchant.businessName || 'Unknown', amt, balanceBefore, newBalance, note);
      } else {
        await logMerchantBalanceDeduct(merchant.id, merchant.name || merchant.businessName || 'Unknown', amt, balanceBefore, newBalance, note);
      }

      setToast({ msg: 'Balance updated successfully', success: true });
      setAmount(''); setNote('');
      if (onRefresh) onRefresh();

      // Refresh history
      const { data } = await supabase
        .from('balance_history')
        .select('*')
        .eq('entity_type', 'merchant')
        .eq('entity_id', merchant.id)
        .order('created_at', { ascending: false })
        .limit(20);
      setHistory(data || []);
    } catch (e) { 
      console.error(e); 
      setToast({ msg: 'Failed to update balance: ' + (e.message || 'Unknown error'), success: false }); 
    }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-4 text-white">
          <p className="text-green-100 text-xs font-semibold mb-1">Available Balance</p>
          <p className="text-2xl font-bold">₹{availableBalance.toLocaleString()}</p>
        </div>
        <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl p-4 text-white">
          <p className="text-amber-100 text-xs font-semibold mb-1">Pending Balance</p>
          <p className="text-2xl font-bold">₹{pendingBalance.toLocaleString()}</p>
        </div>
      </div>

      <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
        <p className="text-xs text-slate-500">
          Total: <span className="font-bold text-slate-900">₹{(availableBalance + pendingBalance).toLocaleString()}</span> = Available + Pending
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">Balance Action</h3>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: 'topup', label: 'Add Balance', icon: Plus, bg: '#f0fdf4', border: '#22c55e' },
              { key: 'deduct', label: 'Deduct Balance', icon: Minus, bg: '#fef2f2', border: '#ef4444' },
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
                className="w-full pl-8 pr-3 py-3 border border-slate-300 rounded-xl text-lg font-bold focus:outline-none focus:ring-2 focus:ring-purple-400" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Note *</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Reason for this action..." rows={2}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none" />
          </div>
          <button onClick={handleSubmit} disabled={saving || !amount || !note.trim()}
            className="w-full py-3 bg-purple-600 text-white rounded-xl font-bold text-sm hover:bg-purple-700 disabled:opacity-40 flex items-center justify-center gap-2">
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {saving ? 'Processing...' : 'Apply Action'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">Balance History</h3>
        </div>
        <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
          {history.length > 0 ? history.map(tx => {
            const isCredit = Number(tx.amount) > 0;
            return (
              <div key={tx.id} className="px-4 py-3 flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isCredit ? 'bg-green-100' : 'bg-red-100'}`}>
                  {isCredit ? <Plus className="w-4 h-4 text-green-600" /> : <Minus className="w-4 h-4 text-red-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 capitalize">{tx.reason?.replace(/_/g, ' ') || 'Transaction'}</p>
                  <p className="text-xs text-slate-400 truncate">{tx.note || '—'}</p>
                  <p className="text-xs text-slate-400">{tx.created_at ? new Date(tx.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</p>
                </div>
                <p className={`text-sm font-bold ${isCredit ? 'text-green-600' : 'text-red-600'}`}>
                  {isCredit ? '+' : '−'}₹{Math.abs(Number(tx.amount) || 0).toLocaleString()}
                </p>
              </div>
            );
          }) : (
            <div className="p-6 text-center">
              <Clock className="w-8 h-8 text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No history yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Key Generation Helpers ─── */
function generateApiKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'pk_live_';
  for (let i = 0; i < 32; i++) key += chars.charAt(Math.floor(Math.random() * chars.length));
  return key;
}

function generateSecretKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'sk_live_';
  for (let i = 0; i < 64; i++) key += chars.charAt(Math.floor(Math.random() * chars.length));
  return key;
}

function APITab({ merchant, setToast, onRefresh }) {
  const [copied, setCopied] = useState('');
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  
  const copyKey = (key, label) => { navigator.clipboard.writeText(key); setCopied(label); setToast({ msg: `${label} copied!`, success: true }); setTimeout(() => setCopied(''), 2000); };
  
  const handleRegenerateKeys = async () => {
    setRegenerating(true);
    try {
      const oldApiKeyPrefix = merchant.apiKey ? merchant.apiKey.substring(0, 16) : 'none';
      const newApiKey = generateApiKey();
      const newSecretKey = generateSecretKey();
      
      await supabase.from('merchants').update({
        api_key: newApiKey,
        secret_key: newSecretKey,
      }).eq('id', merchant.id);
      
      await logMerchantAPIKeyGenerated(
        merchant.id,
        merchant.name || merchant.businessName || 'Unknown Merchant',
        oldApiKeyPrefix
      );
      
      setToast({ msg: '✅ API keys regenerated successfully!', success: true });
      setShowRegenerateModal(false);
      if (onRefresh) onRefresh();
    } catch (e) {
      console.error(e);
      setToast({ msg: '❌ Failed to regenerate keys', success: false });
    }
    setRegenerating(false);
  };

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
        <Shield className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800">API keys are sensitive. Never share them publicly.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">API Credentials</h3>
          <button 
            onClick={() => setShowRegenerateModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-semibold hover:bg-red-100 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Regenerate Keys
          </button>
        </div>
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

      {showRegenerateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-slate-900 mb-1">Regenerate API Keys?</h3>
                <p className="text-sm text-slate-600">This action will:</p>
                <ul className="text-sm text-slate-600 mt-2 space-y-1 list-disc list-inside">
                  <li>Generate new API Key and Secret Key</li>
                  <li><strong className="text-red-600">Invalidate old keys immediately</strong></li>
                  <li>Log this action in audit logs</li>
                  <li>Require merchant to update their integration</li>
                </ul>
              </div>
            </div>
            
            <div className="flex gap-2 pt-2">
              <button 
                onClick={() => setShowRegenerateModal(false)}
                disabled={regenerating}
                className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleRegenerateKeys}
                disabled={regenerating}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
              >
                {regenerating ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" />Regenerating...</>
                ) : (
                  <><RefreshCw className="w-4 h-4" />Yes, Regenerate</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActivityTab({ merchant }) {
  const [activity, setActivity] = useState({ payins: [], payouts: [], disputes: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActivity = async () => {
      try {
        const [payinsRes, payoutsRes, disputesRes] = await Promise.all([
          supabase.from('payins').select('*').eq('merchant_id', merchant.id).order('created_at', { ascending: false }).limit(10),
          supabase.from('payouts').select('*').eq('merchant_id', merchant.id).order('created_at', { ascending: false }).limit(10),
          supabase.from('disputes').select('*').eq('merchant_id', merchant.id).order('created_at', { ascending: false }).limit(10),
        ]);
        // Map timestamps for display
        const mapTs = (row) => ({
          ...row,
          requestedAt: row.requested_at ? { seconds: new Date(row.requested_at).getTime() / 1000 } : null,
          createdAt: row.created_at ? { seconds: new Date(row.created_at).getTime() / 1000 } : null,
        });
        setActivity({
          payins: (payinsRes.data || []).map(mapTs),
          payouts: (payoutsRes.data || []).map(mapTs),
          disputes: (disputesRes.data || []).map(mapTs),
        });
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
                    <p className={`text-sm font-bold ${sec.key === 'payins' ? 'text-green-600' : sec.key === 'payouts' ? 'text-blue-600' : 'text-slate-900'}`}>₹{(Number(p.amount) || 0).toLocaleString()}</p>
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

  const fetchMerchant = async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from('merchants')
      .select('*')
      .eq('id', id)
      .single();
    if (error) { console.error(error); setMerchant(null); }
    else setMerchant(mapMerchant(data));
    setLoading(false);
  };

  useEffect(() => { fetchMerchant(); }, [id]);

  const handleUpdate = async (updates) => {
    setSaving(true);
    try {
      // Convert camelCase form fields to snake_case for DB
      const dbUpdates = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.email !== undefined) dbUpdates.email = updates.email;
      if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
      if (updates.website !== undefined) dbUpdates.website = updates.website;
      if (updates.isActive !== undefined) { dbUpdates.is_active = updates.isActive; dbUpdates.status = updates.isActive ? 'active' : 'inactive'; }
      if (updates.status !== undefined) dbUpdates.status = updates.status;

      await supabase.from('merchants').update(dbUpdates).eq('id', id);
      
      const changedFields = Object.keys(updates).filter(key => 
        key !== 'isActive' && key !== 'status' && updates[key] !== merchant[key]
      );
      
      if (changedFields.length > 0) {
        const changes = {};
        changedFields.forEach(field => {
          changes[field] = { before: merchant[field], after: updates[field] };
        });
        
        await logAuditEvent({
          action: 'merchant_profile_updated',
          category: 'entity',
          entityType: 'merchant',
          entityId: merchant.id,
          entityName: merchant.name || merchant.businessName || 'Unknown Merchant',
          details: {
            note: `Updated fields: ${changedFields.join(', ')}`,
            metadata: changes,
          },
          severity: 'info',
        });
      }
      
      setToast({ msg: 'Merchant updated', success: true });
      fetchMerchant();
    } catch (e) { console.error(e); setToast({ msg: 'Failed to update', success: false }); }
    setSaving(false);
  };

  const handleToggleStatus = async () => {
    const newStatus = !(merchant.isActive || merchant.status === 'active');
    await handleUpdate({ isActive: newStatus, status: newStatus ? 'active' : 'inactive' });
    
    if (newStatus) {
      await logMerchantActivated(merchant.id, merchant.name || merchant.businessName || 'Unknown Merchant', 'Admin toggled merchant to active status');
    } else {
      await logMerchantDeactivated(merchant.id, merchant.name || merchant.businessName || 'Unknown Merchant', 'Admin toggled merchant to inactive status');
    }
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
        <TabButton active={activeTab === 'balance'} icon={Wallet} label="Balance" onClick={() => setActiveTab('balance')} />
        <TabButton active={activeTab === 'api'} icon={Key} label="API Keys" onClick={() => setActiveTab('api')} />
        <TabButton active={activeTab === 'activity'} icon={Activity} label="Activity" onClick={() => setActiveTab('activity')} />
      </div>

      {activeTab === 'profile' && <ProfileTab merchant={merchant} onUpdate={handleUpdate} saving={saving} />}
      {activeTab === 'balance' && <BalanceTab merchant={merchant} setToast={setToast} onRefresh={fetchMerchant} />}
      {activeTab === 'api' && <APITab merchant={merchant} setToast={setToast} onRefresh={fetchMerchant} />}
      {activeTab === 'activity' && <ActivityTab merchant={merchant} />}
    </div>
  );
}
