-- ═══════════════════════════════════════════════════════════════════════════════
-- AUTO-REMOVE UPIs FROM POOL WHEN TRADER BALANCE FALLS BELOW 30K
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Function to remove all UPIs from pool for a trader
CREATE OR REPLACE FUNCTION remove_trader_upis_from_pool(p_trader_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
  v_upi_ids UUID[];
BEGIN
  -- Get UPI IDs to remove
  SELECT ARRAY_AGG(id) INTO v_upi_ids FROM upi_pool WHERE trader_id = p_trader_id;
  
  IF v_upi_ids IS NOT NULL AND array_length(v_upi_ids, 1) > 0 THEN
    -- Nullify references in payins
    UPDATE payins SET upi_pool_id = NULL WHERE upi_pool_id = ANY(v_upi_ids);
    
    -- Nullify references in selection_logs
    UPDATE selection_logs SET upi_pool_id = NULL WHERE upi_pool_id = ANY(v_upi_ids);
    
    -- Remove from upi_pool
    DELETE FROM upi_pool WHERE trader_id = p_trader_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;
  
  -- Update saved_banks to reflect removal
  UPDATE saved_banks 
  SET is_active = false 
  WHERE trader_id = p_trader_id AND is_active = true;
  
  RETURN v_count;
END;
$$;

-- 2. Trigger function: auto-remove UPIs when balance drops below 30k
CREATE OR REPLACE FUNCTION check_trader_balance_for_upi()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_working_balance NUMERIC;
BEGIN
  -- Calculate working balance
  v_working_balance := COALESCE(NEW.balance, 0) - COALESCE(NEW.security_hold, 0);
  
  -- If balance dropped below 30k, remove all UPIs from pool
  IF v_working_balance < 30000 THEN
    PERFORM remove_trader_upis_from_pool(NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS trigger_check_balance_for_upi ON traders;

-- Create trigger on balance update
CREATE TRIGGER trigger_check_balance_for_upi
  AFTER UPDATE OF balance, security_hold ON traders
  FOR EACH ROW
  EXECUTE FUNCTION check_trader_balance_for_upi();

-- 3. Cron job to enforce rule every minute (backup)
CREATE OR REPLACE FUNCTION enforce_low_balance_upi_removal()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trader RECORD;
  v_total INTEGER := 0;
  v_count INTEGER;
BEGIN
  -- Find traders with low balance but active UPIs
  FOR v_trader IN 
    SELECT DISTINCT t.id
    FROM traders t
    INNER JOIN upi_pool u ON u.trader_id = t.id
    WHERE (COALESCE(t.balance, 0) - COALESCE(t.security_hold, 0)) < 30000
  LOOP
    SELECT remove_trader_upis_from_pool(v_trader.id) INTO v_count;
    v_total := v_total + v_count;
  END LOOP;
  
  RETURN v_total;
END;
$$;

-- Schedule cron
SELECT cron.schedule(
  'enforce-low-balance-upi-removal',
  '* * * * *',
  'SELECT enforce_low_balance_upi_removal()'
);

-- 4. Run immediate cleanup
SELECT enforce_low_balance_upi_removal();

-- Grant permissions
GRANT EXECUTE ON FUNCTION remove_trader_upis_from_pool(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION enforce_low_balance_upi_removal() TO service_role;
