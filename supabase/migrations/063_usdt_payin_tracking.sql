-- 063: Add USDT tracking to payin completion
-- - Adds usdt_rate_at_creation column to payins (rate captured at payin request)
-- - Updates complete_payin to use the stored rate from payin creation

-- Add column for rate at creation time
ALTER TABLE payins ADD COLUMN IF NOT EXISTS usdt_rate_at_creation DECIMAL(10,2);

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
    v_usdt_rate := 95; -- Last resort fallback
  END IF;
  
  -- Calculate commissions
  v_commission := v_payin.amount * (COALESCE(v_trader.payin_commission, 4) / 100);
  v_merchant_commission := COALESCE(v_merchant.payin_commission_rate, 2);
  v_merchant_fee := v_payin.amount * (v_merchant_commission / 100);
  v_merchant_net := v_payin.amount - v_merchant_fee;
  
  -- Calculate USDT value (based on merchant net after platform commission)
  v_net_usdt := ROUND(v_merchant_net / v_usdt_rate, 2);
  
  -- Update trader: balance - amount (trader receives cash), commission_balance + commission
  UPDATE traders
  SET 
    balance = balance - v_payin.amount + v_commission,
    commission_balance = commission_balance + v_commission,
    lifetime_earnings = lifetime_earnings + v_commission,
    overall_commission = overall_commission + v_commission,
    updated_at = NOW()
  WHERE id = v_payin.trader_id
  RETURNING balance, commission_balance INTO v_new_balance, v_new_commission_balance;
  
  -- Credit merchant: INR balance + USDT balance
  UPDATE merchants
  SET 
    balance = balance + v_merchant_net,
    available_balance = COALESCE(available_balance, 0) + v_merchant_net,
    usdt_balance = COALESCE(usdt_balance, 0) + v_net_usdt,
    updated_at = NOW()
  WHERE id = v_payin.merchant_id
  RETURNING usdt_balance INTO v_new_usdt_balance;
  
  -- Update payin status with USDT info
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
  
  -- Add to balance_history for ledger
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
  
  RETURN jsonb_build_object(
    'success', true, 
    'new_balance', v_new_balance,
    'new_commission_balance', v_new_commission_balance,
    'commission_earned', v_commission,
    'merchant_net_inr', v_merchant_net,
    'merchant_usdt_credit', v_net_usdt,
    'merchant_usdt_balance', v_new_usdt_balance,
    'usdt_rate', v_usdt_rate
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION complete_payin(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_payin(UUID, TEXT, UUID) TO service_role;

-- Also create complete_payin overload for old signature (backwards compatibility)
CREATE OR REPLACE FUNCTION complete_payin(
  p_payin_id UUID,
  p_trader_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_utr TEXT;
BEGIN
  -- Get UTR from payin
  SELECT utr INTO v_utr FROM payins WHERE id = p_payin_id;
  -- Call main function
  RETURN complete_payin(p_payin_id, COALESCE(v_utr, ''), p_trader_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION complete_payin(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_payin(UUID, UUID) TO service_role;
