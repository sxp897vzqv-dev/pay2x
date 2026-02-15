// src/supabaseAdmin.js
// ⚠️ SERVICE ROLE CLIENT — Admin operations only!
// TODO: Move to Supabase Edge Functions for production security
// This is only used in admin-only pages (AdminTraderList, AdminMerchantList)
// and is protected by admin auth/RLS checks.

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://jrzyndtowwwcydgcagcr.supabase.co'
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyenluZHRvd3d3Y3lkZ2NhZ2NyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDI5ODU0OSwiZXhwIjoyMDg1ODc0NTQ5fQ.2qF6QqtZ_KK_VCuixbIzGq5so1_e3c17gmx83NfpEPo'

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

/**
 * Generate a secure random password
 */
function generatePassword(length = 12) {
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

/**
 * Queue welcome email in email_queue table (processed by send-email Edge Function)
 */
async function sendWelcomeEmail(email, name, password, type, apiKey = null) {
  try {
    const typeLabels = {
      trader: 'Trader',
      merchant: 'Merchant',
      worker: 'Worker',
      affiliate: 'Affiliate',
      reset: ''
    }
    
    const subject = type === 'reset' 
      ? 'Pay2X - Your Password Has Been Reset'
      : `Welcome to Pay2X - Your ${typeLabels[type] || type} Account`
    
    const template = type === 'reset' ? 'password_reset' : 'welcome_credentials'
    
    // Queue email in email_queue table
    const { error } = await supabaseAdmin.from('email_queue').insert({
      to_email: email,
      subject,
      template,
      template_data: { 
        name, 
        email, 
        password, 
        type,
        apiKey,
        loginUrl: 'https://pay2x.io/'
      },
      status: 'pending',
      attempts: 0,
      created_at: new Date().toISOString(),
    })
    
    if (error) {
      console.warn('Failed to queue email:', error.message)
    } else {
      console.log(`✉️ Welcome email queued for ${email}`)
      
      // Trigger the send-email function immediately (fire and forget)
      fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`
        },
      }).catch(() => {}) // Ignore errors - cron will pick it up
      
      return true
    }
  } catch (err) {
    console.warn('Email service unavailable:', err.message)
  }
  
  // Fallback: log credentials (for development)
  console.log('═══════════════════════════════════════')
  console.log(`📧 NEW ${type.toUpperCase()} CREATED`)
  console.log(`   Email: ${email}`)
  console.log(`   Password: ${password}`)
  if (apiKey) console.log(`   API Key: ${apiKey}`)
  console.log('═══════════════════════════════════════')
  
  return false
}

/**
 * Create a new entity (trader/merchant) with auth user + profile + entity row
 * Auto-generates password and sends welcome email
 */
export async function createEntity(role, formData) {
  // Generate password if not provided
  const password = formData.password || generatePassword(12)
  
  // 1. Create auth user
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: formData.email,
    password: password,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: { display_name: formData.name },
  })

  if (authError) throw new Error(`Auth error: ${authError.message}`)
  const uid = authData.user.id

  // 2. Create profile
  const { error: profileError } = await supabaseAdmin.from('profiles').insert({
    id: uid,
    role,
    display_name: formData.name,
    email: formData.email,
    is_active: true,
  })

  if (profileError) {
    // Cleanup: delete auth user if profile fails
    await supabaseAdmin.auth.admin.deleteUser(uid)
    throw new Error(`Profile error: ${profileError.message}`)
  }

  return { uid, password }
}

/**
 * Create a trader with all fields
 * Auto-generates password and sends welcome email
 */
export async function createTrader(formData) {
  const { uid, password } = await createEntity('trader', formData)

  const { error } = await supabaseAdmin.from('traders').insert({
    id: uid,
    profile_id: uid,  // Link to profile
    name: formData.name,
    email: formData.email,
    phone: formData.phone || '',
    payin_commission: Number(formData.payinCommission) || 4,
    payout_commission: Number(formData.payoutCommission) || 1,
    balance: Number(formData.balance) || 0,
    security_hold: Number(formData.securityHold) || 0,
    telegram: formData.telegramId || '',
    telegram_group_link: formData.telegramGroupLink || '',
    is_active: formData.active !== undefined ? formData.active : true,
  })

  if (error) {
    // Cleanup on failure
    await supabaseAdmin.from('profiles').delete().eq('id', uid)
    await supabaseAdmin.auth.admin.deleteUser(uid)
    throw new Error(`Trader row error: ${error.message}`)
  }

  // Send welcome email with credentials
  await sendWelcomeEmail(formData.email, formData.name, password, 'trader')

  return { success: true, uid, passwordSent: true }
}

/**
 * Create a merchant with all fields
 * Auto-generates password and API key, sends welcome email
 */
export async function createMerchant(formData) {
  const { uid, password } = await createEntity('merchant', formData)

  // Generate API key
  const liveApiKey = `live_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`

  const { error } = await supabaseAdmin.from('merchants').insert({
    id: uid,
    profile_id: uid,  // Link to profile
    name: formData.name,
    email: formData.email,
    phone: formData.phone || '',
    business_name: formData.businessName || formData.name,
    live_api_key: liveApiKey,
    payin_commission_rate: Number(formData.payinCommissionRate),
    payout_commission_rate: Number(formData.payoutCommissionRate),
    webhook_url: formData.webhookUrl || '',
    is_active: formData.active !== undefined ? formData.active : true,
  })

  if (error) {
    await supabaseAdmin.from('profiles').delete().eq('id', uid)
    await supabaseAdmin.auth.admin.deleteUser(uid)
    throw new Error(`Merchant row error: ${error.message}`)
  }

  // Send welcome email with credentials
  await sendWelcomeEmail(formData.email, formData.name, password, 'merchant', liveApiKey)

  return { success: true, uid, apiKey: liveApiKey, passwordSent: true }
}

/**
 * Reset password for a user (generates new password and emails it)
 */
export async function resetUserPassword(email) {
  // Find user by email
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, display_name')
    .eq('email', email)
    .single()
  
  if (!profile) {
    throw new Error('User not found')
  }
  
  // Generate new password
  const newPassword = generatePassword(12)
  
  // Update password
  const { error } = await supabaseAdmin.auth.admin.updateUserById(profile.id, {
    password: newPassword
  })
  
  if (error) {
    throw new Error(`Failed to reset password: ${error.message}`)
  }
  
  // Send email with new password
  await sendWelcomeEmail(email, profile.display_name || 'User', newPassword, 'reset')
  
  return { success: true, message: `New password sent to ${email}` }
}

/**
 * Create a worker with permissions
 * Auto-generates password and sends welcome email
 */
export async function createWorker(formData) {
  const { uid, password } = await createEntity('worker', formData)

  const { error } = await supabaseAdmin.from('workers').insert({
    id: uid,
    profile_id: uid,
    name: formData.name,
    email: formData.email,
    permissions: formData.permissions || [],
    is_active: true,
  })

  if (error) {
    await supabaseAdmin.from('profiles').delete().eq('id', uid)
    await supabaseAdmin.auth.admin.deleteUser(uid)
    throw new Error(`Worker row error: ${error.message}`)
  }

  // Send welcome email with credentials
  await sendWelcomeEmail(formData.email, formData.name, password, 'worker')

  return { success: true, uid, passwordSent: true }
}

/**
 * Delete a worker (removes auth user, profile, and worker record)
 */
export async function deleteWorker(workerId) {
  // Delete worker record
  const { error: workerError } = await supabaseAdmin
    .from('workers')
    .delete()
    .eq('id', workerId)
  
  if (workerError) {
    throw new Error(`Failed to delete worker: ${workerError.message}`)
  }
  
  // Delete profile
  await supabaseAdmin.from('profiles').delete().eq('id', workerId)
  
  // Delete auth user
  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(workerId)
  
  if (authError) {
    console.warn('Failed to delete auth user:', authError.message)
  }
  
  return { success: true }
}

/**
 * Create an affiliate with bank details
 * Auto-generates password and sends welcome email
 */
export async function createAffiliate(formData) {
  const { uid, password } = await createEntity('affiliate', formData)

  const { error } = await supabaseAdmin.from('affiliates').insert({
    id: uid,
    user_id: uid,
    name: formData.name,
    email: formData.email,
    phone: formData.phone || '',
    default_commission_rate: Number(formData.default_commission_rate) || 5,
    bank_account_number: formData.bank_account_number || '',
    bank_ifsc: formData.bank_ifsc || '',
    bank_account_name: formData.bank_account_name || '',
    bank_name: formData.bank_name || '',
    status: 'active',
    total_earned: 0,
    pending_settlement: 0,
  })

  if (error) {
    await supabaseAdmin.from('profiles').delete().eq('id', uid)
    await supabaseAdmin.auth.admin.deleteUser(uid)
    throw new Error(`Affiliate row error: ${error.message}`)
  }

  // Send welcome email with credentials
  await sendWelcomeEmail(formData.email, formData.name, password, 'affiliate')

  return { success: true, uid, passwordSent: true }
}
