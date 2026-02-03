import React, { useEffect, useState, useMemo } from 'react';
import { db } from '../../../firebase';
import {
  collection, query, doc, updateDoc, onSnapshot, orderBy, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Link, useNavigate } from 'react-router-dom';
import {
  Store, Search, Filter, Plus, Eye, CheckCircle, AlertCircle,
  ToggleLeft, ToggleRight, Download, Globe, Key, RefreshCw, X,
  User, Mail, Phone, Building, Link as LinkIcon, DollarSign,
  MoreVertical, Edit, Trash2, EyeOff, Copy, Shield,
} from 'lucide-react';

// Initialize Firebase Functions
const functions = getFunctions();

// ═══════════════════════════════════════════════════════════════
// IMPORTANT: Change this to match your Firestore collection name
// Common names: 'merchant', 'merchants', 'Merchant'
// ═══════════════════════════════════════════════════════════════
const MERCHANT_COLLECTION = 'merchant';  // ← Change if needed

/* ─── Toast ─── */
function Toast({ msg, success, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-50 ${success ? 'bg-green-600' : 'bg-red-600'} text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-medium`} style={{ top: 60 }}>
      {success ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
      <span>{msg}</span>
    </div>
  );
}

/* ─── Add/Edit Merchant Modal ─── */
function MerchantModal({ merchant, onClose, onSave }) {
  const [formData, setFormData] = useState({
    name: '',
    businessName: '',
    email: '',
    password: '',
    phone: '',
    website: '',
    callbackUrl: '',
    webhookUrl: '',
    payinCommission: 2,
    payoutCommission: 1,
    active: true,
    ...merchant,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.name.trim() && !formData.businessName.trim()) { setError('Business name is required'); return; }
    if (!formData.email.trim()) { setError('Email is required'); return; }
    if (!merchant && !formData.password) { setError('Password is required for new merchants'); return; }
    if (!merchant && formData.password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (!/^\S+@\S+\.\S+$/.test(formData.email)) { setError('Invalid email format'); return; }

    setSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-2xl bg-white shadow-2xl rounded-t-2xl sm:rounded-2xl overflow-hidden mt-auto sm:mt-0 max-h-[90vh] flex flex-col">
        {/* Handle */}
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 bg-slate-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
              <Store className="w-4 h-4 text-orange-600" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              {merchant ? 'Edit Merchant' : 'Add New Merchant'}
            </h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Basic Info */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Business Information</p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1">
                  <Building className="w-3.5 h-3.5 text-slate-400" /> Business Name *
                </label>
                <input
                  type="text"
                  value={formData.businessName || formData.name}
                  onChange={e => { handleChange('businessName', e.target.value); handleChange('name', e.target.value); }}
                  placeholder="Acme Corp"
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-slate-400" /> Email *
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={e => handleChange('email', e.target.value)}
                  placeholder="merchant@example.com"
                  disabled={!!merchant}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent disabled:bg-slate-100 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            {!merchant && (
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1">
                  <Key className="w-3.5 h-3.5 text-slate-400" /> Password *
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={e => handleChange('password', e.target.value)}
                  placeholder="Min. 6 characters"
                  minLength={6}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-slate-400" /> Phone
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={e => handleChange('phone', e.target.value)}
                  placeholder="+91 9876543210"
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5 text-slate-400" /> Website
                </label>
                <input
                  type="url"
                  value={formData.website}
                  onChange={e => handleChange('website', e.target.value)}
                  placeholder="https://example.com"
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* API Settings */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">API Settings</p>
            
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1">
                <LinkIcon className="w-3.5 h-3.5 text-slate-400" /> Callback URL
              </label>
              <input
                type="url"
                value={formData.callbackUrl}
                onChange={e => handleChange('callbackUrl', e.target.value)}
                placeholder="https://example.com/callback"
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1">
                <LinkIcon className="w-3.5 h-3.5 text-slate-400" /> Webhook URL
              </label>
              <input
                type="url"
                value={formData.webhookUrl}
                onChange={e => handleChange('webhookUrl', e.target.value)}
                placeholder="https://example.com/webhook"
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
              />
            </div>
          </div>

          {/* Commission Settings */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Commission Settings</p>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5 text-green-500" /> Payin Rate (%)
                </label>
                <input
                  type="number"
                  value={formData.payinCommission}
                  onChange={e => handleChange('payinCommission', Number(e.target.value))}
                  placeholder="2"
                  min="0"
                  max="100"
                  step="0.1"
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5 text-blue-500" /> Payout Rate (%)
                </label>
                <input
                  type="number"
                  value={formData.payoutCommission}
                  onChange={e => handleChange('payoutCommission', Number(e.target.value))}
                  placeholder="1"
                  min="0"
                  max="100"
                  step="0.1"
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Active Status */}
          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="active"
              checked={formData.active}
              onChange={e => handleChange('active', e.target.checked)}
              className="w-4 h-4 text-orange-600 rounded focus:ring-2 focus:ring-orange-500"
            />
            <label htmlFor="active" className="text-sm font-medium text-slate-700">Active Status</label>
          </div>
        </form>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-100 flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 border border-slate-300 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 active:bg-slate-100"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 py-3 bg-orange-600 text-white rounded-xl text-sm font-bold hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.97]"
          >
            {saving ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> {merchant ? 'Updating...' : 'Creating...'}</>
            ) : (
              <><Store className="w-4 h-4" /> {merchant ? 'Update Merchant' : 'Create Merchant'}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Merchant Card ─── */
function MerchantCard({ merchant, onEdit, onDelete, onToggleStatus }) {
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);

  const isActive = merchant.active || merchant.isActive || merchant.status === 'active';

  const copyApiKey = () => {
    if (merchant.apiKey) {
      navigator.clipboard.writeText(merchant.apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className={`h-1 ${isActive ? 'bg-green-500' : 'bg-slate-300'}`} />
      <div className="p-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
              {(merchant.businessName || merchant.name)?.charAt(0).toUpperCase() || 'M'}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-slate-900 text-sm truncate">{merchant.businessName || merchant.name || 'Unnamed'}</h3>
              <p className="text-xs text-slate-400 truncate">{merchant.email}</p>
            </div>
          </div>
          <div className="relative">
            <button onClick={() => setShowMenu(!showMenu)} className="p-1.5 hover:bg-slate-100 rounded-lg">
              <MoreVertical className="w-4 h-4 text-slate-500" />
            </button>
            {showMenu && (
              <div className="absolute right-0 mt-1 w-44 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-20">
                <button onClick={() => { onEdit(merchant); setShowMenu(false); }}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-slate-50 flex items-center gap-2">
                  <Edit className="w-3.5 h-3.5" /> Edit Details
                </button>
                <button onClick={() => { onToggleStatus(merchant); setShowMenu(false); }}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-slate-50 flex items-center gap-2">
                  {isActive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {isActive ? 'Deactivate' : 'Activate'}
                </button>
                <button onClick={() => { onDelete(merchant); setShowMenu(false); }}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-red-50 text-red-600 flex items-center gap-2">
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            )}
          </div>
        </div>

        {/* API Key preview */}
        {merchant.apiKey && (
          <div className="mb-2 p-2 bg-slate-50 rounded-lg flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-400 mb-0.5">API Key</p>
              <p className="text-xs font-mono text-slate-600 truncate">{merchant.apiKey.slice(0, 16)}...</p>
            </div>
            <button onClick={copyApiKey} className="p-1.5 hover:bg-slate-200 rounded-lg">
              {copied ? <CheckCircle className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
            </button>
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
            <p className="text-xs text-slate-400 mb-0.5">Orders</p>
            <p className="text-sm font-bold text-slate-900">{merchant.totalOrders || 0}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-2 border border-green-100">
            <p className="text-xs text-green-600 mb-0.5">Volume</p>
            <p className="text-sm font-bold text-green-700">₹{((merchant.totalVolume || 0) / 1000).toFixed(0)}k</p>
          </div>
        </div>

        {/* Website */}
        {merchant.website && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-2">
            <Globe className="w-3 h-3" />
            <span className="truncate">{merchant.website}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Link to={`/admin/merchants/${merchant.id}`}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold hover:bg-indigo-100 active:scale-[0.97] transition-all">
            <Eye className="w-3.5 h-3.5" /> Details
          </Link>
          <Link to={`/admin/merchants/${merchant.id}?tab=api`}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-xs font-semibold hover:bg-purple-100 active:scale-[0.97] transition-all">
            <Key className="w-3.5 h-3.5" /> API Keys
          </Link>
        </div>

        {/* Status */}
        <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-100">
          <span className={`flex items-center gap-1 text-xs font-bold ${isActive ? 'text-green-600' : 'text-red-500'}`}>
            {isActive ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
            {isActive ? 'Active' : 'Inactive'}
          </span>
          <span className="text-xs text-slate-400 font-mono">{merchant.id?.slice(0, 8)}</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Skeleton Card ─── */
function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 bg-slate-200 rounded-full" />
        <div className="flex-1">
          <div className="h-4 bg-slate-200 rounded w-24 mb-1" />
          <div className="h-3 bg-slate-100 rounded w-32" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-2">
        {[1, 2].map(i => <div key={i} className="h-12 bg-slate-100 rounded-lg" />)}
      </div>
      <div className="flex gap-2">
        <div className="flex-1 h-8 bg-slate-100 rounded-lg" />
        <div className="flex-1 h-8 bg-slate-100 rounded-lg" />
      </div>
    </div>
  );
}

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

  useEffect(() => {
    console.log('📡 Fetching merchants from collection:', MERCHANT_COLLECTION);
    
    const unsub = onSnapshot(
      query(collection(db, MERCHANT_COLLECTION), orderBy('createdAt', 'desc')),
      (snap) => {
        const list = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        console.log('✅ Loaded merchants:', list.length);
        setMerchants(list);
        setLoading(false);
      },
      (error) => {
        console.error('❌ Error loading merchants:', error);
        // Try without orderBy (in case createdAt doesn't exist)
        console.log('🔄 Retrying without orderBy...');
        const unsubRetry = onSnapshot(
          collection(db, MERCHANT_COLLECTION),
          (snap) => {
            const list = [];
            snap.forEach(d => list.push({ id: d.id, ...d.data() }));
            console.log('✅ Loaded merchants (no order):', list.length);
            setMerchants(list);
            setLoading(false);
          },
          (err) => {
            console.error('❌ Still failing:', err);
            setToast({ msg: 'Error loading merchants: ' + err.message, success: false });
            setLoading(false);
          }
        );
        return () => unsubRetry();
      }
    );
    return () => unsub();
  }, []);

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
        // ═══════════════════════════════════════════
        // UPDATE EXISTING MERCHANT
        // ═══════════════════════════════════════════
        const { password, ...updateData } = formData;

        await updateDoc(doc(db, MERCHANT_COLLECTION, selectedMerchant.id), {
          name: updateData.name || updateData.businessName,
          businessName: updateData.businessName || updateData.name,
          phone: updateData.phone || '',
          website: updateData.website || '',
          callbackUrl: updateData.callbackUrl || '',
          webhookUrl: updateData.webhookUrl || '',
          payinCommission: Number(updateData.payinCommission) || 2,
          payoutCommission: Number(updateData.payoutCommission) || 1,
          active: updateData.active,
          isActive: updateData.active,
          status: updateData.active ? 'active' : 'inactive',
          updatedAt: serverTimestamp(),
        });

        setToast({ msg: '✅ Merchant updated successfully!', success: true });
      } else {
        // ═══════════════════════════════════════════
        // CREATE NEW MERCHANT via Cloud Function
        // ═══════════════════════════════════════════
        console.log('🚀 Creating merchant with Cloud Function...');

        // Try Cloud Function first
        try {
          const createMerchantComplete = httpsCallable(functions, 'createMerchantComplete');

          const result = await createMerchantComplete({
            email: formData.email,
            password: formData.password,
            name: formData.name || formData.businessName,
            businessName: formData.businessName || formData.name,
            phone: formData.phone || '',
            website: formData.website || '',
            callbackUrl: formData.callbackUrl || '',
            webhookUrl: formData.webhookUrl || '',
            payinCommission: Number(formData.payinCommission) || 2,
            payoutCommission: Number(formData.payoutCommission) || 1,
            active: formData.active !== undefined ? formData.active : true,
          });

          console.log('✅ Cloud Function response:', result.data);
          setToast({ msg: '✅ Merchant created successfully!', success: true });

        } catch (cfError) {
          console.warn('⚠️ Cloud Function failed, creating directly in Firestore:', cfError);
          
          // Fallback: Create directly in Firestore (won't create Auth user)
          const { addDoc } = await import('firebase/firestore');
          
          const apiKey = generateApiKey();
          const secretKey = generateSecretKey();

          const merchantData = {
            email: formData.email,
            name: formData.name || formData.businessName,
            businessName: formData.businessName || formData.name,
            phone: formData.phone || '',
            website: formData.website || '',
            callbackUrl: formData.callbackUrl || '',
            webhookUrl: formData.webhookUrl || '',
            payinCommission: Number(formData.payinCommission) || 2,
            payoutCommission: Number(formData.payoutCommission) || 1,
            active: formData.active !== undefined ? formData.active : true,
            isActive: formData.active !== undefined ? formData.active : true,
            status: formData.active ? 'active' : 'inactive',
            role: 'merchant',
            userType: 'merchant',
            apiKey: apiKey,
            secretKey: secretKey,
            totalOrders: 0,
            totalVolume: 0,
            successRate: 0,
            disputeCount: 0,
            balance: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };

          const docRef = await addDoc(collection(db, MERCHANT_COLLECTION), merchantData);
          
          // Update with uid
          await updateDoc(doc(db, MERCHANT_COLLECTION, docRef.id), { uid: docRef.id });

          setToast({ msg: '✅ Merchant created! Note: Auth account not created (Cloud Function needed)', success: true });
        }
      }

      setShowModal(false);
      setSelectedMerchant(null);
    } catch (error) {
      console.error('Error saving merchant:', error);
      throw error;
    }
  };

  // Delete merchant
  const handleDeleteMerchant = async (merchant) => {
    if (!window.confirm(`Delete ${merchant.businessName || merchant.name}?\n\nThis cannot be undone.`)) return;

    try {
      await deleteDoc(doc(db, MERCHANT_COLLECTION, merchant.id));
      setToast({ msg: '✅ Merchant deleted', success: true });
    } catch (error) {
      setToast({ msg: '❌ Error: ' + error.message, success: false });
    }
  };

  // Toggle status
  const handleToggleStatus = async (merchant) => {
    const isActive = merchant.active || merchant.isActive || merchant.status === 'active';
    try {
      await updateDoc(doc(db, MERCHANT_COLLECTION, merchant.id), {
        active: !isActive,
        isActive: !isActive,
        status: !isActive ? 'active' : 'inactive',
      });
      setToast({ msg: `Merchant ${!isActive ? 'activated' : 'deactivated'}`, success: true });
    } catch (error) {
      setToast({ msg: 'Error: ' + error.message, success: false });
    }
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
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {[
          { label: 'All', value: stats.total, key: 'all', color: 'bg-slate-100 text-slate-700' },
          { label: 'Active', value: stats.active, key: 'active', color: 'bg-green-100 text-green-700' },
          { label: 'Inactive', value: stats.inactive, key: 'inactive', color: 'bg-red-100 text-red-700' },
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
          {[1, 2, 3, 4, 5, 6].map(i => <SkeletonCard key={i} />)}
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