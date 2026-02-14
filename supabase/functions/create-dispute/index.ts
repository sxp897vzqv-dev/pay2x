/**
 * Create Dispute - Supabase Edge Function
 * 
 * POST /create-dispute
 * Authorization: Bearer <live_api_key>
 * Body: { payinId?, payoutId?, type, reason, utr?, amount?, proofUrl? }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface CreateDisputeRequest {
  payinId?: string;
  payoutId?: string;
  upiId?: string;  // Can lookup by UPI ID
  orderId?: string; // Can lookup by order ID
  type: 'payment_not_received' | 'wrong_amount' | 'duplicate_payment' | 'refund_request' | 'payout_not_received' | 'other';
  reason: string;
  utr?: string;
  amount?: number;
  proofUrl?: string;
  metadata?: Record<string, any>;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST' } }),
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
        JSON.stringify({ success: false, error: { code: 'AUTH_MISSING_KEY', message: 'API key required' } }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Validate API key and get merchant
    const { data: merchant, error: merchantError } = await supabase
      .from('merchants')
      .select('id, name, is_active')
      .eq('live_api_key', apiKey)
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

    // 3. Parse request body
    let body: CreateDisputeRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let { payinId, payoutId, upiId: lookupUpiId, orderId, type, reason, utr, amount, proofUrl, metadata } = body;

    // 4. Validate required fields
    if (!type || !reason) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: { code: 'MISSING_FIELDS', message: 'type and reason are required' } 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Lookup by UPI ID or Order ID if no direct ID provided
    if (!payinId && !payoutId && lookupUpiId) {
      // Find most recent payin with this UPI for this merchant
      const { data: foundPayin } = await supabase
        .from('payins')
        .select('id')
        .eq('merchant_id', merchant.id)
        .eq('upi_id', lookupUpiId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (foundPayin) {
        payinId = foundPayin.id;
      }
    }

    if (!payinId && !payoutId && orderId) {
      // Find payin by order_id
      const { data: foundPayin } = await supabase
        .from('payins')
        .select('id')
        .eq('merchant_id', merchant.id)
        .eq('order_id', orderId)
        .single();
      
      if (foundPayin) {
        payinId = foundPayin.id;
      } else {
        // Try payout by order_id in metadata
        const { data: foundPayout } = await supabase
          .from('payouts')
          .select('id')
          .eq('merchant_id', merchant.id)
          .contains('metadata', { order_id: orderId })
          .single();
        
        if (foundPayout) {
          payoutId = foundPayout.id;
        }
      }
    }

    // Allow dispute creation even without matching transaction (manual routing)
    const hasReference = payinId || payoutId || lookupUpiId || orderId;
    if (!hasReference) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: { code: 'MISSING_REFERENCE', message: 'Provide payinId, payoutId, upiId, or orderId' } 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Validate transaction belongs to merchant and get amount
    let transactionAmount = amount;
    let traderId: string | null = null;
    let upiId: string | null = lookupUpiId || null;

    if (payinId) {
      const { data: payin, error: payinError } = await supabase
        .from('payins')
        .select('id, merchant_id, amount, status, trader_id, upi_id')
        .eq('id', payinId)
        .single();

      if (payinError || !payin) {
        return new Response(
          JSON.stringify({ success: false, error: { code: 'PAYIN_NOT_FOUND', message: 'Payin not found' } }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (payin.merchant_id !== merchant.id) {
        return new Response(
          JSON.stringify({ success: false, error: { code: 'NOT_AUTHORIZED', message: 'Not authorized for this transaction' } }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get amount and trader from payin
      if (!transactionAmount) transactionAmount = payin.amount;
      traderId = payin.trader_id;
      upiId = payin.upi_id;
    }

    if (payoutId) {
      const { data: payout, error: payoutError } = await supabase
        .from('payouts')
        .select('id, merchant_id, amount, status, trader_id')
        .eq('id', payoutId)
        .single();

      if (payoutError || !payout) {
        return new Response(
          JSON.stringify({ success: false, error: { code: 'PAYOUT_NOT_FOUND', message: 'Payout not found' } }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (payout.merchant_id !== merchant.id) {
        return new Response(
          JSON.stringify({ success: false, error: { code: 'NOT_AUTHORIZED', message: 'Not authorized for this transaction' } }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get amount and trader from payout
      if (!transactionAmount) transactionAmount = payout.amount;
      traderId = payout.trader_id;
    }

    // 7. Check for existing open dispute (only if we have a specific transaction)
    if (payinId || payoutId) {
      const existingQuery = supabase
        .from('disputes')
        .select('id, status')
        .eq('merchant_id', merchant.id)
        .in('status', ['pending', 'routed_to_trader', 'trader_accepted']);

      if (payinId) {
        existingQuery.eq('payin_id', payinId);
      } else {
        existingQuery.eq('payout_id', payoutId);
      }

      const { data: existingDispute } = await existingQuery.single();

      if (existingDispute) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: { 
              code: 'DISPUTE_EXISTS', 
              message: 'An open dispute already exists for this transaction',
              dispute_id: existingDispute.id 
            } 
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 8. Create dispute record
    const { data: dispute, error: disputeError } = await supabase
      .from('disputes')
      .insert({
        merchant_id: merchant.id,
        payin_id: payinId || null,
        payout_id: payoutId || null,
        type,
        reason,
        transaction_id: utr || null,
        amount: transactionAmount,
        proof_url: proofUrl || null,
        status: traderId ? 'routed_to_trader' : 'pending',
        trader_id: traderId,
        upi_id: upiId,
        routed_at: traderId ? new Date().toISOString() : null,
        route_reason: traderId ? 'auto_from_transaction' : null,
        description: metadata ? JSON.stringify(metadata) : null,
      })
      .select('id')
      .single();

    if (disputeError) {
      console.error('Dispute creation error:', disputeError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: { 
            code: 'CREATE_ERROR', 
            message: 'Failed to create dispute',
            detail: disputeError.message,
            hint: disputeError.hint 
          } 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 9. Try to auto-route dispute to trader
    try {
      const routeResponse = await fetch(`${SUPABASE_URL}/functions/v1/route-dispute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify({ disputeId: dispute.id }),
      });
      
      if (routeResponse.ok) {
        const routeData = await routeResponse.json();
        if (routeData.routed) {
          // Update dispute status
          await supabase
            .from('disputes')
            .update({ 
              status: 'routed_to_trader',
              trader_id: routeData.traderId,
              routed_at: new Date().toISOString(),
              route_reason: routeData.reason,
            })
            .eq('id', dispute.id);
        }
      }
    } catch (routeError) {
      console.error('Auto-route failed:', routeError);
      // Continue - dispute is created, will be manually routed
    }

    // 10. Return success
    return new Response(
      JSON.stringify({
        success: true,
        dispute_id: dispute.id,
        status: 'pending',
        message: 'Dispute created. You will be notified when it is resolved.',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Unhandled error:', error);
    return new Response(
      JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
