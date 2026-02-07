-- ============================================
-- PAY2X ENTERPRISE FEATURES - CONTINUATION FIX
-- Run this if 004_enterprise.sql failed partway through
-- ============================================

-- Drop conflicting indexes if they exist (so we can recreate cleanly)
DROP INDEX IF EXISTS idx_webhook_logs_merchant;
DROP INDEX IF EXISTS idx_webhook_queue_status;
DROP INDEX IF EXISTS idx_webhook_queue_merchant;
DROP INDEX IF EXISTS idx_webhook_queue_created;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_webhook_logs_merchant ON webhook_delivery_logs(merchant_id, created_at DESC);

-- Continue from SETTLEMENTS section onwards
-- (Copy everything from line 186 onwards from 004_enterprise.sql)

-- ════════════════════════════════════════════
-- 5. SETTLEMENTS
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
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  CHECK (
    (settlement_type = 'merchant' AND merchant_id IS NOT NULL) OR
    (settlement_type = 'trader' AND trader_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_settlements_merchant ON settlements(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_settlements_trader ON settlements(trader_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_settlements_status ON settlements(status);
CREATE INDEX IF NOT EXISTS idx_settlements_period ON settlements(period_start, period_end);
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;

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

-- Settlement settings
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

ALTER TABLE settlement_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all_settlement_settings ON settlement_settings;
CREATE POLICY admin_all_settlement_settings ON settlement_settings FOR ALL USING (public.user_role() = 'admin');

-- ════════════════════════════════════════════
-- 6. HOLD MANAGEMENT
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

CREATE INDEX IF NOT EXISTS idx_holds_entity ON balance_holds(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_holds_status ON balance_holds(status);
CREATE INDEX IF NOT EXISTS idx_holds_release ON balance_holds(hold_until) WHERE status = 'active';
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
-- 7. SANDBOX / TEST MODE
-- ════════════════════════════════════════════

ALTER TABLE merchants ADD COLUMN IF NOT EXISTS test_api_key TEXT UNIQUE;
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
-- 8. KYC DOCUMENT MANAGEMENT
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

CREATE INDEX IF NOT EXISTS idx_kyc_entity ON kyc_documents(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_kyc_status ON kyc_documents(status);
CREATE INDEX IF NOT EXISTS idx_kyc_expiry ON kyc_documents(expiry_date) WHERE expiry_date IS NOT NULL;
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

-- KYC status on entities
ALTER TABLE traders ADD COLUMN IF NOT EXISTS kyc_status kyc_status DEFAULT 'pending';
ALTER TABLE traders ADD COLUMN IF NOT EXISTS kyc_verified_at TIMESTAMPTZ;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS kyc_status kyc_status DEFAULT 'pending';
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS kyc_verified_at TIMESTAMPTZ;

-- ════════════════════════════════════════════
-- 9. ALERT SYSTEM
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

ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_all_alert_rules ON alert_rules;
CREATE POLICY admin_all_alert_rules ON alert_rules FOR ALL USING (public.user_role() = 'admin');

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

CREATE INDEX IF NOT EXISTS idx_alert_history_created ON alert_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_history_severity ON alert_history(severity);
ALTER TABLE alert_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_alert_history ON alert_history;
CREATE POLICY admin_all_alert_history ON alert_history FOR ALL USING (public.user_role() = 'admin');

-- ════════════════════════════════════════════
-- 10. REFUND MANAGEMENT
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

CREATE INDEX IF NOT EXISTS idx_refunds_payin ON refunds(payin_id);
CREATE INDEX IF NOT EXISTS idx_refunds_merchant ON refunds(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status);
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_refunds ON refunds;
CREATE POLICY admin_all_refunds ON refunds FOR ALL USING (public.user_role() = 'admin');

DROP POLICY IF EXISTS merchant_own_refunds ON refunds;
CREATE POLICY merchant_own_refunds ON refunds FOR ALL USING (
  merchant_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid())
);

-- ════════════════════════════════════════════
-- 11. CHARGEBACK MANAGEMENT
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

CREATE INDEX IF NOT EXISTS idx_chargebacks_payin ON chargebacks(payin_id);
CREATE INDEX IF NOT EXISTS idx_chargebacks_merchant ON chargebacks(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chargebacks_status ON chargebacks(status);
CREATE INDEX IF NOT EXISTS idx_chargebacks_due_date ON chargebacks(evidence_due_date) WHERE status = 'evidence_requested';
ALTER TABLE chargebacks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_chargebacks ON chargebacks;
CREATE POLICY admin_all_chargebacks ON chargebacks FOR ALL USING (public.user_role() = 'admin');

DROP POLICY IF EXISTS merchant_own_chargebacks ON chargebacks;
CREATE POLICY merchant_own_chargebacks ON chargebacks FOR SELECT USING (
  merchant_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid())
);

-- ════════════════════════════════════════════
-- 12. DAILY RECONCILIATION
-- ════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE recon_status AS ENUM ('pending', 'matched', 'mismatched', 'resolved', 'ignored');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS daily_reconciliation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recon_date DATE NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('merchant', 'trader', 'upi')),
  entity_id UUID NOT NULL,
  
  expected_payin_count INTEGER DEFAULT 0,
  expected_payin_amount DECIMAL(15,2) DEFAULT 0,
  expected_payout_count INTEGER DEFAULT 0,
  expected_payout_amount DECIMAL(15,2) DEFAULT 0,
  expected_balance DECIMAL(15,2) DEFAULT 0,
  
  actual_payin_count INTEGER,
  actual_payin_amount DECIMAL(15,2),
  actual_payout_count INTEGER,
  actual_payout_amount DECIMAL(15,2),
  actual_balance DECIMAL(15,2),
  
  payin_count_variance INTEGER,
  payin_amount_variance DECIMAL(15,2),
  payout_count_variance INTEGER,
  payout_amount_variance DECIMAL(15,2),
  balance_variance DECIMAL(15,2),
  
  status recon_status DEFAULT 'pending',
  
  resolved_by UUID REFERENCES profiles(id),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(recon_date, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_recon_date ON daily_reconciliation(recon_date DESC);
CREATE INDEX IF NOT EXISTS idx_recon_status ON daily_reconciliation(status);
CREATE INDEX IF NOT EXISTS idx_recon_entity ON daily_reconciliation(entity_type, entity_id);
ALTER TABLE daily_reconciliation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_recon ON daily_reconciliation;
CREATE POLICY admin_all_recon ON daily_reconciliation FOR ALL USING (public.user_role() = 'admin');

-- ════════════════════════════════════════════
-- 13. REPORTS
-- ════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE report_type AS ENUM (
    'daily_summary', 'weekly_summary', 'monthly_summary',
    'merchant_volume', 'trader_performance', 'revenue',
    'settlement', 'reconciliation', 'custom'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE report_status AS ENUM ('pending', 'generating', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type report_type NOT NULL,
  name TEXT NOT NULL,
  
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  filters JSONB,
  
  status report_status DEFAULT 'pending',
  file_path TEXT,
  file_format TEXT DEFAULT 'csv',
  row_count INTEGER,
  
  is_scheduled BOOLEAN DEFAULT false,
  schedule_cron TEXT,
  next_run_at TIMESTAMPTZ,
  
  generated_by UUID REFERENCES profiles(id),
  generated_at TIMESTAMPTZ,
  error_message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(report_type);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_reports ON reports;
CREATE POLICY admin_all_reports ON reports FOR ALL USING (public.user_role() = 'admin');

-- Daily summary snapshots
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

ALTER TABLE daily_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_daily_summaries ON daily_summaries;
CREATE POLICY admin_all_daily_summaries ON daily_summaries FOR ALL USING (public.user_role() = 'admin');

-- ════════════════════════════════════════════
-- 14. TERMS & COMPLIANCE
-- ════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS terms_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  effective_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT false,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE terms_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_manage_terms ON terms_versions;
CREATE POLICY admin_manage_terms ON terms_versions FOR ALL USING (public.user_role() = 'admin');

DROP POLICY IF EXISTS public_read_active_terms ON terms_versions;
CREATE POLICY public_read_active_terms ON terms_versions FOR SELECT USING (is_active = true);

CREATE TABLE IF NOT EXISTS terms_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  terms_version_id UUID NOT NULL REFERENCES terms_versions(id),
  entity_type TEXT,
  entity_id UUID,
  
  accepted_at TIMESTAMPTZ DEFAULT now(),
  ip_address INET,
  user_agent TEXT,
  
  UNIQUE(user_id, terms_version_id)
);

CREATE INDEX IF NOT EXISTS idx_terms_acceptance_user ON terms_acceptances(user_id);
ALTER TABLE terms_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_acceptances ON terms_acceptances;
CREATE POLICY admin_all_acceptances ON terms_acceptances FOR SELECT USING (public.user_role() = 'admin');

DROP POLICY IF EXISTS user_own_acceptances ON terms_acceptances;
CREATE POLICY user_own_acceptances ON terms_acceptances FOR ALL USING (user_id = auth.uid());

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

DROP POLICY IF EXISTS admin_all_retention ON data_retention_policies;
CREATE POLICY admin_all_retention ON data_retention_policies FOR ALL USING (public.user_role() = 'admin');

INSERT INTO data_retention_policies (table_name, retention_days, archive_before_delete) VALUES
  ('login_attempts', 90, false),
  ('webhook_delivery_logs', 180, true),
  ('alert_history', 365, true),
  ('admin_logs', 730, true),
  ('test_payins', 30, false),
  ('test_payouts', 30, false)
ON CONFLICT (table_name) DO NOTHING;

-- ════════════════════════════════════════════
-- 16. ANOMALY DETECTION
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

CREATE INDEX IF NOT EXISTS idx_anomalies_type ON anomalies(anomaly_type);
CREATE INDEX IF NOT EXISTS idx_anomalies_status ON anomalies(status);
CREATE INDEX IF NOT EXISTS idx_anomalies_created ON anomalies(created_at DESC);
ALTER TABLE anomalies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_anomalies ON anomalies;
CREATE POLICY admin_all_anomalies ON anomalies FOR ALL USING (public.user_role() = 'admin');

-- ════════════════════════════════════════════
-- 17. TRANSACTION EXPORT
-- ════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  export_type TEXT NOT NULL,
  
  filters JSONB NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_exports_user ON export_jobs(requested_by);
CREATE INDEX IF NOT EXISTS idx_exports_merchant ON export_jobs(merchant_id);
ALTER TABLE export_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_exports ON export_jobs;
CREATE POLICY admin_all_exports ON export_jobs FOR ALL USING (public.user_role() = 'admin');

DROP POLICY IF EXISTS merchant_own_exports ON export_jobs;
CREATE POLICY merchant_own_exports ON export_jobs FOR ALL USING (
  merchant_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid())
);

-- ════════════════════════════════════════════
-- GRANTS FOR ENUM TYPES
-- ════════════════════════════════════════════

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
-- DONE!
-- ════════════════════════════════════════════
SELECT 'Enterprise migration complete!' as status;
