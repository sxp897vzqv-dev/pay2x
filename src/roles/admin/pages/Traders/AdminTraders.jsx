// Solution: Use Firebase Admin SDK via Cloud Function to create user
// This way, you stay logged in as admin!

import React, { useState, useEffect } from 'react';
import {
  collection,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  serverTimestamp,
  getDoc,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth, db } from '../../../../firebase';
import {
  Search,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  X,
  UserPlus,
  CheckCircle,
  XCircle,
  MoreVertical,
  Wallet,
  Copy,
  RefreshCw,
  AlertCircle,
  MessageCircle,
  Key,
} from 'lucide-react';
import QRCode from 'react-qr-code';

// Initialize Firebase Functions
const functions = getFunctions();

// TraderCard component (same as before)
const TraderCard = ({ trader, onEdit, onDelete, onToggleStatus, onRegenerateAddress }) => {
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showMnemonic, setShowMnemonic] = useState(false);

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
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 hover:shadow-md transition-all">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
              {trader.name?.charAt(0).toUpperCase() || 'T'}
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">{trader.name || 'N/A'}</h3>
              <p className="text-sm text-slate-500">{trader.email}</p>
            </div>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <MoreVertical className="w-5 h-5 text-slate-600" />
            </button>
            {showMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-10">
                <button
                  onClick={() => {
                    onEdit(trader);
                    setShowMenu(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2"
                >
                  <Edit className="w-4 h-4" />
                  Edit Details
                </button>
                {trader.usdtDepositAddress && (
                  <button
                    onClick={() => {
                      setShowQR(true);
                      setShowMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2"
                  >
                    <Wallet className="w-4 h-4" />
                    View QR Code
                  </button>
                )}
                {trader.mnemonic && (
                  <button
                    onClick={() => {
                      setShowMnemonic(true);
                      setShowMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2 text-orange-600"
                  >
                    <Key className="w-4 h-4" />
                    View Mnemonic
                  </button>
                )}
                <button
                  onClick={() => {
                    onRegenerateAddress(trader);
                    setShowMenu(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  {trader.usdtDepositAddress ? 'Regenerate' : 'Generate'} USDT Address
                </button>
                <button
                  onClick={() => {
                    onToggleStatus(trader);
                    setShowMenu(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2"
                >
                  {trader.active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {trader.active ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  onClick={() => {
                    onDelete(trader);
                    setShowMenu(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>

        {trader.usdtDepositAddress && (
          <div className="mb-4 p-3 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                <Wallet className="w-3 h-3" />
                USDT Deposit Address (TRC20)
              </p>
              <button
                onClick={copyAddress}
                className="text-xs px-2 py-1 bg-white rounded hover:bg-slate-50 flex items-center gap-1"
              >
                {copied ? <CheckCircle className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-xs font-mono text-slate-600 break-all">
              {trader.usdtDepositAddress}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Index: {trader.derivationIndex ?? 'N/A'}
            </p>
          </div>
        )}

        {!trader.usdtDepositAddress && (
          <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
            <p className="text-xs text-orange-800 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              No USDT address generated yet
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-xs text-slate-500 mb-1">Phone</p>
            <p className="text-sm font-medium text-slate-900">{trader.phone || 'N/A'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Priority</p>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
              trader.priority === 'High' ? 'bg-red-100 text-red-700' :
              trader.priority === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
              'bg-green-100 text-green-700'
            }`}>
              {trader.priority || 'Normal'}
            </span>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Balance</p>
            <p className="text-sm font-semibold text-green-600">₹{(trader.balance || 0).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Security Hold</p>
            <p className="text-sm font-semibold text-orange-600">₹{(trader.securityHold || 0).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Payin Commission</p>
            <p className="text-sm font-medium text-slate-900">{trader.payinCommission || trader.commissionRate || 4}%</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Payout Commission</p>
            <p className="text-sm font-medium text-slate-900">{trader.payoutCommission || trader.commissionRate || 4}%</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-slate-500 mb-1">Working Balance</p>
            <p className="text-sm font-semibold text-blue-600">
              ₹{(trader.workingBalance || ((trader.balance || 0) - (trader.securityHold || 0))).toLocaleString()}
            </p>
          </div>
        </div>

        {(trader.telegramId || trader.telegramGroupLink) && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
            {trader.telegramId && (
              <div>
                <p className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                  <MessageCircle className="w-3 h-3" />
                  Telegram ID
                </p>
                <p className="text-sm font-mono text-blue-900">@{trader.telegramId}</p>
              </div>
            )}
            {trader.telegramGroupLink && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Telegram Group</p>
                <a
                  href={trader.telegramGroupLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline break-all"
                >
                  {trader.telegramGroupLink}
                </a>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
          <span className={`flex items-center gap-1 text-sm font-medium ${
            trader.active ? 'text-green-600' : 'text-red-600'
          }`}>
            {trader.active ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <XCircle className="w-4 h-4" />
            )}
            {trader.active ? 'Active' : 'Inactive'}
          </span>
          <p className="text-xs text-slate-400">
            ID: {trader.id?.slice(-8)}
          </p>
        </div>
      </div>

      {showQR && trader.usdtDepositAddress && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowQR(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900">USDT Deposit Address</h3>
              <button onClick={() => setShowQR(false)} className="p-1 hover:bg-slate-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-white p-4 rounded-xl border-2 border-slate-200 flex justify-center mb-4">
              <QRCode value={trader.usdtDepositAddress} size={200} />
            </div>
            <div className="text-center">
              <p className="text-xs font-mono text-slate-600 break-all mb-2">
                {trader.usdtDepositAddress}
              </p>
              <button
                onClick={copyAddress}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm flex items-center gap-2 mx-auto"
              >
                {copied ? <CheckCircle size={16} /> : <Copy size={16} />}
                {copied ? 'Copied!' : 'Copy Address'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showMnemonic && trader.mnemonic && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowMnemonic(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Key className="w-5 h-5 text-orange-600" />
                Wallet Mnemonic
              </h3>
              <button onClick={() => setShowMnemonic(false)} className="p-1 hover:bg-slate-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="bg-orange-50 border-2 border-orange-200 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-2 mb-3">
                <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-orange-900">
                  <p className="font-bold mb-1">⚠️ CRITICAL SECURITY WARNING</p>
                  <p>This mnemonic phrase gives FULL ACCESS to the wallet. Never share it with anyone!</p>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 border-2 border-slate-200 rounded-lg p-4 mb-4">
              <p className="text-sm font-mono text-slate-900 leading-relaxed">
                {trader.mnemonic}
              </p>
            </div>

            <button
              onClick={copyMnemonic}
              className="w-full px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-semibold flex items-center justify-center gap-2"
            >
              <Copy size={16} />
              Copy Mnemonic (Keep Safe!)
            </button>
          </div>
        </div>
      )}
    </>
  );
};

// TraderModal (same as before)
const TraderModal = ({ trader, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    priority: 'Normal',
    payinCommission: 3,
    payoutCommission: 1,
    balance: 0,
    securityHold: 0,
    telegramId: '',
    telegramGroupLink: '',
    active: true,
    ...trader,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await onSave(formData);
      onClose();
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h3 className="text-xl font-bold text-slate-900">
            {trader ? 'Edit Trader' : 'Add New Trader'}
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Full Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="John Doe"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Email *
              </label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="trader@example.com"
                disabled={!!trader}
              />
            </div>
          </div>

          {!trader && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Password *
              </label>
              <input
                type="password"
                required={!trader}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="Min. 6 characters"
                minLength={6}
              />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Phone Number
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="+91 9876543210"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Priority
              </label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="Normal">Normal</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Payin Commission %
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={formData.payinCommission}
                onChange={(e) => setFormData({ ...formData, payinCommission: Number(e.target.value) })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="3"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Payout Commission %
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={formData.payoutCommission}
                onChange={(e) => setFormData({ ...formData, payoutCommission: Number(e.target.value) })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="1"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Initial Balance (₹)
            </label>
            <input
              type="number"
              min="0"
              value={formData.balance}
              onChange={(e) => setFormData({ ...formData, balance: Number(e.target.value) })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Security Hold (₹)
            </label>
            <input
              type="number"
              min="0"
              value={formData.securityHold}
              onChange={(e) => setFormData({ ...formData, securityHold: Number(e.target.value) })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Amount to freeze as security"
            />
            <p className="text-xs text-slate-500 mt-1">
              Frozen balance that cannot be used for transactions
            </p>
          </div>

          <div className="border-t border-slate-200 pt-4">
            <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <MessageCircle className="w-4 h-4" />
              Telegram Information
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Telegram ID
                </label>
                <input
                  type="text"
                  value={formData.telegramId}
                  onChange={(e) => setFormData({ ...formData, telegramId: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="username"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Without @ symbol
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Telegram Group Link
                </label>
                <input
                  type="url"
                  value={formData.telegramGroupLink}
                  onChange={(e) => setFormData({ ...formData, telegramGroupLink: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="https://t.me/groupname"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="active"
              checked={formData.active}
              onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
              className="w-4 h-4 text-purple-600 rounded focus:ring-2 focus:ring-purple-500"
            />
            <label htmlFor="active" className="text-sm font-medium text-slate-700">
              Active Status
            </label>
          </div>

          <div className="flex gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : trader ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const AdminTraders = () => {
  const [traders, setTraders] = useState([]);
  const [filteredTraders, setFilteredTraders] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedTrader, setSelectedTrader] = useState(null);

  useEffect(() => {
    fetchTraders();
  }, []);

  useEffect(() => {
    if (search) {
      const filtered = traders.filter(
        (t) =>
          t.name?.toLowerCase().includes(search.toLowerCase()) ||
          t.email?.toLowerCase().includes(search.toLowerCase()) ||
          t.phone?.includes(search) ||
          t.telegramId?.toLowerCase().includes(search.toLowerCase())
      );
      setFilteredTraders(filtered);
    } else {
      setFilteredTraders(traders);
    }
  }, [search, traders]);

  const fetchTraders = async () => {
    setLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'trader'));
      const tradersData = [];
      querySnapshot.forEach((doc) => {
        tradersData.push({ id: doc.id, ...doc.data() });
      });
      setTraders(tradersData);
      setFilteredTraders(tradersData);
    } catch (error) {
      console.error('Error fetching traders:', error);
    }
    setLoading(false);
  };

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
        headers: {
          'x-api-key': tatumApiKey,
        },
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

  const handleSaveTrader = async (formData) => {
    try {
      if (selectedTrader) {
        // Update existing trader
        const { password, ...updateData } = formData;
        const workingBalance = (updateData.balance || 0) - (updateData.securityHold || 0);
        
        await updateDoc(doc(db, 'trader', selectedTrader.id), {
          ...updateData,
          workingBalance: workingBalance,
          updatedAt: serverTimestamp(),
        });
        
        alert('✅ Trader updated successfully!');
      } else {
        // Create new trader using Cloud Function
        // THIS IS THE FIX - Cloud Function creates auth user for us!
        console.log('🚀 Creating trader with Cloud Function (no auto-logout)...');
        
        const createTraderComplete = httpsCallable(functions, 'createTraderComplete');
        
        const result = await createTraderComplete({
          email: formData.email,
          password: formData.password,
          name: formData.name,
          phone: formData.phone || '',
          priority: formData.priority || 'Normal',
          payinCommission: formData.payinCommission || 3,
          payoutCommission: formData.payoutCommission || 1,
          balance: formData.balance || 0,
          securityHold: formData.securityHold || 0,
          telegramId: formData.telegramId || '',
          telegramGroupLink: formData.telegramGroupLink || '',
          active: formData.active !== undefined ? formData.active : true,
        });

        console.log('✅ Cloud Function response:', result.data);

        const uid = result.data.uid;

        // Generate USDT address
        try {
          await generateTatumAddress(uid);
          alert('✅ Trader created successfully with USDT address!');
        } catch (error) {
          console.error('Error generating USDT address:', error);
          alert('✅ Trader created successfully!\n\n⚠️ USDT address generation failed: ' + error.message + '\n\nYou can regenerate it from the trader menu.');
        }
      }
      
      await fetchTraders();
      setShowModal(false);
      setSelectedTrader(null);
    } catch (error) {
      console.error('Error saving trader:', error);
      throw error;
    }
  };

  const handleRegenerateAddress = async (trader) => {
    if (!window.confirm(`Regenerate USDT address for ${trader.name}?\n\n${trader.usdtDepositAddress ? 'Old address will be replaced.' : 'This will generate a new address.'}`)) {
      return;
    }

    try {
      await generateTatumAddress(trader.id);
      await fetchTraders();
      alert('✅ USDT address ' + (trader.usdtDepositAddress ? 'regenerated' : 'generated') + ' successfully!');
    } catch (error) {
      alert('❌ Error: ' + error.message);
    }
  };

  const handleDeleteTrader = async (trader) => {
    if (!window.confirm(`Are you sure you want to delete ${trader.name}?\n\nThis action cannot be undone.`)) return;
    
    try {
      await deleteDoc(doc(db, 'trader', trader.id));
      
      if (trader.usdtDepositAddress) {
        await deleteDoc(doc(db, 'addressMapping', trader.usdtDepositAddress)).catch(() => {});
      }
      
      await fetchTraders();
      alert('✅ Trader deleted successfully');
    } catch (error) {
      alert('Error deleting trader: ' + error.message);
    }
  };

  const handleToggleStatus = async (trader) => {
    try {
      await updateDoc(doc(db, 'trader', trader.id), {
        active: !trader.active,
        isActive: !trader.active,
      });
      await fetchTraders();
    } catch (error) {
      alert('Error updating status: ' + error.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">Loading traders...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Traders Management</h1>
          <p className="text-slate-600 mt-1">Cloud Functions (Admin stays logged in!)</p>
        </div>
        <button
          onClick={() => {
            setSelectedTrader(null);
            setShowModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors shadow-sm"
        >
          <UserPlus className="w-5 h-5" />
          Add Trader
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
        <div className="flex items-center gap-3">
          <Search className="w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, email, phone, or telegram..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 outline-none text-slate-900 placeholder-slate-400"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white">
          <p className="text-blue-100 text-sm mb-1">Total Traders</p>
          <p className="text-3xl font-bold">{traders.length}</p>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white">
          <p className="text-green-100 text-sm mb-1">Active Traders</p>
          <p className="text-3xl font-bold">{traders.filter((t) => t.active).length}</p>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 text-white">
          <p className="text-purple-100 text-sm mb-1">With USDT Address</p>
          <p className="text-3xl font-bold">
            {traders.filter((t) => t.usdtDepositAddress).length}
          </p>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-6 text-white">
          <p className="text-orange-100 text-sm mb-1">Total Balance</p>
          <p className="text-3xl font-bold">
            ₹{traders.reduce((sum, t) => sum + (t.balance || 0), 0).toLocaleString()}
          </p>
        </div>
      </div>

      {filteredTraders.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTraders.map((trader) => (
            <TraderCard
              key={trader.id}
              trader={trader}
              onEdit={(t) => {
                setSelectedTrader(t);
                setShowModal(true);
              }}
              onDelete={handleDeleteTrader}
              onToggleStatus={handleToggleStatus}
              onRegenerateAddress={handleRegenerateAddress}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-12 text-center">
          <Wallet className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">No traders found</p>
          <p className="text-sm text-slate-400 mt-1">Create your first trader to get started</p>
        </div>
      )}

      {showModal && (
        <TraderModal
          trader={selectedTrader}
          onClose={() => {
            setShowModal(false);
            setSelectedTrader(null);
          }}
          onSave={handleSaveTrader}
        />
      )}
    </div>
  );
};

export default AdminTraders;