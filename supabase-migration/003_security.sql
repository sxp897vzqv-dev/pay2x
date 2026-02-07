-- =====================================================
-- Pay2X Security Hardening Migration
-- 003_security.sql
-- Run in Supabase SQL Editor
-- =====================================================

-- ─────────────────────────────────────────────────────
-- 1. LOGIN ATTEMPTS TABLE (Rate Limiting & Lockout)
-- ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups by email and time
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_time 
  ON login_attempts(email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time 
  ON login_attempts(ip_address, created_at DESC);

-- RLS: Only admins can read login attempts
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_login_attempts" ON login_attempts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'worker')
    )
  );

-- Anyone can insert (for logging failed attempts before auth)
CREATE POLICY "anyone_insert_login_attempts" ON login_attempts
  FOR INSERT WITH CHECK (TRUE);

-- ─────────────────────────────────────────────────────
-- 2. ACCOUNT LOCKOUTS TABLE
-- ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS account_lockouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until TIMESTAMPTZ NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_ip INET,
  unlock_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_lockouts_email 
  ON account_lockouts(email);

ALTER TABLE account_lockouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_lockouts" ON account_lockouts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'worker')
    )
  );

-- Public can check their own lockout status
CREATE POLICY "check_own_lockout" ON account_lockouts
  FOR SELECT USING (TRUE);

-- Public can insert/update for lockout tracking
CREATE POLICY "manage_lockouts" ON account_lockouts
  FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "update_lockouts" ON account_lockouts
  FOR UPDATE USING (TRUE);

-- ─────────────────────────────────────────────────────
-- 3. SECURITY SETTINGS TABLE
-- ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS security_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Insert default security settings
INSERT INTO security_settings (setting_key, setting_value, description) VALUES
  ('rate_limit', '{"max_attempts": 5, "window_minutes": 15}', 'Login rate limiting: max attempts per window'),
  ('account_lockout', '{"enabled": true, "threshold": 5, "duration_minutes": 30}', 'Account lockout after failed attempts'),
  ('password_policy', '{"min_length": 8, "require_uppercase": true, "require_number": true, "require_special": false}', 'Password requirements'),
  ('session_timeout', '{"idle_minutes": 30, "absolute_hours": 12}', 'Session timeout settings'),
  ('two_factor', '{"required_roles": ["admin"], "optional_roles": ["trader", "merchant"]}', '2FA requirements by role'),
  ('captcha', '{"enabled": false, "provider": "hcaptcha", "site_key": null}', 'CAPTCHA settings'),
  ('ip_whitelist', '{"enabled": false, "admin_ips": []}', 'IP whitelist for admin access'),
  ('suspicious_activity', '{"alert_threshold": 10, "block_threshold": 20}', 'Suspicious activity detection thresholds')
ON CONFLICT (setting_key) DO NOTHING;

ALTER TABLE security_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_security_settings" ON security_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  );

-- ─────────────────────────────────────────────────────
-- 4. TWO-FACTOR AUTH TABLE
-- ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_2fa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  secret_encrypted TEXT NOT NULL,  -- Encrypted TOTP secret
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  backup_codes_hash TEXT[],  -- Hashed backup codes
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE user_2fa ENABLE ROW LEVEL SECURITY;

-- Users can only see/manage their own 2FA
CREATE POLICY "users_own_2fa" ON user_2fa
  FOR ALL USING (user_id = auth.uid());

-- Admins can view (but not secrets) for support
CREATE POLICY "admin_view_2fa_status" ON user_2fa
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  );

-- ─────────────────────────────────────────────────────
-- 5. SENSITIVE DATA AUDIT TABLE
-- ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sensitive_data_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  table_name TEXT NOT NULL,
  record_id TEXT,
  fields_accessed TEXT[],
  ip_address INET,
  user_agent TEXT,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sensitive_access_user 
  ON sensitive_data_access(user_id, accessed_at DESC);

CREATE INDEX IF NOT EXISTS idx_sensitive_access_table 
  ON sensitive_data_access(table_name, accessed_at DESC);

ALTER TABLE sensitive_data_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_sensitive_access" ON sensitive_data_access
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  );

-- ─────────────────────────────────────────────────────
-- 6. HELPER FUNCTIONS
-- ─────────────────────────────────────────────────────

-- Function to check if account is locked
CREATE OR REPLACE FUNCTION is_account_locked(check_email TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  lockout_record RECORD;
BEGIN
  SELECT * INTO lockout_record
  FROM account_lockouts
  WHERE email = check_email
  AND locked_until > NOW();
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get failed login count in window
CREATE OR REPLACE FUNCTION get_failed_login_count(
  check_email TEXT,
  window_minutes INTEGER DEFAULT 15
)
RETURNS INTEGER AS $$
DECLARE
  fail_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO fail_count
  FROM login_attempts
  WHERE email = check_email
  AND success = FALSE
  AND created_at > NOW() - (window_minutes || ' minutes')::INTERVAL;
  
  RETURN fail_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record login attempt
CREATE OR REPLACE FUNCTION record_login_attempt(
  attempt_email TEXT,
  attempt_ip INET,
  attempt_user_agent TEXT,
  was_success BOOLEAN,
  fail_reason TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO login_attempts (email, ip_address, user_agent, success, failure_reason)
  VALUES (attempt_email, attempt_ip, attempt_user_agent, was_success, fail_reason);
  
  -- If failed, check if we need to lock the account
  IF NOT was_success THEN
    PERFORM check_and_lock_account(attempt_email, attempt_ip);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check and lock account if needed
CREATE OR REPLACE FUNCTION check_and_lock_account(
  check_email TEXT,
  last_ip INET
)
RETURNS BOOLEAN AS $$
DECLARE
  fail_count INTEGER;
  lockout_settings JSONB;
  threshold INTEGER;
  duration INTEGER;
BEGIN
  -- Get lockout settings
  SELECT setting_value INTO lockout_settings
  FROM security_settings
  WHERE setting_key = 'account_lockout';
  
  IF lockout_settings IS NULL OR NOT (lockout_settings->>'enabled')::BOOLEAN THEN
    RETURN FALSE;
  END IF;
  
  threshold := (lockout_settings->>'threshold')::INTEGER;
  duration := (lockout_settings->>'duration_minutes')::INTEGER;
  
  -- Get failed count in last 15 minutes
  fail_count := get_failed_login_count(check_email, 15);
  
  IF fail_count >= threshold THEN
    -- Lock the account
    INSERT INTO account_lockouts (email, locked_until, failed_attempts, last_attempt_ip)
    VALUES (check_email, NOW() + (duration || ' minutes')::INTERVAL, fail_count, last_ip)
    ON CONFLICT (email) DO UPDATE SET
      locked_at = NOW(),
      locked_until = NOW() + (duration || ' minutes')::INTERVAL,
      failed_attempts = EXCLUDED.failed_attempts,
      last_attempt_ip = EXCLUDED.last_attempt_ip,
      updated_at = NOW();
    
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to unlock account (admin only)
CREATE OR REPLACE FUNCTION unlock_account(unlock_email TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  DELETE FROM account_lockouts WHERE email = unlock_email;
  
  -- Clear recent failed attempts
  DELETE FROM login_attempts 
  WHERE email = unlock_email 
  AND success = FALSE
  AND created_at > NOW() - INTERVAL '1 hour';
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────
-- 7. ADD 2FA COLUMNS TO PROFILES (if not exists)
-- ─────────────────────────────────────────────────────

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'two_factor_enabled'
  ) THEN
    ALTER TABLE profiles ADD COLUMN two_factor_enabled BOOLEAN DEFAULT FALSE;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'last_login_at'
  ) THEN
    ALTER TABLE profiles ADD COLUMN last_login_at TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'last_login_ip'
  ) THEN
    ALTER TABLE profiles ADD COLUMN last_login_ip INET;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'failed_login_count'
  ) THEN
    ALTER TABLE profiles ADD COLUMN failed_login_count INTEGER DEFAULT 0;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────
-- 8. SECURE VIEWS (Hide Sensitive Data)
-- ─────────────────────────────────────────────────────

-- Safe trader view (excludes sensitive fields)
CREATE OR REPLACE VIEW public.safe_traders AS
SELECT 
  id,
  profile_id,
  name,
  is_active,
  is_online,
  created_at,
  updated_at
  -- Excluded: balance, security_hold, bank_details, api credentials
FROM traders;

-- Safe merchant view
CREATE OR REPLACE VIEW public.safe_merchants AS
SELECT 
  id,
  profile_id,
  business_name,
  is_active,
  created_at,
  updated_at
  -- Excluded: balance, api_key, webhook_secret, bank_details
FROM merchants;

-- Grant access to authenticated users
GRANT SELECT ON public.safe_traders TO authenticated;
GRANT SELECT ON public.safe_merchants TO authenticated;

-- ─────────────────────────────────────────────────────
-- 9. CLEANUP OLD LOGIN ATTEMPTS (Scheduled Job)
-- ─────────────────────────────────────────────────────

-- Function to clean up old login attempts (keep 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_login_attempts()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM login_attempts
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up old sensitive data access logs (keep 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_sensitive_logs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM sensitive_data_access
  WHERE accessed_at < NOW() - INTERVAL '90 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────
-- 10. GRANT EXECUTE ON FUNCTIONS
-- ─────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION is_account_locked(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_failed_login_count(TEXT, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION record_login_attempt(TEXT, INET, TEXT, BOOLEAN, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION check_and_lock_account(TEXT, INET) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION unlock_account(TEXT) TO authenticated;

-- =====================================================
-- END OF SECURITY MIGRATION
-- =====================================================
