import React, { useState } from 'react';
import {
  Store, RefreshCw, AlertCircle, X, Mail, Phone, Globe, Key,
  IndianRupee, Building, Link as LinkIcon,
} from 'lucide-react';

export default function MerchantModal({ merchant, onClose, onSave }) {
  const [formData, setFormData] = useState({
    name: '',
    businessName: '',
    email: '',
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
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-blue-500" />
                  <p className="text-sm text-blue-700">
                    <strong>Password will be auto-generated</strong> and sent to the merchant's email address.
                  </p>
                </div>
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
                  <IndianRupee className="w-3.5 h-3.5 text-green-500" /> Payin Rate (%)
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
                  <IndianRupee className="w-3.5 h-3.5 text-blue-500" /> Payout Rate (%)
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
