import React, { useState, memo } from 'react';
import { Link } from 'react-router-dom';
import {
  Eye, CheckCircle, AlertCircle, Globe, Key, Copy, Wallet,
  MoreVertical, Edit, Trash2, EyeOff,
} from 'lucide-react';

const MerchantCard = memo(function MerchantCard({ merchant, onEdit, onDelete, onToggleStatus }) {
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);

  const isActive = merchant.active || merchant.isActive || merchant.status === 'active';

  const copyApiKey = () => {
    if (merchant.apiKey) {
      navigator.clipboard.writeText(merchant.apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className={`h-1 ${isActive ? 'bg-green-500' : 'bg-slate-300'}`} />
      <div className="p-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-500 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {(merchant.businessName || merchant.name)?.charAt(0).toUpperCase() || 'M'}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-slate-900 text-sm truncate">{merchant.businessName || merchant.name || 'Unnamed'}</h3>
              <p className="text-xs text-slate-400 truncate">{merchant.email}</p>
            </div>
          </div>
          <div className="relative flex-shrink-0">
            <button onClick={() => setShowMenu(!showMenu)} className="p-1.5 hover:bg-slate-100 rounded-lg">
              <MoreVertical className="w-4 h-4 text-slate-500" />
            </button>
            {showMenu && (
              <div className="absolute right-0 mt-1 w-44 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-20">
                <button onClick={() => { onEdit(merchant); setShowMenu(false); }}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-slate-50 flex items-center gap-2">
                  <Edit className="w-3.5 h-3.5" /> Edit Details
                </button>
                <button onClick={() => { onToggleStatus(merchant); setShowMenu(false); }}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-slate-50 flex items-center gap-2">
                  {isActive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {isActive ? 'Deactivate' : 'Activate'}
                </button>
                <button onClick={() => { onDelete(merchant); setShowMenu(false); }}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-red-50 text-red-600 flex items-center gap-2">
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            )}
          </div>
        </div>

        {/* API Key preview */}
        {merchant.apiKey && (
          <div className="mb-2 p-2 bg-slate-50 rounded-lg flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-400 mb-0.5">API Key</p>
              <p className="text-xs font-mono text-slate-600 truncate">{merchant.apiKey.slice(0, 16)}...</p>
            </div>
            <button onClick={copyApiKey} className="p-1.5 hover:bg-slate-200 rounded-lg">
              {copied ? <CheckCircle className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
            </button>
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2 mb-2">
          <div className="bg-green-50 rounded-lg p-2 border border-green-100">
            <p className="text-xs text-green-600 mb-0.5">Balance</p>
            <p className="text-sm font-bold text-green-700">₹{((merchant.available_balance || 0) / 1000).toFixed(0)}k</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
            <p className="text-xs text-slate-400 mb-0.5">Orders</p>
            <p className="text-sm font-bold text-slate-900">{merchant.totalOrders || 0}</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-2 border border-purple-100">
            <p className="text-xs text-purple-600 mb-0.5">Volume</p>
            <p className="text-sm font-bold text-purple-700">₹{((merchant.totalVolume || 0) / 1000).toFixed(0)}k</p>
          </div>
        </div>

        {/* Website */}
        {merchant.website && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-2">
            <Globe className="w-3 h-3" />
            <span className="truncate">{merchant.website}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Link to={`/admin/merchants/${merchant.id}`}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold hover:bg-indigo-100 active:scale-[0.97] transition-all">
            <Eye className="w-3.5 h-3.5" /> Details
          </Link>
          <Link to={`/admin/merchants/${merchant.id}?tab=balance`}
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
          <span className="text-xs text-slate-400 font-mono">{merchant.id?.slice(0, 8)}</span>
        </div>
      </div>
    </div>
  );
});

export default MerchantCard;
