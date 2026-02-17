import React, { useState } from 'react';
import { supabase } from '../../../../supabase';
import {
  X, Upload, Send, RefreshCw, Paperclip, TrendingDown, TrendingUp,
  AlertCircle, CheckCircle, Loader2,
} from 'lucide-react';

// API Configuration
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://jrzyndtowwwcydgcagcr.supabase.co';

export default function CreateDisputeModal({ onClose, onSubmit }) {
  const [form, setForm] = useState({
    type: 'payin',
    upiId: '',       // For payin disputes
    orderId: '',     // For payout disputes
    amount: '',
    reason: '',
  });
  const [evidence, setEvidence] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const handleSubmit = async () => {
    // Validation
    if (form.type === 'payin' && !form.upiId) {
      setResult({ success: false, error: 'UPI ID is required for payin disputes' });
      return;
    }
    if (form.type === 'payout' && !form.orderId) {
      setResult({ success: false, error: 'Order ID is required for payout disputes' });
      return;
    }
    if (!form.amount || Number(form.amount) <= 0) {
      setResult({ success: false, error: 'Please enter a valid amount' });
      return;
    }
    if (!form.reason || form.reason.length < 10) {
      setResult({ success: false, error: 'Please describe the issue (at least 10 characters)' });
      return;
    }

    setSubmitting(true);
    setResult(null);

    try {
      // Get merchant API key
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: merchant } = await supabase
        .from('merchants')
        .select('id, api_key, live_api_key')
        .eq('profile_id', user.id)
        .single();

      if (!merchant) throw new Error('Merchant not found');

      const apiKey = merchant.api_key || merchant.live_api_key;
      if (!apiKey) throw new Error('API key not configured');

      // Upload evidence if provided
      let evidenceUrl = null;
      if (evidence) {
        const filename = `${Date.now()}_${evidence.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
        const { error: upErr } = await supabase.storage.from('dispute-proofs').upload(filename, evidence);
        if (!upErr) {
          const { data: urlData } = supabase.storage.from('dispute-proofs').getPublicUrl(filename);
          evidenceUrl = urlData.publicUrl;
        }
      }

      // Call Edge Function to create dispute
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-dispute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          type: form.type,
          upiId: form.type === 'payin' ? form.upiId : undefined,
          orderId: form.type === 'payout' ? form.orderId : undefined,
          amount: Number(form.amount),
          reason: form.reason,
          evidenceUrl: evidenceUrl,
        })
      });

      const data = await res.json();

      if (!res.ok && !data.success && !data.disputeId && !data.dispute_id) {
        throw new Error(data.error?.message || data.error || data.message || 'Failed to create dispute');
      }

      setResult({
        success: true,
        disputeId: data.disputeId || data.dispute_id,
        message: data.message || 'Dispute created successfully! We will notify you of updates.',
      });

      // Notify parent component
      if (onSubmit) {
        await onSubmit({
          ...form,
          disputeId: data.disputeId || data.dispute_id,
        }, evidence);
      }

      // Auto close after 2 seconds
      setTimeout(() => {
        onClose();
      }, 2000);

    } catch (e) {
      console.error('Create dispute error:', e);
      setResult({ success: false, error: e.message });
    }

    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-white shadow-2xl rounded-t-2xl sm:rounded-2xl overflow-hidden mt-auto sm:mt-0 max-h-[90vh] flex flex-col">
        <div className="sm:hidden flex justify-center pt-2 pb-1"><div className="w-10 h-1 bg-slate-300 rounded-full" /></div>

        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-900">Raise Dispute</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Dispute Type */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Dispute Type</label>
            <div className="flex gap-2">
              <button onClick={() => setForm({ ...form, type: 'payin', orderId: '' })}
                className={`flex-1 p-3 rounded-xl border-2 transition-all text-center ${
                  form.type === 'payin' ? 'border-green-500 bg-green-50' : 'border-slate-200 bg-white hover:border-slate-300'
                }`}>
                <TrendingUp className={`w-5 h-5 mx-auto mb-1 ${form.type === 'payin' ? 'text-green-600' : 'text-slate-300'}`} />
                <p className={`text-sm font-bold ${form.type === 'payin' ? 'text-green-800' : 'text-slate-500'}`}>Payin</p>
                <p className={`text-xs ${form.type === 'payin' ? 'text-green-600' : 'text-slate-400'}`}>Paid but not credited</p>
              </button>
              <button onClick={() => setForm({ ...form, type: 'payout', upiId: '' })}
                className={`flex-1 p-3 rounded-xl border-2 transition-all text-center ${
                  form.type === 'payout' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'
                }`}>
                <TrendingDown className={`w-5 h-5 mx-auto mb-1 ${form.type === 'payout' ? 'text-blue-600' : 'text-slate-300'}`} />
                <p className={`text-sm font-bold ${form.type === 'payout' ? 'text-blue-800' : 'text-slate-500'}`}>Payout</p>
                <p className={`text-xs ${form.type === 'payout' ? 'text-blue-600' : 'text-slate-400'}`}>Not received by user</p>
              </button>
            </div>
          </div>

          {/* Dynamic field based on type */}
          {form.type === 'payin' ? (
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
                UPI ID (used for payment) *
              </label>
              <input
                type="text"
                value={form.upiId}
                onChange={e => setForm({ ...form, upiId: e.target.value })}
                placeholder="e.g., merchant@upi"
                className="w-full px-3 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 font-mono"
              />
              <p className="text-xs text-slate-400 mt-1">Enter the UPI ID you paid to</p>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
                Order ID / Payout ID *
              </label>
              <input
                type="text"
                value={form.orderId}
                onChange={e => setForm({ ...form, orderId: e.target.value })}
                placeholder="e.g., PAYOUT_123456"
                className="w-full px-3 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 font-mono"
              />
              <p className="text-xs text-slate-400 mt-1">Enter the payout order ID</p>
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
              Disputed Amount (₹) *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-semibold">₹</span>
              <input
                type="number"
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                placeholder="0"
                className="w-full pl-8 pr-3 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 font-bold"
              />
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
              Describe the Issue *
            </label>
            <textarea
              value={form.reason}
              onChange={e => setForm({ ...form, reason: e.target.value })}
              rows={3}
              placeholder="Explain what happened..."
              className="w-full px-3 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
            />
            <p className="text-xs text-slate-400 mt-1">{form.reason.length} characters</p>
          </div>

          {/* Evidence Upload */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
              Evidence (Optional)
            </label>
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-xl p-4 cursor-pointer hover:border-orange-400 transition-colors">
              <Upload className="w-6 h-6 text-slate-400" />
              <p className="text-sm font-semibold text-slate-600">Upload screenshot or document</p>
              <p className="text-xs text-slate-400">PNG, JPG, PDF up to 5MB</p>
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

          {/* Result message */}
          {result && (
            <div className={`rounded-xl p-3 flex items-start gap-2 ${
              result.success 
                ? 'bg-green-50 border border-green-200' 
                : 'bg-red-50 border border-red-200'
            }`}>
              {result.success ? (
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              )}
              <div>
                <p className={`text-sm font-semibold ${result.success ? 'text-green-700' : 'text-red-700'}`}>
                  {result.success ? result.message : result.error}
                </p>
                {result.disputeId && (
                  <p className="text-xs text-green-600 mt-1 font-mono">
                    Dispute ID: {result.disputeId}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-slate-100 flex gap-2.5">
          <button onClick={onClose} className="flex-1 py-3 border border-slate-300 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={submitting || result?.success}
            className="flex-1 py-3 bg-orange-600 text-white rounded-xl text-sm font-bold hover:bg-orange-700 active:scale-[0.97] disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</>
            ) : result?.success ? (
              <><CheckCircle className="w-4 h-4" /> Created!</>
            ) : (
              <><Send className="w-4 h-4" /> Submit Dispute</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
