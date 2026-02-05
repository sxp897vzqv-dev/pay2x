// File: src/App.jsx
import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from './firebase';
import { initIPCapture } from './utils/ipCapture';

// Initialize IP capture on app load (for audit logging)
initIPCapture();

// Common Components (static - needed immediately)
import SignIn from './SignIn';

// ═══════════════════════════════════════════════════════════════════
// LAZY-LOADED COMPONENTS (React.lazy code splitting)
// ═══════════════════════════════════════════════════════════════════

// Layouts
const TraderLayout = React.lazy(() => import('./roles/trader/TraderLayout'));
const AdminLayout = React.lazy(() => import('./roles/admin/AdminLayout'));
const MerchantLayout = React.lazy(() => import('./roles/merchant/MerchantLayout'));

// Trader pages
const TraderDashboard = React.lazy(() => import('./roles/trader/Dashboard/TraderDashboard'));
const TraderBalance = React.lazy(() => import('./roles/trader/Balance/TraderBalance'));
const TraderBank = React.lazy(() => import('./roles/trader/Banks/TraderBank'));
const TraderPayin = React.lazy(() => import('./roles/trader/Payin/TraderPayin'));
const TraderPayout = React.lazy(() => import('./roles/trader/Payout/TraderPayout'));
const TraderDispute = React.lazy(() => import('./roles/trader/Disputes/TraderDispute'));

// Admin pages
const AdminDashboard = React.lazy(() => import('./roles/admin/OVERVIEW/AdminDashboard'));
const AdminTraderList = React.lazy(() => import('./roles/admin/ENTITIES/AdminTraderList'));
const AdminTraderDetail = React.lazy(() => import('./roles/admin/ENTITIES/AdminTraderDetail'));
const AdminMerchantList = React.lazy(() => import('./roles/admin/ENTITIES/AdminMerchantList'));
const AdminMerchantDetail = React.lazy(() => import('./roles/admin/ENTITIES/AdminMerchantDetail'));
const AdminUserList = React.lazy(() => import('./roles/admin/ENTITIES/AdminUserList'));
const AdminUserDetail = React.lazy(() => import('./roles/admin/ENTITIES/AdminUserDetail'));
const AdminPayins = React.lazy(() => import('./roles/admin/OPERATIONS/AdminPayins'));
const AdminPayouts = React.lazy(() => import('./roles/admin/OPERATIONS/AdminPayouts'));
const AdminDisputes = React.lazy(() => import('./roles/admin/OPERATIONS/AdminDisputes'));
const AdminUPIPool = React.lazy(() => import('./roles/admin/OPERATIONS/AdminUPIPool'));
const AdminLogs = React.lazy(() => import('./roles/admin/AUDIT/AdminLogs'));
const AdminCommission = React.lazy(() => import('./roles/admin/AUDIT/AdminCommission'));
const AdminReviewQueue = React.lazy(() => import('./roles/admin/AUDIT/AdminReviewQueue'));
const AdminPayinEngine = React.lazy(() => import('./roles/admin/AdminPayinEngine'));
const AdminPayoutEngine = React.lazy(() => import('./roles/admin/AdminPayoutEngine'));
const AdminDisputeEngine = React.lazy(() => import('./roles/admin/AdminDisputeEngine'));
const AdminWorkers = React.lazy(() => import('./roles/admin/AdminWorkers'));

// Merchant pages
const MerchantDashboard = React.lazy(() => import('./roles/merchant/MerchantDashboard'));
const MerchantPayin = React.lazy(() => import('./roles/merchant/MerchantPayin'));
const MerchantPayout = React.lazy(() => import('./roles/merchant/MerchantPayout'));
const MerchantBalance = React.lazy(() => import('./roles/merchant/MerchantBalance'));
const MerchantAPI = React.lazy(() => import('./roles/merchant/MerchantAPI'));
const MerchantAnalytics = React.lazy(() => import('./roles/merchant/MerchantAnalytics'));
const MerchantDispute = React.lazy(() => import('./roles/merchant/MerchantDispute'));
const MerchantSettings = React.lazy(() => import('./roles/merchant/MerchantSettings'));

// Protected Route Component
function ProtectedRoute({ children, allowedRole, userRole }) {
  if (!userRole) {
    return <Navigate to="/signin" replace />;
  }
  // Workers access admin routes
  if (allowedRole === 'admin' && userRole === 'worker') {
    return children;
  }
  if (userRole !== allowedRole) {
    return <Navigate to={`/${userRole === 'worker' ? 'admin' : userRole}/dashboard`} replace />;
  }
  return children;
}

// Loading Component
function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="text-center">
        <div className="relative w-20 h-20 mx-auto mb-6">
          <div className="absolute inset-0 border-4 border-blue-200 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Loading Pay2x</h2>
        <p className="text-gray-600">Please wait...</p>
      </div>
    </div>
  );
}

// Not Found Component
function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 px-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-900 mb-4">404</h1>
        <p className="text-xl text-gray-600 mb-8">Page not found</p>
        <a
          href="/signin"
          className="inline-block px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium"
        >
          Back to Sign In
        </a>
      </div>
    </div>
  );
}

// Suspense fallback for lazy-loaded pages
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-slate-500">Loading...</p>
      </div>
    </div>
  );
}

function App() {
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const roleCollections = ['worker', 'admin', 'merchant', 'trader'];
          
          for (let role of roleCollections) {
            const q = query(
              collection(db, role),
              where('uid', '==', user.uid)
            );
            const querySnap = await getDocs(q);
            
            if (!querySnap.empty) {
              console.log(`✅ User role found: ${role}`);
              // Workers use admin routes
              setUserRole(role === 'worker' ? 'worker' : role);
              setLoading(false);
              setInitializing(false);
              return;
            }
          }
          
          console.warn('⚠️ No role found for user:', user.uid);
          await auth.signOut();
          setUserRole(null);
        } catch (error) {
          console.error('❌ Error checking user role:', error);
          setUserRole(null);
        }
      } else {
        setUserRole(null);
      }
      
      setLoading(false);
      setInitializing(false);
    });

    return () => unsubscribe();
  }, []);

  if (initializing || loading) {
    return <LoadingScreen />;
  }

  return (
    <Router>
      <React.Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public Route - Sign In */}
        <Route 
          path="/signin" 
          element={
            userRole ? (
              <Navigate to={`/${userRole === 'worker' ? 'admin' : userRole}/dashboard`} replace />
            ) : (
              <SignIn />
            )
          } 
        />

        {/* ═══════════════════════════════════════════════════════════════
            ADMIN ROUTES - 13 Pages
            ═══════════════════════════════════════════════════════════════ */}
        <Route
          path="/admin/*"
          element={
            <ProtectedRoute userRole={userRole} allowedRole="admin">
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          {/* Default redirect */}
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          
          {/* Overview */}
          <Route path="dashboard" element={<AdminDashboard />} />
          
          {/* Entity Management */}
          <Route path="traders" element={<AdminTraderList />} />
          <Route path="traders/:id" element={<AdminTraderDetail />} />
          <Route path="merchants" element={<AdminMerchantList />} />
          <Route path="merchants/:id" element={<AdminMerchantDetail />} />
          <Route path="users" element={<AdminUserList />} />
          <Route path="users/:id" element={<AdminUserDetail />} />
          
          {/* Operations */}
          <Route path="payins" element={<AdminPayins />} />
          <Route path="payouts" element={<AdminPayouts />} />
          <Route path="disputes" element={<AdminDisputes />} />
          <Route path="upi-pool" element={<AdminUPIPool />} />
          
          {/* Audit */}
          <Route path="logs" element={<AdminLogs />} />
          <Route path="review-queue" element={<AdminReviewQueue />} />
          <Route path="commission" element={<AdminCommission />} />
          
          {/* Engine */}
          <Route path="payin-engine" element={<AdminPayinEngine />} />
          <Route path="payout-engine" element={<AdminPayoutEngine />} />
          <Route path="dispute-engine" element={<AdminDisputeEngine />} />
          <Route path="workers" element={<AdminWorkers />} />
        </Route>

        {/* ═══════════════════════════════════════════════════════════════
            NEW MERCHANT ROUTES - 8 Pages (UPDATED)
            ═══════════════════════════════════════════════════════════════ */}
        <Route
          path="/merchant/*"
          element={
            <ProtectedRoute userRole={userRole} allowedRole="merchant">
              <MerchantLayout />
            </ProtectedRoute>
          }
        >
          {/* Default redirect */}
          <Route index element={<Navigate to="/merchant/dashboard" replace />} />
          
          {/* 8 Core Pages */}
          <Route path="dashboard" element={<MerchantDashboard />} />
          <Route path="payins" element={<MerchantPayin />} />
          <Route path="payouts" element={<MerchantPayout />} />
          <Route path="balance" element={<MerchantBalance />} />
          <Route path="api" element={<MerchantAPI />} />
          <Route path="analytics" element={<MerchantAnalytics />} />
          <Route path="disputes" element={<MerchantDispute />} />
          <Route path="settings" element={<MerchantSettings />} />
        </Route>

        {/* ═══════════════════════════════════════════════════════════════
            TRADER ROUTES - 6 Pages
            ═══════════════════════════════════════════════════════════════ */}
        <Route
          path="/trader/*"
          element={
            <ProtectedRoute userRole={userRole} allowedRole="trader">
              <TraderLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/trader/dashboard" replace />} />
          <Route path="dashboard" element={<TraderDashboard />} />
          <Route path="payin" element={<TraderPayin />} />
          <Route path="payout" element={<TraderPayout />} />
          <Route path="banks" element={<TraderBank />} />
          <Route path="balance" element={<TraderBalance />} />
          <Route path="dispute" element={<TraderDispute />} />
        </Route>

        {/* Root redirect based on role */}
        <Route
          path="/"
          element={
            userRole ? (
              <Navigate to={`/${userRole === 'worker' ? 'admin' : userRole}/dashboard`} replace />
            ) : (
              <Navigate to="/signin" replace />
            )
          }
        />

        {/* Catch all - 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
      </React.Suspense>
    </Router>
  );
}

export default App;