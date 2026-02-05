import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Eye, CheckCircle, AlertCircle, Wallet, Phone, RefreshCw, X,
  Key, Copy, MoreVertical, Trash2, Edit, EyeOff, MessageCircle,
} from 'lucide-react';
import QRCode from 'react-qr-code';

export default function TraderCard({ trader, onEdit, onDelete, onToggleStatus, onRegenerateAddress }) {
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
