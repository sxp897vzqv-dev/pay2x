-- ============================================
-- EMAIL NOTIFICATIONS
-- 008_email_notifications.sql
-- ============================================

-- Email queue table
CREATE TABLE IF NOT EXISTS email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  template TEXT NOT NULL,
  template_data JSONB,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_email_queue_status ON email_queue(status) WHERE status = 'pending';
CREATE INDEX idx_email_queue_created ON email_queue(created_at DESC);

-- Notification preferences for merchants
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS email_notifications JSONB DEFAULT '{
  "login_alerts": true,
  "payment_completed": true,
  "payment_failed": true,
  "large_payment_threshold": 50000,
  "daily_summary": false,
  "security_alerts": true
}'::jsonb;

-- Login history for alerts
CREATE TABLE IF NOT EXISTS login_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  email TEXT,
  ip_address INET,
  user_agent TEXT,
  location TEXT,
  device_fingerprint TEXT,
  is_new_device BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_login_history_user ON login_history(user_id);
CREATE INDEX idx_login_history_created ON login_history(created_at DESC);

-- RLS
ALTER TABLE email_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_history ENABLE ROW LEVEL SECURITY;

-- Only service role can access email queue
CREATE POLICY service_email_queue ON email_queue FOR ALL USING (auth.role() = 'service_role');

-- Admin can view email queue
CREATE POLICY admin_email_queue ON email_queue FOR SELECT 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Users can see their own login history
CREATE POLICY login_history_own ON login_history FOR SELECT USING (auth.uid() = user_id);

-- Admin can see all login history
CREATE POLICY admin_login_history ON login_history FOR ALL 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Service role for login history
CREATE POLICY service_login_history ON login_history FOR ALL USING (auth.role() = 'service_role');

-- Function to check if device is new
CREATE OR REPLACE FUNCTION check_new_device(
  p_user_id UUID,
  p_fingerprint TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM login_history 
    WHERE user_id = p_user_id 
    AND device_fingerprint = p_fingerprint
    LIMIT 1
  ) INTO v_exists;
  
  RETURN NOT v_exists;
END;
$$ LANGUAGE plpgsql;

-- Function to record login and queue alert if new device
CREATE OR REPLACE FUNCTION record_login_and_alert(
  p_user_id UUID,
  p_email TEXT,
  p_ip TEXT,
  p_user_agent TEXT,
  p_fingerprint TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_is_new BOOLEAN;
  v_prefs JSONB;
BEGIN
  -- Check if new device
  v_is_new := check_new_device(p_user_id, p_fingerprint);
  
  -- Record login
  INSERT INTO login_history (user_id, email, ip_address, user_agent, device_fingerprint, is_new_device)
  VALUES (p_user_id, p_email, p_ip::INET, p_user_agent, p_fingerprint, v_is_new);
  
  -- If new device and notifications enabled, queue email
  IF v_is_new THEN
    -- Check merchant notification preferences
    SELECT email_notifications INTO v_prefs 
    FROM merchants WHERE profile_id = p_user_id;
    
    IF v_prefs IS NULL OR (v_prefs->>'login_alerts')::BOOLEAN = true THEN
      INSERT INTO email_queue (to_email, subject, template, template_data)
      VALUES (
        p_email,
        '🔐 New login to your Pay2X account',
        'login_alert',
        jsonb_build_object(
          'ip', p_ip,
          'user_agent', p_user_agent,
          'time', now()
        )
      );
    END IF;
  END IF;
  
  RETURN v_is_new;
END;
$$ LANGUAGE plpgsql;
