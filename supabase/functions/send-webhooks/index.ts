/**
 * Send Webhooks - Process webhook queue
 * 
 * Called via cron every minute or database trigger
 * Processes pending webhooks and sends them to merchant endpoints
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHmac } from 'https://deno.land/std@0.168.0/crypto/mod.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MAX_RETRIES = 5;
const BATCH_SIZE = 50;
const TIMEOUT_MS = 10000;

/**
 * Generate HMAC-SHA256 signature
 */
async function generateSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const data = encoder.encode(payload);
  
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, data);
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Send webhook with timeout
 */
async function sendWebhook(
  url: string,
  payload: object,
  signature: string,
  eventType: string
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': eventType,
        'User-Agent': 'Pay2X-Webhooks/2.0',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    return {
      success: response.ok,
      statusCode: response.status,
    };
  } catch (error) {
    clearTimeout(timeout);
    return {
      success: false,
      error: error.message || 'Request failed',
    };
  }
}

serve(async (req: Request) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 1. Get pending webhooks
    const { data: webhooks, error: fetchError } = await supabase
      .from('payin_webhook_queue')
      .select('*')
      .eq('status', 'pending')
      .lt('attempts', MAX_RETRIES)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) {
      console.error('Error fetching webhooks:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch webhooks' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!webhooks || webhooks.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: 'No pending webhooks' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📤 Processing ${webhooks.length} webhooks...`);

    let sent = 0;
    let failed = 0;

    // 2. Process each webhook
    for (const webhook of webhooks) {
      try {
        // Generate signature
        const payloadString = JSON.stringify(webhook.payload);
        const signature = webhook.webhook_secret
          ? await generateSignature(payloadString, webhook.webhook_secret)
          : '';

        // Send webhook
        const result = await sendWebhook(
          webhook.webhook_url,
          webhook.payload,
          signature,
          webhook.event_type
        );

        // Update webhook status
        if (result.success) {
          await supabase
            .from('payin_webhook_queue')
            .update({
              status: 'delivered',
              response_code: result.statusCode,
              attempts: webhook.attempts + 1,
              last_attempt_at: new Date().toISOString(),
            })
            .eq('id', webhook.id);

          sent++;
          console.log(`✅ Webhook delivered: ${webhook.payin_id} -> ${result.statusCode}`);
        } else {
          const newAttempts = webhook.attempts + 1;
          await supabase
            .from('payin_webhook_queue')
            .update({
              status: newAttempts >= MAX_RETRIES ? 'failed' : 'pending',
              response_code: result.statusCode || null,
              attempts: newAttempts,
              last_attempt_at: new Date().toISOString(),
              last_error: result.error || `HTTP ${result.statusCode}`,
            })
            .eq('id', webhook.id);

          failed++;
          console.log(`❌ Webhook failed: ${webhook.payin_id} -> ${result.error || result.statusCode}`);
        }
      } catch (error) {
        console.error(`Error processing webhook ${webhook.id}:`, error);
        failed++;

        await supabase
          .from('payin_webhook_queue')
          .update({
            attempts: webhook.attempts + 1,
            last_attempt_at: new Date().toISOString(),
            last_error: error.message,
          })
          .eq('id', webhook.id);
      }
    }

    // 3. Return summary
    return new Response(
      JSON.stringify({
        success: true,
        processed: webhooks.length,
        sent,
        failed,
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in send-webhooks:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
