// Edge Function: process-webhooks
// Processes pending webhooks from the queue with retry logic
// Deploy: supabase functions deploy process-webhooks
// Schedule: Every 1 minute via cron

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WebhookRecord {
  id: string
  merchant_id: string
  event_type: string
  payload: Record<string, unknown>
  url: string
  secret: string | null
  attempts: number
  max_attempts: number
  retry_delay_seconds: number
  status: string
}

// Generate HMAC signature for webhook
async function generateSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get pending webhooks
    const { data: webhooks, error: fetchError } = await supabase
      .from('webhook_queue')
      .select('*')
      .in('status', ['pending', 'processing'])
      .lte('next_retry_at', new Date().toISOString())
      .lt('attempts', supabase.raw('max_attempts'))
      .order('created_at', { ascending: true })
      .limit(50)

    if (fetchError) throw fetchError
    if (!webhooks || webhooks.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let processed = 0
    let succeeded = 0
    let failed = 0

    for (const webhook of webhooks as WebhookRecord[]) {
      processed++
      
      // Mark as processing
      await supabase
        .from('webhook_queue')
        .update({ status: 'processing' })
        .eq('id', webhook.id)

      try {
        const payloadStr = JSON.stringify(webhook.payload)
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-Webhook-Event': webhook.event_type,
          'X-Webhook-Timestamp': new Date().toISOString(),
        }

        // Add signature if secret exists
        if (webhook.secret) {
          headers['X-Webhook-Signature'] = await generateSignature(payloadStr, webhook.secret)
        }

        const startTime = Date.now()
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers,
          body: payloadStr,
        })
        const responseTime = Date.now() - startTime
        const responseBody = await response.text()

        // Log the delivery
        await supabase.from('webhook_delivery_logs').insert({
          webhook_id: webhook.id,
          merchant_id: webhook.merchant_id,
          event_type: webhook.event_type,
          url: webhook.url,
          request_headers: headers,
          request_body: webhook.payload,
          response_code: response.status,
          response_body: responseBody.slice(0, 1000),
          response_time_ms: responseTime,
          success: response.ok,
          error_message: response.ok ? null : `HTTP ${response.status}`,
        })

        if (response.ok) {
          // Success!
          await supabase
            .from('webhook_queue')
            .update({
              status: 'success',
              attempts: webhook.attempts + 1,
              last_response_code: response.status,
              last_response_body: responseBody.slice(0, 500),
              completed_at: new Date().toISOString(),
            })
            .eq('id', webhook.id)
          succeeded++
        } else {
          // Failed - schedule retry with exponential backoff
          const nextAttempt = webhook.attempts + 1
          const nextRetryDelay = webhook.retry_delay_seconds * Math.pow(2, nextAttempt - 1) // exponential backoff
          const nextRetryAt = new Date(Date.now() + nextRetryDelay * 1000).toISOString()

          await supabase
            .from('webhook_queue')
            .update({
              status: nextAttempt >= webhook.max_attempts ? 'exhausted' : 'pending',
              attempts: nextAttempt,
              next_retry_at: nextRetryAt,
              last_response_code: response.status,
              last_response_body: responseBody.slice(0, 500),
              last_error: `HTTP ${response.status}: ${responseBody.slice(0, 200)}`,
            })
            .eq('id', webhook.id)
          failed++
        }
      } catch (err) {
        // Network error
        const nextAttempt = webhook.attempts + 1
        const nextRetryDelay = webhook.retry_delay_seconds * Math.pow(2, nextAttempt - 1)
        const nextRetryAt = new Date(Date.now() + nextRetryDelay * 1000).toISOString()

        await supabase
          .from('webhook_queue')
          .update({
            status: nextAttempt >= webhook.max_attempts ? 'exhausted' : 'pending',
            attempts: nextAttempt,
            next_retry_at: nextRetryAt,
            last_error: err instanceof Error ? err.message : 'Unknown error',
          })
          .eq('id', webhook.id)

        await supabase.from('webhook_delivery_logs').insert({
          webhook_id: webhook.id,
          merchant_id: webhook.merchant_id,
          event_type: webhook.event_type,
          url: webhook.url,
          success: false,
          error_message: err instanceof Error ? err.message : 'Unknown error',
        })

        failed++
      }
    }

    return new Response(JSON.stringify({ processed, succeeded, failed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Webhook processor error:', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
