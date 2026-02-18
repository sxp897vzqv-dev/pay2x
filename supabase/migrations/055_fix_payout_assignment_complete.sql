-- ═══════════════════════════════════════════════════════════════════════════════
-- PAYOUT ASSIGNMENT FIX - Complete Migration
-- ═══════════════════════════════════════════════════════════════════════════════
-- 
-- RULES:
-- 1. Max assignment = 120% of requested (never over-assign more than 20%)
-- 2. Try single payout match first (within ±20% of requested)
-- 3. Stop at 80% fill threshold
-- 4. Max request amount: ₹1,00,000 (traders can request multiple times up to ₹2,50,000 total)
-- 5. No balance check - traders can request regardless of balance
--
-- Run this in Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 1: Fix main assignment RPC function
-- ═══════════════════════════════════════════════════════════════════════════════

-- Drop existing function
DROP FUNCTION IF EXISTS assign_payouts_to_trader(UUID, NUMERIC);

-- Create new improved function
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
  v_single_match RECORD;
  v_payouts_to_assign UUID[] := ARRAY[]::UUID[];
  v_total_amount NUMERIC := 0;
  v_request_id UUID;
  v_assigned_amount NUMERIC;
  v_remaining_amount NUMERIC;
  v_fully_assigned BOOLEAN;
  
  -- Configuration constants
  c_max_request_amount CONSTANT NUMERIC := 100000;  -- ₹1 lakh max per request
  c_max_cap_percent CONSTANT NUMERIC := 1.20;       -- 120% max assignment (Rule 1)
  c_stop_threshold_percent CONSTANT NUMERIC := 0.80; -- Stop at 80% fill (Rule 5)
  c_single_match_tolerance CONSTANT NUMERIC := 0.20; -- ±20% for single match (Rule 2)
  
  v_max_assignable NUMERIC;
  v_stop_threshold NUMERIC;
  v_single_match_min NUMERIC;
  v_single_match_max NUMERIC;
BEGIN
  -- Validate request amount
  IF p_requested_amount <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid amount'
    );
  END IF;

  -- Rule: Max request is ₹1,00,000 per request
  IF p_requested_amount > c_max_request_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Maximum request amount is ₹1,00,000'
    );
  END IF;

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

  -- Calculate thresholds
  v_max_assignable := p_requested_amount * c_max_cap_percent;        -- 120% cap
  v_stop_threshold := p_requested_amount * c_stop_threshold_percent; -- 80% stop
  v_single_match_min := p_requested_amount * (1 - c_single_match_tolerance); -- 80% of request
  v_single_match_max := p_requested_amount * (1 + c_single_match_tolerance); -- 120% of request

  -- ═══════════════════════════════════════════════════════════════
  -- RULE 2: Try single payout match first (closest within ±20%)
  -- ═══════════════════════════════════════════════════════════════
  SELECT id, amount INTO v_single_match
  FROM payouts
  WHERE status = 'pending' 
    AND trader_id IS NULL
    AND amount BETWEEN v_single_match_min AND v_single_match_max
  ORDER BY ABS(amount - p_requested_amount) ASC  -- Closest match first
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_single_match.id IS NOT NULL THEN
    -- Found a good single match!
    v_payouts_to_assign := ARRAY[v_single_match.id];
    v_total_amount := v_single_match.amount;
  ELSE
    -- ═══════════════════════════════════════════════════════════════
    -- No single match - fill with multiple payouts
    -- RULE 1: Never exceed 120% cap
    -- RULE 5: Stop at 80% fill
    -- ═══════════════════════════════════════════════════════════════
    
    FOR v_payout IN
      SELECT id, amount 
      FROM payouts 
      WHERE status = 'pending' AND trader_id IS NULL
      ORDER BY created_at ASC  -- FIFO
      FOR UPDATE SKIP LOCKED
    LOOP
      -- Check if adding this payout would exceed 120% cap
      IF (v_total_amount + COALESCE(v_payout.amount, 0)) > v_max_assignable THEN
        -- Would exceed cap, skip and try next smaller payout
        CONTINUE;
      END IF;
      
      -- Add this payout
      v_payouts_to_assign := array_append(v_payouts_to_assign, v_payout.id);
      v_total_amount := v_total_amount + COALESCE(v_payout.amount, 0);
      
      -- RULE 5: Stop if we've reached 80% threshold
      IF v_total_amount >= v_stop_threshold THEN
        EXIT;
      END IF;
    END LOOP;
  END IF;

  v_assigned_amount := v_total_amount;
  v_remaining_amount := GREATEST(p_requested_amount - v_total_amount, 0);
  v_fully_assigned := v_total_amount >= v_stop_threshold; -- Consider "full" if we hit 80%+

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
    to_jsonb(v_payouts_to_assign),
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
    'requestedAmount', p_requested_amount,
    'remainingAmount', v_remaining_amount,
    'fullyAssigned', v_fully_assigned,
    'inWaitingList', NOT v_fully_assigned,
    'status', CASE 
      WHEN v_fully_assigned THEN 'fully_assigned'
      WHEN array_length(v_payouts_to_assign, 1) > 0 THEN 'partially_assigned'
      ELSE 'waiting'
    END,
    'rules', jsonb_build_object(
      'maxCap', v_max_assignable,
      'stopThreshold', v_stop_threshold,
      'singleMatchRange', jsonb_build_array(v_single_match_min, v_single_match_max)
    )
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION assign_payouts_to_trader(UUID, NUMERIC) TO authenticated;

-- Add comment
COMMENT ON FUNCTION assign_payouts_to_trader IS 
'Assigns pending payouts to trader with rules:
1. Max assignment = 120% of requested (never over-assign more than 20%)
2. Try single payout match first (within ±20% of requested)
3. Stop at 80% fill threshold
4. Max request amount: ₹1,00,000 per request
5. No balance check required';


-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 2: Fix auto-assign triggers
-- ═══════════════════════════════════════════════════════════════════════════════

-- Drop old triggers
DROP TRIGGER IF EXISTS trigger_auto_assign_new_payout ON payouts;
DROP TRIGGER IF EXISTS trigger_auto_assign_on_reassign ON payouts;
DROP FUNCTION IF EXISTS process_waiting_list_on_new_payout();
DROP FUNCTION IF EXISTS process_waiting_list_on_payout_reassign();
DROP FUNCTION IF EXISTS can_assign_payout_to_request(NUMERIC, NUMERIC, NUMERIC);

-- Function to process waiting list when new payout arrives
CREATE OR REPLACE FUNCTION process_waiting_list_on_new_payout()
RETURNS TRIGGER AS $$
DECLARE
  v_request RECORD;
  v_current_payouts JSONB;
  c_max_cap_percent CONSTANT NUMERIC := 1.20;
  c_stop_threshold_percent CONSTANT NUMERIC := 0.80;
  v_max_assignable NUMERIC;
  v_new_total NUMERIC;
  v_stop_threshold NUMERIC;
BEGIN
  -- Only process if payout is pending and not yet assigned
  IF NEW.status = 'pending' AND NEW.trader_id IS NULL THEN
    
    -- Find oldest waiting request that can take this payout WITHOUT exceeding cap
    FOR v_request IN 
      SELECT *
      FROM payout_requests
      WHERE in_waiting_list = TRUE
        AND remaining_amount > 0
        AND status IN ('waiting', 'partially_assigned', 'pending')
      ORDER BY created_at ASC
    LOOP
      -- Calculate caps for this request
      v_max_assignable := COALESCE(v_request.requested_amount, v_request.amount) * c_max_cap_percent;
      v_new_total := COALESCE(v_request.assigned_amount, 0) + NEW.amount;
      v_stop_threshold := COALESCE(v_request.requested_amount, v_request.amount) * c_stop_threshold_percent;
      
      -- Check if adding this payout would exceed 120% cap
      IF v_new_total > v_max_assignable THEN
        -- Skip this request, try next one
        CONTINUE;
      END IF;
      
      -- Check if request already hit 80% threshold (shouldn't auto-assign more)
      IF COALESCE(v_request.assigned_amount, 0) >= v_stop_threshold THEN
        -- Already satisfied, skip
        CONTINUE;
      END IF;
      
      -- OK to assign! This payout fits within the rules
      NEW.trader_id := v_request.trader_id;
      NEW.payout_request_id := v_request.id;
      NEW.assigned_at := NOW();
      NEW.status := 'assigned';
      
      -- Get current assigned payouts (JSONB array)
      v_current_payouts := COALESCE(v_request.assigned_payouts, '[]'::jsonb);
      
      -- Update the request
      UPDATE payout_requests
      SET 
        assigned_amount = v_new_total,
        remaining_amount = GREATEST(0, COALESCE(requested_amount, amount) - v_new_total),
        assigned_payouts = v_current_payouts || to_jsonb(NEW.id::text),
        last_assigned_at = NOW(),
        -- Consider "full" if we hit 80%+ threshold
        fully_assigned = (v_new_total >= v_stop_threshold),
        in_waiting_list = (v_new_total < v_stop_threshold),
        status = CASE 
          WHEN v_new_total >= v_stop_threshold THEN 'fully_assigned'
          ELSE 'partially_assigned'
        END
      WHERE id = v_request.id;
      
      EXIT; -- Only assign to one request
    END LOOP;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger (BEFORE INSERT so we can modify NEW)
CREATE TRIGGER trigger_auto_assign_new_payout
  BEFORE INSERT ON payouts
  FOR EACH ROW
  EXECUTE FUNCTION process_waiting_list_on_new_payout();

-- Handle when a payout is reassigned to pool
CREATE OR REPLACE FUNCTION process_waiting_list_on_payout_reassign()
RETURNS TRIGGER AS $$
DECLARE
  v_request RECORD;
  v_current_payouts JSONB;
  c_max_cap_percent CONSTANT NUMERIC := 1.20;
  c_stop_threshold_percent CONSTANT NUMERIC := 0.80;
  v_max_assignable NUMERIC;
  v_new_total NUMERIC;
  v_stop_threshold NUMERIC;
BEGIN
  -- Only process if payout changed to pending with no trader
  IF NEW.status = 'pending' AND NEW.trader_id IS NULL 
     AND (OLD.status != 'pending' OR OLD.trader_id IS NOT NULL) THEN
    
    -- Find oldest waiting request that can take this payout WITHOUT exceeding cap
    FOR v_request IN 
      SELECT *
      FROM payout_requests
      WHERE in_waiting_list = TRUE
        AND remaining_amount > 0
        AND status IN ('waiting', 'partially_assigned', 'pending')
      ORDER BY created_at ASC
    LOOP
      -- Calculate caps for this request
      v_max_assignable := COALESCE(v_request.requested_amount, v_request.amount) * c_max_cap_percent;
      v_new_total := COALESCE(v_request.assigned_amount, 0) + NEW.amount;
      v_stop_threshold := COALESCE(v_request.requested_amount, v_request.amount) * c_stop_threshold_percent;
      
      -- Check if adding this payout would exceed 120% cap
      IF v_new_total > v_max_assignable THEN
        CONTINUE; -- Skip, try next request
      END IF;
      
      -- Check if request already satisfied (80%+)
      IF COALESCE(v_request.assigned_amount, 0) >= v_stop_threshold THEN
        CONTINUE; -- Skip
      END IF;
      
      -- OK to assign!
      NEW.trader_id := v_request.trader_id;
      NEW.payout_request_id := v_request.id;
      NEW.assigned_at := NOW();
      NEW.status := 'assigned';
      
      -- Get current assigned payouts (JSONB array)
      v_current_payouts := COALESCE(v_request.assigned_payouts, '[]'::jsonb);
      
      -- Update the request
      UPDATE payout_requests
      SET 
        assigned_amount = v_new_total,
        remaining_amount = GREATEST(0, COALESCE(requested_amount, amount) - v_new_total),
        assigned_payouts = v_current_payouts || to_jsonb(NEW.id::text),
        last_assigned_at = NOW(),
        fully_assigned = (v_new_total >= v_stop_threshold),
        in_waiting_list = (v_new_total < v_stop_threshold),
        status = CASE 
          WHEN v_new_total >= v_stop_threshold THEN 'fully_assigned'
          ELSE 'partially_assigned'
        END
      WHERE id = v_request.id;
      
      EXIT;
    END LOOP;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for updates (reassign to pool)
CREATE TRIGGER trigger_auto_assign_on_reassign
  BEFORE UPDATE ON payouts
  FOR EACH ROW
  EXECUTE FUNCTION process_waiting_list_on_payout_reassign();


-- ═══════════════════════════════════════════════════════════════════════════════
-- DONE! Migration complete.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Summary of rules:
-- ✅ Rule 1: Max 120% of requested amount
-- ✅ Rule 2: Single payout match preferred (±20%)
-- ✅ Rule 5: Stop at 80% threshold
-- ✅ Max request: ₹1,00,000 per request (total cap ₹2,50,000)
-- ✅ No balance check required
