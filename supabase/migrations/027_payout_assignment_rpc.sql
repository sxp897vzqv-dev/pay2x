-- Migration: RPC functions for payout assignment
-- These run with SECURITY DEFINER to bypass RLS for assignment operations

-- Function: Assign payouts to trader
CREATE OR REPLACE FUNCTION assign_payouts_to_trader(
  p_trader_id UUID,
  p_requested_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout RECORD;
  v_payouts_to_assign UUID[] := ARRAY[]::UUID[];
  v_total_amount NUMERIC := 0;
  v_request_id UUID;
  v_assigned_amount NUMERIC;
  v_remaining_amount NUMERIC;
  v_fully_assigned BOOLEAN;
BEGIN
  -- Verify trader exists and is active
  IF NOT EXISTS (
    SELECT 1 FROM traders 
    WHERE id = p_trader_id AND is_active = true
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Trader not found or inactive'
    );
  END IF;

  -- Check for existing active request
  IF EXISTS (
    SELECT 1 FROM payout_requests 
    WHERE trader_id = p_trader_id 
    AND status NOT IN ('completed', 'cancelled')
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'You already have an active payout request'
    );
  END IF;

  -- Check for existing assigned payouts
  IF EXISTS (
    SELECT 1 FROM payouts 
    WHERE trader_id = p_trader_id 
    AND status = 'assigned'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Complete your assigned payouts first'
    );
  END IF;

  -- Select unassigned pending payouts (FIFO) - assign until we exceed requested amount
  FOR v_payout IN
    SELECT id, amount 
    FROM payouts 
    WHERE status = 'pending' AND trader_id IS NULL
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Add this payout first, THEN check if we've exceeded
    v_payouts_to_assign := array_append(v_payouts_to_assign, v_payout.id);
    v_total_amount := v_total_amount + COALESCE(v_payout.amount, 0);
    -- Exit AFTER adding if we've met/exceeded the amount
    EXIT WHEN v_total_amount >= p_requested_amount;
  END LOOP;

  v_assigned_amount := v_total_amount;
  v_remaining_amount := GREATEST(p_requested_amount - v_total_amount, 0);
  v_fully_assigned := v_remaining_amount <= 0;

  -- Create payout request
  INSERT INTO payout_requests (
    trader_id,
    amount,
    requested_amount,
    assigned_amount,
    remaining_amount,
    status,
    assigned_payouts,
    fully_assigned,
    in_waiting_list,
    created_at
  ) VALUES (
    p_trader_id,
    p_requested_amount,
    p_requested_amount,
    v_assigned_amount,
    v_remaining_amount,
    CASE 
      WHEN v_fully_assigned THEN 'fully_assigned'
      WHEN array_length(v_payouts_to_assign, 1) > 0 THEN 'partially_assigned'
      ELSE 'waiting'
    END,
    v_payouts_to_assign,
    v_fully_assigned,
    NOT v_fully_assigned,
    NOW()
  )
  RETURNING id INTO v_request_id;

  -- Assign selected payouts to trader
  IF array_length(v_payouts_to_assign, 1) > 0 THEN
    UPDATE payouts
    SET 
      trader_id = p_trader_id,
      payout_request_id = v_request_id,
      assigned_at = NOW(),
      status = 'assigned'
    WHERE id = ANY(v_payouts_to_assign);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'requestId', v_request_id,
    'assignedCount', COALESCE(array_length(v_payouts_to_assign, 1), 0),
    'assignedAmount', v_assigned_amount,
    'remainingAmount', v_remaining_amount,
    'fullyAssigned', v_fully_assigned,
    'inWaitingList', NOT v_fully_assigned,
    'status', CASE 
      WHEN v_fully_assigned THEN 'fully_assigned'
      WHEN array_length(v_payouts_to_assign, 1) > 0 THEN 'partially_assigned'
      ELSE 'waiting'
    END
  );
END;
$$;

-- Function: Cancel payout by trader (return to pool)
CREATE OR REPLACE FUNCTION cancel_payout_by_trader(
  p_payout_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout RECORD;
  v_request RECORD;
  v_new_assigned_payouts UUID[];
  v_new_assigned_amount NUMERIC;
BEGIN
  -- Get payout and verify ownership
  SELECT * INTO v_payout FROM payouts WHERE id = p_payout_id;
  
  IF v_payout IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payout not found');
  END IF;
  
  IF v_payout.trader_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your payout');
  END IF;
  
  IF v_payout.status != 'assigned' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payout is not in assigned status');
  END IF;

  -- Update payout - return to pool
  UPDATE payouts SET
    status = 'pending',
    trader_id = NULL,
    payout_request_id = NULL,
    assigned_at = NULL,
    cancelled_at = NOW(),
    cancel_reason = p_reason,
    cancelled_by = 'trader'
  WHERE id = p_payout_id;

  -- Update payout request if exists
  IF v_payout.payout_request_id IS NOT NULL THEN
    SELECT * INTO v_request FROM payout_requests WHERE id = v_payout.payout_request_id;
    
    IF v_request IS NOT NULL THEN
      v_new_assigned_payouts := array_remove(v_request.assigned_payouts, p_payout_id);
      v_new_assigned_amount := COALESCE(v_request.assigned_amount, 0) - COALESCE(v_payout.amount, 0);
      
      IF array_length(v_new_assigned_payouts, 1) IS NULL OR array_length(v_new_assigned_payouts, 1) = 0 THEN
        UPDATE payout_requests SET
          assigned_payouts = ARRAY[]::UUID[],
          assigned_amount = 0,
          remaining_amount = requested_amount,
          fully_assigned = false,
          in_waiting_list = true,
          status = 'waiting'
        WHERE id = v_request.id;
      ELSE
        UPDATE payout_requests SET
          assigned_payouts = v_new_assigned_payouts,
          assigned_amount = v_new_assigned_amount,
          remaining_amount = requested_amount - v_new_assigned_amount,
          fully_assigned = (requested_amount - v_new_assigned_amount) <= 0,
          status = CASE 
            WHEN (requested_amount - v_new_assigned_amount) <= 0 THEN 'fully_assigned'
            ELSE 'partially_assigned'
          END
        WHERE id = v_request.id;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Function: Cancel payout request by trader
CREATE OR REPLACE FUNCTION cancel_payout_request_by_trader(
  p_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_assigned_count INT;
BEGIN
  -- Get request and verify ownership
  SELECT * INTO v_request FROM payout_requests WHERE id = p_request_id;
  
  IF v_request IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;
  
  IF v_request.trader_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your request');
  END IF;

  -- Check for assigned payouts
  SELECT COUNT(*) INTO v_assigned_count
  FROM payouts 
  WHERE payout_request_id = p_request_id AND status = 'assigned';
  
  IF v_assigned_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Cannot cancel: ' || v_assigned_count || ' payout(s) still assigned. Cancel them first.'
    );
  END IF;

  -- Cancel the request
  UPDATE payout_requests SET
    status = 'cancelled',
    cancelled_at = NOW(),
    cancelled_by = 'trader'
  WHERE id = p_request_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION assign_payouts_to_trader(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_payout_by_trader(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_payout_request_by_trader(UUID) TO authenticated;
