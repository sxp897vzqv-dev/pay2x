// ================================================
// Pay2X Enterprise - Webhook Queue with Retries
// ================================================

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface WebhookPayload {
  event_type: string;
  event_id: string;
  timestamp: string;
  data: Record<string, any>;
}

export interface WebhookDelivery {
  id: string;
  merchantId: string;
  webhookUrl: string;
  webhookSecret?: string;
  eventType: string;
  eventId: string;
  payload: WebhookPayload;
  signature: string;
  attemptCount: number;
  maxAttempts: number;
  status: 'pending' | 'processing' | 'delivered' | 'failed' | 'exhausted';
}

// Retry delays in seconds (exponential backoff)
const RETRY_DELAYS = [
  0,        // Immediate
  300,      // 5 minutes
  1800,     // 30 minutes
  7200,     // 2 hours
  28800,    // 8 hours
  86400,    // 24 hours
];

// Generate HMAC signature
async function generateSignature(payload: any, secret: string): Promise<string> {
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
    encoder.encode(JSON.stringify(payload))
  );
  
  const hashArray = Array.from(new Uint8Array(signature));
  return 'v1=' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Queue a webhook for delivery
export async function queueWebhook(
  supabase: SupabaseClient,
  merchantId: string,
  eventType: string,
  eventId: string,
  data: Record<string, any>
): Promise<string | null> {
  try {
    // Get merchant webhook config
    const { data: merchant, error: merchantError } = await supabase
      .from('merchants')
      .select('webhook_url, webhook_secret')
      .eq('id', merchantId)
      .single();

    if (merchantError || !merchant?.webhook_url) {
      console.log('No webhook URL configured for merchant:', merchantId);
      return null;
    }

    // Build payload
    const payload: WebhookPayload = {
      event_type: eventType,
      event_id: eventId,
      timestamp: new Date().toISOString(),
      data,
    };

    // Generate signature
    const signature = await generateSignature(
      payload, 
      merchant.webhook_secret || 'default_secret'
    );

    // Insert into queue
    const { data: delivery, error: insertError } = await supabase
      .from('webhook_deliveries')
      .insert({
        merchant_id: merchantId,
        webhook_url: merchant.webhook_url,
        webhook_secret: merchant.webhook_secret,
        event_type: eventType,
        event_id: eventId,
        payload,
        signature,
        status: 'pending',
        next_attempt_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Failed to queue webhook:', insertError);
      return null;
    }

    return delivery?.id || null;
  } catch (err) {
    console.error('Webhook queue error:', err);
    return null;
  }
}

// Process a single webhook delivery
export async function deliverWebhook(
  supabase: SupabaseClient,
  delivery: WebhookDelivery
): Promise<{ success: boolean; error?: string }> {
  const startTime = Date.now();

  try {
    // Mark as processing
    await supabase
      .from('webhook_deliveries')
      .update({ status: 'processing' })
      .eq('id', delivery.id);

    // Make the HTTP request
    const response = await fetch(delivery.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Pay2X-Signature': delivery.signature,
        'X-Pay2X-Event': delivery.eventType,
        'X-Pay2X-Delivery-Id': delivery.id,
        'X-Pay2X-Timestamp': delivery.payload.timestamp,
        'User-Agent': 'Pay2X-Webhook/1.0',
      },
      body: JSON.stringify(delivery.payload),
    });

    const responseTime = Date.now() - startTime;
    let responseBody = '';
    
    try {
      responseBody = await response.text();
    } catch {
      responseBody = '[Unable to read response]';
    }

    // Log the attempt
    await supabase.from('webhook_attempts').insert({
      webhook_delivery_id: delivery.id,
      attempt_number: delivery.attemptCount + 1,
      response_code: response.status,
      response_body: responseBody.substring(0, 1000),
      response_time_ms: responseTime,
    });

    // Check if successful (2xx status)
    if (response.status >= 200 && response.status < 300) {
      await supabase
        .from('webhook_deliveries')
        .update({
          status: 'delivered',
          attempt_count: delivery.attemptCount + 1,
          last_response_code: response.status,
          last_response_body: responseBody.substring(0, 1000),
          last_response_time_ms: responseTime,
          delivered_at: new Date().toISOString(),
        })
        .eq('id', delivery.id);

      return { success: true };
    }

    // Failed - schedule retry
    const newAttemptCount = delivery.attemptCount + 1;
    const nextDelay = RETRY_DELAYS[newAttemptCount] ?? null;

    if (nextDelay === null || newAttemptCount >= delivery.maxAttempts) {
      // Exhausted all retries
      await supabase
        .from('webhook_deliveries')
        .update({
          status: 'exhausted',
          attempt_count: newAttemptCount,
          last_response_code: response.status,
          last_response_body: responseBody.substring(0, 1000),
          last_response_time_ms: responseTime,
          last_error: `HTTP ${response.status}`,
        })
        .eq('id', delivery.id);

      return { success: false, error: `Exhausted after ${newAttemptCount} attempts` };
    }

    // Schedule next retry
    const nextAttemptAt = new Date(Date.now() + nextDelay * 1000);
    
    await supabase
      .from('webhook_deliveries')
      .update({
        status: 'pending',
        attempt_count: newAttemptCount,
        next_attempt_at: nextAttemptAt.toISOString(),
        last_response_code: response.status,
        last_response_body: responseBody.substring(0, 1000),
        last_response_time_ms: responseTime,
        last_error: `HTTP ${response.status}`,
      })
      .eq('id', delivery.id);

    return { 
      success: false, 
      error: `HTTP ${response.status}, retrying at ${nextAttemptAt.toISOString()}` 
    };
  } catch (err: any) {
    const responseTime = Date.now() - startTime;
    const errorMessage = err.message || 'Unknown error';

    // Log the failed attempt
    await supabase.from('webhook_attempts').insert({
      webhook_delivery_id: delivery.id,
      attempt_number: delivery.attemptCount + 1,
      response_time_ms: responseTime,
      error: errorMessage,
    });

    // Schedule retry
    const newAttemptCount = delivery.attemptCount + 1;
    const nextDelay = RETRY_DELAYS[newAttemptCount] ?? null;

    if (nextDelay === null || newAttemptCount >= delivery.maxAttempts) {
      await supabase
        .from('webhook_deliveries')
        .update({
          status: 'exhausted',
          attempt_count: newAttemptCount,
          last_error: errorMessage,
        })
        .eq('id', delivery.id);

      return { success: false, error: `Exhausted: ${errorMessage}` };
    }

    const nextAttemptAt = new Date(Date.now() + nextDelay * 1000);
    
    await supabase
      .from('webhook_deliveries')
      .update({
        status: 'pending',
        attempt_count: newAttemptCount,
        next_attempt_at: nextAttemptAt.toISOString(),
        last_error: errorMessage,
      })
      .eq('id', delivery.id);

    return { success: false, error: errorMessage };
  }
}

// Get pending webhooks ready for delivery
export async function getPendingWebhooks(
  supabase: SupabaseClient,
  limit: number = 10
): Promise<WebhookDelivery[]> {
  const { data, error } = await supabase
    .from('webhook_deliveries')
    .select('*')
    .eq('status', 'pending')
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Failed to get pending webhooks:', error);
    return [];
  }

  return (data || []).map(d => ({
    id: d.id,
    merchantId: d.merchant_id,
    webhookUrl: d.webhook_url,
    webhookSecret: d.webhook_secret,
    eventType: d.event_type,
    eventId: d.event_id,
    payload: d.payload,
    signature: d.signature,
    attemptCount: d.attempt_count,
    maxAttempts: d.max_attempts,
    status: d.status,
  }));
}

// Process all pending webhooks
export async function processWebhookQueue(
  supabase: SupabaseClient,
  batchSize: number = 10
): Promise<{ processed: number; delivered: number; failed: number }> {
  const pending = await getPendingWebhooks(supabase, batchSize);
  
  let delivered = 0;
  let failed = 0;

  for (const webhook of pending) {
    const result = await deliverWebhook(supabase, webhook);
    if (result.success) {
      delivered++;
    } else {
      failed++;
    }
  }

  return { processed: pending.length, delivered, failed };
}
