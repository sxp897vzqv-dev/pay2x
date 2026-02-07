/**
 * Audit Trail Integrity Utilities
 * Verify tamper-proof audit log chain
 */

import { supabase } from '../supabase';

/**
 * Get audit chain status summary
 */
export async function getAuditChainStatus() {
  const { data, error } = await supabase.rpc('get_audit_chain_status');
  
  if (error) {
    console.error('Error getting audit chain status:', error);
    throw error;
  }
  
  return data?.[0] || {
    total_records: 0,
    first_record_at: null,
    last_record_at: null,
    last_hash: null,
    chain_valid: false,
  };
}

/**
 * Verify audit chain integrity
 * @param {number} startSeq - Starting sequence number (default: 1)
 * @param {number} endSeq - Ending sequence number (default: all)
 */
export async function verifyAuditChain(startSeq = 1, endSeq = null) {
  const { data, error } = await supabase.rpc('verify_audit_chain', {
    p_start_seq: startSeq,
    p_end_seq: endSeq,
  });
  
  if (error) {
    console.error('Error verifying audit chain:', error);
    throw error;
  }
  
  return data?.[0] || {
    is_valid: false,
    total_records: 0,
    verified_records: 0,
    first_invalid_seq: null,
    first_invalid_reason: 'Verification failed',
  };
}

/**
 * Create an audit chain snapshot
 * @param {string} notes - Optional notes for the snapshot
 */
export async function createAuditSnapshot(notes = null) {
  const { data, error } = await supabase.rpc('create_audit_snapshot', {
    p_notes: notes,
  });
  
  if (error) {
    console.error('Error creating audit snapshot:', error);
    throw error;
  }
  
  return data;
}

/**
 * Get audit chain snapshots
 * @param {number} limit - Number of snapshots to fetch
 */
export async function getAuditSnapshots(limit = 10) {
  const { data, error } = await supabase
    .from('audit_chain_snapshots')
    .select('*')
    .order('snapshot_at', { ascending: false })
    .limit(limit);
  
  if (error) {
    console.error('Error fetching audit snapshots:', error);
    throw error;
  }
  
  return data || [];
}

/**
 * Get recent audit logs with hash info
 * @param {number} limit - Number of logs to fetch
 */
export async function getAuditLogsWithHashes(limit = 50) {
  const { data, error } = await supabase
    .from('admin_logs')
    .select('id, sequence_num, action, category, entity_type, entity_name, created_at, prev_hash, row_hash')
    .order('sequence_num', { ascending: false })
    .limit(limit);
  
  if (error) {
    console.error('Error fetching audit logs:', error);
    throw error;
  }
  
  return data || [];
}

/**
 * Client-side hash verification (for display/debugging)
 * Note: This is supplementary - real verification happens in DB
 */
export async function computeClientHash(logEntry) {
  const hashInput = [
    logEntry.prev_hash || 'GENESIS_BLOCK_PAY2X_2026',
    logEntry.action || '',
    logEntry.category || '',
    logEntry.entity_type || '',
    logEntry.entity_id || '',
    logEntry.entity_name || '',
    JSON.stringify(logEntry.details || {}),
    logEntry.performed_by || '',
    logEntry.performed_by_ip || '',
    logEntry.timestamp_ms?.toString() || '',
  ].join('|');
  
  // Use Web Crypto API
  const encoder = new TextEncoder();
  const data = encoder.encode(hashInput);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Format hash for display (truncated)
 */
export function formatHash(hash, length = 16) {
  if (!hash) return 'N/A';
  if (hash.length <= length) return hash;
  return hash.substring(0, length) + '...';
}

/**
 * Calculate time since last verification
 */
export function timeSinceLastSnapshot(snapshots) {
  if (!snapshots || snapshots.length === 0) return null;
  
  const lastSnapshot = new Date(snapshots[0].snapshot_at);
  const now = new Date();
  const diffMs = now - lastSnapshot;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  return 'Just now';
}
