import React, { useEffect, useState } from 'react';
import { supabase } from '../../../../supabase';
import {
  CheckCircle, XCircle, X, Upload, Send, Paperclip,
} from 'lucide-react';

export default function ConversationModal({ dispute, onClose, onSubmit }) {
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [proofFile, setProofFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [action, setAction] = useState('');
  const [finalNote, setFinalNote] = useState('');
  const [showFinalDecision, setShowFinalDecision] = useState(false);
  const isPayin = dispute.type === 'payin';
  const canRespond = dispute.status === 'pending' || dispute.status === 'routed_to_trader';

  // Load messages
  useEffect(() => {
    if (!dispute) return;
    const fetchMessages = async () => {
      const { data } = await supabase
        .from('dispute_messages')
        .select('*')
        .eq('dispute_id', dispute.id)
        .order('timestamp', { ascending: true });
      const list = (data || []).map(m => ({
        ...m,
        from: m.sender || m.from || m.sender_role, // Normalize sender field
        text: m.message,
        disputeId: m.dispute_id,
        readByTrader: m.read_by_trader,
        readByMerchant: m.read_by_merchant,
        isDecision: m.is_decision,
        proofUrl: m.proof_url,
        timestamp: m.created_at ? { seconds: new Date(m.created_at).getTime() / 1000 } : (m.timestamp ? { seconds: new Date(m.timestamp).getTime() / 1000 } : null),
      }));
      setMessages(list);
      // Mark unread messages as read (use normalized 'from' field)
      const unread = list.filter(m => m.from !== 'trader' && !m.readByTrader);
      for (const msg of unread) {
        await supabase.from('dispute_messages').update({
          read_by_trader: true, read_by_trader_at: new Date().toISOString(),
        }).eq('id', msg.id);
      }
    };
    fetchMessages();
  }, [dispute]);

  const handleSendMessage = async () => {
    if (!messageText.trim()) return;
    const ts = new Date().toISOString();
    try {
      const { error } = await supabase.from('dispute_messages').insert({
        dispute_id: dispute.id,
        sender: 'trader',
        sender_id: dispute.trader_id,
        message: messageText,
        read_by_merchant: false,
        read_by_trader: true,
      });
      if (error) throw error;
      
      await supabase.from('disputes').update({
        message_count: (dispute.message_count || 0) + 1,
        last_message_at: ts,
        last_message_from: 'trader',
      }).eq('id', dispute.id);
      setMessages(prev => [...prev, { from: 'trader', message: messageText, timestamp: { seconds: new Date(ts).getTime() / 1000 } }]);
      setMessageText('');
    } catch (e) {
      console.error('Send message error:', e);
      alert('Error: ' + e.message);
    }
  };

  const handleFinalDecision = async () => {
    if (!action) { alert('Please select Accept or Reject'); return; }
    if (!finalNote.trim()) { alert('Please provide a note'); return; }
    if (action === 'reject' && !proofFile) { alert('Please upload proof for rejection'); return; }
    
    setUploading(true);
    try {
      let proofUrl = null;
      if (proofFile) {
        const filename = `${dispute.id}/${Date.now()}_${proofFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
        const { error: upErr } = await supabase.storage.from('dispute-proofs').upload(filename, proofFile);
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from('dispute-proofs').getPublicUrl(filename);
        proofUrl = urlData.publicUrl;
      }

      // Add final decision message
      const { error: msgError } = await supabase.from('dispute_messages').insert({
        dispute_id: dispute.id,
        sender: 'trader',
        sender_id: dispute.trader_id,
        message: `**FINAL DECISION: ${action.toUpperCase()}**\n\n${finalNote}`,
        is_decision: true,
        action,
        proof_url: proofUrl,
        read_by_merchant: false,
        read_by_trader: true,
      });
      if (msgError) throw msgError;

      await onSubmit({ action, note: finalNote, proofUrl });
      onClose();
    } catch (e) {
      alert('Error: ' + e.message);
    }
    setUploading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-2xl bg-white shadow-2xl rounded-t-2xl sm:rounded-2xl overflow-hidden mt-auto sm:mt-0 max-h-[90vh] flex flex-col">
        {/* Handle */}
        <div className="sm:hidden flex justify-center pt-2 pb-1"><div className="w-10 h-1 bg-slate-300 rounded-full" /></div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900">Dispute Conversation</h3>
            <p className="text-xs text-slate-400" style={{ fontFamily: 'var(--font-mono)' }}>
              {isPayin ? (dispute.upi_id || '-') : (dispute.order_id || '-')}
              {(dispute.utr || dispute.transaction_id) && <span className="ml-2 text-slate-500">UTR: {dispute.utr || dispute.transaction_id}</span>}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg">
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        {/* Summary */}
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
          <div className="flex justify-between items-center" style={{ gap: 12 }}>
            <div className="min-w-0">
              <p className="text-xs text-slate-500">Dispute Type: <span className="font-bold capitalize">{dispute.type}</span></p>
              <p className="text-xs text-slate-500 mt-0.5">Status: <span className={`font-bold ${dispute.status === 'pending' || dispute.status === 'routed_to_trader' ? 'text-amber-600' : dispute.status === 'approved' || dispute.status === 'trader_accepted' ? 'text-green-600' : 'text-red-600'}`}>{dispute.status?.toUpperCase()}</span></p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs text-slate-400">Amount</p>
              <p className="text-lg font-bold text-green-700">₹{(dispute.amount || 0).toLocaleString()}</p>
            </div>
          </div>
          {/* Key details */}
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            {dispute.upi_id && (
              <div className="p-2 bg-white rounded-lg border border-slate-200">
                <p className="text-slate-400">UPI ID</p>
                <p className="font-mono font-bold text-slate-800 truncate">{dispute.upi_id}</p>
              </div>
            )}
            {(dispute.utr || dispute.transaction_id) && (
              <div className="p-2 bg-white rounded-lg border border-slate-200">
                <p className="text-slate-400">UTR</p>
                <p className="font-mono font-bold text-slate-800 truncate">{dispute.utr || dispute.transaction_id}</p>
              </div>
            )}
            {dispute.order_id && (
              <div className="p-2 bg-white rounded-lg border border-slate-200">
                <p className="text-slate-400">Order ID</p>
                <p className="font-mono font-bold text-slate-800 truncate">{dispute.order_id}</p>
              </div>
            )}
            {dispute.txn_id && (
              <div className="p-2 bg-white rounded-lg border border-slate-200">
                <p className="text-slate-400">Txn ID</p>
                <p className="font-mono font-bold text-slate-800 truncate">{dispute.txn_id}</p>
              </div>
            )}
          </div>
          {dispute.reason && (
            <div className="mt-2 p-2 bg-white rounded-lg border border-slate-200">
              <p className="text-xs text-slate-500 font-semibold">Original Complaint:</p>
              <p className="text-xs text-slate-700 mt-0.5 italic">"{dispute.reason}"</p>
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 max-h-96">
          {messages.length > 0 ? (
            messages.map(msg => (
              <div key={msg.id} className={`p-3 rounded-lg ${
                msg.from === 'trader' 
                  ? msg.isDecision 
                    ? 'bg-amber-100 border-2 border-amber-400' 
                    : 'bg-blue-50 border border-blue-200 ml-8'
                  : 'bg-slate-50 border border-slate-200 mr-8'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-bold ${msg.isDecision ? 'text-amber-900' : msg.from === 'trader' ? 'text-blue-900' : 'text-slate-900'}`}>
                    {msg.from === 'trader' ? '🛡️ You (Trader)' : '🏪 Merchant'}
                  </span>
                  <span className="text-xs text-slate-400">
                    {new Date((msg.timestamp?.seconds || 0) * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-sm text-slate-800 whitespace-pre-wrap">{msg.message || msg.text}</p>
                {msg.proofUrl && (
                  <a href={msg.proofUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-2 text-xs text-blue-600 hover:underline">
                    <Paperclip size={12} /> View Proof
                  </a>
                )}
              </div>
            ))
          ) : (
            <p className="text-center text-sm text-slate-500 py-4">No messages yet. Start the conversation!</p>
          )}
        </div>

        {/* Actions */}
        {canRespond ? (
          showFinalDecision ? (
            /* Final Decision Form */
            <div className="px-4 py-3 border-t border-slate-100 space-y-3 bg-amber-50">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-amber-900">Final Decision</h4>
                <button onClick={() => setShowFinalDecision(false)} className="text-xs text-slate-600 hover:text-slate-900">
                  Back to chat
                </button>
              </div>

              {/* Decision buttons */}
              <div className="flex gap-2">
                <button onClick={() => setAction('accept')}
                  className={`flex-1 p-3 rounded-xl border-2 transition-all text-center ${action === 'accept' ? 'border-green-500 bg-green-50' : 'border-slate-200 hover:border-green-300 bg-white'}`}>
                  <CheckCircle className={`w-5 h-5 mx-auto mb-1 ${action === 'accept' ? 'text-green-600' : 'text-slate-300'}`} />
                  <p className={`text-xs font-bold ${action === 'accept' ? 'text-green-800' : 'text-slate-500'}`}>Accept</p>
                </button>
                <button onClick={() => setAction('reject')}
                  className={`flex-1 p-3 rounded-xl border-2 transition-all text-center ${action === 'reject' ? 'border-red-500 bg-red-50' : 'border-slate-200 hover:border-red-300 bg-white'}`}>
                  <XCircle className={`w-5 h-5 mx-auto mb-1 ${action === 'reject' ? 'text-red-600' : 'text-slate-300'}`} />
                  <p className={`text-xs font-bold ${action === 'reject' ? 'text-red-800' : 'text-slate-500'}`}>Reject</p>
                </button>
              </div>

              {/* Note */}
              <textarea value={finalNote} onChange={e => setFinalNote(e.target.value)} rows={2}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                placeholder="Final decision note…" />

              {/* Proof upload (reject only) */}
              {action === 'reject' && (
                <div>
                  <label htmlFor="proof-final"
                    className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-xl p-3 cursor-pointer hover:border-amber-400 transition-colors">
                    <Upload className="w-4 h-4 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-600">Upload Proof (Required)</span>
                    <input type="file" accept="image/*" onChange={e => setProofFile(e.target.files[0])} className="hidden" id="proof-final" />
                  </label>
                  {proofFile && (
                    <div className="mt-2 px-3 py-2 bg-blue-50 rounded-lg text-xs text-blue-800 font-semibold flex items-center gap-2 border border-blue-200">
                      <Paperclip size={14} /> {proofFile.name}
                      <button onClick={() => setProofFile(null)} className="ml-auto text-blue-400 hover:text-blue-600"><X size={14} /></button>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => setShowFinalDecision(false)}
                  className="flex-1 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50">
                  Cancel
                </button>
                <button onClick={handleFinalDecision}
                  disabled={uploading || !action || !finalNote.trim() || (action === 'reject' && !proofFile)}
                  className="flex-1 py-2 bg-amber-500 text-white rounded-xl text-xs font-bold disabled:opacity-40">
                  {uploading ? 'Submitting…' : 'Submit Decision'}
                </button>
              </div>
            </div>
          ) : (
            /* Chat Input */
            <div className="px-4 py-3 border-t border-slate-100 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={messageText}
                  onChange={e => setMessageText(e.target.value)}
                  placeholder="Type your message…"
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  onKeyPress={e => e.key === 'Enter' && handleSendMessage()}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!messageText.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={() => setShowFinalDecision(true)}
                className="w-full py-2 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600 flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                Make Final Decision
              </button>
            </div>
          )
        ) : (
          <div className="px-4 py-3 border-t border-slate-100 bg-slate-50">
            <p className="text-center text-sm text-slate-600">
              Dispute {dispute.status === 'approved' ? 'accepted' : 'rejected'}. Conversation is closed.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
