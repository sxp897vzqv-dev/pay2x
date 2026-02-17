/**
 * Get Payout Status
 * 
 * GET /get-payout-status?payoutId=xxx
 * Authorization: Bearer <live_api_key>
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

  try {
    // 1. Extract API key
    const authHeader = req.headers.get('Authorization');
    const apiKey = authHeader?.replace('Bearer ', '');

    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'AUTH_MISSING_KEY', message: 'API key required' } }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Get payoutId from query params
    const url = new URL(req.url);
    const payoutId = url.searchParams.get('payoutId');

    if (!payoutId) {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'MISSING_PARAM', message: 'payoutId query parameter is required' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Create Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 4. Validate API key and get merchant
    const { data: merchant, error: merchantError } = await supabase
      .from('merchants')
      .select('id')
      .eq('live_api_key', apiKey)
      .single();

    if (merchantError || !merchant) {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'AUTH_INVALID_KEY', message: 'Invalid API key' } }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Get payout
    const { data: payout, error: payoutError } = await supabase
      .from('payouts')
      .select(`
        id,
        txn_id,
        merchant_id,
        amount,
        commission,
        status,
        account_number,
        ifsc,
        account_name,
        upi_id,
        utr,
        created_at,
        completed_at,
        metadata
      `)
      .eq('id', payoutId)
      .single();

    if (payoutError || !payout) {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Payout not found' } }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Verify merchant owns this payout
    if (payout.merchant_id !== merchant.id) {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized to view this payout' } }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 7. Mask account number for security
    const maskedAccount = payout.account_number 
      ? payout.account_number.slice(-4).padStart(payout.account_number.length, '*')
      : null;

    // Determine payout mode
    const payoutMode = payout.metadata?.payout_mode || (payout.upi_id ? 'upi' : 'bank');

    // 8. Return payout details
    return new Response(
      JSON.stringify({
        success: true,
        payout: {
          payout_id: payout.id,
          txn_id: payout.txn_id,
          order_id: payout.metadata?.order_id || null,
          user_id: payout.metadata?.user_id || null,
          amount: payout.amount,
          fee: payout.commission,
          payout_mode: payoutMode,
          status: payout.status,
          // Bank details (masked)
          account_number: maskedAccount,
          ifsc_code: payout.ifsc,
          bank_name: payout.metadata?.bank_name || null,
          // UPI details
          upi_id: payout.upi_id,
          // Common
          account_name: payout.account_name,
          // Completion details
          utr: payout.utr,
          created_at: payout.created_at,
          completed_at: payout.completed_at,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Error in get-payout-status:', error);
    return new Response(
      JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
