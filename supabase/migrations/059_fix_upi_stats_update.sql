-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX: Update UPI Pool Stats on Payin Completion
-- ═══════════════════════════════════════════════════════════════════════════════

-- Function to update UPI stats when payin completes
CREATE OR REPLACE FUNCTION update_upi_stats_on_payin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only trigger on status change to completed/rejected/expired
  IF OLD.status = 'pending' AND NEW.status IN ('completed', 'rejected', 'expired') THEN
    
    IF NEW.status = 'completed' THEN
      -- SUCCESS: Update UPI pool stats
      UPDATE upi_pool SET
        last_used_at = NOW(),
        daily_count = COALESCE(daily_count, 0) + 1,
        daily_volume = COALESCE(daily_volume, 0) + NEW.amount,
        daily_success = COALESCE(daily_success, 0) + 1,
        total_count = COALESCE(total_count, 0) + 1,
        total_volume = COALESCE(total_volume, 0) + NEW.amount,
        total_success = COALESCE(total_success, 0) + 1,
        consecutive_successes = COALESCE(consecutive_successes, 0) + 1,
        consecutive_failures = 0,
        hourly_failures = 0,
        success_rate = CASE 
          WHEN COALESCE(total_count, 0) = 0 THEN 100
          ELSE ((COALESCE(total_success, 0) + 1)::numeric / (COALESCE(total_count, 0) + 1)::numeric * 100)
        END
      WHERE upi_id = NEW.upi_id AND trader_id = NEW.trader_id;
      
    ELSIF NEW.status IN ('rejected', 'expired') THEN
      -- FAILURE: Update failure stats
      UPDATE upi_pool SET
        last_used_at = NOW(),
        daily_count = COALESCE(daily_count, 0) + 1,
        daily_failed = COALESCE(daily_failed, 0) + 1,
        total_count = COALESCE(total_count, 0) + 1,
        total_failed = COALESCE(total_failed, 0) + 1,
        hourly_failures = COALESCE(hourly_failures, 0) + 1,
        consecutive_successes = 0,
        consecutive_failures = COALESCE(consecutive_failures, 0) + 1,
        success_rate = CASE 
          WHEN COALESCE(total_count, 0) = 0 THEN 100
          ELSE (COALESCE(total_success, 0)::numeric / (COALESCE(total_count, 0) + 1)::numeric * 100)
        END
      WHERE upi_id = NEW.upi_id AND trader_id = NEW.trader_id;
    END IF;
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS trigger_update_upi_stats ON payins;

-- Create trigger
CREATE TRIGGER trigger_update_upi_stats
  AFTER UPDATE ON payins
  FOR EACH ROW
  EXECUTE FUNCTION update_upi_stats_on_payin();

-- Also update stats on INSERT with initial last_used_at
CREATE OR REPLACE FUNCTION set_upi_last_used_on_payin_create()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When payin is created, mark UPI as recently used (for cooldown)
  UPDATE upi_pool SET last_used_at = NOW()
  WHERE upi_id = NEW.upi_id AND trader_id = NEW.trader_id;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_set_upi_used ON payins;

CREATE TRIGGER trigger_set_upi_used
  AFTER INSERT ON payins
  FOR EACH ROW
  EXECUTE FUNCTION set_upi_last_used_on_payin_create();

COMMENT ON FUNCTION update_upi_stats_on_payin IS 'Updates UPI pool stats (success rate, daily count, last_used_at) when payin completes';
