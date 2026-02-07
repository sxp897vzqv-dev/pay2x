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
 * Create a new entity (trader/merchant) with auth user + profile + entity row
 * Replaces Firebase Cloud Function `createTraderComplete` / `createMerchantComplete`
 */
export async function createEntity(role, formData) {
  // 1. Create auth user
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: formData.email,
    password: formData.password,
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

  return uid
}

/**
 * Create a trader with all fields
 */
export async function createTrader(formData) {
  const uid = await createEntity('trader', formData)

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

  return { success: true, uid }
}

/**
 * Create a merchant with all fields
 */
export async function createMerchant(formData) {
  const uid = await createEntity('merchant', formData)

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
    payin_commission_rate: Number(formData.payinCommissionRate) || 6,
    payout_commission_rate: Number(formData.payoutCommissionRate) || 2,
    webhook_url: formData.webhookUrl || '',
    is_active: formData.active !== undefined ? formData.active : true,
  })

  if (error) {
    await supabaseAdmin.from('profiles').delete().eq('id', uid)
    await supabaseAdmin.auth.admin.deleteUser(uid)
    throw new Error(`Merchant row error: ${error.message}`)
  }

  return { success: true, uid, apiKey: liveApiKey }
}
