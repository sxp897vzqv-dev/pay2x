import React, { useEffect, useState, useRef } from "react";
import { db } from "../../../firebase";
import {
  collection, query, where, getDocs, doc, onSnapshot, orderBy, limit,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import {
  Wallet, TrendingUp, TrendingDown, RefreshCw, DollarSign,
  Copy, CheckCircle, AlertCircle, Download, History,
  Shield, Lock, ExternalLink, AlertTriangle, Clock, ArrowDown, IndianRupee,
} from "lucide-react";
import QRCode from "react-qr-code";

/* ─── Toast ─── */
function Toast({ msg, success, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div
      className={`fixed left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-50 ${success ? 'bg-green-600' : 'bg-red-600'} text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-medium`}
      /* ✅ FIX: top bar is 56px, toast sits flush below it */
      style={{ top: 60 }}
    >
      {success ? <CheckCircle size={18} className="flex-shrink-0" /> : <AlertCircle size={18} className="flex-shrink-0" />}
      <span>{msg}</span>
    </div>
  );
}

/* ─── Transaction row ─── */
function TransactionItem({ transaction }) {
  const isDeposit = transaction.type === 'deposit' || transaction.type?.includes('topup');
  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0">
      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${isDeposit ? 'bg-green-100' : 'bg-red-100'}`}>
        {isDeposit ? <TrendingUp className="text-green-600" size={16} /> : <TrendingDown className="text-red-600" size={16} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-900 text-sm">
          {isDeposit ? 'Deposit' : transaction.type === 'withdrawal' ? 'Withdrawal' : 'Transaction'}
        </p>
        <p className="text-xs text-slate-400 truncate">
          {new Date(transaction.createdAt?.seconds ? transaction.createdAt.seconds * 1000 : Date.now())
            .toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={`font-bold text-sm ${isDeposit ? 'text-green-600' : 'text-red-600'}`}>
          {isDeposit ? '+' : '−'}₹{transaction.amount?.toLocaleString()}
        </p>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          transaction.status === 'completed' ? 'bg-green-100 text-green-700' :
          transaction.status === 'pending'   ? 'bg-yellow-100 text-yellow-700' :
          'bg-red-100 text-red-700'
        }`}>{transaction.status}</span>
      </div>
      {transaction.txHash && (
        <a href={`https://tronscan.org/#/transaction/${transaction.txHash}`} target="_blank" rel="noopener noreferrer"
          className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors flex-shrink-0">
          <ExternalLink size={14} />
        </a>
      )}
    </div>
  );
}

export default function TraderBalance() {
  const [balance,          setBalance]          = useState(0);
  const [securityHold,     setSecurityHold]     = useState(0);
  const [workingBalance,   setWorkingBalance]   = useState(0);
  const [usdtDepositAddress, setUsdtDepositAddress] = useState('');
  const [transactions,     setTransactions]     = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [copied,           setCopied]           = useState(false);
  const [toast,            setToast]            = useState(null);
  const [balanceFlash,     setBalanceFlash]     = useState(false);
  const [refreshing,       setRefreshing]       = useState(false);
  const [activeTab,        setActiveTab]        = useState("deposit");
  const [usdtBuyRate,      setUsdtBuyRate]      = useState(92);
  const balanceRef = useRef(null);

  /* USDT rate polling */
  useEffect(() => {
    const fetchRate = async () => {
      try {
        const r = await fetch('https://us-central1-pay2x-4748c.cloudfunctions.net/getUSDTBuyRate/getUSDTBuyRate');
        const d = await r.json();
        if (d.success && d.rate) setUsdtBuyRate(d.rate);
      } catch (e) { console.error(e); }
    };
    fetchRate();
    const iv = setInterval(fetchRate, 60000);
    return () => clearInterval(iv);
  }, []);

  /* Firestore listeners */
  useEffect(() => {
    const user = getAuth().currentUser;
    if (!user) { setLoading(false); return; }
    setLoading(false);

    const unsubTrader = onSnapshot(doc(db, 'trader', user.uid), snap => {
      if (!snap.exists()) return;
      const d = snap.data();
      if (balanceRef.current !== null && balanceRef.current !== d.balance) {
        setBalanceFlash(true);
        setTimeout(() => setBalanceFlash(false), 900);
        setToast({ msg: '✅ Balance updated!', success: true });
      }
      const total    = d.balance || 0;
      const security = d.securityHold || 0;
      setBalance(total);
      setSecurityHold(security);
      setWorkingBalance(total - security);
      setUsdtDepositAddress(d.usdtDepositAddress || '');
      balanceRef.current = total;
    });

    const unsubTx = onSnapshot(
      query(collection(db, 'transactions'), where('traderId','==',user.uid), orderBy('createdAt','desc'), limit(50)),
      snap => {
        const list = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        setTransactions(list);
      }
    );
    return () => { unsubTrader(); unsubTx(); };
  }, []);

  const copyAddress = () => {
    if (!usdtDepositAddress) { setToast({ msg: 'No address available', success: false }); return; }
    navigator.clipboard.writeText(usdtDepositAddress);
    setCopied(true);
    setToast({ msg: '✅ Address copied!', success: true });
    setTimeout(() => setCopied(false), 2000);
  };

  const refreshBalance = () => {
    setRefreshing(true);
    setToast({ msg: 'Checking for new deposits…', success: true });
    setTimeout(() => setRefreshing(false), 2000);
  };

  const handleExport = () => {
    const csv = [
      ['Date','Type','Amount (INR)','Status','Transaction Hash'],
      ...transactions.map(t => [
        new Date((t.createdAt?.seconds||0)*1000).toLocaleDateString(),
        t.type||'', t.amount||'', t.status||'', t.txHash||''
      ])
    ].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `transactions-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-t-transparent rounded-full animate-spin mx-auto mb-3" style={{ border: '3px solid #7c3aed', borderTopColor: 'transparent' }} />
          <p className="text-slate-500 text-sm font-medium">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* ── Hero Balance Card ── */}
      <div className={`bg-gradient-to-br from-purple-600 to-blue-600 rounded-2xl p-4 sm:p-5 text-white shadow-lg transition-all duration-300 ${balanceFlash ? 'ring-2 ring-green-400 scale-[1.01]' : ''}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-purple-200" />
            <span className="text-purple-200 text-sm font-medium">Total Balance</span>
          </div>
          <button onClick={refreshBalance} disabled={refreshing} className="p-1.5 hover:bg-white/15 rounded-lg transition-colors disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 text-purple-200 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold mb-3 tracking-tight" style={{ fontFamily: 'var(--font-ui)' }}>
          ₹{balance.toLocaleString()}
        </h2>

        <div className="flex gap-3">
          <div className="flex-1 bg-white/10 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <CheckCircle className="w-3.5 h-3.5 text-green-300" />
              <span className="text-xs text-purple-200 font-medium">Working</span>
            </div>
            <p className="text-lg font-bold text-white">₹{workingBalance.toLocaleString()}</p>
          </div>
          <div className="flex-1 bg-white/10 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Lock className="w-3.5 h-3.5 text-orange-300" />
              <span className="text-xs text-purple-200 font-medium">Security Hold</span>
            </div>
            <p className="text-lg font-bold text-white">₹{securityHold.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* ── USDT Rate Strip ── */}
      <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl p-3 sm:p-4 text-white shadow-md flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 p-2 rounded-lg"><DollarSign className="w-5 h-5" /></div>
          <div>
            <p className="text-xs text-green-100">USDT Buy Rate</p>
            <p className="text-xl font-bold">₹{usdtBuyRate}</p>
          </div>
        </div>
        <div className="text-right bg-white/15 px-3 py-2 rounded-lg">
          <p className="text-xs text-green-100">Updates</p>
          <p className="text-sm font-bold flex items-center gap-1 justify-end"><Clock size={12} /> ~1 min</p>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        {[
          { key: 'deposit', label: 'Add Funds', icon: ArrowDown },
          { key: 'history', label: 'History',   icon: History },
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                activeTab === tab.key ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              <Icon className="w-4 h-4" />{tab.label}
            </button>
          );
        })}
      </div>

      {/* ── ADD FUNDS TAB ── */}
      {activeTab === "deposit" && (
        <div className="space-y-4">
          {usdtDepositAddress ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-slate-50 p-5 flex justify-center border-b border-slate-100">
                <QRCode value={usdtDepositAddress} size={180} />
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Your USDT Address (TRC20)</p>
                  <p className="font-mono text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 break-all leading-relaxed" style={{ fontFamily: 'var(--font-mono)' }}>
                    {usdtDepositAddress}
                  </p>
                </div>
                {/* ✅ micro-interaction: scale on active press */}
                <button
                  onClick={copyAddress}
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all duration-200 active:scale-[0.96] ${
                    copied ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-purple-600 text-white hover:bg-purple-700'
                  }`}
                >
                  {copied ? <CheckCircle size={18} /> : <Copy size={18} />}
                  {copied ? 'Copied!' : 'Copy Address'}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
              <Wallet className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600 font-medium text-sm">No deposit address yet</p>
              <p className="text-xs text-slate-400 mt-1">Contact admin to activate deposits</p>
            </div>
          )}

          {/* Warning */}
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 flex items-start gap-3">
            <AlertTriangle className="w-4.5 h-4.5 text-orange-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-orange-800 text-sm">TRC20 Network Only</p>
              <p className="text-xs text-orange-600 mt-0.5">Sending on any other network will result in loss of funds. Balance updates in 1–2 minutes.</p>
            </div>
          </div>

          {/* ── Conversion examples — ✅ hover highlight ── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
              <IndianRupee className="w-4 h-4 text-purple-600" />
              <h4 className="font-bold text-slate-900 text-sm">Conversion Examples</h4>
            </div>
            <div className="divide-y divide-slate-100">
              {[10, 100, 500].map(amt => (
                <div key={amt} className="flex items-center justify-between px-4 py-2.5 hover:bg-purple-50 transition-colors">
                  <span className="text-sm text-slate-600">{amt} USDT →</span>
                  <span className="font-bold text-sm text-green-600">₹{(amt * usdtBuyRate).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          {/* FAQ */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
              <Shield className="w-4 h-4 text-green-600" />
              <h4 className="font-bold text-slate-900 text-sm">FAQ</h4>
            </div>
            <div className="divide-y divide-slate-100">
              {[
                { q: 'How long does it take?',   a: '1–2 minutes after sending USDT' },
                { q: 'Can I reuse this address?', a: 'Yes, this is your permanent address' },
                { q: 'Balance not updated?',      a: 'Wait 3–5 minutes, then contact support' },
              ].map((item, i) => (
                <div key={i} className="px-4 py-3">
                  <p className="font-semibold text-slate-800 text-sm">{item.q}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── HISTORY TAB ── */}
      {activeTab === "history" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Transaction History</h3>
            {transactions.length > 0 && (
              <button onClick={handleExport}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-semibold hover:bg-green-100 active:bg-green-200 transition-colors">
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
            )}
          </div>
          <div className="px-4 py-1">
            {transactions.length > 0
              ? transactions.map(tx => <TransactionItem key={tx.id} transaction={tx} />)
              : (
                <div className="text-center py-10">
                  <History className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                  <p className="text-slate-500 text-sm font-medium">No transactions yet</p>
                  <p className="text-xs text-slate-400 mt-0.5">Deposit history will appear here</p>
                </div>
              )
            }
          </div>
        </div>
      )}
    </div>
  );
}