import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../supabase';
import { Search, Users, TrendingUp, Calendar } from 'lucide-react';

export default function AffiliateTraders() {
  const { affiliate } = useOutletContext();
  const [traders, setTraders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (affiliate) {
      fetchTraders();
    }
  }, [affiliate]);

  const fetchTraders = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('affiliate_trader_view')
      .select('*')
      .eq('affiliate_id', affiliate.id)
      .order('total_commission_earned', { ascending: false });

    if (!error) {
      setTraders(data || []);
    }
    setLoading(false);
  };

  const filteredTraders = traders.filter(t =>
    t.trader_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.trader_email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Stats
  const totalCommission = traders.reduce((sum, t) => sum + Number(t.total_commission_earned || 0), 0);
  const activeTraders = traders.filter(t => t.trader_status === 'active').length;
  const earnings30d = traders.reduce((sum, t) => sum + Number(t.earnings_30d || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Traders</h1>
        <p className="text-gray-600">View and monitor your referred traders</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Traders</p>
              <p className="text-xl font-bold">{traders.length}</p>
              <p className="text-xs text-green-600">{activeTraders} active</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <TrendingUp size={20} className="text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Commission</p>
              <p className="text-xl font-bold">₹{totalCommission.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Calendar size={20} className="text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Last 30 Days</p>
              <p className="text-xl font-bold">₹{earnings30d.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search traders..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border rounded-lg"
        />
      </div>

      {/* Traders Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Trader</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Commission Rate</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Transactions</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Total Earned</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">30D Earnings</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-500">Loading...</td>
              </tr>
            ) : filteredTraders.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-500">
                  {traders.length === 0 ? 'No traders referred yet' : 'No traders match your search'}
                </td>
              </tr>
            ) : (
              filteredTraders.map((trader) => (
                <tr key={trader.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-gray-900">{trader.trader_name}</p>
                      <p className="text-sm text-gray-500">{trader.trader_email}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-blue-600 font-medium">{trader.commission_rate}%</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium">{trader.total_transactions || 0}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-green-600 font-medium">
                      ₹{Number(trader.total_commission_earned || 0).toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium">
                      ₹{Number(trader.earnings_30d || 0).toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      trader.trader_status === 'active'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {trader.trader_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(trader.created_at).toLocaleDateString()}
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
