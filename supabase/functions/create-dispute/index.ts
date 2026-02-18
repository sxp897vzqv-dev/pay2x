/**
 * Create Dispute - Supabase Edge Function
 * 
 * POST /create-dispute
 * Authorization: Bearer <live_api_key>
 * 
 * Two types of disputes:
 * 
 * 1. PAYIN DISPUTE (payment_not_received, wrong_amount, duplicate_payment)
 *    - User paid but merchant says not credited
 *    - Required: upiId OR payinId, amount, utr
 *    - Optional: userId, paymentDate, receiptUrl, comment
 * 
 * 2. PAYOUT DISPUTE (payout_not_received)
 *    - Trader marked complete but user didn't receive
 *    - Required: payoutId OR orderId, amount
 *    - Optional: userId, accountNumber, accountName, comment
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Dispute types
type DisputeType = 
  | 'payment_not_received'  // Payin: paid but not credited
  | 'wrong_amount'          // Payin: credited wrong amount
  | 'duplicate_payment'     // Payin: paid twice
  | 'payout_not_received'   // Payout: trader says sent but user didn't get
  | 'refund_request'        // Request refund
  | 'other';

const PAYIN_DISPUTE_TYPES: DisputeType[] = ['payment_not_received', 'wrong_amount', 'duplicate_payment'];
const PAYOUT_DISPUTE_TYPES: DisputeType[] = ['payout_not_received'];

interface CreateDisputeRequest {
  // Dispute type
  type: DisputeType;
  
  // Payin dispute fields
  payinId?: string;
  upiId?: string;
  utr?: string;
  
  // Payout dispute fields
  payoutId?: string;
  orderId?: string;
  
  // Common fields
  amount: number;
  userId?: string;
  comment?: string;
  receiptUrl?: string;
  paymentDate?: string;
  
  // Account details (for payout disputes)
  accountNumber?: string;
  accountName?: string;
  ifscCode?: string;
  
  // Extra data
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

    // 2. Validate API key and get merchant (supports both live and test keys)
    const isTestKey = apiKey.startsWith('test_');
    const keyColumn = isTestKey ? 'test_api_key' : 'live_api_key';
    
    const { data: merchant, error: merchantError } = await supabase
      .from('merchants')
      .select('id, name, is_active')
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

    const { 
      type, 
      payinId, 
      payoutId, 
      upiId, 
      orderId, 
      utr,
      amount, 
      userId,
      comment,
      receiptUrl,
      paymentDate,
      accountNumber,
      accountName,
      ifscCode,
      metadata 
    } = body;

    // 4. Validate required fields
    if (!type) {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'MISSING_TYPE', message: 'Dispute type is required' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!amount || amount <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'MISSING_AMOUNT', message: 'Amount is required and must be positive' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine dispute category
    const isPayinDispute = PAYIN_DISPUTE_TYPES.includes(type);
    const isPayoutDispute = PAYOUT_DISPUTE_TYPES.includes(type);

    // 5. Validate based on dispute type
    let resolvedPayinId: string | null = null;
    let resolvedPayoutId: string | null = null;
    let traderId: string | null = null;
    let resolvedUpiId: string | null = upiId || null;
    let resolvedOrderId: string | null = orderId || null;

    if (isPayinDispute) {
      // For payin disputes, need either payinId, upiId, or orderId
      if (!payinId && !upiId && !orderId) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: { 
              code: 'MISSING_REFERENCE', 
              message: 'For payin disputes, provide payinId, upiId, or orderId' 
            } 
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // UTR is recommended for payin disputes
      if (!utr) {
        console.log('Warning: No UTR provided for payin dispute');
      }

      // Lookup payin if we have reference
      if (payinId) {
        const { data: payin } = await supabase
          .from('payins')
          .select('id, merchant_id, trader_id, upi_id, order_id')
          .eq('id', payinId)
          .eq('merchant_id', merchant.id)
          .single();

        if (payin) {
          resolvedPayinId = payin.id;
          traderId = payin.trader_id;
          resolvedUpiId = payin.upi_id;
          resolvedOrderId = payin.order_id;
        }
      } else if (upiId) {
        // Find by UPI ID (most recent)
        const { data: payin } = await supabase
          .from('payins')
          .select('id, trader_id, order_id')
          .eq('merchant_id', merchant.id)
          .eq('upi_id', upiId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (payin) {
          resolvedPayinId = payin.id;
          traderId = payin.trader_id;
          resolvedOrderId = payin.order_id;
        }
      } else if (orderId) {
        const { data: payin } = await supabase
          .from('payins')
          .select('id, trader_id, upi_id')
          .eq('merchant_id', merchant.id)
          .eq('order_id', orderId)
          .single();

        if (payin) {
          resolvedPayinId = payin.id;
          traderId = payin.trader_id;
          resolvedUpiId = payin.upi_id;
        }
      }
    }

    if (isPayoutDispute) {
      // For payout disputes, need either payoutId or orderId
      if (!payoutId && !orderId) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: { 
              code: 'MISSING_REFERENCE', 
              message: 'For payout disputes, provide payoutId or orderId' 
            } 
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Lookup payout
      if (payoutId) {
        const { data: payout } = await supabase
          .from('payouts')
          .select('id, merchant_id, trader_id, metadata')
          .eq('id', payoutId)
          .eq('merchant_id', merchant.id)
          .single();

        if (payout) {
          resolvedPayoutId = payout.id;
          traderId = payout.trader_id;
          resolvedOrderId = payout.metadata?.order_id || null;
        }
      } else if (orderId) {
        const { data: payout } = await supabase
          .from('payouts')
          .select('id, trader_id')
          .eq('merchant_id', merchant.id)
          .contains('metadata', { order_id: orderId })
          .single();

        if (payout) {
          resolvedPayoutId = payout.id;
          traderId = payout.trader_id;
        }
      }
    }

    // For 'other' or 'refund_request', allow flexible reference
    if (!isPayinDispute && !isPayoutDispute) {
      // Try to find any matching transaction
      if (payinId) resolvedPayinId = payinId;
      if (payoutId) resolvedPayoutId = payoutId;
      
      if (orderId && !resolvedPayinId && !resolvedPayoutId) {
        // Try payin first
        const { data: payin } = await supabase
          .from('payins')
          .select('id, trader_id')
          .eq('merchant_id', merchant.id)
          .eq('order_id', orderId)
          .single();

        if (payin) {
          resolvedPayinId = payin.id;
          traderId = payin.trader_id;
        } else {
          // Try payout
          const { data: payout } = await supabase
            .from('payouts')
            .select('id, trader_id')
            .eq('merchant_id', merchant.id)
            .contains('metadata', { order_id: orderId })
            .single();

          if (payout) {
            resolvedPayoutId = payout.id;
            traderId = payout.trader_id;
          }
        }
      }
    }

    // 6. Check for existing open dispute
    if (resolvedPayinId || resolvedPayoutId) {
      const existingQuery = supabase
        .from('disputes')
        .select('id, status')
        .eq('merchant_id', merchant.id)
        .in('status', ['pending', 'routed_to_trader', 'trader_accepted']);

      if (resolvedPayinId) {
        existingQuery.eq('payin_id', resolvedPayinId);
      } else if (resolvedPayoutId) {
        existingQuery.eq('payout_id', resolvedPayoutId);
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

    // 7. Generate dispute reference
    const disputeRef = `DSP${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    // 8. Build metadata
    const disputeMetadata = {
      ...metadata,
      user_id: userId || null,
      payment_date: paymentDate || null,
      // For payout disputes, include account details
      account_number: accountNumber || null,
      account_name: accountName || null,
      ifsc_code: ifscCode || null,
    };

    // 9. Create dispute record
    const { data: dispute, error: disputeError } = await supabase
      .from('disputes')
      .insert({
        merchant_id: merchant.id,
        payin_id: resolvedPayinId,
        payout_id: resolvedPayoutId,
        type,
        reason: comment || `${type} dispute`,
        description: JSON.stringify(disputeMetadata),
        transaction_id: utr || null,
        order_id: resolvedOrderId,
        upi_id: resolvedUpiId,
        amount: amount,
        proof_url: receiptUrl || null,
        status: traderId ? 'routed_to_trader' : 'pending',
        trader_id: traderId,
        routed_at: traderId ? new Date().toISOString() : null,
        route_reason: traderId ? 'auto_from_transaction' : null,
        dispute_id: disputeRef,
        // SLA: 48 hours to respond
        sla_deadline: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      })
      .select('id, dispute_id')
      .single();

    if (disputeError) {
      console.error('Dispute creation error:', disputeError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: { 
            code: 'CREATE_ERROR', 
            message: 'Failed to create dispute',
            detail: disputeError.message 
          } 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 10. If not auto-routed, try to route
    if (!traderId) {
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
            traderId = routeData.traderId;
          }
        }
      } catch (routeError) {
        console.error('Auto-route failed:', routeError);
      }
    }

    // 11. Return success
    return new Response(
      JSON.stringify({
        success: true,
        dispute_id: dispute.id,
        dispute_ref: dispute.dispute_id,
        type,
        status: traderId ? 'routed_to_trader' : 'pending',
        routed: !!traderId,
        message: traderId 
          ? 'Dispute created and sent to trader for review.' 
          : 'Dispute created. Our team will review and route it shortly.',
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
