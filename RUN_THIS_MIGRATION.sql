-- ============================================
-- PAYIN ENGINE v2.0 - Run in Supabase SQL Editor
-- ============================================

-- 1. System Config table
CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

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

-- 2. Selection logs table
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

-- 3. Bank health table
CREATE TABLE IF NOT EXISTS bank_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'healthy' CHECK (status IN ('healthy', 'degraded', 'down')),
  last_checked_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO bank_health (bank_name, status) VALUES
  ('sbi', 'healthy'), ('hdfc', 'healthy'), ('icici', 'healthy'),
  ('axis', 'healthy'), ('kotak', 'healthy'), ('yes', 'healthy'),
  ('pnb', 'healthy'), ('bob', 'healthy'), ('paytm', 'healthy')
ON CONFLICT (bank_name) DO NOTHING;

-- 4. Webhook queue table
CREATE TABLE IF NOT EXISTS payin_webhook_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payin_id UUID NOT NULL REFERENCES payins(id),
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  webhook_url TEXT NOT NULL,
  webhook_secret TEXT,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'delivered')),
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  response_code INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_queue_status ON payin_webhook_queue(status) WHERE status = 'pending';

-- 5. Add missing columns to payins
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payins' AND column_name = 'upi_id') THEN
    ALTER TABLE payins ADD COLUMN upi_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payins' AND column_name = 'holder_name') THEN
    ALTER TABLE payins ADD COLUMN holder_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payins' AND column_name = 'user_id') THEN
    ALTER TABLE payins ADD COLUMN user_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payins' AND column_name = 'timer') THEN
    ALTER TABLE payins ADD COLUMN timer INTEGER DEFAULT 600;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payins' AND column_name = 'expires_at') THEN
    ALTER TABLE payins ADD COLUMN expires_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payins' AND column_name = 'utr_submitted_at') THEN
    ALTER TABLE payins ADD COLUMN utr_submitted_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payins' AND column_name = 'engine_version') THEN
    ALTER TABLE payins ADD COLUMN engine_version TEXT DEFAULT '2.0';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payins' AND column_name = 'selection_score') THEN
    ALTER TABLE payins ADD COLUMN selection_score DECIMAL(5,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payins' AND column_name = 'selection_attempts') THEN
    ALTER TABLE payins ADD COLUMN selection_attempts INTEGER;
  END IF;
END $$;

-- 6. UPI stats functions
CREATE OR REPLACE FUNCTION increment_upi_success(p_upi_id UUID, p_amount DECIMAL) RETURNS void AS $$
BEGIN
  UPDATE upi_pool SET
    daily_volume = daily_volume + p_amount,
    daily_count = daily_count + 1,
    daily_success = daily_success + 1,
    total_volume = total_volume + p_amount,
    total_count = total_count + 1,
    total_success = total_success + 1,
    success_rate = ROUND(((total_success + 1)::DECIMAL / (total_count + 1)::DECIMAL) * 100, 2),
    hourly_failures = 0,
    last_used_at = now(),
    updated_at = now()
  WHERE id = p_upi_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_upi_failure(p_upi_id UUID) RETURNS void AS $$
BEGIN
  UPDATE upi_pool SET
    daily_count = daily_count + 1,
    daily_failed = daily_failed + 1,
    total_count = total_count + 1,
    total_failed = total_failed + 1,
    success_rate = ROUND((total_success::DECIMAL / (total_count + 1)::DECIMAL) * 100, 2),
    hourly_failures = hourly_failures + 1,
    last_used_at = now(),
    updated_at = now()
  WHERE id = p_upi_id;
END;
$$ LANGUAGE plpgsql;

-- 7. Webhook trigger function
CREATE OR REPLACE FUNCTION queue_payin_webhook() RETURNS TRIGGER AS $$
DECLARE
  v_merchant RECORD;
  v_event_type TEXT;
  v_payload JSONB;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('completed', 'failed', 'rejected', 'expired') THEN RETURN NEW; END IF;
  
  SELECT id, webhook_url, webhook_secret INTO v_merchant FROM merchants WHERE id = NEW.merchant_id;
  IF v_merchant.webhook_url IS NULL OR v_merchant.webhook_url = '' THEN RETURN NEW; END IF;
  
  v_event_type := CASE NEW.status
    WHEN 'completed' THEN 'payment.completed'
    WHEN 'failed' THEN 'payment.failed'
    WHEN 'rejected' THEN 'payment.failed'
    WHEN 'expired' THEN 'payment.expired'
    ELSE 'payment.updated'
  END;
  
  v_payload := jsonb_build_object(
    'event', v_event_type,
    'timestamp', extract(epoch from now()) * 1000,
    'data', jsonb_build_object(
      'payinId', NEW.id, 'txnId', NEW.txn_id, 'orderId', NEW.order_id,
      'amount', NEW.amount, 'status', NEW.status, 'utrId', NEW.utr,
      'userId', NEW.user_id, 'completedAt', NEW.completed_at, 'metadata', NEW.metadata
    )
  );
  
  INSERT INTO payin_webhook_queue (payin_id, merchant_id, webhook_url, webhook_secret, event_type, payload)
  VALUES (NEW.id, NEW.merchant_id, v_merchant.webhook_url, v_merchant.webhook_secret, v_event_type, v_payload);
  
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

-- 8. Create trigger
DROP TRIGGER IF EXISTS payin_status_webhook_trigger ON payins;
CREATE TRIGGER payin_status_webhook_trigger
  AFTER UPDATE ON payins
  FOR EACH ROW
  EXECUTE FUNCTION queue_payin_webhook();

-- 9. RLS
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE selection_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE payin_webhook_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS service_system_config ON system_config FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS service_selection_logs ON selection_logs FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS service_bank_health ON bank_health FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS service_webhook_queue ON payin_webhook_queue FOR ALL USING (true);

-- Done!
SELECT 'PayinEngine v2.0 migration complete!' as status;
