-- Fix: Generate new txn_id for switched payin

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
  v_new_txn_id TEXT;
  v_attempt_history JSONB;
BEGIN
  SELECT * INTO v_old_payin
  FROM payins
  WHERE id = p_payin_id
    AND merchant_id = p_merchant_id
    AND status = 'pending'
  FOR UPDATE;

  IF v_old_payin IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment not found', 'error_code', 'PAYIN_NOT_FOUND');
  END IF;

  IF COALESCE(v_old_payin.current_attempt, 1) >= COALESCE(v_old_payin.max_attempts, 3) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No more UPI options', 'error_code', 'MAX_ATTEMPTS_REACHED');
  END IF;

  IF v_old_payin.fallback_chain IS NULL OR array_length(v_old_payin.fallback_chain, 1) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No fallback UPIs', 'error_code', 'NO_FALLBACK');
  END IF;

  v_new_attempt := COALESCE(v_old_payin.current_attempt, 1) + 1;
  
  IF v_new_attempt > array_length(v_old_payin.fallback_chain, 1) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No more fallbacks', 'error_code', 'NO_FALLBACK');
  END IF;

  v_next_upi_pool_id := v_old_payin.fallback_chain[v_new_attempt];

  SELECT id, upi_id, holder_name, trader_id
  INTO v_next_upi
  FROM upi_pool
  WHERE id = v_next_upi_pool_id::UUID AND status = 'active';

  IF v_next_upi IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Next UPI unavailable', 'error_code', 'UPI_UNAVAILABLE');
  END IF;

  -- FAIL old payin
  UPDATE payins SET status = 'failed', failure_reason = 'user_switched_upi', updated_at = NOW()
  WHERE id = p_payin_id;

  v_attempt_history := COALESCE(v_old_payin.attempt_history, '[]'::JSONB) || jsonb_build_array(
    jsonb_build_object('attempt', COALESCE(v_old_payin.current_attempt, 1), 'payin_id', v_old_payin.id, 'upi_id', v_old_payin.upi_id, 'failed_at', NOW())
  );

  v_new_payin_id := gen_random_uuid();
  
  -- Generate new txn_id (append attempt number to original or generate new)
  v_new_txn_id := COALESCE(v_old_payin.txn_id, '') || '_A' || v_new_attempt::TEXT;

  -- CREATE new payin with new txn_id
  INSERT INTO payins (id, merchant_id, trader_id, upi_pool_id, upi_id, holder_name, amount, status, order_id, txn_id, expires_at, fallback_chain, current_attempt, max_attempts, attempt_history, parent_payin_id, created_at, requested_at)
  VALUES (v_new_payin_id, v_old_payin.merchant_id, v_next_upi.trader_id, v_next_upi.id, v_next_upi.upi_id, v_next_upi.holder_name, v_old_payin.amount, 'pending', v_old_payin.order_id, v_new_txn_id, v_old_payin.expires_at, v_old_payin.fallback_chain, v_new_attempt, COALESCE(v_old_payin.max_attempts, 3), v_attempt_history, COALESCE(v_old_payin.parent_payin_id, v_old_payin.id), NOW(), NOW());

  RETURN jsonb_build_object('success', true, 'new_payin_id', v_new_payin_id, 'old_payin_id', p_payin_id, 'upi_id', v_next_upi.upi_id, 'holder_name', v_next_upi.holder_name, 'attempt_number', v_new_attempt, 'max_attempts', COALESCE(v_old_payin.max_attempts, 3), 'has_more_fallbacks', v_new_attempt < COALESCE(v_old_payin.max_attempts, 3));
END;
$$;
