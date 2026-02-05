import React, { useState } from 'react';
import {
  X, RefreshCw, CheckCircle, Upload, Paperclip,
} from 'lucide-react';

export default function ProcessModal({ payout, onClose, onComplete, isUploading, uploadProgress }) {
  const [utrId,      setUtrId]      = useState('');
  const [proofFile,  setProofFile]  = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (file) { setProofFile(file); setPreviewUrl(URL.createObjectURL(file)); }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:w-full sm:max-w-md bg-white shadow-2xl sm:rounded-2xl rounded-t-2xl overflow-hidden mt-auto sm:mt-0 max-h-[90vh] flex flex-col">
        {/* handle */}
        <div className="sm:hidden flex justify-center pt-2 pb-1"><div className="w-10 h-1 bg-slate-300 rounded-full" /></div>
        {/* header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900">Complete Payout</h3>
            <p className="text-xs text-slate-500">₹{(payout.amount || 0).toLocaleString()}</p>
          </div>
          <button onClick={onClose} disabled={isUploading} className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg disabled:opacity-40">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* payment details summary */}
          <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">User ID</p>
              <p className="text-xs font-bold text-slate-800 truncate ml-2" style={{ fontFamily: 'var(--font-mono)' }}>{payout.userId || '—'}</p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">Account</p>
              <p className="text-xs font-bold text-slate-800 truncate ml-2" style={{ fontFamily: 'var(--font-mono)' }}>{payout.accountNumber || payout.upiId || '—'}</p>
            </div>
          </div>

          {/* UTR input */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">UTR / Reference *</label>
            <input type="text" value={utrId} onChange={e => setUtrId(e.target.value)} disabled={isUploading}
              placeholder="Enter transaction reference"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
              style={{ fontFamily: 'var(--font-mono)' }} />
          </div>

          {/* proof upload */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Proof Screenshot *</label>
            {previewUrl ? (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <img src={previewUrl} alt="Preview" className="w-full max-h-48 object-contain bg-slate-50" />
                <div className="px-3 py-2 border-t border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-blue-600" />
                    <span className="text-xs font-semibold text-slate-700 truncate">{proofFile?.name}</span>
                  </div>
                  <button onClick={() => { setProofFile(null); setPreviewUrl(null); }} disabled={isUploading}
                    className="text-xs text-red-500 font-semibold hover:text-red-700 disabled:opacity-40">Remove</button>
                </div>
              </div>
            ) : (
              <label htmlFor="process-proof"
                className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-xl p-4 cursor-pointer hover:border-green-400 transition-colors">
                <Upload className="w-6 h-6 text-slate-400" />
                <p className="text-sm font-semibold text-slate-600">Tap to upload</p>
                <p className="text-xs text-slate-400">JPG / PNG · Max 5 MB</p>
                <input type="file" accept="image/*" onChange={handleFile} disabled={isUploading} className="hidden" id="process-proof" />
              </label>
            )}
          </div>

          {/* upload progress */}
          {isUploading && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-bold text-blue-800">Uploading…</p>
                <p className="text-xs font-bold text-blue-800">{uploadProgress}%</p>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-1.5">
                <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="px-4 py-3 border-t border-slate-100 flex gap-2.5">
          <button onClick={onClose} disabled={isUploading}
            className="flex-1 py-2.5 border border-slate-300 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40">Cancel</button>
          <button onClick={() => onComplete(utrId, proofFile)} disabled={!utrId || !proofFile || isUploading}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-bold disabled:opacity-40 active:scale-[0.97]">
            {isUploading
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Processing…</>
              : <><CheckCircle className="w-4 h-4" /> Complete</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
