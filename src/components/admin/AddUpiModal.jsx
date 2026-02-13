import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { X, CreditCard, Building2, Smartphone, QrCode, Wallet, Check } from 'lucide-react';

const PROVIDERS = [
  { id: 'gpay', label: 'GPay', color: 'bg-blue-500' },
  { id: 'phonepe', label: 'PhonePe', color: 'bg-purple-500' },
  { id: 'paytm', label: 'Paytm', color: 'bg-sky-500' },
  { id: 'bhim', label: 'BHIM', color: 'bg-green-600' },
  { id: 'other', label: 'Others', color: 'bg-slate-500' },
];

const ACCOUNT_TYPES = [
  { id: 'savings', label: 'Savings', desc: 'Personal account', defaultDaily: 100000, defaultTxn: 50000 },
  { id: 'current', label: 'Current', desc: 'Business account', defaultDaily: 200000, defaultTxn: 100000 },
  { id: 'corporate', label: 'Corporate', desc: 'Company account', defaultDaily: 500000, defaultTxn: 200000 },
];

const QR_TYPES = [
  { id: 'personal', label: 'Personal QR', desc: 'Normal UPI QR' },
  { id: 'merchant', label: 'Merchant QR', desc: 'Higher limits, better success' },
];

export default function AddUpiModal({ traderId, traderName, onClose, onSuccess }) {
  const [step, setStep] = useState(1);
  const [banks, setBanks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [provider, setProvider] = useState('');
  const [accountType, setAccountType] = useState('');
  const [qrType, setQrType] = useState('');
  const [upiId, setUpiId] = useState('');
  const [holderName, setHolderName] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [dailyLimit, setDailyLimit] = useState('');
  const [perTxnLimit, setPerTxnLimit] = useState('');
  const [monthlyLimit, setMonthlyLimit] = useState('');

  // Load banks
  useEffect(() => {
    const loadBanks = async () => {
      const { data } = await supabase
        .from('banks')
        .select('*')
        .eq('is_active', true)
        .order('display_order');
      setBanks(data || []);
    };
    loadBanks();
  }, []);

  // Set default limits when account type changes
  useEffect(() => {
    const type = ACCOUNT_TYPES.find(t => t.id === accountType);
    if (type) {
      setDailyLimit(type.defaultDaily.toString());
      setPerTxnLimit(type.defaultTxn.toString());
      setMonthlyLimit((type.defaultDaily * 10).toString());
    }
  }, [accountType]);

  const canProceedStep1 = provider && accountType && qrType;
  const canProceedStep2 = upiId && holderName && bankCode;
  const canSubmit = canProceedStep1 && canProceedStep2 && dailyLimit && perTxnLimit;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    
    setLoading(true);
    setError('');

    try {
      const bank = banks.find(b => b.code === bankCode);
      
      const { error: insertError } = await supabase.from('upi_pool').insert({
        trader_id: traderId,
        upi_id: upiId.trim().toLowerCase(),
        holder_name: holderName.trim(),
        upi_provider: provider,
        account_type: accountType,
        qr_type: qrType,
        bank_name: bank?.short_name || bank?.name || bankCode,
        mobile_number: mobileNumber || null,
        daily_limit: parseInt(dailyLimit),
        per_txn_limit: parseInt(perTxnLimit),
        monthly_limit: parseInt(monthlyLimit) || parseInt(dailyLimit) * 10,
        status: 'active',
        trust_score: qrType === 'merchant' ? 60 : 50, // Merchant QR starts higher
        amount_tier: accountType === 'corporate' ? 'large' : accountType === 'current' ? 'medium' : 'small',
      });

      if (insertError) throw insertError;

      onSuccess?.();
      onClose();
    } catch (e) {
      setError(e.message || 'Failed to add UPI');
    }
    setLoading(false);
  };

  const PillButton = ({ selected, onClick, children, color }) => (
    <button
      type="button"
      onClick={onClick}
      className={`relative px-4 py-3 rounded-xl border-2 font-semibold text-sm transition-all ${
        selected 
          ? `${color || 'bg-purple-600'} text-white border-transparent shadow-lg scale-[1.02]` 
          : 'bg-white text-slate-700 border-slate-200 hover:border-purple-300 hover:bg-purple-50'
      }`}
    >
      {selected && (
        <span className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
          <Check className="w-3 h-3 text-white" />
        </span>
      )}
      {children}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">Add New UPI</h2>
              <p className="text-purple-100 text-sm">For {traderName}</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {/* Progress */}
          <div className="flex gap-2 mt-4">
            {[1, 2, 3].map(s => (
              <div key={s} className={`flex-1 h-1.5 rounded-full transition-all ${
                step >= s ? 'bg-white' : 'bg-white/30'
              }`} />
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Step 1: Type Selection */}
          {step === 1 && (
            <div className="space-y-6">
              {/* Provider */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-3">
                  <Smartphone className="w-4 h-4 inline mr-2" />
                  UPI Provider
                </label>
                <div className="flex flex-wrap gap-2">
                  {PROVIDERS.map(p => (
                    <PillButton
                      key={p.id}
                      selected={provider === p.id}
                      onClick={() => setProvider(p.id)}
                      color={p.color}
                    >
                      {p.label}
                    </PillButton>
                  ))}
                </div>
              </div>

              {/* Account Type */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-3">
                  <Wallet className="w-4 h-4 inline mr-2" />
                  Account Type
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {ACCOUNT_TYPES.map(t => (
                    <PillButton
                      key={t.id}
                      selected={accountType === t.id}
                      onClick={() => setAccountType(t.id)}
                    >
                      <div className="text-center">
                        <div>{t.label}</div>
                        <div className={`text-xs mt-0.5 ${accountType === t.id ? 'text-purple-100' : 'text-slate-400'}`}>
                          {t.desc}
                        </div>
                      </div>
                    </PillButton>
                  ))}
                </div>
              </div>

              {/* QR Type */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-3">
                  <QrCode className="w-4 h-4 inline mr-2" />
                  QR Type
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {QR_TYPES.map(t => (
                    <PillButton
                      key={t.id}
                      selected={qrType === t.id}
                      onClick={() => setQrType(t.id)}
                    >
                      <div className="text-center">
                        <div>{t.label}</div>
                        <div className={`text-xs mt-0.5 ${qrType === t.id ? 'text-purple-100' : 'text-slate-400'}`}>
                          {t.desc}
                        </div>
                      </div>
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
                <input
                  type="text"
                  value={upiId}
                  onChange={e => setUpiId(e.target.value)}
                  placeholder="example@ybl"
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Account Holder Name *</label>
                <input
                  type="text"
                  value={holderName}
                  onChange={e => setHolderName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                  <Building2 className="w-4 h-4 inline mr-1" />
                  Bank *
                </label>
                <select
                  value={bankCode}
                  onChange={e => setBankCode(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
                >
                  <option value="">Select Bank</option>
                  {banks.map(bank => (
                    <option key={bank.code} value={bank.code}>{bank.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Mobile Number (Optional)</label>
                <input
                  type="tel"
                  value={mobileNumber}
                  onChange={e => setMobileNumber(e.target.value)}
                  placeholder="9876543210"
                  maxLength={10}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
            </div>
          )}

          {/* Step 3: Limits */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-4">
                <p className="text-sm text-purple-700">
                  <strong>Tip:</strong> Default limits are set based on account type. Adjust if needed.
                </p>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Daily Limit (₹) *</label>
                <input
                  type="number"
                  value={dailyLimit}
                  onChange={e => setDailyLimit(e.target.value)}
                  placeholder="100000"
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Per Transaction Limit (₹) *</label>
                <input
                  type="number"
                  value={perTxnLimit}
                  onChange={e => setPerTxnLimit(e.target.value)}
                  placeholder="50000"
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Monthly Limit (₹)</label>
                <input
                  type="number"
                  value={monthlyLimit}
                  onChange={e => setMonthlyLimit(e.target.value)}
                  placeholder="1000000"
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              {/* Summary */}
              <div className="bg-slate-50 rounded-xl p-4 mt-6">
                <h4 className="font-bold text-slate-700 mb-3">Summary</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-slate-500">Provider:</div>
                  <div className="font-semibold capitalize">{provider}</div>
                  <div className="text-slate-500">Account:</div>
                  <div className="font-semibold capitalize">{accountType}</div>
                  <div className="text-slate-500">QR Type:</div>
                  <div className="font-semibold capitalize">{qrType}</div>
                  <div className="text-slate-500">UPI ID:</div>
                  <div className="font-semibold font-mono">{upiId || '—'}</div>
                  <div className="text-slate-500">Bank:</div>
                  <div className="font-semibold">{banks.find(b => b.code === bankCode)?.short_name || '—'}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-slate-50 flex gap-3">
          {step > 1 && (
            <button
              onClick={() => setStep(step - 1)}
              className="px-6 py-2.5 border border-slate-300 rounded-xl font-semibold text-slate-600 hover:bg-slate-100"
            >
              Back
            </button>
          )}
          <div className="flex-1" />
          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={step === 1 ? !canProceedStep1 : !canProceedStep2}
              className="px-6 py-2.5 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || loading}
              className="px-6 py-2.5 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? 'Adding...' : (
                <>
                  <CreditCard className="w-4 h-4" />
                  Add UPI
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
