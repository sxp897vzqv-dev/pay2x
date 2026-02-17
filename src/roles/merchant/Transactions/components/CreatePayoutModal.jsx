import React, { useState, useMemo } from 'react';
import {
  X, Loader2, User, CreditCard, Building, Hash, Wallet,
  AlertCircle, ArrowUpRight, Info,
} from 'lucide-react';

export default function CreatePayoutModal({ onClose, onSubmit, availableBalance, payoutRate = 2 }) {
  const [form, setForm] = useState({
    beneficiaryName: '',
    paymentMode: 'upi',
    upiId: '',
    accountNumber: '',
    ifscCode: '',
    amount: '',
    purpose: 'withdrawal',
  });
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  const handleChange = (key, value) => {
    if (key === 'ifscCode') value = value.toUpperCase();
    if (key === 'upiId') value = value.toLowerCase();
    setForm({ ...form, [key]: value });
    // Clear error when user types
    if (errors[key]) {
      setErrors({ ...errors, [key]: null });
    }
  };

  // Calculate fee and total
  const calculations = useMemo(() => {
    const amount = Number(form.amount) || 0;
    const fee = Math.round((amount * payoutRate) / 100);
    const total = amount + fee;
    const canAfford = total <= availableBalance;
    return { amount, fee, total, canAfford };
  }, [form.amount, payoutRate, availableBalance]);

  const validate = () => {
    const newErrors = {};
    
    if (!form.beneficiaryName.trim()) {
      newErrors.beneficiaryName = 'Enter beneficiary name';
    }
    
    if (!form.amount || Number(form.amount) <= 0) {
      newErrors.amount = 'Enter valid amount';
    } else if (Number(form.amount) < 100) {
      newErrors.amount = 'Minimum amount is ₹100';
    } else if (Number(form.amount) > 200000) {
      newErrors.amount = 'Maximum amount is ₹2,00,000';
    } else if (!calculations.canAfford) {
      newErrors.amount = 'Insufficient balance';
    }
    
    if (form.paymentMode === 'upi') {
      if (!form.upiId || !/^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/.test(form.upiId)) {
        newErrors.upiId = 'Invalid UPI ID format';
      }
    } else {
      if (!form.accountNumber || !/^\d{9,18}$/.test(form.accountNumber)) {
        newErrors.accountNumber = 'Account number must be 9-18 digits';
      }
      if (!form.ifscCode || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(form.ifscCode)) {
        newErrors.ifscCode = 'Invalid IFSC code';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      await onSubmit(form);
    } catch (e) {
      setErrors({ submit: e.message });
    }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-white shadow-2xl rounded-t-2xl sm:rounded-2xl overflow-hidden mt-auto sm:mt-0 max-h-[90vh] flex flex-col">
        {/* Mobile handle */}
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 bg-slate-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-purple-500 to-purple-600">
          <div className="flex items-center gap-2">
            <ArrowUpRight className="w-5 h-5 text-white" />
            <h3 className="text-base font-bold text-white">Create Payout</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-white/20 rounded-lg transition-colors">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Balance & Fee Info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Wallet className="w-3.5 h-3.5 text-purple-600" />
                <p className="text-xs font-medium text-purple-600">Available Balance</p>
              </div>
              <p className="text-xl font-bold text-purple-900">₹{availableBalance.toLocaleString()}</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Info className="w-3.5 h-3.5 text-slate-500" />
                <p className="text-xs font-medium text-slate-500">Payout Fee</p>
              </div>
              <p className="text-xl font-bold text-slate-700">{payoutRate}%</p>
            </div>
          </div>

          {/* Beneficiary name */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide flex items-center gap-1">
              <User className="w-3.5 h-3.5" /> Beneficiary Name *
            </label>
            <input
              type="text"
              value={form.beneficiaryName}
              onChange={e => handleChange('beneficiaryName', e.target.value)}
              placeholder="Enter recipient name"
              className={`w-full px-3 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-colors ${
                errors.beneficiaryName ? 'border-red-300 bg-red-50' : 'border-slate-200'
              }`}
            />
            {errors.beneficiaryName && (
              <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {errors.beneficiaryName}
              </p>
            )}
          </div>

          {/* Payment mode */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Payment Mode *</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleChange('paymentMode', 'upi')}
                className={`flex-1 p-3.5 rounded-xl border-2 transition-all text-center ${
                  form.paymentMode === 'upi' 
                    ? 'border-purple-500 bg-purple-50 shadow-sm' 
                    : 'border-slate-200 hover:border-purple-300 bg-white'
                }`}
              >
                <CreditCard className={`w-6 h-6 mx-auto mb-1.5 ${form.paymentMode === 'upi' ? 'text-purple-600' : 'text-slate-300'}`} />
                <p className={`text-sm font-bold ${form.paymentMode === 'upi' ? 'text-purple-800' : 'text-slate-500'}`}>UPI</p>
                <p className="text-xs text-slate-400 mt-0.5">Instant transfer</p>
              </button>
              <button
                type="button"
                onClick={() => handleChange('paymentMode', 'bank')}
                className={`flex-1 p-3.5 rounded-xl border-2 transition-all text-center ${
                  form.paymentMode === 'bank' 
                    ? 'border-green-500 bg-green-50 shadow-sm' 
                    : 'border-slate-200 hover:border-green-300 bg-white'
                }`}
              >
                <Building className={`w-6 h-6 mx-auto mb-1.5 ${form.paymentMode === 'bank' ? 'text-green-600' : 'text-slate-300'}`} />
                <p className={`text-sm font-bold ${form.paymentMode === 'bank' ? 'text-green-800' : 'text-slate-500'}`}>Bank</p>
                <p className="text-xs text-slate-400 mt-0.5">IMPS/NEFT</p>
              </button>
            </div>
          </div>

          {/* Payment details */}
          {form.paymentMode === 'upi' ? (
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide flex items-center gap-1">
                <CreditCard className="w-3.5 h-3.5" /> UPI ID *
              </label>
              <input
                type="text"
                value={form.upiId}
                onChange={e => handleChange('upiId', e.target.value)}
                placeholder="name@paytm"
                className={`w-full px-3 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent font-mono ${
                  errors.upiId ? 'border-red-300 bg-red-50' : 'border-slate-200'
                }`}
              />
              {errors.upiId && (
                <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {errors.upiId}
                </p>
              )}
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide flex items-center gap-1">
                  <Building className="w-3.5 h-3.5" /> Account Number *
                </label>
                <input
                  type="text"
                  value={form.accountNumber}
                  onChange={e => handleChange('accountNumber', e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter 9-18 digit account number"
                  maxLength={18}
                  className={`w-full px-3 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent font-mono ${
                    errors.accountNumber ? 'border-red-300 bg-red-50' : 'border-slate-200'
                  }`}
                />
                {errors.accountNumber && (
                  <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {errors.accountNumber}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide flex items-center gap-1">
                  <Hash className="w-3.5 h-3.5" /> IFSC Code *
                </label>
                <input
                  type="text"
                  value={form.ifscCode}
                  onChange={e => handleChange('ifscCode', e.target.value)}
                  placeholder="SBIN0001234"
                  maxLength={11}
                  className={`w-full px-3 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent font-mono ${
                    errors.ifscCode ? 'border-red-300 bg-red-50' : 'border-slate-200'
                  }`}
                />
                {errors.ifscCode && (
                  <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {errors.ifscCode}
                  </p>
                )}
              </div>
            </>
          )}

          {/* Amount */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Amount *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-semibold text-lg">₹</span>
              <input
                type="number"
                value={form.amount}
                onChange={e => handleChange('amount', e.target.value)}
                placeholder="0"
                min="100"
                max="200000"
                className={`w-full pl-8 pr-3 py-3 border rounded-xl text-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent font-bold ${
                  errors.amount ? 'border-red-300 bg-red-50' : 'border-slate-200'
                }`}
              />
            </div>
            {errors.amount && (
              <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {errors.amount}
              </p>
            )}
            <p className="text-xs text-slate-400 mt-1">Min ₹100 • Max ₹2,00,000</p>
          </div>

          {/* Calculation breakdown */}
          {calculations.amount > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Payout Amount</span>
                <span className="font-semibold text-slate-700">₹{calculations.amount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Fee ({payoutRate}%)</span>
                <span className="font-semibold text-slate-700">₹{calculations.fee.toLocaleString()}</span>
              </div>
              <div className="border-t border-slate-200 pt-2 flex justify-between text-sm">
                <span className="font-bold text-slate-700">Total Deduction</span>
                <span className={`font-bold ${calculations.canAfford ? 'text-purple-600' : 'text-red-600'}`}>
                  ₹{calculations.total.toLocaleString()}
                </span>
              </div>
              {!calculations.canAfford && (
                <p className="text-xs text-red-500 flex items-center gap-1 pt-1">
                  <AlertCircle className="w-3 h-3" /> Insufficient balance for this amount
                </p>
              )}
            </div>
          )}

          {/* Purpose */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Purpose</label>
            <select
              value={form.purpose}
              onChange={e => handleChange('purpose', e.target.value)}
              className="w-full px-3 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
            >
              <option value="withdrawal">Withdrawal</option>
              <option value="refund">Refund</option>
              <option value="settlement">Settlement</option>
              <option value="salary">Salary</option>
              <option value="vendor">Vendor Payment</option>
            </select>
          </div>

          {/* Submit Error */}
          {errors.submit && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{errors.submit}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 border border-slate-300 rounded-xl text-sm font-semibold text-slate-600 hover:bg-white active:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !calculations.canAfford}
            className="flex-1 py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl text-sm font-bold hover:from-purple-600 hover:to-purple-700 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-lg shadow-purple-500/20"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Creating…
              </>
            ) : (
              <>
                <ArrowUpRight className="w-4 h-4" /> Create Payout
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
