/**
 * Warmup Function - Keeps Edge Functions hot
 * 
 * Called by Supabase cron every 5 minutes to prevent cold starts.
 * Pings critical functions to keep them in memory.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Functions to keep warm (most critical for latency)
const FUNCTIONS_TO_WARM = [
  'api-health',
  'create-payin',
  'get-payin-status',
  'update-payin',
];

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const startTime = Date.now();
  const results: Record<string, { status: string; latency: number }> = {};

  // Ping each function
  for (const fn of FUNCTIONS_TO_WARM) {
    const fnStart = Date.now();
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
        method: fn === 'api-health' ? 'GET' : 'OPTIONS',
        headers: {
          'Authorization': `Bearer ${SERVICE_KEY}`,
        },
      });
      results[fn] = {
        status: res.ok ? 'warm' : `error:${res.status}`,
        latency: Date.now() - fnStart,
      };
    } catch (err) {
      results[fn] = {
        status: `error:${err.message}`,
        latency: Date.now() - fnStart,
      };
    }
  }

  const totalLatency = Date.now() - startTime;

  return new Response(
    JSON.stringify({
      success: true,
      warmed: FUNCTIONS_TO_WARM.length,
      totalLatency,
      results,
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
});
