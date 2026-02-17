/**
 * Get Dispute Status
 * 
 * GET /get-dispute-status?disputeId=xxx
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

    // 2. Get disputeId from query params
    const url = new URL(req.url);
    const disputeId = url.searchParams.get('disputeId');

    if (!disputeId) {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'MISSING_PARAM', message: 'disputeId query parameter is required' } }),
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

    // 5. Get dispute
    const { data: dispute, error: disputeError } = await supabase
      .from('disputes')
      .select(`
        id,
        dispute_id,
        merchant_id,
        payin_id,
        payout_id,
        type,
        status,
        amount,
        reason,
        description,
        transaction_id,
        order_id,
        upi_id,
        proof_url,
        trader_response,
        trader_proof_url,
        trader_statement,
        trader_responded_at,
        admin_decision,
        admin_note,
        admin_resolved_at,
        balance_adjusted,
        adjustment_amount,
        created_at,
        sla_deadline
      `)
      .eq('id', disputeId)
      .single();

    if (disputeError || !dispute) {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Dispute not found' } }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Verify merchant owns this dispute
    if (dispute.merchant_id !== merchant.id) {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized to view this dispute' } }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 7. Parse metadata
    let metadata = {};
    try {
      if (dispute.description) {
        metadata = JSON.parse(dispute.description);
      }
    } catch {}

    // 8. Build response based on status
    const response: any = {
      dispute_id: dispute.id,
      dispute_ref: dispute.dispute_id,
      type: dispute.type,
      status: dispute.status,
      amount: dispute.amount,
      // Transaction references
      payin_id: dispute.payin_id,
      payout_id: dispute.payout_id,
      order_id: dispute.order_id,
      upi_id: dispute.upi_id,
      utr: dispute.transaction_id,
      // Merchant's submission
      reason: dispute.reason,
      proof_url: dispute.proof_url,
      user_id: metadata.user_id || null,
      payment_date: metadata.payment_date || null,
      // Timestamps
      created_at: dispute.created_at,
      sla_deadline: dispute.sla_deadline,
    };

    // Add trader response if available
    if (dispute.trader_response) {
      response.trader_response = {
        decision: dispute.trader_response,
        proof_url: dispute.trader_proof_url,
        statement: dispute.trader_statement,
        responded_at: dispute.trader_responded_at,
      };
    }

    // Add admin decision if available
    if (dispute.admin_decision) {
      response.resolution = {
        decision: dispute.admin_decision,
        note: dispute.admin_note,
        resolved_at: dispute.admin_resolved_at,
        balance_adjusted: dispute.balance_adjusted,
        adjustment_amount: dispute.adjustment_amount,
      };
    }

    // 9. Return dispute details
    return new Response(
      JSON.stringify({
        success: true,
        dispute: response,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Error in get-dispute-status:', error);
    return new Response(
      JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
