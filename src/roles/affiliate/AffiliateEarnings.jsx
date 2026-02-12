import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../supabase';
import { 
  Search, ArrowUpRight, ArrowDownRight, 
  Download, TrendingUp, DollarSign, Hash
} from 'lucide-react';

export default function AffiliateEarnings() {
  const { affiliate } = useOutletContext();
  const [earnings, setEarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateRange, setDateRange] = useState('30d');
  const [stats, setStats] = useState({
    total: 0,
    payin: 0,
    payout: 0,
    count: 0
  });

  useEffect(() => {
    if (affiliate) {
      fetchEarnings();
    }
  }, [affiliate, dateRange]);

  const fetchEarnings = async () => {
    setLoading(true);
    
    let fromDate = new Date();
    switch (dateRange) {
      case '7d':
        fromDate.setDate(fromDate.getDate() - 7);
        break;
      case '30d':
        fromDate.setDate(fromDate.getDate() - 30);
        break;
      case '90d':
        fromDate.setDate(fromDate.getDate() - 90);
        break;
      case 'all':
        fromDate = new Date('2020-01-01');
        break;
    }

    const { data, error } = await supabase
      .from('affiliate_earnings')
      .select(`*, trader:traders(name, email)`)
      .eq('affiliate_id', affiliate.id)
      .gte('created_at', fromDate.toISOString())
      .order('created_at', { ascending: false });

    if (!error && data) {
      setEarnings(data);
      
      const payinTotal = data
        .filter(e => e.transaction_type === 'payin')
        .reduce((sum, e) => sum + Number(e.affiliate_earning), 0);
      const payoutTotal = data
        .filter(e => e.transaction_type === 'payout')
        .reduce((sum, e) => sum + Number(e.affiliate_earning), 0);
      
      setStats({
        total: payinTotal + payoutTotal,
        payin: payinTotal,
        payout: payoutTotal,
        count: data.length
      });
    }
    setLoading(false);
  };

  const filteredEarnings = earnings.filter(e => {
    const matchesSearch = 
      e.trader?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.transaction_id?.includes(searchQuery);
    const matchesType = typeFilter === 'all' || e.transaction_type === typeFilter;
    return matchesSearch && matchesType;
  });

  const exportCSV = () => {
    const headers = ['Date', 'Trader', 'Type', 'Txn Amount', 'Trader Earned', 'Your Rate', 'Your Earning', 'Status'];
    const rows = filteredEarnings.map(e => [
      new Date(e.created_at).toLocaleDateString(),
      e.trader?.name || 'N/A',
      e.transaction_type,
      e.transaction_amount,
      e.trader_earning,
      e.commission_rate + '%',
      e.affiliate_earning,
      e.status
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `affiliate_earnings_${dateRange}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Earnings</h1>
          <p className="text-slate-600 text-sm md:text-base">Track your commission earnings</p>
        </div>
        <button
          onClick={exportCSV}
          className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 font-medium text-sm transition-colors"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/60">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-green-600" />
            <p className="text-xs text-slate-500 font-medium">Total Earnings</p>
          </div>
          <p className="text-xl font-bold text-green-600">₹{stats.total.toLocaleString()}</p>
          <p className="text-xs text-slate-400">{stats.count} transactions</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/60">
          <div className="flex items-center gap-2 mb-1">
            <ArrowDownRight className="w-4 h-4 text-emerald-600" />
            <p className="text-xs text-slate-500 font-medium">From Payins</p>
          </div>
          <p className="text-xl font-bold text-slate-900">₹{stats.payin.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/60">
          <div className="flex items-center gap-2 mb-1">
            <ArrowUpRight className="w-4 h-4 text-blue-600" />
            <p className="text-xs text-slate-500 font-medium">From Payouts</p>
          </div>
          <p className="text-xl font-bold text-slate-900">₹{stats.payout.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/60">
          <div className="flex items-center gap-2 mb-1">
            <Hash className="w-4 h-4 text-purple-600" />
            <p className="text-xs text-slate-500 font-medium">Avg Per Txn</p>
          </div>
          <p className="text-xl font-bold text-slate-900">
            ₹{stats.count > 0 ? Math.round(stats.total / stats.count).toLocaleString() : '0'}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by trader or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-sm"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
        >
          <option value="all">All Types</option>
          <option value="payin">Payin Only</option>
          <option value="payout">Payout Only</option>
        </select>
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="all">All time</option>
        </select>
      </div>

      {/* Earnings Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
        {/* Mobile Cards */}
        <div className="md:hidden p-4 space-y-3">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
            </div>
          ) : filteredEarnings.length === 0 ? (
            <div className="text-center py-8">
              <TrendingUp className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-500 text-sm">No earnings found</p>
            </div>
          ) : (
            filteredEarnings.map((earning) => (
              <div key={earning.id} className="bg-slate-50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg ${
                      earning.transaction_type === 'payin' ? 'bg-green-100' : 'bg-blue-100'
                    }`}>
                      {earning.transaction_type === 'payin' 
                        ? <ArrowDownRight className="w-4 h-4 text-green-600" />
                        : <ArrowUpRight className="w-4 h-4 text-blue-600" />
                      }
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 text-sm">{earning.trader?.name}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(earning.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-green-600">+₹{Number(earning.affiliate_earning).toLocaleString()}</p>
                    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
                      earning.status === 'settled' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {earning.status}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-slate-500">Txn Amount</p>
                    <p className="font-medium">₹{Number(earning.transaction_amount).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Trader Got</p>
                    <p className="font-medium">₹{Number(earning.trader_earning).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Your Rate</p>
                    <p className="font-medium text-purple-600">{earning.commission_rate}%</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Trader</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Txn Amount</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Trader Earned</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Your Rate</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Your Earning</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-500">Loading...</td>
                </tr>
              ) : filteredEarnings.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8">
                    <TrendingUp className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-slate-500">No earnings found</p>
                  </td>
                </tr>
              ) : (
                filteredEarnings.map((earning) => (
                  <tr key={earning.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-sm">
                      <div>
                        <p className="text-slate-900">{new Date(earning.created_at).toLocaleDateString()}</p>
                        <p className="text-xs text-slate-400">{new Date(earning.created_at).toLocaleTimeString()}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{earning.trader?.name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${
                        earning.transaction_type === 'payin'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {earning.transaction_type === 'payin' 
                          ? <ArrowDownRight className="w-3 h-3" />
                          : <ArrowUpRight className="w-3 h-3" />
                        }
                        {earning.transaction_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium">₹{Number(earning.transaction_amount).toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-600">₹{Number(earning.trader_earning).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-1 rounded-lg bg-purple-100 text-purple-700 font-semibold text-xs">
                        {earning.commission_rate}%
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-green-600">+₹{Number(earning.affiliate_earning).toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                        earning.status === 'settled'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {earning.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
