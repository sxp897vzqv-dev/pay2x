import { useState, useEffect } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { supabase } from '../../supabase';
import { 
  Users, TrendingUp, IndianRupee, Coins,
  ArrowUpRight, ArrowDownRight, ChevronRight, Sparkles
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
      .select(`*, trader:traders(name)`)
      .eq('affiliate_id', affiliate.id)
      .order('created_at', { ascending: false })
      .limit(5);

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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600 rounded-2xl p-6 text-white">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-5 h-5 text-purple-200" />
            <span className="text-purple-200 text-sm font-medium">Welcome back</span>
          </div>
          <h1 className="text-2xl font-bold">{affiliate?.name}!</h1>
          <p className="text-purple-100 mt-1">Your commission rate: <span className="font-bold text-white">{affiliate?.default_commission_rate}%</span></p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-white rounded-2xl p-4 md:p-5 shadow-sm border border-slate-200/60">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs md:text-sm text-slate-500 font-medium">Total Traders</p>
              <p className="text-xl md:text-2xl font-bold text-slate-900 mt-1">{stats.totalTraders}</p>
              <p className="text-xs text-green-600 font-medium mt-1">{stats.activeTraders} active</p>
            </div>
            <div className="p-2.5 md:p-3 bg-purple-100 rounded-xl">
              <Users className="w-5 h-5 md:w-6 md:h-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 md:p-5 shadow-sm border border-slate-200/60">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs md:text-sm text-slate-500 font-medium">This Month</p>
              <p className="text-xl md:text-2xl font-bold text-slate-900 mt-1">₹{stats.earningsThisMonth.toLocaleString()}</p>
              <p className="text-xs text-slate-500 mt-1">30d: ₹{stats.earnings30d.toLocaleString()}</p>
            </div>
            <div className="p-2.5 md:p-3 bg-green-100 rounded-xl">
              <TrendingUp className="w-5 h-5 md:w-6 md:h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 md:p-5 shadow-sm border border-slate-200/60">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs md:text-sm text-slate-500 font-medium">Total Earned</p>
              <p className="text-xl md:text-2xl font-bold text-slate-900 mt-1">₹{stats.totalEarnings.toLocaleString()}</p>
              <p className="text-xs text-slate-500 mt-1">Lifetime</p>
            </div>
            <div className="p-2.5 md:p-3 bg-blue-100 rounded-xl">
              <IndianRupee className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 md:p-5 shadow-sm border border-slate-200/60">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs md:text-sm text-slate-500 font-medium">Pending</p>
              <p className="text-xl md:text-2xl font-bold text-orange-600 mt-1">₹{stats.pendingSettlement.toLocaleString()}</p>
              <p className="text-xs text-slate-500 mt-1">USDT settlement</p>
            </div>
            <div className="p-2.5 md:p-3 bg-orange-100 rounded-xl">
              <Coins className="w-5 h-5 md:w-6 md:h-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Top Traders */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Top Traders</h2>
            <Link to="/affiliate/traders" className="text-sm text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1">
              View all <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="p-4">
            {topTraders.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">No traders yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {topTraders.map((trader, index) => (
                  <div key={trader.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                        index === 0 ? 'bg-yellow-100 text-yellow-700' :
                        index === 1 ? 'bg-slate-200 text-slate-600' :
                        index === 2 ? 'bg-orange-100 text-orange-700' :
                        'bg-slate-100 text-slate-500'
                      }`}>
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900 text-sm">{trader.trader_name}</p>
                        <p className="text-xs text-slate-500">{trader.commission_rate}% rate</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-green-600 text-sm">₹{Number(trader.total_commission_earned).toLocaleString()}</p>
                      <p className="text-xs text-slate-400">{trader.total_transactions} txns</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Earnings */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Recent Earnings</h2>
            <Link to="/affiliate/earnings" className="text-sm text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1">
              View all <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="p-4">
            {recentEarnings.length === 0 ? (
              <div className="text-center py-8">
                <TrendingUp className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">No earnings yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentEarnings.map((earning) => (
                  <div key={earning.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        earning.transaction_type === 'payin' ? 'bg-green-100' : 'bg-blue-100'
                      }`}>
                        {earning.transaction_type === 'payin' ? (
                          <ArrowDownRight className="w-4 h-4 text-green-600" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4 text-blue-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900 text-sm">{earning.trader?.name || 'Trader'}</p>
                        <p className="text-xs text-slate-500">
                          {earning.transaction_type} • ₹{Number(earning.transaction_amount).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-green-600 text-sm">+₹{Number(earning.affiliate_earning).toLocaleString()}</p>
                      <p className="text-xs text-slate-400">
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

      {/* USDT Settlement Info */}
      <div className="bg-gradient-to-r from-purple-50 to-violet-50 border border-purple-100 rounded-2xl p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Coins className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="font-semibold text-purple-900">USDT Settlements</h3>
            <p className="text-sm text-purple-700 mt-1">
              Your earnings are settled in USDT on the 2nd of every month. 
              Make sure to add your TRC20 wallet address in Settings.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
