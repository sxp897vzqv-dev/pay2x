/**
 * Admin Panel Route Configuration
 * 
 * Structure:
 * /admin
 *   /dashboard      - Overview dashboard
 *   /traders        - Trader list
 *   /traders/:id    - Trader detail
 *   /merchants      - Merchant list
 *   /merchants/:id  - Merchant detail
 *   /users          - User list
 *   /users/:id      - User detail
 *   /payins         - All payins
 *   /payouts        - All payouts
 *   /disputes       - All disputes
 *   /upi-pool       - UPI pool management
 *   /logs           - Audit logs
 *   /commission     - Commission audit
 *   /review-queue   - Review queue
 */

import React from 'react';
import { Route } from 'react-router-dom';

// Layout
import AdminLayout from './AdminLayout';

// Overview
import AdminDashboard from './OVERVIEW/AdminDashboard';

// Entity Management
import AdminTraderList from './ENTITIES/AdminTraderList';
import AdminTraderDetail from './ENTITIES/AdminTraderDetail';
import AdminMerchantList from './ENTITIES/AdminMerchantList';
import AdminMerchantDetail from './ENTITIES/AdminMerchantDetail';
import AdminUserList from './ENTITIES/AdminUserList';
import AdminUserDetail from './ENTITIES/AdminUserDetail';

// Operations
import AdminPayins from './OPERATIONS/AdminPayins';
import AdminPayouts from './OPERATIONS/AdminPayouts';
import AdminDisputes from './OPERATIONS/AdminDisputes';
import AdminUPIPool from './OPERATIONS/AdminUPIPool';

// Audit
import AdminLogs from './AUDIT/AdminLogs';
import AdminCommission from './AUDIT/AdminCommission';
import AdminReviewQueue from './AUDIT/AdminReviewQueue';

// Engine
import AdminPayinEngine from './AdminPayinEngine';

export const adminRoutes = (
  <Route path="/admin" element={<AdminLayout />}>
    {/* Default redirect to dashboard */}
    <Route index element={<AdminDashboard />} />
    
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
  </Route>
);

/**
 * Navigation structure for sidebar/drawer
 */
export const adminNavigation = {
  groups: [
    {
      label: 'Overview',
      items: [
        { to: '/admin/dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
      ],
    },
    {
      label: 'Entities',
      items: [
        { to: '/admin/traders', label: 'Traders', icon: 'Users' },
        { to: '/admin/merchants', label: 'Merchants', icon: 'Store' },
        { to: '/admin/users', label: 'Users', icon: 'UserCircle' },
      ],
    },
    {
      label: 'Operations',
      items: [
        { to: '/admin/payins', label: 'Payins', icon: 'TrendingUp' },
        { to: '/admin/payouts', label: 'Payouts', icon: 'TrendingDown' },
        { to: '/admin/disputes', label: 'Disputes', icon: 'AlertCircle' },
        { to: '/admin/upi-pool', label: 'UPI Pool', icon: 'Database' },
        { to: '/admin/payin-engine', label: 'Payin Engine', icon: 'Cpu' },
      ],
    },
    {
      label: 'Audit',
      items: [
        { to: '/admin/logs', label: 'Logs', icon: 'FileText' },
        { to: '/admin/review-queue', label: 'Review Queue', icon: 'ClipboardCheck' },
        { to: '/admin/commission', label: 'Commission', icon: 'DollarSign' },
      ],
    },
  ],
  bottomNav: [
    { to: '/admin/dashboard', label: 'Home', shortLabel: 'Home', icon: 'LayoutDashboard' },
    { to: '/admin/traders', label: 'Traders', shortLabel: 'Traders', icon: 'Users' },
    { to: '/admin/payins', label: 'Payins', shortLabel: 'Payins', icon: 'TrendingUp' },
    { to: '/admin/payouts', label: 'Payouts', shortLabel: 'Payouts', icon: 'TrendingDown' },
    { to: '/admin/logs', label: 'Logs', shortLabel: 'Logs', icon: 'FileText' },
  ],
};

export default adminRoutes;
