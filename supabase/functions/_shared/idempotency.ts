// ================================================
// Pay2X Enterprise - Idempotency Keys
// ================================================

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createError, Pay2XError } from './errors.ts';

export interface IdempotencyResult {
  isNew: boolean;
  cachedResponse?: {
    status: number;
    body: any;
  };
  error?: Pay2XError;
}

// Generate SHA256 hash of request body
async function hashRequest(body: any): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(body));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function checkIdempotency(
  supabase: SupabaseClient,
  idempotencyKey: string | null,
  merchantId: string,
  endpoint: string,
  requestBody: any
): Promise<IdempotencyResult> {
  // If no idempotency key provided, treat as new request
  if (!idempotencyKey) {
    return { isNew: true };
  }

  // Validate key format (max 255 chars, alphanumeric + common chars)
  if (idempotencyKey.length > 255 || !/^[\w\-\.]+$/.test(idempotencyKey)) {
    return {
      isNew: false,
      error: createError('INVALID_REQUEST', {
        field: 'idempotency_key',
        message: 'Invalid idempotency key format. Use alphanumeric, dash, underscore, or dot.',
      }),
    };
  }

  const requestHash = await hashRequest(requestBody);

  try {
    // Check for existing key
    const { data: existing, error: fetchError } = await supabase
      .from('idempotency_keys')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .eq('merchant_id', merchantId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = not found
      console.error('Idempotency fetch error:', fetchError);
      // Fail open - treat as new request
      return { isNew: true };
    }

    if (existing) {
      // Key exists - check if request body matches
      if (existing.request_hash !== requestHash) {
        return {
          isNew: false,
          error: createError('IDEMPOTENCY_CONFLICT', {
            idempotency_key: idempotencyKey,
            message: 'A request with this idempotency key was already made with different parameters.',
          }),
        };
      }

      // Same request - return cached response
      if (existing.response_body) {
        return {
          isNew: false,
          cachedResponse: {
            status: existing.response_status || 200,
            body: existing.response_body,
          },
        };
      }

      // Request in progress (no response yet) - this could be a race condition
      // For safety, return conflict
      return {
        isNew: false,
        error: createError('DUPLICATE_REQUEST', {
          idempotency_key: idempotencyKey,
          message: 'A request with this idempotency key is already being processed.',
        }),
      };
    }

    // New key - create placeholder
    const { error: insertError } = await supabase
      .from('idempotency_keys')
      .insert({
        idempotency_key: idempotencyKey,
        merchant_id: merchantId,
        endpoint: endpoint,
        request_hash: requestHash,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      });

    if (insertError) {
      // Race condition - another request just created it
      if (insertError.code === '23505') { // unique violation
        return {
          isNew: false,
          error: createError('DUPLICATE_REQUEST', {
            idempotency_key: idempotencyKey,
          }),
        };
      }
      console.error('Idempotency insert error:', insertError);
    }

    return { isNew: true };
  } catch (err) {
    console.error('Idempotency exception:', err);
    // Fail open
    return { isNew: true };
  }
}

export async function saveIdempotencyResponse(
  supabase: SupabaseClient,
  idempotencyKey: string,
  merchantId: string,
  responseStatus: number,
  responseBody: any
): Promise<void> {
  if (!idempotencyKey) return;

  try {
    await supabase
      .from('idempotency_keys')
      .update({
        response_status: responseStatus,
        response_body: responseBody,
      })
      .eq('idempotency_key', idempotencyKey)
      .eq('merchant_id', merchantId);
  } catch (err) {
    console.error('Failed to save idempotency response:', err);
  }
}
