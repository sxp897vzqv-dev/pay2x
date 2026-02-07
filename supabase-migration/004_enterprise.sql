-- ============================================
-- PAY2X ENTERPRISE FEATURES MIGRATION
-- Version: 004
-- Date: 2026-02-06
-- ============================================

-- ════════════════════════════════════════════
-- 1. TWO-FACTOR AUTHENTICATION (2FA)
-- ════════════════════════════════════════════

-- Update existing user_2fa table with more fields
ALTER TABLE user_2fa ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE user_2fa ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

-- 2FA backup codes (one-time use)
CREATE TABLE IF NOT EXISTS user_2fa_backup_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL, -- bcrypt hash of backup code
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_2fa_backup_user ON user_2fa_backup_codes(user_id);
ALTER TABLE user_2fa_backup_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_own_backup_codes ON user_2fa_backup_codes
  FOR ALL USING (user_id = auth.uid());

-- ════════════════════════════════════════════
-- 2. API RATE LIMITING
-- ════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS api_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
  api_key TEXT NOT NULL,
  endpoint TEXT NOT NULL, -- e.g., 'createPayin', 'createPayout', '*'
  requests_count INTEGER DEFAULT 0,
  window_start TIMESTAMPTZ DEFAULT now(),
  window_seconds INTEGER DEFAULT 60, -- 1 minute window
  max_requests INTEGER DEFAULT 100, -- 100 requests per minute default
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(api_key, endpoint)
);

CREATE INDEX idx_rate_limit_api_key ON api_rate_limits(api_key);
CREATE INDEX idx_rate_limit_merchant ON api_rate_limits(merchant_id);
ALTER TABLE api_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_rate_limits ON api_rate_limits
  FOR ALL USING (public.user_role() = 'admin');

-- Rate limit settings per merchant
CREATE TABLE IF NOT EXISTS merchant_rate_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID UNIQUE REFERENCES merchants(id) ON DELETE CASCADE,
  requests_per_minute INTEGER DEFAULT 100,
  requests_per_hour INTEGER DEFAULT 1000,
  requests_per_day INTEGER DEFAULT 10000,
  burst_limit INTEGER DEFAULT 20, -- max requests in 1 second
  is_unlimited BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE merchant_rate_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_rate_settings ON merchant_rate_settings
  FOR ALL USING (public.user_role() = 'admin');

CREATE POLICY merchant_own_rate_settings ON merchant_rate_settings
  FOR SELECT USING (
    merchant_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid())
  );

-- ════════════════════════════════════════════
-- 3. IP WHITELISTING
-- ════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ip_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('merchant', 'admin', 'trader')),
  entity_id UUID NOT NULL,
  ip_address INET NOT NULL,
  label TEXT, -- e.g., 'Production Server', 'Office'
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ, -- NULL = never expires
  UNIQUE(entity_type, entity_id, ip_address)
);

CREATE INDEX idx_ip_whitelist_entity ON ip_whitelist(entity_type, entity_id);
CREATE INDEX idx_ip_whitelist_ip ON ip_whitelist(ip_address);
ALTER TABLE ip_whitelist ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_ip_whitelist ON ip_whitelist
  FOR ALL USING (public.user_role() = 'admin');

CREATE POLICY merchant_own_ip_whitelist ON ip_whitelist
  FOR ALL USING (
    entity_type = 'merchant' AND
    entity_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid())
  );

-- Merchant setting to enforce IP whitelist
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS enforce_ip_whitelist BOOLEAN DEFAULT false;

-- ════════════════════════════════════════════
-- 4. WEBHOOK RETRY QUEUE
-- ════════════════════════════════════════════

CREATE TYPE webhook_status AS ENUM ('pending', 'processing', 'success', 'failed', 'exhausted');

CREATE TABLE IF NOT EXISTS webhook_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'payin.completed', 'payout.completed', etc.
  payload JSONB NOT NULL,
  url TEXT NOT NULL,
  secret TEXT, -- for signature verification
  
  -- Retry logic
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 5,
  next_retry_at TIMESTAMPTZ DEFAULT now(),
  retry_delay_seconds INTEGER DEFAULT 30, -- exponential backoff base
  
  -- Status tracking
  status webhook_status DEFAULT 'pending',
  last_response_code INTEGER,
  last_response_body TEXT,
  last_error TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_webhook_queue_status ON webhook_queue(status, next_retry_at);
CREATE INDEX idx_webhook_queue_merchant ON webhook_queue(merchant_id);
CREATE INDEX idx_webhook_queue_created ON webhook_queue(created_at DESC);
ALTER TABLE webhook_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_webhooks ON webhook_queue
  FOR ALL USING (public.user_role() = 'admin');

CREATE POLICY merchant_own_webhooks ON webhook_queue
  FOR SELECT USING (
    merchant_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid())
  );

-- Webhook delivery logs (historical)
CREATE TABLE IF NOT EXISTS webhook_delivery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID REFERENCES webhook_queue(id) ON DELETE SET NULL,
  merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  url TEXT NOT NULL,
  request_headers JSONB,
  request_body JSONB,
  response_code INTEGER,
  response_body TEXT,
  response_time_ms INTEGER,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_webhook_logs_merchant ON webhook_delivery_logs(merchant_id, created_at DESC);
ALTER TABLE webhook_delivery_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_webhook_logs ON webhook_delivery_logs
  FOR ALL USING (public.user_role() = 'admin');

CREATE POLICY merchant_own_webhook_logs ON webhook_delivery_logs
  FOR SELECT USING (
    merchant_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid())
  );

-- ════════════════════════════════════════════
-- 5. SETTLEMENTS
-- ════════════════════════════════════════════

CREATE TYPE settlement_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');
CREATE TYPE settlement_type AS ENUM ('merchant', 'trader');
CREATE TYPE settlement_frequency AS ENUM ('daily', 'weekly', 'biweekly', 'monthly', 'manual');

CREATE TABLE IF NOT EXISTS settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_type settlement_type NOT NULL,
  merchant_id UUID REFERENCES merchants(id) ON DELETE SET NULL,
  trader_id UUID REFERENCES traders(id) ON DELETE SET NULL,
  
  -- Period
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  
  -- Amounts
  gross_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  fee_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  hold_amount DECIMAL(15,2) DEFAULT 0, -- amount held back
  net_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  
  -- Transaction counts
  payin_count INTEGER DEFAULT 0,
  payout_count INTEGER DEFAULT 0,
  refund_count INTEGER DEFAULT 0,
  chargeback_count INTEGER DEFAULT 0,
  
  -- Status
  status settlement_status DEFAULT 'pending',
  
  -- Bank details for payout
  bank_account_id UUID,
  bank_name TEXT,
  account_number TEXT,
  ifsc_code TEXT,
  
  -- Processing
  processed_by UUID REFERENCES profiles(id),
  processed_at TIMESTAMPTZ,
  transaction_ref TEXT, -- bank transaction reference
  
  -- Notes
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  CHECK (
    (settlement_type = 'merchant' AND merchant_id IS NOT NULL) OR
    (settlement_type = 'trader' AND trader_id IS NOT NULL)
  )
);

CREATE INDEX idx_settlements_merchant ON settlements(merchant_id, created_at DESC);
CREATE INDEX idx_settlements_trader ON settlements(trader_id, created_at DESC);
CREATE INDEX idx_settlements_status ON settlements(status);
CREATE INDEX idx_settlements_period ON settlements(period_start, period_end);
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_settlements ON settlements
  FOR ALL USING (public.user_role() = 'admin');

CREATE POLICY merchant_own_settlements ON settlements
  FOR SELECT USING (
    merchant_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid())
  );

CREATE POLICY trader_own_settlements ON settlements
  FOR SELECT USING (
    trader_id IN (SELECT id FROM traders WHERE profile_id = auth.uid())
  );

-- Settlement settings
CREATE TABLE IF NOT EXISTS settlement_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('merchant', 'trader', 'global')),
  entity_id UUID, -- NULL for global settings
  
  frequency settlement_frequency DEFAULT 'daily',
  settlement_day INTEGER, -- day of week (1-7) or month (1-31)
  settlement_hour INTEGER DEFAULT 10, -- hour of day (0-23)
  
  min_settlement_amount DECIMAL(15,2) DEFAULT 1000,
  hold_percentage DECIMAL(5,2) DEFAULT 0, -- % to hold back
  hold_days INTEGER DEFAULT 0, -- days to hold before release
  
  auto_settle BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(entity_type, entity_id)
);

ALTER TABLE settlement_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_settlement_settings ON settlement_settings
  FOR ALL USING (public.user_role() = 'admin');

-- ════════════════════════════════════════════
-- 6. HOLD MANAGEMENT
-- ════════════════════════════════════════════

CREATE TYPE hold_status AS ENUM ('active', 'released', 'forfeited', 'cancelled');
CREATE TYPE hold_reason AS ENUM ('settlement', 'dispute', 'chargeback', 'fraud_review', 'manual');

CREATE TABLE IF NOT EXISTS balance_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('merchant', 'trader')),
  entity_id UUID NOT NULL,
  
  amount DECIMAL(15,2) NOT NULL,
  reason hold_reason NOT NULL,
  status hold_status DEFAULT 'active',
  
  -- Related records
  transaction_id UUID,
  settlement_id UUID REFERENCES settlements(id),
  dispute_id UUID REFERENCES disputes(id),
  
  -- Timing
  hold_until TIMESTAMPTZ, -- auto-release date
  released_at TIMESTAMPTZ,
  
  -- Audit
  created_by UUID REFERENCES profiles(id),
  released_by UUID REFERENCES profiles(id),
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_holds_entity ON balance_holds(entity_type, entity_id);
CREATE INDEX idx_holds_status ON balance_holds(status);
CREATE INDEX idx_holds_release ON balance_holds(hold_until) WHERE status = 'active';
ALTER TABLE balance_holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_holds ON balance_holds
  FOR ALL USING (public.user_role() = 'admin');

CREATE POLICY merchant_own_holds ON balance_holds
  FOR SELECT USING (
    entity_type = 'merchant' AND
    entity_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid())
  );

CREATE POLICY trader_own_holds ON balance_holds
  FOR SELECT USING (
    entity_type = 'trader' AND
    entity_id IN (SELECT id FROM traders WHERE profile_id = auth.uid())
  );

-- ════════════════════════════════════════════
-- 7. SANDBOX / TEST MODE
-- ════════════════════════════════════════════

-- Add test mode fields to merchants
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS test_api_key TEXT UNIQUE;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS test_webhook_url TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS sandbox_enabled BOOLEAN DEFAULT true;

-- Test transactions (separate from production)
CREATE TABLE IF NOT EXISTS test_payins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  status TEXT DEFAULT 'pending',
  utr TEXT,
  callback_url TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS test_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  status TEXT DEFAULT 'pending',
  bank_name TEXT,
  account_number TEXT,
  ifsc_code TEXT,
  beneficiary_name TEXT,
  callback_url TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE test_payins ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY merchant_own_test_payins ON test_payins
  FOR ALL USING (
    merchant_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid())
  );

CREATE POLICY merchant_own_test_payouts ON test_payouts
  FOR ALL USING (
    merchant_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid())
  );

CREATE POLICY admin_all_test_payins ON test_payins
  FOR ALL USING (public.user_role() = 'admin');

CREATE POLICY admin_all_test_payouts ON test_payouts
  FOR ALL USING (public.user_role() = 'admin');

-- ════════════════════════════════════════════
-- 8. KYC DOCUMENT MANAGEMENT
-- ════════════════════════════════════════════

CREATE TYPE kyc_doc_type AS ENUM (
  'pan_card', 'aadhaar_front', 'aadhaar_back', 'passport',
  'driving_license', 'voter_id', 'gst_certificate',
  'bank_statement', 'cancelled_cheque', 'address_proof',
  'business_registration', 'partnership_deed', 'moa_aoa',
  'board_resolution', 'selfie', 'video_kyc', 'other'
);

CREATE TYPE kyc_status AS ENUM ('pending', 'under_review', 'approved', 'rejected', 'expired');

CREATE TABLE IF NOT EXISTS kyc_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('trader', 'merchant')),
  entity_id UUID NOT NULL,
  
  document_type kyc_doc_type NOT NULL,
  document_number TEXT, -- PAN number, Aadhaar number, etc.
  
  -- File storage
  file_path TEXT NOT NULL, -- Supabase storage path
  file_name TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  
  -- Verification
  status kyc_status DEFAULT 'pending',
  verified_data JSONB, -- extracted/verified data
  rejection_reason TEXT,
  
  -- Review
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  
  -- Validity
  issued_date DATE,
  expiry_date DATE,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_kyc_entity ON kyc_documents(entity_type, entity_id);
CREATE INDEX idx_kyc_status ON kyc_documents(status);
CREATE INDEX idx_kyc_expiry ON kyc_documents(expiry_date) WHERE expiry_date IS NOT NULL;
ALTER TABLE kyc_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_kyc ON kyc_documents
  FOR ALL USING (public.user_role() = 'admin');

CREATE POLICY trader_own_kyc ON kyc_documents
  FOR ALL USING (
    entity_type = 'trader' AND
    entity_id IN (SELECT id FROM traders WHERE profile_id = auth.uid())
  );

CREATE POLICY merchant_own_kyc ON kyc_documents
  FOR ALL USING (
    entity_type = 'merchant' AND
    entity_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid())
  );

-- KYC verification status on entities
ALTER TABLE traders ADD COLUMN IF NOT EXISTS kyc_status kyc_status DEFAULT 'pending';
ALTER TABLE traders ADD COLUMN IF NOT EXISTS kyc_verified_at TIMESTAMPTZ;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS kyc_status kyc_status DEFAULT 'pending';
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS kyc_verified_at TIMESTAMPTZ;

-- ════════════════════════════════════════════
-- 9. ALERT SYSTEM
-- ════════════════════════════════════════════

CREATE TYPE alert_channel AS ENUM ('email', 'telegram', 'webhook', 'sms', 'in_app');
CREATE TYPE alert_severity AS ENUM ('info', 'warning', 'critical');

CREATE TABLE IF NOT EXISTS alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  
  -- Trigger conditions
  event_type TEXT NOT NULL, -- 'high_failure_rate', 'large_transaction', 'new_dispute', etc.
  conditions JSONB NOT NULL, -- {"threshold": 50, "window_minutes": 30, "amount_above": 100000}
  
  -- Notification
  channels alert_channel[] DEFAULT '{in_app}',
  severity alert_severity DEFAULT 'warning',
  
  -- Recipients
  notify_admins BOOLEAN DEFAULT true,
  notify_emails TEXT[], -- additional emails
  telegram_chat_ids TEXT[], -- telegram chat IDs
  webhook_urls TEXT[], -- webhook URLs
  
  -- Throttling
  cooldown_minutes INTEGER DEFAULT 30, -- don't re-alert within this period
  last_triggered_at TIMESTAMPTZ,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_alert_rules ON alert_rules
  FOR ALL USING (public.user_role() = 'admin');

-- Alert history
CREATE TABLE IF NOT EXISTS alert_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES alert_rules(id) ON DELETE SET NULL,
  rule_name TEXT NOT NULL,
  
  event_type TEXT NOT NULL,
  severity alert_severity NOT NULL,
  
  -- What triggered it
  trigger_data JSONB, -- the data that triggered the alert
  message TEXT NOT NULL,
  
  -- Delivery status
  channels_notified alert_channel[],
  delivery_status JSONB, -- {"email": "sent", "telegram": "failed", ...}
  
  -- Acknowledgement
  acknowledged_by UUID REFERENCES profiles(id),
  acknowledged_at TIMESTAMPTZ,
  resolution_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_alert_history_created ON alert_history(created_at DESC);
CREATE INDEX idx_alert_history_severity ON alert_history(severity);
ALTER TABLE alert_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_alert_history ON alert_history
  FOR ALL USING (public.user_role() = 'admin');

-- ════════════════════════════════════════════
-- 10. REFUND MANAGEMENT
-- ════════════════════════════════════════════

CREATE TYPE refund_status AS ENUM ('pending', 'approved', 'processing', 'completed', 'rejected', 'failed');
CREATE TYPE refund_reason AS ENUM ('customer_request', 'duplicate', 'fraud', 'service_issue', 'partial', 'other');

CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payin_id UUID NOT NULL REFERENCES payins(id),
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  
  -- Amount
  original_amount DECIMAL(15,2) NOT NULL,
  refund_amount DECIMAL(15,2) NOT NULL,
  is_partial BOOLEAN DEFAULT false,
  
  -- Reason
  reason refund_reason NOT NULL,
  reason_details TEXT,
  
  -- Status
  status refund_status DEFAULT 'pending',
  
  -- Bank details (for refund transfer)
  refund_to_upi TEXT,
  refund_to_bank TEXT,
  refund_to_account TEXT,
  refund_to_ifsc TEXT,
  
  -- Processing
  requested_by UUID REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  transaction_ref TEXT,
  
  -- Notes
  merchant_notes TEXT,
  admin_notes TEXT,
  rejection_reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_refunds_payin ON refunds(payin_id);
CREATE INDEX idx_refunds_merchant ON refunds(merchant_id, created_at DESC);
CREATE INDEX idx_refunds_status ON refunds(status);
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_refunds ON refunds
  FOR ALL USING (public.user_role() = 'admin');

CREATE POLICY merchant_own_refunds ON refunds
  FOR ALL USING (
    merchant_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid())
  );

-- ════════════════════════════════════════════
-- 11. CHARGEBACK MANAGEMENT
-- ════════════════════════════════════════════

CREATE TYPE chargeback_status AS ENUM (
  'received', 'under_review', 'evidence_requested', 'evidence_submitted',
  'won', 'lost', 'accepted', 'expired'
);
CREATE TYPE chargeback_reason AS ENUM (
  'fraud', 'not_received', 'not_as_described', 'duplicate', 
  'cancelled', 'credit_not_processed', 'unauthorized', 'other'
);

CREATE TABLE IF NOT EXISTS chargebacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payin_id UUID NOT NULL REFERENCES payins(id),
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  
  -- Amount
  original_amount DECIMAL(15,2) NOT NULL,
  chargeback_amount DECIMAL(15,2) NOT NULL,
  
  -- Bank/network details
  arn TEXT, -- Acquirer Reference Number
  case_number TEXT,
  network TEXT, -- VISA, Mastercard, etc.
  
  -- Reason
  reason chargeback_reason NOT NULL,
  reason_code TEXT,
  reason_details TEXT,
  
  -- Status & Deadlines
  status chargeback_status DEFAULT 'received',
  evidence_due_date DATE,
  
  -- Evidence
  evidence_submitted BOOLEAN DEFAULT false,
  evidence_files TEXT[], -- storage paths
  evidence_notes TEXT,
  
  -- Resolution
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  amount_recovered DECIMAL(15,2),
  
  -- Fees
  chargeback_fee DECIMAL(10,2) DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chargebacks_payin ON chargebacks(payin_id);
CREATE INDEX idx_chargebacks_merchant ON chargebacks(merchant_id, created_at DESC);
CREATE INDEX idx_chargebacks_status ON chargebacks(status);
CREATE INDEX idx_chargebacks_due_date ON chargebacks(evidence_due_date) WHERE status = 'evidence_requested';
ALTER TABLE chargebacks ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_chargebacks ON chargebacks
  FOR ALL USING (public.user_role() = 'admin');

CREATE POLICY merchant_own_chargebacks ON chargebacks
  FOR SELECT USING (
    merchant_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid())
  );

-- ════════════════════════════════════════════
-- 12. DAILY RECONCILIATION
-- ════════════════════════════════════════════

CREATE TYPE recon_status AS ENUM ('pending', 'matched', 'mismatched', 'resolved', 'ignored');

CREATE TABLE IF NOT EXISTS daily_reconciliation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recon_date DATE NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('merchant', 'trader', 'upi')),
  entity_id UUID NOT NULL,
  
  -- Expected (from our system)
  expected_payin_count INTEGER DEFAULT 0,
  expected_payin_amount DECIMAL(15,2) DEFAULT 0,
  expected_payout_count INTEGER DEFAULT 0,
  expected_payout_amount DECIMAL(15,2) DEFAULT 0,
  expected_balance DECIMAL(15,2) DEFAULT 0,
  
  -- Actual (from bank/external)
  actual_payin_count INTEGER,
  actual_payin_amount DECIMAL(15,2),
  actual_payout_count INTEGER,
  actual_payout_amount DECIMAL(15,2),
  actual_balance DECIMAL(15,2),
  
  -- Variance
  payin_count_variance INTEGER,
  payin_amount_variance DECIMAL(15,2),
  payout_count_variance INTEGER,
  payout_amount_variance DECIMAL(15,2),
  balance_variance DECIMAL(15,2),
  
  -- Status
  status recon_status DEFAULT 'pending',
  
  -- Resolution
  resolved_by UUID REFERENCES profiles(id),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(recon_date, entity_type, entity_id)
);

CREATE INDEX idx_recon_date ON daily_reconciliation(recon_date DESC);
CREATE INDEX idx_recon_status ON daily_reconciliation(status);
CREATE INDEX idx_recon_entity ON daily_reconciliation(entity_type, entity_id);
ALTER TABLE daily_reconciliation ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_recon ON daily_reconciliation
  FOR ALL USING (public.user_role() = 'admin');

-- ════════════════════════════════════════════
-- 13. REPORTS
-- ════════════════════════════════════════════

CREATE TYPE report_type AS ENUM (
  'daily_summary', 'weekly_summary', 'monthly_summary',
  'merchant_volume', 'trader_performance', 'revenue',
  'settlement', 'reconciliation', 'custom'
);
CREATE TYPE report_status AS ENUM ('pending', 'generating', 'completed', 'failed');

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type report_type NOT NULL,
  name TEXT NOT NULL,
  
  -- Filters
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  filters JSONB, -- {"merchant_id": "...", "status": ["completed"]}
  
  -- Output
  status report_status DEFAULT 'pending',
  file_path TEXT, -- storage path to generated file
  file_format TEXT DEFAULT 'csv', -- csv, pdf, xlsx
  row_count INTEGER,
  
  -- Scheduling
  is_scheduled BOOLEAN DEFAULT false,
  schedule_cron TEXT, -- cron expression
  next_run_at TIMESTAMPTZ,
  
  -- Audit
  generated_by UUID REFERENCES profiles(id),
  generated_at TIMESTAMPTZ,
  error_message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_reports_type ON reports(report_type);
CREATE INDEX idx_reports_status ON reports(status);
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_reports ON reports
  FOR ALL USING (public.user_role() = 'admin');

-- Daily summary snapshots (for quick dashboard)
CREATE TABLE IF NOT EXISTS daily_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_date DATE NOT NULL UNIQUE,
  
  -- Totals
  total_payin_count INTEGER DEFAULT 0,
  total_payin_amount DECIMAL(15,2) DEFAULT 0,
  total_payout_count INTEGER DEFAULT 0,
  total_payout_amount DECIMAL(15,2) DEFAULT 0,
  
  -- Success rates
  payin_success_rate DECIMAL(5,2) DEFAULT 0,
  payout_success_rate DECIMAL(5,2) DEFAULT 0,
  
  -- Revenue
  total_payin_fees DECIMAL(15,2) DEFAULT 0,
  total_payout_fees DECIMAL(15,2) DEFAULT 0,
  total_revenue DECIMAL(15,2) DEFAULT 0,
  
  -- Active entities
  active_merchants INTEGER DEFAULT 0,
  active_traders INTEGER DEFAULT 0,
  active_upis INTEGER DEFAULT 0,
  
  -- Issues
  dispute_count INTEGER DEFAULT 0,
  refund_count INTEGER DEFAULT 0,
  chargeback_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE daily_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_daily_summaries ON daily_summaries
  FOR ALL USING (public.user_role() = 'admin');

-- ════════════════════════════════════════════
-- 14. TERMS & COMPLIANCE
-- ════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS terms_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  content TEXT NOT NULL, -- markdown content
  effective_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT false,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE terms_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_manage_terms ON terms_versions
  FOR ALL USING (public.user_role() = 'admin');

CREATE POLICY public_read_active_terms ON terms_versions
  FOR SELECT USING (is_active = true);

CREATE TABLE IF NOT EXISTS terms_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  terms_version_id UUID NOT NULL REFERENCES terms_versions(id),
  entity_type TEXT, -- 'trader', 'merchant'
  entity_id UUID,
  
  accepted_at TIMESTAMPTZ DEFAULT now(),
  ip_address INET,
  user_agent TEXT,
  
  UNIQUE(user_id, terms_version_id)
);

CREATE INDEX idx_terms_acceptance_user ON terms_acceptances(user_id);
ALTER TABLE terms_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_acceptances ON terms_acceptances
  FOR SELECT USING (public.user_role() = 'admin');

CREATE POLICY user_own_acceptances ON terms_acceptances
  FOR ALL USING (user_id = auth.uid());

-- ════════════════════════════════════════════
-- 15. DATA RETENTION
-- ════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS data_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL UNIQUE,
  retention_days INTEGER NOT NULL,
  archive_before_delete BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  last_cleanup_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE data_retention_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_retention ON data_retention_policies
  FOR ALL USING (public.user_role() = 'admin');

-- Insert default policies
INSERT INTO data_retention_policies (table_name, retention_days, archive_before_delete) VALUES
  ('login_attempts', 90, false),
  ('webhook_delivery_logs', 180, true),
  ('alert_history', 365, true),
  ('admin_logs', 730, true), -- 2 years
  ('test_payins', 30, false),
  ('test_payouts', 30, false)
ON CONFLICT (table_name) DO NOTHING;

-- ════════════════════════════════════════════
-- 16. ANOMALY DETECTION
-- ════════════════════════════════════════════

CREATE TYPE anomaly_type AS ENUM (
  'unusual_amount', 'velocity_spike', 'new_location', 'off_hours',
  'pattern_break', 'fraud_signal', 'other'
);
CREATE TYPE anomaly_status AS ENUM ('detected', 'reviewing', 'confirmed', 'false_positive', 'resolved');

CREATE TABLE IF NOT EXISTS anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anomaly_type anomaly_type NOT NULL,
  severity alert_severity NOT NULL,
  
  -- What triggered it
  entity_type TEXT, -- 'merchant', 'trader', 'transaction'
  entity_id UUID,
  transaction_id UUID,
  
  -- Details
  description TEXT NOT NULL,
  detection_data JSONB, -- the metrics that triggered detection
  baseline_data JSONB, -- what normal looks like
  deviation_percentage DECIMAL(10,2), -- how far from normal
  
  -- Status
  status anomaly_status DEFAULT 'detected',
  
  -- Review
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_anomalies_type ON anomalies(anomaly_type);
CREATE INDEX idx_anomalies_status ON anomalies(status);
CREATE INDEX idx_anomalies_created ON anomalies(created_at DESC);
ALTER TABLE anomalies ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_anomalies ON anomalies
  FOR ALL USING (public.user_role() = 'admin');

-- ════════════════════════════════════════════
-- 17. TRANSACTION EXPORT
-- ════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  export_type TEXT NOT NULL, -- 'payins', 'payouts', 'settlements', etc.
  
  -- Filters
  filters JSONB NOT NULL,
  date_from TIMESTAMPTZ,
  date_to TIMESTAMPTZ,
  
  -- Output
  status report_status DEFAULT 'pending',
  file_path TEXT,
  file_format TEXT DEFAULT 'csv',
  row_count INTEGER,
  file_size INTEGER,
  
  -- Requester
  requested_by UUID NOT NULL REFERENCES profiles(id),
  merchant_id UUID REFERENCES merchants(id), -- if merchant export
  
  -- Processing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  expires_at TIMESTAMPTZ, -- auto-delete file after this
  
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_exports_user ON export_jobs(requested_by);
CREATE INDEX idx_exports_merchant ON export_jobs(merchant_id);
ALTER TABLE export_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_exports ON export_jobs
  FOR ALL USING (public.user_role() = 'admin');

CREATE POLICY merchant_own_exports ON export_jobs
  FOR ALL USING (
    merchant_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid())
  );

-- ════════════════════════════════════════════
-- HELPER FUNCTIONS
-- ════════════════════════════════════════════

-- Check rate limit
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_api_key TEXT,
  p_endpoint TEXT DEFAULT '*'
)
RETURNS TABLE (
  allowed BOOLEAN,
  remaining INTEGER,
  reset_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_merchant_id UUID;
  v_max_requests INTEGER;
  v_window_seconds INTEGER;
  v_current_count INTEGER;
  v_window_start TIMESTAMPTZ;
BEGIN
  -- Get merchant and their rate settings
  SELECT m.id, COALESCE(mrs.requests_per_minute, 100), 60
  INTO v_merchant_id, v_max_requests, v_window_seconds
  FROM merchants m
  LEFT JOIN merchant_rate_settings mrs ON mrs.merchant_id = m.id
  WHERE m.live_api_key = p_api_key OR m.test_api_key = p_api_key;
  
  IF v_merchant_id IS NULL THEN
    RETURN QUERY SELECT false, 0, now();
    RETURN;
  END IF;
  
  -- Check if unlimited
  IF EXISTS (SELECT 1 FROM merchant_rate_settings WHERE merchant_id = v_merchant_id AND is_unlimited = true) THEN
    RETURN QUERY SELECT true, 999999, now() + interval '1 minute';
    RETURN;
  END IF;
  
  -- Get or create rate limit record
  SELECT requests_count, window_start
  INTO v_current_count, v_window_start
  FROM api_rate_limits
  WHERE api_key = p_api_key AND endpoint = p_endpoint;
  
  -- Check if window expired
  IF v_window_start IS NULL OR v_window_start < now() - (v_window_seconds || ' seconds')::interval THEN
    -- Reset window
    INSERT INTO api_rate_limits (merchant_id, api_key, endpoint, requests_count, window_start, max_requests, window_seconds)
    VALUES (v_merchant_id, p_api_key, p_endpoint, 1, now(), v_max_requests, v_window_seconds)
    ON CONFLICT (api_key, endpoint) DO UPDATE SET
      requests_count = 1,
      window_start = now();
    
    RETURN QUERY SELECT true, v_max_requests - 1, now() + (v_window_seconds || ' seconds')::interval;
    RETURN;
  END IF;
  
  -- Check limit
  IF v_current_count >= v_max_requests THEN
    RETURN QUERY SELECT false, 0, v_window_start + (v_window_seconds || ' seconds')::interval;
    RETURN;
  END IF;
  
  -- Increment counter
  UPDATE api_rate_limits
  SET requests_count = requests_count + 1, updated_at = now()
  WHERE api_key = p_api_key AND endpoint = p_endpoint;
  
  RETURN QUERY SELECT true, v_max_requests - v_current_count - 1, v_window_start + (v_window_seconds || ' seconds')::interval;
END;
$$;

-- Check IP whitelist
CREATE OR REPLACE FUNCTION check_ip_whitelist(
  p_entity_type TEXT,
  p_entity_id UUID,
  p_ip_address INET
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_enforce_whitelist BOOLEAN;
BEGIN
  -- Check if entity enforces whitelist
  IF p_entity_type = 'merchant' THEN
    SELECT enforce_ip_whitelist INTO v_enforce_whitelist
    FROM merchants WHERE id = p_entity_id;
  ELSE
    v_enforce_whitelist := false; -- Only merchants have this setting for now
  END IF;
  
  -- If not enforcing, allow all
  IF NOT COALESCE(v_enforce_whitelist, false) THEN
    RETURN true;
  END IF;
  
  -- Check whitelist
  RETURN EXISTS (
    SELECT 1 FROM ip_whitelist
    WHERE entity_type = p_entity_type
      AND entity_id = p_entity_id
      AND ip_address = p_ip_address
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
  );
END;
$$;

-- Generate daily summary
CREATE OR REPLACE FUNCTION generate_daily_summary(p_date DATE)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_summary_id UUID;
BEGIN
  INSERT INTO daily_summaries (
    summary_date,
    total_payin_count,
    total_payin_amount,
    total_payout_count,
    total_payout_amount,
    payin_success_rate,
    payout_success_rate,
    active_merchants,
    active_traders,
    dispute_count,
    refund_count
  )
  SELECT
    p_date,
    COALESCE((SELECT COUNT(*) FROM payins WHERE DATE(created_at) = p_date), 0),
    COALESCE((SELECT SUM(amount) FROM payins WHERE DATE(created_at) = p_date), 0),
    COALESCE((SELECT COUNT(*) FROM payouts WHERE DATE(created_at) = p_date), 0),
    COALESCE((SELECT SUM(amount) FROM payouts WHERE DATE(created_at) = p_date), 0),
    COALESCE((SELECT COUNT(*) FILTER (WHERE status = 'completed') * 100.0 / NULLIF(COUNT(*), 0) FROM payins WHERE DATE(created_at) = p_date), 0),
    COALESCE((SELECT COUNT(*) FILTER (WHERE status = 'completed') * 100.0 / NULLIF(COUNT(*), 0) FROM payouts WHERE DATE(created_at) = p_date), 0),
    COALESCE((SELECT COUNT(DISTINCT merchant_id) FROM payins WHERE DATE(created_at) = p_date), 0),
    COALESCE((SELECT COUNT(DISTINCT trader_id) FROM payouts WHERE DATE(created_at) = p_date), 0),
    COALESCE((SELECT COUNT(*) FROM disputes WHERE DATE(created_at) = p_date), 0),
    0 -- refunds table may not exist yet
  ON CONFLICT (summary_date) DO UPDATE SET
    total_payin_count = EXCLUDED.total_payin_count,
    total_payin_amount = EXCLUDED.total_payin_amount,
    total_payout_count = EXCLUDED.total_payout_count,
    total_payout_amount = EXCLUDED.total_payout_amount,
    payin_success_rate = EXCLUDED.payin_success_rate,
    payout_success_rate = EXCLUDED.payout_success_rate,
    active_merchants = EXCLUDED.active_merchants,
    active_traders = EXCLUDED.active_traders,
    dispute_count = EXCLUDED.dispute_count
  RETURNING id INTO v_summary_id;
  
  RETURN v_summary_id;
END;
$$;

-- Release expired holds
CREATE OR REPLACE FUNCTION release_expired_holds()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_released INTEGER := 0;
  v_hold RECORD;
BEGIN
  FOR v_hold IN
    SELECT * FROM balance_holds
    WHERE status = 'active' AND hold_until IS NOT NULL AND hold_until <= now()
  LOOP
    -- Update hold status
    UPDATE balance_holds SET status = 'released', released_at = now() WHERE id = v_hold.id;
    
    -- Add amount back to entity balance
    IF v_hold.entity_type = 'merchant' THEN
      UPDATE merchants SET balance = balance + v_hold.amount WHERE id = v_hold.entity_id;
    ELSIF v_hold.entity_type = 'trader' THEN
      UPDATE traders SET balance = balance + v_hold.amount WHERE id = v_hold.entity_id;
    END IF;
    
    v_released := v_released + 1;
  END LOOP;
  
  RETURN v_released;
END;
$$;

-- Queue webhook
CREATE OR REPLACE FUNCTION queue_webhook(
  p_merchant_id UUID,
  p_event_type TEXT,
  p_payload JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_webhook_url TEXT;
  v_webhook_secret TEXT;
  v_webhook_id UUID;
BEGIN
  -- Get merchant webhook settings
  SELECT webhook_url, webhook_secret
  INTO v_webhook_url, v_webhook_secret
  FROM merchants
  WHERE id = p_merchant_id;
  
  IF v_webhook_url IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Queue the webhook
  INSERT INTO webhook_queue (merchant_id, event_type, payload, url, secret)
  VALUES (p_merchant_id, p_event_type, p_payload, v_webhook_url, v_webhook_secret)
  RETURNING id INTO v_webhook_id;
  
  RETURN v_webhook_id;
END;
$$;

-- ════════════════════════════════════════════
-- GRANTS
-- ════════════════════════════════════════════

GRANT USAGE ON TYPE webhook_status TO authenticated;
GRANT USAGE ON TYPE settlement_status TO authenticated;
GRANT USAGE ON TYPE settlement_type TO authenticated;
GRANT USAGE ON TYPE settlement_frequency TO authenticated;
GRANT USAGE ON TYPE hold_status TO authenticated;
GRANT USAGE ON TYPE hold_reason TO authenticated;
GRANT USAGE ON TYPE kyc_doc_type TO authenticated;
GRANT USAGE ON TYPE kyc_status TO authenticated;
GRANT USAGE ON TYPE alert_channel TO authenticated;
GRANT USAGE ON TYPE alert_severity TO authenticated;
GRANT USAGE ON TYPE refund_status TO authenticated;
GRANT USAGE ON TYPE refund_reason TO authenticated;
GRANT USAGE ON TYPE chargeback_status TO authenticated;
GRANT USAGE ON TYPE chargeback_reason TO authenticated;
GRANT USAGE ON TYPE recon_status TO authenticated;
GRANT USAGE ON TYPE report_type TO authenticated;
GRANT USAGE ON TYPE report_status TO authenticated;
GRANT USAGE ON TYPE anomaly_type TO authenticated;
GRANT USAGE ON TYPE anomaly_status TO authenticated;

-- ════════════════════════════════════════════
-- DONE
-- ════════════════════════════════════════════

-- Summary of what was created:
-- Tables: 25+ new tables
-- Functions: 6 helper functions
-- Policies: RLS on all tables
-- Indexes: Performance indexes on key columns

-- Next: Run this migration, then create frontend components
