-- ============================================================
-- COMBINED MIGRATION: 061 + 062 + 063
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- ============================================================
-- 061: MERCHANT SELF-UPDATE RLS
-- Allows merchants to update their own API keys & webhook config
-- ============================================================

ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Merchants can view own record" ON merchants;
CREATE POLICY "Merchants can view own record" ON merchants
    FOR SELECT TO authenticated
    USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "Merchants can update own record" ON merchants;
CREATE POLICY "Merchants can update own record" ON merchants
    FOR UPDATE TO authenticated
    USING (profile_id = auth.uid())
    WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS "Admins full access to merchants" ON merchants;
CREATE POLICY "Admins full access to merchants" ON merchants
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

ALTER TABLE traders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Traders can view own record" ON traders;
CREATE POLICY "Traders can view own record" ON traders
    FOR SELECT TO authenticated
    USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "Traders can update own record" ON traders;
CREATE POLICY "Traders can update own record" ON traders
    FOR UPDATE TO authenticated
    USING (profile_id = auth.uid())
    WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS "Admins full access to traders" ON traders;
CREATE POLICY "Admins full access to traders" ON traders
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

GRANT SELECT, UPDATE ON merchants TO authenticated;
GRANT SELECT, UPDATE ON traders TO authenticated;

-- ============================================================
-- 062: USDT BALANCE TRACKING COLUMNS
-- ============================================================

ALTER TABLE merchants ADD COLUMN IF NOT EXISTS usdt_balance DECIMAL(18,2) DEFAULT 0;
ALTER TABLE payins ADD COLUMN IF NOT EXISTS net_amount_usdt DECIMAL(18,2);
ALTER TABLE payins ADD COLUMN IF NOT EXISTS usdt_rate_at_completion DECIMAL(10,2);
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS amount_usdt DECIMAL(18,2);
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS usdt_rate_at_creation DECIMAL(10,2);
ALTER TABLE balance_history ADD COLUMN IF NOT EXISTS amount_usdt DECIMAL(18,2);
ALTER TABLE balance_history ADD COLUMN IF NOT EXISTS usdt_rate DECIMAL(10,2);
CREATE INDEX IF NOT EXISTS idx_merchants_usdt_balance ON merchants(usdt_balance);

-- ============================================================
-- 063: COMPLETE_PAYIN WITH USDT TRACKING
-- ============================================================

CREATE OR REPLACE FUNCTION complete_payin(
  p_payin_id UUID,
  p_utr TEXT,
  p_completed_by UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_payin RECORD;
  v_trader RECORD;
  v_merchant RECORD;
  v_commission NUMERIC;
  v_merchant_commission NUMERIC;
  v_merchant_fee NUMERIC;
  v_merchant_net NUMERIC;
  v_usdt_rate NUMERIC;
  v_net_usdt NUMERIC;
  v_new_balance NUMERIC;
  v_new_commission_balance NUMERIC;
  v_new_usdt_balance NUMERIC;
BEGIN
  SELECT * INTO v_payin FROM payins WHERE id = p_payin_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Payin not found'); END IF;
  IF v_payin.status != 'pending' THEN RETURN jsonb_build_object('success', false, 'error', 'Payin is not pending'); END IF;
  
  SELECT * INTO v_trader FROM traders WHERE id = v_payin.trader_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Trader not found'); END IF;
  
  SELECT * INTO v_merchant FROM merchants WHERE id = v_payin.merchant_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Merchant not found'); END IF;
  
  -- Get USDT rate
  SELECT admin_usdt_rate INTO v_usdt_rate FROM tatum_config ORDER BY updated_at DESC NULLS LAST, id DESC LIMIT 1;
  IF v_usdt_rate IS NULL OR v_usdt_rate <= 0 THEN v_usdt_rate := 95; END IF;
  
  -- Calculate commissions
  v_commission := v_payin.amount * (COALESCE(v_trader.payin_commission, 4) / 100);
  v_merchant_commission := COALESCE(v_merchant.payin_commission_rate, 2);
  v_merchant_fee := v_payin.amount * (v_merchant_commission / 100);
  v_merchant_net := v_payin.amount - v_merchant_fee;
  v_net_usdt := ROUND(v_merchant_net / v_usdt_rate, 2);
  
  -- Update trader balance
  UPDATE traders SET 
    balance = balance - v_payin.amount + v_commission,
    commission_balance = commission_balance + v_commission,
    lifetime_earnings = lifetime_earnings + v_commission,
    overall_commission = overall_commission + v_commission,
    updated_at = NOW()
  WHERE id = v_payin.trader_id
  RETURNING balance, commission_balance INTO v_new_balance, v_new_commission_balance;
  
  -- Credit merchant (INR + USDT)
  UPDATE merchants SET 
    balance = balance + v_merchant_net,
    available_balance = COALESCE(available_balance, 0) + v_merchant_net,
    usdt_balance = COALESCE(usdt_balance, 0) + v_net_usdt,
    updated_at = NOW()
  WHERE id = v_payin.merchant_id
  RETURNING usdt_balance INTO v_new_usdt_balance;
  
  -- Update payin with USDT info
  UPDATE payins SET 
    status = 'completed', utr = p_utr, commission = v_commission, completed_at = NOW(), completed_by = p_completed_by,
    net_amount_usdt = v_net_usdt, usdt_rate_at_completion = v_usdt_rate
  WHERE id = p_payin_id;
  
  -- Balance history entry
  INSERT INTO balance_history (entity_type, entity_id, type, reason, amount, amount_usdt, usdt_rate, note, created_at)
  VALUES ('merchant', v_payin.merchant_id, 'credit', 'payin_completed', v_merchant_net, v_net_usdt, v_usdt_rate, 
    'Payin #' || COALESCE(v_payin.transaction_id, LEFT(p_payin_id::TEXT, 8)), NOW());
  
  -- UPI stats
  UPDATE upi_pool SET 
    completed_today = completed_today + 1, amount_today = amount_today + v_payin.amount,
    success_rate = CASE WHEN (completed_today + failed_today + 1) > 0 
      THEN (completed_today + 1)::NUMERIC / (completed_today + failed_today + 1) * 100 ELSE 100 END,
    last_used_at = NOW()
  WHERE upi_id = v_payin.upi_id;
  
  RETURN jsonb_build_object(
    'success', true, 'new_balance', v_new_balance, 'new_commission_balance', v_new_commission_balance,
    'commission_earned', v_commission, 'merchant_net_inr', v_merchant_net,
    'merchant_usdt_credit', v_net_usdt, 'merchant_usdt_balance', v_new_usdt_balance, 'usdt_rate', v_usdt_rate
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Backwards-compatible overload
CREATE OR REPLACE FUNCTION complete_payin(p_payin_id UUID, p_trader_id UUID)
RETURNS JSONB AS $$
DECLARE v_utr TEXT;
BEGIN
  SELECT utr INTO v_utr FROM payins WHERE id = p_payin_id;
  RETURN complete_payin(p_payin_id, COALESCE(v_utr, ''), p_trader_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION complete_payin(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_payin(UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION complete_payin(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_payin(UUID, UUID) TO service_role;

-- ============================================================
-- ✅ DONE! All 3 migrations applied.
-- ============================================================
