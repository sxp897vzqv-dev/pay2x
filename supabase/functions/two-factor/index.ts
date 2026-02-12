// supabase/functions/two-factor/index.ts
// Two-Factor Authentication API

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { encode as base32Encode } from 'https://deno.land/std@0.168.0/encoding/base32.ts'
import { crypto } from 'https://deno.land/std@0.168.0/crypto/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ISSUER = 'Pay2X'
const TOTP_PERIOD = 30
const TOTP_DIGITS = 6

// Generate random bytes
async function generateSecret(): Promise<string> {
  const bytes = new Uint8Array(20)
  crypto.getRandomValues(bytes)
  return base32Encode(bytes).replace(/=/g, '')
}

// Generate backup codes
async function generateBackupCodes(count: number = 10): Promise<string[]> {
  const codes: string[] = []
  for (let i = 0; i < count; i++) {
    const bytes = new Uint8Array(4)
    crypto.getRandomValues(bytes)
    const code = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
    codes.push(code.slice(0, 8)) // 8-char hex code
  }
  return codes
}

// Hash backup code for storage
async function hashCode(code: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(code.toUpperCase())
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// TOTP implementation
function generateTOTP(secret: string, time: number = Date.now()): string {
  const counter = Math.floor(time / 1000 / TOTP_PERIOD)
  return hotp(secret, counter)
}

function hotp(secret: string, counter: number): string {
  // Decode base32 secret
  const secretBytes = base32Decode(secret)
  
  // Convert counter to 8-byte big-endian
  const counterBytes = new Uint8Array(8)
  let tmp = counter
  for (let i = 7; i >= 0; i--) {
    counterBytes[i] = tmp & 0xff
    tmp = Math.floor(tmp / 256)
  }
  
  // HMAC-SHA1
  const key = secretBytes
  const hmac = hmacSha1(key, counterBytes)
  
  // Dynamic truncation
  const offset = hmac[hmac.length - 1] & 0x0f
  const binary = ((hmac[offset] & 0x7f) << 24) |
                 ((hmac[offset + 1] & 0xff) << 16) |
                 ((hmac[offset + 2] & 0xff) << 8) |
                 (hmac[offset + 3] & 0xff)
  
  const otp = binary % Math.pow(10, TOTP_DIGITS)
  return otp.toString().padStart(TOTP_DIGITS, '0')
}

// Base32 decode
function base32Decode(encoded: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const cleanedInput = encoded.toUpperCase().replace(/=+$/, '')
  
  let bits = ''
  for (const char of cleanedInput) {
    const val = alphabet.indexOf(char)
    if (val === -1) continue
    bits += val.toString(2).padStart(5, '0')
  }
  
  const bytes = new Uint8Array(Math.floor(bits.length / 8))
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, (i + 1) * 8), 2)
  }
  return bytes
}

// Simple HMAC-SHA1 implementation
function hmacSha1(key: Uint8Array, message: Uint8Array): Uint8Array {
  const blockSize = 64
  
  // If key is longer than block size, hash it
  let keyBytes = key
  if (keyBytes.length > blockSize) {
    keyBytes = sha1(keyBytes)
  }
  
  // Pad key to block size
  const paddedKey = new Uint8Array(blockSize)
  paddedKey.set(keyBytes)
  
  // Create inner and outer padding
  const ipad = new Uint8Array(blockSize)
  const opad = new Uint8Array(blockSize)
  for (let i = 0; i < blockSize; i++) {
    ipad[i] = paddedKey[i] ^ 0x36
    opad[i] = paddedKey[i] ^ 0x5c
  }
  
  // Inner hash
  const inner = new Uint8Array(blockSize + message.length)
  inner.set(ipad)
  inner.set(message, blockSize)
  const innerHash = sha1(inner)
  
  // Outer hash
  const outer = new Uint8Array(blockSize + 20)
  outer.set(opad)
  outer.set(innerHash, blockSize)
  
  return sha1(outer)
}

// SHA1 implementation
function sha1(message: Uint8Array): Uint8Array {
  const h = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0]
  
  // Pre-processing
  const msgLen = message.length
  const bitLen = msgLen * 8
  
  // Padding
  const padLen = (msgLen % 64 < 56) ? (56 - msgLen % 64) : (120 - msgLen % 64)
  const padded = new Uint8Array(msgLen + padLen + 8)
  padded.set(message)
  padded[msgLen] = 0x80
  
  // Append length as 64-bit big-endian
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 4, bitLen, false)
  
  // Process chunks
  for (let i = 0; i < padded.length; i += 64) {
    const w = new Uint32Array(80)
    for (let j = 0; j < 16; j++) {
      w[j] = view.getUint32(i + j * 4, false)
    }
    for (let j = 16; j < 80; j++) {
      w[j] = rotl(w[j-3] ^ w[j-8] ^ w[j-14] ^ w[j-16], 1)
    }
    
    let [a, b, c, d, e] = h
    
    for (let j = 0; j < 80; j++) {
      let f: number, k: number
      if (j < 20) {
        f = (b & c) | (~b & d)
        k = 0x5A827999
      } else if (j < 40) {
        f = b ^ c ^ d
        k = 0x6ED9EBA1
      } else if (j < 60) {
        f = (b & c) | (b & d) | (c & d)
        k = 0x8F1BBCDC
      } else {
        f = b ^ c ^ d
        k = 0xCA62C1D6
      }
      
      const temp = (rotl(a, 5) + f + e + k + w[j]) >>> 0
      e = d
      d = c
      c = rotl(b, 30)
      b = a
      a = temp
    }
    
    h[0] = (h[0] + a) >>> 0
    h[1] = (h[1] + b) >>> 0
    h[2] = (h[2] + c) >>> 0
    h[3] = (h[3] + d) >>> 0
    h[4] = (h[4] + e) >>> 0
  }
  
  const result = new Uint8Array(20)
  const resultView = new DataView(result.buffer)
  for (let i = 0; i < 5; i++) {
    resultView.setUint32(i * 4, h[i], false)
  }
  return result
}

function rotl(n: number, b: number): number {
  return ((n << b) | (n >>> (32 - b))) >>> 0
}

// Verify TOTP with window for clock drift
function verifyTOTP(secret: string, code: string, window: number = 1): boolean {
  const now = Date.now()
  for (let i = -window; i <= window; i++) {
    const time = now + (i * TOTP_PERIOD * 1000)
    if (generateTOTP(secret, time) === code) {
      return true
    }
  }
  return false
}

// Generate QR code URL for authenticator apps
function generateQRUrl(secret: string, email: string): string {
  const otpauth = `otpauth://totp/${encodeURIComponent(ISSUER)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(ISSUER)}&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauth)}`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get user from auth header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Missing authorization header')
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) {
      throw new Error('Invalid token')
    }

    const { action, ...params } = await req.json()

    switch (action) {
      case 'setup': {
        // Check if user already has a secret (re-enabling after disable)
        const { data: existing } = await supabase
          .from('two_factor_auth')
          .select('secret, is_enabled')
          .eq('user_id', user.id)
          .single()
        
        // Get user email
        const { data: profile } = await supabase
          .from('profiles')
          .select('email')
          .eq('id', user.id)
          .single()
        
        const email = profile?.email || user.email || ''
        
        // Reuse existing secret if available, otherwise generate new
        const secret = existing?.secret || await generateSecret()
        const qrUrl = generateQRUrl(secret, email)
        
        // Store or update secret (not enabled yet)
        await supabase.from('two_factor_auth').upsert({
          user_id: user.id,
          secret,
          is_enabled: false,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
        
        return new Response(JSON.stringify({
          secret,
          qrUrl,
          otpauthUrl: `otpauth://totp/${ISSUER}:${email}?secret=${secret}&issuer=${ISSUER}`,
          reusedSecret: !!existing?.secret, // Let frontend know if this is the same secret
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'verify-setup': {
        // Verify code and enable 2FA
        const { code } = params
        
        const { data: twoFa } = await supabase
          .from('two_factor_auth')
          .select('secret, is_enabled')
          .eq('user_id', user.id)
          .single()
        
        if (!twoFa) {
          throw new Error('2FA not set up. Call setup first.')
        }
        
        if (twoFa.is_enabled) {
          throw new Error('2FA is already enabled')
        }
        
        if (!verifyTOTP(twoFa.secret, code)) {
          // Log failed attempt
          await supabase.from('two_factor_logs').insert({
            user_id: user.id,
            action: 'setup',
            success: false,
            ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
            user_agent: req.headers.get('user-agent'),
          })
          throw new Error('Invalid code')
        }
        
        // Generate backup codes
        const backupCodes = await generateBackupCodes(10)
        const hashedCodes = await Promise.all(backupCodes.map(hashCode))
        
        // Enable 2FA
        await supabase.from('two_factor_auth').update({
          is_enabled: true,
          backup_codes: hashedCodes,
          verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('user_id', user.id)
        
        // Log success
        await supabase.from('two_factor_logs').insert({
          user_id: user.id,
          action: 'setup',
          success: true,
          ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
          user_agent: req.headers.get('user-agent'),
        })
        
        return new Response(JSON.stringify({
          success: true,
          backupCodes, // Show these once, user must save them
          message: '2FA enabled successfully. Save your backup codes!',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'verify': {
        // Verify code for protected action
        const { code, protectedAction } = params
        
        const { data: twoFa } = await supabase
          .from('two_factor_auth')
          .select('secret, is_enabled, backup_codes, backup_codes_used')
          .eq('user_id', user.id)
          .single()
        
        if (!twoFa || !twoFa.is_enabled) {
          throw new Error('2FA is not enabled')
        }
        
        let success = false
        let usedBackupCode = false
        
        // Try TOTP first
        if (verifyTOTP(twoFa.secret, code)) {
          success = true
        } else {
          // Try backup codes
          const codeHash = await hashCode(code)
          const backupIndex = twoFa.backup_codes?.indexOf(codeHash)
          if (backupIndex !== undefined && backupIndex !== -1) {
            success = true
            usedBackupCode = true
            
            // Remove used backup code
            const newCodes = [...twoFa.backup_codes]
            newCodes.splice(backupIndex, 1)
            await supabase.from('two_factor_auth').update({
              backup_codes: newCodes,
              backup_codes_used: (twoFa.backup_codes_used || 0) + 1,
              updated_at: new Date().toISOString(),
            }).eq('user_id', user.id)
          }
        }
        
        // Log attempt
        await supabase.from('two_factor_logs').insert({
          user_id: user.id,
          action: usedBackupCode ? 'backup_used' : 'verify',
          success,
          protected_action: protectedAction,
          ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
          user_agent: req.headers.get('user-agent'),
          metadata: { protectedAction },
        })
        
        if (!success) {
          throw new Error('Invalid code')
        }
        
        // Update last used
        await supabase.from('two_factor_auth').update({
          last_used_at: new Date().toISOString(),
        }).eq('user_id', user.id)
        
        return new Response(JSON.stringify({
          success: true,
          usedBackupCode,
          remainingBackupCodes: usedBackupCode ? (twoFa.backup_codes?.length || 0) - 1 : undefined,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'disable': {
        // Disable 2FA (requires valid code)
        const { code } = params
        
        const { data: twoFa } = await supabase
          .from('two_factor_auth')
          .select('secret, is_enabled')
          .eq('user_id', user.id)
          .single()
        
        if (!twoFa || !twoFa.is_enabled) {
          throw new Error('2FA is not enabled')
        }
        
        if (!verifyTOTP(twoFa.secret, code)) {
          await supabase.from('two_factor_logs').insert({
            user_id: user.id,
            action: 'disable',
            success: false,
            ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
            user_agent: req.headers.get('user-agent'),
          })
          throw new Error('Invalid code')
        }
        
        // Disable 2FA (keep secret so user can re-enable with same authenticator)
        await supabase.from('two_factor_auth').update({
          is_enabled: false,
          updated_at: new Date().toISOString(),
        }).eq('user_id', user.id)
        
        await supabase.from('two_factor_logs').insert({
          user_id: user.id,
          action: 'disable',
          success: true,
          ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
          user_agent: req.headers.get('user-agent'),
        })
        
        return new Response(JSON.stringify({
          success: true,
          message: '2FA disabled',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'status': {
        // Get 2FA status for user
        const { data: twoFa } = await supabase
          .from('two_factor_auth')
          .select('is_enabled, verified_at, last_used_at, backup_codes_used')
          .eq('user_id', user.id)
          .single()
        
        return new Response(JSON.stringify({
          enabled: twoFa?.is_enabled || false,
          verifiedAt: twoFa?.verified_at,
          lastUsedAt: twoFa?.last_used_at,
          backupCodesUsed: twoFa?.backup_codes_used || 0,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'regenerate-backup': {
        // Regenerate backup codes (requires valid code)
        const { code } = params
        
        const { data: twoFa } = await supabase
          .from('two_factor_auth')
          .select('secret, is_enabled')
          .eq('user_id', user.id)
          .single()
        
        if (!twoFa || !twoFa.is_enabled) {
          throw new Error('2FA is not enabled')
        }
        
        if (!verifyTOTP(twoFa.secret, code)) {
          throw new Error('Invalid code')
        }
        
        const backupCodes = await generateBackupCodes(10)
        const hashedCodes = await Promise.all(backupCodes.map(hashCode))
        
        await supabase.from('two_factor_auth').update({
          backup_codes: hashedCodes,
          backup_codes_used: 0,
          updated_at: new Date().toISOString(),
        }).eq('user_id', user.id)
        
        return new Response(JSON.stringify({
          success: true,
          backupCodes,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      default:
        throw new Error(`Unknown action: ${action}`)
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
