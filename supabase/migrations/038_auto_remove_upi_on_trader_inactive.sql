-- Auto-remove UPIs from pool when trader is deactivated or deleted
-- saved_banks already has UPIs from payin history (for dispute routing)

-- Function to handle trader status changes
CREATE OR REPLACE FUNCTION handle_trader_status_change()
RETURNS TRIGGER AS $$
DECLARE
  removed_count INT;
BEGIN
  -- If trader is being deactivated or soft-deleted
  IF (NEW.is_active = FALSE AND OLD.is_active = TRUE) 
     OR (NEW.is_deleted = TRUE AND (OLD.is_deleted IS NULL OR OLD.is_deleted = FALSE)) THEN
    
    -- Remove from active upi_pool
    DELETE FROM upi_pool WHERE trader_id = NEW.id;
    GET DIAGNOSTICS removed_count = ROW_COUNT;
    
    RAISE NOTICE 'Removed % UPIs from pool for trader %', removed_count, NEW.id;
  END IF;
  
  -- If trader is being reactivated, we don't auto-restore UPIs
  -- Admin must manually add them back to upi_pool
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_trader_status_change ON traders;
CREATE TRIGGER trigger_trader_status_change
  AFTER UPDATE ON traders
  FOR EACH ROW
  WHEN (OLD.is_active IS DISTINCT FROM NEW.is_active 
        OR OLD.is_deleted IS DISTINCT FROM NEW.is_deleted)
  EXECUTE FUNCTION handle_trader_status_change();

COMMENT ON FUNCTION handle_trader_status_change() IS 
  'Automatically removes trader UPIs from pool when deactivated/deleted';
