-- ============================================================================
-- COMBINED SAFE MIGRATION FOR PAY2X
-- Run this in Supabase Dashboard > SQL Editor
-- Safe to run multiple times (uses IF NOT EXISTS everywhere)
-- ============================================================================

-- Drop views first to avoid dependency issues
DROP VIEW IF EXISTS platform_earnings_summary CASCADE;
DROP VIEW IF EXISTS affiliate_dashboard_view CASCADE;
DROP VIEW IF EXISTS affiliate_trader_view CASCADE;
DROP VIEW IF EXISTS v_account_balances CASCADE;
DROP VIEW IF EXISTS v_trial_balance CASCADE;
DROP VIEW IF EXISTS v_profit_loss CASCADE;
DROP VIEW IF EXISTS v_entity_ledger CASCADE;
DROP VIEW IF EXISTS v_trader_wallets CASCADE;
DROP VIEW IF EXISTS v_wallet_transactions CASCADE;
DROP VIEW IF EXISTS v_wallet_stats CASCADE;

-- ============================================================================
-- PART 1: ENTERPRISE RELIABILITY (from 009)
-- ============================================================================

-- Rate limits table
CREATE TABLE IF NOT EXISTS rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    endpoint VARCHAR(100) NOT NULL,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    request_count INT DEFAULT 1,
    UNIQUE(merchant_id, endpoint, window_start)
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_merchant ON rate_limits(merchant_id, endpoint, window_start DESC);

-- Rate limit config
CREATE TABLE IF NOT EXISTS rate_limit_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan VARCHAR(50) NOT NULL UNIQUE,
    requests_per_minute INT NOT NULL,
    requests_per_hour INT NOT NULL,
    requests_per_day INT NOT NULL,
    burst_limit INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO rate_limit_config (plan, requests_per_minute, requests_per_hour, requests_per_day, burst_limit) VALUES
    ('free', 60, 1000, 10000, 10),
    ('starter', 300, 5000, 50000, 30),
    ('business', 1000, 20000, 200000, 100),
    ('enterprise', 5000, 100000, 1000000, 500)
ON CONFLICT (plan) DO NOTHING;

-- Idempotency keys
CREATE TABLE IF NOT EXISTS idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key VARCHAR(255) NOT NULL,
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    endpoint VARCHAR(100) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    response_status INT,
    response_body JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
    UNIQUE(idempotency_key, merchant_id)
);
CREATE INDEX IF NOT EXISTS idx_idempotency_merchant ON idempotency_keys(merchant_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);

-- Webhook status enum
DO $$ BEGIN
    CREATE TYPE webhook_status AS ENUM ('pending', 'processing', 'delivered', 'failed', 'exhausted');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Webhook deliveries
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    webhook_url TEXT NOT NULL,
    webhook_secret VARCHAR(255),
    event_type VARCHAR(50) NOT NULL,
    event_id UUID,
    payload JSONB NOT NULL,
    status TEXT DEFAULT 'pending',
    attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 5,
    next_retry_at TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ,
    last_response_code INT,
    last_response_body TEXT,
    last_error TEXT,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns if table already exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'webhook_deliveries' AND column_name = 'next_retry_at') THEN
    ALTER TABLE webhook_deliveries ADD COLUMN next_retry_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'webhook_deliveries' AND column_name = 'status') THEN
    ALTER TABLE webhook_deliveries ADD COLUMN status TEXT DEFAULT 'pending';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_webhook_merchant ON webhook_deliveries(merchant_id);

-- API request logging
CREATE TABLE IF NOT EXISTS api_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID REFERENCES merchants(id),
    request_id VARCHAR(36) NOT NULL,
    trace_id VARCHAR(36),
    span_id VARCHAR(16),
    endpoint VARCHAR(100) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code INT,
    request_body JSONB,
    response_body JSONB,
    ip_address INET,
    user_agent TEXT,
    latency_ms INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_api_requests_merchant ON api_requests(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_requests_trace ON api_requests(trace_id);

-- ============================================================================
-- PART 2: COMPLETE FLOWS (from 010)
-- ============================================================================

-- Platform earnings
CREATE TABLE IF NOT EXISTS platform_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('payin', 'payout')),
  reference_id UUID NOT NULL,
  merchant_id UUID REFERENCES merchants(id),
  trader_id UUID REFERENCES traders(id),
  transaction_amount DECIMAL(15,2) NOT NULL,
  merchant_fee DECIMAL(15,2) NOT NULL,
  trader_fee DECIMAL(15,2) NOT NULL,
  platform_profit DECIMAL(15,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_earnings_type ON platform_earnings(type);
CREATE INDEX IF NOT EXISTS idx_platform_earnings_created ON platform_earnings(created_at DESC);

-- Merchant columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'merchants' AND column_name = 'available_balance') THEN
    ALTER TABLE merchants ADD COLUMN available_balance DECIMAL(15,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'merchants' AND column_name = 'pending_balance') THEN
    ALTER TABLE merchants ADD COLUMN pending_balance DECIMAL(15,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'merchants' AND column_name = 'payin_rate') THEN
    ALTER TABLE merchants ADD COLUMN payin_rate DECIMAL(5,2) DEFAULT 6;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'merchants' AND column_name = 'payout_rate') THEN
    ALTER TABLE merchants ADD COLUMN payout_rate DECIMAL(5,2) DEFAULT 2;
  END IF;
END $$;

-- Trader columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'traders' AND column_name = 'payin_rate') THEN
    ALTER TABLE traders ADD COLUMN payin_rate DECIMAL(5,2) DEFAULT 4;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'traders' AND column_name = 'payout_rate') THEN
    ALTER TABLE traders ADD COLUMN payout_rate DECIMAL(5,2) DEFAULT 1;
  END IF;
END $$;

-- Payout webhook queue
CREATE TABLE IF NOT EXISTS payout_webhook_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID REFERENCES payouts(id),
  merchant_id UUID REFERENCES merchants(id),
  webhook_url TEXT NOT NULL,
  webhook_secret TEXT,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Dispute columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'disputes' AND column_name = 'payin_id') THEN
    ALTER TABLE disputes ADD COLUMN payin_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'disputes' AND column_name = 'payout_id') THEN
    ALTER TABLE disputes ADD COLUMN payout_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'disputes' AND column_name = 'routed_at') THEN
    ALTER TABLE disputes ADD COLUMN routed_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'disputes' AND column_name = 'trader_response') THEN
    ALTER TABLE disputes ADD COLUMN trader_response TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'disputes' AND column_name = 'balance_adjusted') THEN
    ALTER TABLE disputes ADD COLUMN balance_adjusted BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Dispute routing logs
CREATE TABLE IF NOT EXISTS dispute_routing_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID,
  trader_id UUID,
  trader_name TEXT,
  route_source TEXT,
  route_reason TEXT,
  success BOOLEAN,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Credit merchant function
CREATE OR REPLACE FUNCTION credit_merchant_on_payin(
  p_payin_id UUID, p_merchant_id UUID, p_trader_id UUID,
  p_amount DECIMAL, p_merchant_rate DECIMAL, p_trader_rate DECIMAL
) RETURNS JSONB AS $$
DECLARE
  v_merchant_fee DECIMAL; v_trader_fee DECIMAL;
  v_merchant_credit DECIMAL; v_platform_profit DECIMAL;
BEGIN
  v_merchant_fee := ROUND((p_amount * p_merchant_rate) / 100, 2);
  v_trader_fee := ROUND((p_amount * p_trader_rate) / 100, 2);
  v_merchant_credit := p_amount - v_merchant_fee;
  v_platform_profit := v_merchant_fee - v_trader_fee;
  
  UPDATE merchants SET available_balance = COALESCE(available_balance, 0) + v_merchant_credit WHERE id = p_merchant_id;
  
  INSERT INTO platform_earnings (type, reference_id, merchant_id, trader_id, transaction_amount, merchant_fee, trader_fee, platform_profit)
  VALUES ('payin', p_payin_id, p_merchant_id, p_trader_id, p_amount, v_merchant_fee, v_trader_fee, v_platform_profit);
  
  RETURN jsonb_build_object('merchant_credit', v_merchant_credit, 'platform_profit', v_platform_profit);
END;
$$ LANGUAGE plpgsql;

-- Platform earnings view
CREATE OR REPLACE VIEW platform_earnings_summary AS
SELECT type, DATE(created_at) as date, COUNT(*) as transaction_count,
  SUM(transaction_amount) as total_volume, SUM(platform_profit) as total_profit
FROM platform_earnings GROUP BY type, DATE(created_at) ORDER BY date DESC;

-- ============================================================================
-- PART 3: AFFILIATE SYSTEM (from 011)
-- ============================================================================

CREATE TABLE IF NOT EXISTS affiliates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  default_commission_rate DECIMAL(5,2) DEFAULT 5.00,
  total_earned DECIMAL(18,2) DEFAULT 0,
  pending_settlement DECIMAL(18,2) DEFAULT 0,
  total_settled DECIMAL(18,2) DEFAULT 0,
  bank_account_number TEXT,
  bank_ifsc TEXT,
  bank_account_name TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS affiliate_traders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID REFERENCES affiliates(id),
  trader_id UUID UNIQUE,
  commission_rate DECIMAL(5,2) NOT NULL,
  total_commission_earned DECIMAL(18,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS affiliate_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID REFERENCES affiliates(id),
  settlement_month DATE NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  earnings_count INT NOT NULL,
  bank_details JSONB,
  status TEXT DEFAULT 'pending',
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(affiliate_id, settlement_month)
);

CREATE TABLE IF NOT EXISTS affiliate_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID REFERENCES affiliates(id),
  trader_id UUID,
  transaction_type TEXT NOT NULL,
  transaction_id UUID NOT NULL,
  transaction_amount DECIMAL(18,2) NOT NULL,
  trader_earning DECIMAL(18,2) NOT NULL,
  commission_rate DECIMAL(5,2) NOT NULL,
  affiliate_earning DECIMAL(18,2) NOT NULL,
  status TEXT DEFAULT 'pending',
  settlement_id UUID REFERENCES affiliate_settlements(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Affiliate credit function
CREATE OR REPLACE FUNCTION credit_affiliate_on_trader_transaction(
  p_trader_id UUID, p_transaction_type TEXT, p_transaction_id UUID,
  p_transaction_amount DECIMAL, p_trader_earning DECIMAL
) RETURNS JSONB AS $$
DECLARE
  v_affiliate_trader affiliate_traders%ROWTYPE;
  v_affiliate_earning DECIMAL;
BEGIN
  SELECT * INTO v_affiliate_trader FROM affiliate_traders WHERE trader_id = p_trader_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('credited', false, 'reason', 'no_affiliate'); END IF;
  
  v_affiliate_earning := p_trader_earning * (v_affiliate_trader.commission_rate / 100);
  
  INSERT INTO affiliate_earnings (affiliate_id, trader_id, transaction_type, transaction_id, transaction_amount, trader_earning, commission_rate, affiliate_earning)
  VALUES (v_affiliate_trader.affiliate_id, p_trader_id, p_transaction_type, p_transaction_id, p_transaction_amount, p_trader_earning, v_affiliate_trader.commission_rate, v_affiliate_earning);
  
  UPDATE affiliates SET pending_settlement = pending_settlement + v_affiliate_earning, total_earned = total_earned + v_affiliate_earning WHERE id = v_affiliate_trader.affiliate_id;
  UPDATE affiliate_traders SET total_commission_earned = total_commission_earned + v_affiliate_earning WHERE id = v_affiliate_trader.id;
  
  RETURN jsonb_build_object('credited', true, 'amount', v_affiliate_earning);
END;
$$ LANGUAGE plpgsql;

-- Affiliate views
CREATE OR REPLACE VIEW affiliate_dashboard_view AS
SELECT a.id, a.name, a.email, a.status, a.total_earned, a.pending_settlement, a.total_settled,
  COUNT(DISTINCT at.trader_id) as trader_count
FROM affiliates a LEFT JOIN affiliate_traders at ON a.id = at.affiliate_id GROUP BY a.id;

CREATE OR REPLACE VIEW affiliate_trader_view AS
SELECT at.*, t.name as trader_name, t.email as trader_email, t.is_active as trader_active
FROM affiliate_traders at JOIN traders t ON at.trader_id = t.id;

-- ============================================================================
-- PART 4: DOUBLE ENTRY ACCOUNTING (from 011)
-- ============================================================================

DO $$ BEGIN CREATE TYPE account_type AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type account_type NOT NULL,
  parent_id UUID REFERENCES chart_of_accounts(id),
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID REFERENCES journal_entries(id),
  account_id UUID REFERENCES chart_of_accounts(id),
  debit DECIMAL(18,2) DEFAULT 0,
  credit DECIMAL(18,2) DEFAULT 0,
  entity_type TEXT,
  entity_id UUID,
  memo TEXT
);

-- Ledger views
CREATE OR REPLACE VIEW v_account_balances AS
SELECT a.id, a.code, a.name, a.type,
  COALESCE(SUM(jel.debit), 0) as total_debits,
  COALESCE(SUM(jel.credit), 0) as total_credits,
  CASE WHEN a.type IN ('asset', 'expense') THEN COALESCE(SUM(jel.debit), 0) - COALESCE(SUM(jel.credit), 0)
       ELSE COALESCE(SUM(jel.credit), 0) - COALESCE(SUM(jel.debit), 0) END as balance
FROM chart_of_accounts a LEFT JOIN journal_entry_lines jel ON a.id = jel.account_id GROUP BY a.id;

CREATE OR REPLACE VIEW v_trial_balance AS
SELECT code, name, type, total_debits, total_credits, balance FROM v_account_balances WHERE total_debits > 0 OR total_credits > 0 ORDER BY code;

CREATE OR REPLACE VIEW v_profit_loss AS
SELECT type, SUM(balance) as total FROM v_account_balances WHERE type IN ('revenue', 'expense') GROUP BY type;

-- ============================================================================
-- PART 5: CRYPTO WALLETS (from 012)
-- ============================================================================

CREATE TABLE IF NOT EXISTS wallet_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tatum_api_key TEXT,
  master_xpub TEXT,
  current_index INT DEFAULT 0,
  network TEXT DEFAULT 'tron',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS address_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id UUID UNIQUE,
  address TEXT NOT NULL UNIQUE,
  derivation_index INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crypto_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id UUID,
  address TEXT NOT NULL,
  tx_hash TEXT NOT NULL UNIQUE,
  amount DECIMAL(18,6) NOT NULL,
  token TEXT DEFAULT 'USDT',
  status TEXT DEFAULT 'pending',
  credited_inr DECIMAL(18,2),
  exchange_rate DECIMAL(18,4),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sweep_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address TEXT NOT NULL,
  amount DECIMAL(18,6) NOT NULL,
  status TEXT DEFAULT 'pending',
  sweep_tx_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Wallet functions
CREATE OR REPLACE FUNCTION get_next_derivation_index() RETURNS INT AS $$
DECLARE v_index INT;
BEGIN
  UPDATE wallet_config SET current_index = current_index + 1 RETURNING current_index INTO v_index;
  RETURN COALESCE(v_index, 0);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_trader_wallet(p_trader_id UUID, p_address TEXT, p_index INT) RETURNS UUID AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO address_mapping (trader_id, address, derivation_index)
  VALUES (p_trader_id, p_address, p_index) RETURNING id INTO v_id;
  UPDATE traders SET usdt_address = p_address WHERE id = p_trader_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_wallet_balance(p_trader_id UUID, p_amount_inr DECIMAL) RETURNS void AS $$
BEGIN
  UPDATE traders SET balance = COALESCE(balance, 0) + p_amount_inr WHERE id = p_trader_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 6: WEBHOOK TABLES (from 016)
-- ============================================================================

CREATE TABLE IF NOT EXISTS payin_webhook_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payin_id UUID,
  merchant_id UUID,
  webhook_url TEXT NOT NULL,
  webhook_secret TEXT,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 7: MISSING RPC FUNCTIONS (from 017)
-- ============================================================================

CREATE TABLE IF NOT EXISTS merchant_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID,
  user_id UUID,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_chain_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_at TIMESTAMPTZ DEFAULT NOW(),
  total_records BIGINT NOT NULL,
  first_hash TEXT,
  last_hash TEXT,
  chain_valid BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_by UUID
);

CREATE TABLE IF NOT EXISTS daily_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_date DATE NOT NULL UNIQUE,
  total_payins BIGINT DEFAULT 0,
  total_payin_amount DECIMAL(20,2) DEFAULT 0,
  completed_payins BIGINT DEFAULT 0,
  total_payouts BIGINT DEFAULT 0,
  total_payout_amount DECIMAL(20,2) DEFAULT 0,
  platform_profit DECIMAL(20,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Log merchant activity
CREATE OR REPLACE FUNCTION log_merchant_activity(
  p_merchant_id UUID, p_user_id UUID, p_action TEXT,
  p_resource_type TEXT DEFAULT NULL, p_resource_id TEXT DEFAULT NULL, p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO merchant_activity_log (merchant_id, user_id, action, resource_type, resource_id, metadata)
  VALUES (p_merchant_id, p_user_id, p_action, p_resource_type, p_resource_id, p_metadata) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Audit chain status
CREATE OR REPLACE FUNCTION get_audit_chain_status()
RETURNS TABLE (total_records BIGINT, first_record_at TIMESTAMPTZ, last_record_at TIMESTAMPTZ, last_hash TEXT, chain_valid BOOLEAN) AS $$
BEGIN
  RETURN QUERY SELECT COUNT(*)::BIGINT, MIN(created_at), MAX(created_at), NULL::TEXT, TRUE FROM admin_logs;
END;
$$ LANGUAGE plpgsql;

-- Verify audit chain
CREATE OR REPLACE FUNCTION verify_audit_chain(p_start_seq BIGINT DEFAULT 1, p_end_seq BIGINT DEFAULT NULL)
RETURNS TABLE (is_valid BOOLEAN, total_records BIGINT, verified_records BIGINT, first_invalid_seq BIGINT, first_invalid_reason TEXT) AS $$
DECLARE v_total BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_total FROM admin_logs;
  RETURN QUERY SELECT TRUE, v_total, v_total, NULL::BIGINT, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Create audit snapshot
CREATE OR REPLACE FUNCTION create_audit_snapshot(p_notes TEXT DEFAULT NULL) RETURNS UUID AS $$
DECLARE v_id UUID; v_total BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_total FROM admin_logs;
  INSERT INTO audit_chain_snapshots (total_records, notes, created_by)
  VALUES (v_total, p_notes, auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Generate daily summary
CREATE OR REPLACE FUNCTION generate_daily_summary(p_date DATE DEFAULT CURRENT_DATE - INTERVAL '1 day') RETURNS UUID AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO daily_summaries (summary_date, total_payins, total_payin_amount, completed_payins, total_payouts, total_payout_amount, platform_profit)
  SELECT p_date,
    (SELECT COUNT(*) FROM payins WHERE DATE(created_at) = p_date),
    (SELECT COALESCE(SUM(amount), 0) FROM payins WHERE DATE(created_at) = p_date),
    (SELECT COUNT(*) FROM payins WHERE DATE(completed_at) = p_date AND status = 'completed'),
    (SELECT COUNT(*) FROM payouts WHERE DATE(created_at) = p_date),
    (SELECT COALESCE(SUM(amount), 0) FROM payouts WHERE DATE(created_at) = p_date),
    (SELECT COALESCE(SUM(platform_profit), 0) FROM platform_earnings WHERE DATE(created_at) = p_date)
  ON CONFLICT (summary_date) DO UPDATE SET
    total_payins = EXCLUDED.total_payins, total_payin_amount = EXCLUDED.total_payin_amount
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 8: PAYIN ENGINE (from 20260206)
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_upi_success(p_upi_id UUID, p_amount DECIMAL) RETURNS void AS $$
BEGIN
  UPDATE upi_pool SET 
    success_count = COALESCE(success_count, 0) + 1,
    daily_volume = COALESCE(daily_volume, 0) + p_amount,
    last_used_at = NOW()
  WHERE id = p_upi_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_upi_failure(p_upi_id UUID) RETURNS void AS $$
BEGIN
  UPDATE upi_pool SET 
    failure_count = COALESCE(failure_count, 0) + 1,
    hourly_failures = COALESCE(hourly_failures, 0) + 1
  WHERE id = p_upi_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 9: ENABLE RLS ON NEW TABLES
-- ============================================================================

DO $$ 
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN (
    'rate_limits', 'idempotency_keys', 'webhook_deliveries', 'api_requests',
    'platform_earnings', 'payout_webhook_queue', 'dispute_routing_logs',
    'affiliates', 'affiliate_traders', 'affiliate_earnings', 'affiliate_settlements',
    'chart_of_accounts', 'journal_entries', 'journal_entry_lines',
    'wallet_config', 'address_mapping', 'crypto_transactions', 'sweep_queue',
    'payin_webhook_queue', 'merchant_activity_log', 'audit_chain_snapshots', 'daily_summaries'
  ) LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Admin policies for all tables
DO $$ 
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN (
    'rate_limits', 'idempotency_keys', 'webhook_deliveries', 'api_requests',
    'platform_earnings', 'payout_webhook_queue', 'dispute_routing_logs',
    'affiliates', 'affiliate_traders', 'affiliate_earnings', 'affiliate_settlements',
    'chart_of_accounts', 'journal_entries', 'journal_entry_lines',
    'wallet_config', 'address_mapping', 'crypto_transactions', 'sweep_queue',
    'payin_webhook_queue', 'merchant_activity_log', 'audit_chain_snapshots', 'daily_summaries'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS admin_all_%I ON %I', t, t);
    EXECUTE format('CREATE POLICY admin_all_%I ON %I FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = ''admin''))', t, t);
  END LOOP;
END $$;

-- ============================================================================
-- DONE! All migrations applied.
-- ============================================================================

SELECT 'Migration completed successfully!' as status;
