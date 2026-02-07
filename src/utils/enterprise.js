/**
 * Pay2X Enterprise Utilities
 * Handles rate limiting, webhooks, settlements, alerts, and more
 */

import { supabase } from '../supabase';

// ════════════════════════════════════════════
// RATE LIMITING
// ════════════════════════════════════════════

export async function checkRateLimit(apiKey, endpoint = '*') {
  const { data, error } = await supabase.rpc('check_rate_limit', {
    p_api_key: apiKey,
    p_endpoint: endpoint
  });
  
  if (error) {
    console.error('Rate limit check error:', error);
    return { allowed: true, remaining: 100, resetAt: null }; // Fail open
  }
  
  return {
    allowed: data?.[0]?.allowed ?? true,
    remaining: data?.[0]?.remaining ?? 100,
    resetAt: data?.[0]?.reset_at
  };
}

export async function getMerchantRateSettings(merchantId) {
  const { data, error } = await supabase
    .from('merchant_rate_settings')
    .select('*')
    .eq('merchant_id', merchantId)
    .single();
  
  if (error && error.code !== 'PGRST116') { // Not found is ok
    console.error('Get rate settings error:', error);
  }
  
  return data || {
    requests_per_minute: 100,
    requests_per_hour: 1000,
    requests_per_day: 10000,
    burst_limit: 20,
    is_unlimited: false
  };
}

export async function updateMerchantRateSettings(merchantId, settings) {
  const { data, error } = await supabase
    .from('merchant_rate_settings')
    .upsert({
      merchant_id: merchantId,
      ...settings,
      updated_at: new Date().toISOString()
    }, { onConflict: 'merchant_id' })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

// ════════════════════════════════════════════
// IP WHITELIST
// ════════════════════════════════════════════

export async function getIpWhitelist(entityType, entityId) {
  const { data, error } = await supabase
    .from('ip_whitelist')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

export async function addIpToWhitelist(entityType, entityId, ipAddress, label = null, expiresAt = null) {
  const { data: { user } } = await supabase.auth.getUser();
  
  const { data, error } = await supabase
    .from('ip_whitelist')
    .insert({
      entity_type: entityType,
      entity_id: entityId,
      ip_address: ipAddress,
      label,
      expires_at: expiresAt,
      created_by: user?.id
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function removeIpFromWhitelist(id) {
  const { error } = await supabase
    .from('ip_whitelist')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
}

export async function toggleIpWhitelistEnforcement(merchantId, enforce) {
  const { error } = await supabase
    .from('merchants')
    .update({ enforce_ip_whitelist: enforce })
    .eq('id', merchantId);
  
  if (error) throw error;
}

// ════════════════════════════════════════════
// WEBHOOKS
// ════════════════════════════════════════════

export async function queueWebhook(merchantId, eventType, payload) {
  const { data, error } = await supabase.rpc('queue_webhook', {
    p_merchant_id: merchantId,
    p_event_type: eventType,
    p_payload: payload
  });
  
  if (error) throw error;
  return data;
}

export async function getWebhookQueue(filters = {}) {
  let query = supabase
    .from('webhook_queue')
    .select('*, merchants(name)')
    .order('created_at', { ascending: false });
  
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.merchantId) query = query.eq('merchant_id', filters.merchantId);
  if (filters.limit) query = query.limit(filters.limit);
  
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function retryWebhook(webhookId) {
  const { error } = await supabase
    .from('webhook_queue')
    .update({
      status: 'pending',
      next_retry_at: new Date().toISOString(),
      attempts: 0
    })
    .eq('id', webhookId);
  
  if (error) throw error;
}

export async function getWebhookLogs(merchantId, limit = 50) {
  const { data, error } = await supabase
    .from('webhook_delivery_logs')
    .select('*')
    .eq('merchant_id', merchantId)
    .order('created_at', { ascending: false })
    .limit(limit);
  
  if (error) throw error;
  return data || [];
}

// ════════════════════════════════════════════
// SETTLEMENTS
// ════════════════════════════════════════════

export async function getSettlements(filters = {}) {
  let query = supabase
    .from('settlements')
    .select(`
      *,
      merchants(id, name),
      traders(id, name)
    `)
    .order('created_at', { ascending: false });
  
  if (filters.type) query = query.eq('settlement_type', filters.type);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.merchantId) query = query.eq('merchant_id', filters.merchantId);
  if (filters.traderId) query = query.eq('trader_id', filters.traderId);
  if (filters.limit) query = query.limit(filters.limit);
  
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createSettlement(settlementData) {
  const { data, error } = await supabase
    .from('settlements')
    .insert(settlementData)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function processSettlement(settlementId, transactionRef) {
  const { data: { user } } = await supabase.auth.getUser();
  
  const { data, error } = await supabase
    .from('settlements')
    .update({
      status: 'completed',
      processed_by: user?.id,
      processed_at: new Date().toISOString(),
      transaction_ref: transactionRef
    })
    .eq('id', settlementId)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getSettlementSettings(entityType, entityId = null) {
  let query = supabase
    .from('settlement_settings')
    .select('*')
    .eq('entity_type', entityType);
  
  if (entityId) {
    query = query.eq('entity_id', entityId);
  } else {
    query = query.is('entity_id', null);
  }
  
  const { data, error } = await query.single();
  
  if (error && error.code !== 'PGRST116') throw error;
  
  return data || {
    frequency: 'daily',
    settlement_hour: 10,
    min_settlement_amount: 1000,
    hold_percentage: 0,
    hold_days: 0,
    auto_settle: true
  };
}

export async function updateSettlementSettings(entityType, entityId, settings) {
  const { data, error } = await supabase
    .from('settlement_settings')
    .upsert({
      entity_type: entityType,
      entity_id: entityId,
      ...settings,
      updated_at: new Date().toISOString()
    }, { onConflict: 'entity_type,entity_id' })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

// ════════════════════════════════════════════
// BALANCE HOLDS
// ════════════════════════════════════════════

export async function getBalanceHolds(entityType, entityId) {
  const { data, error } = await supabase
    .from('balance_holds')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

export async function createBalanceHold(holdData) {
  const { data: { user } } = await supabase.auth.getUser();
  
  const { data, error } = await supabase
    .from('balance_holds')
    .insert({
      ...holdData,
      created_by: user?.id
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function releaseBalanceHold(holdId, notes = null) {
  const { data: { user } } = await supabase.auth.getUser();
  
  const { data, error } = await supabase
    .from('balance_holds')
    .update({
      status: 'released',
      released_at: new Date().toISOString(),
      released_by: user?.id,
      notes
    })
    .eq('id', holdId)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

// ════════════════════════════════════════════
// KYC
// ════════════════════════════════════════════

export async function getKycDocuments(entityType, entityId) {
  const { data, error } = await supabase
    .from('kyc_documents')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

export async function uploadKycDocument(entityType, entityId, file, documentType, documentNumber = null) {
  // Upload file to storage
  const fileName = `${entityType}/${entityId}/${documentType}_${Date.now()}_${file.name}`;
  
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('kyc-documents')
    .upload(fileName, file);
  
  if (uploadError) throw uploadError;
  
  // Create document record
  const { data, error } = await supabase
    .from('kyc_documents')
    .insert({
      entity_type: entityType,
      entity_id: entityId,
      document_type: documentType,
      document_number: documentNumber,
      file_path: uploadData.path,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function reviewKycDocument(documentId, status, notes = null, rejectionReason = null) {
  const { data: { user } } = await supabase.auth.getUser();
  
  const { data, error } = await supabase
    .from('kyc_documents')
    .update({
      status,
      reviewed_by: user?.id,
      reviewed_at: new Date().toISOString(),
      review_notes: notes,
      rejection_reason: rejectionReason
    })
    .eq('id', documentId)
    .select()
    .single();
  
  if (error) throw error;
  
  // Update entity KYC status if all docs approved
  if (status === 'approved') {
    await updateEntityKycStatus(data.entity_type, data.entity_id);
  }
  
  return data;
}

async function updateEntityKycStatus(entityType, entityId) {
  // Check if all required docs are approved
  const { data: docs } = await supabase
    .from('kyc_documents')
    .select('status')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId);
  
  const allApproved = docs?.length > 0 && docs.every(d => d.status === 'approved');
  
  const table = entityType === 'merchant' ? 'merchants' : 'traders';
  
  await supabase
    .from(table)
    .update({
      kyc_status: allApproved ? 'approved' : 'pending',
      kyc_verified_at: allApproved ? new Date().toISOString() : null
    })
    .eq('id', entityId);
}

// ════════════════════════════════════════════
// ALERTS
// ════════════════════════════════════════════

export async function getAlertRules() {
  const { data, error } = await supabase
    .from('alert_rules')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

export async function createAlertRule(ruleData) {
  const { data: { user } } = await supabase.auth.getUser();
  
  const { data, error } = await supabase
    .from('alert_rules')
    .insert({
      ...ruleData,
      created_by: user?.id
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function updateAlertRule(ruleId, updates) {
  const { data, error } = await supabase
    .from('alert_rules')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', ruleId)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function deleteAlertRule(ruleId) {
  const { error } = await supabase
    .from('alert_rules')
    .delete()
    .eq('id', ruleId);
  
  if (error) throw error;
}

export async function getAlertHistory(limit = 100) {
  const { data, error } = await supabase
    .from('alert_history')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  
  if (error) throw error;
  return data || [];
}

export async function acknowledgeAlert(alertId, notes = null) {
  const { data: { user } } = await supabase.auth.getUser();
  
  const { data, error } = await supabase
    .from('alert_history')
    .update({
      acknowledged_by: user?.id,
      acknowledged_at: new Date().toISOString(),
      resolution_notes: notes
    })
    .eq('id', alertId)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

// ════════════════════════════════════════════
// REFUNDS
// ════════════════════════════════════════════

export async function getRefunds(filters = {}) {
  let query = supabase
    .from('refunds')
    .select(`
      *,
      payins(id, order_id, amount),
      merchants(id, name)
    `)
    .order('created_at', { ascending: false });
  
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.merchantId) query = query.eq('merchant_id', filters.merchantId);
  if (filters.limit) query = query.limit(filters.limit);
  
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createRefund(refundData) {
  const { data: { user } } = await supabase.auth.getUser();
  
  const { data, error } = await supabase
    .from('refunds')
    .insert({
      ...refundData,
      requested_by: user?.id
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function processRefund(refundId, action, transactionRef = null, rejectionReason = null) {
  const { data: { user } } = await supabase.auth.getUser();
  
  const updates = {
    updated_at: new Date().toISOString()
  };
  
  if (action === 'approve') {
    updates.status = 'approved';
    updates.approved_by = user?.id;
    updates.approved_at = new Date().toISOString();
  } else if (action === 'complete') {
    updates.status = 'completed';
    updates.processed_at = new Date().toISOString();
    updates.transaction_ref = transactionRef;
  } else if (action === 'reject') {
    updates.status = 'rejected';
    updates.rejection_reason = rejectionReason;
  }
  
  const { data, error } = await supabase
    .from('refunds')
    .update(updates)
    .eq('id', refundId)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

// ════════════════════════════════════════════
// CHARGEBACKS
// ════════════════════════════════════════════

export async function getChargebacks(filters = {}) {
  let query = supabase
    .from('chargebacks')
    .select(`
      *,
      payins(id, order_id, amount),
      merchants(id, name)
    `)
    .order('created_at', { ascending: false });
  
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.merchantId) query = query.eq('merchant_id', filters.merchantId);
  if (filters.limit) query = query.limit(filters.limit);
  
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function updateChargeback(chargebackId, updates) {
  const { data, error } = await supabase
    .from('chargebacks')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', chargebackId)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

// ════════════════════════════════════════════
// RECONCILIATION
// ════════════════════════════════════════════

export async function getDailyReconciliation(date, entityType = null) {
  let query = supabase
    .from('daily_reconciliation')
    .select('*')
    .eq('recon_date', date);
  
  if (entityType) query = query.eq('entity_type', entityType);
  
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function resolveReconciliation(reconId, notes) {
  const { data: { user } } = await supabase.auth.getUser();
  
  const { data, error } = await supabase
    .from('daily_reconciliation')
    .update({
      status: 'resolved',
      resolved_by: user?.id,
      resolved_at: new Date().toISOString(),
      resolution_notes: notes
    })
    .eq('id', reconId)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

// ════════════════════════════════════════════
// REPORTS & EXPORTS
// ════════════════════════════════════════════

export async function getDailySummary(date) {
  const { data, error } = await supabase
    .from('daily_summaries')
    .select('*')
    .eq('summary_date', date)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function getDailySummaries(startDate, endDate) {
  const { data, error } = await supabase
    .from('daily_summaries')
    .select('*')
    .gte('summary_date', startDate)
    .lte('summary_date', endDate)
    .order('summary_date', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

export async function generateDailySummary(date) {
  const { data, error } = await supabase.rpc('generate_daily_summary', {
    p_date: date
  });
  
  if (error) throw error;
  return data;
}

export async function createExportJob(exportType, filters, dateFrom, dateTo) {
  const { data: { user } } = await supabase.auth.getUser();
  
  const { data, error } = await supabase
    .from('export_jobs')
    .insert({
      export_type: exportType,
      filters,
      date_from: dateFrom,
      date_to: dateTo,
      requested_by: user?.id,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getExportJobs(limit = 20) {
  const { data, error } = await supabase
    .from('export_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  
  if (error) throw error;
  return data || [];
}

// ════════════════════════════════════════════
// ANOMALIES
// ════════════════════════════════════════════

export async function getAnomalies(filters = {}) {
  let query = supabase
    .from('anomalies')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.type) query = query.eq('anomaly_type', filters.type);
  if (filters.severity) query = query.eq('severity', filters.severity);
  if (filters.limit) query = query.limit(filters.limit);
  
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function reviewAnomaly(anomalyId, status, notes) {
  const { data: { user } } = await supabase.auth.getUser();
  
  const { data, error } = await supabase
    .from('anomalies')
    .update({
      status,
      reviewed_by: user?.id,
      reviewed_at: new Date().toISOString(),
      review_notes: notes
    })
    .eq('id', anomalyId)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

// ════════════════════════════════════════════
// SANDBOX / TEST MODE
// ════════════════════════════════════════════

export async function generateTestApiKey(merchantId) {
  const testKey = `test_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  
  const { error } = await supabase
    .from('merchants')
    .update({ test_api_key: testKey })
    .eq('id', merchantId);
  
  if (error) throw error;
  return testKey;
}

export async function getTestTransactions(merchantId, type = 'payins') {
  const table = type === 'payins' ? 'test_payins' : 'test_payouts';
  
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('merchant_id', merchantId)
    .order('created_at', { ascending: false })
    .limit(50);
  
  if (error) throw error;
  return data || [];
}

// ════════════════════════════════════════════
// TERMS & COMPLIANCE
// ════════════════════════════════════════════

export async function getActiveTerms() {
  const { data, error } = await supabase
    .from('terms_versions')
    .select('*')
    .eq('is_active', true)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function acceptTerms(termsVersionId, entityType = null, entityId = null, ipAddress = null) {
  const { data: { user } } = await supabase.auth.getUser();
  
  const { data, error } = await supabase
    .from('terms_acceptances')
    .insert({
      user_id: user?.id,
      terms_version_id: termsVersionId,
      entity_type: entityType,
      entity_id: entityId,
      ip_address: ipAddress
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function hasAcceptedTerms(userId, termsVersionId) {
  const { data, error } = await supabase
    .from('terms_acceptances')
    .select('id')
    .eq('user_id', userId)
    .eq('terms_version_id', termsVersionId)
    .single();
  
  return !error && data !== null;
}
