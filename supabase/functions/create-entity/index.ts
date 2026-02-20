/**
 * Create Entity - Supabase Edge Function
 * Handles admin operations: create trader, merchant, worker, affiliate
 * Also handles password reset
 * 
 * POST /create-entity
 * Authorization: Bearer <user_jwt> (must be admin)
 * Body: { type: 'trader'|'merchant'|'worker'|'affiliate'|'reset_password', data: {...} }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'https://pay2x.io',
  'https://www.pay2x.io',
  'https://admin.pay2x.io',
  'http://localhost:5173',
  'http://localhost:3000',
];

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

function handleCors(req: Request): Response | null {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
  }
  return null;
}

// Generate secure random password
function generatePassword(length = 12): string {
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowercase = 'abcdefghjkmnpqrstuvwxyz';
  const numbers = '23456789';
  const special = '@#$%&*!';
  const all = uppercase + lowercase + numbers + special;
  
  let password = '';
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];
  
  for (let i = password.length; i < length; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }
  
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

// Generate API key for merchants
function generateApiKey(): string {
  return `live_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // 1. Verify the caller is an admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's JWT to verify their role
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: profile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || (profile.role !== 'admin' && profile.role !== 'worker')) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Parse request body
    const body = await req.json();
    const { type, data } = body;

    if (!type || !data) {
      return new Response(
        JSON.stringify({ error: 'Missing type or data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Handle different entity types
    let result;
    
    switch (type) {
      case 'trader':
        result = await createTrader(adminClient, data);
        break;
      case 'merchant':
        result = await createMerchant(adminClient, data);
        break;
      case 'worker':
        result = await createWorker(adminClient, data);
        break;
      case 'affiliate':
        result = await createAffiliate(adminClient, data);
        break;
      case 'reset_password':
        result = await resetPassword(adminClient, data);
        break;
      default:
        return new Response(
          JSON.stringify({ error: `Unknown entity type: ${type}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in create-entity:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Queue welcome email
async function queueWelcomeEmail(
  supabase: any, 
  email: string, 
  name: string, 
  password: string, 
  type: string, 
  apiKey?: string
) {
  const typeLabels: Record<string, string> = {
    trader: 'Trader',
    merchant: 'Merchant',
    worker: 'Worker',
    affiliate: 'Affiliate',
    reset: ''
  };
  
  const subject = type === 'reset' 
    ? 'Pay2X - Your Password Has Been Reset'
    : `Welcome to Pay2X - Your ${typeLabels[type] || type} Account`;
  
  const template = type === 'reset' ? 'password_reset' : 'welcome_credentials';
  
  try {
    await supabase.from('email_queue').insert({
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
    });
    return true;
  } catch (err) {
    console.warn('Failed to queue email:', err);
    return false;
  }
}

// Create base entity (auth user + profile)
async function createBaseEntity(supabase: any, role: string, formData: any) {
  const password = formData.password || generatePassword(12);
  
  // Create auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: formData.email,
    password: password,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: { display_name: formData.name },
  });

  if (authError) throw new Error(`Auth error: ${authError.message}`);
  const uid = authData.user.id;

  // Create profile
  const { error: profileError } = await supabase.from('profiles').insert({
    id: uid,
    role,
    display_name: formData.name,
    email: formData.email,
    is_active: true,
  });

  if (profileError) {
    await supabase.auth.admin.deleteUser(uid);
    throw new Error(`Profile error: ${profileError.message}`);
  }

  return { uid, password };
}

// Create Trader
async function createTrader(supabase: any, formData: any) {
  const { uid, password } = await createBaseEntity(supabase, 'trader', formData);

  const { error } = await supabase.from('traders').insert({
    id: uid,
    profile_id: uid,
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
  });

  if (error) {
    await supabase.from('profiles').delete().eq('id', uid);
    await supabase.auth.admin.deleteUser(uid);
    throw new Error(`Trader row error: ${error.message}`);
  }

  await queueWelcomeEmail(supabase, formData.email, formData.name, password, 'trader');

  return { success: true, uid, passwordSent: true };
}

// Create Merchant
async function createMerchant(supabase: any, formData: any) {
  const { uid, password } = await createBaseEntity(supabase, 'merchant', formData);
  const liveApiKey = generateApiKey();

  const { error } = await supabase.from('merchants').insert({
    id: uid,
    profile_id: uid,
    name: formData.name,
    email: formData.email,
    phone: formData.phone || '',
    business_name: formData.businessName || formData.name,
    live_api_key: liveApiKey,
    payin_commission: Number(formData.payinCommissionRate) || 0,
    payout_commission: Number(formData.payoutCommissionRate) || 0,
    webhook_url: formData.webhookUrl || '',
    is_active: formData.active !== undefined ? formData.active : true,
  });

  if (error) {
    await supabase.from('profiles').delete().eq('id', uid);
    await supabase.auth.admin.deleteUser(uid);
    throw new Error(`Merchant row error: ${error.message}`);
  }

  await queueWelcomeEmail(supabase, formData.email, formData.name, password, 'merchant', liveApiKey);

  return { success: true, uid, apiKey: liveApiKey, passwordSent: true };
}

// Create Worker
async function createWorker(supabase: any, formData: any) {
  const { uid, password } = await createBaseEntity(supabase, 'worker', formData);

  const { error } = await supabase.from('workers').insert({
    id: uid,
    profile_id: uid,
    name: formData.name,
    email: formData.email,
    permissions: formData.permissions || [],
    is_active: true,
  });

  if (error) {
    await supabase.from('profiles').delete().eq('id', uid);
    await supabase.auth.admin.deleteUser(uid);
    throw new Error(`Worker row error: ${error.message}`);
  }

  await queueWelcomeEmail(supabase, formData.email, formData.name, password, 'worker');

  return { success: true, uid, passwordSent: true };
}

// Create Affiliate
async function createAffiliate(supabase: any, formData: any) {
  const { uid, password } = await createBaseEntity(supabase, 'affiliate', formData);

  const { error } = await supabase.from('affiliates').insert({
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
  });

  if (error) {
    await supabase.from('profiles').delete().eq('id', uid);
    await supabase.auth.admin.deleteUser(uid);
    throw new Error(`Affiliate row error: ${error.message}`);
  }

  await queueWelcomeEmail(supabase, formData.email, formData.name, password, 'affiliate');

  return { success: true, uid, passwordSent: true };
}

// Reset Password
async function resetPassword(supabase: any, data: any) {
  const { email } = data;
  
  if (!email) throw new Error('Email is required');

  // Find user by email
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name')
    .eq('email', email)
    .single();
  
  if (!profile) throw new Error('User not found');
  
  // Generate new password
  const newPassword = generatePassword(12);
  
  // Update password
  const { error } = await supabase.auth.admin.updateUserById(profile.id, {
    password: newPassword
  });
  
  if (error) throw new Error(`Failed to reset password: ${error.message}`);
  
  // Send email with new password
  await queueWelcomeEmail(supabase, email, profile.display_name || 'User', newPassword, 'reset');
  
  return { success: true, message: `New password sent to ${email}` };
}

// Delete Worker
async function deleteWorker(supabase: any, workerId: string) {
  const { error: workerError } = await supabase
    .from('workers')
    .delete()
    .eq('id', workerId);
  
  if (workerError) throw new Error(`Failed to delete worker: ${workerError.message}`);
  
  await supabase.from('profiles').delete().eq('id', workerId);
  await supabase.auth.admin.deleteUser(workerId);
  
  return { success: true };
}
