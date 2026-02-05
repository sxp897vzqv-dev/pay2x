import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { checkEntityActive } from './utils/supabaseAuth';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle,
  Loader,
  TrendingUp,
  Shield,
  Zap,
} from 'lucide-react';
import { logAuditEvent } from './utils/auditLogger';

/* ─── IP & User Agent Helpers ─── */
const getUserAgent = () => {
  return navigator.userAgent || 'Unknown';
};

const getClientIP = async () => {
  try {
    const response = await fetch('https://api.ipify.org?format=json', { timeout: 3000 });
    const data = await response.json();
    return data.ip || 'unknown';
  } catch (e) {
    return 'unknown';
  }
};

const SignIn = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Load saved email if remember me was checked
  useEffect(() => {
    const savedEmail = localStorage.getItem('pay2x_remember_email');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  // Email validation
  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Password validation
  const validatePassword = (password) => {
    return password.length >= 6;
  };

  // Handle login
  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    // Client-side validation
    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    if (!validatePassword(password)) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    // 🔥 Capture IP and user agent for audit logging
    const userAgent = getUserAgent();
    const clientIP = await getClientIP();

    try {
      // Sign in with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;

      const user = authData.user;
      const userId = user.id;

      // Save email if remember me is checked
      if (rememberMe) {
        localStorage.setItem('pay2x_remember_email', email);
      } else {
        localStorage.removeItem('pay2x_remember_email');
      }

      // Get role from profiles table
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError || !profile) {
        setError('No role assigned to this account. Please contact support.');

        // 🔥 AUDIT LOG: Login Failed - No Profile
        await logAuditEvent({
          action: 'login_failed',
          category: 'security',
          entityType: 'user',
          entityId: userId,
          entityName: email,
          details: {
            note: 'Login failed: No profile/role assigned to account',
            metadata: { email, userAgent, reason: 'no_profile' },
          },
          performedByIp: clientIP,
          severity: 'warning',
        });

        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      const role = profile.role;

      // 🔒 CHECK IF ACCOUNT IS ACTIVE (Skip for admin)
      if (role !== 'admin') {
        // Check profile-level active flag
        if (profile.is_active === false) {
          setError('Your account is currently inactive. Please contact admin for assistance.');

          await logAuditEvent({
            action: 'login_blocked_inactive',
            category: 'security',
            entityType: role,
            entityId: userId,
            entityName: profile.display_name || email,
            details: {
              note: `${role.charAt(0).toUpperCase() + role.slice(1)} login blocked: Account inactive`,
              metadata: { email, userAgent, accountStatus: 'inactive' },
            },
            performedByIp: clientIP,
            severity: 'warning',
            requiresReview: true,
          });

          await supabase.auth.signOut();
          setLoading(false);
          return;
        }

        // Check entity-level active flag (traders/merchants/workers table)
        const { isActive } = await checkEntityActive(role, userId);
        if (!isActive) {
          setError('Your account is currently inactive. Please contact admin for assistance.');

          await logAuditEvent({
            action: 'login_blocked_inactive',
            category: 'security',
            entityType: role,
            entityId: userId,
            entityName: profile.display_name || email,
            details: {
              note: `${role.charAt(0).toUpperCase() + role.slice(1)} login blocked: Entity inactive`,
              metadata: { email, userAgent, accountStatus: 'entity_inactive' },
            },
            performedByIp: clientIP,
            severity: 'warning',
            requiresReview: true,
          });

          await supabase.auth.signOut();
          setLoading(false);
          return;
        }
      }

      // 🔥 AUDIT LOG: Successful Login
      await logAuditEvent({
        action: 'login_success',
        category: 'security',
        entityType: role,
        entityId: userId,
        entityName: profile.display_name || email,
        details: {
          note: `${role.charAt(0).toUpperCase() + role.slice(1)} logged in successfully`,
          metadata: { email, userAgent, rememberMe },
        },
        performedByIp: clientIP,
        severity: 'info',
      });

      // Don't navigate manually — App.jsx's onAuthStateChange will
      // detect the session, resolve the role, and redirect automatically.
      setSuccess(true);
    } catch (err) {
      console.error('Login error:', err);

      // 🔥 AUDIT LOG: Login Failed - Auth Error
      const failureReason = err.message || 'unknown_error';
      const isSuspicious = err.message?.includes('locked') || err.status === 429;

      await logAuditEvent({
        action: 'login_failed',
        category: 'security',
        entityType: 'user',
        entityId: 'unknown',
        entityName: email,
        details: {
          note: `Login attempt failed: ${failureReason}`,
          metadata: { email, userAgent, errorMessage: err.message },
        },
        performedByIp: clientIP,
        severity: isSuspicious ? 'critical' : 'warning',
        requiresReview: isSuspicious,
      });

      // User-friendly error messages (Supabase error codes)
      const msg = err.message?.toLowerCase() || '';
      if (msg.includes('invalid login credentials')) {
        setError('Invalid email or password. Please try again');
      } else if (msg.includes('email not confirmed')) {
        setError('Please confirm your email address first');
      } else if (msg.includes('too many requests') || err.status === 429) {
        setError('Too many failed attempts. Please try again later');
      } else if (msg.includes('network') || msg.includes('fetch')) {
        setError('Network error. Please check your connection');
      } else {
        setError('Login failed. Please try again');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center px-4 py-8">
      {/* Background Pattern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-300 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-300 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-2000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-indigo-300 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-4000"></div>
      </div>

      {/* Main Container */}
      <div className="relative w-full max-w-6xl grid md:grid-cols-2 gap-8 items-center">
        {/* Left Side - Branding */}
        <div className="hidden md:block space-y-8 text-center md:text-left">
          <div>
            <div className="inline-flex items-center gap-3 mb-6">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
                <TrendingUp className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-4xl font-bold text-gray-900">Pay2x</h1>
            </div>
            <p className="text-xl text-gray-700 font-medium mb-4">
              Payment Gateway Management Platform
            </p>
            <p className="text-gray-600">
              Secure, fast, and reliable payment processing for your business
            </p>
          </div>

          {/* Features */}
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-white/50 backdrop-blur-sm rounded-xl">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Shield className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Secure Transactions</h3>
                <p className="text-sm text-gray-600">Bank-grade security for all payments</p>
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 bg-white/50 backdrop-blur-sm rounded-xl">
              <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Zap className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Real-time Processing</h3>
                <p className="text-sm text-gray-600">Instant payment verification</p>
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 bg-white/50 backdrop-blur-sm rounded-xl">
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">24/7 Support</h3>
                <p className="text-sm text-gray-600">Round-the-clock assistance</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Login Form */}
        <div className="relative">
          <div className="bg-white shadow-2xl rounded-2xl p-8 space-y-6 backdrop-blur-lg border border-gray-100">
            {/* Header */}
            <div className="text-center">
              <div className="md:hidden inline-flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
                  <TrendingUp className="w-6 h-6 text-white" />
                </div>
                <h1 className="text-3xl font-bold text-gray-900">Pay2x</h1>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome Back</h2>
              <p className="text-gray-600">Sign in to access your dashboard</p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-900">{error}</p>
                </div>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleLogin} className="space-y-5">
              {/* Email Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Mail className="w-5 h-5 text-gray-400" />
                  </div>
                  <input
                    type="email"
                    required
                    className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    disabled={loading}
                  />
                </div>
              </div>

              {/* Password Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="w-5 h-5 text-gray-400" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    className="w-full pl-12 pr-12 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center"
                    disabled={loading}
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5 text-gray-400 hover:text-gray-600" />
                    ) : (
                      <Eye className="w-5 h-5 text-gray-400 hover:text-gray-600" />
                    )}
                  </button>
                </div>
              </div>

              {/* Remember Me & Forgot Password */}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    disabled={loading}
                  />
                  <span className="text-sm text-gray-700 group-hover:text-gray-900">
                    Remember me
                  </span>
                </label>
                <button
                  type="button"
                  className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
                  disabled={loading}
                >
                  Forgot password?
                </button>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || success}
                className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {success ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Redirecting...
                  </>
                ) : loading ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-gray-500">Role-based access</span>
              </div>
            </div>

            {/* Role Indicators */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 bg-purple-50 rounded-lg border border-purple-100">
                <Shield className="w-5 h-5 text-purple-600 mx-auto mb-1" />
                <p className="text-xs font-medium text-purple-900">Admin</p>
              </div>
              <div className="p-3 bg-teal-50 rounded-lg border border-teal-100">
                <TrendingUp className="w-5 h-5 text-teal-600 mx-auto mb-1" />
                <p className="text-xs font-medium text-teal-900">Merchant</p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg border border-green-100">
                <Zap className="w-5 h-5 text-green-600 mx-auto mb-1" />
                <p className="text-xs font-medium text-green-900">Trader</p>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-500 text-center">
                © 2024 Pay2x.io - All rights reserved
              </p>
              <p className="text-xs text-gray-400 text-center mt-1">
                Secure payment gateway platform
              </p>
            </div>
          </div>

          {/* Decorative Elements */}
          <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full opacity-20 blur-2xl"></div>
          <div className="absolute -top-4 -left-4 w-24 h-24 bg-gradient-to-br from-purple-400 to-pink-500 rounded-full opacity-20 blur-2xl"></div>
        </div>
      </div>

      {/* Animation Styles */}
      <style jsx>{`
        @keyframes blob {
          0%, 100% {
            transform: translate(0, 0) scale(1);
          }
          25% {
            transform: translate(20px, -50px) scale(1.1);
          }
          50% {
            transform: translate(-20px, 20px) scale(0.9);
          }
          75% {
            transform: translate(50px, 50px) scale(1.05);
          }
        }

        .animate-blob {
          animation: blob 7s infinite;
        }

        .animation-delay-2000 {
          animation-delay: 2s;
        }

        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </div>
  );
};

export default SignIn;
