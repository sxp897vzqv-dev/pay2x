-- ============================================
-- 010: Complete Business Flows
-- Fixes: Balance flows, Platform profit, Payout webhooks
-- ============================================

-- 1. Platform Earnings Table (tracks profit per transaction)
CREATE TABLE IF NOT EXISTS platform_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('payin', 'payout')),
  reference_id UUID NOT NULL, -- payin_id or payout_id
  merchant_id UUID REFERENCES merchants(id),
  trader_id UUID REFERENCES traders(id),
  
  -- Amounts
  transaction_amount DECIMAL(15,2) NOT NULL,
  merchant_fee DECIMAL(15,2) NOT NULL, -- What merchant pays
  trader_fee DECIMAL(15,2) NOT NULL,   -- What trader earns
  platform_profit DECIMAL(15,2) NOT NULL, -- merchant_fee - trader_fee
  
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_earnings_type ON platform_earnings(type);
CREATE INDEX IF NOT EXISTS idx_platform_earnings_created ON platform_earnings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_earnings_merchant ON platform_earnings(merchant_id);

-- 2. Add columns to merchants if missing
DO $$ 
BEGIN
  -- Available balance (what they can withdraw/use for payouts)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'merchants' AND column_name = 'available_balance') THEN
    ALTER TABLE merchants ADD COLUMN available_balance DECIMAL(15,2) DEFAULT 0;
  END IF;
  
  -- Pending balance (payins not yet settled)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'merchants' AND column_name = 'pending_balance') THEN
    ALTER TABLE merchants ADD COLUMN pending_balance DECIMAL(15,2) DEFAULT 0;
  END IF;
  
  -- Total volume
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'merchants' AND column_name = 'total_payin_volume') THEN
    ALTER TABLE merchants ADD COLUMN total_payin_volume DECIMAL(15,2) DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'merchants' AND column_name = 'total_payout_volume') THEN
    ALTER TABLE merchants ADD COLUMN total_payout_volume DECIMAL(15,2) DEFAULT 0;
  END IF;
  
  -- Commission rates (as percentage, e.g., 6 = 6%)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'merchants' AND column_name = 'payin_rate') THEN
    ALTER TABLE merchants ADD COLUMN payin_rate DECIMAL(5,2) DEFAULT 6;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'merchants' AND column_name = 'payout_rate') THEN
    ALTER TABLE merchants ADD COLUMN payout_rate DECIMAL(5,2) DEFAULT 2;
  END IF;
END $$;

-- 3. Add columns to traders if missing
DO $$ 
BEGIN
  -- Commission rates (as percentage, e.g., 4 = 4%)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'traders' AND column_name = 'payin_rate') THEN
    ALTER TABLE traders ADD COLUMN payin_rate DECIMAL(5,2) DEFAULT 4;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'traders' AND column_name = 'payout_rate') THEN
    ALTER TABLE traders ADD COLUMN payout_rate DECIMAL(5,2) DEFAULT 1;
  END IF;
END $$;

-- 4. Payout webhook queue (separate from payin webhooks)
CREATE TABLE IF NOT EXISTS payout_webhook_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID NOT NULL REFERENCES payouts(id),
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  webhook_url TEXT NOT NULL,
  webhook_secret TEXT,
  event_type TEXT NOT NULL, -- payout.created, payout.completed, payout.failed
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'delivered')),
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  response_code INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payout_webhook_status ON payout_webhook_queue(status) WHERE status = 'pending';

-- 5. Add payin_id and payout_id to disputes if missing
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'disputes' AND column_name = 'payin_id') THEN
    ALTER TABLE disputes ADD COLUMN payin_id UUID REFERENCES payins(id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'disputes' AND column_name = 'payout_id') THEN
    ALTER TABLE disputes ADD COLUMN payout_id UUID REFERENCES payouts(id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'disputes' AND column_name = 'routed_at') THEN
    ALTER TABLE disputes ADD COLUMN routed_at TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'disputes' AND column_name = 'route_reason') THEN
    ALTER TABLE disputes ADD COLUMN route_reason TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'disputes' AND column_name = 'trader_response') THEN
    ALTER TABLE disputes ADD COLUMN trader_response TEXT CHECK (trader_response IN ('accepted', 'rejected'));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'disputes' AND column_name = 'trader_proof_url') THEN
    ALTER TABLE disputes ADD COLUMN trader_proof_url TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'disputes' AND column_name = 'trader_statement') THEN
    ALTER TABLE disputes ADD COLUMN trader_statement TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'disputes' AND column_name = 'trader_responded_at') THEN
    ALTER TABLE disputes ADD COLUMN trader_responded_at TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'disputes' AND column_name = 'admin_decision') THEN
    ALTER TABLE disputes ADD COLUMN admin_decision TEXT CHECK (admin_decision IN ('approved', 'rejected'));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'disputes' AND column_name = 'admin_note') THEN
    ALTER TABLE disputes ADD COLUMN admin_note TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'disputes' AND column_name = 'admin_resolved_at') THEN
    ALTER TABLE disputes ADD COLUMN admin_resolved_at TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'disputes' AND column_name = 'balance_adjusted') THEN
    ALTER TABLE disputes ADD COLUMN balance_adjusted BOOLEAN DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'disputes' AND column_name = 'adjustment_amount') THEN
    ALTER TABLE disputes ADD COLUMN adjustment_amount DECIMAL(15,2);
  END IF;
END $$;

-- 6. Dispute routing logs
CREATE TABLE IF NOT EXISTS dispute_routing_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID REFERENCES disputes(id),
  trader_id UUID REFERENCES traders(id),
  trader_name TEXT,
  route_source TEXT, -- saved_banks, payin, payout, upi_pool
  route_reason TEXT,
  success BOOLEAN,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispute_routing_dispute ON dispute_routing_logs(dispute_id);

-- 7. Function to credit merchant on payin complete
CREATE OR REPLACE FUNCTION credit_merchant_on_payin(
  p_payin_id UUID,
  p_merchant_id UUID,
  p_trader_id UUID,
  p_amount DECIMAL,
  p_merchant_rate DECIMAL,
  p_trader_rate DECIMAL
) RETURNS JSONB AS $$
DECLARE
  v_merchant_fee DECIMAL;
  v_trader_fee DECIMAL;
  v_merchant_credit DECIMAL;
  v_platform_profit DECIMAL;
BEGIN
  -- Calculate fees
  v_merchant_fee := ROUND((p_amount * p_merchant_rate) / 100, 2);
  v_trader_fee := ROUND((p_amount * p_trader_rate) / 100, 2);
  v_merchant_credit := p_amount - v_merchant_fee;
  v_platform_profit := v_merchant_fee - v_trader_fee;
  
  -- Credit merchant
  UPDATE merchants SET
    available_balance = COALESCE(available_balance, 0) + v_merchant_credit,
    total_payin_volume = COALESCE(total_payin_volume, 0) + p_amount,
    updated_at = now()
  WHERE id = p_merchant_id;
  
  -- Record platform earnings
  INSERT INTO platform_earnings (type, reference_id, merchant_id, trader_id, transaction_amount, merchant_fee, trader_fee, platform_profit)
  VALUES ('payin', p_payin_id, p_merchant_id, p_trader_id, p_amount, v_merchant_fee, v_trader_fee, v_platform_profit);
  
  RETURN jsonb_build_object(
    'merchant_fee', v_merchant_fee,
    'trader_fee', v_trader_fee,
    'merchant_credit', v_merchant_credit,
    'platform_profit', v_platform_profit
  );
END;
$$ LANGUAGE plpgsql;

-- 8. Function to deduct merchant on payout
CREATE OR REPLACE FUNCTION deduct_merchant_on_payout(
  p_payout_id UUID,
  p_merchant_id UUID,
  p_trader_id UUID,
  p_amount DECIMAL,
  p_merchant_rate DECIMAL,
  p_trader_rate DECIMAL
) RETURNS JSONB AS $$
DECLARE
  v_merchant_fee DECIMAL;
  v_trader_fee DECIMAL;
  v_total_deduct DECIMAL;
  v_platform_profit DECIMAL;
  v_current_balance DECIMAL;
BEGIN
  -- Calculate fees
  v_merchant_fee := ROUND((p_amount * p_merchant_rate) / 100, 2);
  v_trader_fee := ROUND((p_amount * p_trader_rate) / 100, 2);
  v_total_deduct := p_amount + v_merchant_fee;
  v_platform_profit := v_merchant_fee - v_trader_fee;
  
  -- Check balance
  SELECT COALESCE(available_balance, 0) INTO v_current_balance FROM merchants WHERE id = p_merchant_id;
  
  IF v_current_balance < v_total_deduct THEN
    RETURN jsonb_build_object('error', 'Insufficient balance', 'required', v_total_deduct, 'available', v_current_balance);
  END IF;
  
  -- Deduct from merchant
  UPDATE merchants SET
    available_balance = available_balance - v_total_deduct,
    total_payout_volume = COALESCE(total_payout_volume, 0) + p_amount,
    updated_at = now()
  WHERE id = p_merchant_id;
  
  -- Record platform earnings
  INSERT INTO platform_earnings (type, reference_id, merchant_id, trader_id, transaction_amount, merchant_fee, trader_fee, platform_profit)
  VALUES ('payout', p_payout_id, p_merchant_id, p_trader_id, p_amount, v_merchant_fee, v_trader_fee, v_platform_profit);
  
  RETURN jsonb_build_object(
    'merchant_fee', v_merchant_fee,
    'trader_fee', v_trader_fee,
    'total_deducted', v_total_deduct,
    'platform_profit', v_platform_profit
  );
END;
$$ LANGUAGE plpgsql;

-- 9. Enable RLS
ALTER TABLE platform_earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_webhook_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispute_routing_logs ENABLE ROW LEVEL SECURITY;

-- Admin can see all
CREATE POLICY "Admin full access platform_earnings" ON platform_earnings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admin full access payout_webhook_queue" ON payout_webhook_queue FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admin full access dispute_routing_logs" ON dispute_routing_logs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Service role bypass
CREATE POLICY "Service role platform_earnings" ON platform_earnings FOR ALL TO service_role USING (true);
CREATE POLICY "Service role payout_webhook_queue" ON payout_webhook_queue FOR ALL TO service_role USING (true);
CREATE POLICY "Service role dispute_routing_logs" ON dispute_routing_logs FOR ALL TO service_role USING (true);

-- 10. View for platform earnings summary
CREATE OR REPLACE VIEW platform_earnings_summary AS
SELECT 
  type,
  DATE(created_at) as date,
  COUNT(*) as transaction_count,
  SUM(transaction_amount) as total_volume,
  SUM(merchant_fee) as total_merchant_fees,
  SUM(trader_fee) as total_trader_fees,
  SUM(platform_profit) as total_profit
FROM platform_earnings
GROUP BY type, DATE(created_at)
ORDER BY date DESC, type;

GRANT SELECT ON platform_earnings_summary TO authenticated;
