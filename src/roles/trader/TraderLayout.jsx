import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { getAuth, signOut } from 'firebase/auth';
import { query, collection, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  LayoutDashboard, TrendingUp, TrendingDown, Building2,
  AlertCircle, Wallet, LogOut, Menu, X, User,
} from 'lucide-react';

/* ─── Fonts (injected once) ─── */
(() => {
  if (!document.head.querySelector('link[data-trader-fonts]')) {
    const l = document.createElement('link');
    l.dataset.traderFonts = '1';
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap';
    document.head.appendChild(l);
  }
  if (!document.head.querySelector('style[data-trader-globals]')) {
    const s = document.createElement('style');
    s.dataset.traderGlobals = '1';
    s.textContent = `
      :root {
        --font-ui: 'Sora', system-ui, sans-serif;
        --font-mono: 'JetBrains Mono', monospace;
      }
      .trader-root { font-family: var(--font-ui); }

      @keyframes slideInLeft {
        from { transform: translateX(-100%); }
        to   { transform: translateX(0); }
      }
      .anim-slide-left { animation: slideInLeft .26s cubic-bezier(.4,0,.2,1) both; }

      @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
      .anim-fade { animation: fadeIn .18s ease both; }

      @keyframes cardUp {
        from { opacity:0; transform: translateY(10px); }
        to   { opacity:1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(s);
  }
})();

/* ─── Nav config ─── */
const bottomLinks = [
  { to: '/trader/dashboard', icon: LayoutDashboard, label: 'Dashboard', shortLabel: 'Home' },
  { to: '/trader/payin',     icon: TrendingUp,      label: 'Payins',     shortLabel: 'Payins' },
  { to: '/trader/payout',    icon: TrendingDown,    label: 'Payouts',    shortLabel: 'Payouts' },
  { to: '/trader/banks',     icon: Building2,       label: 'Banks & UPI',shortLabel: 'Banks' },
  { to: '/trader/balance',   icon: Wallet,          label: 'Balance',    shortLabel: 'Balance' },
];
const drawerOnlyLinks = [
  { to: '/trader/dispute', icon: AlertCircle, label: 'Disputes' },
];
const allSidebarLinks = [...bottomLinks, ...drawerOnlyLinks];

export default function TraderLayout() {
  const [sidebarOpen, setSidebarOpen]       = useState(false);
  const [traderInfo, setTraderInfo]         = useState(null);
  const [workingBalance, setWorkingBalance] = useState(0);   // ← derived state
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => { fetchTraderInfo(); }, []);
  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  const fetchTraderInfo = async () => {
    try {
      const user = getAuth().currentUser;
      if (!user) return;
      const snap = await getDocs(query(collection(db, 'trader'), where('uid', '==', user.uid)));
      if (!snap.empty) {
        const d = snap.docs[0].data();
        setTraderInfo(d);
        /* ✅ BUG FIX: no `workingBalance` field in Firestore — derive it */
        setWorkingBalance((Number(d.balance) || 0) - (Number(d.securityHold) || 0));
      }
    } catch (e) { console.error(e); }
  };

  const handleLogout = async () => {
    try { await signOut(getAuth()); navigate('/signin'); }
    catch (e) { alert('Logout failed: ' + e.message); }
  };

  const currentTitle = (allSidebarLinks.find(l => location.pathname.startsWith(l.to)) || {}).label || 'Trader Panel';

  /* ── shared sidebar nav renderer ── */
  const renderNav = (links, extraPy = 'py-3') => links.map(link => {
    const Icon = link.icon;
    return (
      <NavLink
        key={link.to}
        to={link.to}
        className={({ isActive }) =>
          `flex items-center gap-3 px-4 ${extraPy} rounded-xl transition-all duration-200 group ${
            isActive ? 'bg-white/20 text-white shadow-sm' : 'text-green-100 hover:bg-white/10 hover:text-white'
          }`
        }
      >
        {({ isActive }) => (
          <>
            <Icon className={`w-5 h-5 transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-105'}`} />
            <span className="font-medium text-sm">{link.label}</span>
          </>
        )}
      </NavLink>
    );
  });

  return (
    <div className="trader-root w-full min-h-screen flex flex-col md:flex-row bg-slate-50">

      {/* ════════ MOBILE TOP BAR ════════ */}
      <header
        className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-slate-200"
        style={{ paddingTop: 'env(safe-area-inset-top)', boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}
      >
        <div className="flex items-center justify-between px-4" style={{ height: 56 }}>
          <button onClick={() => setSidebarOpen(true)} className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-slate-100" aria-label="Menu">
            <Menu className="w-5 h-5 text-slate-700" />
          </button>
          <h1 className="text-sm font-bold text-slate-900 tracking-tight">{currentTitle}</h1>
          {/* ✅ displays computed workingBalance */}
          <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-1">
            <span className="text-xs font-bold text-green-700">₹{workingBalance.toLocaleString()}</span>
          </div>
        </div>
      </header>

      {/* ════════ DESKTOP SIDEBAR ════════ */}
      <aside className="hidden md:flex md:flex-col md:w-64 lg:w-72 bg-gradient-to-b from-green-600 via-emerald-600 to-teal-700 shadow-xl flex-shrink-0">
        <div className="px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-green-400 rounded-xl flex items-center justify-center shadow-lg">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">Trader Panel</h2>
              <p className="text-xs text-green-200">Payment Processing</p>
            </div>
          </div>
        </div>

        {/* ✅ computed workingBalance */}
        {traderInfo && (
          <div className="mx-4 mt-4 bg-white/10 backdrop-blur-sm rounded-xl p-3">
            <div className="flex items-center gap-2 text-white mb-1.5">
              <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center"><User className="w-4 h-4" /></div>
              <span className="font-semibold text-sm">{traderInfo.name || 'Trader'}</span>
            </div>
            <div className="text-green-100 text-xs ml-9">Working: ₹{workingBalance.toLocaleString()}</div>
          </div>
        )}

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">{renderNav(allSidebarLinks)}</nav>

        <div className="p-3 border-t border-white/10">
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/15 text-white hover:bg-red-500/25 transition-all group">
            <LogOut className="w-5 h-5 group-hover:scale-110 transition-transform" />
            <span className="font-medium text-sm">Logout</span>
          </button>
        </div>
      </aside>

      {/* ════════ MOBILE DRAWER (with slide-in) ════════ */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden anim-fade">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          {/* ✅ slide-in-left keyframe animation */}
          <div className="absolute inset-y-0 left-0 w-72 bg-gradient-to-b from-green-600 via-emerald-600 to-teal-700 shadow-2xl flex flex-col anim-slide-left" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
            <div className="flex items-center justify-between px-5 pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-gradient-to-br from-yellow-400 to-green-400 rounded-xl flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-bold text-white">Trader Panel</span>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="w-9 h-9 flex items-center justify-center bg-white/15 rounded-xl hover:bg-white/25">
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* ✅ computed workingBalance */}
            {traderInfo && (
              <div className="mx-4 mb-2 bg-white/10 rounded-xl p-3">
                <div className="flex items-center gap-2 text-white mb-1">
                  <User className="w-4 h-4" />
                  <span className="font-semibold text-sm">{traderInfo.name || 'Trader'}</span>
                </div>
                <div className="text-green-100 text-xs ml-6">Working: ₹{workingBalance.toLocaleString()}</div>
              </div>
            )}

            <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">{renderNav(allSidebarLinks, 'py-3.5')}</nav>

            <div className="p-3 border-t border-white/10" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
              <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-red-500/15 text-white hover:bg-red-500/25">
                <LogOut className="w-5 h-5" /><span className="font-medium text-sm">Logout</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════ MAIN CONTENT ════════ */}
      <main className="flex-1 overflow-y-auto min-h-0 pb-24 md:pb-0" style={{ marginTop: 56 }}>
        <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 md:py-6">
          <Outlet />
        </div>
      </main>

      {/* ════════ MOBILE BOTTOM NAV (5 items, pill active) ════════ */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)', boxShadow: '0 -2px 8px rgba(0,0,0,.06)' }}
      >
        <div className="flex items-center justify-around px-1 py-1.5">
          {bottomLinks.map(link => {
            const Icon     = link.icon;
            const isActive = location.pathname.startsWith(link.to);
            return (
              <NavLink key={link.to} to={link.to} className="flex-1 flex flex-col items-center gap-0.5">
                {/* ✅ pill bg, 44px-wide touch target */}
                <div
                  className="flex items-center justify-center rounded-full transition-colors duration-200"
                  style={{ width: 44, height: 26, backgroundColor: isActive ? '#dcfce7' : 'transparent' }}
                >
                  <Icon style={{ width: 20, height: 20, color: isActive ? '#16a34a' : '#94a3b8' }} />
                </div>
                <span style={{ fontSize: 10, color: isActive ? '#16a34a' : '#94a3b8', fontWeight: isActive ? 700 : 500 }}>
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