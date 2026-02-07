import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../supabase';
import { 
  Users, TrendingUp, DollarSign, CreditCard,
  ArrowUpRight, ArrowDownRight, Calendar
} from 'lucide-react';

export default function AffiliateDashboard() {
  const { affiliate } = useOutletContext();
  const [stats, setStats] = useState({
    totalTraders: 0,
    activeTraders: 0,
    earnings7d: 0,
    earnings30d: 0,
    earningsThisMonth: 0,
    totalEarnings: 0,
    pendingSettlement: 0
  });
  const [recentEarnings, setRecentEarnings] = useState([]);
  const [topTraders, setTopTraders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (affiliate) {
      fetchDashboardData();
    }
  }, [affiliate]);

  const fetchDashboardData = async () => {
    setLoading(true);

    // Fetch trader stats
    const { data: traders } = await supabase
      .from('affiliate_trader_view')
      .select('*')
      .eq('affiliate_id', affiliate.id);

    // Fetch recent earnings
    const { data: earnings } = await supabase
      .from('affiliate_earnings')
      .select(`
        *,
        trader:traders(name)
      `)
      .eq('affiliate_id', affiliate.id)
      .order('created_at', { ascending: false })
      .limit(10);

    // Calculate stats
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const last7Days = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const { data: earningsData } = await supabase
      .from('affiliate_earnings')
      .select('affiliate_earning, created_at')
      .eq('affiliate_id', affiliate.id);

    const earnings7d = earningsData?.filter(e => new Date(e.created_at) >= last7Days)
      .reduce((sum, e) => sum + Number(e.affiliate_earning), 0) || 0;
    
    const earnings30d = earningsData?.filter(e => new Date(e.created_at) >= last30Days)
      .reduce((sum, e) => sum + Number(e.affiliate_earning), 0) || 0;
    
    const earningsThisMonth = earningsData?.filter(e => new Date(e.created_at) >= thisMonth)
      .reduce((sum, e) => sum + Number(e.affiliate_earning), 0) || 0;

    // Top traders by commission
    const sortedTraders = (traders || [])
      .sort((a, b) => b.total_commission_earned - a.total_commission_earned)
      .slice(0, 5);

    setStats({
      totalTraders: traders?.length || 0,
      activeTraders: traders?.filter(t => t.trader_status === 'active').length || 0,
      earnings7d,
      earnings30d,
      earningsThisMonth,
      totalEarnings: Number(affiliate.total_earned) || 0,
      pendingSettlement: Number(affiliate.pending_settlement) || 0
    });

    setRecentEarnings(earnings || []);
    setTopTraders(sortedTraders);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-6 text-white">
        <h1 className="text-2xl font-bold">Welcome back, {affiliate?.name}!</h1>
        <p className="text-blue-100 mt-1">Here's your affiliate performance overview</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Traders</p>
              <p className="text-2xl font-bold mt-1">{stats.totalTraders}</p>
              <p className="text-sm text-green-600 mt-1">
                {stats.activeTraders} active
              </p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <Users size={24} className="text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">This Month</p>
              <p className="text-2xl font-bold mt-1">₹{stats.earningsThisMonth.toLocaleString()}</p>
              <p className="text-sm text-gray-500 mt-1">
                30d: ₹{stats.earnings30d.toLocaleString()}
              </p>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <TrendingUp size={24} className="text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Earned</p>
              <p className="text-2xl font-bold mt-1">₹{stats.totalEarnings.toLocaleString()}</p>
              <p className="text-sm text-gray-500 mt-1">
                Lifetime earnings
              </p>
            </div>
            <div className="p-3 bg-purple-100 rounded-lg">
              <DollarSign size={24} className="text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Pending Settlement</p>
              <p className="text-2xl font-bold text-orange-600 mt-1">
                ₹{stats.pendingSettlement.toLocaleString()}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Settles on 2nd
              </p>
            </div>
            <div className="p-3 bg-orange-100 rounded-lg">
              <CreditCard size={24} className="text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Traders */}
        <div className="bg-white rounded-xl shadow-sm border">
          <div className="p-4 border-b">
            <h2 className="font-semibold text-gray-900">Top Traders</h2>
          </div>
          <div className="p-4">
            {topTraders.length === 0 ? (
              <p className="text-center text-gray-500 py-4">No traders yet</p>
            ) : (
              <div className="space-y-3">
                {topTraders.map((trader, index) => (
                  <div key={trader.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-sm font-medium">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{trader.trader_name}</p>
                        <p className="text-sm text-gray-500">{trader.commission_rate}% commission</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-green-600">
                        ₹{Number(trader.total_commission_earned).toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500">
                        {trader.total_transactions} txns
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Earnings */}
        <div className="bg-white rounded-xl shadow-sm border">
          <div className="p-4 border-b">
            <h2 className="font-semibold text-gray-900">Recent Earnings</h2>
          </div>
          <div className="p-4">
            {recentEarnings.length === 0 ? (
              <p className="text-center text-gray-500 py-4">No earnings yet</p>
            ) : (
              <div className="space-y-3">
                {recentEarnings.map((earning) => (
                  <div key={earning.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        earning.transaction_type === 'payin' 
                          ? 'bg-green-100' 
                          : 'bg-blue-100'
                      }`}>
                        {earning.transaction_type === 'payin' ? (
                          <ArrowDownRight size={16} className="text-green-600" />
                        ) : (
                          <ArrowUpRight size={16} className="text-blue-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {earning.trader?.name || 'Trader'}
                        </p>
                        <p className="text-sm text-gray-500">
                          {earning.transaction_type} • ₹{Number(earning.transaction_amount).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-green-600">
                        +₹{Number(earning.affiliate_earning).toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(earning.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Commission Info */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Calendar size={20} className="text-blue-600 mt-0.5" />
          <div>
            <h3 className="font-medium text-blue-900">Settlement Schedule</h3>
            <p className="text-sm text-blue-700 mt-1">
              Your pending earnings are settled on the 2nd of every month. 
              Your default commission rate is <strong>{affiliate?.default_commission_rate}%</strong> of trader earnings.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
