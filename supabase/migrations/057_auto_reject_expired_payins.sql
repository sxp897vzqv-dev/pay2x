-- ═══════════════════════════════════════════════════════════════════════════════
-- AUTO-REJECT EXPIRED PAYINS (15 minutes without UTR)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Function to auto-reject expired payins
CREATE OR REPLACE FUNCTION auto_reject_expired_payins()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- Reject payins where:
  -- 1. Status is 'pending'
  -- 2. UTR is NULL or empty
  -- 3. Created more than 15 minutes ago
  UPDATE payins
  SET 
    status = 'rejected',
    rejected_at = NOW(),
    rejection_reason = 'Time expired – UTR not submitted within 15 minutes',
    auto_rejected = true,
    expired_at = NOW()
  WHERE 
    status = 'pending'
    AND (utr IS NULL OR utr = '')
    AND requested_at < NOW() - INTERVAL '15 minutes';
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  IF v_count > 0 THEN
    RAISE NOTICE 'Auto-rejected % expired payins', v_count;
  END IF;
  
  RETURN v_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION auto_reject_expired_payins() TO authenticated;
GRANT EXECUTE ON FUNCTION auto_reject_expired_payins() TO service_role;

-- Create pg_cron job to run every minute
-- Note: pg_cron must be enabled in Supabase Dashboard -> Database -> Extensions
SELECT cron.schedule(
  'auto-reject-expired-payins',  -- job name
  '* * * * *',                    -- every minute
  $$SELECT auto_reject_expired_payins()$$
);

COMMENT ON FUNCTION auto_reject_expired_payins IS 'Auto-rejects pending payins without UTR after 15 minutes';
