-- Migration: Auto-assign new payouts to waiting trader requests
-- When a new payout is created (pending, no trader), check waiting list and assign

-- Function to process waiting list when new payout arrives
CREATE OR REPLACE FUNCTION process_waiting_list_on_new_payout()
RETURNS TRIGGER AS $$
DECLARE
  v_request RECORD;
  v_assigned BOOLEAN := FALSE;
BEGIN
  -- Only process if payout is pending and not yet assigned
  IF NEW.status = 'pending' AND NEW.trader_id IS NULL THEN
    
    -- Find oldest waiting request that can take this payout
    FOR v_request IN 
      SELECT *
      FROM payout_requests
      WHERE in_waiting_list = TRUE
        AND remaining_amount > 0
        AND status IN ('partially_assigned', 'pending')
      ORDER BY created_at ASC
      LIMIT 1
    LOOP
      -- Assign this payout to the trader
      NEW.trader_id := v_request.trader_id;
      NEW.payout_request_id := v_request.id;
      NEW.assigned_at := NOW();
      NEW.status := 'assigned';
      
      -- Update the request
      UPDATE payout_requests
      SET 
        assigned_amount = COALESCE(assigned_amount, 0) + NEW.amount,
        remaining_amount = GREATEST(0, remaining_amount - NEW.amount),
        assigned_payouts = COALESCE(assigned_payouts, ARRAY[]::UUID[]) || ARRAY[NEW.id],
        last_assigned_at = NOW(),
        fully_assigned = (GREATEST(0, remaining_amount - NEW.amount) <= 0),
        in_waiting_list = (GREATEST(0, remaining_amount - NEW.amount) > 0),
        status = CASE 
          WHEN GREATEST(0, remaining_amount - NEW.amount) <= 0 THEN 'fully_assigned'
          ELSE 'partially_assigned'
        END
      WHERE id = v_request.id;
      
      v_assigned := TRUE;
      EXIT; -- Only assign to one request
    END LOOP;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS trigger_auto_assign_new_payout ON payouts;

-- Create trigger (BEFORE INSERT so we can modify NEW)
CREATE TRIGGER trigger_auto_assign_new_payout
  BEFORE INSERT ON payouts
  FOR EACH ROW
  EXECUTE FUNCTION process_waiting_list_on_new_payout();

-- Also handle when a payout is reassigned to pool (status changed back to pending, trader_id set to null)
CREATE OR REPLACE FUNCTION process_waiting_list_on_payout_reassign()
RETURNS TRIGGER AS $$
DECLARE
  v_request RECORD;
BEGIN
  -- Only process if payout changed to pending with no trader
  IF NEW.status = 'pending' AND NEW.trader_id IS NULL 
     AND (OLD.status != 'pending' OR OLD.trader_id IS NOT NULL) THEN
    
    -- Find oldest waiting request
    FOR v_request IN 
      SELECT *
      FROM payout_requests
      WHERE in_waiting_list = TRUE
        AND remaining_amount > 0
        AND status IN ('partially_assigned', 'pending')
      ORDER BY created_at ASC
      LIMIT 1
    LOOP
      -- Assign this payout to the trader
      NEW.trader_id := v_request.trader_id;
      NEW.payout_request_id := v_request.id;
      NEW.assigned_at := NOW();
      NEW.status := 'assigned';
      
      -- Update the request
      UPDATE payout_requests
      SET 
        assigned_amount = COALESCE(assigned_amount, 0) + NEW.amount,
        remaining_amount = GREATEST(0, remaining_amount - NEW.amount),
        assigned_payouts = COALESCE(assigned_payouts, ARRAY[]::UUID[]) || ARRAY[NEW.id],
        last_assigned_at = NOW(),
        fully_assigned = (GREATEST(0, remaining_amount - NEW.amount) <= 0),
        in_waiting_list = (GREATEST(0, remaining_amount - NEW.amount) > 0),
        status = CASE 
          WHEN GREATEST(0, remaining_amount - NEW.amount) <= 0 THEN 'fully_assigned'
          ELSE 'partially_assigned'
        END
      WHERE id = v_request.id;
      
      EXIT;
    END LOOP;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS trigger_auto_assign_on_reassign ON payouts;

-- Create trigger for updates (reassign to pool)
CREATE TRIGGER trigger_auto_assign_on_reassign
  BEFORE UPDATE ON payouts
  FOR EACH ROW
  EXECUTE FUNCTION process_waiting_list_on_payout_reassign();

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION process_waiting_list_on_new_payout() TO service_role;
GRANT EXECUTE ON FUNCTION process_waiting_list_on_payout_reassign() TO service_role;
