-- ============================================
-- PAYIN ENGINE v2.0 - Database Functions
-- Run this after 001-005 migrations
-- ============================================

-- System Config table for engine weights
CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default payin engine weights
INSERT INTO system_config (key, value, description) VALUES
  ('payin_engine_weights', '{
    "successRate": 25,
    "dailyLimitLeft": 20,
    "cooldown": 15,
    "amountMatch": 15,
    "traderBalance": 10,
    "bankHealth": 5,
    "timeWindow": 5,
    "recentFailures": 5
  }', 'PayinEngine v2.0 scoring weights')
ON CONFLICT (key) DO NOTHING;

-- Selection logs table
CREATE TABLE IF NOT EXISTS selection_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upi_pool_id UUID REFERENCES upi_pool(id),
  upi_id TEXT,
  trader_id UUID REFERENCES traders(id),
  merchant_id UUID REFERENCES merchants(id),
  amount DECIMAL(15,2),
  score DECIMAL(5,2),
  score_breakdown JSONB,
  attempt INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_selection_logs_created ON selection_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_selection_logs_upi ON selection_logs(upi_pool_id);

-- Bank health table
CREATE TABLE IF NOT EXISTS bank_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'healthy' CHECK (status IN ('healthy', 'degraded', 'down')),
  last_checked_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert common banks with healthy status
INSERT INTO bank_health (bank_name, status) VALUES
  ('sbi', 'healthy'),
  ('hdfc', 'healthy'),
  ('icici', 'healthy'),
  ('axis', 'healthy'),
  ('kotak', 'healthy'),
  ('yes', 'healthy'),
  ('pnb', 'healthy'),
  ('bob', 'healthy'),
  ('idbi', 'healthy'),
  ('paytm', 'healthy'),
  ('phonepe', 'healthy'),
  ('gpay', 'healthy')
ON CONFLICT (bank_name) DO NOTHING;

-- ============================================
-- ATOMIC INCREMENT FUNCTIONS
-- ============================================

-- Increment UPI success stats
CREATE OR REPLACE FUNCTION increment_upi_success(
  p_upi_id UUID,
  p_amount DECIMAL
) RETURNS void AS $$
BEGIN
  UPDATE upi_pool SET
    daily_volume = daily_volume + p_amount,
    daily_count = daily_count + 1,
    daily_success = daily_success + 1,
    total_volume = total_volume + p_amount,
    total_count = total_count + 1,
    total_success = total_success + 1,
    success_rate = CASE 
      WHEN (total_count + 1) > 0 
      THEN ROUND(((total_success + 1)::DECIMAL / (total_count + 1)::DECIMAL) * 100, 2)
      ELSE 100
    END,
    hourly_failures = 0, -- Reset on success
    last_used_at = now(),
    updated_at = now()
  WHERE id = p_upi_id;
END;
$$ LANGUAGE plpgsql;

-- Increment UPI failure stats
CREATE OR REPLACE FUNCTION increment_upi_failure(
  p_upi_id UUID
) RETURNS void AS $$
BEGIN
  UPDATE upi_pool SET
    daily_count = daily_count + 1,
    daily_failed = daily_failed + 1,
    total_count = total_count + 1,
    total_failed = total_failed + 1,
    success_rate = CASE 
      WHEN (total_count + 1) > 0 
      THEN ROUND((total_success::DECIMAL / (total_count + 1)::DECIMAL) * 100, 2)
      ELSE 0
    END,
    hourly_failures = hourly_failures + 1,
    last_used_at = now(),
    updated_at = now()
  WHERE id = p_upi_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- WEBHOOK QUEUE TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS payin_webhook_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payin_id UUID NOT NULL REFERENCES payins(id),
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  webhook_url TEXT NOT NULL,
  webhook_secret TEXT,
  event_type TEXT NOT NULL, -- payment.completed, payment.failed, etc.
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'delivered')),
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  response_code INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_queue_status ON payin_webhook_queue(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_webhook_queue_created ON payin_webhook_queue(created_at DESC);

-- ============================================
-- PAYIN STATUS CHANGE TRIGGER
-- Queues webhook when payin status changes to completed/failed/rejected
-- ============================================

CREATE OR REPLACE FUNCTION queue_payin_webhook()
RETURNS TRIGGER AS $$
DECLARE
  v_merchant RECORD;
  v_event_type TEXT;
  v_payload JSONB;
BEGIN
  -- Only trigger on status change to final states
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  
  IF NEW.status NOT IN ('completed', 'failed', 'rejected', 'expired') THEN
    RETURN NEW;
  END IF;
  
  -- Get merchant webhook config
  SELECT id, webhook_url, webhook_secret, business_name
  INTO v_merchant
  FROM merchants
  WHERE id = NEW.merchant_id;
  
  IF v_merchant.webhook_url IS NULL OR v_merchant.webhook_url = '' THEN
    RETURN NEW;
  END IF;
  
  -- Determine event type
  v_event_type := CASE NEW.status
    WHEN 'completed' THEN 'payment.completed'
    WHEN 'failed' THEN 'payment.failed'
    WHEN 'rejected' THEN 'payment.failed'
    WHEN 'expired' THEN 'payment.expired'
    ELSE 'payment.updated'
  END;
  
  -- Build payload
  v_payload := jsonb_build_object(
    'event', v_event_type,
    'timestamp', extract(epoch from now()) * 1000,
    'data', jsonb_build_object(
      'payinId', NEW.id,
      'txnId', NEW.txn_id,
      'orderId', NEW.order_id,
      'amount', NEW.amount,
      'status', NEW.status,
      'utrId', NEW.utr,
      'userId', NEW.user_id,
      'completedAt', NEW.completed_at,
      'metadata', NEW.metadata
    )
  );
  
  -- Queue webhook
  INSERT INTO payin_webhook_queue (
    payin_id, merchant_id, webhook_url, webhook_secret, event_type, payload
  ) VALUES (
    NEW.id, 
    NEW.merchant_id, 
    v_merchant.webhook_url, 
    v_merchant.webhook_secret,
    v_event_type,
    v_payload
  );
  
  -- Also update UPI stats
  IF NEW.upi_pool_id IS NOT NULL THEN
    IF NEW.status = 'completed' THEN
      PERFORM increment_upi_success(NEW.upi_pool_id, NEW.amount);
    ELSIF NEW.status IN ('failed', 'rejected') THEN
      PERFORM increment_upi_failure(NEW.upi_pool_id);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS payin_status_webhook_trigger ON payins;
CREATE TRIGGER payin_status_webhook_trigger
  AFTER UPDATE ON payins
  FOR EACH ROW
  EXECUTE FUNCTION queue_payin_webhook();

-- ============================================
-- DAILY RESET FUNCTION (call via cron)
-- ============================================

CREATE OR REPLACE FUNCTION reset_daily_upi_stats()
RETURNS void AS $$
BEGIN
  UPDATE upi_pool SET
    daily_volume = 0,
    daily_count = 0,
    daily_success = 0,
    daily_failed = 0,
    hourly_failures = 0,
    updated_at = now();
    
  -- Log reset
  INSERT INTO admin_logs (action, category, details, performed_by, performed_by_name)
  VALUES ('daily_stats_reset', 'system', '{"target": "upi_pool"}', 'system', 'Scheduled Job');
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- EXPIRE OLD PAYINS FUNCTION (call via cron)
-- ============================================

CREATE OR REPLACE FUNCTION expire_old_payins()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH expired AS (
    UPDATE payins
    SET status = 'expired', updated_at = now()
    WHERE status = 'pending'
      AND expires_at < now()
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM expired;
  
  IF v_count > 0 THEN
    INSERT INTO admin_logs (action, category, details, performed_by, performed_by_name)
    VALUES ('payins_expired', 'system', jsonb_build_object('count', v_count), 'system', 'Scheduled Job');
  END IF;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE selection_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE payin_webhook_queue ENABLE ROW LEVEL SECURITY;

-- Admins can read/write all
CREATE POLICY admin_system_config ON system_config FOR ALL 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY admin_selection_logs ON selection_logs FOR ALL 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY admin_bank_health ON bank_health FOR ALL 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY admin_webhook_queue ON payin_webhook_queue FOR ALL 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Service role bypass (for Edge Functions)
CREATE POLICY service_system_config ON system_config FOR ALL 
  USING (auth.role() = 'service_role');

CREATE POLICY service_selection_logs ON selection_logs FOR ALL 
  USING (auth.role() = 'service_role');

CREATE POLICY service_bank_health ON bank_health FOR ALL 
  USING (auth.role() = 'service_role');

CREATE POLICY service_webhook_queue ON payin_webhook_queue FOR ALL 
  USING (auth.role() = 'service_role');

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION increment_upi_success TO service_role;
GRANT EXECUTE ON FUNCTION increment_upi_failure TO service_role;
GRANT EXECUTE ON FUNCTION reset_daily_upi_stats TO service_role;
GRANT EXECUTE ON FUNCTION expire_old_payins TO service_role;
