/**
 * Admin API - Secure client for admin operations
 * Calls Edge Functions instead of using service role key directly
 */

import { supabase, SUPABASE_URL } from '../supabase';

const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1`;

/**
 * Call the create-entity Edge Function
 */
async function callCreateEntity(type, data) {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${EDGE_FUNCTION_URL}/create-entity`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ type, data }),
  });

  const result = await response.json();
  
  if (!response.ok) {
    throw new Error(result.error || 'Request failed');
  }

  return result;
}

/**
 * Create a new trader
 */
export async function createTrader(formData) {
  return callCreateEntity('trader', formData);
}

/**
 * Create a new merchant
 */
export async function createMerchant(formData) {
  return callCreateEntity('merchant', formData);
}

/**
 * Create a new worker
 */
export async function createWorker(formData) {
  return callCreateEntity('worker', formData);
}

/**
 * Create a new affiliate
 */
export async function createAffiliate(formData) {
  return callCreateEntity('affiliate', formData);
}

/**
 * Reset user password
 */
export async function resetUserPassword(email) {
  return callCreateEntity('reset_password', { email });
}

/**
 * Delete a worker (calls separate endpoint or extends create-entity)
 */
export async function deleteWorker(workerId) {
  return callCreateEntity('delete_worker', { workerId });
}
