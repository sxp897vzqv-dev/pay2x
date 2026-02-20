import React, { memo } from 'react';
import { Building, Edit, Trash2 } from 'lucide-react';

const BankAccountCard = memo(function BankAccountCard({ account, onEdit, onDelete, isPrimary, onSetPrimary }) {
  return (
    <div className={`rounded-xl border-2 p-4 ${isPrimary ? 'border-green-300 bg-green-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Building className="w-4 h-4 text-slate-600" />
            <p className="font-bold text-slate-900">{account.bankName}</p>
          </div>
          <p className="text-sm text-slate-600 font-mono" style={{ fontFamily: 'var(--font-mono)' }}>
            ***{account.accountNumber.slice(-4)}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">{account.holderName}</p>
        </div>
        {isPrimary && (
          <span className="px-2 py-0.5 bg-green-600 text-white text-xs font-bold rounded-full">PRIMARY</span>
        )}
      </div>
      <div className="flex gap-2">
        {!isPrimary && (
          <button onClick={onSetPrimary}
            className="flex-1 py-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-xs font-semibold hover:bg-blue-100">
            Set Primary
          </button>
        )}
        <button onClick={onEdit}
          className="flex-1 py-2 bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-100 flex items-center justify-center gap-1">
          <Edit className="w-3 h-3" /> Edit
        </button>
        <button onClick={onDelete}
          className="flex-1 py-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-semibold hover:bg-red-100 flex items-center justify-center gap-1">
          <Trash2 className="w-3 h-3" /> Delete
        </button>
      </div>
    </div>
  );
});

export default BankAccountCard;
