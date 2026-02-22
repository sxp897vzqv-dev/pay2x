/**
 * Get Merchant Balance - Supabase Edge Function
 * 
 * Returns merchant's current balance in INR and USDT
 * 
 * GET /get-balance
 * Authorization: Bearer <api_key>
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req: Request) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // Only allow GET
  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET' } }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // 1. Extract API key
    const authHeader = req.headers.get('Authorization');
    const apiKey = authHeader?.replace('Bearer ', '');

    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'AUTH_MISSING_KEY', message: 'Missing authorization header' } }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Validate API key and get merchant
    const isTestKey = apiKey.startsWith('test_');
    const keyColumn = isTestKey ? 'test_api_key' : 'live_api_key';

    const { data: merchant, error: merchantError } = await supabase
      .from('merchants')
      .select('id, name, balance, pending_balance, is_active')
      .eq(keyColumn, apiKey)
      .single();

    if (merchantError || !merchant) {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'AUTH_INVALID_KEY', message: 'Invalid API key' } }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!merchant.is_active) {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'MERCHANT_INACTIVE', message: 'Merchant account is inactive' } }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Get pending payouts (money reserved for pending payouts)
    const { data: pendingPayouts } = await supabase
      .from('payouts')
      .select('amount')
      .eq('merchant_id', merchant.id)
      .in('status', ['pending', 'assigned', 'processing']);

    const pendingPayoutAmount = pendingPayouts?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;

    // 4. Get current USDT rate
    let usdtRate: number | null = null;
    try {
      const { data: tatumConfig } = await supabase
        .from('tatum_config')
        .select('admin_usdt_rate')
        .single();
      usdtRate = tatumConfig?.admin_usdt_rate || null;
    } catch (e) {
      // Rate unavailable, continue without it
    }

    // 5. Calculate balances
    const balance = merchant.balance || 0;
    const pendingBalance = merchant.pending_balance || 0;
    const availableBalance = Math.max(0, balance - pendingPayoutAmount);

    // 6. Build response
    const response = {
      success: true,
      balance: {
        // INR values
        total_inr: Math.round(balance * 100) / 100,
        pending_inr: Math.round(pendingBalance * 100) / 100,
        reserved_for_payouts_inr: Math.round(pendingPayoutAmount * 100) / 100,
        available_inr: Math.round(availableBalance * 100) / 100,
        // USDT values (if rate available)
        usdt_rate: usdtRate,
        total_usdt: usdtRate ? Math.round((balance / usdtRate) * 100) / 100 : null,
        available_usdt: usdtRate ? Math.round((availableBalance / usdtRate) * 100) / 100 : null,
      },
      currency: 'INR',
      updated_at: new Date().toISOString(),
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message || 'Unknown error' } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
