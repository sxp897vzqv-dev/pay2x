-- Step 1: Add missing columns to system_config
ALTER TABLE system_config ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE system_config ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Step 2: Insert engine config
INSERT INTO system_config (key, value, description) VALUES
  ('payin_engine_weights', '{"successRate":25,"dailyLimitLeft":20,"cooldown":15,"amountMatch":15,"traderBalance":10,"bankHealth":5,"timeWindow":5,"recentFailures":5}', 'PayinEngine v2.0 scoring weights')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Step 3: Selection logs table
CREATE TABLE IF NOT EXISTS selection_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upi_pool_id UUID,
  upi_id TEXT,
  trader_id UUID,
  merchant_id UUID,
  amount DECIMAL(15,2),
  score DECIMAL(5,2),
  score_breakdown JSONB,
  attempt INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Step 4: Bank health table
CREATE TABLE IF NOT EXISTS bank_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'healthy',
  last_checked_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO bank_health (bank_name, status) VALUES
  ('sbi', 'healthy'), ('hdfc', 'healthy'), ('icici', 'healthy'),
  ('axis', 'healthy'), ('kotak', 'healthy'), ('paytm', 'healthy')
ON CONFLICT (bank_name) DO NOTHING;

-- Step 5: Webhook queue
CREATE TABLE IF NOT EXISTS payin_webhook_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payin_id UUID NOT NULL,
  merchant_id UUID NOT NULL,
  webhook_url TEXT NOT NULL,
  webhook_secret TEXT,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  response_code INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Step 6: Add columns to payins
ALTER TABLE payins ADD COLUMN IF NOT EXISTS upi_id TEXT;
ALTER TABLE payins ADD COLUMN IF NOT EXISTS holder_name TEXT;
ALTER TABLE payins ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE payins ADD COLUMN IF NOT EXISTS timer INTEGER DEFAULT 600;
ALTER TABLE payins ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE payins ADD COLUMN IF NOT EXISTS utr_submitted_at TIMESTAMPTZ;
ALTER TABLE payins ADD COLUMN IF NOT EXISTS engine_version TEXT DEFAULT '2.0';
ALTER TABLE payins ADD COLUMN IF NOT EXISTS selection_score DECIMAL(5,2);
ALTER TABLE payins ADD COLUMN IF NOT EXISTS selection_attempts INTEGER;

-- Step 7: UPI stats functions
CREATE OR REPLACE FUNCTION increment_upi_success(p_upi_id UUID, p_amount DECIMAL) RETURNS void AS $$
BEGIN
  UPDATE upi_pool SET
    daily_volume = COALESCE(daily_volume, 0) + p_amount,
    daily_count = COALESCE(daily_count, 0) + 1,
    daily_success = COALESCE(daily_success, 0) + 1,
    total_volume = COALESCE(total_volume, 0) + p_amount,
    total_count = COALESCE(total_count, 0) + 1,
    total_success = COALESCE(total_success, 0) + 1,
    hourly_failures = 0,
    last_used_at = now(),
    updated_at = now()
  WHERE id = p_upi_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_upi_failure(p_upi_id UUID) RETURNS void AS $$
BEGIN
  UPDATE upi_pool SET
    daily_count = COALESCE(daily_count, 0) + 1,
    daily_failed = COALESCE(daily_failed, 0) + 1,
    total_count = COALESCE(total_count, 0) + 1,
    total_failed = COALESCE(total_failed, 0) + 1,
    hourly_failures = COALESCE(hourly_failures, 0) + 1,
    last_used_at = now(),
    updated_at = now()
  WHERE id = p_upi_id;
END;
$$ LANGUAGE plpgsql;

-- Step 8: Webhook trigger
CREATE OR REPLACE FUNCTION queue_payin_webhook() RETURNS TRIGGER AS $$
DECLARE
  v_webhook_url TEXT;
  v_webhook_secret TEXT;
  v_event_type TEXT;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('completed', 'failed', 'rejected', 'expired') THEN RETURN NEW; END IF;
  
  SELECT webhook_url, webhook_secret INTO v_webhook_url, v_webhook_secret FROM merchants WHERE id = NEW.merchant_id;
  IF v_webhook_url IS NULL OR v_webhook_url = '' THEN RETURN NEW; END IF;
  
  v_event_type := CASE NEW.status WHEN 'completed' THEN 'payment.completed' ELSE 'payment.failed' END;
  
  INSERT INTO payin_webhook_queue (payin_id, merchant_id, webhook_url, webhook_secret, event_type, payload)
  VALUES (NEW.id, NEW.merchant_id, v_webhook_url, v_webhook_secret, v_event_type,
    jsonb_build_object('event', v_event_type, 'timestamp', extract(epoch from now()) * 1000,
      'data', jsonb_build_object('payinId', NEW.id, 'amount', NEW.amount, 'status', NEW.status, 'utrId', NEW.utr)));
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payin_status_webhook_trigger ON payins;
CREATE TRIGGER payin_status_webhook_trigger AFTER UPDATE ON payins FOR EACH ROW EXECUTE FUNCTION queue_payin_webhook();

-- Step 9: RLS
ALTER TABLE selection_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE payin_webhook_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS allow_all_selection_logs ON selection_logs FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS allow_all_bank_health ON bank_health FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS allow_all_webhook_queue ON payin_webhook_queue FOR ALL USING (true);

SELECT 'Migration complete!' as result;
