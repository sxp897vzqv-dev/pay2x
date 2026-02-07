import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabase';
import { 
  LayoutDashboard, Users, TrendingUp, CreditCard, 
  Settings, LogOut, Menu, X, ChevronDown
} from 'lucide-react';

export default function AffiliateLayout() {
  const [affiliate, setAffiliate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchAffiliate();
  }, []);

  const fetchAffiliate = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate('/signin');
      return;
    }

    const { data, error } = await supabase
      .from('affiliates')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error || !data) {
      navigate('/signin');
      return;
    }

    setAffiliate(data);
    setLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/signin');
  };

  const navItems = [
    { path: '/affiliate', icon: LayoutDashboard, label: 'Dashboard', end: true },
    { path: '/affiliate/traders', icon: Users, label: 'My Traders' },
    { path: '/affiliate/earnings', icon: TrendingUp, label: 'Earnings' },
    { path: '/affiliate/settlements', icon: CreditCard, label: 'Settlements' },
    { path: '/affiliate/settings', icon: Settings, label: 'Settings' },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Sidebar */}
      <aside className={`${
        sidebarOpen ? 'w-64' : 'w-20'
      } bg-white border-r transition-all duration-300 flex flex-col fixed h-full z-10`}>
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b">
          {sidebarOpen && (
            <span className="font-bold text-xl text-blue-600">Pay2X</span>
          )}
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            <Menu size={20} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={({ isActive }) => `
                flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors
                ${isActive 
                  ? 'bg-blue-50 text-blue-600' 
                  : 'text-gray-600 hover:bg-gray-100'
                }
              `}
            >
              <item.icon size={20} />
              {sidebarOpen && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="p-4 border-t">
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100"
            >
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-blue-600 font-medium">
                  {affiliate?.name?.charAt(0).toUpperCase()}
                </span>
              </div>
              {sidebarOpen && (
                <>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {affiliate?.name}
                    </p>
                    <p className="text-xs text-gray-500">Affiliate</p>
                  </div>
                  <ChevronDown size={16} className="text-gray-400" />
                </>
              )}
            </button>

            {dropdownOpen && (
              <div className="absolute bottom-full left-0 w-full mb-2 bg-white rounded-lg shadow-lg border py-1">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50"
                >
                  <LogOut size={16} />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 ${sidebarOpen ? 'ml-64' : 'ml-20'} transition-all duration-300`}>
        {/* Top Bar */}
        <header className="h-16 bg-white border-b flex items-center justify-between px-6">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Affiliate Portal</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm text-gray-500">Pending Settlement</p>
              <p className="font-bold text-orange-600">
                ₹{Number(affiliate?.pending_settlement || 0).toLocaleString()}
              </p>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-6">
          <Outlet context={{ affiliate, refreshAffiliate: fetchAffiliate }} />
        </div>
      </main>
    </div>
  );
}
