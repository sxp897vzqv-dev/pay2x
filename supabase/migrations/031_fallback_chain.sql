-- ============================================================================
-- Migration 031: Fallback Chain for Payin UPI Selection
-- ============================================================================
-- Allows users to switch to backup UPIs when first one doesn't work
-- User-triggered via "Try Different UPI" button
-- ============================================================================

-- Add fallback columns to payins
ALTER TABLE payins ADD COLUMN IF NOT EXISTS fallback_chain TEXT[];
ALTER TABLE payins ADD COLUMN IF NOT EXISTS current_attempt INT DEFAULT 1;
ALTER TABLE payins ADD COLUMN IF NOT EXISTS attempt_history JSONB DEFAULT '[]'::JSONB;
ALTER TABLE payins ADD COLUMN IF NOT EXISTS max_attempts INT DEFAULT 3;

-- Index for finding payins with remaining fallback attempts
CREATE INDEX IF NOT EXISTS idx_payins_fallback_pending 
ON payins (id) 
WHERE status = 'pending' AND current_attempt < max_attempts;

-- ============================================================================
-- RPC: Switch to next UPI in fallback chain
-- ============================================================================

CREATE OR REPLACE FUNCTION switch_payin_upi(
  p_payin_id UUID,
  p_merchant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payin RECORD;
  v_next_upi_pool_id TEXT;
  v_next_upi RECORD;
  v_new_attempt INT;
  v_history JSONB;
BEGIN
  -- Get current payin with lock
  SELECT * INTO v_payin
  FROM payins
  WHERE id = p_payin_id
    AND merchant_id = p_merchant_id
    AND status = 'pending'
  FOR UPDATE;

  -- Validate payin exists
  IF v_payin IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Payment not found or already processed',
      'error_code', 'PAYIN_NOT_FOUND'
    );
  END IF;

  -- Check if expired
  IF v_payin.expires_at < NOW() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Payment has expired',
      'error_code', 'PAYIN_EXPIRED'
    );
  END IF;

  -- Check attempts remaining
  IF v_payin.current_attempt >= v_payin.max_attempts THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No more UPI options available',
      'error_code', 'MAX_ATTEMPTS_REACHED'
    );
  END IF;

  -- Check fallback chain exists
  IF v_payin.fallback_chain IS NULL OR array_length(v_payin.fallback_chain, 1) < v_payin.current_attempt THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No fallback UPIs available',
      'error_code', 'NO_FALLBACK'
    );
  END IF;

  -- Get next UPI from fallback chain (current_attempt is 1-indexed, array is 0-indexed)
  -- If current_attempt=1, we're on first UPI, so next is index 1 (second UPI)
  v_next_upi_pool_id := v_payin.fallback_chain[v_payin.current_attempt + 1];

  IF v_next_upi_pool_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Fallback UPI not found in chain',
      'error_code', 'FALLBACK_MISSING'
    );
  END IF;

  -- Get the next UPI details
  SELECT 
    up.id,
    up.upi_id,
    up.holder_name,
    up.trader_id,
    up.daily_limit,
    up.daily_volume
  INTO v_next_upi
  FROM upi_pool up
  WHERE up.id = v_next_upi_pool_id::UUID
    AND up.status = 'active';

  IF v_next_upi IS NULL THEN
    -- Try next one in chain if this one is inactive
    v_new_attempt := v_payin.current_attempt + 1;
    
    -- Recursive try for next
    IF v_new_attempt < v_payin.max_attempts AND array_length(v_payin.fallback_chain, 1) > v_new_attempt THEN
      v_next_upi_pool_id := v_payin.fallback_chain[v_new_attempt + 1];
      
      SELECT 
        up.id,
        up.upi_id,
        up.holder_name,
        up.trader_id,
        up.daily_limit,
        up.daily_volume
      INTO v_next_upi
      FROM upi_pool up
      WHERE up.id = v_next_upi_pool_id::UUID
        AND up.status = 'active';
    END IF;
    
    IF v_next_upi IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Next UPI is no longer available',
        'error_code', 'UPI_UNAVAILABLE'
      );
    END IF;
  END IF;

  -- Check daily limit
  IF (v_next_upi.daily_volume + v_payin.amount) > v_next_upi.daily_limit THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Next UPI has insufficient daily limit',
      'error_code', 'LIMIT_EXCEEDED'
    );
  END IF;

  -- Build attempt history entry
  v_history := COALESCE(v_payin.attempt_history, '[]'::JSONB) || jsonb_build_array(
    jsonb_build_object(
      'attempt', v_payin.current_attempt,
      'upi_pool_id', v_payin.upi_pool_id,
      'upi_id', v_payin.upi_id,
      'started_at', v_payin.created_at,
      'switched_at', NOW(),
      'reason', 'user_requested'
    )
  );

  v_new_attempt := v_payin.current_attempt + 1;

  -- Update payin with new UPI
  UPDATE payins SET
    upi_pool_id = v_next_upi.id,
    upi_id = v_next_upi.upi_id,
    holder_name = v_next_upi.holder_name,
    trader_id = v_next_upi.trader_id,
    current_attempt = v_new_attempt,
    attempt_history = v_history,
    updated_at = NOW()
  WHERE id = p_payin_id;

  -- Log the switch
  INSERT INTO selection_logs (
    upi_pool_id,
    upi_id,
    trader_id,
    merchant_id,
    amount,
    score,
    engine_version,
    metadata
  ) VALUES (
    v_next_upi.id,
    v_next_upi.upi_id,
    v_next_upi.trader_id,
    p_merchant_id,
    v_payin.amount,
    0, -- No score for fallback
    'v4-fallback',
    jsonb_build_object(
      'attempt', v_new_attempt,
      'previous_upi', v_payin.upi_id,
      'reason', 'user_switch'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'upi_id', v_next_upi.upi_id,
    'upi_pool_id', v_next_upi.id,
    'holder_name', v_next_upi.holder_name,
    'attempt_number', v_new_attempt,
    'max_attempts', v_payin.max_attempts,
    'has_more_fallbacks', v_new_attempt < v_payin.max_attempts
  );
END;
$$;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON COLUMN payins.fallback_chain IS 'Array of upi_pool IDs in priority order [primary, fallback1, fallback2]';
COMMENT ON COLUMN payins.current_attempt IS 'Current attempt number (1-indexed)';
COMMENT ON COLUMN payins.attempt_history IS 'History of UPI switches [{attempt, upi_id, switched_at, reason}]';
COMMENT ON COLUMN payins.max_attempts IS 'Maximum number of UPI attempts allowed (default 3)';
COMMENT ON FUNCTION switch_payin_upi IS 'Switch to next UPI in fallback chain, returns new UPI details';
