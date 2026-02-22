-- ============================================
-- COMPLETE FIX: Affiliate commission + Backfill
-- Copy this ENTIRE script into Supabase SQL Editor and run
-- ============================================

-- STEP 1: Create/update the credit function
CREATE OR REPLACE FUNCTION credit_affiliate_on_trader_transaction(
  p_trader_id UUID,
  p_transaction_type TEXT,
  p_transaction_id UUID,
  p_transaction_amount DECIMAL,
  p_trader_earning DECIMAL
)
RETURNS JSONB AS $$
DECLARE
  v_affiliate_trader affiliate_traders%ROWTYPE;
  v_affiliate affiliates%ROWTYPE;
  v_affiliate_earning DECIMAL;
BEGIN
  SELECT * INTO v_affiliate_trader FROM affiliate_traders WHERE trader_id = p_trader_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('credited', false, 'reason', 'no_affiliate');
  END IF;
  
  SELECT * INTO v_affiliate FROM affiliates WHERE id = v_affiliate_trader.affiliate_id AND status = 'active';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('credited', false, 'reason', 'affiliate_inactive');
  END IF;
  
  v_affiliate_earning := p_trader_earning * (v_affiliate_trader.commission_rate / 100);
  
  INSERT INTO affiliate_earnings (
    affiliate_id, trader_id, transaction_type, transaction_id, transaction_amount,
    trader_earning, commission_rate, affiliate_earning, status
  ) VALUES (
    v_affiliate.id, p_trader_id, p_transaction_type, p_transaction_id, p_transaction_amount,
    p_trader_earning, v_affiliate_trader.commission_rate, v_affiliate_earning, 'pending'
  );
  
  UPDATE affiliates SET
    total_earned = total_earned + v_affiliate_earning,
    pending_settlement = pending_settlement + v_affiliate_earning,
    updated_at = NOW()
  WHERE id = v_affiliate.id;
  
  UPDATE affiliate_traders SET
    total_commission_earned = total_commission_earned + v_affiliate_earning
  WHERE id = v_affiliate_trader.id;
  
  RETURN jsonb_build_object('credited', true, 'affiliate_id', v_affiliate.id, 'affiliate_earning', v_affiliate_earning);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- STEP 2: Update complete_payin to call affiliate credit
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
  v_merchant_fee NUMERIC;
  v_merchant_net NUMERIC;
  v_usdt_rate NUMERIC;
  v_net_usdt NUMERIC;
  v_new_balance NUMERIC;
  v_affiliate_result JSONB;
BEGIN
  SELECT * INTO v_payin FROM payins WHERE id = p_payin_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Payin not found'); END IF;
  IF v_payin.status != 'pending' THEN RETURN jsonb_build_object('success', false, 'error', 'Payin is not pending'); END IF;
  
  SELECT * INTO v_trader FROM traders WHERE id = v_payin.trader_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Trader not found'); END IF;
  
  SELECT * INTO v_merchant FROM merchants WHERE id = v_payin.merchant_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Merchant not found'); END IF;
  
  v_usdt_rate := COALESCE(v_payin.usdt_rate_at_creation, 95);
  IF v_usdt_rate <= 0 THEN
    SELECT admin_usdt_rate INTO v_usdt_rate FROM tatum_config ORDER BY updated_at DESC NULLS LAST LIMIT 1;
    IF v_usdt_rate IS NULL OR v_usdt_rate <= 0 THEN v_usdt_rate := 95; END IF;
  END IF;
  
  v_commission := v_payin.amount * (COALESCE(v_trader.payin_commission, 0) / 100);
  v_merchant_fee := v_payin.amount * (COALESCE(v_merchant.payin_commission_rate, 0) / 100);
  v_merchant_net := v_payin.amount - v_merchant_fee;
  v_net_usdt := ROUND(v_merchant_net / v_usdt_rate, 2);
  
  UPDATE traders SET 
    balance = balance - v_payin.amount + v_commission,
    commission_balance = commission_balance + v_commission,
    lifetime_earnings = lifetime_earnings + v_commission,
    overall_commission = overall_commission + v_commission,
    updated_at = NOW()
  WHERE id = v_payin.trader_id RETURNING balance INTO v_new_balance;
  
  UPDATE merchants SET 
    balance = balance + v_merchant_net,
    available_balance = COALESCE(available_balance, 0) + v_merchant_net,
    usdt_balance = COALESCE(usdt_balance, 0) + v_net_usdt,
    updated_at = NOW()
  WHERE id = v_payin.merchant_id;
  
  UPDATE payins SET 
    status = 'completed', utr = p_utr, commission = v_commission,
    completed_at = NOW(), completed_by = p_completed_by,
    net_amount_usdt = v_net_usdt, usdt_rate_at_completion = v_usdt_rate
  WHERE id = p_payin_id;
  
  INSERT INTO balance_history (entity_type, entity_id, type, reason, amount, amount_usdt, usdt_rate, note, created_at)
  VALUES ('merchant', v_payin.merchant_id, 'credit', 'payin_completed', v_merchant_net, v_net_usdt, v_usdt_rate, 
    'Payin #' || COALESCE(v_payin.transaction_id, LEFT(p_payin_id::TEXT, 8)), NOW());
  
  UPDATE upi_pool SET 
    completed_today = completed_today + 1, amount_today = amount_today + v_payin.amount,
    success_rate = CASE WHEN (completed_today + failed_today + 1) > 0 
      THEN (completed_today + 1)::NUMERIC / (completed_today + failed_today + 1) * 100 ELSE 100 END,
    last_used_at = NOW()
  WHERE upi_id = v_payin.upi_id;
  
  -- AFFILIATE COMMISSION (the key fix!)
  v_affiliate_result := credit_affiliate_on_trader_transaction(
    v_payin.trader_id, 'payin', p_payin_id, v_payin.amount, v_commission
  );
  
  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance, 'commission_earned', v_commission, 'affiliate', v_affiliate_result);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2-arg overload for backward compatibility
CREATE OR REPLACE FUNCTION complete_payin(p_payin_id UUID, p_trader_id UUID) RETURNS JSONB AS $$
BEGIN
  RETURN complete_payin(p_payin_id, COALESCE((SELECT utr FROM payins WHERE id = p_payin_id), ''), p_trader_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grants
GRANT EXECUTE ON FUNCTION credit_affiliate_on_trader_transaction(UUID, TEXT, UUID, DECIMAL, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION credit_affiliate_on_trader_transaction(UUID, TEXT, UUID, DECIMAL, DECIMAL) TO service_role;
GRANT EXECUTE ON FUNCTION complete_payin(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_payin(UUID, UUID) TO authenticated;

-- STEP 3: Backfill affiliate earnings for ALREADY completed payins
INSERT INTO affiliate_earnings (
  affiliate_id, trader_id, transaction_type, transaction_id,
  transaction_amount, trader_earning, commission_rate, affiliate_earning, status
)
SELECT 
  at.affiliate_id,
  p.trader_id,
  'payin',
  p.id,
  p.amount,
  p.commission,
  at.commission_rate,
  p.commission * (at.commission_rate / 100),
  'pending'
FROM payins p
JOIN affiliate_traders at ON at.trader_id = p.trader_id
WHERE p.status = 'completed'
  AND p.commission > 0
  AND NOT EXISTS (SELECT 1 FROM affiliate_earnings ae WHERE ae.transaction_id = p.id);

-- STEP 4: Update affiliate totals from backfilled data
UPDATE affiliates a SET
  total_earned = COALESCE((
    SELECT SUM(affiliate_earning) FROM affiliate_earnings WHERE affiliate_id = a.id
  ), 0),
  pending_settlement = COALESCE((
    SELECT SUM(affiliate_earning) FROM affiliate_earnings WHERE affiliate_id = a.id AND status = 'pending'
  ), 0),
  updated_at = NOW()
WHERE EXISTS (SELECT 1 FROM affiliate_traders at WHERE at.affiliate_id = a.id);

-- STEP 5: Update affiliate_traders totals
UPDATE affiliate_traders at SET
  total_commission_earned = COALESCE((
    SELECT SUM(affiliate_earning) FROM affiliate_earnings WHERE trader_id = at.trader_id
  ), 0);

-- DONE! Show results
SELECT 
  a.name as affiliate_name,
  a.email as affiliate_email,
  a.total_earned,
  a.pending_settlement,
  (SELECT COUNT(*) FROM affiliate_earnings WHERE affiliate_id = a.id) as earnings_count
FROM affiliates a
WHERE a.email ILIKE '%mathew%';
