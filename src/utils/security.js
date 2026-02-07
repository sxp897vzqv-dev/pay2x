// src/utils/security.js
// Security utilities for Pay2X - Rate limiting, lockout, validation
import { supabase } from '../supabase';

// ─────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  rateLimit: {
    maxAttempts: 5,
    windowMinutes: 15,
  },
  lockout: {
    enabled: true,
    threshold: 5,
    durationMinutes: 30,
  },
  password: {
    minLength: 8,
    requireUppercase: true,
    requireNumber: true,
    requireSpecial: false,
  },
};

// Cache for security settings
let settingsCache = null;
let settingsCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ─────────────────────────────────────────────────────
// SECURITY SETTINGS
// ─────────────────────────────────────────────────────

/**
 * Get security settings from database (cached)
 */
export async function getSecuritySettings() {
  if (settingsCache && Date.now() - settingsCacheTime < CACHE_TTL) {
    return settingsCache;
  }

  try {
    const { data, error } = await supabase
      .from('security_settings')
      .select('setting_key, setting_value');

    if (error) throw error;

    const settings = {};
    data?.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });

    settingsCache = settings;
    settingsCacheTime = Date.now();
    return settings;
  } catch (error) {
    console.warn('Failed to fetch security settings, using defaults:', error);
    return null;
  }
}

/**
 * Clear security settings cache
 */
export function clearSecuritySettingsCache() {
  settingsCache = null;
  settingsCacheTime = 0;
}

// ─────────────────────────────────────────────────────
// ACCOUNT LOCKOUT
// ─────────────────────────────────────────────────────

/**
 * Check if an account is locked
 * @param {string} email - Email to check
 * @returns {{ isLocked: boolean, lockedUntil: Date|null, remainingMinutes: number }}
 */
export async function checkAccountLockout(email) {
  try {
    const { data, error } = await supabase
      .from('account_lockouts')
      .select('locked_until, failed_attempts')
      .eq('email', email.toLowerCase())
      .single();

    if (error && error.code !== 'PGRST116') { // Not found is OK
      throw error;
    }

    if (!data) {
      return { isLocked: false, lockedUntil: null, remainingMinutes: 0 };
    }

    const lockedUntil = new Date(data.locked_until);
    const now = new Date();

    if (lockedUntil > now) {
      const remainingMinutes = Math.ceil((lockedUntil - now) / (1000 * 60));
      return {
        isLocked: true,
        lockedUntil,
        remainingMinutes,
        failedAttempts: data.failed_attempts,
      };
    }

    return { isLocked: false, lockedUntil: null, remainingMinutes: 0 };
  } catch (error) {
    console.error('Error checking account lockout:', error);
    return { isLocked: false, lockedUntil: null, remainingMinutes: 0 };
  }
}

/**
 * Record a login attempt (success or failure)
 */
export async function recordLoginAttempt(email, ip, userAgent, success, failureReason = null) {
  try {
    const { error } = await supabase.from('login_attempts').insert({
      email: email.toLowerCase(),
      ip_address: ip && ip !== 'unknown' ? ip : null,
      user_agent: userAgent,
      success,
      failure_reason: failureReason,
    });

    if (error) throw error;

    // If failed, check if we need to lock the account
    if (!success) {
      await checkAndLockAccount(email, ip);
    }
  } catch (error) {
    console.error('Error recording login attempt:', error);
  }
}

/**
 * Check failed attempts and lock account if threshold exceeded
 */
async function checkAndLockAccount(email, ip) {
  try {
    const settings = await getSecuritySettings();
    const lockoutConfig = settings?.account_lockout || DEFAULT_SETTINGS.lockout;

    if (!lockoutConfig.enabled) return false;

    // Get failed count in last 15 minutes
    const { data, error } = await supabase
      .from('login_attempts')
      .select('id')
      .eq('email', email.toLowerCase())
      .eq('success', false)
      .gt('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString());

    if (error) throw error;

    const failCount = data?.length || 0;
    const threshold = lockoutConfig.threshold || 5;
    const duration = lockoutConfig.duration_minutes || 30;

    if (failCount >= threshold) {
      // Lock the account
      const lockedUntil = new Date(Date.now() + duration * 60 * 1000);

      await supabase.from('account_lockouts').upsert({
        email: email.toLowerCase(),
        locked_until: lockedUntil.toISOString(),
        failed_attempts: failCount,
        last_attempt_ip: ip && ip !== 'unknown' ? ip : null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'email',
      });

      return true;
    }

    return false;
  } catch (error) {
    console.error('Error checking/locking account:', error);
    return false;
  }
}

/**
 * Get remaining login attempts before lockout
 */
export async function getRemainingAttempts(email) {
  try {
    const settings = await getSecuritySettings();
    const lockoutConfig = settings?.account_lockout || DEFAULT_SETTINGS.lockout;
    const threshold = lockoutConfig.threshold || 5;

    const { data, error } = await supabase
      .from('login_attempts')
      .select('id')
      .eq('email', email.toLowerCase())
      .eq('success', false)
      .gt('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString());

    if (error) throw error;

    const failCount = data?.length || 0;
    return Math.max(0, threshold - failCount);
  } catch (error) {
    console.error('Error getting remaining attempts:', error);
    return 5; // Default
  }
}

// ─────────────────────────────────────────────────────
// PASSWORD VALIDATION
// ─────────────────────────────────────────────────────

/**
 * Validate password against security policy
 * @param {string} password - Password to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export async function validatePassword(password) {
  const settings = await getSecuritySettings();
  const policy = settings?.password_policy || DEFAULT_SETTINGS.password;

  const errors = [];

  // Minimum length
  const minLength = policy.min_length || 8;
  if (password.length < minLength) {
    errors.push(`Password must be at least ${minLength} characters`);
  }

  // Uppercase requirement
  if (policy.require_uppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  // Number requirement
  if (policy.require_number && !/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  // Special character requirement
  if (policy.require_special && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  // Common password check
  const commonPasswords = ['password', '123456', 'qwerty', 'admin', 'letmein', 'welcome'];
  if (commonPasswords.includes(password.toLowerCase())) {
    errors.push('Password is too common, please choose a stronger password');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get password policy for display
 */
export async function getPasswordPolicy() {
  const settings = await getSecuritySettings();
  return settings?.password_policy || DEFAULT_SETTINGS.password;
}

// ─────────────────────────────────────────────────────
// INPUT SANITIZATION
// ─────────────────────────────────────────────────────

/**
 * Sanitize user input to prevent XSS
 */
export function sanitizeInput(input) {
  if (typeof input !== 'string') return input;

  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Validate email format
 */
export function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate UPI ID format
 */
export function validateUPI(upiId) {
  const upiRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z]+$/;
  return upiRegex.test(upiId);
}

/**
 * Validate amount (positive number, max 2 decimal places)
 */
export function validateAmount(amount) {
  const num = parseFloat(amount);
  if (isNaN(num) || num <= 0) return false;
  if (num > 10000000) return false; // Max 1 crore
  // Check decimal places
  const decimalPart = amount.toString().split('.')[1];
  if (decimalPart && decimalPart.length > 2) return false;
  return true;
}

// ─────────────────────────────────────────────────────
// SESSION SECURITY
// ─────────────────────────────────────────────────────

/**
 * Check if session is still valid (not timed out)
 */
export async function checkSessionValidity() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { valid: false, reason: 'no_session' };

    // Check session age
    const settings = await getSecuritySettings();
    const sessionConfig = settings?.session_timeout || { idle_minutes: 30, absolute_hours: 12 };

    const sessionCreated = new Date(session.created_at || session.expires_at);
    const absoluteTimeout = new Date(sessionCreated.getTime() + sessionConfig.absolute_hours * 60 * 60 * 1000);

    if (new Date() > absoluteTimeout) {
      return { valid: false, reason: 'absolute_timeout' };
    }

    // Check last activity (stored in localStorage)
    const lastActivity = localStorage.getItem('pay2x_last_activity');
    if (lastActivity) {
      const idleTimeout = new Date(parseInt(lastActivity) + sessionConfig.idle_minutes * 60 * 1000);
      if (new Date() > idleTimeout) {
        return { valid: false, reason: 'idle_timeout' };
      }
    }

    return { valid: true };
  } catch (error) {
    console.error('Error checking session validity:', error);
    return { valid: true }; // Don't lock out on error
  }
}

/**
 * Update last activity timestamp
 */
export function updateLastActivity() {
  localStorage.setItem('pay2x_last_activity', Date.now().toString());
}

/**
 * Set up activity tracking
 */
export function setupActivityTracking() {
  const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
  const throttledUpdate = throttle(updateLastActivity, 60000); // Update at most once per minute

  events.forEach(event => {
    window.addEventListener(event, throttledUpdate, { passive: true });
  });

  // Initial update
  updateLastActivity();

  // Return cleanup function
  return () => {
    events.forEach(event => {
      window.removeEventListener(event, throttledUpdate);
    });
  };
}

// Simple throttle function
function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// ─────────────────────────────────────────────────────
// SENSITIVE DATA LOGGING
// ─────────────────────────────────────────────────────

/**
 * Log access to sensitive data
 */
export async function logSensitiveAccess(tableName, recordId, fieldsAccessed, ip, userAgent) {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    await supabase.from('sensitive_data_access').insert({
      user_id: user?.id,
      table_name: tableName,
      record_id: recordId,
      fields_accessed: fieldsAccessed,
      ip_address: ip && ip !== 'unknown' ? ip : null,
      user_agent: userAgent,
    });
  } catch (error) {
    console.error('Error logging sensitive access:', error);
  }
}

// ─────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────

export default {
  getSecuritySettings,
  clearSecuritySettingsCache,
  checkAccountLockout,
  recordLoginAttempt,
  getRemainingAttempts,
  validatePassword,
  getPasswordPolicy,
  sanitizeInput,
  validateEmail,
  validateUPI,
  validateAmount,
  checkSessionValidity,
  updateLastActivity,
  setupActivityTracking,
  logSensitiveAccess,
};
