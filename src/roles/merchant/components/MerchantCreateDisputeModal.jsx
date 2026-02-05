import React, { useState } from 'react';
import {
  X, Upload, Send, RefreshCw, Paperclip, TrendingDown, TrendingUp,
} from 'lucide-react';

export default function CreateDisputeModal({ onClose, onSubmit }) {
  const [form, setForm] = useState({
    transactionId: '',
    reason: '',
    amount: '',
    type: 'payin',
  });
  const [evidence, setEvidence] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!form.transactionId || !form.reason || !form.amount) {
      alert('Please fill all required fields');
      return;
    }

    if (form.reason.length < 20) {
      alert('Reason must be at least 20 characters');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(form, evidence);
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
        <div className="sm:hidden flex justify-center pt-2 pb-1"><div className="w-10 h-1 bg-slate-300 rounded-full" /></div>

        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-900">File Dispute</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Transaction Type</label>
            <div className="flex gap-2">
              <button onClick={() => setForm({ ...form, type: 'payin' })}
                className={`flex-1 p-3 rounded-xl border-2 transition-all text-center ${
                  form.type === 'payin' ? 'border-green-500 bg-green-50' : 'border-slate-200 bg-white'
                }`}>
                <TrendingUp className={`w-5 h-5 mx-auto mb-1 ${form.type === 'payin' ? 'text-green-600' : 'text-slate-300'}`} />
                <p className={`text-sm font-bold ${form.type === 'payin' ? 'text-green-800' : 'text-slate-500'}`}>Payin</p>
              </button>
              <button onClick={() => setForm({ ...form, type: 'payout' })}
                className={`flex-1 p-3 rounded-xl border-2 transition-all text-center ${
                  form.type === 'payout' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white'
                }`}>
                <TrendingDown className={`w-5 h-5 mx-auto mb-1 ${form.type === 'payout' ? 'text-blue-600' : 'text-slate-300'}`} />
                <p className={`text-sm font-bold ${form.type === 'payout' ? 'text-blue-800' : 'text-slate-500'}`}>Payout</p>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Transaction ID *</label>
            <input
              type="text"
              value={form.transactionId}
              onChange={e => setForm({ ...form, transactionId: e.target.value })}
              placeholder="TXN123456"
              className="w-full px-3 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 font-mono"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Amount *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-semibold">₹</span>
              <input
                type="number"
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                placeholder="0"
                className="w-full pl-8 pr-3 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 font-bold"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Reason *</label>
            <textarea
              value={form.reason}
              onChange={e => setForm({ ...form, reason: e.target.value })}
              rows={4}
              placeholder="Describe the issue in detail (min 20 characters)..."
              className="w-full px-3 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
            />
            <p className="text-xs text-slate-500 mt-1">{form.reason.length}/200 characters</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Evidence (Optional)</label>
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-xl p-4 cursor-pointer hover:border-red-400 transition-colors">
              <Upload className="w-6 h-6 text-slate-400" />
              <p className="text-sm font-semibold text-slate-600">Upload screenshot or document</p>
              <input type="file" accept="image/*,.pdf" onChange={e => setEvidence(e.target.files[0])} className="hidden" />
            </label>
            {evidence && (
              <div className="mt-2 px-3 py-2 bg-blue-50 rounded-lg text-xs text-blue-800 font-semibold flex items-center gap-2 border border-blue-200">
                <Paperclip size={14} /> {evidence.name}
                <button onClick={() => setEvidence(null)} className="ml-auto text-blue-400 hover:text-blue-600">
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-slate-100 flex gap-2.5">
          <button onClick={onClose} className="flex-1 py-3 border border-slate-300 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={submitting}
            className="flex-1 py-3 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 active:scale-[0.97] disabled:opacity-40 flex items-center justify-center gap-2">
            {submitting ? <><RefreshCw className="w-4 h-4 animate-spin" /> Filing…</> : <><Send className="w-4 h-4" /> File Dispute</>}
          </button>
        </div>
      </div>
    </div>
  );
}
