-- Fix: Complete payin flow - credits merchant AND trader correctly
-- Called when trader accepts/completes a payin

CREATE OR REPLACE FUNCTION complete_payin(
  p_payin_id UUID,
  p_trader_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_payin RECORD;
  v_merchant RECORD;
  v_trader RECORD;
  v_merchant_rate DECIMAL;
  v_trader_rate DECIMAL;
  v_merchant_fee DECIMAL;
  v_trader_commission DECIMAL;
  v_merchant_credit DECIMAL;
  v_platform_profit DECIMAL;
BEGIN
  -- Get payin
  SELECT * INTO v_payin FROM payins WHERE id = p_payin_id;
  IF v_payin IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payin not found');
  END IF;
  
  IF v_payin.status = 'completed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payin already completed');
  END IF;
  
  -- Verify trader
  IF v_payin.trader_id != p_trader_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
  
  -- Get merchant and their rate
  SELECT * INTO v_merchant FROM merchants WHERE id = v_payin.merchant_id;
  IF v_merchant IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Merchant not found');
  END IF;
  v_merchant_rate := COALESCE(v_merchant.payin_commission, v_merchant.payin_commission_rate, 6);
  
  -- Get trader and their rate
  SELECT * INTO v_trader FROM traders WHERE id = p_trader_id;
  IF v_trader IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Trader not found');
  END IF;
  v_trader_rate := COALESCE(v_trader.payin_commission, 4);
  
  -- Calculate fees
  v_merchant_fee := ROUND((v_payin.amount * v_merchant_rate) / 100, 2);
  v_trader_commission := ROUND((v_payin.amount * v_trader_rate) / 100, 2);
  v_merchant_credit := v_payin.amount - v_merchant_fee;
  v_platform_profit := v_merchant_fee - v_trader_commission;
  
  -- 1. Update payin status
  UPDATE payins SET
    status = 'completed',
    completed_at = NOW(),
    commission = v_trader_commission,
    updated_at = NOW()
  WHERE id = p_payin_id;
  
  -- 2. Credit merchant balance
  UPDATE merchants SET
    available_balance = COALESCE(available_balance, 0) + v_merchant_credit,
    balance = COALESCE(balance, 0) + v_merchant_credit,
    total_payin_volume = COALESCE(total_payin_volume, 0) + v_payin.amount,
    updated_at = NOW()
  WHERE id = v_payin.merchant_id;
  
  -- 3. Deduct amount (trader received cash in bank), add commission
  UPDATE traders SET
    balance = COALESCE(balance, 0) - v_payin.amount + v_trader_commission,
    overall_commission = COALESCE(overall_commission, 0) + v_trader_commission,
    updated_at = NOW()
  WHERE id = p_trader_id;
  
  -- 4. Record platform earnings (optional - if table exists)
  BEGIN
    INSERT INTO platform_earnings (
      type, reference_id, merchant_id, trader_id, 
      transaction_amount, merchant_fee, trader_fee, platform_profit
    ) VALUES (
      'payin', p_payin_id, v_payin.merchant_id, p_trader_id,
      v_payin.amount, v_merchant_fee, v_trader_commission, v_platform_profit
    );
  EXCEPTION WHEN undefined_table THEN
    -- Table doesn't exist, skip
    NULL;
  END;
  
  RETURN jsonb_build_object(
    'success', true,
    'amount', v_payin.amount,
    'merchantCredit', v_merchant_credit,
    'traderCommission', v_trader_commission,
    'traderDeduction', v_payin.amount - v_trader_commission,
    'platformProfit', v_platform_profit
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION complete_payin(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_payin(UUID, UUID) TO service_role;
