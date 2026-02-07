// ================================================
// Pay2X Enterprise - Rate Limiting
// ================================================

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createError, Pay2XError } from './errors.ts';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  error?: Pay2XError;
}

export interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  burstLimit: number;
}

const DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
  free: { requestsPerMinute: 60, requestsPerHour: 1000, requestsPerDay: 10000, burstLimit: 10 },
  starter: { requestsPerMinute: 300, requestsPerHour: 5000, requestsPerDay: 50000, burstLimit: 30 },
  business: { requestsPerMinute: 1000, requestsPerHour: 20000, requestsPerDay: 200000, burstLimit: 100 },
  enterprise: { requestsPerMinute: 5000, requestsPerHour: 100000, requestsPerDay: 1000000, burstLimit: 500 },
};

// In-memory cache for rate limits (per instance)
const memoryCache = new Map<string, { count: number; resetAt: number }>();

export async function checkRateLimit(
  supabase: SupabaseClient,
  merchantId: string,
  endpoint: string,
  plan: string = 'free'
): Promise<RateLimitResult> {
  const config = DEFAULT_LIMITS[plan] || DEFAULT_LIMITS.free;
  const now = new Date();
  const minuteStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
  const hourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  try {
    // Quick burst check using memory cache (per-second)
    const burstKey = `${merchantId}:${endpoint}:burst`;
    const burstCache = memoryCache.get(burstKey);
    const nowMs = Date.now();
    
    if (burstCache && burstCache.resetAt > nowMs) {
      if (burstCache.count >= config.burstLimit) {
        return {
          allowed: false,
          remaining: 0,
          resetAt: new Date(burstCache.resetAt),
          error: createError('RATE_LIMIT_BURST', { 
            limit: config.burstLimit, 
            window: '1 second' 
          }),
        };
      }
      burstCache.count++;
    } else {
      memoryCache.set(burstKey, { count: 1, resetAt: nowMs + 1000 });
    }

    // Check database for minute/hour/day limits
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_merchant_id: merchantId,
      p_endpoint: endpoint,
      p_plan: plan,
    });

    if (error) {
      console.error('Rate limit check error:', error);
      // Fail open - allow request but log error
      return {
        allowed: true,
        remaining: -1,
        resetAt: new Date(now.getTime() + 60000),
      };
    }

    const result = data?.[0];
    
    if (!result?.allowed) {
      const errorCode = result?.error_code || 'RATE_LIMIT_MINUTE';
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(result?.reset_at || now.getTime() + 60000),
        error: createError(errorCode as any, {
          limit: config.requestsPerMinute,
          window: '1 minute',
        }),
      };
    }

    return {
      allowed: true,
      remaining: result.remaining ?? config.requestsPerMinute,
      resetAt: new Date(result.reset_at || minuteStart.getTime() + 60000),
    };
  } catch (err) {
    console.error('Rate limit exception:', err);
    // Fail open
    return {
      allowed: true,
      remaining: -1,
      resetAt: new Date(now.getTime() + 60000),
    };
  }
}

// Add rate limit headers to response
export function addRateLimitHeaders(
  headers: Headers,
  result: RateLimitResult
): void {
  headers.set('X-RateLimit-Remaining', String(result.remaining));
  headers.set('X-RateLimit-Reset', result.resetAt.toISOString());
  
  if (!result.allowed && result.error?.retryAfter) {
    headers.set('Retry-After', String(result.error.retryAfter));
  }
}

// Clean up memory cache periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of memoryCache.entries()) {
    if (value.resetAt < now) {
      memoryCache.delete(key);
    }
  }
}, 10000); // Every 10 seconds
