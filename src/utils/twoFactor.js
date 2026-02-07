/**
 * Pay2X Two-Factor Authentication (2FA) Utilities
 * TOTP-based 2FA with backup codes
 */

import { supabase } from '../supabase';

// ════════════════════════════════════════════
// TOTP GENERATION (Client-side)
// ════════════════════════════════════════════

/**
 * Generate a new TOTP secret
 * Returns base32 encoded secret for QR code generation
 */
export function generateTotpSecret() {
  const array = new Uint8Array(20);
  crypto.getRandomValues(array);
  return base32Encode(array);
}

/**
 * Generate OTP Auth URL for QR code
 */
export function generateOtpAuthUrl(secret, email, issuer = 'Pay2X') {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedEmail = encodeURIComponent(email);
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Verify TOTP code against secret
 * Allows 1 period drift (±30 seconds)
 */
export async function verifyTotp(secret, code, drift = 1) {
  const now = Math.floor(Date.now() / 1000);
  const period = 30;
  
  for (let i = -drift; i <= drift; i++) {
    const counter = Math.floor((now + i * period) / period);
    const expected = await generateTotp(secret, counter);
    if (expected === code) {
      return true;
    }
  }
  return false;
}

/**
 * Generate TOTP code for a given counter
 */
async function generateTotp(secret, counter) {
  const key = base32Decode(secret);
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setBigUint64(0, BigInt(counter), false);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, buffer);
  const signatureArray = new Uint8Array(signature);
  
  const offset = signatureArray[19] & 0x0f;
  const binary = 
    ((signatureArray[offset] & 0x7f) << 24) |
    ((signatureArray[offset + 1] & 0xff) << 16) |
    ((signatureArray[offset + 2] & 0xff) << 8) |
    (signatureArray[offset + 3] & 0xff);
  
  const otp = binary % 1000000;
  return otp.toString().padStart(6, '0');
}

// ════════════════════════════════════════════
// BASE32 ENCODING/DECODING
// ════════════════════════════════════════════

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let result = '';
  let bits = 0;
  let value = 0;
  
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    
    while (bits >= 5) {
      bits -= 5;
      result += BASE32_ALPHABET[(value >>> bits) & 0x1f];
    }
  }
  
  if (bits > 0) {
    result += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  
  return result;
}

function base32Decode(str) {
  str = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  const result = [];
  let bits = 0;
  let value = 0;
  
  for (const char of str) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;
    
    value = (value << 5) | index;
    bits += 5;
    
    if (bits >= 8) {
      bits -= 8;
      result.push((value >>> bits) & 0xff);
    }
  }
  
  return new Uint8Array(result);
}

// ════════════════════════════════════════════
// DATABASE OPERATIONS
// ════════════════════════════════════════════

/**
 * Check if user has 2FA enabled
 */
export async function has2FAEnabled(userId) {
  const { data, error } = await supabase
    .from('user_2fa')
    .select('is_enabled')
    .eq('user_id', userId)
    .single();
  
  if (error && error.code !== 'PGRST116') {
    console.error('2FA check error:', error);
    return false;
  }
  
  return data?.is_enabled === true;
}

/**
 * Get 2FA status for current user
 */
export async function get2FAStatus() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { enabled: false, verified: false };
  
  const { data, error } = await supabase
    .from('user_2fa')
    .select('*')
    .eq('user_id', user.id)
    .single();
  
  if (error && error.code !== 'PGRST116') {
    console.error('2FA status error:', error);
  }
  
  return {
    enabled: data?.is_enabled === true,
    verified: data?.verified_at !== null,
    createdAt: data?.created_at,
    lastUsed: data?.last_used_at
  };
}

/**
 * Begin 2FA setup - generate secret and store (unverified)
 */
export async function setup2FA() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  
  // Get user email
  const { data: profile } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', user.id)
    .single();
  
  const email = profile?.email || user.email;
  
  // Generate new secret
  const secret = generateTotpSecret();
  const otpAuthUrl = generateOtpAuthUrl(secret, email);
  
  // Store secret (not yet enabled)
  const { error } = await supabase
    .from('user_2fa')
    .upsert({
      user_id: user.id,
      secret: secret, // In production, encrypt this!
      is_enabled: false,
      created_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
  
  if (error) throw error;
  
  // Generate backup codes
  const backupCodes = await generateBackupCodes(user.id);
  
  return {
    secret,
    otpAuthUrl,
    backupCodes
  };
}

/**
 * Verify 2FA setup with code from authenticator app
 */
export async function verify2FASetup(code) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  
  // Get stored secret
  const { data: twoFA, error: fetchError } = await supabase
    .from('user_2fa')
    .select('secret')
    .eq('user_id', user.id)
    .single();
  
  if (fetchError) throw new Error('2FA not set up');
  
  // Verify the code
  const isValid = await verifyTotp(twoFA.secret, code);
  if (!isValid) {
    throw new Error('Invalid verification code');
  }
  
  // Enable 2FA
  const { error } = await supabase
    .from('user_2fa')
    .update({
      is_enabled: true,
      verified_at: new Date().toISOString()
    })
    .eq('user_id', user.id);
  
  if (error) throw error;
  
  return true;
}

/**
 * Verify 2FA code during login
 */
export async function verify2FACode(userId, code) {
  // Get stored secret
  const { data: twoFA, error: fetchError } = await supabase
    .from('user_2fa')
    .select('secret, is_enabled')
    .eq('user_id', userId)
    .single();
  
  if (fetchError || !twoFA?.is_enabled) {
    throw new Error('2FA not enabled');
  }
  
  // Try TOTP first
  const isValid = await verifyTotp(twoFA.secret, code);
  
  if (isValid) {
    // Update last used
    await supabase
      .from('user_2fa')
      .update({ last_used_at: new Date().toISOString() })
      .eq('user_id', userId);
    
    return true;
  }
  
  // Try backup code
  const backupValid = await useBackupCode(userId, code);
  return backupValid;
}

/**
 * Disable 2FA
 */
export async function disable2FA(code) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  
  // Verify code first
  const isValid = await verify2FACode(user.id, code);
  if (!isValid) {
    throw new Error('Invalid verification code');
  }
  
  // Disable 2FA
  const { error } = await supabase
    .from('user_2fa')
    .update({ is_enabled: false })
    .eq('user_id', user.id);
  
  if (error) throw error;
  
  // Delete backup codes
  await supabase
    .from('user_2fa_backup_codes')
    .delete()
    .eq('user_id', user.id);
  
  return true;
}

// ════════════════════════════════════════════
// BACKUP CODES
// ════════════════════════════════════════════

/**
 * Generate new backup codes
 */
export async function generateBackupCodes(userId) {
  // Delete existing codes
  await supabase
    .from('user_2fa_backup_codes')
    .delete()
    .eq('user_id', userId);
  
  // Generate 10 new codes
  const codes = [];
  for (let i = 0; i < 10; i++) {
    const code = generateBackupCode();
    codes.push(code);
    
    // Store hashed code (simple hash for now - use bcrypt in production)
    const codeHash = await hashCode(code);
    await supabase
      .from('user_2fa_backup_codes')
      .insert({
        user_id: userId,
        code_hash: codeHash
      });
  }
  
  return codes;
}

/**
 * Generate a single backup code
 */
function generateBackupCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluding confusing chars
  let code = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Simple hash for backup codes
 * In production, use bcrypt or argon2
 */
async function hashCode(code) {
  const encoder = new TextEncoder();
  const data = encoder.encode(code.replace('-', '').toUpperCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Use a backup code
 */
async function useBackupCode(userId, code) {
  const codeHash = await hashCode(code);
  
  const { data, error } = await supabase
    .from('user_2fa_backup_codes')
    .select('id')
    .eq('user_id', userId)
    .eq('code_hash', codeHash)
    .is('used_at', null)
    .single();
  
  if (error || !data) return false;
  
  // Mark code as used
  await supabase
    .from('user_2fa_backup_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('id', data.id);
  
  return true;
}

/**
 * Get remaining backup codes count
 */
export async function getRemainingBackupCodes() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;
  
  const { count, error } = await supabase
    .from('user_2fa_backup_codes')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('used_at', null);
  
  if (error) return 0;
  return count || 0;
}

/**
 * Regenerate backup codes (requires valid 2FA code)
 */
export async function regenerateBackupCodes(verificationCode) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  
  // Verify first
  const isValid = await verify2FACode(user.id, verificationCode);
  if (!isValid) {
    throw new Error('Invalid verification code');
  }
  
  return generateBackupCodes(user.id);
}
