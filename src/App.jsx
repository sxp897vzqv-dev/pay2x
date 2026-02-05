// File: src/App.jsx
import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from './firebase';
import { initIPCapture } from './utils/ipCapture';

// Initialize IP capture on app load (for audit logging)
initIPCapture();

// Common Components
import SignIn from './SignIn';

// Trader Components
import TraderLayout from './roles/trader/TraderLayout';
import TraderDashboard from './roles/trader/Dashboard/TraderDashboard';
import TraderBalance from './roles/trader/Balance/TraderBalance';
import TraderBank from './roles/trader/Banks/TraderBank';
import TraderPayin from './roles/trader/Payin/TraderPayin';
import TraderPayout from './roles/trader/Payout/TraderPayout';
import TraderDispute from './roles/trader/Disputes/TraderDispute';

// ═══════════════════════════════════════════════════════════════════
// ADMIN COMPONENTS
// ═══════════════════════════════════════════════════════════════════
import AdminLayout from './roles/admin/AdminLayout';
import AdminDashboard from './roles/admin/OVERVIEW/AdminDashboard';
import AdminTraderList from './roles/admin/ENTITIES/AdminTraderList';
import AdminTraderDetail from './roles/admin/ENTITIES/AdminTraderDetail';
import AdminMerchantList from './roles/admin/ENTITIES/AdminMerchantList';
import AdminMerchantDetail from './roles/admin/ENTITIES/AdminMerchantDetail';
import AdminUserList from './roles/admin/ENTITIES/AdminUserList';
import AdminUserDetail from './roles/admin/ENTITIES/AdminUserDetail';
import AdminPayins from './roles/admin/OPERATIONS/AdminPayins';
import AdminPayouts from './roles/admin/OPERATIONS/AdminPayouts';
import AdminDisputes from './roles/admin/OPERATIONS/AdminDisputes';
import AdminUPIPool from './roles/admin/OPERATIONS/AdminUPIPool';
import AdminLogs from './roles/admin/AUDIT/AdminLogs';
import AdminCommission from './roles/admin/AUDIT/AdminCommission';
import AdminReviewQueue from './roles/admin/AUDIT/AdminReviewQueue';
import AdminPayinEngine from './roles/admin/AdminPayinEngine';
import AdminPayoutEngine from './roles/admin/AdminPayoutEngine';
import AdminDisputeEngine from './roles/admin/AdminDisputeEngine';
import AdminWorkers from './roles/admin/AdminWorkers';

// ═══════════════════════════════════════════════════════════════════
// NEW MERCHANT COMPONENTS - 8 Pages
// Place these files in: src/roles/merchant/
// ═══════════════════════════════════════════════════════════════════
import MerchantLayout from './roles/merchant/MerchantLayout';
import MerchantDashboard from './roles/merchant/MerchantDashboard';
import MerchantPayin from './roles/merchant/MerchantPayin';
import MerchantPayout from './roles/merchant/MerchantPayout';
import MerchantBalance from './roles/merchant/MerchantBalance';
import MerchantAPI from './roles/merchant/MerchantAPI';
import MerchantAnalytics from './roles/merchant/MerchantAnalytics';
import MerchantDispute from './roles/merchant/MerchantDispute';
import MerchantSettings from './roles/merchant/MerchantSettings';

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
    </Router>
  );
}

export default App;