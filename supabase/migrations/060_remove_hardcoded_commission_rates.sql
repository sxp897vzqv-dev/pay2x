-- Migration 060: Remove ALL hardcoded commission rate defaults
-- Commission rates MUST come from their respective tables:
--   - Merchant rate: merchants.payin_commission_rate, merchants.payout_commission_rate
--   - Trader rate: traders.payin_commission, traders.payout_commission
-- If not set, rate should be 0 (no commission), NOT a hardcoded default

-- Fix complete_payin function
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
  
  -- Get merchant and their rate (NO hardcoded default)
  SELECT * INTO v_merchant FROM merchants WHERE id = v_payin.merchant_id;
  IF v_merchant IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Merchant not found');
  END IF;
  v_merchant_rate := COALESCE(v_merchant.payin_commission_rate, 0);
  
  -- Get trader and their rate (NO hardcoded default)
  SELECT * INTO v_trader FROM traders WHERE id = p_trader_id;
  IF v_trader IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Trader not found');
  END IF;
  v_trader_rate := COALESCE(v_trader.payin_commission, 0);
  
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
  
  -- 4. Record platform earnings (optional)
  BEGIN
    INSERT INTO platform_earnings (
      type, reference_id, merchant_id, trader_id, 
      transaction_amount, merchant_fee, trader_fee, platform_profit
    ) VALUES (
      'payin', p_payin_id, v_payin.merchant_id, p_trader_id,
      v_payin.amount, v_merchant_fee, v_trader_commission, v_platform_profit
    );
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  
  RETURN jsonb_build_object(
    'success', true,
    'amount', v_payin.amount,
    'merchantRate', v_merchant_rate,
    'traderRate', v_trader_rate,
    'merchantFee', v_merchant_fee,
    'merchantCredit', v_merchant_credit,
    'traderCommission', v_trader_commission,
    'traderDeduction', v_payin.amount - v_trader_commission,
    'platformProfit', v_platform_profit
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix approve_batch_verification (no hardcoded defaults)
CREATE OR REPLACE FUNCTION approve_batch_verification(
  p_request_id UUID,
  p_admin_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_trader RECORD;
  v_total_amount NUMERIC := 0;
  v_total_merchant_fee NUMERIC := 0;
  v_total_trader_earnings NUMERIC := 0;
  v_total_credit NUMERIC := 0;
  v_trader_rate NUMERIC;
BEGIN
  SELECT * INTO v_request FROM payout_requests WHERE id = p_request_id;
  IF v_request IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;

  IF v_request.verification_status != 'pending_review' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not pending review');
  END IF;

  SELECT * INTO v_trader FROM traders WHERE id = v_request.trader_id;
  IF v_trader IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Trader not found');
  END IF;

  -- Get trader's payout commission rate from their record
  v_trader_rate := COALESCE(v_trader.payout_commission, 0);

  -- commission column has merchant fee from create-payout
  -- trader earnings = amount * trader.payout_commission / 100
  SELECT 
    COALESCE(SUM(amount), 0),
    COALESCE(SUM(commission), 0),
    COALESCE(SUM(amount * v_trader_rate / 100), 0)
  INTO v_total_amount, v_total_merchant_fee, v_total_trader_earnings
  FROM payouts 
  WHERE payout_request_id = p_request_id 
  AND status = 'completed';

  v_total_credit := v_total_amount + v_total_trader_earnings;

  UPDATE payout_requests SET
    verification_status = 'verified',
    status = 'completed',
    verified_at = NOW(),
    verified_by = p_admin_id
  WHERE id = p_request_id;

  -- DO NOT overwrite commission - it's the merchant fee
  UPDATE payouts SET
    verification_status = 'verified'
  WHERE payout_request_id = p_request_id
  AND status = 'completed';

  UPDATE traders SET
    balance = balance + v_total_credit,
    overall_commission = COALESCE(overall_commission, 0) + v_total_trader_earnings
  WHERE id = v_request.trader_id;

  RETURN jsonb_build_object(
    'success', true,
    'totalAmount', v_total_amount,
    'merchantFee', v_total_merchant_fee,
    'traderEarnings', v_total_trader_earnings,
    'traderCommissionRate', v_trader_rate,
    'totalCredited', v_total_credit
  );
END;
$$;

-- Fix approve_payout_verification (no hardcoded defaults)
CREATE OR REPLACE FUNCTION approve_payout_verification(
    p_payout_id UUID,
    p_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_payout payouts%ROWTYPE;
    v_trader traders%ROWTYPE;
    v_worker_role TEXT;
    v_old_balance DECIMAL;
    v_new_balance DECIMAL;
    v_amount DECIMAL;
    v_merchant_fee DECIMAL;
    v_trader_rate DECIMAL;
    v_trader_earnings DECIMAL;
    v_total_credit DECIMAL;
BEGIN
    SELECT role INTO v_worker_role FROM profiles WHERE id = auth.uid();
    IF v_worker_role NOT IN ('admin', 'worker') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;
    
    IF v_worker_role = 'worker' THEN
        IF NOT EXISTS (
            SELECT 1 FROM workers 
            WHERE profile_id = auth.uid() 
            AND 'payout_verification' = ANY(permissions)
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Missing payout_verification permission');
        END IF;
    END IF;
    
    SELECT * INTO v_payout FROM payouts WHERE id = p_payout_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout not found');
    END IF;
    
    IF v_payout.verification_status != 'pending_verification' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout not pending verification');
    END IF;
    
    SELECT * INTO v_trader FROM traders WHERE id = v_payout.trader_id;
    v_amount := v_payout.amount;
    
    -- Merchant fee from payout.commission (set at creation)
    v_merchant_fee := COALESCE(v_payout.commission, 0);
    
    -- Trader rate from traders table (NO hardcoded default)
    v_trader_rate := COALESCE(v_trader.payout_commission, 0);
    v_trader_earnings := ROUND(v_amount * v_trader_rate / 100, 2);
    
    v_old_balance := COALESCE(v_trader.balance, 0);
    v_total_credit := v_amount + v_trader_earnings;
    v_new_balance := v_old_balance + v_total_credit;
    
    UPDATE payouts SET
        verification_status = 'approved',
        status = 'completed',
        verified_by = auth.uid(),
        verified_at = NOW(),
        verification_notes = p_notes,
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_payout_id;
    
    UPDATE traders SET
        balance = v_new_balance,
        overall_commission = COALESCE(overall_commission, 0) + v_trader_earnings,
        updated_at = NOW()
    WHERE id = v_payout.trader_id;
    
    INSERT INTO payout_verification_logs (
        payout_id, action, actor_id, actor_role,
        old_status, new_status, notes, metadata
    ) VALUES (
        p_payout_id, 'approved', auth.uid(), v_worker_role,
        'pending_verification', 'approved', p_notes,
        jsonb_build_object(
            'amount', v_amount,
            'merchant_fee', v_merchant_fee,
            'trader_commission_rate', v_trader_rate,
            'trader_earnings', v_trader_earnings,
            'total_credit', v_total_credit,
            'old_balance', v_old_balance,
            'new_balance', v_new_balance
        )
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'amount', v_amount,
        'merchantFee', v_merchant_fee,
        'traderCommissionRate', v_trader_rate,
        'traderEarnings', v_trader_earnings,
        'totalCredited', v_total_credit,
        'newBalance', v_new_balance
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION complete_payin(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_payin(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION approve_batch_verification(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION approve_payout_verification(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION complete_payin IS 'Complete a payin - rates from merchants.payin_commission_rate and traders.payin_commission';
COMMENT ON FUNCTION approve_batch_verification IS 'Verify batch payout - merchant fee from payout.commission, trader rate from traders.payout_commission';
COMMENT ON FUNCTION approve_payout_verification IS 'Verify single payout - merchant fee preserved, trader rate from traders.payout_commission';
