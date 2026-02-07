/**
 * Process Payout Webhooks - Supabase Edge Function
 * Processes queued payout webhooks with retries
 * 
 * POST /process-payout-webhooks (called by cron)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Retry schedule: 0, 5min, 30min, 2h, 8h, 24h
const RETRY_DELAYS_MS = [
  0,
  5 * 60 * 1000,
  30 * 60 * 1000,
  2 * 60 * 60 * 1000,
  8 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
];
const MAX_ATTEMPTS = 6;

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Get pending webhooks
    const { data: webhooks, error } = await supabase
      .from('payout_webhook_queue')
      .select('*')
      .eq('status', 'pending')
      .lt('attempts', MAX_ATTEMPTS)
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) throw error;

    if (!webhooks || webhooks.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: 'No webhooks to process' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let sent = 0;
    let failed = 0;

    for (const webhook of webhooks) {
      // Check if enough time has passed since last attempt
      if (webhook.last_attempt_at && webhook.attempts > 0) {
        const lastAttempt = new Date(webhook.last_attempt_at).getTime();
        const nextRetryDelay = RETRY_DELAYS_MS[Math.min(webhook.attempts, RETRY_DELAYS_MS.length - 1)];
        if (Date.now() - lastAttempt < nextRetryDelay) {
          continue; // Not time to retry yet
        }
      }

      try {
        // Build signature
        const payload = JSON.stringify(webhook.payload);
        const signature = await generateSignature(payload, webhook.webhook_secret || '');

        // Send webhook
        const response = await fetch(webhook.webhook_url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Pay2X-Signature': `v1=${signature}`,
            'X-Pay2X-Event': webhook.event_type,
            'X-Pay2X-Timestamp': new Date().toISOString(),
          },
          body: payload,
        });

        const responseCode = response.status;
        const isSuccess = responseCode >= 200 && responseCode < 300;

        if (isSuccess) {
          // Mark as delivered
          await supabase.from('payout_webhook_queue').update({
            status: 'delivered',
            attempts: webhook.attempts + 1,
            last_attempt_at: new Date().toISOString(),
            response_code: responseCode,
          }).eq('id', webhook.id);
          sent++;
        } else {
          // Mark as failed (will retry)
          const newAttempts = webhook.attempts + 1;
          await supabase.from('payout_webhook_queue').update({
            status: newAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
            attempts: newAttempts,
            last_attempt_at: new Date().toISOString(),
            last_error: `HTTP ${responseCode}`,
            response_code: responseCode,
          }).eq('id', webhook.id);
          failed++;
        }
      } catch (e: any) {
        // Network error
        const newAttempts = webhook.attempts + 1;
        await supabase.from('payout_webhook_queue').update({
          status: newAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
          attempts: newAttempts,
          last_attempt_at: new Date().toISOString(),
          last_error: e.message || 'Network error',
        }).eq('id', webhook.id);
        failed++;
      }
    }

    return new Response(JSON.stringify({
      processed: webhooks.length,
      sent,
      failed,
      message: `Processed ${webhooks.length} webhooks: ${sent} sent, ${failed} failed`,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('❌ Process webhooks error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function generateSignature(payload: string, secret: string): Promise<string> {
  if (!secret) return '';
  
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(payload)
  );
  
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
