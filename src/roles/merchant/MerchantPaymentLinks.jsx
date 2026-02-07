// src/roles/merchant/MerchantPaymentLinks.jsx
// Generate and manage payment links

import { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { 
  LinkIcon,
  PlusIcon,
  ClipboardIcon,
  CheckIcon,
  TrashIcon,
  QrCodeIcon,
  XMarkIcon,
  EyeIcon
} from '@heroicons/react/24/outline';

export default function MerchantPaymentLinks() {
  const [loading, setLoading] = useState(true);
  const [merchant, setMerchant] = useState(null);
  const [links, setLinks] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(null);
  const [copied, setCopied] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    amount: '',
    description: '',
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    redirectUrl: '',
    isSingleUse: true,
    expiresIn: '24h'
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: merchantData } = await supabase
        .from('merchants')
        .select('*')
        .eq('profile_id', user.id)
        .single();
      setMerchant(merchantData);

      if (merchantData) {
        const { data: linksData } = await supabase
          .from('payment_links')
          .select('*')
          .eq('merchant_id', merchantData.id)
          .order('created_at', { ascending: false });
        setLinks(linksData || []);
      }
    } catch (err) {
      console.error('Error loading payment links:', err);
    }
    setLoading(false);
  }

  function generateCode() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  async function createLink(e) {
    e.preventDefault();
    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const code = generateCode();
      
      let expiresAt = null;
      if (form.expiresIn !== 'never') {
        const hours = form.expiresIn === '1h' ? 1 : form.expiresIn === '24h' ? 24 : form.expiresIn === '7d' ? 168 : 720;
        expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
      }

      const { error } = await supabase.from('payment_links').insert({
        merchant_id: merchant.id,
        code,
        amount: form.amount ? Number(form.amount) : null,
        description: form.description || null,
        customer_name: form.customerName || null,
        customer_email: form.customerEmail || null,
        customer_phone: form.customerPhone || null,
        redirect_url: form.redirectUrl || null,
        is_single_use: form.isSingleUse,
        expires_at: expiresAt,
        created_by: user.id,
      });

      if (error) throw error;

      // Log activity
      await supabase.rpc('log_merchant_activity', {
        p_merchant_id: merchant.id,
        p_user_id: user.id,
        p_action: 'create_payment_link',
        p_resource_type: 'payment_link',
        p_resource_id: code,
        p_details: { amount: form.amount }
      });

      setShowCreateModal(false);
      setForm({
        amount: '',
        description: '',
        customerName: '',
        customerEmail: '',
        customerPhone: '',
        redirectUrl: '',
        isSingleUse: true,
        expiresIn: '24h'
      });
      loadData();
    } catch (err) {
      console.error('Error creating link:', err);
      alert('Failed to create link: ' + err.message);
    }
    setSaving(false);
  }

  async function deleteLink(link) {
    if (!confirm('Delete this payment link?')) return;

    try {
      await supabase.from('payment_links').delete().eq('id', link.id);
      loadData();
    } catch (err) {
      console.error('Error deleting link:', err);
    }
  }

  function copyToClipboard(link) {
    const url = getPaymentUrl(link);
    navigator.clipboard.writeText(url);
    setCopied(link.id);
    setTimeout(() => setCopied(null), 2000);
  }

  function getPaymentUrl(link) {
    // In production, use your actual domain
    return `${window.location.origin}/pay/${link.code}`;
  }

  function isExpired(link) {
    if (!link.expires_at) return false;
    return new Date(link.expires_at) < new Date();
  }

  function formatDate(date) {
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatCurrency(amount) {
    if (!amount) return 'Any amount';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  }

  function getStatus(link) {
    if (link.used_at) return { label: 'Used', class: 'bg-blue-100 text-blue-700' };
    if (!link.is_active) return { label: 'Inactive', class: 'bg-gray-100 text-gray-700' };
    if (isExpired(link)) return { label: 'Expired', class: 'bg-red-100 text-red-700' };
    return { label: 'Active', class: 'bg-green-100 text-green-700' };
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <LinkIcon className="h-7 w-7 text-indigo-500" />
            Payment Links
          </h1>
          <p className="text-gray-500 mt-1">Create and share payment links with customers</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
        >
          <PlusIcon className="h-5 w-5" />
          Create Link
        </button>
      </div>

      {/* Links List */}
      <div className="bg-white rounded-lg shadow">
        {links.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <LinkIcon className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>No payment links yet</p>
            <p className="text-sm mt-1">Create your first payment link to share with customers</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {links.map(link => {
              const status = getStatus(link);
              return (
                <div key={link.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${status.class}`}>
                          {status.label}
                        </span>
                        <span className="font-bold text-gray-900">
                          {formatCurrency(link.amount)}
                        </span>
                        {link.is_single_use && (
                          <span className="text-xs text-gray-400">Single use</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mt-1 truncate">
                        {link.description || 'No description'}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <span className="font-mono bg-gray-100 px-2 py-1 rounded">
                          {link.code}
                        </span>
                        {link.customer_name && <span>👤 {link.customer_name}</span>}
                        <span>Created: {formatDate(link.created_at)}</span>
                        {link.expires_at && (
                          <span className={isExpired(link) ? 'text-red-500' : ''}>
                            Expires: {formatDate(link.expires_at)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => copyToClipboard(link)}
                        className="p-2 hover:bg-gray-100 rounded-lg"
                        title="Copy link"
                      >
                        {copied === link.id ? (
                          <CheckIcon className="h-5 w-5 text-green-500" />
                        ) : (
                          <ClipboardIcon className="h-5 w-5 text-gray-500" />
                        )}
                      </button>
                      <button
                        onClick={() => setShowQRModal(link)}
                        className="p-2 hover:bg-gray-100 rounded-lg"
                        title="Show QR code"
                      >
                        <QrCodeIcon className="h-5 w-5 text-gray-500" />
                      </button>
                      <button
                        onClick={() => deleteLink(link)}
                        className="p-2 hover:bg-red-50 rounded-lg"
                        title="Delete link"
                      >
                        <TrashIcon className="h-5 w-5 text-gray-400 hover:text-red-500" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Create Payment Link</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={createLink}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Amount (leave empty for any amount)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                    <input
                      type="number"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="500"
                      min="1"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="Product name or service"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Customer Name
                    </label>
                    <input
                      type="text"
                      value={form.customerName}
                      onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="John Doe"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Customer Phone
                    </label>
                    <input
                      type="tel"
                      value={form.customerPhone}
                      onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="9876543210"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Customer Email
                  </label>
                  <input
                    type="email"
                    value={form.customerEmail}
                    onChange={(e) => setForm({ ...form, customerEmail: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="customer@email.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Redirect URL (after payment)
                  </label>
                  <input
                    type="url"
                    value={form.redirectUrl}
                    onChange={(e) => setForm({ ...form, redirectUrl: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="https://yoursite.com/thank-you"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Expires In
                    </label>
                    <select
                      value={form.expiresIn}
                      onChange={(e) => setForm({ ...form, expiresIn: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="1h">1 hour</option>
                      <option value="24h">24 hours</option>
                      <option value="7d">7 days</option>
                      <option value="30d">30 days</option>
                      <option value="never">Never</option>
                    </select>
                  </div>
                  <div className="flex items-center">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.isSingleUse}
                        onChange={(e) => setForm({ ...form, isSingleUse: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-300 text-indigo-600"
                      />
                      <span className="text-sm text-gray-700">Single use only</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? 'Creating...' : 'Create Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Modal */}
      {showQRModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowQRModal(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 text-center" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Payment Link QR</h3>
            <div className="bg-gray-100 p-4 rounded-lg mb-4">
              {/* QR Code - using a simple API for demo */}
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(getPaymentUrl(showQRModal))}`}
                alt="QR Code"
                className="mx-auto"
              />
            </div>
            <p className="text-sm text-gray-500 mb-2">Scan to pay</p>
            <p className="font-bold text-lg">{formatCurrency(showQRModal.amount)}</p>
            <p className="text-sm text-gray-500 mt-1 font-mono">{showQRModal.code}</p>
            <button
              onClick={() => setShowQRModal(null)}
              className="mt-4 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
