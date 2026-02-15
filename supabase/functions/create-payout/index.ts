/**
 * Create Payout - Supabase Edge Function
 * 
 * POST /create-payout
 * Authorization: Bearer <live_api_key>
 * Body: { amount, accountNumber, ifscCode, accountName, bankName, orderId?, metadata? }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MIN_AMOUNT = 100;
const MAX_AMOUNT = 200000;

interface CreatePayoutRequest {
  amount: number;
  accountNumber: string;
  ifscCode: string;
  accountName: string;
  bankName?: string;
  orderId?: string;
  metadata?: Record<string, any>;
  description?: string;
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
      .select('id, name, is_active, available_balance, payout_rate, payout_commission_rate, webhook_url, webhook_secret')
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
    let body: CreatePayoutRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { amount, accountNumber, ifscCode, accountName, bankName, orderId, metadata, description } = body;

    // 4. Validate required fields
    if (!amount || !accountNumber || !ifscCode || !accountName) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: { 
            code: 'MISSING_FIELDS', 
            message: 'amount, accountNumber, ifscCode, and accountName are required' 
          } 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Validate amount
    const amountNum = Number(amount);
    if (isNaN(amountNum) || amountNum < MIN_AMOUNT) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: { code: 'AMOUNT_TOO_LOW', message: `Minimum amount is ₹${MIN_AMOUNT}` } 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (amountNum > MAX_AMOUNT) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: { code: 'AMOUNT_TOO_HIGH', message: `Maximum amount is ₹${MAX_AMOUNT}` } 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Calculate fee (balance deducted only on completion, not on creation)
    const payoutRate = merchant.payout_commission_rate ?? merchant.payout_rate ?? 2; // Default 2%
    const fee = Math.round(amountNum * payoutRate / 100);
    const totalRequired = amountNum + fee;

    // NO balance deduction here - balance is deducted only when payout is COMPLETED
    // Traders fulfill payouts from their own balance first

    // 7. Check duplicate orderId (stored in metadata)
    if (orderId) {
      const { data: existing } = await supabase
        .from('payouts')
        .select('id')
        .eq('merchant_id', merchant.id)
        .contains('metadata', { order_id: orderId })
        .single();

      if (existing) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: { code: 'DUPLICATE_ORDER', message: 'Order ID already used' } 
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 8. NO balance deduction on creation
    // Balance will be deducted when payout status changes to 'completed'
    // This happens via trigger or when admin/system marks payout as complete

    // 9. Generate payout ID
    const payoutId = `PO${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    // 10. Create payout record
    const { data: payout, error: payoutError } = await supabase
      .from('payouts')
      .insert({
        merchant_id: merchant.id,
        txn_id: `PO${Date.now()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        amount: amountNum,
        commission: fee,
        status: 'pending',
        account_number: accountNumber,
        ifsc: ifscCode,
        account_name: accountName,
        metadata: { ...metadata, order_id: orderId } || null,
      })
      .select('id')
      .single();

    if (payoutError) {
      console.error('Payout creation error:', payoutError);
      return new Response(
        JSON.stringify({ success: false, error: { code: 'CREATE_ERROR', message: 'Failed to create payout' } }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 11. Queue webhook
    if (merchant.webhook_url) {
      await supabase
        .from('payout_webhook_queue')
        .insert({
          merchant_id: merchant.id,
          payout_id: payout.id,
          event: 'payout.created',
          payload: {
            payout_id: payout.id,
            order_id: orderId,
            amount: amountNum,
            fee,
            status: 'pending',
            account_number: accountNumber.slice(-4).padStart(accountNumber.length, '*'),
            ifsc_code: ifscCode,
            account_name: accountName,
          },
          attempt: 0,
          next_retry_at: new Date().toISOString(),
        });
    }

    // 12. Return success
    return new Response(
      JSON.stringify({
        success: true,
        payout_id: payout.id,
        order_id: orderId || null,
        amount: amountNum,
        fee,
        total_on_completion: totalRequired,
        status: 'pending',
        message: 'Payout request created. Balance will be deducted on completion.',
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
