-- Migration 053: Deduct merchant balance when payout is completed
-- Balance is deducted ONLY when payout status changes to 'completed'

CREATE OR REPLACE FUNCTION handle_payout_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_deduct DECIMAL;
BEGIN
  -- Only trigger when status changes TO 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- Calculate total to deduct (amount + commission)
    v_total_deduct := COALESCE(NEW.amount, 0) + COALESCE(NEW.commission, 0);
    
    -- Deduct from merchant balance
    UPDATE merchants
    SET 
      available_balance = COALESCE(available_balance, 0) - v_total_deduct,
      updated_at = NOW()
    WHERE id = NEW.merchant_id;
    
    -- Log the deduction
    INSERT INTO admin_logs (action, entity_type, entity_id, details, created_at)
    VALUES (
      'payout_completed',
      'payout',
      NEW.id,
      jsonb_build_object(
        'merchant_id', NEW.merchant_id,
        'amount', NEW.amount,
        'commission', NEW.commission,
        'total_deducted', v_total_deduct
      ),
      NOW()
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS trigger_payout_completion ON payouts;

-- Create trigger
CREATE TRIGGER trigger_payout_completion
  AFTER UPDATE ON payouts
  FOR EACH ROW
  EXECUTE FUNCTION handle_payout_completion();

-- Also handle INSERT with status='completed' (edge case)
DROP TRIGGER IF EXISTS trigger_payout_insert_completed ON payouts;

CREATE TRIGGER trigger_payout_insert_completed
  AFTER INSERT ON payouts
  FOR EACH ROW
  WHEN (NEW.status = 'completed')
  EXECUTE FUNCTION handle_payout_completion();

COMMENT ON FUNCTION handle_payout_completion IS 'Deducts merchant balance when payout is marked as completed';
