-- Pay2X Database Schema for Supabase
-- Migration from Firebase/Firestore

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE user_role AS ENUM ('admin', 'trader', 'merchant', 'worker');
CREATE TYPE payin_status AS ENUM ('pending', 'assigned', 'completed', 'failed', 'expired', 'rejected');
CREATE TYPE payout_status AS ENUM ('pending', 'assigned', 'processing', 'completed', 'failed', 'cancelled', 'rejected');
CREATE TYPE dispute_status AS ENUM ('pending', 'routed_to_trader', 'trader_accepted', 'trader_rejected', 'admin_approved', 'admin_rejected');
CREATE TYPE dispute_type AS ENUM ('payin', 'payout');
CREATE TYPE upi_status AS ENUM ('active', 'inactive', 'cooldown', 'maintenance');
CREATE TYPE bank_health_status AS ENUM ('healthy', 'degraded', 'down');
CREATE TYPE log_severity AS ENUM ('info', 'warning', 'error', 'critical');

-- ============================================
-- PROFILES (extends Supabase auth.users)
-- ============================================

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL,
  display_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- TRADERS
-- ============================================

CREATE TABLE traders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  telegram TEXT,
  
  -- Balance
  balance DECIMAL(15,2) DEFAULT 0,
  overall_commission DECIMAL(15,2) DEFAULT 0,
  
  -- Rates
  payin_commission DECIMAL(5,4) DEFAULT 0, -- e.g., 0.035 = 3.5%
  payout_commission DECIMAL(5,4) DEFAULT 0,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_online BOOLEAN DEFAULT false,
  last_online_at TIMESTAMPTZ,
  
  -- Payout engine stats
  success_rate DECIMAL(5,2) DEFAULT 0,
  avg_completion_time INTEGER DEFAULT 0, -- seconds
  active_payouts INTEGER DEFAULT 0,
  cancel_rate DECIMAL(5,2) DEFAULT 0,
  priority INTEGER DEFAULT 5,
  
  -- Daily stats (reset at midnight)
  daily_completed INTEGER DEFAULT 0,
  daily_volume DECIMAL(15,2) DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- MERCHANTS
-- ============================================

CREATE TABLE merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  business_name TEXT,
  website TEXT,
  
  -- API
  live_api_key TEXT UNIQUE,
  webhook_url TEXT,
  webhook_secret TEXT,
  
  -- Balance
  balance DECIMAL(15,2) DEFAULT 0,
  
  -- Rates
  payin_commission DECIMAL(5,4) DEFAULT 0,
  payout_commission DECIMAL(5,4) DEFAULT 0,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- WORKERS (sub-admins)
-- ============================================

CREATE TABLE workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  permissions TEXT[] DEFAULT '{}', -- array of permission keys
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- UPI POOL
-- ============================================

CREATE TABLE upi_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id UUID NOT NULL REFERENCES traders(id) ON DELETE CASCADE,
  upi_id TEXT NOT NULL,
  holder_name TEXT,
  bank_name TEXT,
  ifsc TEXT,
  
  -- Status
  status upi_status DEFAULT 'active',
  
  -- Limits
  daily_limit DECIMAL(15,2) DEFAULT 100000,
  per_transaction_limit DECIMAL(15,2) DEFAULT 50000,
  min_amount DECIMAL(15,2) DEFAULT 100,
  
  -- Stats (reset daily)
  daily_volume DECIMAL(15,2) DEFAULT 0,
  daily_count INTEGER DEFAULT 0,
  daily_success INTEGER DEFAULT 0,
  daily_failed INTEGER DEFAULT 0,
  
  -- Lifetime stats
  total_volume DECIMAL(15,2) DEFAULT 0,
  total_count INTEGER DEFAULT 0,
  total_success INTEGER DEFAULT 0,
  total_failed INTEGER DEFAULT 0,
  success_rate DECIMAL(5,2) DEFAULT 100,
  
  -- Cooldown
  last_used_at TIMESTAMPTZ,
  hourly_failures INTEGER DEFAULT 0,
  
  -- Scoring
  amount_tier TEXT DEFAULT 'medium', -- low, medium, high
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- SAVED BANKS (permanent trader bank records)
-- ============================================

CREATE TABLE saved_banks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id UUID NOT NULL REFERENCES traders(id) ON DELETE CASCADE,
  upi_id TEXT NOT NULL,
  holder_name TEXT,
  bank_name TEXT,
  ifsc TEXT,
  type TEXT DEFAULT 'upi', -- upi, bank
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(trader_id, upi_id, type)
);

-- ============================================
-- PAYINS
-- ============================================

CREATE TABLE payins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- External reference
  order_id TEXT, -- merchant's order ID
  txn_id TEXT UNIQUE, -- our transaction ID
  
  -- Parties
  merchant_id UUID REFERENCES merchants(id),
  trader_id UUID REFERENCES traders(id),
  upi_pool_id UUID REFERENCES upi_pool(id),
  
  -- Amount
  amount DECIMAL(15,2) NOT NULL,
  commission DECIMAL(15,2) DEFAULT 0,
  
  -- UPI details (snapshot at assignment time)
  assigned_upi TEXT,
  assigned_upi_name TEXT,
  
  -- Customer info
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  
  -- Status
  status payin_status DEFAULT 'pending',
  utr TEXT, -- UTR number after payment
  
  -- Timestamps
  assigned_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  
  -- Webhook
  webhook_sent BOOLEAN DEFAULT false,
  webhook_response TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- PAYOUT REQUESTS
-- ============================================

CREATE TABLE payout_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID REFERENCES merchants(id),
  amount DECIMAL(15,2) NOT NULL,
  
  -- Beneficiary
  account_name TEXT,
  account_number TEXT,
  ifsc TEXT,
  upi_id TEXT,
  
  status TEXT DEFAULT 'pending', -- pending, approved, rejected
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- PAYOUTS
-- ============================================

CREATE TABLE payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- External reference
  payout_request_id UUID REFERENCES payout_requests(id),
  txn_id TEXT UNIQUE,
  
  -- Parties
  merchant_id UUID REFERENCES merchants(id),
  trader_id UUID REFERENCES traders(id),
  
  -- Amount
  amount DECIMAL(15,2) NOT NULL,
  commission DECIMAL(15,2) DEFAULT 0,
  
  -- Beneficiary details
  account_name TEXT,
  account_number TEXT,
  ifsc TEXT,
  upi_id TEXT,
  
  -- Status
  status payout_status DEFAULT 'pending',
  utr TEXT,
  
  -- Timestamps
  assigned_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- DISPUTES
-- ============================================

CREATE TABLE disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Reference
  type dispute_type NOT NULL,
  payin_id UUID REFERENCES payins(id),
  payout_id UUID REFERENCES payouts(id),
  
  -- Parties
  merchant_id UUID REFERENCES merchants(id),
  trader_id UUID REFERENCES traders(id),
  
  -- Details
  amount DECIMAL(15,2) NOT NULL,
  reason TEXT,
  description TEXT,
  
  -- Status
  status dispute_status DEFAULT 'pending',
  
  -- Trader response
  trader_response TEXT, -- 'received' / 'not_received'
  trader_proof_url TEXT,
  trader_statement TEXT,
  trader_responded_at TIMESTAMPTZ,
  
  -- Admin decision
  admin_decision TEXT,
  admin_note TEXT,
  admin_resolved_by UUID REFERENCES profiles(id),
  admin_resolved_at TIMESTAMPTZ,
  
  -- Balance adjustment
  balance_adjusted BOOLEAN DEFAULT false,
  adjustment_amount DECIMAL(15,2),
  
  -- SLA
  sla_deadline TIMESTAMPTZ,
  is_escalated BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- DISPUTE MESSAGES
-- ============================================

CREATE TABLE dispute_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL, -- 'merchant', 'trader', 'admin'
  sender_name TEXT,
  message TEXT NOT NULL,
  attachment_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- BANK HEALTH
-- ============================================

CREATE TABLE bank_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name TEXT NOT NULL UNIQUE,
  status bank_health_status DEFAULT 'healthy',
  success_rate DECIMAL(5,2) DEFAULT 100,
  avg_response_time INTEGER DEFAULT 0,
  last_checked_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- ENGINE SELECTION LOGS
-- ============================================

CREATE TABLE payin_selection_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payin_id UUID REFERENCES payins(id),
  amount DECIMAL(15,2),
  selected_upi_id UUID REFERENCES upi_pool(id),
  selected_upi TEXT,
  selected_trader_id UUID REFERENCES traders(id),
  score DECIMAL(8,4),
  scores JSONB, -- all scored UPIs with breakdown
  attempt INTEGER DEFAULT 1,
  fallback BOOLEAN DEFAULT false,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE payout_selection_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID REFERENCES payouts(id),
  amount DECIMAL(15,2),
  selected_trader_id UUID REFERENCES traders(id),
  selected_trader_name TEXT,
  score DECIMAL(8,4),
  scores JSONB,
  reasons JSONB, -- human-readable reasoning
  attempt INTEGER DEFAULT 1,
  fallback BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE dispute_engine_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID REFERENCES disputes(id),
  event_type TEXT NOT NULL, -- 'routing', 'trader_response', 'admin_resolution'
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- ADMIN AUDIT LOGS
-- ============================================

CREATE TABLE admin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  category TEXT,
  entity_type TEXT,
  entity_id TEXT,
  entity_name TEXT,
  performed_by UUID REFERENCES profiles(id),
  performed_by_name TEXT,
  performed_by_role TEXT,
  performed_by_ip INET,
  details JSONB DEFAULT '{}',
  balance_before DECIMAL(15,2),
  balance_after DECIMAL(15,2),
  severity log_severity DEFAULT 'info',
  requires_review BOOLEAN DEFAULT false,
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- SYSTEM CONFIG (key-value store)
-- ============================================

CREATE TABLE system_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default engine configs
INSERT INTO system_config (key, value) VALUES 
('engine_config', '{
  "weights": {
    "successRate": 25,
    "dailyLimitLeft": 20,
    "cooldown": 15,
    "amountMatch": 15,
    "traderBalance": 10,
    "bankHealth": 5,
    "timeWindow": 5,
    "recentFailures": 5
  },
  "enableRandomness": true,
  "scoreExponent": 2,
  "maxFallbackAttempts": 3,
  "cooldownMinutes": 5
}'),
('payout_engine_config', '{
  "weights": {
    "successRate": 25,
    "speed": 20,
    "currentLoad": 15,
    "cancelRate": 15,
    "cooldown": 10,
    "amountTierMatch": 5,
    "onlineStatus": 5,
    "priority": 5
  },
  "enableRandomness": true,
  "scoreExponent": 2,
  "minScoreThreshold": 10,
  "maxActivePayouts": 5
}'),
('dispute_engine_config', '{
  "slaHours": 24,
  "autoEscalateAfterHours": 48,
  "maxDisputeAmount": 100000,
  "routingPriority": ["savedBanks", "payin", "utrMatch", "upiPool"]
}');

-- ============================================
-- INDEXES
-- ============================================

-- Payins
CREATE INDEX idx_payins_status ON payins(status);
CREATE INDEX idx_payins_merchant ON payins(merchant_id);
CREATE INDEX idx_payins_trader ON payins(trader_id);
CREATE INDEX idx_payins_created ON payins(created_at DESC);
CREATE INDEX idx_payins_txn_id ON payins(txn_id);

-- Payouts
CREATE INDEX idx_payouts_status ON payouts(status);
CREATE INDEX idx_payouts_merchant ON payouts(merchant_id);
CREATE INDEX idx_payouts_trader ON payouts(trader_id);
CREATE INDEX idx_payouts_created ON payouts(created_at DESC);

-- Disputes
CREATE INDEX idx_disputes_status ON disputes(status);
CREATE INDEX idx_disputes_trader ON disputes(trader_id);
CREATE INDEX idx_disputes_merchant ON disputes(merchant_id);
CREATE INDEX idx_disputes_created ON disputes(created_at DESC);

-- UPI Pool
CREATE INDEX idx_upi_pool_trader ON upi_pool(trader_id);
CREATE INDEX idx_upi_pool_status ON upi_pool(status);
CREATE INDEX idx_upi_pool_active ON upi_pool(status) WHERE status = 'active';

-- Saved Banks
CREATE INDEX idx_saved_banks_trader ON saved_banks(trader_id);
CREATE INDEX idx_saved_banks_upi ON saved_banks(upi_id);

-- Logs
CREATE INDEX idx_admin_logs_created ON admin_logs(created_at DESC);
CREATE INDEX idx_admin_logs_action ON admin_logs(action);
CREATE INDEX idx_payin_selection_created ON payin_selection_logs(created_at DESC);
CREATE INDEX idx_payout_selection_created ON payout_selection_logs(created_at DESC);

-- Profiles
CREATE INDEX idx_profiles_role ON profiles(role);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_traders_updated BEFORE UPDATE ON traders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_merchants_updated BEFORE UPDATE ON merchants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_payins_updated BEFORE UPDATE ON payins FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_payouts_updated BEFORE UPDATE ON payouts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_disputes_updated BEFORE UPDATE ON disputes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_upi_pool_updated BEFORE UPDATE ON upi_pool FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_profiles_updated BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE traders ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE payins ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispute_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE upi_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE payin_selection_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_selection_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispute_engine_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

-- Helper function: get user role (in public schema, not auth)
CREATE OR REPLACE FUNCTION public.user_role()
RETURNS user_role AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role'),
    'merchant'
  )::user_role;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ADMIN: can do everything
CREATE POLICY admin_all_profiles ON profiles FOR ALL USING (public.user_role() = 'admin');
CREATE POLICY admin_all_traders ON traders FOR ALL USING (public.user_role() = 'admin');
CREATE POLICY admin_all_merchants ON merchants FOR ALL USING (public.user_role() = 'admin');
CREATE POLICY admin_all_workers ON workers FOR ALL USING (public.user_role() = 'admin');
CREATE POLICY admin_all_payins ON payins FOR ALL USING (public.user_role() = 'admin');
CREATE POLICY admin_all_payouts ON payouts FOR ALL USING (public.user_role() = 'admin');
CREATE POLICY admin_all_payout_req ON payout_requests FOR ALL USING (public.user_role() = 'admin');
CREATE POLICY admin_all_disputes ON disputes FOR ALL USING (public.user_role() = 'admin');
CREATE POLICY admin_all_disp_msgs ON dispute_messages FOR ALL USING (public.user_role() = 'admin');
CREATE POLICY admin_all_upi ON upi_pool FOR ALL USING (public.user_role() = 'admin');
CREATE POLICY admin_all_banks ON saved_banks FOR ALL USING (public.user_role() = 'admin');
CREATE POLICY admin_all_bank_health ON bank_health FOR ALL USING (public.user_role() = 'admin');
CREATE POLICY admin_all_payin_logs ON payin_selection_logs FOR ALL USING (public.user_role() = 'admin');
CREATE POLICY admin_all_payout_logs ON payout_selection_logs FOR ALL USING (public.user_role() = 'admin');
CREATE POLICY admin_all_disp_logs ON dispute_engine_logs FOR ALL USING (public.user_role() = 'admin');
CREATE POLICY admin_all_audit ON admin_logs FOR ALL USING (public.user_role() = 'admin');
CREATE POLICY admin_all_config ON system_config FOR ALL USING (public.user_role() = 'admin');

-- TRADER: own data only
CREATE POLICY trader_own_profile ON profiles FOR SELECT USING (
  public.user_role() = 'trader' AND id = auth.uid()
);
CREATE POLICY trader_own_trader ON traders FOR SELECT USING (
  public.user_role() = 'trader' AND profile_id = auth.uid()
);
CREATE POLICY trader_own_payins ON payins FOR SELECT USING (
  public.user_role() = 'trader' AND trader_id IN (
    SELECT id FROM traders WHERE profile_id = auth.uid()
  )
);
CREATE POLICY trader_own_payouts ON payouts FOR SELECT USING (
  public.user_role() = 'trader' AND trader_id IN (
    SELECT id FROM traders WHERE profile_id = auth.uid()
  )
);
CREATE POLICY trader_own_disputes ON disputes FOR SELECT USING (
  public.user_role() = 'trader' AND trader_id IN (
    SELECT id FROM traders WHERE profile_id = auth.uid()
  )
);
CREATE POLICY trader_own_upi ON upi_pool FOR ALL USING (
  public.user_role() = 'trader' AND trader_id IN (
    SELECT id FROM traders WHERE profile_id = auth.uid()
  )
);
CREATE POLICY trader_own_banks ON saved_banks FOR ALL USING (
  public.user_role() = 'trader' AND trader_id IN (
    SELECT id FROM traders WHERE profile_id = auth.uid()
  )
);
CREATE POLICY trader_own_disp_msgs ON dispute_messages FOR SELECT USING (
  public.user_role() = 'trader' AND dispute_id IN (
    SELECT id FROM disputes WHERE trader_id IN (
      SELECT id FROM traders WHERE profile_id = auth.uid()
    )
  )
);

-- MERCHANT: own data only
CREATE POLICY merchant_own_profile ON profiles FOR SELECT USING (
  public.user_role() = 'merchant' AND id = auth.uid()
);
CREATE POLICY merchant_own_merchant ON merchants FOR SELECT USING (
  public.user_role() = 'merchant' AND profile_id = auth.uid()
);
CREATE POLICY merchant_own_payins ON payins FOR SELECT USING (
  public.user_role() = 'merchant' AND merchant_id IN (
    SELECT id FROM merchants WHERE profile_id = auth.uid()
  )
);
CREATE POLICY merchant_own_payouts ON payouts FOR SELECT USING (
  public.user_role() = 'merchant' AND merchant_id IN (
    SELECT id FROM merchants WHERE profile_id = auth.uid()
  )
);
CREATE POLICY merchant_own_disputes ON disputes FOR ALL USING (
  public.user_role() = 'merchant' AND merchant_id IN (
    SELECT id FROM merchants WHERE profile_id = auth.uid()
  )
);
CREATE POLICY merchant_own_disp_msgs ON dispute_messages FOR ALL USING (
  public.user_role() = 'merchant' AND dispute_id IN (
    SELECT id FROM disputes WHERE merchant_id IN (
      SELECT id FROM merchants WHERE profile_id = auth.uid()
    )
  )
);

-- WORKER: based on permissions (handled in app layer, select-only)
CREATE POLICY worker_read_profiles ON profiles FOR SELECT USING (public.user_role() = 'worker');
CREATE POLICY worker_read_traders ON traders FOR SELECT USING (public.user_role() = 'worker');
CREATE POLICY worker_read_merchants ON merchants FOR SELECT USING (public.user_role() = 'worker');
CREATE POLICY worker_read_payins ON payins FOR SELECT USING (public.user_role() = 'worker');
CREATE POLICY worker_read_payouts ON payouts FOR SELECT USING (public.user_role() = 'worker');
CREATE POLICY worker_read_disputes ON disputes FOR SELECT USING (public.user_role() = 'worker');
CREATE POLICY worker_read_upi ON upi_pool FOR SELECT USING (public.user_role() = 'worker');
CREATE POLICY worker_read_logs ON admin_logs FOR SELECT USING (public.user_role() = 'worker');
