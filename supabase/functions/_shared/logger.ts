// ================================================
// Pay2X Enterprise - Request Logging with Trace IDs
// ================================================

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface RequestContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  merchantId?: string;
  apiKeyId?: string;
  ipAddress?: string;
  userAgent?: string;
  idempotencyKey?: string;
  startTime: number;
}

export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data?: Record<string, any>;
  traceId: string;
  spanId: string;
  timestamp: number;
}

// Generate trace ID (32 hex chars)
export function generateTraceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Generate span ID (16 hex chars)
export function generateSpanId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Create request context from incoming request
export function createRequestContext(req: Request): RequestContext {
  const traceId = req.headers.get('x-trace-id') || generateTraceId();
  const parentSpanId = req.headers.get('x-span-id');
  const spanId = generateSpanId();

  return {
    traceId,
    spanId,
    parentSpanId: parentSpanId || undefined,
    ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
               req.headers.get('cf-connecting-ip') ||
               req.headers.get('x-real-ip'),
    userAgent: req.headers.get('user-agent') || undefined,
    idempotencyKey: req.headers.get('x-idempotency-key') || undefined,
    startTime: Date.now(),
  };
}

// Sanitize request body (remove sensitive fields)
export function sanitizeBody(body: any): any {
  if (!body) return null;
  
  const sensitiveFields = [
    'password', 'api_key', 'apiKey', 'secret', 'token',
    'card_number', 'cardNumber', 'cvv', 'cvc', 'pin',
    'aadhaar', 'aadhar', 'pan', 'account_number', 'accountNumber'
  ];
  
  const sanitized = { ...body };
  
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

// Sanitize headers
export function sanitizeHeaders(headers: Headers): Record<string, string> {
  const sensitiveHeaders = ['authorization', 'x-api-key', 'cookie', 'x-auth-token'];
  const result: Record<string, string> = {};
  
  headers.forEach((value, key) => {
    if (sensitiveHeaders.includes(key.toLowerCase())) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = value;
    }
  });
  
  return result;
}

// Log to console with structured format
export function log(
  level: LogEntry['level'],
  message: string,
  ctx: RequestContext,
  data?: Record<string, any>
): void {
  const entry: LogEntry = {
    level,
    message,
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    timestamp: Date.now(),
    ...(data && { data }),
  };

  const logFn = level === 'error' ? console.error :
                level === 'warn' ? console.warn :
                level === 'debug' ? console.debug :
                console.log;

  logFn(JSON.stringify(entry));
}

// Log request to database
export async function logRequest(
  supabase: SupabaseClient,
  ctx: RequestContext,
  req: Request,
  response: {
    status: number;
    body?: any;
    errorCode?: string;
    errorMessage?: string;
  },
  rateLimitRemaining?: number,
  rateLimitReset?: Date
): Promise<void> {
  const url = new URL(req.url);
  const responseTime = Date.now() - ctx.startTime;

  try {
    let requestBody = null;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      try {
        const cloned = req.clone();
        requestBody = await cloned.json();
        requestBody = sanitizeBody(requestBody);
      } catch {
        // Body already consumed or not JSON
      }
    }

    await supabase.from('api_requests').insert({
      trace_id: ctx.traceId,
      span_id: ctx.spanId,
      parent_span_id: ctx.parentSpanId,
      merchant_id: ctx.merchantId,
      api_key_id: ctx.apiKeyId,
      ip_address: ctx.ipAddress,
      user_agent: ctx.userAgent,
      method: req.method,
      endpoint: url.pathname,
      query_params: Object.fromEntries(url.searchParams),
      request_body: requestBody,
      request_headers: sanitizeHeaders(req.headers),
      response_status: response.status,
      response_body: response.body ? { summary: typeof response.body === 'object' ? response.body : String(response.body).substring(0, 500) } : null,
      response_time_ms: responseTime,
      idempotency_key: ctx.idempotencyKey,
      error_code: response.errorCode,
      error_message: response.errorMessage,
      rate_limit_remaining: rateLimitRemaining,
      rate_limit_reset_at: rateLimitReset?.toISOString(),
    });
  } catch (err) {
    console.error('Failed to log request:', err);
  }
}

// Add trace headers to response
export function addTraceHeaders(headers: Headers, ctx: RequestContext): void {
  headers.set('X-Trace-Id', ctx.traceId);
  headers.set('X-Span-Id', ctx.spanId);
  headers.set('X-Response-Time', String(Date.now() - ctx.startTime));
}
