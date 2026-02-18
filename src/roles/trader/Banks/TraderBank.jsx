import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../supabase';
import {
  Building2, Plus, RefreshCw, X, Copy, Edit, Trash2, CheckCircle, AlertCircle,
  Smartphone, QrCode, Wallet, Shield, Check, ToggleLeft, ToggleRight,
  TrendingUp, Clock, IndianRupee
} from 'lucide-react';
import Toast from '../../../components/admin/Toast';

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

const PROVIDERS = [
  { id: 'gpay', label: 'GPay', color: 'bg-blue-500', bgLight: 'bg-blue-50', border: 'border-blue-200' },
  { id: 'phonepe', label: 'PhonePe', color: 'bg-purple-500', bgLight: 'bg-purple-50', border: 'border-purple-200' },
  { id: 'paytm', label: 'Paytm', color: 'bg-sky-500', bgLight: 'bg-sky-50', border: 'border-sky-200' },
  { id: 'bhim', label: 'BHIM', color: 'bg-green-600', bgLight: 'bg-green-50', border: 'border-green-200' },
  { id: 'other', label: 'Others', color: 'bg-slate-500', bgLight: 'bg-slate-50', border: 'border-slate-200' },
];

const ACCOUNT_TYPES = [
  { id: 'savings', label: 'Savings', defaultDaily: 100000, defaultTxn: 50000 },
  { id: 'current', label: 'Current', defaultDaily: 200000, defaultTxn: 100000 },
  { id: 'corporate', label: 'Corporate', defaultDaily: 500000, defaultTxn: 200000 },
];

const QR_TYPES = [
  { id: 'personal', label: 'Personal QR', icon: QrCode },
  { id: 'merchant', label: 'Merchant QR', icon: Shield },
];

// ═══════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════

function PillButton({ selected, onClick, children, color, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative px-4 py-2.5 rounded-xl border-2 font-semibold text-sm transition-all ${
        selected 
          ? `${color || 'bg-purple-600'} text-white border-transparent shadow-md` 
          : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300 hover:bg-purple-50'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {selected && (
        <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center shadow">
          <Check className="w-3 h-3 text-white" />
        </span>
      )}
      {children}
    </button>
  );
}

function UpiCard({ upi, onToggle, onEdit, onDelete, disabled, toggling }) {
  const [copied, setCopied] = useState(false);
  const provider = PROVIDERS.find(p => p.id === upi.upi_provider) || PROVIDERS[4];

  const handleCopy = () => {
    navigator.clipboard.writeText(upi.upi_id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={`relative rounded-xl border-2 p-4 transition-all ${
      upi.is_active 
        ? `bg-white ${provider.border} shadow-sm` 
        : 'bg-slate-50 border-slate-200 opacity-70'
    }`}>
      {/* Status indicator */}
      <div className={`absolute top-0 left-0 w-1 h-full rounded-l-xl ${
        upi.is_active ? 'bg-green-500' : 'bg-slate-300'
      }`} />

      <div className="pl-2">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-0.5 rounded-lg text-xs font-bold text-white ${provider.color}`}>
              {provider.label}
            </span>
            <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${
              upi.qr_type === 'merchant' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
            }`}>
              {upi.qr_type === 'merchant' ? 'Merchant' : 'Personal'}
            </span>
            <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold capitalize ${
              upi.account_type === 'corporate' ? 'bg-blue-100 text-blue-700' : 
              upi.account_type === 'current' ? 'bg-green-100 text-green-700' : 
              'bg-slate-100 text-slate-600'
            }`}>
              {upi.account_type || 'savings'}
            </span>
            {upi.is_active && (
              <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-green-100 text-green-700">
                IN POOL
              </span>
            )}
          </div>
          <button 
            onClick={onToggle}
            disabled={disabled || toggling}
            className={`p-1 rounded-lg transition-colors ${disabled || toggling ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-100'}`}
          >
            {toggling ? (
              <RefreshCw className="w-8 h-8 text-slate-400 animate-spin" />
            ) : upi.is_active ? (
              <ToggleRight className="w-8 h-8 text-green-500" />
            ) : (
              <ToggleLeft className="w-8 h-8 text-slate-400" />
            )}
          </button>
        </div>

        {/* UPI ID */}
        <div className="flex items-center gap-2 mb-2">
          <p className="font-mono text-base font-bold text-slate-900">{upi.upi_id}</p>
          <button onClick={handleCopy} className="p-1 hover:bg-slate-100 rounded">
            {copied ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-slate-400" />}
          </button>
        </div>

        {/* Details */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mb-3">
          <span>{upi.holder_name}</span>
          <span>•</span>
          <span>{upi.bank_name || 'Bank'}</span>
          {upi.bank_city && (
            <>
              <span>•</span>
              <span className="text-blue-600">📍 {upi.bank_city}</span>
            </>
          )}
        </div>

        {/* Limits */}
        <div className="flex items-center gap-4 text-xs mb-3">
          <div className="flex items-center gap-1 text-slate-500">
            <IndianRupee className="w-3.5 h-3.5" />
            <span>Daily: ₹{((upi.daily_limit || 100000) / 1000).toFixed(0)}K</span>
          </div>
          <div className="flex items-center gap-1 text-slate-500">
            <Clock className="w-3.5 h-3.5" />
            <span>Per Txn: ₹{((upi.per_txn_limit || 50000) / 1000).toFixed(0)}K</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button onClick={onEdit}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-blue-50 text-blue-600 rounded-lg text-xs font-semibold hover:bg-blue-100">
            <Edit className="w-3.5 h-3.5" /> Edit
          </button>
          <button onClick={onDelete}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-red-50 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-100">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ADD UPI MODAL
// ═══════════════════════════════════════════════════════════════════

function AddUpiModal({ traderId, banks, onClose, onSuccess, editUpi }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [provider, setProvider] = useState(editUpi?.upi_provider || '');
  const [accountType, setAccountType] = useState(editUpi?.account_type || '');
  const [qrType, setQrType] = useState(editUpi?.qr_type || '');
  const [upiId, setUpiId] = useState(editUpi?.upi_id || '');
  const [holderName, setHolderName] = useState(editUpi?.holder_name || '');
  const [bankCode, setBankCode] = useState('');
  const [mobileNumber, setMobileNumber] = useState(editUpi?.mobile_number || '');
  const [dailyLimit, setDailyLimit] = useState(editUpi?.daily_limit?.toString() || '');
  const [perTxnLimit, setPerTxnLimit] = useState(editUpi?.per_txn_limit?.toString() || '');
  const [monthlyLimit, setMonthlyLimit] = useState(editUpi?.monthly_limit?.toString() || '');
  const [ifscCode, setIfscCode] = useState(editUpi?.bank_ifsc || '');
  const [accountNumber, setAccountNumber] = useState(editUpi?.account_number || '');
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoData, setGeoData] = useState(null);

  useEffect(() => {
    const type = ACCOUNT_TYPES.find(t => t.id === accountType);
    if (type && !editUpi) {
      setDailyLimit(type.defaultDaily.toString());
      setPerTxnLimit(type.defaultTxn.toString());
      setMonthlyLimit((type.defaultDaily * 10).toString());
    }
  }, [accountType, editUpi]);

  useEffect(() => {
    if (editUpi?.bank_name && banks.length > 0) {
      const bank = banks.find(b => b.short_name === editUpi.bank_name || b.name === editUpi.bank_name);
      if (bank) setBankCode(bank.code);
    }
  }, [editUpi, banks]);

  const canStep1 = provider && accountType && qrType;
  const canStep2 = upiId && holderName && bankCode && accountNumber && ifscCode && ifscCode.length === 11;
  const canSubmit = canStep1 && canStep2 && dailyLimit && perTxnLimit;

  const fetchGeoFromIFSC = async (ifsc) => {
    try {
      const res = await fetch(`https://ifsc.razorpay.com/${ifsc.toUpperCase()}`);
      if (!res.ok) return null;
      const data = await res.json();
      return {
        bank_city: data.CITY || null,
        bank_state: data.STATE || null,
        bank_branch: data.BRANCH || null,
        bank_ifsc: ifsc.toUpperCase(),
        bank_name: data.BANK || null,
      };
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (ifscCode.length === 11) {
      setGeoLoading(true);
      fetchGeoFromIFSC(ifscCode).then(geo => {
        setGeoData(geo);
        setGeoLoading(false);
      });
    } else {
      setGeoData(null);
    }
  }, [ifscCode]);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError('');

    try {
      const bank = banks.find(b => b.code === bankCode);
      
      // Save to saved_banks (permanent record)
      const data = {
        trader_id: traderId,
        upi_id: upiId.trim().toLowerCase(),
        holder_name: holderName.trim(),
        upi_provider: provider,
        account_type: accountType,
        qr_type: qrType,
        bank_name: geoData?.bank_name || bank?.short_name || bank?.name || bankCode,
        mobile_number: mobileNumber || null,
        daily_limit: parseInt(dailyLimit),
        per_txn_limit: parseInt(perTxnLimit),
        monthly_limit: parseInt(monthlyLimit) || parseInt(dailyLimit) * 10,
        amount_tier: accountType === 'corporate' ? 'large' : accountType === 'current' ? 'medium' : 'small',
        is_active: false, // Not in pool yet, user needs to toggle ON
      };

      // Add geo data
      if (geoData) {
        data.bank_city = geoData.bank_city;
        data.bank_state = geoData.bank_state;
        data.bank_branch = geoData.bank_branch;
        data.bank_ifsc = geoData.bank_ifsc;
      }
      if (accountNumber) {
        data.account_number = accountNumber;
      }

      if (editUpi) {
        const { error: err } = await supabase.from('saved_banks').update(data).eq('id', editUpi.id);
        if (err) throw err;
        
        // If UPI is active, sync changes to pool
        if (editUpi.is_active) {
          await supabase.rpc('sync_upi_to_pool', { p_saved_bank_id: editUpi.id });
        }
      } else {
        const { error: err } = await supabase.from('saved_banks').insert(data);
        if (err) throw err;
      }

      onSuccess?.();
      onClose();
    } catch (e) {
      setError(e.message || 'Failed to save UPI');
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-white shadow-2xl sm:rounded-2xl rounded-t-2xl mt-auto sm:mt-0 max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-5 py-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">{editUpi ? 'Edit UPI' : 'Add New UPI'}</h2>
              <p className="text-purple-100 text-sm">Step {step} of 3</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex gap-2 mt-3">
            {[1, 2, 3].map(s => (
              <div key={s} className={`flex-1 h-1.5 rounded-full ${step >= s ? 'bg-white' : 'bg-white/30'}`} />
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}

          {/* Step 1: Type Selection */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-3">
                  <Smartphone className="w-4 h-4 inline mr-2" /> UPI Provider
                </label>
                <div className="flex flex-wrap gap-2">
                  {PROVIDERS.map(p => (
                    <PillButton key={p.id} selected={provider === p.id} onClick={() => setProvider(p.id)} color={p.color}>
                      {p.label}
                    </PillButton>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-3">
                  <Wallet className="w-4 h-4 inline mr-2" /> Account Type
                </label>
                <div className="flex flex-wrap gap-2">
                  {ACCOUNT_TYPES.map(t => (
                    <PillButton key={t.id} selected={accountType === t.id} onClick={() => setAccountType(t.id)}>
                      {t.label}
                    </PillButton>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-3">
                  <QrCode className="w-4 h-4 inline mr-2" /> QR Type
                </label>
                <div className="flex gap-3">
                  {QR_TYPES.map(t => (
                    <PillButton key={t.id} selected={qrType === t.id} onClick={() => setQrType(t.id)}>
                      <t.icon className="w-4 h-4 inline mr-1.5" />
                      {t.label}
                    </PillButton>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: UPI Details */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">UPI ID *</label>
                <input type="text" value={upiId} onChange={e => setUpiId(e.target.value)}
                  placeholder="example@ybl" disabled={!!editUpi}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono disabled:bg-slate-100" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Holder Name *</label>
                <input type="text" value={holderName} onChange={e => setHolderName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                  <Building2 className="w-4 h-4 inline mr-1" /> Bank *
                </label>
                <select value={bankCode} onChange={e => setBankCode(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white">
                  <option value="">Select Bank</option>
                  {banks.map(bank => <option key={bank.code} value={bank.code}>{bank.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Mobile (Optional)</label>
                <input type="tel" value={mobileNumber} onChange={e => setMobileNumber(e.target.value)}
                  placeholder="9876543210" maxLength={10}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
              </div>

              {/* Bank Account Details - Required */}
              <div className="pt-3 border-t border-slate-200">
                <p className="text-xs text-slate-500 mb-3 flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5" /> Bank details required for payouts and dispute resolution
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Account Number *</label>
                    <input type="text" value={accountNumber} onChange={e => setAccountNumber(e.target.value)}
                      placeholder="1234567890"
                      className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">IFSC Code *</label>
                    <input type="text" value={ifscCode} onChange={e => setIfscCode(e.target.value.toUpperCase())}
                      placeholder="HDFC0001234" maxLength={11}
                      className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono uppercase" />
                  </div>
                </div>

                {geoLoading && (
                  <div className="mt-2 p-2 bg-slate-50 rounded-lg text-xs text-slate-500 flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Looking up branch...
                  </div>
                )}
                {geoData && !geoLoading && (
                  <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-xl">
                    <p className="text-xs font-bold text-green-800 mb-1">📍 Branch Detected</p>
                    <p className="text-sm text-green-700">{geoData.bank_branch}</p>
                    <p className="text-xs text-green-600">{geoData.bank_city}, {geoData.bank_state}</p>
                  </div>
                )}
                {ifscCode.length === 11 && !geoData && !geoLoading && (
                  <div className="mt-2 p-2 bg-amber-50 rounded-lg text-xs text-amber-600 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> Invalid IFSC code
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Limits */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-sm text-purple-700">
                <strong>Note:</strong> After adding, toggle ON to make this UPI available for payments.
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Daily Limit (₹) *</label>
                <input type="number" value={dailyLimit} onChange={e => setDailyLimit(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Per Txn Limit (₹) *</label>
                <input type="number" value={perTxnLimit} onChange={e => setPerTxnLimit(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Monthly Limit (₹)</label>
                <input type="number" value={monthlyLimit} onChange={e => setMonthlyLimit(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
              </div>

              <div className="bg-slate-50 rounded-xl p-4 mt-4">
                <h4 className="font-bold text-slate-700 mb-2">Summary</h4>
                <div className="grid grid-cols-2 gap-1 text-sm">
                  <span className="text-slate-500">Provider:</span><span className="font-semibold capitalize">{provider}</span>
                  <span className="text-slate-500">Account:</span><span className="font-semibold capitalize">{accountType}</span>
                  <span className="text-slate-500">QR:</span><span className="font-semibold capitalize">{qrType}</span>
                  <span className="text-slate-500">UPI:</span><span className="font-mono font-semibold">{upiId || '—'}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t bg-slate-50 flex gap-3">
          {step > 1 && (
            <button onClick={() => setStep(step - 1)} className="px-5 py-2.5 border border-slate-300 rounded-xl font-semibold text-slate-600 hover:bg-slate-100">
              Back
            </button>
          )}
          <div className="flex-1" />
          {step < 3 ? (
            <button onClick={() => setStep(step + 1)} disabled={step === 1 ? !canStep1 : !canStep2}
              className="px-6 py-2.5 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 disabled:opacity-40">
              Next
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={!canSubmit || loading}
              className="px-6 py-2.5 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 disabled:opacity-40 flex items-center gap-2">
              {loading ? 'Saving...' : editUpi ? 'Update UPI' : 'Add UPI'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function TraderBank() {
  const [traderId, setTraderId] = useState(null);
  const [upis, setUpis] = useState([]);
  const [banks, setBanks] = useState([]);
  const [workingBalance, setWorkingBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editUpi, setEditUpi] = useState(null);
  const [toast, setToast] = useState(null);
  const [filter, setFilter] = useState('all');
  const [togglingId, setTogglingId] = useState(null);

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setTraderId(user.id);

    try {
      const { data: trader } = await supabase.from('traders').select('balance, security_hold').eq('id', user.id).single();
      if (trader) setWorkingBalance((trader.balance || 0) - (trader.security_hold || 0));

      // Get UPIs from saved_banks (not upi_pool!)
      const { data: upiData } = await supabase
        .from('saved_banks')
        .select('*')
        .eq('trader_id', user.id)
        .or('is_deleted.is.null,is_deleted.eq.false')
        .order('created_at', { ascending: false });
      setUpis(upiData || []);

      const { data: bankData } = await supabase
        .from('banks')
        .select('*')
        .eq('is_active', true)
        .order('display_order');
      setBanks(bankData || []);
    } catch (e) {
      console.error(e);
      setToast({ msg: 'Error loading data', success: false });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime: refresh when saved_banks or traders change (server may auto-remove UPIs)
  useEffect(() => {
    if (!traderId) return;
    
    const channel = supabase.channel('trader-bank-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'saved_banks', filter: `trader_id=eq.${traderId}` }, () => {
        fetchData();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'traders', filter: `id=eq.${traderId}` }, () => {
        fetchData();
      })
      .subscribe();
    
    return () => { supabase.removeChannel(channel); };
  }, [traderId, fetchData]);

  // Toggle: ON = add to pool, OFF = remove from pool
  const handleToggle = async (upi) => {
    // Prevent turning ON if balance is low
    if (workingBalance < 30000 && !upi.is_active) {
      setToast({ msg: '❌ Balance below ₹30,000. Cannot activate UPI.', success: false });
      return;
    }

    // Prevent double-click
    if (togglingId === upi.id) return;
    
    setTogglingId(upi.id);
    
    try {
      if (upi.is_active) {
        // Turn OFF: Remove from upi_pool
        const { error: rpcErr } = await supabase.rpc('remove_upi_from_pool', { p_saved_bank_id: upi.id });
        if (rpcErr) throw rpcErr;
        
        const { error: updateErr } = await supabase.from('saved_banks').update({ is_active: false }).eq('id', upi.id);
        if (updateErr) throw updateErr;
        
        setUpis(prev => prev.map(u => u.id === upi.id ? { ...u, is_active: false } : u));
        setToast({ msg: '✅ UPI removed from active pool', success: true });
      } else {
        // Turn ON: Add to upi_pool (only if balance >= 30k)
        if (workingBalance < 30000) {
          setToast({ msg: '❌ Balance below ₹30,000. Cannot activate UPI.', success: false });
          setTogglingId(null);
          return;
        }
        
        const { error: rpcErr } = await supabase.rpc('sync_upi_to_pool', { p_saved_bank_id: upi.id });
        if (rpcErr) throw rpcErr;
        
        const { error: updateErr } = await supabase.from('saved_banks').update({ is_active: true }).eq('id', upi.id);
        if (updateErr) throw updateErr;
        
        setUpis(prev => prev.map(u => u.id === upi.id ? { ...u, is_active: true } : u));
        setToast({ msg: '✅ UPI added to active pool', success: true });
      }
    } catch (e) {
      console.error('Toggle error:', e);
      setToast({ msg: `Error: ${e.message || 'Failed to toggle UPI'}`, success: false });
      // Refresh to get actual state
      fetchData();
    } finally {
      setTogglingId(null);
    }
  };

  // Delete: Soft delete in saved_banks, remove from pool
  const handleDelete = async (upi) => {
    if (!window.confirm('Delete this UPI?')) return;
    try {
      // Remove from pool first
      if (upi.is_active) {
        await supabase.rpc('remove_upi_from_pool', { p_saved_bank_id: upi.id });
      }
      
      // Soft delete in saved_banks
      await supabase.from('saved_banks').update({ 
        is_deleted: true, 
        deleted_at: new Date().toISOString(),
        is_active: false 
      }).eq('id', upi.id);
      
      setUpis(prev => prev.filter(u => u.id !== upi.id));
      setToast({ msg: 'UPI deleted', success: true });
    } catch (e) {
      console.error('Delete error:', e);
      setToast({ msg: `Error: ${e.message}`, success: false });
    }
  };

  const handleEdit = (upi) => {
    setEditUpi(upi);
    setShowModal(true);
  };

  const filteredUpis = filter === 'all' ? upis : 
    filter === 'active' ? upis.filter(u => u.is_active) :
    filter === 'inactive' ? upis.filter(u => !u.is_active) :
    upis.filter(u => u.upi_provider === filter);
    
  const activeCount = upis.filter(u => u.is_active).length;

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4 animate-pulse">
        <div className="h-8 bg-slate-200 rounded w-1/3"></div>
        <div className="h-24 bg-slate-200 rounded-xl"></div>
        <div className="h-12 bg-slate-200 rounded-xl"></div>
        <div className="grid gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-40 bg-slate-200 rounded-xl"></div>)}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-purple-500 to-blue-600 rounded-xl shadow">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            My UPIs
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 ml-11">
            {activeCount} in pool • {upis.length} total
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchData} className="p-2.5 bg-slate-100 rounded-xl hover:bg-slate-200">
            <RefreshCw className="w-5 h-5 text-slate-600" />
          </button>
          <button onClick={() => { setEditUpi(null); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700">
            <Plus className="w-4 h-4" /> Add UPI
          </button>
        </div>
      </div>

      {/* Low Balance Warning */}
      {workingBalance < 30000 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-orange-800">Low Balance</p>
            <p className="text-sm text-orange-600">
              Working balance ₹{workingBalance.toLocaleString()} is below ₹30,000. Cannot activate UPIs.
            </p>
          </div>
        </div>
      )}

      {/* Filter Pills */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            filter === 'all' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}>
          All <span className="ml-1 opacity-70">{upis.length}</span>
        </button>
        <button onClick={() => setFilter('active')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            filter === 'active' ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700 hover:bg-green-100'
          }`}>
          In Pool <span className="ml-1 opacity-70">{activeCount}</span>
        </button>
        <button onClick={() => setFilter('inactive')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            filter === 'inactive' ? 'bg-slate-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}>
          Inactive <span className="ml-1 opacity-70">{upis.length - activeCount}</span>
        </button>
      </div>

      {/* UPI List */}
      {filteredUpis.length === 0 ? (
        <div className="text-center py-16 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
          <Smartphone className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="font-bold text-slate-700 mb-1">No UPIs yet</h3>
          <p className="text-slate-500 text-sm mb-4">Add your first UPI to start receiving payments</p>
          <button onClick={() => { setEditUpi(null); setShowModal(true); }}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700">
            <Plus className="w-4 h-4" /> Add UPI
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredUpis.map(upi => (
            <UpiCard
              key={upi.id}
              upi={upi}
              onToggle={() => handleToggle(upi)}
              onEdit={() => handleEdit(upi)}
              onDelete={() => handleDelete(upi)}
              disabled={workingBalance < 30000 && !upi.is_active}
              toggling={togglingId === upi.id}
            />
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <AddUpiModal
          traderId={traderId}
          banks={banks}
          editUpi={editUpi}
          onClose={() => { setShowModal(false); setEditUpi(null); }}
          onSuccess={() => { fetchData(); setToast({ msg: editUpi ? '✅ UPI updated!' : '✅ UPI added!', success: true }); }}
        />
      )}
    </div>
  );
}
