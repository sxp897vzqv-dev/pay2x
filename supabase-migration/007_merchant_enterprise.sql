-- ============================================
-- MERCHANT ENTERPRISE FEATURES
-- 007_merchant_enterprise.sql
-- ============================================

-- ============================================
-- 2FA / TOTP
-- ============================================
CREATE TABLE IF NOT EXISTS user_2fa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  secret TEXT NOT NULL,
  backup_codes TEXT[], -- Array of hashed backup codes
  is_enabled BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

CREATE INDEX idx_user_2fa_user ON user_2fa(user_id);

-- ============================================
-- TEAM MEMBERS
-- ============================================
CREATE TYPE team_role AS ENUM ('owner', 'admin', 'developer', 'viewer');

CREATE TABLE IF NOT EXISTS merchant_team (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  role team_role NOT NULL DEFAULT 'viewer',
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  permissions JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_merchant_team_merchant ON merchant_team(merchant_id);
CREATE INDEX idx_merchant_team_user ON merchant_team(user_id);
CREATE INDEX idx_merchant_team_email ON merchant_team(email);

-- ============================================
-- IP WHITELIST
-- ============================================
CREATE TABLE IF NOT EXISTS ip_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  ip_address INET NOT NULL,
  label TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  UNIQUE(merchant_id, ip_address)
);

CREATE INDEX idx_ip_whitelist_merchant ON ip_whitelist(merchant_id);

-- ============================================
-- USER SESSIONS
-- ============================================
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token TEXT UNIQUE NOT NULL,
  ip_address INET,
  user_agent TEXT,
  device_info JSONB,
  location TEXT,
  is_active BOOLEAN DEFAULT true,
  last_activity_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_active ON user_sessions(user_id, is_active) WHERE is_active = true;

-- ============================================
-- ACTIVITY LOG
-- ============================================
CREATE TABLE IF NOT EXISTS merchant_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT,
  action TEXT NOT NULL,
  resource_type TEXT, -- 'api_key', 'team_member', 'webhook', 'settings', etc.
  resource_id TEXT,
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_merchant_activity_merchant ON merchant_activity_log(merchant_id);
CREATE INDEX idx_merchant_activity_created ON merchant_activity_log(created_at DESC);
CREATE INDEX idx_merchant_activity_action ON merchant_activity_log(action);

-- ============================================
-- WEBHOOK LOGS
-- ============================================
CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  payin_id UUID REFERENCES payins(id),
  payout_id UUID REFERENCES payouts(id),
  event_type TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  request_headers JSONB,
  request_body JSONB,
  response_status INTEGER,
  response_body TEXT,
  response_time_ms INTEGER,
  attempt_number INTEGER DEFAULT 1,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'retrying')),
  error_message TEXT,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_webhook_logs_merchant ON webhook_logs(merchant_id);
CREATE INDEX idx_webhook_logs_status ON webhook_logs(status);
CREATE INDEX idx_webhook_logs_created ON webhook_logs(created_at DESC);
CREATE INDEX idx_webhook_logs_payin ON webhook_logs(payin_id) WHERE payin_id IS NOT NULL;

-- ============================================
-- PAYMENT LINKS
-- ============================================
CREATE TABLE IF NOT EXISTS payment_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  code TEXT UNIQUE NOT NULL, -- Short code for URL
  amount DECIMAL(15,2),
  currency TEXT DEFAULT 'INR',
  description TEXT,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  redirect_url TEXT,
  metadata JSONB,
  is_active BOOLEAN DEFAULT true,
  is_single_use BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  payin_id UUID REFERENCES payins(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_payment_links_merchant ON payment_links(merchant_id);
CREATE INDEX idx_payment_links_code ON payment_links(code);
CREATE INDEX idx_payment_links_active ON payment_links(is_active) WHERE is_active = true;

-- ============================================
-- API KEYS (Extended)
-- ============================================
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS test_api_key TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS test_mode BOOLEAN DEFAULT false;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS api_key_expires_at TIMESTAMPTZ;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS old_api_key TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS old_api_key_expires_at TIMESTAMPTZ;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS ip_whitelist_enabled BOOLEAN DEFAULT false;

-- ============================================
-- API STATS (Daily aggregates)
-- ============================================
CREATE TABLE IF NOT EXISTS merchant_api_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_requests INTEGER DEFAULT 0,
  successful_requests INTEGER DEFAULT 0,
  failed_requests INTEGER DEFAULT 0,
  avg_latency_ms INTEGER DEFAULT 0,
  payin_count INTEGER DEFAULT 0,
  payin_volume DECIMAL(15,2) DEFAULT 0,
  payout_count INTEGER DEFAULT 0,
  payout_volume DECIMAL(15,2) DEFAULT 0,
  webhook_sent INTEGER DEFAULT 0,
  webhook_failed INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(merchant_id, date)
);

CREATE INDEX idx_merchant_api_stats_merchant ON merchant_api_stats(merchant_id);
CREATE INDEX idx_merchant_api_stats_date ON merchant_api_stats(date DESC);

-- ============================================
-- REFUNDS
-- ============================================
CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  payin_id UUID NOT NULL REFERENCES payins(id),
  amount DECIMAL(15,2) NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'processed', 'failed')),
  requested_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  processed_at TIMESTAMPTZ,
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_refunds_merchant ON refunds(merchant_id);
CREATE INDEX idx_refunds_payin ON refunds(payin_id);
CREATE INDEX idx_refunds_status ON refunds(status);

-- ============================================
-- PAYOUT REQUESTS (Merchant withdrawals)
-- ============================================
CREATE TABLE IF NOT EXISTS merchant_payout_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  amount DECIMAL(15,2) NOT NULL,
  bank_name TEXT,
  account_number TEXT,
  ifsc_code TEXT,
  account_holder TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'processing', 'completed', 'failed')),
  requested_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  processed_at TIMESTAMPTZ,
  utr TEXT,
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_merchant_payout_requests_merchant ON merchant_payout_requests(merchant_id);
CREATE INDEX idx_merchant_payout_requests_status ON merchant_payout_requests(status);

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE user_2fa ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_team ENABLE ROW LEVEL SECURITY;
ALTER TABLE ip_whitelist ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_api_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_payout_requests ENABLE ROW LEVEL SECURITY;

-- Users can manage their own 2FA
CREATE POLICY user_2fa_own ON user_2fa FOR ALL USING (auth.uid() = user_id);

-- Merchants can see their team
CREATE POLICY merchant_team_access ON merchant_team FOR ALL 
  USING (merchant_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid())
    OR user_id = auth.uid());

-- Merchants can manage their IP whitelist
CREATE POLICY ip_whitelist_merchant ON ip_whitelist FOR ALL 
  USING (merchant_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid()));

-- Users can see their own sessions
CREATE POLICY user_sessions_own ON user_sessions FOR ALL USING (auth.uid() = user_id);

-- Merchants can see their activity log
CREATE POLICY merchant_activity_access ON merchant_activity_log FOR SELECT 
  USING (merchant_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid()));

-- Merchants can see their webhook logs
CREATE POLICY webhook_logs_merchant ON webhook_logs FOR SELECT 
  USING (merchant_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid()));

-- Merchants can manage their payment links
CREATE POLICY payment_links_merchant ON payment_links FOR ALL 
  USING (merchant_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid()));

-- Merchants can see their API stats
CREATE POLICY merchant_api_stats_access ON merchant_api_stats FOR SELECT 
  USING (merchant_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid()));

-- Merchants can manage refunds
CREATE POLICY refunds_merchant ON refunds FOR ALL 
  USING (merchant_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid()));

-- Merchants can manage payout requests
CREATE POLICY merchant_payout_requests_access ON merchant_payout_requests FOR ALL 
  USING (merchant_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid()));

-- Admin full access
CREATE POLICY admin_user_2fa ON user_2fa FOR ALL 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY admin_merchant_team ON merchant_team FOR ALL 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY admin_ip_whitelist ON ip_whitelist FOR ALL 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY admin_user_sessions ON user_sessions FOR ALL 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY admin_merchant_activity ON merchant_activity_log FOR ALL 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY admin_webhook_logs ON webhook_logs FOR ALL 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY admin_payment_links ON payment_links FOR ALL 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY admin_merchant_api_stats ON merchant_api_stats FOR ALL 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY admin_refunds ON refunds FOR ALL 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY admin_merchant_payout_requests ON merchant_payout_requests FOR ALL 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Service role bypass
CREATE POLICY service_user_2fa ON user_2fa FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_merchant_team ON merchant_team FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_ip_whitelist ON ip_whitelist FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_user_sessions ON user_sessions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_merchant_activity ON merchant_activity_log FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_webhook_logs ON webhook_logs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_payment_links ON payment_links FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_merchant_api_stats ON merchant_api_stats FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_refunds ON refunds FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_merchant_payout_requests ON merchant_payout_requests FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Generate short code for payment links
CREATE OR REPLACE FUNCTION generate_payment_link_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Log merchant activity
CREATE OR REPLACE FUNCTION log_merchant_activity(
  p_merchant_id UUID,
  p_user_id UUID,
  p_action TEXT,
  p_resource_type TEXT DEFAULT NULL,
  p_resource_id TEXT DEFAULT NULL,
  p_details JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
  v_email TEXT;
BEGIN
  SELECT email INTO v_email FROM profiles WHERE id = p_user_id;
  
  INSERT INTO merchant_activity_log (merchant_id, user_id, user_email, action, resource_type, resource_id, details)
  VALUES (p_merchant_id, p_user_id, v_email, p_action, p_resource_type, p_resource_id, p_details)
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;
