-- Migration 056: Fix merchant fee preservation
-- Bug: approve_batch_verification was overwriting merchant commission with trader rate
-- Fix: Commission rates ALWAYS read from respective tables, never hardcoded

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
BEGIN
  -- Get request
  SELECT * INTO v_request FROM payout_requests WHERE id = p_request_id;
  IF v_request IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;

  IF v_request.verification_status != 'pending_review' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not pending review');
  END IF;

  -- Get trader with their commission rate
  SELECT * INTO v_trader FROM traders WHERE id = v_request.trader_id;
  IF v_trader IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Trader not found');
  END IF;

  -- Calculate totals from completed payouts
  -- commission column already has the correct MERCHANT fee (set during create-payout from merchant.payout_commission_rate)
  -- trader earnings = amount * trader.payout_commission / 100 (from trader's rate in traders table)
  SELECT 
    COALESCE(SUM(amount), 0),
    COALESCE(SUM(commission), 0),  -- Merchant fee already stored correctly
    COALESCE(SUM(amount * COALESCE(v_trader.payout_commission, 0) / 100), 0)  -- Trader rate from traders table
  INTO v_total_amount, v_total_merchant_fee, v_total_trader_earnings
  FROM payouts 
  WHERE payout_request_id = p_request_id 
  AND status = 'completed';

  -- Total credit to trader = amount (reimbursement) + trader earnings
  v_total_credit := v_total_amount + v_total_trader_earnings;

  -- Update request
  UPDATE payout_requests SET
    verification_status = 'verified',
    status = 'completed',
    verified_at = NOW(),
    verified_by = p_admin_id
  WHERE id = p_request_id;

  -- Update all payouts - DO NOT overwrite commission (it's merchant fee from creation)
  UPDATE payouts SET
    verification_status = 'verified'
  WHERE payout_request_id = p_request_id
  AND status = 'completed';

  -- Credit trader balance: AMOUNT + TRADER EARNINGS (based on trader.payout_commission)
  UPDATE traders SET
    balance = balance + v_total_credit,
    overall_commission = COALESCE(overall_commission, 0) + v_total_trader_earnings
  WHERE id = v_request.trader_id;

  RETURN jsonb_build_object(
    'success', true,
    'totalAmount', v_total_amount,
    'merchantFee', v_total_merchant_fee,
    'traderEarnings', v_total_trader_earnings,
    'traderCommissionRate', COALESCE(v_trader.payout_commission, 0),
    'totalCredited', v_total_credit
  );
END;
$$;

-- Also fix individual payout verification
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
    v_trader_earnings DECIMAL;
    v_total_credit DECIMAL;
BEGIN
    -- Check caller is admin or worker with permission
    SELECT role INTO v_worker_role FROM profiles WHERE id = auth.uid();
    IF v_worker_role NOT IN ('admin', 'worker') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;
    
    -- If worker, check permission
    IF v_worker_role = 'worker' THEN
        IF NOT EXISTS (
            SELECT 1 FROM workers 
            WHERE profile_id = auth.uid() 
            AND 'payout_verification' = ANY(permissions)
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Missing payout_verification permission');
        END IF;
    END IF;
    
    -- Get payout
    SELECT * INTO v_payout FROM payouts WHERE id = p_payout_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout not found');
    END IF;
    
    -- Check status
    IF v_payout.verification_status != 'pending_verification' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout not pending verification');
    END IF;
    
    -- Get trader with their commission rate
    SELECT * INTO v_trader FROM traders WHERE id = v_payout.trader_id;
    v_amount := v_payout.amount;
    
    -- Merchant fee is ALREADY stored correctly in payout.commission (from create-payout)
    v_merchant_fee := COALESCE(v_payout.commission, 0);
    
    -- Trader earnings: use trader.payout_commission from traders table (not hardcoded)
    v_trader_earnings := ROUND(v_amount * COALESCE(v_trader.payout_commission, 0) / 100, 2);
    
    v_old_balance := COALESCE(v_trader.balance, 0);
    
    -- Credit BOTH payout amount AND trader earnings
    v_total_credit := v_amount + v_trader_earnings;
    v_new_balance := v_old_balance + v_total_credit;
    
    -- Update payout status (DO NOT change commission - it's the merchant fee)
    UPDATE payouts SET
        verification_status = 'approved',
        status = 'completed',
        verified_by = auth.uid(),
        verified_at = NOW(),
        verification_notes = p_notes,
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_payout_id;
    
    -- Credit trader balance (amount + trader earnings)
    UPDATE traders SET
        balance = v_new_balance,
        overall_commission = COALESCE(overall_commission, 0) + v_trader_earnings,
        updated_at = NOW()
    WHERE id = v_payout.trader_id;
    
    -- Log verification
    INSERT INTO payout_verification_logs (
        payout_id, action, actor_id, actor_role,
        old_status, new_status, notes, metadata
    ) VALUES (
        p_payout_id, 'approved', auth.uid(), v_worker_role,
        'pending_verification', 'approved', p_notes,
        jsonb_build_object(
            'amount', v_amount,
            'merchant_fee', v_merchant_fee,
            'trader_earnings', v_trader_earnings,
            'trader_commission_rate', COALESCE(v_trader.payout_commission, 0),
            'total_credit', v_total_credit,
            'old_balance', v_old_balance,
            'new_balance', v_new_balance
        )
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'amount', v_amount,
        'merchantFee', v_merchant_fee,
        'traderEarnings', v_trader_earnings,
        'traderCommissionRate', COALESCE(v_trader.payout_commission, 0),
        'totalCredited', v_total_credit,
        'newBalance', v_new_balance
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION approve_batch_verification IS 'Verifies batch payout. Merchant fee from payout.commission (set at creation from merchant.payout_commission_rate). Trader earnings from trader.payout_commission.';
COMMENT ON FUNCTION approve_payout_verification IS 'Verifies single payout. Merchant fee preserved, trader earnings from trader.payout_commission.';
