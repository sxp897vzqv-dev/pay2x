import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../supabase';
import { 
  Search, Filter, ArrowUpRight, ArrowDownRight, 
  Calendar, Download, TrendingUp
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
      .select(`
        *,
        trader:traders(name, email)
      `)
      .eq('affiliate_id', affiliate.id)
      .gte('created_at', fromDate.toISOString())
      .order('created_at', { ascending: false });

    if (!error && data) {
      setEarnings(data);
      
      // Calculate stats
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
    const headers = ['Date', 'Trader', 'Type', 'Transaction Amount', 'Trader Earning', 'Commission Rate', 'Your Earning', 'Status'];
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
    a.download = `earnings_${dateRange}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Earnings</h1>
          <p className="text-gray-600">Track your commission earnings from traders</p>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50"
        >
          <Download size={18} />
          Export CSV
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border">
          <p className="text-sm text-gray-500">Total Earnings</p>
          <p className="text-2xl font-bold text-green-600">₹{stats.total.toLocaleString()}</p>
          <p className="text-xs text-gray-500">{stats.count} transactions</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border">
          <p className="text-sm text-gray-500">From Payins</p>
          <p className="text-2xl font-bold">₹{stats.payin.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border">
          <p className="text-sm text-gray-500">From Payouts</p>
          <p className="text-2xl font-bold">₹{stats.payout.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border">
          <p className="text-sm text-gray-500">Avg Per Transaction</p>
          <p className="text-2xl font-bold">
            ₹{stats.count > 0 ? (stats.total / stats.count).toFixed(2) : '0'}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 max-w-md">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by trader or transaction ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="border rounded-lg px-3 py-2"
        >
          <option value="all">All Types</option>
          <option value="payin">Payin Only</option>
          <option value="payout">Payout Only</option>
        </select>
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="border rounded-lg px-3 py-2"
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="all">All time</option>
        </select>
      </div>

      {/* Earnings Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Date</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Trader</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Type</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Txn Amount</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Trader Earned</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Your Rate</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Your Earning</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center py-8 text-gray-500">Loading...</td>
              </tr>
            ) : filteredEarnings.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-8 text-gray-500">No earnings found</td>
              </tr>
            ) : (
              filteredEarnings.map((earning) => (
                <tr key={earning.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {new Date(earning.created_at).toLocaleDateString()}
                    <br />
                    <span className="text-xs text-gray-400">
                      {new Date(earning.created_at).toLocaleTimeString()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{earning.trader?.name}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                      earning.transaction_type === 'payin'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {earning.transaction_type === 'payin' ? (
                        <ArrowDownRight size={12} />
                      ) : (
                        <ArrowUpRight size={12} />
                      )}
                      {earning.transaction_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    ₹{Number(earning.transaction_amount).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    ₹{Number(earning.trader_earning).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-blue-600 font-medium">
                    {earning.commission_rate}%
                  </td>
                  <td className="px-4 py-3 text-green-600 font-bold">
                    +₹{Number(earning.affiliate_earning).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
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
  );
}
