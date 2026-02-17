/**
 * Create Payin - Supabase Edge Function (Enterprise Edition)
 * 
 * Features:
 * - Rate Limiting (per-merchant)
 * - Idempotency Keys
 * - Request Logging with Trace IDs
 * - Standardized Error Responses
 * - Webhook Queueing
 * 
 * POST /create-payin
 * Authorization: Bearer <live_api_key>
 * X-Idempotency-Key: <unique_key> (optional)
 * Body: { amount, userId, orderId?, metadata? }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { PayinEngineV4 } from '../_shared/payin-engine-v4.ts';
import { 
  createError, 
  errorResponse, 
  ERRORS,
  validateRequired,
  Pay2XError 
} from '../_shared/errors.ts';
import { checkRateLimit, addRateLimitHeaders, RateLimitResult } from '../_shared/rate-limiter.ts';
import { checkIdempotency, saveIdempotencyResponse } from '../_shared/idempotency.ts';
import { 
  createRequestContext, 
  log, 
  logRequest, 
  addTraceHeaders,
  RequestContext 
} from '../_shared/logger.ts';
import { queueWebhook } from '../_shared/webhook-queue.ts';
import { getLocation, getClientIP, GeoLocation } from '../_shared/geo.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Validation
const MIN_AMOUNT = 100;
const MAX_AMOUNT = 100000;
const TIMER_SECONDS = 600; // 10 minutes

interface CreatePayinRequest {
  amount: number;
  userId: string;
  orderId?: string;
  metadata?: Record<string, any>;
  description?: string;
}

// Helper to create success response
function successResponse(
  data: any, 
  ctx: RequestContext, 
  rateLimitResult?: RateLimitResult
): Response {
  const headers = new Headers({
    ...corsHeaders,
    'Content-Type': 'application/json',
  });
  
  addTraceHeaders(headers, ctx);
  if (rateLimitResult) {
    addRateLimitHeaders(headers, rateLimitResult);
  }

  return new Response(
    JSON.stringify({
      success: true,
      ...data,
      trace_id: ctx.traceId,
    }),
    { status: 200, headers }
  );
}

// Helper to create error response with logging
function createErrorResponse(
  error: Pay2XError,
  ctx: RequestContext,
  rateLimitResult?: RateLimitResult
): Response {
  const headers = new Headers({
    ...corsHeaders,
    'Content-Type': 'application/json',
    'X-Pay2X-Error-Code': error.code,
  });

  addTraceHeaders(headers, ctx);
  if (rateLimitResult) {
    addRateLimitHeaders(headers, rateLimitResult);
  }
  if (error.retryAfter) {
    headers.set('Retry-After', String(error.retryAfter));
  }

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
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // Create request context with trace ID
  const ctx = createRequestContext(req);
  log('info', 'Incoming request', ctx, { method: req.method, url: req.url });

  // Only allow POST
  if (req.method !== 'POST') {
    const error = createError('INVALID_REQUEST', { method: req.method });
    return createErrorResponse(error, ctx);
  }

  // Create Supabase client
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  
  let merchant: any = null;
  let rateLimitResult: RateLimitResult | undefined;
  let responseBody: any = null;
  let responseStatus = 200;
  let errorCode: string | undefined;
  let errorMessage: string | undefined;

  try {
    // 1. Extract and validate API key
    const authHeader = req.headers.get('Authorization');
    const apiKey = authHeader?.replace('Bearer ', '');

    if (!apiKey) {
      const error = createError('AUTH_MISSING_KEY');
      errorCode = error.code;
      errorMessage = error.message;
      responseStatus = error.httpStatus;
      
      await logRequest(supabase, ctx, req, { status: error.httpStatus, errorCode, errorMessage });
      return createErrorResponse(error, ctx);
    }

    // 2. Validate API key and get merchant  
    const { data: merchantData, error: merchantError } = await supabase
      .from('merchants')
      .select('id, name, business_name, is_active, webhook_url, webhook_secret')
      .eq('live_api_key', apiKey)
      .single();

    if (merchantError || !merchantData) {
      const error = createError('AUTH_INVALID_KEY');
      errorCode = error.code;
      errorMessage = error.message;
      responseStatus = error.httpStatus;
      
      log('warn', 'Invalid API key', ctx, { keyPrefix: apiKey.slice(0, 10), dbError: merchantError?.message });
      await logRequest(supabase, ctx, req, { status: error.httpStatus, errorCode, errorMessage });
      return createErrorResponse(error, ctx);
    }

    merchant = merchantData;
    ctx.merchantId = merchant.id;

    if (!merchant.is_active) {
      const error = createError('MERCHANT_INACTIVE');
      errorCode = error.code;
      errorMessage = error.message;
      responseStatus = error.httpStatus;
      
      await logRequest(supabase, ctx, req, { status: error.httpStatus, errorCode, errorMessage });
      return createErrorResponse(error, ctx);
    }

    log('info', 'Merchant verified', ctx, { merchantId: merchant.id, plan: merchant.plan });

    // 3. Rate Limiting
    rateLimitResult = await checkRateLimit(
      supabase, 
      merchant.id, 
      '/create-payin',
      merchant.plan || 'free'
    );

    if (!rateLimitResult.allowed) {
      const error = rateLimitResult.error || createError('RATE_LIMIT_MINUTE');
      errorCode = error.code;
      errorMessage = error.message;
      responseStatus = error.httpStatus;
      
      log('warn', 'Rate limit exceeded', ctx, { 
        remaining: rateLimitResult.remaining,
        resetAt: rateLimitResult.resetAt 
      });
      await logRequest(supabase, ctx, req, { status: error.httpStatus, errorCode, errorMessage }, rateLimitResult.remaining, rateLimitResult.resetAt);
      return createErrorResponse(error, ctx, rateLimitResult);
    }

    // 4. Parse request body
    let body: CreatePayinRequest;
    try {
      body = await req.json();
    } catch {
      const error = createError('INVALID_REQUEST', { message: 'Invalid JSON body' });
      errorCode = error.code;
      errorMessage = error.message;
      responseStatus = error.httpStatus;
      
      await logRequest(supabase, ctx, req, { status: error.httpStatus, errorCode, errorMessage }, rateLimitResult.remaining, rateLimitResult.resetAt);
      return createErrorResponse(error, ctx, rateLimitResult);
    }

    const { amount, userId, orderId, metadata, description } = body;

    // 5. Validate required fields
    const validationError = validateRequired(body, ['amount', 'userId']);
    if (validationError) {
      errorCode = validationError.code;
      errorMessage = validationError.message;
      responseStatus = validationError.httpStatus;
      
      await logRequest(supabase, ctx, req, { status: validationError.httpStatus, errorCode, errorMessage }, rateLimitResult.remaining, rateLimitResult.resetAt);
      return createErrorResponse(validationError, ctx, rateLimitResult);
    }

    // 6. Validate amount
    const amountNum = Number(amount);
    if (isNaN(amountNum) || amountNum < MIN_AMOUNT) {
      const error = createError('AMOUNT_TOO_LOW', { 
        amount: amountNum, 
        minimum: MIN_AMOUNT 
      });
      errorCode = error.code;
      errorMessage = error.message;
      responseStatus = error.httpStatus;
      
      await logRequest(supabase, ctx, req, { status: error.httpStatus, errorCode, errorMessage }, rateLimitResult.remaining, rateLimitResult.resetAt);
      return createErrorResponse(error, ctx, rateLimitResult);
    }

    if (amountNum > MAX_AMOUNT) {
      const error = createError('AMOUNT_TOO_HIGH', { 
        amount: amountNum, 
        maximum: MAX_AMOUNT 
      });
      errorCode = error.code;
      errorMessage = error.message;
      responseStatus = error.httpStatus;
      
      await logRequest(supabase, ctx, req, { status: error.httpStatus, errorCode, errorMessage }, rateLimitResult.remaining, rateLimitResult.resetAt);
      return createErrorResponse(error, ctx, rateLimitResult);
    }

    // 7. Idempotency Check
    const idempotencyKey = ctx.idempotencyKey;
    if (idempotencyKey) {
      const idempotencyResult = await checkIdempotency(
        supabase,
        idempotencyKey,
        merchant.id,
        '/create-payin',
        body
      );

      if (!idempotencyResult.isNew) {
        if (idempotencyResult.error) {
          errorCode = idempotencyResult.error.code;
          errorMessage = idempotencyResult.error.message;
          responseStatus = idempotencyResult.error.httpStatus;
          
          await logRequest(supabase, ctx, req, { status: idempotencyResult.error.httpStatus, errorCode, errorMessage }, rateLimitResult.remaining, rateLimitResult.resetAt);
          return createErrorResponse(idempotencyResult.error, ctx, rateLimitResult);
        }

        if (idempotencyResult.cachedResponse) {
          log('info', 'Returning cached idempotent response', ctx);
          responseBody = idempotencyResult.cachedResponse.body;
          responseStatus = idempotencyResult.cachedResponse.status;
          
          await logRequest(supabase, ctx, req, { status: responseStatus, body: responseBody }, rateLimitResult.remaining, rateLimitResult.resetAt);
          return new Response(
            JSON.stringify(responseBody),
            { 
              status: responseStatus, 
              headers: { 
                ...corsHeaders, 
                'Content-Type': 'application/json',
                'X-Trace-Id': ctx.traceId,
                'X-Idempotent-Replayed': 'true',
              } 
            }
          );
        }
      }
    }

    // 8. Check for duplicate orderId (legacy check)
    if (orderId) {
      const { data: existing } = await supabase
        .from('payins')
        .select('id')
        .eq('merchant_id', merchant.id)
        .eq('order_id', orderId)
        .single();

      if (existing) {
        const error = createError('DUPLICATE_REQUEST', { orderId });
        errorCode = error.code;
        errorMessage = error.message;
        responseStatus = error.httpStatus;
        
        await logRequest(supabase, ctx, req, { status: error.httpStatus, errorCode, errorMessage }, rateLimitResult.remaining, rateLimitResult.resetAt);
        return createErrorResponse(error, ctx, rateLimitResult);
      }
    }

    // 9. Get user location (tries Vercel headers first, falls back to IP lookup)
    const clientIP = getClientIP(req);
    const userGeo = await getLocation(req);
    log('info', 'User geo detected', ctx, { ip: clientIP, city: userGeo.city, state: userGeo.state });

    // 10. Smart UPI selection via PayinEngine v4 (with geo)
    log('info', 'Selecting UPI', ctx, { amount: amountNum, userId, userCity: userGeo.city });
    const engine = new PayinEngineV4(supabase);
    const selection = await engine.selectUpi(amountNum, merchant.id, userId, userGeo);

    if (!selection.success) {
      const error = createError('UPI_UNAVAILABLE', { 
        reason: selection.error,
        retryAfter: 60 
      });
      errorCode = error.code;
      errorMessage = error.message;
      responseStatus = error.httpStatus;
      
      log('warn', 'UPI selection failed', ctx, { error: selection.error });
      await logRequest(supabase, ctx, req, { status: error.httpStatus, errorCode, errorMessage }, rateLimitResult.remaining, rateLimitResult.resetAt);
      return createErrorResponse(error, ctx, rateLimitResult);
    }

    log('info', 'UPI selected', ctx, { 
      upiId: selection.upiId, 
      score: selection.score,
      geoMatch: selection.geoMatch,
      geoBoost: selection.geoBoost
    });

    // 11. Generate transaction ID
    const txnId = `TXN${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    // 12. Calculate expiry
    const expiresAt = new Date(Date.now() + TIMER_SECONDS * 1000);

    // 13. Create payin record with fallback chain + geo
    const { data: payin, error: payinError } = await supabase
      .from('payins')
      .insert({
        txn_id: txnId,
        order_id: orderId || null,
        merchant_id: merchant.id,
        trader_id: selection.traderId,
        upi_pool_id: selection.upiPoolId,
        amount: amountNum,
        status: 'pending',
        upi_id: selection.upiId,
        holder_name: selection.holderName,
        user_id: userId,
        timer: TIMER_SECONDS,
        expires_at: expiresAt.toISOString(),
        metadata: metadata || null,
        // Fallback chain fields
        fallback_chain: selection.fallbackChain || [selection.upiPoolId],
        current_attempt: 1,
        max_attempts: selection.maxAttempts || 1,
        attempt_history: [],
        // User geo fields
        user_ip: clientIP || null,
        user_city: userGeo.city,
        user_state: userGeo.state,
        user_lat: userGeo.lat,
        user_lon: userGeo.lon,
      })
      .select('id')
      .single();

    if (payinError) {
      const error = createError('DATABASE_ERROR', { detail: 'Failed to create payment' });
      errorCode = error.code;
      errorMessage = error.message;
      responseStatus = error.httpStatus;
      
      log('error', 'Payin creation failed', ctx, { error: payinError.message });
      await logRequest(supabase, ctx, req, { status: error.httpStatus, errorCode, errorMessage }, rateLimitResult.remaining, rateLimitResult.resetAt);
      return createErrorResponse(error, ctx, rateLimitResult);
    }

    log('info', 'Payin created', ctx, { payinId: payin.id, txnId });

    // 13. Queue webhook for payment.created event
    await queueWebhook(supabase, merchant.id, 'payment.created', payin.id, {
      id: payin.id,
      txn_id: txnId,
      order_id: orderId,
      amount: amountNum,
      status: 'pending',
      upi_id: selection.upiId,
      expires_at: expiresAt.toISOString(),
    });

    // 14. Build response
    const hasMoreFallbacks = (selection.maxAttempts || 1) > 1;
    responseBody = {
      payment_id: payin.id,
      txn_id: txnId,
      order_id: orderId || null,
      upi_id: selection.upiId,
      holder_name: selection.holderName,
      amount: amountNum,
      currency: 'INR',
      status: 'pending',
      timer: TIMER_SECONDS,
      expires_at: expiresAt.toISOString(),
      // Fallback info
      attempt_number: 1,
      max_attempts: selection.maxAttempts || 1,
      fallback_available: hasMoreFallbacks,
    };
    responseStatus = 200;

    // 15. Save idempotency response
    if (idempotencyKey) {
      await saveIdempotencyResponse(
        supabase, 
        idempotencyKey, 
        merchant.id, 
        200, 
        { success: true, ...responseBody, trace_id: ctx.traceId }
      );
    }

    // 16. Log successful request
    await logRequest(supabase, ctx, req, { status: 200, body: responseBody }, rateLimitResult.remaining, rateLimitResult.resetAt);

    // 17. Return success response
    return successResponse(responseBody, ctx, rateLimitResult);

  } catch (error: any) {
    const err = createError('INTERNAL_ERROR', { 
      message: error.message || 'Unknown error' 
    });
    errorCode = err.code;
    errorMessage = error.message;
    responseStatus = err.httpStatus;
    
    log('error', 'Unhandled error', ctx, { error: error.message, stack: error.stack });
    
    await logRequest(supabase, ctx, req, { 
      status: err.httpStatus, 
      errorCode, 
      errorMessage 
    }, rateLimitResult?.remaining, rateLimitResult?.resetAt);
    
    return createErrorResponse(err, ctx, rateLimitResult);
  }
});
