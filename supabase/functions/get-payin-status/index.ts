/**
 * Get Payin Status
 * 
 * GET /get-payin-status?payinId=xxx
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
      JSON.stringify({ error: 'Method not allowed. Use GET.' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // 1. Extract API key
    const authHeader = req.headers.get('Authorization');
    const apiKey = authHeader?.replace('Bearer ', '');

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Missing API key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Get payinId from query params
    const url = new URL(req.url);
    const payinId = url.searchParams.get('payinId');

    if (!payinId) {
      return new Response(
        JSON.stringify({ error: 'payinId query parameter is required' }),
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
        JSON.stringify({ error: 'Invalid API key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Get payin
    const { data: payin, error: payinError } = await supabase
      .from('payins')
      .select(`
        id,
        txn_id,
        order_id,
        merchant_id,
        amount,
        status,
        utr,
        user_id,
        created_at,
        completed_at,
        expires_at,
        metadata
      `)
      .eq('id', payinId)
      .single();

    if (payinError || !payin) {
      return new Response(
        JSON.stringify({ error: 'Payment not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Verify merchant owns this payin
    if (payin.merchant_id !== merchant.id) {
      return new Response(
        JSON.stringify({ error: 'Not authorized to view this payment' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 7. Return payin details
    return new Response(
      JSON.stringify({
        success: true,
        payin: {
          payinId: payin.id,
          txnId: payin.txn_id,
          orderId: payin.order_id,
          amount: payin.amount,
          status: payin.status,
          utrId: payin.utr,
          userId: payin.user_id,
          createdAt: payin.created_at,
          completedAt: payin.completed_at,
          expiresAt: payin.expires_at,
          metadata: payin.metadata,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in get-payin-status:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
