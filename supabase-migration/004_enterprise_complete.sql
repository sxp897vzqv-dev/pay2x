-- ============================================
-- PAY2X ENTERPRISE FEATURES - COMPLETE
-- Fresh migration that handles all edge cases
-- ============================================

-- ════════════════════════════════════════════
-- 1. API RATE LIMITING
-- ════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS api_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
  api_key TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  requests_count INTEGER DEFAULT 0,
  window_start TIMESTAMPTZ DEFAULT now(),
  window_seconds INTEGER DEFAULT 60,
  max_requests INTEGER DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(api_key, endpoint)
);

CREATE TABLE IF NOT EXISTS merchant_rate_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID UNIQUE REFERENCES merchants(id) ON DELETE CASCADE,
  requests_per_minute INTEGER DEFAULT 100,
  requests_per_hour INTEGER DEFAULT 1000,
  requests_per_day INTEGER DEFAULT 10000,
  burst_limit INTEGER DEFAULT 20,
  is_unlimited BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE api_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_rate_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_rate_limits ON api_rate_limits;
CREATE POLICY admin_all_rate_limits ON api_rate_limits FOR ALL USING (public.user_role() = 'admin');

DROP POLICY IF EXISTS admin_rate_settings ON merchant_rate_settings;
CREATE POLICY admin_rate_settings ON merchant_rate_settings FOR ALL USING (public.user_role() = 'admin');

DROP POLICY IF EXISTS merchant_own_rate_settings ON merchant_rate_settings;
CREATE POLICY merchant_own_rate_settings ON merchant_rate_settings FOR SELECT USING (
  merchant_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid())
);

-- ════════════════════════════════════════════
-- 2. IP WHITELISTING
-- ════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ip_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('merchant', 'admin', 'trader')),
  entity_id UUID NOT NULL,
  ip_address INET NOT NULL,
  label TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  UNIQUE(entity_type, entity_id, ip_address)
);

ALTER TABLE ip_whitelist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_ip_whitelist ON ip_whitelist;
CREATE POLICY admin_all_ip_whitelist ON ip_whitelist FOR ALL USING (public.user_role() = 'admin');

DROP POLICY IF EXISTS merchant_own_ip_whitelist ON ip_whitelist;
CREATE POLICY merchant_own_ip_whitelist ON ip_whitelist FOR ALL USING (
  entity_type = 'merchant' AND entity_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid())
);

ALTER TABLE merchants ADD COLUMN IF NOT EXISTS enforce_ip_whitelist BOOLEAN DEFAULT false;

-- ════════════════════════════════════════════
-- 3. WEBHOOK QUEUE
-- ════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE webhook_status AS ENUM ('pending', 'processing', 'success', 'failed', 'exhausted');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS webhook_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  url TEXT NOT NULL,
  secret TEXT,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 5,
  next_retry_at TIMESTAMPTZ DEFAULT now(),
  retry_delay_seconds INTEGER DEFAULT 30,
  status webhook_status DEFAULT 'pending',
  last_response_code INTEGER,
  last_response_body TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

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

ALTER TABLE webhook_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_delivery_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_webhooks ON webhook_queue;
CREATE POLICY admin_all_webhooks ON webhook_queue FOR ALL USING (public.user_role() = 'admin');

DROP POLICY IF EXISTS merchant_own_webhooks ON webhook_queue;
CREATE POLICY merchant_own_webhooks ON webhook_queue FOR SELECT USING (
  merchant_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid())
);

DROP POLICY IF EXISTS admin_all_webhook_logs ON webhook_delivery_logs;
CREATE POLICY admin_all_webhook_logs ON webhook_delivery_logs FOR ALL USING (public.user_role() = 'admin');

DROP POLICY IF EXISTS merchant_own_webhook_logs ON webhook_delivery_logs;
CREATE POLICY merchant_own_webhook_logs ON webhook_delivery_logs FOR SELECT USING (
  merchant_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid())
);

-- ════════════════════════════════════════════
-- 4. SETTLEMENTS
-- ════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE settlement_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE settlement_type AS ENUM ('merchant', 'trader');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE settlement_frequency AS ENUM ('daily', 'weekly', 'biweekly', 'monthly', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_type settlement_type NOT NULL,
  merchant_id UUID REFERENCES merchants(id) ON DELETE SET NULL,
  trader_id UUID REFERENCES traders(id) ON DELETE SET NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  gross_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  fee_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  hold_amount DECIMAL(15,2) DEFAULT 0,
  net_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  payin_count INTEGER DEFAULT 0,
  payout_count INTEGER DEFAULT 0,
  refund_count INTEGER DEFAULT 0,
  chargeback_count INTEGER DEFAULT 0,
  status settlement_status DEFAULT 'pending',
  bank_account_id UUID,
  bank_name TEXT,
  account_number TEXT,
  ifsc_code TEXT,
  processed_by UUID REFERENCES profiles(id),
  processed_at TIMESTAMPTZ,
  transaction_ref TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settlement_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('merchant', 'trader', 'global')),
  entity_id UUID,
  frequency settlement_frequency DEFAULT 'daily',
  settlement_day INTEGER,
  settlement_hour INTEGER DEFAULT 10,
  min_settlement_amount DECIMAL(15,2) DEFAULT 1000,
  hold_percentage DECIMAL(5,2) DEFAULT 0,
  hold_days INTEGER DEFAULT 0,
  auto_settle BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(entity_type, entity_id)
);

ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_settlements ON settlements;
CREATE POLICY admin_all_settlements ON settlements FOR ALL USING (public.user_role() = 'admin');

DROP POLICY IF EXISTS merchant_own_settlements ON settlements;
CREATE POLICY merchant_own_settlements ON settlements FOR SELECT USING (
  merchant_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid())
);

DROP POLICY IF EXISTS trader_own_settlements ON settlements;
CREATE POLICY trader_own_settlements ON settlements FOR SELECT USING (
  trader_id IN (SELECT id FROM traders WHERE profile_id = auth.uid())
);

DROP POLICY IF EXISTS admin_all_settlement_settings ON settlement_settings;
CREATE POLICY admin_all_settlement_settings ON settlement_settings FOR ALL USING (public.user_role() = 'admin');

-- ════════════════════════════════════════════
-- 5. BALANCE HOLDS
-- ════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE hold_status AS ENUM ('active', 'released', 'forfeited', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE hold_reason AS ENUM ('settlement', 'dispute', 'chargeback', 'fraud_review', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS balance_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('merchant', 'trader')),
  entity_id UUID NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  reason hold_reason NOT NULL,
  status hold_status DEFAULT 'active',
  transaction_id UUID,
  settlement_id UUID REFERENCES settlements(id),
  dispute_id UUID REFERENCES disputes(id),
  hold_until TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  released_by UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE balance_holds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_holds ON balance_holds;
CREATE POLICY admin_all_holds ON balance_holds FOR ALL USING (public.user_role() = 'admin');

DROP POLICY IF EXISTS merchant_own_holds ON balance_holds;
CREATE POLICY merchant_own_holds ON balance_holds FOR SELECT USING (
  entity_type = 'merchant' AND entity_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid())
);

DROP POLICY IF EXISTS trader_own_holds ON balance_holds;
CREATE POLICY trader_own_holds ON balance_holds FOR SELECT USING (
  entity_type = 'trader' AND entity_id IN (SELECT id FROM traders WHERE profile_id = auth.uid())
);

-- ════════════════════════════════════════════
-- 6. SANDBOX / TEST MODE
-- ════════════════════════════════════════════

ALTER TABLE merchants ADD COLUMN IF NOT EXISTS test_api_key TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS test_webhook_url TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS sandbox_enabled BOOLEAN DEFAULT true;

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

DROP POLICY IF EXISTS merchant_own_test_payins ON test_payins;
CREATE POLICY merchant_own_test_payins ON test_payins FOR ALL USING (
  merchant_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid())
);

DROP POLICY IF EXISTS merchant_own_test_payouts ON test_payouts;
CREATE POLICY merchant_own_test_payouts ON test_payouts FOR ALL USING (
  merchant_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid())
);

DROP POLICY IF EXISTS admin_all_test_payins ON test_payins;
CREATE POLICY admin_all_test_payins ON test_payins FOR ALL USING (public.user_role() = 'admin');

DROP POLICY IF EXISTS admin_all_test_payouts ON test_payouts;
CREATE POLICY admin_all_test_payouts ON test_payouts FOR ALL USING (public.user_role() = 'admin');

-- ════════════════════════════════════════════
-- 7. KYC DOCUMENTS
-- ════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE kyc_doc_type AS ENUM (
    'pan_card', 'aadhaar_front', 'aadhaar_back', 'passport',
    'driving_license', 'voter_id', 'gst_certificate',
    'bank_statement', 'cancelled_cheque', 'address_proof',
    'business_registration', 'partnership_deed', 'moa_aoa',
    'board_resolution', 'selfie', 'video_kyc', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE kyc_status AS ENUM ('pending', 'under_review', 'approved', 'rejected', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS kyc_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('trader', 'merchant')),
  entity_id UUID NOT NULL,
  document_type kyc_doc_type NOT NULL,
  document_number TEXT,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  status kyc_status DEFAULT 'pending',
  verified_data JSONB,
  rejection_reason TEXT,
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  issued_date DATE,
  expiry_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE kyc_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_kyc ON kyc_documents;
CREATE POLICY admin_all_kyc ON kyc_documents FOR ALL USING (public.user_role() = 'admin');

DROP POLICY IF EXISTS trader_own_kyc ON kyc_documents;
CREATE POLICY trader_own_kyc ON kyc_documents FOR ALL USING (
  entity_type = 'trader' AND entity_id IN (SELECT id FROM traders WHERE profile_id = auth.uid())
);

DROP POLICY IF EXISTS merchant_own_kyc ON kyc_documents;
CREATE POLICY merchant_own_kyc ON kyc_documents FOR ALL USING (
  entity_type = 'merchant' AND entity_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid())
);

ALTER TABLE traders ADD COLUMN IF NOT EXISTS kyc_status kyc_status DEFAULT 'pending';
ALTER TABLE traders ADD COLUMN IF NOT EXISTS kyc_verified_at TIMESTAMPTZ;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS kyc_status kyc_status DEFAULT 'pending';
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS kyc_verified_at TIMESTAMPTZ;

-- ════════════════════════════════════════════
-- 8. ALERTS
-- ════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE alert_channel AS ENUM ('email', 'telegram', 'webhook', 'sms', 'in_app');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE alert_severity AS ENUM ('info', 'warning', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL,
  conditions JSONB NOT NULL,
  channels alert_channel[] DEFAULT '{in_app}',
  severity alert_severity DEFAULT 'warning',
  notify_admins BOOLEAN DEFAULT true,
  notify_emails TEXT[],
  telegram_chat_ids TEXT[],
  webhook_urls TEXT[],
  cooldown_minutes INTEGER DEFAULT 30,
  last_triggered_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alert_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES alert_rules(id) ON DELETE SET NULL,
  rule_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  severity alert_severity NOT NULL,
  trigger_data JSONB,
  message TEXT NOT NULL,
  channels_notified alert_channel[],
  delivery_status JSONB,
  acknowledged_by UUID REFERENCES profiles(id),
  acknowledged_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_alert_rules ON alert_rules;
CREATE POLICY admin_all_alert_rules ON alert_rules FOR ALL USING (public.user_role() = 'admin');

DROP POLICY IF EXISTS admin_all_alert_history ON alert_history;
CREATE POLICY admin_all_alert_history ON alert_history FOR ALL USING (public.user_role() = 'admin');

-- ════════════════════════════════════════════
-- 9. REFUNDS
-- ════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE refund_status AS ENUM ('pending', 'approved', 'processing', 'completed', 'rejected', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE refund_reason AS ENUM ('customer_request', 'duplicate', 'fraud', 'service_issue', 'partial', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payin_id UUID NOT NULL REFERENCES payins(id),
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  original_amount DECIMAL(15,2) NOT NULL,
  refund_amount DECIMAL(15,2) NOT NULL,
  is_partial BOOLEAN DEFAULT false,
  reason refund_reason NOT NULL,
  reason_details TEXT,
  status refund_status DEFAULT 'pending',
  refund_to_upi TEXT,
  refund_to_bank TEXT,
  refund_to_account TEXT,
  refund_to_ifsc TEXT,
  requested_by UUID REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  transaction_ref TEXT,
  merchant_notes TEXT,
  admin_notes TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_refunds ON refunds;
CREATE POLICY admin_all_refunds ON refunds FOR ALL USING (public.user_role() = 'admin');

DROP POLICY IF EXISTS merchant_own_refunds ON refunds;
CREATE POLICY merchant_own_refunds ON refunds FOR ALL USING (
  merchant_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid())
);

-- ════════════════════════════════════════════
-- 10. CHARGEBACKS
-- ════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE chargeback_status AS ENUM (
    'received', 'under_review', 'evidence_requested', 'evidence_submitted',
    'won', 'lost', 'accepted', 'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE chargeback_reason AS ENUM (
    'fraud', 'not_received', 'not_as_described', 'duplicate', 
    'cancelled', 'credit_not_processed', 'unauthorized', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS chargebacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payin_id UUID NOT NULL REFERENCES payins(id),
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  original_amount DECIMAL(15,2) NOT NULL,
  chargeback_amount DECIMAL(15,2) NOT NULL,
  arn TEXT,
  case_number TEXT,
  network TEXT,
  reason chargeback_reason NOT NULL,
  reason_code TEXT,
  reason_details TEXT,
  status chargeback_status DEFAULT 'received',
  evidence_due_date DATE,
  evidence_submitted BOOLEAN DEFAULT false,
  evidence_files TEXT[],
  evidence_notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  amount_recovered DECIMAL(15,2),
  chargeback_fee DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE chargebacks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_chargebacks ON chargebacks;
CREATE POLICY admin_all_chargebacks ON chargebacks FOR ALL USING (public.user_role() = 'admin');

DROP POLICY IF EXISTS merchant_own_chargebacks ON chargebacks;
CREATE POLICY merchant_own_chargebacks ON chargebacks FOR SELECT USING (
  merchant_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid())
);

-- ════════════════════════════════════════════
-- 11. REPORTS & DAILY SUMMARIES
-- ════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE report_status AS ENUM ('pending', 'generating', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS daily_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_date DATE NOT NULL UNIQUE,
  total_payin_count INTEGER DEFAULT 0,
  total_payin_amount DECIMAL(15,2) DEFAULT 0,
  total_payout_count INTEGER DEFAULT 0,
  total_payout_amount DECIMAL(15,2) DEFAULT 0,
  payin_success_rate DECIMAL(5,2) DEFAULT 0,
  payout_success_rate DECIMAL(5,2) DEFAULT 0,
  total_payin_fees DECIMAL(15,2) DEFAULT 0,
  total_payout_fees DECIMAL(15,2) DEFAULT 0,
  total_revenue DECIMAL(15,2) DEFAULT 0,
  active_merchants INTEGER DEFAULT 0,
  active_traders INTEGER DEFAULT 0,
  active_upis INTEGER DEFAULT 0,
  dispute_count INTEGER DEFAULT 0,
  refund_count INTEGER DEFAULT 0,
  chargeback_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  export_type TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}',
  date_from TIMESTAMPTZ,
  date_to TIMESTAMPTZ,
  status report_status DEFAULT 'pending',
  file_path TEXT,
  file_format TEXT DEFAULT 'csv',
  row_count INTEGER,
  file_size INTEGER,
  requested_by UUID NOT NULL REFERENCES profiles(id),
  merchant_id UUID REFERENCES merchants(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE daily_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_daily_summaries ON daily_summaries;
CREATE POLICY admin_all_daily_summaries ON daily_summaries FOR ALL USING (public.user_role() = 'admin');

DROP POLICY IF EXISTS admin_all_exports ON export_jobs;
CREATE POLICY admin_all_exports ON export_jobs FOR ALL USING (public.user_role() = 'admin');

DROP POLICY IF EXISTS merchant_own_exports ON export_jobs;
CREATE POLICY merchant_own_exports ON export_jobs FOR ALL USING (
  merchant_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid())
);

-- ════════════════════════════════════════════
-- 12. ANOMALIES
-- ════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE anomaly_type AS ENUM (
    'unusual_amount', 'velocity_spike', 'new_location', 'off_hours',
    'pattern_break', 'fraud_signal', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE anomaly_status AS ENUM ('detected', 'reviewing', 'confirmed', 'false_positive', 'resolved');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anomaly_type anomaly_type NOT NULL,
  severity alert_severity NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  transaction_id UUID,
  description TEXT NOT NULL,
  detection_data JSONB,
  baseline_data JSONB,
  deviation_percentage DECIMAL(10,2),
  status anomaly_status DEFAULT 'detected',
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE anomalies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_anomalies ON anomalies;
CREATE POLICY admin_all_anomalies ON anomalies FOR ALL USING (public.user_role() = 'admin');

-- ════════════════════════════════════════════
-- GRANT ENUM USAGE
-- ════════════════════════════════════════════

DO $$ BEGIN
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
  GRANT USAGE ON TYPE report_status TO authenticated;
  GRANT USAGE ON TYPE anomaly_type TO authenticated;
  GRANT USAGE ON TYPE anomaly_status TO authenticated;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ════════════════════════════════════════════
-- DONE
-- ════════════════════════════════════════════

SELECT 'Enterprise migration complete!' as result;
