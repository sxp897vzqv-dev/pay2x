-- USDT Rate Tracking System
-- Stores admin rate, trader rate, and deposit profit tracking

-- Add new columns to tatum_config
ALTER TABLE tatum_config ADD COLUMN IF NOT EXISTS admin_usdt_rate DECIMAL(10,2) DEFAULT 92;
ALTER TABLE tatum_config ADD COLUMN IF NOT EXISTS rate_updated_at TIMESTAMPTZ;
ALTER TABLE tatum_config ADD COLUMN IF NOT EXISTS rate_source TEXT;
ALTER TABLE tatum_config ADD COLUMN IF NOT EXISTS rate_offers JSONB;

-- Rename for clarity (default_usdt_rate = trader rate)
COMMENT ON COLUMN tatum_config.admin_usdt_rate IS 'Actual Binance P2P rate (what admin receives)';
COMMENT ON COLUMN tatum_config.default_usdt_rate IS 'Trader rate (admin_rate - margin, what traders get)';

-- Rate history table
CREATE TABLE IF NOT EXISTS usdt_rate_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_rate DECIMAL(10,2) NOT NULL,
  trader_rate DECIMAL(10,2) NOT NULL,
  margin DECIMAL(10,2) DEFAULT 1,
  source TEXT DEFAULT 'binance_p2p',
  offers JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_history_created ON usdt_rate_history(created_at DESC);

-- Deposit profit tracking (add columns to crypto_transactions if not exists)
ALTER TABLE crypto_transactions ADD COLUMN IF NOT EXISTS admin_rate DECIMAL(10,2);
ALTER TABLE crypto_transactions ADD COLUMN IF NOT EXISTS trader_rate DECIMAL(10,2);
ALTER TABLE crypto_transactions ADD COLUMN IF NOT EXISTS profit_per_usdt DECIMAL(10,2);
ALTER TABLE crypto_transactions ADD COLUMN IF NOT EXISTS total_profit DECIMAL(10,2);

COMMENT ON COLUMN crypto_transactions.admin_rate IS 'Rate at time of deposit (what admin would get)';
COMMENT ON COLUMN crypto_transactions.trader_rate IS 'Rate given to trader';
COMMENT ON COLUMN crypto_transactions.profit_per_usdt IS 'Difference between admin and trader rate';
COMMENT ON COLUMN crypto_transactions.total_profit IS 'profit_per_usdt * usdt_amount';

-- Function to calculate profit on deposit
CREATE OR REPLACE FUNCTION calculate_deposit_profit()
RETURNS TRIGGER AS $$
DECLARE
  v_admin_rate DECIMAL(10,2);
  v_trader_rate DECIMAL(10,2);
BEGIN
  -- Get current rates
  SELECT admin_usdt_rate, default_usdt_rate INTO v_admin_rate, v_trader_rate
  FROM tatum_config WHERE id = 'main';
  
  -- Set rates and calculate profit
  NEW.admin_rate := COALESCE(v_admin_rate, 92);
  NEW.trader_rate := COALESCE(v_trader_rate, 91);
  NEW.profit_per_usdt := NEW.admin_rate - NEW.trader_rate;
  NEW.total_profit := NEW.profit_per_usdt * COALESCE(NEW.usdt_amount, 0);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-calculating profit on deposit
DROP TRIGGER IF EXISTS trigger_deposit_profit ON crypto_transactions;
CREATE TRIGGER trigger_deposit_profit
  BEFORE INSERT ON crypto_transactions
  FOR EACH ROW
  WHEN (NEW.type = 'deposit')
  EXECUTE FUNCTION calculate_deposit_profit();

-- Enable RLS on rate history
ALTER TABLE usdt_rate_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view rate history" ON usdt_rate_history
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Cron job to update rate every 5 minutes
SELECT cron.schedule(
  'update-usdt-rate',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://jrzyndtowwwcydgcagcr.supabase.co/functions/v1/update-usdt-rate',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
