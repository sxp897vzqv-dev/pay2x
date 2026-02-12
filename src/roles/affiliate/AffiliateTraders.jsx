import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../supabase';
import { Search, Users, TrendingUp, Calendar, CheckCircle, XCircle } from 'lucide-react';

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
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-900">My Traders</h1>
        <p className="text-slate-600 text-sm md:text-base">Monitor your referred traders and earnings</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-100 rounded-xl">
              <Users className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs md:text-sm text-slate-500 font-medium">Total Traders</p>
              <p className="text-lg md:text-xl font-bold text-slate-900">{traders.length}</p>
              <p className="text-xs text-green-600 font-medium">{activeTraders} active</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-green-100 rounded-xl">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs md:text-sm text-slate-500 font-medium">Total Commission</p>
              <p className="text-lg md:text-xl font-bold text-green-600">₹{totalCommission.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-100 rounded-xl">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs md:text-sm text-slate-500 font-medium">Last 30 Days</p>
              <p className="text-lg md:text-xl font-bold text-slate-900">₹{earnings30d.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search traders..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
        />
      </div>

      {/* Traders List */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
        {/* Mobile Cards */}
        <div className="md:hidden p-4 space-y-3">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
            </div>
          ) : filteredTraders.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-500 text-sm">
                {traders.length === 0 ? 'No traders referred yet' : 'No traders match your search'}
              </p>
            </div>
          ) : (
            filteredTraders.map((trader) => (
              <div key={trader.id} className="bg-slate-50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold text-slate-900">{trader.trader_name}</p>
                    <p className="text-xs text-slate-500">{trader.trader_email}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                    trader.trader_status === 'active'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-slate-200 text-slate-600'
                  }`}>
                    {trader.trader_status === 'active' ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                    {trader.trader_status}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-slate-500 text-xs">Rate</p>
                    <p className="font-medium text-purple-600">{trader.commission_rate}%</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs">Earned</p>
                    <p className="font-bold text-green-600">₹{Number(trader.total_commission_earned || 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs">Txns</p>
                    <p className="font-medium">{trader.total_transactions || 0}</p>
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
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Trader</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Commission Rate</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Transactions</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Earned</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">30D Earnings</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-500">Loading...</td>
                </tr>
              ) : filteredTraders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8">
                    <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-slate-500">
                      {traders.length === 0 ? 'No traders referred yet' : 'No traders match your search'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredTraders.map((trader) => (
                  <tr key={trader.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-slate-900">{trader.trader_name}</p>
                        <p className="text-sm text-slate-500">{trader.trader_email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-purple-100 text-purple-700 font-semibold text-sm">
                        {trader.commission_rate}%
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium">{trader.total_transactions || 0}</td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-green-600">
                        ₹{Number(trader.total_commission_earned || 0).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium">
                      ₹{Number(trader.earnings_30d || 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        trader.trader_status === 'active'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-slate-200 text-slate-600'
                      }`}>
                        {trader.trader_status === 'active' ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {trader.trader_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {new Date(trader.created_at).toLocaleDateString()}
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
