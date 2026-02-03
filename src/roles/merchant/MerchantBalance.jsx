import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import {
  collection, query, where, getDocs, addDoc, onSnapshot, serverTimestamp, orderBy, limit,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import {
  Wallet, TrendingUp, TrendingDown, Download, RefreshCw, CheckCircle,
  AlertCircle, Clock, Lock, Plus, Building, ArrowDown, History, Shield,
} from 'lucide-react';

/* ─── Transaction Ledger Row ─── */
function LedgerRow({ tx }) {
  const isCredit = tx.type === 'payin' || tx.type === 'refund';
  
  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0">
      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${isCredit ? 'bg-green-100' : 'bg-red-100'}`}>
        {isCredit ? <TrendingUp className="text-green-600" size={16} /> : <TrendingDown className="text-red-600" size={16} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-900 text-sm capitalize">{tx.type}</p>
        <p className="text-xs text-slate-400 truncate">{tx.description || 'N/A'}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={`font-bold text-sm ${isCredit ? 'text-green-600' : 'text-red-600'}`}>
          {isCredit ? '+' : '−'}₹{tx.amount?.toLocaleString()}
        </p>
        <p className="text-xs text-slate-400">
          {new Date((tx.timestamp?.seconds || 0) * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
        </p>
      </div>
    </div>
  );
}

/* ─── Settlement Request Modal ─── */
function SettlementModal({ onClose, onSubmit, availableBalance }) {
  const [amount, setAmount] = useState('');
  const [usdtAddress, setUsdtAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!amount || Number(amount) <= 0) { alert('Enter valid amount'); return; }
    if (Number(amount) > availableBalance) { 
      alert(`Insufficient balance. Maximum you can withdraw: ₹${availableBalance.toLocaleString()}`); 
      return; 
    }
    if (Number(amount) < 100) {
      alert('Minimum settlement amount is ₹100');
      return;
    }
    if (!usdtAddress || usdtAddress.length !== 34 || !usdtAddress.startsWith('T')) {
      alert('Invalid USDT TRC20 address (must start with T and be 34 characters)');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({ amount: Number(amount), usdtAddress });
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
          <h3 className="text-base font-bold text-slate-900">Request Settlement</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg">
            <AlertCircle className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
            <p className="text-xs text-green-600 mb-0.5">Available Balance</p>
            <p className="text-2xl font-bold text-green-900">₹{availableBalance.toLocaleString()}</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Amount *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-semibold">₹</span>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0"
                className="w-full pl-8 pr-3 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400 font-bold"
              />
            </div>
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
            <p className="text-blue-800">Settlements are processed within 24 hours. USDT will be sent to your TRC20 wallet address. Network fees may apply.</p>
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
    available: 0,
    pending: 0,
    reserved: 0,
    totalPayinRevenue: 0,
    totalPayinCommission: 0,
    totalPayoutAmount: 0,
    totalPayoutCommission: 0,
    netBalance: 0,
  });
  const [ledger, setLedger] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState('ledger');

  useEffect(() => {
    const user = getAuth().currentUser;
    if (!user) return;

    const fetchData = async () => {
      try {
        // Fetch merchant data
        const merchantSnap = await getDocs(query(collection(db, 'merchants'), where('uid', '==', user.uid)));
        if (!merchantSnap.empty) {
          const data = merchantSnap.docs[0].data();
          
          // Calculate balance from transactions
          const payinCommissionRate = data.payinCommissionRate || 0.06; // 6% default
          const payoutCommissionRate = data.payoutCommissionRate || 0.02; // 2% default
          
          // Fetch all completed payins
          const payinsSnap = await getDocs(
            query(collection(db, 'payin'), 
              where('merchantId', '==', user.uid),
              where('status', '==', 'completed'))
          );
          
          let totalPayinRevenue = 0;
          let totalPayinCommission = 0;
          
          payinsSnap.forEach(doc => {
            const amount = Number(doc.data().amount || 0);
            const commission = amount * payinCommissionRate;
            totalPayinRevenue += (amount - commission); // Merchant gets amount - commission
            totalPayinCommission += commission;
          });
          
          // Fetch all completed/processing payouts
          const payoutsSnap = await getDocs(
            query(collection(db, 'payouts'), 
              where('createdBy', '==', user.uid),
              where('status', 'in', ['completed', 'processing', 'queued']))
          );
          
          let totalPayoutAmount = 0;
          let totalPayoutCommission = 0;
          
          payoutsSnap.forEach(doc => {
            const amount = Number(doc.data().amount || 0);
            const commission = amount * payoutCommissionRate;
            totalPayoutAmount += amount;
            totalPayoutCommission += commission;
          });
          
          // Calculate net balance
          // Positive = We owe merchant (they can withdraw)
          // Negative = Merchant owes us (they need to add funds)
          const netBalance = totalPayinRevenue - (totalPayoutAmount + totalPayoutCommission);
          
          setBalance({
            available: Math.max(0, netBalance), // Only show positive as available
            pending: data.pendingSettlement || 0,
            reserved: data.reservedAmount || 0,
            totalPayinRevenue,
            totalPayinCommission,
            totalPayoutAmount,
            totalPayoutCommission,
            netBalance,
          });
        }
      } catch (e) {
        console.error(e);
      }
    };

    fetchData();

    // Listen to ledger
    const unsubLedger = onSnapshot(
      query(collection(db, 'merchantLedger'), where('merchantId', '==', user.uid), orderBy('timestamp', 'desc'), limit(50)),
      snap => {
        const list = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        setLedger(list);
        setLoading(false);
      }
    );

    // Listen to settlements
    const unsubSettlements = onSnapshot(
      query(collection(db, 'merchantSettlements'), where('merchantId', '==', user.uid), orderBy('createdAt', 'desc'), limit(20)),
      snap => {
        const list = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        setSettlements(list);
      }
    );

    return () => { unsubLedger(); unsubSettlements(); };
  }, []);

  const handleSettlementRequest = async (data) => {
    const user = getAuth().currentUser;
    if (!user) return;

    await addDoc(collection(db, 'merchantSettlements'), {
      merchantId: user.uid,
      amount: data.amount,
      usdtAddress: data.usdtAddress,
      network: 'TRC20',
      status: 'pending',
      createdAt: serverTimestamp(),
    });

    setShowModal(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <RefreshCw className="w-10 h-10 text-green-500 animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm font-medium">Loading balance…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Desktop header */}
      <div className="hidden sm:flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-sm">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            Balance
          </h1>
          <p className="text-slate-500 text-sm mt-0.5 ml-11">Wallet & settlements</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          disabled={balance.netBalance <= 0}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
          <Plus className="w-4 h-4" /> Request Settlement
        </button>
      </div>

      {/* Mobile request button */}
      <div className="flex sm:hidden justify-end">
        <button 
          onClick={() => setShowModal(true)}
          disabled={balance.netBalance <= 0}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 text-sm font-semibold active:scale-[0.96] disabled:opacity-40 disabled:cursor-not-allowed">
          <Plus className="w-4 h-4" /> Settlement
        </button>
      </div>

      {/* Hero Balance Card */}
      <div className={`rounded-2xl p-4 sm:p-5 text-white shadow-lg ${
        balance.netBalance >= 0 
          ? 'bg-gradient-to-br from-green-600 to-emerald-600' 
          : 'bg-gradient-to-br from-red-600 to-rose-600'
      }`}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className={`text-xs font-semibold uppercase tracking-wide mb-0.5 ${
              balance.netBalance >= 0 ? 'text-green-200' : 'text-red-200'
            }`}>
              {balance.netBalance >= 0 ? 'Available to Withdraw' : 'Amount You Owe'}
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              ₹{Math.abs(balance.netBalance).toLocaleString()}
            </h2>
            {balance.netBalance < 0 && (
              <p className="text-xs text-red-100 mt-1">You need to add funds before processing payouts</p>
            )}
          </div>
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
            balance.netBalance >= 0 ? 'bg-white/20' : 'bg-white/15'
          }`}>
            <Wallet className="w-6 h-6" />
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex-1 bg-white/10 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-300" />
              <span className={`text-xs font-medium ${
                balance.netBalance >= 0 ? 'text-green-200' : 'text-red-200'
              }`}>Payin Credit</span>
            </div>
            <p className="text-lg font-bold text-white">₹{balance.totalPayinRevenue.toLocaleString()}</p>
            <p className="text-xs opacity-75">After {((balance.totalPayinCommission / (balance.totalPayinRevenue + balance.totalPayinCommission)) * 100 || 0).toFixed(1)}% commission</p>
          </div>
          <div className="flex-1 bg-white/10 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingDown className="w-3.5 h-3.5 text-rose-300" />
              <span className={`text-xs font-medium ${
                balance.netBalance >= 0 ? 'text-green-200' : 'text-red-200'
              }`}>Payout Debit</span>
            </div>
            <p className="text-lg font-bold text-white">₹{(balance.totalPayoutAmount + balance.totalPayoutCommission).toLocaleString()}</p>
            <p className="text-xs opacity-75">Inc. ₹{balance.totalPayoutCommission.toLocaleString()} commission</p>
          </div>
        </div>
      </div>

      {/* Balance Breakdown */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-bold text-slate-900 mb-3">Balance Breakdown</h3>
        
        <div className="flex items-center justify-between py-2 border-b border-slate-100">
          <span className="text-sm text-slate-600">Total Payin Revenue</span>
          <span className="text-sm font-bold text-green-600">+₹{(balance.totalPayinRevenue + balance.totalPayinCommission).toLocaleString()}</span>
        </div>
        
        <div className="flex items-center justify-between py-2 border-b border-slate-100 pl-4">
          <span className="text-xs text-slate-500">Platform Commission (Payin)</span>
          <span className="text-xs font-semibold text-slate-600">-₹{balance.totalPayinCommission.toLocaleString()}</span>
        </div>
        
        <div className="flex items-center justify-between py-2 border-b border-slate-100 pl-4">
          <span className="text-sm text-slate-700 font-medium">You Received (Payin)</span>
          <span className="text-sm font-bold text-green-700">₹{balance.totalPayinRevenue.toLocaleString()}</span>
        </div>
        
        <div className="flex items-center justify-between py-2 border-b border-slate-100">
          <span className="text-sm text-slate-600">Total Payout Processed</span>
          <span className="text-sm font-bold text-red-600">-₹{balance.totalPayoutAmount.toLocaleString()}</span>
        </div>
        
        <div className="flex items-center justify-between py-2 border-b border-slate-100 pl-4">
          <span className="text-xs text-slate-500">Platform Commission (Payout)</span>
          <span className="text-xs font-semibold text-slate-600">-₹{balance.totalPayoutCommission.toLocaleString()}</span>
        </div>
        
        <div className="flex items-center justify-between py-3 bg-slate-50 -mx-4 px-4 rounded-lg mt-3">
          <span className="text-base font-bold text-slate-900">Net Balance</span>
          <span className={`text-lg font-bold ${
            balance.netBalance >= 0 ? 'text-green-600' : 'text-red-600'
          }`}>
            {balance.netBalance >= 0 ? '+' : ''}₹{balance.netBalance.toLocaleString()}
          </span>
        </div>
        
        {balance.netBalance < 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2 mt-3">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-red-800">
              <p className="font-bold mb-1">Negative Balance</p>
              <p>You need to add ₹{Math.abs(balance.netBalance).toLocaleString()} to cover payout costs and commissions.</p>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        {[
          { key: 'ledger', label: 'Ledger', icon: History },
          { key: 'settlements', label: 'Settlements', icon: ArrowDown },
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                activeTab === tab.key ? 'bg-white text-green-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              <Icon className="w-4 h-4" />{tab.label}
            </button>
          );
        })}
      </div>

      {/* Ledger Tab */}
      {activeTab === 'ledger' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Transaction Ledger</h3>
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold hover:bg-blue-100">
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          </div>
          <div className="px-4 py-1 max-h-96 overflow-y-auto">
            {ledger.length > 0 ? (
              ledger.map(tx => <LedgerRow key={tx.id} tx={tx} />)
            ) : (
              <div className="text-center py-10">
                <History className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                <p className="text-slate-500 text-sm font-medium">No transactions yet</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Settlements Tab */}
      {activeTab === 'settlements' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900">Settlement History</h3>
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
                      <p className="font-semibold text-slate-900 text-sm">₹{s.amount?.toLocaleString()}</p>
                      <p className="text-xs text-slate-400">
                        {new Date((s.createdAt?.seconds || 0) * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold capitalize ${
                    s.status === 'completed' ? 'bg-green-100 text-green-700' :
                    s.status === 'failed' ? 'bg-red-100 text-red-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>{s.status}</span>
                </div>
              ))
            ) : (
              <div className="text-center py-10">
                <ArrowDown className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                <p className="text-slate-500 text-sm font-medium">No settlements yet</p>
              </div>
            )}
          </div>
        </div>
      )}

      {showModal && balance.netBalance > 0 && (
        <SettlementModal
          onClose={() => setShowModal(false)}
          onSubmit={handleSettlementRequest}
          availableBalance={balance.netBalance}
        />
      )}
    </div>
  );
}