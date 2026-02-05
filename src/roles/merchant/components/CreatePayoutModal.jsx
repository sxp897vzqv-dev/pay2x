import React, { useState } from 'react';
import {
  X, RefreshCw, User, CreditCard, Building, Hash,
} from 'lucide-react';

export default function CreatePayoutModal({ onClose, onSubmit, availableBalance }) {
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

  const handleChange = (key, value) => {
    if (key === 'ifscCode') value = value.toUpperCase();
    setForm({ ...form, [key]: value });
  };

  const validate = () => {
    if (!form.beneficiaryName.trim()) { alert('Enter beneficiary name'); return false; }
    if (!form.amount || Number(form.amount) <= 0) { alert('Enter valid amount'); return false; }
    if (Number(form.amount) > availableBalance) { alert(`Insufficient balance. Available: ₹${availableBalance}`); return false; }
    
    if (form.paymentMode === 'upi') {
      if (!form.upiId || !/^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/.test(form.upiId)) {
        alert('Invalid UPI ID'); return false;
      }
    } else {
      if (!form.accountNumber || !/^\d{9,18}$/.test(form.accountNumber)) {
        alert('Account number must be 9-18 digits'); return false;
      }
      if (!form.ifscCode || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(form.ifscCode)) {
        alert('Invalid IFSC code'); return false;
      }
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      await onSubmit(form);
      onClose();
    } catch (e) {
      alert('Error: ' + e.message);
    }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-white shadow-2xl rounded-t-2xl sm:rounded-2xl overflow-hidden mt-auto sm:mt-0 max-h-[90vh] flex flex-col">
        {/* Handle */}
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 bg-slate-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-900">Create Payout</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Available balance */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
            <p className="text-xs text-blue-600 mb-0.5">Available Balance</p>
            <p className="text-2xl font-bold text-blue-900">₹{availableBalance.toLocaleString()}</p>
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
              placeholder="Enter name"
              className="w-full px-3 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            />
          </div>

          {/* Payment mode */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Payment Mode *</label>
            <div className="flex gap-2.5">
              <button
                onClick={() => handleChange('paymentMode', 'upi')}
                className={`flex-1 p-3 rounded-xl border-2 transition-all text-center ${
                  form.paymentMode === 'upi' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-300 bg-white'
                }`}
              >
                <CreditCard className={`w-5 h-5 mx-auto mb-1 ${form.paymentMode === 'upi' ? 'text-blue-600' : 'text-slate-300'}`} />
                <p className={`text-sm font-bold ${form.paymentMode === 'upi' ? 'text-blue-800' : 'text-slate-500'}`}>UPI</p>
              </button>
              <button
                onClick={() => handleChange('paymentMode', 'bank')}
                className={`flex-1 p-3 rounded-xl border-2 transition-all text-center ${
                  form.paymentMode === 'bank' ? 'border-green-500 bg-green-50' : 'border-slate-200 hover:border-green-300 bg-white'
                }`}
              >
                <Building className={`w-5 h-5 mx-auto mb-1 ${form.paymentMode === 'bank' ? 'text-green-600' : 'text-slate-300'}`} />
                <p className={`text-sm font-bold ${form.paymentMode === 'bank' ? 'text-green-800' : 'text-slate-500'}`}>Bank</p>
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
                className="w-full px-3 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent font-mono"
                style={{ fontFamily: 'var(--font-mono)' }}
              />
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
                  onChange={e => handleChange('accountNumber', e.target.value)}
                  placeholder="9-18 digit number"
                  className="w-full px-3 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent font-mono"
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
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
                  className="w-full px-3 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent font-mono"
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
              </div>
            </>
          )}

          {/* Amount */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Amount *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-semibold">₹</span>
              <input
                type="number"
                value={form.amount}
                onChange={e => handleChange('amount', e.target.value)}
                placeholder="0"
                className="w-full pl-8 pr-3 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent font-bold"
              />
            </div>
          </div>

          {/* Purpose */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Purpose</label>
            <select
              value={form.purpose}
              onChange={e => handleChange('purpose', e.target.value)}
              className="w-full px-3 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            >
              <option value="withdrawal">Withdrawal</option>
              <option value="refund">Refund</option>
              <option value="settlement">Settlement</option>
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-100 flex gap-2.5">
          <button
            onClick={onClose}
            className="flex-1 py-3 border border-slate-300 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 active:bg-slate-100"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 active:scale-[0.97] disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {submitting ? <><RefreshCw className="w-4 h-4 animate-spin" /> Creating…</> : 'Create Payout'}
          </button>
        </div>
      </div>
    </div>
  );
}
