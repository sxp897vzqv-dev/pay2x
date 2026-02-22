-- ============================================
-- RUN THIS IN SUPABASE DASHBOARD SQL EDITOR
-- Fixes: Affiliate commission not calculated on payin completion
-- ============================================

-- 1. First ensure the affiliate credit function exists
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
  -- Find if trader has an affiliate
  SELECT * INTO v_affiliate_trader 
  FROM affiliate_traders 
  WHERE trader_id = p_trader_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('credited', false, 'reason', 'no_affiliate');
  END IF;
  
  -- Get affiliate
  SELECT * INTO v_affiliate 
  FROM affiliates 
  WHERE id = v_affiliate_trader.affiliate_id AND status = 'active';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('credited', false, 'reason', 'affiliate_inactive');
  END IF;
  
  -- Calculate affiliate earning (% of trader earning)
  v_affiliate_earning := p_trader_earning * (v_affiliate_trader.commission_rate / 100);
  
  -- Create earning record
  INSERT INTO affiliate_earnings (
    affiliate_id, trader_id,
    transaction_type, transaction_id, transaction_amount,
    trader_earning, commission_rate, affiliate_earning,
    status
  ) VALUES (
    v_affiliate.id, p_trader_id,
    p_transaction_type, p_transaction_id, p_transaction_amount,
    p_trader_earning, v_affiliate_trader.commission_rate, v_affiliate_earning,
    'pending'
  );
  
  -- Update affiliate pending balance
  UPDATE affiliates SET
    total_earned = total_earned + v_affiliate_earning,
    pending_settlement = pending_settlement + v_affiliate_earning,
    updated_at = NOW()
  WHERE id = v_affiliate.id;
  
  -- Update affiliate_traders stats
  UPDATE affiliate_traders SET
    total_commission_earned = total_commission_earned + v_affiliate_earning
  WHERE id = v_affiliate_trader.id;
  
  RETURN jsonb_build_object(
    'credited', true,
    'affiliate_id', v_affiliate.id,
    'affiliate_earning', v_affiliate_earning,
    'commission_rate', v_affiliate_trader.commission_rate
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update complete_payin to call affiliate credit
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
  v_affiliate_result JSONB;
BEGIN
  -- Get payin details
  SELECT * INTO v_payin FROM payins WHERE id = p_payin_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payin not found');
  END IF;
  
  IF v_payin.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payin is not pending');
  END IF;
  
  -- Get trader with commission rate
  SELECT * INTO v_trader FROM traders WHERE id = v_payin.trader_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Trader not found');
  END IF;
  
  -- Get merchant with commission rate
  SELECT * INTO v_merchant FROM merchants WHERE id = v_payin.merchant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Merchant not found');
  END IF;
  
  -- Use USDT rate from payin creation time (NOT current rate)
  v_usdt_rate := v_payin.usdt_rate_at_creation;
  
  -- Fallback to current rate only if not stored at creation
  IF v_usdt_rate IS NULL OR v_usdt_rate <= 0 THEN
    SELECT admin_usdt_rate INTO v_usdt_rate 
    FROM tatum_config 
    ORDER BY updated_at DESC NULLS LAST, id DESC
    LIMIT 1;
  END IF;
  
  IF v_usdt_rate IS NULL OR v_usdt_rate <= 0 THEN
    v_usdt_rate := 95;
  END IF;
  
  -- Calculate commissions (NO defaults - use 0 if not set)
  v_commission := v_payin.amount * (COALESCE(v_trader.payin_commission, 0) / 100);
  v_merchant_commission := COALESCE(v_merchant.payin_commission_rate, 0);
  v_merchant_fee := v_payin.amount * (v_merchant_commission / 100);
  v_merchant_net := v_payin.amount - v_merchant_fee;
  
  -- Calculate USDT value
  v_net_usdt := ROUND(v_merchant_net / v_usdt_rate, 2);
  
  -- Update trader balance
  UPDATE traders
  SET 
    balance = balance - v_payin.amount + v_commission,
    commission_balance = commission_balance + v_commission,
    lifetime_earnings = lifetime_earnings + v_commission,
    overall_commission = overall_commission + v_commission,
    updated_at = NOW()
  WHERE id = v_payin.trader_id
  RETURNING balance, commission_balance INTO v_new_balance, v_new_commission_balance;
  
  -- Credit merchant
  UPDATE merchants
  SET 
    balance = balance + v_merchant_net,
    available_balance = COALESCE(available_balance, 0) + v_merchant_net,
    usdt_balance = COALESCE(usdt_balance, 0) + v_net_usdt,
    updated_at = NOW()
  WHERE id = v_payin.merchant_id
  RETURNING usdt_balance INTO v_new_usdt_balance;
  
  -- Update payin status
  UPDATE payins
  SET 
    status = 'completed',
    utr = p_utr,
    commission = v_commission,
    completed_at = NOW(),
    completed_by = p_completed_by,
    net_amount_usdt = v_net_usdt,
    usdt_rate_at_completion = v_usdt_rate
  WHERE id = p_payin_id;
  
  -- Add to balance_history
  INSERT INTO balance_history (
    entity_type, entity_id, type, reason, amount, 
    amount_usdt, usdt_rate, note, created_at
  ) VALUES (
    'merchant', v_payin.merchant_id, 'credit', 'payin_completed', v_merchant_net,
    v_net_usdt, v_usdt_rate, 
    'Payin #' || COALESCE(v_payin.transaction_id, LEFT(p_payin_id::TEXT, 8)),
    NOW()
  );
  
  -- Update UPI stats
  UPDATE upi_pool
  SET 
    completed_today = completed_today + 1,
    amount_today = amount_today + v_payin.amount,
    success_rate = CASE 
      WHEN (completed_today + failed_today + 1) > 0 
      THEN (completed_today + 1)::NUMERIC / (completed_today + failed_today + 1) * 100 
      ELSE 100 
    END,
    last_used_at = NOW()
  WHERE upi_id = v_payin.upi_id;
  
  -- *** AFFILIATE COMMISSION - NEW! ***
  -- Credit affiliate if trader has one (ONLY for payins)
  v_affiliate_result := credit_affiliate_on_trader_transaction(
    v_payin.trader_id,
    'payin',
    p_payin_id,
    v_payin.amount,
    v_commission  -- trader's commission earned
  );
  
  RETURN jsonb_build_object(
    'success', true, 
    'new_balance', v_new_balance,
    'new_commission_balance', v_new_commission_balance,
    'commission_earned', v_commission,
    'merchant_net_inr', v_merchant_net,
    'merchant_usdt_credit', v_net_usdt,
    'merchant_usdt_balance', v_new_usdt_balance,
    'usdt_rate', v_usdt_rate,
    'affiliate', v_affiliate_result
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Backwards-compatible 2-arg version
CREATE OR REPLACE FUNCTION complete_payin(
  p_payin_id UUID,
  p_trader_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_utr TEXT;
BEGIN
  SELECT utr INTO v_utr FROM payins WHERE id = p_payin_id;
  RETURN complete_payin(p_payin_id, COALESCE(v_utr, ''), p_trader_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Grants
GRANT EXECUTE ON FUNCTION credit_affiliate_on_trader_transaction(UUID, TEXT, UUID, DECIMAL, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION credit_affiliate_on_trader_transaction(UUID, TEXT, UUID, DECIMAL, DECIMAL) TO service_role;
GRANT EXECUTE ON FUNCTION complete_payin(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_payin(UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION complete_payin(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_payin(UUID, UUID) TO service_role;

-- 5. Recreate affiliate_dashboard_view (if missing)
CREATE OR REPLACE VIEW affiliate_dashboard_view AS
SELECT 
  a.id,
  a.name,
  a.email,
  a.phone,
  a.default_commission_rate,
  a.total_earned,
  a.pending_settlement,
  a.total_settled,
  a.status,
  a.created_at,
  (SELECT COUNT(*) FROM affiliate_traders WHERE affiliate_id = a.id) as total_traders,
  (SELECT COALESCE(SUM(affiliate_earning), 0) FROM affiliate_earnings 
   WHERE affiliate_id = a.id AND created_at > NOW() - INTERVAL '30 days') as earnings_30d,
  (SELECT COALESCE(SUM(affiliate_earning), 0) FROM affiliate_earnings 
   WHERE affiliate_id = a.id AND created_at > NOW() - INTERVAL '7 days') as earnings_7d,
  (SELECT COALESCE(SUM(affiliate_earning), 0) FROM affiliate_earnings 
   WHERE affiliate_id = a.id AND created_at >= DATE_TRUNC('month', NOW())) as earnings_this_month
FROM affiliates a;

-- Done!
SELECT 'SUCCESS: Affiliate commission now credits on payin completion' as result;
