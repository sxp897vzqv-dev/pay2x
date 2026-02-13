-- ============================================================================
-- Migration 033: Switch UPI Creates New Payin (Fails Old One)
-- ============================================================================
-- When user switches UPI:
--   1. Old payin → status = 'failed', failure_reason = 'user_switched_upi'
--   2. New payin → created with new ID for new trader
--   3. Link via parent_payin_id for tracking
-- ============================================================================

-- Add parent_payin_id to link switched payins
ALTER TABLE payins ADD COLUMN IF NOT EXISTS parent_payin_id UUID REFERENCES payins(id);
ALTER TABLE payins ADD COLUMN IF NOT EXISTS failure_reason TEXT;

-- Index for finding child payins
CREATE INDEX IF NOT EXISTS idx_payins_parent ON payins(parent_payin_id) WHERE parent_payin_id IS NOT NULL;

-- ============================================================================
-- RPC: Switch to next UPI (creates new payin, fails old one)
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
  v_old_payin RECORD;
  v_next_upi_pool_id TEXT;
  v_next_upi RECORD;
  v_new_attempt INT;
  v_new_payin_id UUID;
  v_remaining_chain TEXT[];
  v_attempt_history JSONB;
BEGIN
  -- Get current payin with lock
  SELECT * INTO v_old_payin
  FROM payins
  WHERE id = p_payin_id
    AND merchant_id = p_merchant_id
    AND status = 'pending'
  FOR UPDATE;

  -- Validate payin exists
  IF v_old_payin IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Payment not found or already processed',
      'error_code', 'PAYIN_NOT_FOUND'
    );
  END IF;

  -- Check if expired
  IF v_old_payin.expires_at < NOW() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Payment has expired',
      'error_code', 'PAYIN_EXPIRED'
    );
  END IF;

  -- Check attempts remaining
  IF v_old_payin.current_attempt >= v_old_payin.max_attempts THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No more UPI options available',
      'error_code', 'MAX_ATTEMPTS_REACHED'
    );
  END IF;

  -- Check fallback chain exists
  IF v_old_payin.fallback_chain IS NULL OR array_length(v_old_payin.fallback_chain, 1) <= v_old_payin.current_attempt THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No fallback UPIs available',
      'error_code', 'NO_FALLBACK'
    );
  END IF;

  -- Get next UPI from fallback chain
  v_new_attempt := v_old_payin.current_attempt + 1;
  v_next_upi_pool_id := v_old_payin.fallback_chain[v_new_attempt];

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
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Next UPI is no longer available',
      'error_code', 'UPI_UNAVAILABLE'
    );
  END IF;

  -- Check daily limit
  IF (v_next_upi.daily_volume + v_old_payin.amount) > v_next_upi.daily_limit THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Next UPI has insufficient daily limit',
      'error_code', 'LIMIT_EXCEEDED'
    );
  END IF;

  -- ============================================================================
  -- 1. FAIL the old payin
  -- ============================================================================
  UPDATE payins SET
    status = 'failed',
    failure_reason = 'user_switched_upi',
    updated_at = NOW()
  WHERE id = p_payin_id;

  -- Update old UPI stats (increment failure/switch count)
  UPDATE upi_pool SET
    consecutive_failures = COALESCE(consecutive_failures, 0) + 1,
    consecutive_successes = 0,
    updated_at = NOW()
  WHERE id = v_old_payin.upi_pool_id;

  -- ============================================================================
  -- 2. CREATE new payin for new trader
  -- ============================================================================
  
  -- Build attempt history (carry forward + add old attempt)
  v_attempt_history := COALESCE(v_old_payin.attempt_history, '[]'::JSONB) || jsonb_build_array(
    jsonb_build_object(
      'attempt', v_old_payin.current_attempt,
      'payin_id', v_old_payin.id,
      'upi_pool_id', v_old_payin.upi_pool_id,
      'upi_id', v_old_payin.upi_id,
      'trader_id', v_old_payin.trader_id,
      'started_at', v_old_payin.created_at,
      'failed_at', NOW(),
      'reason', 'user_switched_upi'
    )
  );

  -- Remaining fallback chain (remove used UPIs)
  v_remaining_chain := v_old_payin.fallback_chain[v_new_attempt:];

  -- Generate new payin ID
  v_new_payin_id := gen_random_uuid();

  INSERT INTO payins (
    id,
    merchant_id,
    trader_id,
    upi_pool_id,
    upi_id,
    holder_name,
    amount,
    status,
    order_id,
    txn_id,
    customer_email,
    customer_phone,
    customer_name,
    redirect_url,
    webhook_url,
    expires_at,
    fallback_chain,
    current_attempt,
    max_attempts,
    attempt_history,
    parent_payin_id,
    created_at,
    requested_at
  ) VALUES (
    v_new_payin_id,
    v_old_payin.merchant_id,
    v_next_upi.trader_id,
    v_next_upi.id,
    v_next_upi.upi_id,
    v_next_upi.holder_name,
    v_old_payin.amount,
    'pending',
    v_old_payin.order_id,
    v_old_payin.txn_id,
    v_old_payin.customer_email,
    v_old_payin.customer_phone,
    v_old_payin.customer_name,
    v_old_payin.redirect_url,
    v_old_payin.webhook_url,
    v_old_payin.expires_at,  -- Keep same expiry
    v_remaining_chain,
    v_new_attempt,
    v_old_payin.max_attempts,
    v_attempt_history,
    COALESCE(v_old_payin.parent_payin_id, v_old_payin.id),  -- Link to root or immediate parent
    NOW(),
    NOW()
  );

  -- ============================================================================
  -- 3. Log the switch
  -- ============================================================================
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
    v_old_payin.amount,
    0,
    'v4-fallback',
    jsonb_build_object(
      'attempt', v_new_attempt,
      'previous_payin_id', p_payin_id,
      'previous_upi', v_old_payin.upi_id,
      'reason', 'user_switch',
      'new_payin_id', v_new_payin_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'new_payin_id', v_new_payin_id,
    'old_payin_id', p_payin_id,
    'upi_id', v_next_upi.upi_id,
    'upi_pool_id', v_next_upi.id,
    'holder_name', v_next_upi.holder_name,
    'attempt_number', v_new_attempt,
    'max_attempts', v_old_payin.max_attempts,
    'has_more_fallbacks', v_new_attempt < v_old_payin.max_attempts
  );
END;
$$;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON COLUMN payins.parent_payin_id IS 'Links to parent payin when user switched UPI (for tracking the chain)';
COMMENT ON COLUMN payins.failure_reason IS 'Reason for failure (user_switched_upi, expired, rejected, etc.)';
COMMENT ON FUNCTION switch_payin_upi IS 'Switch to next UPI: fails old payin, creates new one for new trader';
