import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { getAuth, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  LayoutDashboard, Users, Store, UserCircle, TrendingUp, TrendingDown,
  AlertCircle, Database, FileText, DollarSign, LogOut, Menu, X, Shield,
  ChevronDown, ChevronRight, Settings, Bell,
} from 'lucide-react';

/* ─── Fonts (injected once) ─── */
(() => {
  if (!document.head.querySelector('link[data-admin-fonts]')) {
    const l = document.createElement('link');
    l.dataset.adminFonts = '1';
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap';
    document.head.appendChild(l);
  }
  if (!document.head.querySelector('style[data-admin-globals]')) {
    const s = document.createElement('style');
    s.dataset.adminGlobals = '1';
    s.textContent = `
      :root {
        --font-ui: 'Sora', system-ui, sans-serif;
        --font-mono: 'JetBrains Mono', monospace;
      }
      .admin-root { font-family: var(--font-ui); }

      @keyframes slideInLeft {
        from { transform: translateX(-100%); }
        to   { transform: translateX(0); }
      }
      .anim-slide-left { animation: slideInLeft .26s cubic-bezier(.4,0,.2,1) both; }

      @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
      .anim-fade { animation: fadeIn .18s ease both; }

      @keyframes pulse-dot {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
      .pulse-dot { animation: pulse-dot 2s ease-in-out infinite; }
    `;
    document.head.appendChild(s);
  }
})();

/* ─── Nav config with groups ─── */
const navGroups = [
  {
    label: 'Overview',
    items: [
      { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard', shortLabel: 'Home' },
    ],
  },
  {
    label: 'Entities',
    items: [
      { to: '/admin/traders',   icon: Users,      label: 'Traders',   shortLabel: 'Traders' },
      { to: '/admin/merchants', icon: Store,      label: 'Merchants', shortLabel: 'Merchants' },
      { to: '/admin/users',     icon: UserCircle, label: 'Users',     shortLabel: 'Users' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/admin/payins',   icon: TrendingUp,   label: 'Payins',   shortLabel: 'Payins' },
      { to: '/admin/payouts',  icon: TrendingDown, label: 'Payouts',  shortLabel: 'Payouts' },
      { to: '/admin/disputes', icon: AlertCircle,  label: 'Disputes', shortLabel: 'Disputes' },
      { to: '/admin/upi-pool', icon: Database,     label: 'UPI Pool', shortLabel: 'Pool' },
    ],
  },
  {
    label: 'Audit',
    items: [
      { to: '/admin/logs',       icon: FileText,   label: 'Logs',       shortLabel: 'Logs' },
      { to: '/admin/commission', icon: DollarSign, label: 'Commission', shortLabel: 'Comm.' },
    ],
  },
];

/* Bottom nav shows 5 items max */
const bottomNavItems = [
  { to: '/admin/dashboard', icon: LayoutDashboard, shortLabel: 'Home' },
  { to: '/admin/traders',   icon: Users,           shortLabel: 'Traders' },
  { to: '/admin/payins',    icon: TrendingUp,      shortLabel: 'Payins' },
  { to: '/admin/payouts',   icon: TrendingDown,    shortLabel: 'Payouts' },
  { to: '/admin/logs',      icon: FileText,        shortLabel: 'Logs' },
];

const allLinks = navGroups.flatMap(g => g.items);

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adminInfo, setAdminInfo]     = useState(null);
  const [expandedGroups, setExpandedGroups] = useState(['Overview', 'Entities', 'Operations', 'Audit']);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => { fetchAdminInfo(); }, []);
  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  const fetchAdminInfo = async () => {
    try {
      const user = getAuth().currentUser;
      if (!user) return;
      const snap = await getDoc(doc(db, 'admins', user.uid));
      if (snap.exists()) {
        setAdminInfo(snap.data());
      } else {
        // Fallback: use auth display name
        setAdminInfo({ name: user.displayName || user.email?.split('@')[0] || 'Admin' });
      }
    } catch (e) { console.error(e); }
  };

  const handleLogout = async () => {
    try {
      await signOut(getAuth());
      navigate('/signin');
    } catch (e) {
      alert('Logout failed: ' + e.message);
    }
  };

  const toggleGroup = (label) => {
    setExpandedGroups(prev =>
      prev.includes(label) ? prev.filter(g => g !== label) : [...prev, label]
    );
  };

  const currentTitle = (allLinks.find(l => location.pathname.startsWith(l.to)) || {}).label || 'Admin Panel';

  /* ── Sidebar nav renderer with groups ── */
  const renderGroupedNav = (extraPy = 'py-2.5') => (
    <div className="space-y-1">
      {navGroups.map(group => {
        const isExpanded = expandedGroups.includes(group.label);
        return (
          <div key={group.label}>
            {/* Group header */}
            <button
              onClick={() => toggleGroup(group.label)}
              className="w-full flex items-center justify-between px-3 py-2 text-indigo-200 hover:text-white transition-colors"
            >
              <span className="text-xs font-bold uppercase tracking-wider">{group.label}</span>
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
            {/* Group items */}
            {isExpanded && (
              <div className="space-y-0.5 mb-2">
                {group.items.map(link => {
                  const Icon = link.icon;
                  return (
                    <NavLink
                      key={link.to}
                      to={link.to}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-4 ${extraPy} rounded-xl transition-all duration-200 group ml-1 ${
                          isActive
                            ? 'bg-white/20 text-white shadow-sm'
                            : 'text-indigo-100 hover:bg-white/10 hover:text-white'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icon className={`w-4.5 h-4.5 transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-105'}`} style={{ width: 18, height: 18 }} />
                          <span className="font-medium text-sm">{link.label}</span>
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="admin-root w-full min-h-screen flex flex-col md:flex-row bg-slate-50">

      {/* ═══════ MOBILE TOP BAR ═══════ */}
      <header
        className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-slate-200"
        style={{ paddingTop: 'env(safe-area-inset-top)', boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}
      >
        <div className="flex items-center justify-between px-4" style={{ height: 56 }}>
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-slate-100"
            aria-label="Menu"
          >
            <Menu className="w-5 h-5 text-slate-700" />
          </button>
          <h1 className="text-sm font-bold text-slate-900 tracking-tight">{currentTitle}</h1>
          <div className="flex items-center gap-2">
            <button className="w-9 h-9 flex items-center justify-center rounded-lg bg-indigo-50 border border-indigo-200">
              <Bell className="w-4 h-4 text-indigo-600" />
            </button>
          </div>
        </div>
      </header>

      {/* ═══════ DESKTOP SIDEBAR ═══════ */}
      <aside className="hidden md:flex md:flex-col md:w-64 lg:w-72 bg-gradient-to-b from-indigo-600 via-indigo-700 to-violet-800 shadow-xl flex-shrink-0 sticky top-0 h-screen">
        {/* Brand */}
        <div className="px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center shadow-lg">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">Admin Panel</h2>
              <p className="text-xs text-indigo-200">Payment Gateway</p>
            </div>
          </div>
        </div>

        {/* Admin info card */}
        {adminInfo && (
          <div className="mx-4 mt-4 bg-white/10 backdrop-blur-sm rounded-xl p-3">
            <div className="flex items-center gap-2 text-white mb-1.5">
              <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center">
                <UserCircle className="w-4 h-4" />
              </div>
              <span className="font-semibold text-sm">{adminInfo.name || 'Admin'}</span>
            </div>
            <div className="flex items-center gap-1.5 text-indigo-200 text-xs ml-9">
              <span className="w-2 h-2 bg-green-400 rounded-full pulse-dot" />
              <span>Online</span>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          {renderGroupedNav()}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-white/10">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/15 text-white hover:bg-red-500/25 transition-all group"
          >
            <LogOut className="w-5 h-5 group-hover:scale-110 transition-transform" />
            <span className="font-medium text-sm">Logout</span>
          </button>
        </div>
      </aside>

      {/* ═══════ MOBILE DRAWER ═══════ */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden anim-fade">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <div
            className="absolute inset-y-0 left-0 w-72 bg-gradient-to-b from-indigo-600 via-indigo-700 to-violet-800 shadow-2xl flex flex-col anim-slide-left"
            style={{ paddingTop: 'env(safe-area-inset-top)' }}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center">
                  <Shield className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-bold text-white">Admin Panel</span>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="w-9 h-9 flex items-center justify-center bg-white/15 rounded-xl hover:bg-white/25"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Admin info */}
            {adminInfo && (
              <div className="mx-4 mb-2 bg-white/10 rounded-xl p-3">
                <div className="flex items-center gap-2 text-white mb-1">
                  <UserCircle className="w-4 h-4" />
                  <span className="font-semibold text-sm">{adminInfo.name || 'Admin'}</span>
                </div>
                <div className="flex items-center gap-1.5 text-indigo-200 text-xs ml-6">
                  <span className="w-2 h-2 bg-green-400 rounded-full pulse-dot" />
                  <span>Online</span>
                </div>
              </div>
            )}

            {/* Navigation */}
            <nav className="flex-1 px-3 py-2 overflow-y-auto">
              {renderGroupedNav('py-3')}
            </nav>

            {/* Logout */}
            <div className="p-3 border-t border-white/10" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-red-500/15 text-white hover:bg-red-500/25"
              >
                <LogOut className="w-5 h-5" />
                <span className="font-medium text-sm">Logout</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ MAIN CONTENT ═══════ */}
      <main className="flex-1 overflow-y-auto min-h-0 pb-24 md:pb-0" style={{ marginTop: 56 }}>
        <div className="md:mt-0" style={{ marginTop: 0 }}>
          <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 md:py-6">
            <Outlet />
          </div>
        </div>
      </main>

      {/* ═══════ MOBILE BOTTOM NAV ═══════ */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)', boxShadow: '0 -2px 8px rgba(0,0,0,.06)' }}
      >
        <div className="flex items-center justify-around px-1 py-1.5">
          {bottomNavItems.map(link => {
            const Icon = link.icon;
            const isActive = location.pathname.startsWith(link.to);
            return (
              <NavLink key={link.to} to={link.to} className="flex-1 flex flex-col items-center gap-0.5">
                <div
                  className="flex items-center justify-center rounded-full transition-colors duration-200"
                  style={{ width: 44, height: 26, backgroundColor: isActive ? '#e0e7ff' : 'transparent' }}
                >
                  <Icon style={{ width: 20, height: 20, color: isActive ? '#4f46e5' : '#94a3b8' }} />
                </div>
                <span style={{ fontSize: 10, color: isActive ? '#4f46e5' : '#94a3b8', fontWeight: isActive ? 700 : 500 }}>
                  {link.shortLabel}
                </span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}