/**
 * Switch UPI - Fallback Chain Handler
 * 
 * Called when user clicks "Try Different UPI" on payment page.
 * Switches to next UPI in the fallback chain.
 * 
 * POST /switch-upi
 * Authorization: Bearer <live_api_key>
 * Body: { paymentId: string } OR { orderId: string }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { 
  createError, 
  ERRORS,
  Pay2XError 
} from '../_shared/errors.ts';
import { 
  createRequestContext, 
  log, 
  logRequest, 
  addTraceHeaders,
  RequestContext 
} from '../_shared/logger.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface SwitchUpiRequest {
  paymentId?: string;
  payment_id?: string;  // Allow snake_case
  orderId?: string;
  order_id?: string;    // Allow snake_case
}

// Helper to create success response
function successResponse(
  data: any, 
  ctx: RequestContext
): Response {
  const headers = new Headers({
    ...corsHeaders,
    'Content-Type': 'application/json',
  });
  addTraceHeaders(headers, ctx);

  return new Response(
    JSON.stringify({
      success: true,
      ...data,
      trace_id: ctx.traceId,
    }),
    { status: 200, headers }
  );
}

// Helper to create error response
function errorResponse(
  error: Pay2XError,
  ctx: RequestContext
): Response {
  const headers = new Headers({
    ...corsHeaders,
    'Content-Type': 'application/json',
    'X-Pay2X-Error-Code': error.code,
  });
  addTraceHeaders(headers, ctx);

  return new Response(
    JSON.stringify({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details && { details: error.details }),
      },
      trace_id: ctx.traceId,
    }),
    { status: error.httpStatus, headers }
  );
}

serve(async (req: Request) => {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const ctx = createRequestContext(req);
  log('info', 'Switch UPI request', ctx);

  if (req.method !== 'POST') {
    return errorResponse(createError('INVALID_REQUEST', { method: req.method }), ctx);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // 1. Validate API key
    const authHeader = req.headers.get('Authorization');
    const apiKey = authHeader?.replace('Bearer ', '');

    if (!apiKey) {
      return errorResponse(createError('AUTH_MISSING_KEY'), ctx);
    }

    // 2. Get merchant (supports both live and test keys)
    const isTestKey = apiKey.startsWith('test_');
    const keyColumn = isTestKey ? 'test_api_key' : 'live_api_key';
    
    const { data: merchant, error: merchantError } = await supabase
      .from('merchants')
      .select('id, name, is_active')
      .eq(keyColumn, apiKey)
      .single();

    if (merchantError || !merchant) {
      return errorResponse(createError('AUTH_INVALID_KEY'), ctx);
    }

    if (!merchant.is_active) {
      return errorResponse(createError('MERCHANT_INACTIVE'), ctx);
    }

    ctx.merchantId = merchant.id;

    // 3. Parse body
    let body: SwitchUpiRequest;
    try {
      body = await req.json();
    } catch {
      return errorResponse(createError('INVALID_REQUEST', { message: 'Invalid JSON' }), ctx);
    }

    const paymentId = body.paymentId || body.payment_id;
    const orderId = body.orderId || body.order_id;

    if (!paymentId && !orderId) {
      return errorResponse(
        createError('VALIDATION_ERROR', { 
          missing: ['paymentId or orderId'],
          message: 'Either paymentId or orderId is required'
        }), 
        ctx
      );
    }

    // 4. Find payin
    let payinId: string;
    
    if (paymentId) {
      payinId = paymentId;
    } else {
      // Lookup by orderId
      const { data: payin } = await supabase
        .from('payins')
        .select('id')
        .eq('merchant_id', merchant.id)
        .eq('order_id', orderId)
        .single();

      if (!payin) {
        return errorResponse(
          createError('PAYIN_NOT_FOUND', { orderId }),
          ctx
        );
      }
      payinId = payin.id;
    }

    // 5. Call RPC to switch UPI
    const { data: result, error: rpcError } = await supabase.rpc('switch_payin_upi', {
      p_payin_id: payinId,
      p_merchant_id: merchant.id,
    });

    if (rpcError) {
      log('error', 'Switch UPI RPC failed', ctx, { error: rpcError.message });
      return errorResponse(
        createError('DATABASE_ERROR', { detail: rpcError.message }),
        ctx
      );
    }

    // 6. Handle RPC result
    if (!result || !result.success) {
      const errorCode = result?.error_code || 'SWITCH_FAILED';
      const errorMessage = result?.error || 'Failed to switch UPI';
      
      log('warn', 'Switch UPI failed', ctx, { errorCode, errorMessage });
      
      return errorResponse(
        createError(errorCode as keyof typeof ERRORS, { message: errorMessage }),
        ctx
      );
    }

    log('info', 'UPI switched successfully', ctx, { 
      oldPayinId: payinId,
      newPayinId: result.new_payin_id,
      newUpi: result.upi_id,
      attempt: result.attempt_number 
    });

    // 7. Return new payin details
    // Old payin is now failed, new payin created
    return successResponse({
      payment_id: result.new_payin_id,        // NEW payin ID
      old_payment_id: result.old_payin_id,    // Old payin (now failed)
      upi_id: result.upi_id,
      holder_name: result.holder_name,
      attempt_number: result.attempt_number,
      max_attempts: result.max_attempts,
      fallback_available: result.has_more_fallbacks,
    }, ctx);

  } catch (error: any) {
    log('error', 'Switch UPI unhandled error', ctx, { error: error.message });
    return errorResponse(
      createError('INTERNAL_ERROR', { message: error.message }),
      ctx
    );
  }
});
