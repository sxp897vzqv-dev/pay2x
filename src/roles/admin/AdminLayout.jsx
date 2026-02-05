import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { getAuth, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { ThemeProvider, useTheme } from '../../context/ThemeContext';
import GlobalSearch from '../../components/admin/GlobalSearch';
import NotificationCenter from '../../components/admin/NotificationCenter';
import {
  LayoutDashboard, Users, Store, UserCircle, TrendingUp, TrendingDown,
  AlertCircle, Database, FileText, DollarSign, LogOut, Menu, X, Shield,
  ChevronDown, ChevronRight, Settings, Bell, Cpu, Sun, Moon, Search,
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

      /* ─── Dark mode overrides (scoped to admin-root) ─── */
      .dark .admin-root { color-scheme: dark; }

      .dark .admin-root .bg-white { background-color: rgb(30 41 59) !important; }
      .dark .admin-root .border-slate-200 { border-color: rgb(51 65 85) !important; }
      .dark .admin-root .border-slate-100 { border-color: rgb(51 65 85) !important; }
      .dark .admin-root .bg-slate-50 { background-color: rgb(15 23 42) !important; }
      .dark .admin-root .bg-slate-100 { background-color: rgb(30 41 59) !important; }
      .dark .admin-root .text-slate-900 { color: rgb(241 245 249) !important; }
      .dark .admin-root .text-slate-800 { color: rgb(226 232 240) !important; }
      .dark .admin-root .text-slate-700 { color: rgb(203 213 225) !important; }
      .dark .admin-root .text-slate-600 { color: rgb(148 163 184) !important; }
      .dark .admin-root .text-slate-500 { color: rgb(148 163 184) !important; }
      .dark .admin-root .bg-slate-200 { background-color: rgb(51 65 85) !important; }
      .dark .admin-root .divide-slate-100 > :not([hidden]) ~ :not([hidden]) { border-color: rgb(51 65 85) !important; }
      .dark .admin-root .divide-slate-200 > :not([hidden]) ~ :not([hidden]) { border-color: rgb(51 65 85) !important; }
      .dark .admin-root .border-slate-300 { border-color: rgb(51 65 85) !important; }
      .dark .admin-root .bg-gray-50 { background-color: rgb(15 23 42) !important; }
      .dark .admin-root .bg-gray-100 { background-color: rgb(30 41 59) !important; }
      .dark .admin-root .text-gray-900 { color: rgb(241 245 249) !important; }
      .dark .admin-root .text-gray-800 { color: rgb(226 232 240) !important; }
      .dark .admin-root .text-gray-700 { color: rgb(203 213 225) !important; }
      .dark .admin-root .text-gray-600 { color: rgb(148 163 184) !important; }
      .dark .admin-root .text-gray-500 { color: rgb(148 163 184) !important; }
      .dark .admin-root .ring-slate-200 { --tw-ring-color: rgb(51 65 85) !important; }
      .dark .admin-root .hover\\:bg-slate-50:hover { background-color: rgb(30 41 59) !important; }
      .dark .admin-root .hover\\:bg-slate-100:hover { background-color: rgb(51 65 85) !important; }
      .dark .admin-root .hover\\:bg-gray-50:hover { background-color: rgb(30 41 59) !important; }
      .dark .admin-root input,
      .dark .admin-root select,
      .dark .admin-root textarea {
        background-color: rgb(15 23 42) !important;
        color: rgb(226 232 240) !important;
        border-color: rgb(51 65 85) !important;
      }
      .dark .admin-root input::placeholder,
      .dark .admin-root textarea::placeholder {
        color: rgb(100 116 139) !important;
      }
    `;
    document.head.appendChild(s);
  }
})();

/* ─── Route → Permission mapping ─── */
const ROUTE_PERMISSIONS = {
  '/admin/dashboard': null,
  '/admin/traders': 'traders',
  '/admin/merchants': 'merchants',
  '/admin/users': 'users',
  '/admin/payins': 'payins',
  '/admin/payouts': 'payouts',
  '/admin/disputes': 'disputes',
  '/admin/upi-pool': 'upi_pool',
  '/admin/payin-engine': 'payin_engine',
  '/admin/payout-engine': 'payout_engine',
  '/admin/dispute-engine': 'dispute_engine',
  '/admin/logs': 'logs',
  '/admin/commission': 'commission',
  '/admin/workers': 'admin_only',
};

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
      { to: '/admin/payins',       icon: TrendingUp,   label: 'Payins',       shortLabel: 'Payins' },
      { to: '/admin/payouts',      icon: TrendingDown, label: 'Payouts',      shortLabel: 'Payouts' },
      { to: '/admin/disputes',     icon: AlertCircle,  label: 'Disputes',     shortLabel: 'Disputes' },
      { to: '/admin/upi-pool',     icon: Database,     label: 'UPI Pool',     shortLabel: 'Pool' },
      { to: '/admin/payin-engine', icon: Cpu,          label: 'Payin Engine', shortLabel: 'Payin E.' },
      { to: '/admin/payout-engine', icon: Cpu,        label: 'Payout Engine', shortLabel: 'Payout E.' },
      { to: '/admin/dispute-engine', icon: Cpu,       label: 'Dispute Engine', shortLabel: 'Dispute E.' },
    ],
  },
  {
    label: 'Audit',
    items: [
      { to: '/admin/logs',       icon: FileText,   label: 'Logs',       shortLabel: 'Logs' },
      { to: '/admin/commission', icon: DollarSign, label: 'Commission', shortLabel: 'Comm.' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { to: '/admin/workers', icon: Users, label: 'Workers', shortLabel: 'Workers' },
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

/* ─── Inner layout (needs ThemeContext) ─── */
function AdminLayoutInner() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adminInfo, setAdminInfo]     = useState(null);
  const [expandedGroups, setExpandedGroups] = useState(['Overview', 'Entities', 'Operations', 'Audit', 'Settings']);
  const [searchOpen, setSearchOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  /* ─── Role & Permission logic ─── */
  const userRole = localStorage.getItem('pay2x_user_role');
  const workerPermissions = JSON.parse(localStorage.getItem('pay2x_worker_permissions') || '[]');
  const isAdmin = userRole === 'admin';

  const getPermissionForRoute = (route) => {
    return ROUTE_PERMISSIONS[route] ?? null;
  };

  const canAccess = (route) => {
    if (isAdmin) return true;
    const perm = getPermissionForRoute(route);
    if (perm === null) return true;
    if (perm === 'admin_only') return false;
    return workerPermissions.includes(perm);
  };

  const filteredNavGroups = navGroups.map(group => ({
    ...group,
    items: group.items.filter(item => canAccess(item.to))
  })).filter(group => group.items.length > 0);

  const filteredBottomNav = bottomNavItems.filter(item => canAccess(item.to));

  useEffect(() => { fetchAdminInfo(); }, []);
  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  /* ─── Ctrl+K / Cmd+K global shortcut ─── */
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const fetchAdminInfo = async () => {
    try {
      const user = getAuth().currentUser;
      if (!user) return;
      const role = localStorage.getItem('pay2x_user_role');
      const collectionName = role === 'worker' ? 'worker' : 'admins';
      const snap = await getDoc(doc(db, collectionName, user.uid));
      if (snap.exists()) {
        setAdminInfo(snap.data());
      } else {
        setAdminInfo({ name: user.displayName || user.email?.split('@')[0] || 'Admin' });
      }
    } catch (e) { console.error(e); }
  };

  const handleLogout = async () => {
    try {
      localStorage.removeItem('pay2x_user_role');
      localStorage.removeItem('pay2x_worker_permissions');
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
      {filteredNavGroups.map(group => {
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
    <div className="admin-root w-full min-h-screen flex flex-col md:flex-row bg-slate-50 dark:bg-slate-900">

      {/* ═══════ GLOBAL SEARCH MODAL ═══════ */}
      <GlobalSearch isOpen={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* ═══════ MOBILE TOP BAR ═══════ */}
      <header
        className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700"
        style={{ paddingTop: 'env(safe-area-inset-top)', boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}
      >
        <div className="flex items-center justify-between px-4" style={{ height: 56 }}>
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-slate-100 dark:active:bg-slate-700"
            aria-label="Menu"
          >
            <Menu className="w-5 h-5 text-slate-700 dark:text-slate-200" />
          </button>
          <h1 className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight">{currentTitle}</h1>
          <div className="flex items-center gap-2">
            {/* Search button */}
            <button
              onClick={() => setSearchOpen(true)}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600"
              aria-label="Search"
            >
              <Search className="w-4 h-4 text-slate-600 dark:text-slate-300" />
            </button>
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600"
              aria-label="Toggle theme"
            >
              {theme === 'dark'
                ? <Sun className="w-4 h-4 text-amber-500" />
                : <Moon className="w-4 h-4 text-slate-600" />
              }
            </button>
            {/* Notifications */}
            <NotificationCenter />
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
              <h2 className="text-lg font-bold text-white leading-tight">{isAdmin ? 'Admin Panel' : 'Worker Panel'}</h2>
              <p className="text-xs text-indigo-200">Payment Gateway</p>
            </div>
          </div>
        </div>

        {/* Search button in sidebar */}
        <div className="px-3 pt-4 pb-1">
          <button
            onClick={() => setSearchOpen(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-indigo-100 hover:text-white transition-all"
          >
            <Search className="w-4 h-4" />
            <span className="text-sm">Search…</span>
            <kbd className="ml-auto text-[10px] bg-white/10 rounded px-1.5 py-0.5 text-indigo-200">⌘K</kbd>
          </button>
        </div>

        {/* Admin info card */}
        {adminInfo && (
          <div className="mx-4 mt-3 bg-white/10 backdrop-blur-sm rounded-xl p-3">
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

        {/* Theme toggle + Logout */}
        <div className="p-3 border-t border-white/10 space-y-2">
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/10 text-white hover:bg-white/15 transition-all group"
          >
            {theme === 'dark'
              ? <Sun className="w-5 h-5 text-amber-400 group-hover:scale-110 transition-transform" />
              : <Moon className="w-5 h-5 text-indigo-200 group-hover:scale-110 transition-transform" />
            }
            <span className="font-medium text-sm">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
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
                <span className="text-lg font-bold text-white">{isAdmin ? 'Admin Panel' : 'Worker Panel'}</span>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="w-9 h-9 flex items-center justify-center bg-white/15 rounded-xl hover:bg-white/25"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Admin/Worker info */}
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
        {/* Desktop header bar with search + notifications */}
        <div className="hidden md:flex items-center justify-end gap-3 px-6 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 text-sm hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            <Search className="w-4 h-4" />
            <span>Search…</span>
            <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-800 rounded text-[10px] border border-slate-200 dark:border-slate-600 ml-4">Ctrl+K</kbd>
          </button>
          <NotificationCenter />
        </div>
        <div className="md:mt-0" style={{ marginTop: 0 }}>
          <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 md:py-6">
            <Outlet />
          </div>
        </div>
      </main>

      {/* ═══════ MOBILE BOTTOM NAV ═══════ */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)', boxShadow: '0 -2px 8px rgba(0,0,0,.06)' }}
      >
        <div className="flex items-center justify-around px-1 py-1.5">
          {filteredBottomNav.map(link => {
            const Icon = link.icon;
            const isActive = location.pathname.startsWith(link.to);
            return (
              <NavLink key={link.to} to={link.to} className="flex-1 flex flex-col items-center gap-0.5">
                <div
                  className="flex items-center justify-center rounded-full transition-colors duration-200"
                  style={{ width: 44, height: 26, backgroundColor: isActive ? '#e0e7ff' : 'transparent' }}
                >
                  <Icon style={{ width: 20, height: 20, color: isActive ? '#4f46e5' : theme === 'dark' ? '#94a3b8' : '#94a3b8' }} />
                </div>
                <span style={{ fontSize: 10, color: isActive ? '#4f46e5' : theme === 'dark' ? '#94a3b8' : '#94a3b8', fontWeight: isActive ? 700 : 500 }}>
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

/* ─── Exported wrapper with ThemeProvider ─── */
export default function AdminLayout() {
  return (
    <ThemeProvider>
      <AdminLayoutInner />
    </ThemeProvider>
  );
}
