import { useState, useEffect } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { supabase } from '../../supabase';
import { 
  Coins, CheckCircle, Clock, Calendar, AlertCircle,
  Copy, ExternalLink, Wallet
} from 'lucide-react';

export default function AffiliateSettlements() {
  const { affiliate } = useOutletContext();
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (affiliate) {
      fetchSettlements();
    }
  }, [affiliate]);

  const fetchSettlements = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('affiliate_settlements')
      .select('*')
      .eq('affiliate_id', affiliate.id)
      .order('settlement_month', { ascending: false });

    if (!error) {
      setSettlements(data || []);
    }
    setLoading(false);
  };

  const totalSettled = settlements
    .filter(s => s.status === 'completed')
    .reduce((sum, s) => sum + Number(s.amount), 0);

  const copyTxHash = (hash) => {
    navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasWallet = affiliate?.usdt_wallet_address;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-900">USDT Settlements</h1>
        <p className="text-slate-600 text-sm md:text-base">View your monthly USDT settlement history</p>
      </div>

      {/* Wallet Warning */}
      {!hasWallet && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-amber-900">Add USDT Wallet</h3>
            <p className="text-sm text-amber-700 mt-1">
              You haven't added a USDT wallet address yet. Please add your TRC20 wallet to receive settlements.
            </p>
            <Link 
              to="/affiliate/settings"
              className="inline-flex items-center gap-1 mt-2 text-sm font-medium text-amber-700 hover:text-amber-800"
            >
              Go to Settings <ExternalLink className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-green-100 rounded-xl">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs md:text-sm text-slate-500 font-medium">Total Settled</p>
              <p className="text-lg md:text-xl font-bold text-green-600">₹{totalSettled.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-orange-100 rounded-xl">
              <Clock className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-xs md:text-sm text-slate-500 font-medium">Pending Settlement</p>
              <p className="text-lg md:text-xl font-bold text-orange-600">
                ₹{Number(affiliate?.pending_settlement || 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-100 rounded-xl">
              <Calendar className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs md:text-sm text-slate-500 font-medium">Next Settlement</p>
              <p className="text-lg md:text-xl font-bold text-slate-900">2nd of month</p>
            </div>
          </div>
        </div>
      </div>

      {/* USDT Info Banner */}
      <div className="bg-gradient-to-r from-purple-50 to-violet-50 border border-purple-100 rounded-2xl p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-purple-100 rounded-lg flex-shrink-0">
            <Coins className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="font-semibold text-purple-900">How USDT Settlements Work</h3>
            <ul className="text-sm text-purple-700 mt-2 space-y-1">
              <li>• Settlements are processed on the 2nd of every month</li>
              <li>• Amount is converted to USDT at current market rate</li>
              <li>• USDT is sent to your TRC20 wallet address</li>
              <li>• Transaction hash will be shown once completed</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Your Wallet */}
      {hasWallet && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-4">
          <div className="flex items-center gap-3 mb-3">
            <Wallet className="w-5 h-5 text-purple-600" />
            <h2 className="font-semibold text-slate-900">Your USDT Wallet (TRC20)</h2>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between gap-2">
            <code className="text-sm text-slate-700 font-mono truncate flex-1">
              {affiliate.usdt_wallet_address}
            </code>
            <button
              onClick={() => copyTxHash(affiliate.usdt_wallet_address)}
              className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <Copy className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>
      )}

      {/* Settlements Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">Settlement History</h2>
        </div>
        
        {/* Mobile Cards */}
        <div className="md:hidden p-4 space-y-3">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
            </div>
          ) : settlements.length === 0 ? (
            <div className="text-center py-8">
              <Coins className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-500 text-sm">No settlements yet</p>
              <p className="text-slate-400 text-xs mt-1">Your first settlement will appear after the 2nd of next month</p>
            </div>
          ) : (
            settlements.map((settlement) => (
              <div key={settlement.id} className="bg-slate-50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-medium text-slate-900">
                    {new Date(settlement.settlement_month).toLocaleDateString('en-IN', {
                      month: 'long', year: 'numeric'
                    })}
                  </span>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                    settlement.status === 'completed'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {settlement.status === 'completed' ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                    {settlement.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-slate-500">Amount</p>
                    <p className="font-bold text-green-600">₹{Number(settlement.amount).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">USDT</p>
                    <p className="font-medium">{settlement.usdt_amount ? `$${settlement.usdt_amount}` : '-'}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Transactions</p>
                    <p className="font-medium">{settlement.earnings_count}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Rate</p>
                    <p className="font-medium">{settlement.conversion_rate ? `₹${settlement.conversion_rate}` : '-'}</p>
                  </div>
                </div>
                {settlement.tx_hash && (
                  <div className="mt-3 pt-3 border-t border-slate-200">
                    <p className="text-xs text-slate-500 mb-1">TX Hash</p>
                    <div className="flex items-center gap-2">
                      <code className="text-xs text-purple-600 font-mono truncate flex-1">
                        {settlement.tx_hash}
                      </code>
                      <button onClick={() => copyTxHash(settlement.tx_hash)} className="p-1">
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Month</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount (INR)</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">USDT</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Rate</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Txns</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">TX Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-500">Loading...</td>
                </tr>
              ) : settlements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8">
                    <Coins className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-slate-500">No settlements yet</p>
                    <p className="text-slate-400 text-sm mt-1">Your first settlement will appear after the 2nd of next month</p>
                  </td>
                </tr>
              ) : (
                settlements.map((settlement) => (
                  <tr key={settlement.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {new Date(settlement.settlement_month).toLocaleDateString('en-IN', {
                        month: 'long', year: 'numeric'
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-green-600">
                        ₹{Number(settlement.amount).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {settlement.usdt_amount ? `$${Number(settlement.usdt_amount).toFixed(2)}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {settlement.conversion_rate ? `₹${settlement.conversion_rate}` : '-'}
                    </td>
                    <td className="px-4 py-3">{settlement.earnings_count}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        settlement.status === 'completed'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {settlement.status === 'completed' ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                        {settlement.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {settlement.tx_hash ? (
                        <div className="flex items-center gap-2">
                          <code className="text-xs text-purple-600 font-mono truncate max-w-[120px]">
                            {settlement.tx_hash}
                          </code>
                          <button 
                            onClick={() => copyTxHash(settlement.tx_hash)}
                            className="p-1 hover:bg-slate-100 rounded"
                          >
                            <Copy className="w-3.5 h-3.5 text-slate-400" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Toast */}
      {copied && (
        <div className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg z-50">
          Copied to clipboard!
        </div>
      )}
    </div>
  );
}
