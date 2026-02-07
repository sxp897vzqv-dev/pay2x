/**
 * Process Webhook Queue - Supabase Edge Function
 * 
 * This function should be called periodically (via cron) to process
 * pending webhooks with exponential backoff retries.
 * 
 * POST /process-webhook-queue
 * Authorization: Bearer <service_role_key>
 * Body: { batchSize?: number }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { processWebhookQueue } from '../_shared/webhook-queue.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req: Request) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Verify service role key
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (token !== SUPABASE_SERVICE_KEY) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse batch size
    let batchSize = 10;
    try {
      const body = await req.json();
      batchSize = body.batchSize || 10;
    } catch {
      // Use default
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    console.log(`Processing webhook queue (batch size: ${batchSize})`);
    
    const result = await processWebhookQueue(supabase, batchSize);
    
    console.log(`Webhook queue processed:`, result);

    return new Response(
      JSON.stringify({
        success: true,
        ...result,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Webhook queue error:', error);
    
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
