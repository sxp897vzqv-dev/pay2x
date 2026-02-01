// File: src/App.jsx
import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from './firebase';

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

// Admin Components (if you have them)
// Uncomment when you add admin panel
 import AdminLayout from './roles/admin/AdminLayout';
 import AdminDashboard from './roles/admin/pages/Dashboard/AdminDashboard';
 import AdminTraders from './roles/admin/pages/Traders/AdminTraders';
 import AdminMerchants from './roles/admin/pages/Merchants/AdminMerchants';
import AdminTransactions from './roles/admin/pages/Transactions/AdminTransactions';
 import AdminPayoutRequests from './roles/admin/pages/Payouts/AdminPayoutRequests';
 import AdminDisputes from './roles/admin/pages/Disputes/AdminDisputes';
import AdminSettings from './roles/admin/pages/Settings/AdminSettings';
 import { AdminAnalytics, AdminReports } from './roles/admin/pages/Analytics/AdminAnalyticsReports';

// Merchant Components (if you have them)
// Uncomment when you add merchant panel
 import MerchantLayout from './roles/merchant/MerchantLayout';
 import MerchantDashboard from './roles/merchant/pages/Dashboard/MerchantDashboard';
import MerchantTransactions from './roles/merchant/pages/Transactions/MerchantTransactions';

import MerchantDocumentation from './roles/merchant/pages/Api/Merchantdocumentation';
import MerchantSettings from './roles/merchant/pages/Settings/Merchantsettings';
import Merchantpayoutdashboard from './roles/merchant/pages/Payout/Merchantpayoutdashboard';
import MerchantSettlement from './roles/merchant/pages/Settlement/Merchantsettlement';
import MerchantDisputeCreate from './roles/merchant/pages/Dispute/Merchantdisputecreate';



// Protected Route Component
function ProtectedRoute({ children, allowedRole, userRole }) {
  if (!userRole) {
    return <Navigate to="/signin" replace />;
  }
  if (userRole !== allowedRole) {
    return <Navigate to={`/${userRole}/dashboard`} replace />;
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
          // Check all role collections using query (more reliable)
          const roleCollections = ['admin', 'merchant', 'trader'];
          
          for (let role of roleCollections) {
            const q = query(
              collection(db, role),
              where('uid', '==', user.uid)
            );
            const querySnap = await getDocs(q);
            
            if (!querySnap.empty) {
              console.log(`✅ User role found: ${role}`);
              setUserRole(role);
              setLoading(false);
              setInitializing(false);
              return;
            }
          }
          
          // No role found - sign out user
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

  // Show loading screen during initialization
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
              <Navigate to={`/${userRole}/dashboard`} replace />
            ) : (
              <SignIn />
            )
          } 
        />

        {/* Admin Routes */}
       
        <Route
          path="/admin/*"
          element={
            <ProtectedRoute userRole={userRole} allowedRole="admin">
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="traders" element={<AdminTraders />} />
          <Route path="merchants" element={<AdminMerchants />} />
          <Route path="transactions" element={<AdminTransactions />} />
          <Route path="payouts" element={<AdminPayoutRequests />} />
          <Route path="disputes" element={<AdminDisputes />} />
          <Route path="analytics" element={<AdminAnalytics />} />
          <Route path="reports" element={<AdminReports />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>
        

        {/* Merchant Routes */}
        {/* Uncomment when you add merchant panel */}
       
        <Route
          path="/merchant/*"
          element={
            <ProtectedRoute userRole={userRole} allowedRole="merchant">
              <MerchantLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/merchant/dashboard" replace />} />
          <Route path="dashboard" element={<MerchantDashboard />} />
           <Route path="transactions" element={<MerchantTransactions />} />
           <Route path="settings" element={<MerchantSettings/>} />
            <Route path="api-docs" element={<MerchantDocumentation />} />
            <Route path="payout" element={<Merchantpayoutdashboard/>} />
            <Route path="settlement" element={<MerchantSettlement/>} />
            <Route path="dispute" element={<MerchantDisputeCreate/>} />
        </Route>
        

        {/* Trader Routes */}
        <Route
          path="/trader/*"
          element={
            <ProtectedRoute userRole={userRole} allowedRole="trader">
              <TraderLayout />
            </ProtectedRoute>
          }
        >
          {/* Index redirects to dashboard */}
          <Route index element={<Navigate to="/trader/dashboard" replace />} />
          
          {/* Trader Pages */}
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
              <Navigate to={`/${userRole}/dashboard`} replace />
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