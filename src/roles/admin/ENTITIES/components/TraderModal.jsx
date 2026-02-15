import React, { useState, useEffect } from 'react';
import { supabase } from '../../../../supabase';
import {
  RefreshCw, AlertCircle, X, User, Mail, Phone, Key,
  IndianRupee, Shield, MessageCircle, Wallet, Lock, UserPlus, Users,
} from 'lucide-react';

export default function TraderModal({ trader, onClose, onSave }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    priority: 'Normal',
    payinCommission: 4,
    payoutCommission: 1,
    balance: 0,
    securityHold: 0,
    telegramId: '',
    telegramGroupLink: '',
    active: true,
    affiliateId: '',
    affiliateCommission: 5,
    ...trader,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [affiliates, setAffiliates] = useState([]);

  // Fetch affiliates for dropdown
  useEffect(() => {
    const fetchAffiliates = async () => {
      const { data } = await supabase
        .from('affiliates')
        .select('id, name, email, default_commission_rate')
        .eq('status', 'active')
        .order('name');
      setAffiliates(data || []);
    };
    fetchAffiliates();
  }, []);

  // When affiliate is selected, set default commission
  const handleAffiliateChange = (affiliateId) => {
    const affiliate = affiliates.find(a => a.id === affiliateId);
    setFormData(prev => ({
      ...prev,
      affiliateId,
      affiliateCommission: affiliate?.default_commission_rate || 5
    }));
  };

  const handleChange = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.name.trim()) { setError('Name is required'); return; }
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
            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
              <UserPlus className="w-4 h-4 text-indigo-600" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              {trader ? 'Edit Trader' : 'Add New Trader'}
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
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Basic Information</p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-slate-400" /> Full Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => handleChange('name', e.target.value)}
                  placeholder="John Doe"
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
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
                  placeholder="trader@example.com"
                  disabled={!!trader}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent disabled:bg-slate-100 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            {!trader && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-blue-500" />
                  <p className="text-sm text-blue-700">
                    <strong>Password will be auto-generated</strong> and sent to the trader's email address.
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
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5 text-purple-500" /> Priority
                </label>
                <select
                  value={formData.priority}
                  onChange={e => handleChange('priority', e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-white"
                >
                  <option value="Normal">Normal</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>
            </div>
          </div>

          {/* Affiliate Settings */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
              <Users className="w-3.5 h-3.5" /> Affiliate (Optional)
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Select Affiliate</label>
                <select
                  value={formData.affiliateId || ''}
                  onChange={e => handleAffiliateChange(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-white"
                >
                  <option value="">No Affiliate</option>
                  {affiliates.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.email}) - {a.default_commission_rate}%
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">Affiliate who referred this trader</p>
              </div>

              {formData.affiliateId && (
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Affiliate Commission (%)</label>
                  <input
                    type="number"
                    value={formData.affiliateCommission}
                    onChange={e => handleChange('affiliateCommission', Number(e.target.value))}
                    placeholder="5"
                    min="0"
                    max="100"
                    step="0.1"
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                  />
                  <p className="text-xs text-slate-400 mt-1">% of trader earnings to affiliate</p>
                </div>
              )}
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
                  placeholder="4"
                  min="0"
                  max="100"
                  step="0.1"
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
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
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Balance */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Balance Settings</p>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1">
                  <Wallet className="w-3.5 h-3.5 text-green-500" /> Initial Balance (₹)
                </label>
                <input
                  type="number"
                  value={formData.balance}
                  onChange={e => handleChange('balance', Number(e.target.value))}
                  placeholder="0"
                  min="0"
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5 text-orange-500" /> Security Hold (₹)
                </label>
                <input
                  type="number"
                  value={formData.securityHold}
                  onChange={e => handleChange('securityHold', Number(e.target.value))}
                  placeholder="0"
                  min="0"
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                />
                <p className="text-xs text-slate-400 mt-1">Frozen balance for security</p>
              </div>
            </div>
          </div>

          {/* Telegram */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
              <MessageCircle className="w-3.5 h-3.5" /> Telegram (Optional)
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Telegram ID</label>
                <input
                  type="text"
                  value={formData.telegramId}
                  onChange={e => handleChange('telegramId', e.target.value)}
                  placeholder="username (without @)"
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Telegram Group Link</label>
                <input
                  type="url"
                  value={formData.telegramGroupLink}
                  onChange={e => handleChange('telegramGroupLink', e.target.value)}
                  placeholder="https://t.me/groupname"
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
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
              className="w-4 h-4 text-indigo-600 rounded focus:ring-2 focus:ring-indigo-500"
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
            className="flex-1 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.97]"
          >
            {saving ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> {trader ? 'Updating...' : 'Creating...'}</>
            ) : (
              <><UserPlus className="w-4 h-4" /> {trader ? 'Update Trader' : 'Create Trader'}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
