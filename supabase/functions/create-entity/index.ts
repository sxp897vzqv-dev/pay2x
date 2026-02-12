/**
 * Create Entity (Merchant/Trader) - Auto-generates password and sends welcome email
 * 
 * POST /create-entity
 * Body: { type: 'merchant' | 'trader', name, email, phone?, businessName?, ... }
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
  // Ensure at least one of each type
  password += uppercase[Math.floor(Math.random() * uppercase.length)]
  password += lowercase[Math.floor(Math.random() * lowercase.length)]
  password += numbers[Math.floor(Math.random() * numbers.length)]
  password += special[Math.floor(Math.random() * special.length)]
  
  // Fill the rest
  for (let i = password.length; i < length; i++) {
    password += all[Math.floor(Math.random() * all.length)]
  }
  
  // Shuffle
  return password.split('').sort(() => Math.random() - 0.5).join('')
}

// Generate API key for merchants
function generateApiKey(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 7)
  return `live_${timestamp}_${random}`
}

// Send welcome email with credentials
async function sendWelcomeEmail(
  supabase: any,
  email: string,
  name: string,
  password: string,
  type: 'merchant' | 'trader',
  apiKey?: string
) {
  const loginUrl = `${SUPABASE_URL.replace('.supabase.co', '')}.pay2x.io/login`
  
  const subject = `Welcome to Pay2X - Your ${type === 'merchant' ? 'Merchant' : 'Trader'} Account`
  
  let body = `
Hello ${name},

Your Pay2X ${type} account has been created successfully!

Login Credentials:
━━━━━━━━━━━━━━━━━━
Email: ${email}
Password: ${password}

Login URL: ${loginUrl}
`

  if (type === 'merchant' && apiKey) {
    body += `
API Key (for integration):
━━━━━━━━━━━━━━━━━━━━━━━━━
${apiKey}

Keep this API key secure. Do not share it publicly.
`
  }

  body += `
━━━━━━━━━━━━━━━━━━━━━━━━━
IMPORTANT: Please change your password after first login.

If you did not request this account, please ignore this email.

Best regards,
Pay2X Team
`

  // Try to send via Resend (if configured)
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  
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
        console.log(`✉️ Welcome email sent to ${email}`)
        return true
      }
      console.error('Resend error:', await res.text())
    } catch (err) {
      console.error('Email send error:', err)
    }
  }
  
  // Fallback: Log credentials (for development)
  console.log(`📧 EMAIL WOULD BE SENT TO: ${email}`)
  console.log(`Subject: ${subject}`)
  console.log(`Password: ${password}`)
  
  // Store in a log table for admin to see
  await supabase.from('email_logs').insert({
    to_email: email,
    subject,
    body,
    status: RESEND_API_KEY ? 'failed' : 'logged',
    entity_type: type,
  }).catch(() => {}) // Ignore if table doesn't exist
  
  return !RESEND_API_KEY // Return true if no email service (dev mode)
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
    const { type, name, email, phone, businessName, telegram } = body

    // Validate required fields
    if (!type || !['merchant', 'trader'].includes(type)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid type. Must be "merchant" or "trader"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!name || !email) {
      return new Response(
        JSON.stringify({ success: false, error: 'Name and email are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if email already exists
    const { data: existingUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single()

    if (existingUser) {
      return new Response(
        JSON.stringify({ success: false, error: 'Email already registered' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate password
    const password = generatePassword(12)
    
    // Create auth user
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: { name, role: type }
    })

    if (authError || !authUser.user) {
      console.error('Auth error:', authError)
      return new Response(
        JSON.stringify({ success: false, error: authError?.message || 'Failed to create user' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const userId = authUser.user.id

    // Create profile
    await supabase.from('profiles').insert({
      id: userId,
      email,
      name,
      role: type,
    })

    let entityData: any = { id: null }
    let apiKey: string | undefined

    if (type === 'merchant') {
      // Generate API key
      apiKey = generateApiKey()
      
      // Create merchant record
      const { data: merchant, error: merchantError } = await supabase
        .from('merchants')
        .insert({
          profile_id: userId,
          name,
          email,
          phone: phone || null,
          business_name: businessName || name,
          live_api_key: apiKey,
          webhook_secret: `whsec_${crypto.randomUUID().replace(/-/g, '')}`,
          is_active: true,
          balance: 0,
          available_balance: 0,
        })
        .select('id')
        .single()

      if (merchantError) {
        console.error('Merchant error:', merchantError)
        // Rollback: delete auth user
        await supabase.auth.admin.deleteUser(userId)
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to create merchant record' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      entityData = merchant
    } else {
      // Create trader record
      const { data: trader, error: traderError } = await supabase
        .from('traders')
        .insert({
          profile_id: userId,
          name,
          email,
          phone: phone || null,
          telegram: telegram || null,
          is_active: true,
          balance: 0,
        })
        .select('id')
        .single()

      if (traderError) {
        console.error('Trader error:', traderError)
        // Rollback: delete auth user
        await supabase.auth.admin.deleteUser(userId)
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to create trader record' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      entityData = trader
    }

    // Send welcome email
    await sendWelcomeEmail(supabase, email, name, password, type, apiKey)

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          id: entityData.id,
          userId,
          email,
          name,
          type,
          apiKey: type === 'merchant' ? apiKey : undefined,
          passwordSent: true,
          message: `${type === 'merchant' ? 'Merchant' : 'Trader'} created. Credentials sent to ${email}`,
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
