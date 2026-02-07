import React, { useState, useEffect, useCallback } from 'react';
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
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { logAuditEvent } from './utils/auditLogger';
import {
  checkAccountLockout,
  recordLoginAttempt,
  getRemainingAttempts,
  validateEmail as isValidEmail,
} from './utils/security';
import { has2FAEnabled, verify2FACode } from './utils/twoFactor';

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
  const [warning, setWarning] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Security states
  const [isLocked, setIsLocked] = useState(false);
  const [lockoutMinutes, setLockoutMinutes] = useState(0);
  const [remainingAttempts, setRemainingAttempts] = useState(5);
  const [checkingLockout, setCheckingLockout] = useState(false);

  // 2FA states
  const [requires2FA, setRequires2FA] = useState(false);
  const [twoFACode, setTwoFACode] = useState('');
  const [twoFAError, setTwoFAError] = useState('');
  const [pendingUserId, setPendingUserId] = useState(null);
  const [pendingProfile, setPendingProfile] = useState(null);

  // Load saved email if remember me was checked
  useEffect(() => {
    const savedEmail = localStorage.getItem('pay2x_remember_email');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  // Check lockout status when email changes (debounced)
  const checkLockoutStatus = useCallback(async (emailToCheck) => {
    if (!emailToCheck || !isValidEmail(emailToCheck)) return;

    setCheckingLockout(true);
    try {
      const lockoutStatus = await checkAccountLockout(emailToCheck);
      setIsLocked(lockoutStatus.isLocked);
      setLockoutMinutes(lockoutStatus.remainingMinutes);

      if (!lockoutStatus.isLocked) {
        const remaining = await getRemainingAttempts(emailToCheck);
        setRemainingAttempts(remaining);
      }
    } catch (e) {
      console.error('Error checking lockout:', e);
    } finally {
      setCheckingLockout(false);
    }
  }, []);

  // Debounced email check
  useEffect(() => {
    const timer = setTimeout(() => {
      if (email && isValidEmail(email)) {
        checkLockoutStatus(email);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [email, checkLockoutStatus]);

  // Countdown timer for lockout
  useEffect(() => {
    if (!isLocked || lockoutMinutes <= 0) return;

    const timer = setInterval(() => {
      setLockoutMinutes((prev) => {
        if (prev <= 1) {
          setIsLocked(false);
          checkLockoutStatus(email);
          return 0;
        }
        return prev - 1;
      });
    }, 60000); // Update every minute

    return () => clearInterval(timer);
  }, [isLocked, lockoutMinutes, email, checkLockoutStatus]);

  // Password validation
  const validatePassword = (password) => {
    return password.length >= 6;
  };

  // Handle login
  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setWarning('');

    // Client-side validation
    if (!isValidEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    if (!validatePassword(password)) {
      setError('Password must be at least 6 characters');
      return;
    }

    // Check lockout BEFORE attempting login
    const lockoutStatus = await checkAccountLockout(email);
    if (lockoutStatus.isLocked) {
      setIsLocked(true);
      setLockoutMinutes(lockoutStatus.remainingMinutes);
      setError(`Account is locked. Try again in ${lockoutStatus.remainingMinutes} minutes.`);
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

      // Check if 2FA is enabled for this user
      const twoFAEnabled = await has2FAEnabled(userId);
      
      if (twoFAEnabled) {
        // Store pending auth state and show 2FA step
        setPendingUserId(userId);
        setRequires2FA(true);
        setLoading(false);
        
        // Don't record successful login yet - wait for 2FA
        return;
      }

      // ✅ Record successful login attempt (no 2FA required)
      await recordLoginAttempt(email, clientIP, userAgent, true);

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

      // Update last login info in profile
      await supabase
        .from('profiles')
        .update({
          last_login_at: new Date().toISOString(),
          last_login_ip: clientIP && clientIP !== 'unknown' ? clientIP : null,
          failed_login_count: 0,
        })
        .eq('id', userId);

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

      // Set last activity for session timeout tracking
      localStorage.setItem('pay2x_last_activity', Date.now().toString());

      // Don't navigate manually — App.jsx's onAuthStateChange will
      // detect the session, resolve the role, and redirect automatically.
      setSuccess(true);
    } catch (err) {
      console.error('Login error:', err);

      // ❌ Record failed login attempt
      const failureReason = err.message || 'unknown_error';
      await recordLoginAttempt(email, clientIP, userAgent, false, failureReason);

      // Re-check lockout status after failed attempt
      const newLockoutStatus = await checkAccountLockout(email);
      if (newLockoutStatus.isLocked) {
        setIsLocked(true);
        setLockoutMinutes(newLockoutStatus.remainingMinutes);
        setError(`Too many failed attempts. Account locked for ${newLockoutStatus.remainingMinutes} minutes.`);
        
        // Log critical security event
        await logAuditEvent({
          action: 'account_locked',
          category: 'security',
          entityType: 'user',
          entityId: 'unknown',
          entityName: email,
          details: {
            note: `Account locked due to ${newLockoutStatus.failedAttempts} failed login attempts`,
            metadata: { email, userAgent, lockDuration: newLockoutStatus.remainingMinutes },
          },
          performedByIp: clientIP,
          severity: 'critical',
          requiresReview: true,
        });
        
        setLoading(false);
        return;
      }

      // Update remaining attempts
      const remaining = await getRemainingAttempts(email);
      setRemainingAttempts(remaining);

      // Show warning if low attempts remaining
      if (remaining <= 2 && remaining > 0) {
        setWarning(`Warning: ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before account lockout`);
      }

      // 🔥 AUDIT LOG: Login Failed - Auth Error
      const isSuspicious = err.message?.includes('locked') || err.status === 429;

      await logAuditEvent({
        action: 'login_failed',
        category: 'security',
        entityType: 'user',
        entityId: 'unknown',
        entityName: email,
        details: {
          note: `Login attempt failed: ${failureReason}`,
          metadata: { email, userAgent, errorMessage: err.message, remainingAttempts: remaining },
        },
        performedByIp: clientIP,
        severity: isSuspicious ? 'critical' : 'warning',
        requiresReview: isSuspicious,
      });

      // User-friendly error messages (Supabase error codes)
      const msg = err.message?.toLowerCase() || '';
      if (msg.includes('invalid login credentials')) {
        setError('Invalid email or password. Please try again.');
      } else if (msg.includes('email not confirmed')) {
        setError('Please confirm your email address first');
      } else if (msg.includes('too many requests') || err.status === 429) {
        setError('Too many requests. Please try again later.');
      } else if (msg.includes('network') || msg.includes('fetch')) {
        setError('Network error. Please check your connection');
      } else {
        setError('Login failed. Please try again');
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle 2FA verification
  const handle2FAVerify = async (e) => {
    e.preventDefault();
    setTwoFAError('');
    
    if (twoFACode.length !== 6 && twoFACode.length !== 9) { // 6 for TOTP, 9 for backup code (8 + hyphen)
      setTwoFAError('Please enter a valid 6-digit code or backup code');
      return;
    }

    setLoading(true);
    const userAgent = getUserAgent();
    const clientIP = await getClientIP();

    try {
      // Verify the 2FA code
      const isValid = await verify2FACode(pendingUserId, twoFACode.replace('-', ''));
      
      if (!isValid) {
        setTwoFAError('Invalid verification code. Please try again.');
        setLoading(false);
        return;
      }

      // ✅ Record successful login attempt (2FA verified)
      await recordLoginAttempt(email, clientIP, userAgent, true);

      // Save email if remember me is checked
      if (rememberMe) {
        localStorage.setItem('pay2x_remember_email', email);
      } else {
        localStorage.removeItem('pay2x_remember_email');
      }

      // Get profile for role and audit logging
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', pendingUserId)
        .single();

      if (profileError || !profile) {
        setError('Profile not found. Please contact support.');
        await supabase.auth.signOut();
        setRequires2FA(false);
        setLoading(false);
        return;
      }

      const role = profile.role;

      // 🔒 CHECK IF ACCOUNT IS ACTIVE (Skip for admin)
      if (role !== 'admin') {
        if (profile.is_active === false) {
          setError('Your account is currently inactive. Please contact admin.');
          await supabase.auth.signOut();
          setRequires2FA(false);
          setLoading(false);
          return;
        }

        const { isActive } = await checkEntityActive(role, pendingUserId);
        if (!isActive) {
          setError('Your account is currently inactive. Please contact admin.');
          await supabase.auth.signOut();
          setRequires2FA(false);
          setLoading(false);
          return;
        }
      }

      // Update last login info
      await supabase
        .from('profiles')
        .update({
          last_login_at: new Date().toISOString(),
          last_login_ip: clientIP && clientIP !== 'unknown' ? clientIP : null,
          failed_login_count: 0,
        })
        .eq('id', pendingUserId);

      // 🔥 AUDIT LOG: Successful Login with 2FA
      await logAuditEvent({
        action: 'login_success_2fa',
        category: 'security',
        entityType: role,
        entityId: pendingUserId,
        entityName: profile.display_name || email,
        details: {
          note: `${role.charAt(0).toUpperCase() + role.slice(1)} logged in with 2FA`,
          metadata: { email, userAgent, twoFactorUsed: true },
        },
        performedByIp: clientIP,
        severity: 'info',
      });

      localStorage.setItem('pay2x_last_activity', Date.now().toString());
      setSuccess(true);
    } catch (err) {
      console.error('2FA verification error:', err);
      setTwoFAError(err.message || 'Verification failed. Please try again.');

      // Log failed 2FA attempt
      await logAuditEvent({
        action: 'login_2fa_failed',
        category: 'security',
        entityType: 'user',
        entityId: pendingUserId,
        entityName: email,
        details: {
          note: '2FA verification failed',
          metadata: { email, error: err.message },
        },
        performedByIp: clientIP,
        severity: 'warning',
      });
    } finally {
      setLoading(false);
    }
  };

  // Cancel 2FA and go back to login
  const cancel2FA = async () => {
    await supabase.auth.signOut();
    setRequires2FA(false);
    setPendingUserId(null);
    setTwoFACode('');
    setTwoFAError('');
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

            {/* Account Locked Warning */}
            {isLocked && (
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                <Lock className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-900">Account Temporarily Locked</p>
                  <p className="text-sm text-red-700 mt-1">
                    Too many failed login attempts. Please try again in{' '}
                    <span className="font-semibold">{lockoutMinutes} minute{lockoutMinutes !== 1 ? 's' : ''}</span>.
                  </p>
                </div>
              </div>
            )}

            {/* Warning Message (low attempts) */}
            {warning && !isLocked && (
              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-900">{warning}</p>
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && !isLocked && (
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-900">{error}</p>
                </div>
              </div>
            )}

            {/* 2FA Verification Form */}
            {requires2FA ? (
              <form onSubmit={handle2FAVerify} className="space-y-5">
                <div className="text-center mb-4">
                  <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Shield className="w-8 h-8 text-indigo-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Two-Factor Authentication</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Enter the 6-digit code from your authenticator app
                  </p>
                </div>

                {twoFAError && (
                  <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm font-medium text-red-900">{twoFAError}</p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Verification Code
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full px-4 py-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none text-center text-2xl font-mono tracking-widest"
                    value={twoFACode}
                    onChange={(e) => setTwoFACode(e.target.value.replace(/[^0-9A-Za-z-]/g, '').slice(0, 9))}
                    placeholder="000000"
                    maxLength={9}
                    autoFocus
                    disabled={loading}
                  />
                  <p className="text-xs text-gray-500 mt-2 text-center">
                    Or enter a backup code (format: XXXX-XXXX)
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading || success || twoFACode.length < 6}
                  className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {success ? (
                    <>
                      <Loader className="w-5 h-5 animate-spin" />
                      Redirecting...
                    </>
                  ) : loading ? (
                    <>
                      <Loader className="w-5 h-5 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <Shield className="w-5 h-5" />
                      Verify & Sign In
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={cancel2FA}
                  disabled={loading}
                  className="w-full py-2 text-gray-600 hover:text-gray-900 text-sm"
                >
                  ← Back to login
                </button>
              </form>
            ) : (
            /* Login Form */
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
                    className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    disabled={loading || isLocked}
                  />
                  {checkingLockout && (
                    <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
                      <Loader className="w-4 h-4 text-gray-400 animate-spin" />
                    </div>
                  )}
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
                    type={showPassword ? 'text' : 'password'}
                    required
                    className="w-full pl-12 pr-12 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    disabled={loading || isLocked}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center"
                    disabled={loading || isLocked}
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
                    disabled={loading || isLocked}
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
                disabled={loading || success || isLocked}
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
                ) : isLocked ? (
                  <>
                    <Clock className="w-5 h-5" />
                    Account Locked ({lockoutMinutes}m)
                  </>
                ) : (
                  'Sign In'
                )}
              </button>

              {/* Security indicator */}
              {!isLocked && remainingAttempts < 5 && remainingAttempts > 0 && (
                <p className="text-xs text-center text-gray-500">
                  {remainingAttempts} login attempt{remainingAttempts !== 1 ? 's' : ''} remaining
                </p>
              )}
            </form>
            )}

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-gray-500">Secured access</span>
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
              <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
                <Shield className="w-3 h-3" />
                <span>Protected by account lockout & audit logging</span>
              </div>
              <p className="text-xs text-gray-400 text-center mt-2">
                © 2024 Pay2x.io - All rights reserved
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
          0%,
          100% {
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
