import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { getAuth, signOut } from 'firebase/auth';
import {
  LayoutDashboard,
  CreditCard,
  Wallet,
  FileText,
  Settings,
  LogOut,
  Menu,
  X,
  Code,
  Webhook,
  TrendingUp,
} from 'lucide-react';

const MerchantLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();

  const navigationLinks = [
    { to: '/merchant/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/merchant/transactions', icon: CreditCard, label: 'Transactions' },
    { to: '/merchant/payout', icon: Settings, label: 'Payouts' },
    { to: '/merchant/settlement', icon: Wallet, label: 'Settlements' },
    { to: '/merchant/dispute', icon: FileText, label: 'Disputes' },
    { to: '/merchant/api-docs', icon: Code, label: 'API Documentation' },
    { to: '/merchant/webhooks', icon: Webhook, label: 'Webhooks' },
    { to: '/merchant/reports', icon: FileText, label: 'Reports' },
    { to: '/merchant/settings', icon: Settings, label: 'Settings' },
  ];

  const handleLogout = async () => {
    try {
      await signOut(getAuth());
      navigate('/signin');
    } catch (err) {
      alert('Logout failed: ' + err.message);
    }
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo Section */}
      <div className="px-6 py-5 border-b border-teal-400/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-teal-500 rounded-xl flex items-center justify-center shadow-lg">
            <TrendingUp className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Merchant Portal</h2>
            <p className="text-xs text-teal-200">Payment Gateway</p>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        {navigationLinks.map((link) => {
          const Icon = link.icon;
          return (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                  isActive
                    ? 'bg-white/20 text-white shadow-lg backdrop-blur-sm'
                    : 'text-teal-100 hover:bg-white/10 hover:text-white'
                }`
              }
              onClick={() => setSidebarOpen(false)}
            >
              {({ isActive }) => (
                <>
                  <Icon 
                    className={`w-5 h-5 transition-transform duration-200 ${
                      isActive ? 'scale-110' : 'group-hover:scale-110'
                    }`} 
                  />
                  <span className="font-medium">{link.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Logout Button */}
      <div className="p-4 border-t border-teal-400/20">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/20 text-white hover:bg-red-500/30 transition-all duration-200 group"
        >
          <LogOut className="w-5 h-5 group-hover:scale-110 transition-transform" />
          <span className="font-medium">Logout</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="w-full min-h-screen flex bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Mobile Menu Button */}
      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="fixed top-4 left-4 z-50 md:hidden p-3 bg-white rounded-xl shadow-lg hover:shadow-xl transition-all"
          aria-label="Open menu"
        >
          <Menu className="w-6 h-6 text-teal-600" />
        </button>
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed md:static inset-y-0 left-0 z-40
          w-72 bg-gradient-to-br from-teal-600 via-teal-700 to-cyan-700
          transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          shadow-2xl
        `}
      >
        {/* Mobile Close Button */}
        {sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(false)}
            className="absolute top-4 right-4 md:hidden p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
            aria-label="Close menu"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        )}
        {sidebarContent}
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6 md:p-8">
          <Outlet />
        </div>
      </main>

      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
};

export default MerchantLayout;