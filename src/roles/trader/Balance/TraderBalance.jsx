import React, { useEffect, useState, useRef } from "react";
import { supabase } from '../../../supabase';
import {
  Wallet, TrendingUp, TrendingDown, RefreshCw, DollarSign,
  Copy, CheckCircle, AlertCircle, Download, History,
  Lock, ExternalLink, AlertTriangle, Clock, ArrowDown, IndianRupee,
} from "lucide-react";
import QRCode from "react-qr-code";
import Toast from '../../../components/admin/Toast';

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
          {new Date(transaction.created_at || Date.now())
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
      {transaction.tx_hash && (
        <a href={`https://tronscan.org/#/transaction/${transaction.tx_hash}`} target="_blank" rel="noopener noreferrer"
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
  const [commissionBalance, setCommissionBalance] = useState(0);
  const [lifetimeEarnings, setLifetimeEarnings] = useState(0);
  const [usdtDepositAddress, setUsdtDepositAddress] = useState('');
  const [derivationIndex,  setDerivationIndex]  = useState(null);
  const [transactions,     setTransactions]     = useState([]);
  const [pendingDeposits,  setPendingDeposits]  = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [copied,           setCopied]           = useState(false);
  const [toast,            setToast]            = useState(null);
  const [balanceFlash,     setBalanceFlash]     = useState(false);
  const [refreshing,       setRefreshing]       = useState(false);
  const [activeTab,        setActiveTab]        = useState("deposit");
  const [usdtBuyRate,      setUsdtBuyRate]      = useState(92);
  const [rateSource,       setRateSource]       = useState('');
  const [rateUpdatedAt,    setRateUpdatedAt]    = useState(null);
  const [convertAmount,    setConvertAmount]    = useState('');
  const [depositStats,     setDepositStats]     = useState({ count: 0, totalUSDT: 0, totalINR: 0 });
  const [traderId,         setTraderId]         = useState(null);
  const balanceRef = useRef(null);
  const qrRef = useRef(null);

  /* USDT rate from Supabase config - refreshes every 30 seconds */
  useEffect(() => {
    const fetchRate = async () => {
      try {
        const { data } = await supabase
          .from('tatum_config')
          .select('default_usdt_rate, rate_source, rate_updated_at')
          .eq('id', 'main')
          .single();
        if (data?.default_usdt_rate) setUsdtBuyRate(data.default_usdt_rate);
        if (data?.rate_source) setRateSource(data.rate_source);
        if (data?.rate_updated_at) setRateUpdatedAt(data.rate_updated_at);
      } catch (e) { console.error(e); }
    };
    fetchRate();
    const iv = setInterval(fetchRate, 30000); // Every 30 seconds
    return () => clearInterval(iv);
  }, []);

  /* Fetch data + realtime subscription */
  useEffect(() => {
    let traderChannel;

    const setup = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      // Get trader record
      const { data: trader } = await supabase
        .from('traders')
        .select('*')
        .eq('profile_id', user.id)
        .single();

      if (!trader) { setLoading(false); return; }
      setTraderId(trader.id);

      const total    = Number(trader.balance) || 0;
      const security = Number(trader.security_hold) || 0;
      setBalance(total);
      setSecurityHold(security);
      setWorkingBalance(total - security);
      setCommissionBalance(Number(trader.commission_balance) || 0);
      setLifetimeEarnings(Number(trader.lifetime_earnings || trader.overall_commission) || 0);
      setUsdtDepositAddress(trader.usdt_deposit_address || '');
      setDerivationIndex(trader.derivation_index || null);
      balanceRef.current = total;

      // Fetch crypto transactions
      const { data: txData } = await supabase
        .from('crypto_transactions')
        .select('*')
        .eq('trader_id', trader.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (txData) {
        let totalUSDT = 0, totalINR = 0, count = 0;
        txData.forEach(data => {
          if (data.type === 'deposit' && data.status === 'completed') {
            totalUSDT += data.usdt_amount || 0;
            totalINR += data.amount || 0;
            count++;
          }
        });
        setTransactions(txData);
        setDepositStats({ count, totalUSDT: Math.round(totalUSDT * 100) / 100, totalINR: Math.round(totalINR) });
      }

      // Fetch pending deposits (sweep queue)
      const { data: pendingData } = await supabase
        .from('sweep_queue')
        .select('*')
        .eq('trader_id', trader.id)
        .eq('status', 'pending');
      setPendingDeposits(pendingData || []);

      setLoading(false);

      // Real-time subscription for trader balance changes
      traderChannel = supabase.channel('trader-balance')
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'traders',
          filter: `id=eq.${trader.id}`
        }, (payload) => {
          const d = payload.new;
          const newTotal = Number(d.balance) || 0;
          if (balanceRef.current !== null && balanceRef.current !== newTotal) {
            setBalanceFlash(true);
            setTimeout(() => setBalanceFlash(false), 900);
            setToast({ msg: '✅ Balance updated!', success: true });
          }
          const sec = Number(d.security_hold) || 0;
          setBalance(newTotal);
          setSecurityHold(sec);
          setWorkingBalance(newTotal - sec);
          setCommissionBalance(Number(d.commission_balance) || 0);
          setLifetimeEarnings(Number(d.lifetime_earnings || d.overall_commission) || 0);
          setUsdtDepositAddress(d.usdt_deposit_address || '');
          setDerivationIndex(d.derivation_index || null);
          balanceRef.current = newTotal;
        })
        .subscribe();
    };

    setup();
    return () => { if (traderChannel) supabase.removeChannel(traderChannel); };
  }, []);

  const copyAddress = () => {
    if (!usdtDepositAddress) { setToast({ msg: 'No address available', success: false }); return; }
    navigator.clipboard.writeText(usdtDepositAddress);
    setCopied(true);
    setToast({ msg: '✅ Address copied!', success: true });
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadQR = () => {
    if (!usdtDepositAddress || !qrRef.current) return;
    
    const svg = qrRef.current.querySelector('svg');
    if (!svg) return;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const svgData = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `pay2x-deposit-${Date.now()}.png`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
      });
    };
    
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const refreshBalance = async () => {
    setRefreshing(true);
    setToast({ msg: 'Checking for new deposits…', success: true });
    // Re-fetch trader data
    if (traderId) {
      const { data: trader } = await supabase.from('traders').select('*').eq('id', traderId).single();
      if (trader) {
        const total = Number(trader.balance) || 0;
        const security = Number(trader.security_hold) || 0;
        setBalance(total);
        setSecurityHold(security);
        setWorkingBalance(total - security);
      }
    }
    setTimeout(() => setRefreshing(false), 1000);
  };

  const convertCurrency = () => {
    if (!convertAmount || isNaN(convertAmount)) return 0;
    const amount = parseFloat(convertAmount);
    return Math.round(amount * usdtBuyRate);
  };

  const handleExport = () => {
    const csv = [
      ['Date','Type','Amount (INR)','Status','Transaction Hash'],
      ...transactions.map(t => [
        new Date(t.created_at || '').toLocaleDateString(),
        t.type||'', t.amount||'', t.status||'', t.tx_hash||''
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

      {/* ── Hero: Balance + Commission + Earnings ── */}
      <div className={`grid grid-cols-3 gap-3 transition-all duration-300 ${balanceFlash ? 'scale-[1.01]' : ''}`}>
        {/* Balance */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-4 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                <Wallet className="w-4 h-4" />
              </div>
              <span className="text-blue-200 text-xs font-semibold uppercase">Balance</span>
            </div>
            <button onClick={refreshBalance} disabled={refreshing} className="p-1 hover:bg-white/15 rounded-lg">
              <RefreshCw className={`w-3.5 h-3.5 text-blue-200 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">₹{workingBalance.toLocaleString()}</h2>
          <p className="text-blue-200 text-xs mt-1">Working capital</p>
        </div>
        
        {/* Commission */}
        <div className="bg-gradient-to-br from-emerald-600 to-green-700 rounded-2xl p-4 text-white shadow-lg">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
            <span className="text-green-200 text-xs font-semibold uppercase">Commission</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">₹{commissionBalance.toLocaleString()}</h2>
          <p className="text-green-200 text-xs mt-1">Withdrawable</p>
        </div>
        
        {/* Earnings */}
        <div className="bg-gradient-to-br from-purple-600 to-violet-700 rounded-2xl p-4 text-white shadow-lg">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
            <span className="text-purple-200 text-xs font-semibold uppercase">Earnings</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">₹{lifetimeEarnings.toLocaleString()}</h2>
          <p className="text-purple-200 text-xs mt-1">Lifetime total</p>
        </div>
      </div>

      {/* Security Hold Banner */}
      {securityHold > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
          <Lock className="w-4.5 h-4.5 text-amber-600 flex-shrink-0" />
          <div>
            <p className="font-semibold text-amber-800 text-sm">Security Hold: ₹{securityHold.toLocaleString()}</p>
            <p className="text-xs text-amber-600 mt-0.5">This amount is held for security and will be released after verification period</p>
          </div>
        </div>
      )}

      {/* ── USDT Rate Strip ── */}
      <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl p-3 sm:p-4 text-white shadow-md flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 p-2 rounded-lg"><DollarSign className="w-5 h-5" /></div>
          <div>
            <p className="text-xs text-green-100">USDT Buy Rate</p>
            <p className="text-xl font-bold">₹{usdtBuyRate}</p>
          </div>
        </div>
        <div className="text-right">
          {rateSource && (
            <p className="text-xs text-green-100 capitalize mb-1">
              via {rateSource === 'wazirx' ? 'WazirX' : rateSource}
            </p>
          )}
          <div className="bg-white/15 px-3 py-1.5 rounded-lg">
            <p className="text-xs text-green-100 flex items-center gap-1 justify-end">
              <Clock size={10} />
              {rateUpdatedAt 
                ? new Date(rateUpdatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                : 'Live'
              }
            </p>
          </div>
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
          {/* Pending Deposits Alert */}
          {pendingDeposits.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 flex items-start gap-3">
              <Clock className="w-4.5 h-4.5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-yellow-800 text-sm">Pending Auto-Sweep</p>
                <p className="text-xs text-yellow-700 mt-0.5">{pendingDeposits.length} deposit{pendingDeposits.length > 1 ? 's are' : ' is'} being swept to admin wallet (happens every 5 min)</p>
              </div>
            </div>
          )}

          {/* Deposit Stats */}
          {depositStats.count > 0 && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
                <p className="text-xs text-slate-500 mb-1">Total Deposits</p>
                <p className="text-2xl font-bold text-purple-600">{depositStats.count}</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
                <p className="text-xs text-slate-500 mb-1">Total USDT</p>
                <p className="text-2xl font-bold text-green-600">{depositStats.totalUSDT}</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
                <p className="text-xs text-slate-500 mb-1">Total INR</p>
                <p className="text-lg font-bold text-blue-600">₹{depositStats.totalINR.toLocaleString()}</p>
              </div>
            </div>
          )}

          {usdtDepositAddress ? (
            <>
              {/* QR Code Card */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-50 p-5 flex justify-center border-b border-slate-100 relative group" ref={qrRef}>
                  <QRCode value={usdtDepositAddress} size={200} />
                  <button
                    onClick={downloadQR}
                    className="absolute top-2 right-2 bg-white p-2 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Download QR"
                  >
                    <Download className="w-4 h-4 text-slate-700" />
                  </button>
                </div>
                <div className="p-4 space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Your USDT Address (TRC20)</p>
                      {derivationIndex !== null && (
                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">Index #{derivationIndex}</span>
                      )}
                    </div>
                    <p className="font-mono text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 break-all leading-relaxed" style={{ fontFamily: 'var(--font-mono)' }}>
                      {usdtDepositAddress}
                    </p>
                  </div>
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

              {/* Currency Converter */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <IndianRupee className="w-4 h-4 text-purple-600" />
                  USDT to INR Converter
                </h4>

                <div className="flex gap-2">
                  <input
                    type="number"
                    value={convertAmount}
                    onChange={(e) => setConvertAmount(e.target.value)}
                    placeholder="Enter USDT amount"
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                  <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-center">
                    <p className="text-sm font-bold text-purple-900">
                      {convertAmount ? `₹${convertCurrency().toLocaleString()}` : '—'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => setConvertAmount('10')} className="py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-medium transition-colors">10 USDT</button>
                  <button onClick={() => setConvertAmount('50')} className="py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-medium transition-colors">50 USDT</button>
                  <button onClick={() => setConvertAmount('100')} className="py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-medium transition-colors">100 USDT</button>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
              <Wallet className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600 font-medium mb-2">No deposit address assigned</p>
              <p className="text-slate-400 text-sm">Contact admin to get your USDT deposit address</p>
            </div>
          )}

          {/* Warning */}
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 flex items-start gap-3">
            <AlertTriangle className="w-4.5 h-4.5 text-orange-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-orange-800 text-sm">⚠️ Important Instructions</p>
              <ul className="text-xs text-orange-600 mt-1.5 space-y-1">
                <li>• Network: <span className="font-semibold">Tron (TRC20) only</span></li>
                <li>• Minimum deposit: <span className="font-semibold">10 USDT</span></li>
                <li>• Balance updates in <span className="font-semibold">1-5 minutes</span></li>
                <li>• This is your <span className="font-semibold">permanent address</span> - reuse anytime</li>
                <li>• Wrong network = <span className="font-semibold text-red-700">loss of funds</span></li>
              </ul>
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
