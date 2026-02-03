import React, { useEffect, useState, useMemo } from 'react';
import { db } from '../../../firebase';
import {
  collection, query, doc, updateDoc, onSnapshot, orderBy, setDoc, getDoc, serverTimestamp, deleteDoc,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users, Search, Filter, Plus, RefreshCw, Eye, CheckCircle, AlertCircle,
  Wallet, Phone, Mail, Download, UserPlus, ToggleLeft, ToggleRight, X,
  User, Lock, DollarSign, Shield, MessageCircle, Key, Copy, MoreVertical,
  Trash2, Edit, EyeOff,
} from 'lucide-react';
import QRCode from 'react-qr-code';

// Initialize Firebase Functions
const functions = getFunctions();

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

/* ─── Add/Edit Trader Modal ─── */
function TraderModal({ trader, onClose, onSave }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    priority: 'Normal',
    payinCommission: 4,
    payoutCommission: 1,
    balance: 0,
    securityHold: 0,
    telegramId: '',
    telegramGroupLink: '',
    active: true,
    ...trader,
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
    if (!formData.name.trim()) { setError('Name is required'); return; }
    if (!formData.email.trim()) { setError('Email is required'); return; }
    if (!trader && !formData.password) { setError('Password is required for new traders'); return; }
    if (!trader && formData.password.length < 6) { setError('Password must be at least 6 characters'); return; }
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
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
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
                  placeholder="4"
                  min="0"
                  max="100"
                  step="0.1"
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
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

/* ─── Trader Card ─── */
function TraderCard({ trader, onEdit, onDelete, onToggleStatus, onRegenerateAddress }) {
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showMnemonic, setShowMnemonic] = useState(false);

  const isActive = trader.active || trader.isActive || trader.status === 'active';
  const workingBalance = (Number(trader.balance) || 0) - (Number(trader.securityHold) || 0);

  const copyAddress = () => {
    if (trader.usdtDepositAddress) {
      navigator.clipboard.writeText(trader.usdtDepositAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const copyMnemonic = () => {
    if (trader.mnemonic) {
      navigator.clipboard.writeText(trader.mnemonic);
      setTimeout(() => alert('✅ Mnemonic copied! Keep it safe!'), 100);
    }
  };

  return (
    <>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className={`h-1 ${isActive ? 'bg-green-500' : 'bg-slate-300'}`} />
        <div className="p-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                {trader.name?.charAt(0).toUpperCase() || 'T'}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-900 text-sm truncate">{trader.name || 'Unnamed'}</h3>
                <p className="text-xs text-slate-400 truncate">{trader.email}</p>
              </div>
            </div>
            <div className="relative">
              <button onClick={() => setShowMenu(!showMenu)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <MoreVertical className="w-4 h-4 text-slate-500" />
              </button>
              {showMenu && (
                <div className="absolute right-0 mt-1 w-48 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-20">
                  <button onClick={() => { onEdit(trader); setShowMenu(false); }}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-slate-50 flex items-center gap-2">
                    <Edit className="w-3.5 h-3.5" /> Edit Details
                  </button>
                  {trader.usdtDepositAddress && (
                    <button onClick={() => { setShowQR(true); setShowMenu(false); }}
                      className="w-full px-3 py-2 text-left text-xs hover:bg-slate-50 flex items-center gap-2">
                      <Wallet className="w-3.5 h-3.5" /> View QR Code
                    </button>
                  )}
                  {trader.mnemonic && (
                    <button onClick={() => { setShowMnemonic(true); setShowMenu(false); }}
                      className="w-full px-3 py-2 text-left text-xs hover:bg-slate-50 flex items-center gap-2 text-orange-600">
                      <Key className="w-3.5 h-3.5" /> View Mnemonic
                    </button>
                  )}
                  <button onClick={() => { onRegenerateAddress(trader); setShowMenu(false); }}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-slate-50 flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5" /> {trader.usdtDepositAddress ? 'Regenerate' : 'Generate'} USDT
                  </button>
                  <button onClick={() => { onToggleStatus(trader); setShowMenu(false); }}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-slate-50 flex items-center gap-2">
                    {isActive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  <button onClick={() => { onDelete(trader); setShowMenu(false); }}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-red-50 text-red-600 flex items-center gap-2">
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* USDT Address */}
          {trader.usdtDepositAddress ? (
            <div className="mb-2 p-2 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                  <Wallet className="w-3 h-3" /> USDT (TRC20)
                </p>
                <button onClick={copyAddress} className="text-xs px-1.5 py-0.5 bg-white rounded hover:bg-slate-50 flex items-center gap-1">
                  {copied ? <CheckCircle className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
              <p className="text-xs font-mono text-slate-600 truncate">{trader.usdtDepositAddress}</p>
            </div>
          ) : (
            <div className="mb-2 p-2 bg-orange-50 border border-orange-200 rounded-lg">
              <p className="text-xs text-orange-700 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> No USDT address
              </p>
            </div>
          )}

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-2 mb-2">
            <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
              <p className="text-xs text-slate-400 mb-0.5">Working</p>
              <p className="text-sm font-bold text-slate-900">₹{workingBalance.toLocaleString()}</p>
            </div>
            <div className="bg-green-50 rounded-lg p-2 border border-green-100">
              <p className="text-xs text-green-600 mb-0.5">Payin %</p>
              <p className="text-sm font-bold text-green-700">{trader.payinCommission || trader.commissionRate || 4}%</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-2 border border-blue-100">
              <p className="text-xs text-blue-600 mb-0.5">Payout %</p>
              <p className="text-sm font-bold text-blue-700">{trader.payoutCommission || 1}%</p>
            </div>
          </div>

          {/* Contact + Telegram */}
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-2 flex-wrap">
            {trader.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {trader.phone}</span>}
            {trader.telegramId && <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" /> @{trader.telegramId}</span>}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Link to={`/admin/traders/${trader.id}`}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold hover:bg-indigo-100 active:scale-[0.97] transition-all">
              <Eye className="w-3.5 h-3.5" /> Details
            </Link>
            <Link to={`/admin/traders/${trader.id}?tab=balance`}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-semibold hover:bg-green-100 active:scale-[0.97] transition-all">
              <Wallet className="w-3.5 h-3.5" /> Balance
            </Link>
          </div>

          {/* Status */}
          <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-100">
            <span className={`flex items-center gap-1 text-xs font-bold ${isActive ? 'text-green-600' : 'text-red-500'}`}>
              {isActive ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
              {isActive ? 'Active' : 'Inactive'}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
              trader.priority === 'High' ? 'bg-red-100 text-red-700' :
              trader.priority === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
              'bg-green-100 text-green-700'
            }`}>{trader.priority || 'Normal'}</span>
          </div>
        </div>
      </div>

      {/* QR Modal */}
      {showQR && trader.usdtDepositAddress && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowQR(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900">USDT Deposit Address</h3>
              <button onClick={() => setShowQR(false)} className="p-1 hover:bg-slate-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="bg-white p-4 rounded-xl border-2 border-slate-200 flex justify-center mb-4">
              <QRCode value={trader.usdtDepositAddress} size={200} />
            </div>
            <p className="text-xs font-mono text-slate-600 break-all text-center mb-3">{trader.usdtDepositAddress}</p>
            <button onClick={copyAddress}
              className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm flex items-center justify-center gap-2">
              {copied ? <CheckCircle size={16} /> : <Copy size={16} />}
              {copied ? 'Copied!' : 'Copy Address'}
            </button>
          </div>
        </div>
      )}

      {/* Mnemonic Modal */}
      {showMnemonic && trader.mnemonic && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowMnemonic(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Key className="w-5 h-5 text-orange-600" /> Wallet Mnemonic
              </h3>
              <button onClick={() => setShowMnemonic(false)} className="p-1 hover:bg-slate-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="bg-orange-50 border-2 border-orange-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-orange-900 font-bold mb-1">⚠️ CRITICAL SECURITY WARNING</p>
              <p className="text-xs text-orange-800">This mnemonic gives FULL ACCESS to the wallet. Never share!</p>
            </div>
            <div className="bg-slate-50 border-2 border-slate-200 rounded-lg p-4 mb-4">
              <p className="text-sm font-mono text-slate-900 leading-relaxed">{trader.mnemonic}</p>
            </div>
            <button onClick={copyMnemonic}
              className="w-full px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-semibold flex items-center justify-center gap-2">
              <Copy size={16} /> Copy Mnemonic (Keep Safe!)
            </button>
          </div>
        </div>
      )}
    </>
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
      <div className="h-12 bg-slate-100 rounded-lg mb-2" />
      <div className="grid grid-cols-3 gap-2 mb-2">
        {[1, 2, 3].map(i => <div key={i} className="h-12 bg-slate-100 rounded-lg" />)}
      </div>
      <div className="flex gap-2">
        <div className="flex-1 h-8 bg-slate-100 rounded-lg" />
        <div className="flex-1 h-8 bg-slate-100 rounded-lg" />
      </div>
    </div>
  );
}

/* ─── Main Component ─── */
export default function AdminTraderList() {
  const [traders, setTraders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedTrader, setSelectedTrader] = useState(null);
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'trader'), orderBy('createdAt', 'desc')),
      (snap) => {
        const list = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        setTraders(list);
        setLoading(false);
      },
      (err) => { console.error(err); setLoading(false); }
    );
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    let result = traders;
    if (statusFilter === 'active') result = result.filter(t => t.active || t.isActive || t.status === 'active');
    else if (statusFilter === 'inactive') result = result.filter(t => !t.active && !t.isActive && t.status !== 'active');
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(t =>
        t.name?.toLowerCase().includes(s) ||
        t.email?.toLowerCase().includes(s) ||
        t.phone?.includes(s) ||
        t.telegramId?.toLowerCase().includes(s) ||
        t.id?.toLowerCase().includes(s)
      );
    }
    return result;
  }, [traders, statusFilter, search]);

  const stats = useMemo(() => ({
    total: traders.length,
    active: traders.filter(t => t.active || t.isActive || t.status === 'active').length,
    inactive: traders.filter(t => !t.active && !t.isActive && t.status !== 'active').length,
    withAddress: traders.filter(t => t.usdtDepositAddress).length,
    totalBalance: traders.reduce((sum, t) => sum + (t.balance || 0), 0),
  }), [traders]);

  // Generate USDT address using Tatum
  const generateTatumAddress = async (traderId) => {
    try {
      const configDoc = await getDoc(doc(db, 'system', 'tatumConfig'));
      if (!configDoc.exists() || !configDoc.data().masterWallet) {
        throw new Error('Master wallet not configured. Please generate master wallet in Settings first.');
      }

      const config = configDoc.data();
      const { tatumApiKey, masterWallet } = config;

      if (!tatumApiKey || !masterWallet.xpub) {
        throw new Error('Tatum API key or XPUB not found');
      }

      const metaDoc = await getDoc(doc(db, 'system', 'addressMeta'));
      const nextIndex = metaDoc.exists() ? (metaDoc.data().lastIndex || 0) + 1 : 1;

      const response = await fetch(`https://api.tatum.io/v3/tron/address/${masterWallet.xpub}/${nextIndex}`, {
        method: 'GET',
        headers: { 'x-api-key': tatumApiKey },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to generate address');
      }

      const addressData = await response.json();

      await updateDoc(doc(db, 'trader', traderId), {
        usdtDepositAddress: addressData.address,
        derivationIndex: nextIndex,
        mnemonic: masterWallet.mnemonic,
        addressGeneratedAt: serverTimestamp(),
      });

      await setDoc(doc(db, 'system', 'addressMeta'), {
        lastIndex: nextIndex,
        lastUpdated: serverTimestamp(),
      }, { merge: true });

      await setDoc(doc(db, 'addressMapping', addressData.address), {
        traderId: traderId,
        derivationIndex: nextIndex,
        createdAt: serverTimestamp(),
      });

      return addressData.address;
    } catch (error) {
      console.error('Error generating Tatum address:', error);
      throw error;
    }
  };

  // Save trader (create or update)
  const handleSaveTrader = async (formData) => {
    try {
      if (selectedTrader) {
        // ═══════════════════════════════════════════
        // UPDATE EXISTING TRADER
        // ═══════════════════════════════════════════
        const { password, ...updateData } = formData;
        const workingBalance = (Number(updateData.balance) || 0) - (Number(updateData.securityHold) || 0);

        await updateDoc(doc(db, 'trader', selectedTrader.id), {
          name: updateData.name,
          phone: updateData.phone || '',
          priority: updateData.priority || 'Normal',
          payinCommission: Number(updateData.payinCommission) || 4,
          payoutCommission: Number(updateData.payoutCommission) || 1,
          commissionRate: Number(updateData.payinCommission) || 4,
          balance: Number(updateData.balance) || 0,
          securityHold: Number(updateData.securityHold) || 0,
          workingBalance: workingBalance,
          telegramId: updateData.telegramId || '',
          telegramGroupLink: updateData.telegramGroupLink || '',
          active: updateData.active,
          isActive: updateData.active,
          status: updateData.active ? 'active' : 'inactive',
          updatedAt: serverTimestamp(),
          lastModified: serverTimestamp(),
        });

        setToast({ msg: '✅ Trader updated successfully!', success: true });
      } else {
        // ═══════════════════════════════════════════
        // CREATE NEW TRADER via Cloud Function
        // ═══════════════════════════════════════════
        console.log('🚀 Creating trader with Cloud Function...');
        console.log('📤 Sending data:', {
          email: formData.email,
          name: formData.name,
          phone: formData.phone,
          priority: formData.priority,
          payinCommission: formData.payinCommission,
          payoutCommission: formData.payoutCommission,
          balance: formData.balance,
          securityHold: formData.securityHold,
        });

        const createTraderComplete = httpsCallable(functions, 'createTraderComplete');

        // Cloud Function creates BOTH Auth user AND full Firestore doc
        const result = await createTraderComplete({
          email: formData.email,
          password: formData.password,
          name: formData.name,
          phone: formData.phone || '',
          priority: formData.priority || 'Normal',
          payinCommission: Number(formData.payinCommission) || 4,
          payoutCommission: Number(formData.payoutCommission) || 1,
          balance: Number(formData.balance) || 0,
          securityHold: Number(formData.securityHold) || 0,
          telegramId: formData.telegramId || '',
          telegramGroupLink: formData.telegramGroupLink || '',
          active: formData.active !== undefined ? formData.active : true,
        });

        console.log('✅ Cloud Function response:', result.data);
        
        if (!result.data.success) {
          throw new Error(result.data.message || 'Failed to create trader');
        }

        const uid = result.data.uid;

        // Generate USDT address
        try {
          await generateTatumAddress(uid);
          setToast({ msg: '✅ Trader created with USDT address!', success: true });
        } catch (error) {
          console.error('USDT address generation failed:', error);
          setToast({ msg: '✅ Trader created! USDT address failed - generate from menu.', success: true });
        }
      }

      setShowModal(false);
      setSelectedTrader(null);
    } catch (error) {
      console.error('Error saving trader:', error);
      throw error;
    }
  };

  // Regenerate USDT address
  const handleRegenerateAddress = async (trader) => {
    if (!window.confirm(`${trader.usdtDepositAddress ? 'Regenerate' : 'Generate'} USDT address for ${trader.name}?`)) return;

    try {
      await generateTatumAddress(trader.id);
      setToast({ msg: '✅ USDT address ' + (trader.usdtDepositAddress ? 'regenerated' : 'generated') + '!', success: true });
    } catch (error) {
      setToast({ msg: '❌ Error: ' + error.message, success: false });
    }
  };

  // Delete trader
  const handleDeleteTrader = async (trader) => {
    if (!window.confirm(`Delete ${trader.name}?\n\nThis cannot be undone.`)) return;

    try {
      await deleteDoc(doc(db, 'trader', trader.id));
      if (trader.usdtDepositAddress) {
        await deleteDoc(doc(db, 'addressMapping', trader.usdtDepositAddress)).catch(() => {});
      }
      setToast({ msg: '✅ Trader deleted', success: true });
    } catch (error) {
      setToast({ msg: '❌ Error: ' + error.message, success: false });
    }
  };

  // Toggle status
  const handleToggleStatus = async (trader) => {
    const isActive = trader.active || trader.isActive || trader.status === 'active';
    try {
      await updateDoc(doc(db, 'trader', trader.id), {
        active: !isActive,
        isActive: !isActive,
        status: !isActive ? 'active' : 'inactive',
      });
      setToast({ msg: `Trader ${!isActive ? 'activated' : 'deactivated'}`, success: true });
    } catch (error) {
      setToast({ msg: 'Error: ' + error.message, success: false });
    }
  };

  // Export
  const handleExport = () => {
    const csv = [
      ['ID', 'Name', 'Email', 'Phone', 'Status', 'Balance', 'Security Hold', 'Payin %', 'Payout %', 'USDT Address'],
      ...filtered.map(t => [
        t.id, t.name || '', t.email || '', t.phone || '',
        (t.active || t.isActive) ? 'Active' : 'Inactive',
        t.balance || 0, t.securityHold || 0,
        t.payinCommission || t.commissionRate || 4,
        t.payoutCommission || 1,
        t.usdtDepositAddress || '',
      ]),
    ].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `traders-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* Modal */}
      {showModal && (
        <TraderModal
          trader={selectedTrader}
          onClose={() => { setShowModal(false); setSelectedTrader(null); }}
          onSave={handleSaveTrader}
        />
      )}

      {/* Desktop header */}
      <div className="hidden sm:flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-sm">
              <Users className="w-5 h-5 text-white" />
            </div>
            Traders
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 ml-11">Cloud Functions (Admin stays logged in)</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 text-sm font-semibold">
            <Download className="w-4 h-4" /> Export
          </button>
          <button onClick={() => { setSelectedTrader(null); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 text-sm font-semibold">
            <UserPlus className="w-4 h-4" /> Add Trader
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl p-4 text-white">
          <p className="text-indigo-100 text-xs mb-1">Total Traders</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 text-white">
          <p className="text-green-100 text-xs mb-1">Active</p>
          <p className="text-2xl font-bold">{stats.active}</p>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 text-white">
          <p className="text-purple-100 text-xs mb-1">With USDT</p>
          <p className="text-2xl font-bold">{stats.withAddress}</p>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-4 text-white">
          <p className="text-orange-100 text-xs mb-1">Total Balance</p>
          <p className="text-2xl font-bold">₹{(stats.totalBalance / 1000).toFixed(0)}k</p>
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

      {/* Search + filter */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input type="text" placeholder="Search name, email, phone, telegram..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
        </div>
        <button onClick={() => setShowFilters(!showFilters)}
          className={`w-10 h-10 flex items-center justify-center rounded-xl border flex-shrink-0 ${
            showFilters ? 'bg-indigo-50 border-indigo-300 text-indigo-600' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
          }`}>
          <Filter className="w-4 h-4" />
        </button>
        <button onClick={() => { setSelectedTrader(null); setShowModal(true); }}
          className="sm:hidden w-10 h-10 flex items-center justify-center rounded-xl bg-indigo-600 text-white flex-shrink-0">
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
          {filtered.map(trader => (
            <TraderCard
              key={trader.id}
              trader={trader}
              onEdit={(t) => { setSelectedTrader(t); setShowModal(true); }}
              onDelete={handleDeleteTrader}
              onToggleStatus={handleToggleStatus}
              onRegenerateAddress={handleRegenerateAddress}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <Users className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No traders found</p>
          <p className="text-xs text-slate-400 mt-1">
            {search || statusFilter !== 'all' ? 'Try adjusting your filters' : 'Create your first trader to get started'}
          </p>
          {!search && statusFilter === 'all' && (
            <button onClick={() => { setSelectedTrader(null); setShowModal(true); }}
              className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700">
              <UserPlus className="w-4 h-4 inline mr-1" /> Add Trader
            </button>
          )}
        </div>
      )}
    </div>
  );
}