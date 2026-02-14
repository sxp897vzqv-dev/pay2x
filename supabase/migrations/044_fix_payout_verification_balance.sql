-- Fix: Payout verification should credit trader with AMOUNT + COMMISSION
-- Trader pays from own pocket, gets reimbursed + earns commission

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
  v_total_commission NUMERIC := 0;
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

  -- Get trader
  SELECT * INTO v_trader FROM traders WHERE id = v_request.trader_id;
  IF v_trader IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Trader not found');
  END IF;

  -- Calculate totals from completed payouts
  SELECT 
    COALESCE(SUM(amount), 0),
    COALESCE(SUM(amount * COALESCE(v_trader.payout_commission, 1) / 100), 0)
  INTO v_total_amount, v_total_commission
  FROM payouts 
  WHERE payout_request_id = p_request_id 
  AND status = 'completed';

  -- Total credit = amount (reimbursement) + commission (earnings)
  v_total_credit := v_total_amount + v_total_commission;

  -- Update request
  UPDATE payout_requests SET
    verification_status = 'verified',
    status = 'completed',
    verified_at = NOW(),
    verified_by = p_admin_id
  WHERE id = p_request_id;

  -- Update all payouts in this request
  UPDATE payouts SET
    verification_status = 'verified',
    commission = amount * COALESCE(v_trader.payout_commission, 1) / 100
  WHERE payout_request_id = p_request_id
  AND status = 'completed';

  -- Credit trader balance: AMOUNT + COMMISSION
  UPDATE traders SET
    balance = balance + v_total_credit,
    overall_commission = COALESCE(overall_commission, 0) + v_total_commission
  WHERE id = v_request.trader_id;

  RETURN jsonb_build_object(
    'success', true,
    'totalAmount', v_total_amount,
    'commissionEarned', v_total_commission,
    'totalCredited', v_total_credit
  );
END;
$$;

-- Also fix the individual payout verification approval function
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
    v_commission DECIMAL;
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
    
    -- Get trader and calculate amounts
    SELECT * INTO v_trader FROM traders WHERE id = v_payout.trader_id;
    v_amount := v_payout.amount;
    -- Use trader's payout commission rate
    v_commission := ROUND(v_amount * COALESCE(v_trader.payout_commission, 1) / 100, 2);
    v_old_balance := COALESCE(v_trader.balance, 0);
    
    -- FIX: Credit BOTH payout amount AND commission
    v_total_credit := v_amount + v_commission;
    v_new_balance := v_old_balance + v_total_credit;
    
    -- Update payout status
    UPDATE payouts SET
        verification_status = 'approved',
        status = 'completed',
        verified_by = auth.uid(),
        verified_at = NOW(),
        verification_notes = p_notes,
        commission = v_commission,
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_payout_id;
    
    -- Credit trader balance (amount + commission)
    UPDATE traders SET
        balance = v_new_balance,
        overall_commission = COALESCE(overall_commission, 0) + v_commission,
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
            'commission', v_commission,
            'total_credit', v_total_credit,
            'old_balance', v_old_balance,
            'new_balance', v_new_balance
        )
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'amount', v_amount,
        'commission', v_commission,
        'totalCredited', v_total_credit,
        'newBalance', v_new_balance
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
