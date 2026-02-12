/**
 * Reset Password - Sends password reset email or generates new password
 * 
 * POST /reset-password
 * Body: { email: string, generateNew?: boolean }
 * 
 * If generateNew=true (admin action): generates new password and emails it
 * If generateNew=false/missing: sends standard reset link
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Generate secure random password
function generatePassword(length = 12): string {
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lowercase = 'abcdefghjkmnpqrstuvwxyz'
  const numbers = '23456789'
  const special = '@#$%&*!'
  
  const all = uppercase + lowercase + numbers + special
  
  let password = ''
  password += uppercase[Math.floor(Math.random() * uppercase.length)]
  password += lowercase[Math.floor(Math.random() * lowercase.length)]
  password += numbers[Math.floor(Math.random() * numbers.length)]
  password += special[Math.floor(Math.random() * special.length)]
  
  for (let i = password.length; i < length; i++) {
    password += all[Math.floor(Math.random() * all.length)]
  }
  
  return password.split('').sort(() => Math.random() - 0.5).join('')
}

// Send password email
async function sendPasswordEmail(email: string, name: string, password: string, isReset: boolean) {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  
  const subject = isReset 
    ? 'Pay2X - Your Password Has Been Reset'
    : 'Pay2X - Password Reset Request'
    
  const body = `
Hello ${name},

Your Pay2X password has been reset by an administrator.

New Password: ${password}

Please login and change your password immediately.

If you did not request this, please contact support.

Best regards,
Pay2X Team
`

  if (RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Pay2X <noreply@pay2x.io>',
          to: email,
          subject,
          text: body,
        }),
      })
      
      if (res.ok) {
        console.log(`✉️ Password email sent to ${email}`)
        return true
      }
    } catch (err) {
      console.error('Email send error:', err)
    }
  }
  
  console.log(`📧 PASSWORD EMAIL FOR: ${email} → ${password}`)
  return !RESEND_API_KEY
}

serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const body = await req.json()
    const { email, generateNew = false } = body

    if (!email) {
      return new Response(
        JSON.stringify({ success: false, error: 'Email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Find user
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, name, email')
      .eq('email', email)
      .single()

    if (!profile) {
      // Don't reveal if user exists
      return new Response(
        JSON.stringify({ success: true, message: 'If the email exists, a reset link/password will be sent' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (generateNew) {
      // Admin action: Generate new password
      const newPassword = generatePassword(12)
      
      // Update user's password
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        profile.id,
        { password: newPassword }
      )

      if (updateError) {
        console.error('Password update error:', updateError)
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to reset password' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Send email with new password
      await sendPasswordEmail(email, profile.name || 'User', newPassword, true)

      return new Response(
        JSON.stringify({
          success: true,
          message: `New password generated and sent to ${email}`,
          // Only return password in dev mode (no RESEND_API_KEY)
          ...(Deno.env.get('RESEND_API_KEY') ? {} : { debugPassword: newPassword })
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } else {
      // Standard reset link via Supabase
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${SUPABASE_URL.replace('.supabase.co', '')}.pay2x.io/reset-password`,
      })

      if (resetError) {
        console.error('Reset email error:', resetError)
        // Still return success to not reveal if user exists
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'If the email exists, a password reset link will be sent',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
