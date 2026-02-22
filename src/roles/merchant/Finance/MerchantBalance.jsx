import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabase';
import { logMerchantActivity, MERCHANT_ACTIONS } from '../../../utils/merchantActivityLogger';
import {
  TrendingUp, TrendingDown, Download, CheckCircle,
  AlertCircle, Clock, Building, ArrowDown, History, Shield, X, DollarSign,
} from 'lucide-react';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';

const MIN_USDT_WITHDRAWAL = 500;

/* ─── Transaction Ledger Row ─── */
function LedgerRow({ tx }) {
  // In balance_history: positive amount = credit, negative = debit
  const isCredit = Number(tx.amount) > 0;
  const displayAmount = Math.abs(Number(tx.amount) || 0);
  const usdtAmount = tx.amount_usdt ? Math.abs(Number(tx.amount_usdt)) : null;
  const usdtRate = tx.usdt_rate ? Number(tx.usdt_rate) : null;
  
  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0">
      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${isCredit ? 'bg-green-100' : 'bg-red-100'}`}>
        {isCredit ? <TrendingUp className="text-green-600" size={16} /> : <TrendingDown className="text-red-600" size={16} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-900 text-sm capitalize">{tx.reason?.replace(/_/g, ' ') || tx.type || 'Transaction'}</p>
        <p className="text-xs text-slate-400 truncate">{tx.note || tx.description || '—'}</p>
        {usdtRate && (
          <p className="text-xs text-blue-500 font-medium">@ ₹{usdtRate.toFixed(2)}/USDT</p>
        )}
      </div>
      <div className="text-right flex-shrink-0">
        {usdtAmount ? (
          <>
            <p className={`font-bold text-sm ${isCredit ? 'text-green-600' : 'text-red-600'}`}>
              {isCredit ? '+' : '−'}${usdtAmount.toFixed(2)}
            </p>
            <p className="text-xs text-slate-400">
              {isCredit ? '+' : '−'}₹{displayAmount.toLocaleString()}
            </p>
          </>
        ) : (
          <p className={`font-bold text-sm ${isCredit ? 'text-green-600' : 'text-red-600'}`}>
            {isCredit ? '+' : '−'}₹{displayAmount.toLocaleString()}
          </p>
        )}
        <p className="text-xs text-slate-400">
          {tx.created_at ? new Date(tx.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}
        </p>
      </div>
    </div>
  );
}

/* ─── Settlement Request Modal ─── */
function SettlementModal({ onClose, onSubmit, usdtBalance }) {
  const [amount, setAmount] = useState('');
  const [usdtAddress, setUsdtAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const amountNum = Number(amount) || 0;

  const handleSubmit = async () => {
    if (!amount || amountNum <= 0) { alert('Enter valid amount'); return; }
    if (amountNum < MIN_USDT_WITHDRAWAL) {
      alert(`Minimum settlement amount is $${MIN_USDT_WITHDRAWAL} USDT`);
      return;
    }
    if (amountNum > usdtBalance) { 
      alert(`Insufficient balance. Maximum you can withdraw: $${usdtBalance.toFixed(2)} USDT`); 
      return; 
    }
    if (!usdtAddress || usdtAddress.length !== 34 || !usdtAddress.startsWith('T')) {
      alert('Invalid USDT TRC20 address (must start with T and be 34 characters)');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({ amount: amountNum, usdtAddress });
      onClose();
    } catch (e) {
      alert('Error: ' + e.message);
    }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white shadow-2xl rounded-t-2xl sm:rounded-2xl overflow-hidden mt-auto sm:mt-0 max-h-[90vh] flex flex-col">
        <div className="sm:hidden flex justify-center pt-2 pb-1"><div className="w-10 h-1 bg-slate-300 rounded-full" /></div>

        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-900">Withdraw USDT</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div className="bg-gradient-to-r from-blue-50 to-green-50 border border-blue-200 rounded-xl p-4 text-center">
            <p className="text-xs text-blue-600 mb-0.5">Available USDT</p>
            <p className="text-3xl font-bold text-blue-700">${usdtBalance.toFixed(2)}</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Amount (USDT) *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-semibold">$</span>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0"
                min={MIN_USDT_WITHDRAWAL}
                max={usdtBalance}
                step="0.01"
                className="w-full pl-8 pr-3 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 font-bold"
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">Minimum: ${MIN_USDT_WITHDRAWAL} USDT</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide flex items-center gap-1">
              <Building className="w-3.5 h-3.5" /> USDT TRC20 Wallet Address *
            </label>
            <input
              type="text"
              value={usdtAddress}
              onChange={e => setUsdtAddress(e.target.value.trim())}
              placeholder="TXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full px-3 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400 font-mono"
              style={{ fontFamily: 'var(--font-mono)' }}
              maxLength={34}
            />
            <p className="text-xs text-slate-500 mt-1.5">Tron (TRC20) network only. Double-check before submitting.</p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2 text-xs">
            <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-blue-800">
              <p className="font-semibold mb-1">Withdrawal Policy:</p>
              <ul className="space-y-0.5 text-xs list-disc list-inside">
                <li>Minimum withdrawal: ${MIN_USDT_WITHDRAWAL} USDT</li>
                <li>Processed within 24 hours</li>
                <li>USDT sent to TRC20 wallet</li>
                <li>Network fees may apply</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-slate-100 flex gap-2.5">
          <button onClick={onClose} className="flex-1 py-3 border border-slate-300 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={submitting}
            className="flex-1 py-3 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 active:scale-[0.97] disabled:opacity-40">
            {submitting ? 'Processing…' : 'Request Settlement'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MerchantBalance() {
  const [balance, setBalance] = useState({
    usdtBalance: 0, // Accumulated USDT from transactions
  });
  const [ledger, setLedger] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState('ledger');
  const [ledgerFilter, setLedgerFilter] = useState('all'); // 'all' | 'credit' | 'debit'

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      try {
        // Get merchant by profile_id (auth user id)
        const { data: mData } = await supabase
          .from('merchants')
          .select('id, usdt_balance')
          .eq('profile_id', user.id)
          .single();
        
        if (mData) {
          const merchantId = mData.id;
          
          setBalance({
            usdtBalance: Number(mData.usdt_balance) || 0,
          });

          // Ledger - using balance_history table
          const { data: ledgerData } = await supabase
            .from('balance_history')
            .select('*')
            .eq('entity_type', 'merchant')
            .eq('entity_id', merchantId)
            .order('created_at', { ascending: false })
            .limit(50);
          setLedger(ledgerData || []);

          // Settlements
          const { data: settData } = await supabase
            .from('merchant_settlements')
            .select('*')
            .eq('merchant_id', merchantId)
            .order('created_at', { ascending: false })
            .limit(20);
          setSettlements((settData || []).map(s => ({ 
            ...s, 
            createdAt: s.created_at ? { seconds: new Date(s.created_at).getTime() / 1000 } : null, 
            usdtAddress: s.usdt_address 
          })));
        }
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  const handleSettlementRequest = async (data) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    // Get merchant ID and current USDT balance
    const { data: merchant } = await supabase
      .from('merchants')
      .select('id, usdt_balance')
      .eq('profile_id', user.id)
      .single();
    if (!merchant) return;
    
    const amount = Number(data.amount); // USDT amount
    
    // Check USDT balance
    if (amount > (merchant.usdt_balance || 0)) {
      alert('Insufficient USDT balance');
      return;
    }
    
    // Deduct USDT from balance
    const currentUsdtBalance = merchant.usdt_balance || 0;
    const newUsdtBalance = currentUsdtBalance - amount;
    
    // Update merchant USDT balance
    const { error: updateError } = await supabase
      .from('merchants')
      .update({ 
        usdt_balance: newUsdtBalance,
        updated_at: new Date().toISOString()
      })
      .eq('id', merchant.id);
    
    if (updateError) {
      alert('Error reserving balance: ' + updateError.message);
      return;
    }
    
    // Create settlement request (amount is in USDT)
    const { error: insertError } = await supabase.from('merchant_settlements').insert({
      merchant_id: merchant.id,
      amount: amount, // USDT amount
      usdt_address: data.usdtAddress,
      network: 'TRC20',
      status: 'pending',
    });
    
    if (insertError) {
      // Rollback the balance change
      await supabase
        .from('merchants')
        .update({ 
          usdt_balance: currentUsdtBalance,
          updated_at: new Date().toISOString()
        })
        .eq('id', merchant.id);
      alert('Error creating withdrawal: ' + insertError.message);
      return;
    }
    
    // Update local state
    setBalance(prev => ({
      ...prev,
      usdtBalance: newUsdtBalance,
    }));
    
    // Refresh settlements list
    const { data: settData } = await supabase
      .from('merchant_settlements')
      .select('*')
      .eq('merchant_id', merchant.id)
      .order('created_at', { ascending: false })
      .limit(20);
    setSettlements((settData || []).map(s => ({ 
      ...s, 
      createdAt: s.created_at ? { seconds: new Date(s.created_at).getTime() / 1000 } : null,
      usdtAddress: s.usdt_address 
    })));
    
    // Log activity
    await logMerchantActivity(MERCHANT_ACTIONS.SETTLEMENT_REQUESTED, {
      entityType: 'settlement',
      details: {
        amount_usdt: amount,
        usdt_address: data.usdtAddress,
        network: 'TRC20',
      }
    });
    
    setShowModal(false);
    alert(`Withdrawal of $${amount} USDT submitted!`);
  };

  if (loading) {
    return <LoadingSpinner message="Loading balance…" color="purple" />;
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Desktop header */}
      <div className="hidden sm:flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg shadow-blue-500/20">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
            USDT Balance
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 ml-11">Wallet & withdrawals</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          disabled={balance.usdtBalance < MIN_USDT_WITHDRAWAL}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
          <ArrowDown className="w-4 h-4" /> Withdraw USDT
        </button>
      </div>

      {/* Mobile request button */}
      <div className="flex sm:hidden justify-end">
        <button 
          onClick={() => setShowModal(true)}
          disabled={balance.usdtBalance < MIN_USDT_WITHDRAWAL}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-sm font-semibold active:scale-[0.96] disabled:opacity-40 disabled:cursor-not-allowed">
          <ArrowDown className="w-4 h-4" /> Withdraw
        </button>
      </div>
      
      {/* Minimum balance warning */}
      {balance.usdtBalance > 0 && balance.usdtBalance < MIN_USDT_WITHDRAWAL && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-semibold">Below Minimum Withdrawal</p>
            <p className="text-xs mt-0.5">You need ${(MIN_USDT_WITHDRAWAL - balance.usdtBalance).toFixed(2)} more USDT to reach the minimum withdrawal of ${MIN_USDT_WITHDRAWAL}.</p>
          </div>
        </div>
      )}

      {/* Hero USDT Balance Card */}
      <div className="rounded-2xl p-4 sm:p-5 text-white shadow-lg bg-gradient-to-br from-blue-600 to-indigo-600">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-0.5 text-blue-200">
              Available USDT to Withdraw
            </p>
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight">
              ${balance.usdtBalance.toFixed(2)}
            </h2>
            {balance.usdtBalance < MIN_USDT_WITHDRAWAL && balance.usdtBalance > 0 && (
              <p className="text-xs text-blue-200 mt-1">
                Need ${(MIN_USDT_WITHDRAWAL - balance.usdtBalance).toFixed(2)} more for withdrawal
              </p>
            )}
          </div>
          <div className="w-14 h-14 rounded-full flex items-center justify-center bg-white/20">
            <DollarSign className="w-7 h-7" />
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex-1 bg-white/10 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <DollarSign className="w-3.5 h-3.5 text-green-300" />
              <span className="text-xs font-medium text-blue-200">Min. Withdrawal</span>
            </div>
            <p className="text-lg font-bold text-white">${MIN_USDT_WITHDRAWAL}</p>
            <p className="text-xs opacity-75">USDT TRC20</p>
          </div>
          <div className="flex-1 bg-white/10 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Shield className="w-3.5 h-3.5 text-blue-300" />
              <span className="text-xs font-medium text-blue-200">Network</span>
            </div>
            <p className="text-lg font-bold text-white">TRC20</p>
            <p className="text-xs opacity-75">Tron network</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        {[
          { key: 'ledger', label: 'Transactions', icon: History },
          { key: 'settlements', label: 'Withdrawals', icon: ArrowDown },
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                activeTab === tab.key ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              <Icon className="w-4 h-4" />{tab.label}
            </button>
          );
        })}
      </div>

      {/* Ledger Tab */}
      {activeTab === 'ledger' && (() => {
        // Filter ledger based on selected filter
        const filteredLedger = ledger.filter(tx => {
          if (ledgerFilter === 'all') return true;
          const isCredit = Number(tx.amount) > 0;
          return ledgerFilter === 'credit' ? isCredit : !isCredit;
        });
        
        // Calculate totals
        const creditTotal = ledger.filter(tx => Number(tx.amount) > 0).reduce((sum, tx) => sum + Math.abs(Number(tx.amount_usdt || 0)), 0);
        const debitTotal = ledger.filter(tx => Number(tx.amount) < 0).reduce((sum, tx) => sum + Math.abs(Number(tx.amount_usdt || 0)), 0);
        
        return (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Transaction Ledger</h3>
              <button 
                onClick={() => {
                  if (filteredLedger.length === 0) { alert('No transactions to export'); return; }
                  const csv = [
                    ['Date', 'Type', 'Amount', 'USDT', 'Note'],
                    ...filteredLedger.map(tx => [
                      tx.created_at ? new Date(tx.created_at).toLocaleString() : '',
                      tx.reason || tx.type || '',
                      tx.amount || 0,
                      tx.amount_usdt || '',
                      tx.note || tx.description || '',
                    ])
                  ].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `ledger-${ledgerFilter}-${new Date().toISOString().split('T')[0]}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold hover:bg-blue-100"
              >
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
            </div>
            
            {/* Credit/Debit Filter Tabs */}
            <div className="px-4 py-2 border-b border-slate-100 flex gap-2">
              {[
                { key: 'all', label: 'All', count: ledger.length },
                { key: 'credit', label: 'Credits', count: ledger.filter(tx => Number(tx.amount) > 0).length, color: 'green', total: creditTotal },
                { key: 'debit', label: 'Debits', count: ledger.filter(tx => Number(tx.amount) < 0).length, color: 'red', total: debitTotal },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setLedgerFilter(tab.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    ledgerFilter === tab.key
                      ? tab.color === 'green' ? 'bg-green-100 text-green-700 ring-1 ring-green-200'
                        : tab.color === 'red' ? 'bg-red-100 text-red-700 ring-1 ring-red-200'
                        : 'bg-blue-100 text-blue-700 ring-1 ring-blue-200'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {tab.key === 'credit' && <TrendingUp className="w-3 h-3" />}
                  {tab.key === 'debit' && <TrendingDown className="w-3 h-3" />}
                  {tab.label}
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                    ledgerFilter === tab.key ? 'bg-white/50' : 'bg-slate-200'
                  }`}>
                    {tab.count}
                  </span>
                  {tab.total !== undefined && tab.count > 0 && (
                    <span className="text-[10px] opacity-75">${tab.total.toFixed(0)}</span>
                  )}
                </button>
              ))}
            </div>
            
            <div className="px-4 py-1 max-h-96 overflow-y-auto">
              {filteredLedger.length > 0 ? (
                filteredLedger.map(tx => <LedgerRow key={tx.id} tx={tx} />)
              ) : (
                <div className="text-center py-10">
                  <History className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                  <p className="text-slate-500 text-sm font-medium">
                    {ledgerFilter === 'all' ? 'No transactions yet' : `No ${ledgerFilter}s yet`}
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Withdrawals Tab */}
      {activeTab === 'settlements' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900">Withdrawal History</h3>
          </div>
          <div className="px-4 py-1">
            {settlements.length > 0 ? (
              settlements.map(s => (
                <div key={s.id} className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                      s.status === 'completed' ? 'bg-green-100' : s.status === 'failed' ? 'bg-red-100' : 'bg-yellow-100'
                    }`}>
                      {s.status === 'completed' ? <CheckCircle className="text-green-600" size={16} /> :
                       s.status === 'failed' ? <AlertCircle className="text-red-600" size={16} /> :
                       <Clock className="text-yellow-600" size={16} />}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">${Number(s.amount).toFixed(2)} USDT</p>
                      <p className="text-xs text-slate-400 font-mono truncate max-w-[150px]">{s.usdtAddress}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold capitalize ${
                      s.status === 'completed' ? 'bg-green-100 text-green-700' :
                      s.status === 'failed' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>{s.status}</span>
                    <p className="text-xs text-slate-400 mt-1">
                      {new Date((s.createdAt?.seconds || 0) * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-10">
                <ArrowDown className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                <p className="text-slate-500 text-sm font-medium">No withdrawals yet</p>
              </div>
            )}
          </div>
        </div>
      )}

      {showModal && balance.usdtBalance >= MIN_USDT_WITHDRAWAL && (
        <SettlementModal
          onClose={() => setShowModal(false)}
          onSubmit={handleSettlementRequest}
          usdtBalance={balance.usdtBalance}
        />
      )}
    </div>
  );
}