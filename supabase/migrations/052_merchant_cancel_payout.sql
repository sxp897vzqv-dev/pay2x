-- Migration 052: Merchant payout cancellation with balance refund

-- Drop both versions (TEXT and UUID)
DROP FUNCTION IF EXISTS cancel_merchant_payout(UUID);
DROP FUNCTION IF EXISTS cancel_merchant_payout(TEXT);

CREATE OR REPLACE FUNCTION cancel_merchant_payout(p_payout_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payout RECORD;
  v_refund_amount DECIMAL;
  v_new_balance DECIMAL;
  v_payout_uuid UUID;
BEGIN
  -- Cast to UUID
  BEGIN
    v_payout_uuid := p_payout_id::UUID;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payout ID format');
  END;

  -- 1. Get payout and merchant info
  SELECT p.*, m.profile_id, m.available_balance as merchant_balance
  INTO v_payout
  FROM payouts p
  JOIN merchants m ON m.id = p.merchant_id
  WHERE p.id = v_payout_uuid;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payout not found');
  END IF;
  
  -- 2. Verify caller owns this payout (skip check if auth.uid() is null - service role)
  IF auth.uid() IS NOT NULL AND v_payout.profile_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized to cancel this payout');
  END IF;
  
  -- 3. Check if cancellable
  IF v_payout.status::TEXT NOT IN ('pending', 'assigned') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot cancel - status is ' || v_payout.status::TEXT);
  END IF;
  
  -- 4. Calculate refund (amount + fee)
  v_refund_amount := COALESCE(v_payout.amount, 0) + COALESCE(v_payout.merchant_fee, v_payout.commission, 0);
  v_new_balance := COALESCE(v_payout.merchant_balance, 0) + v_refund_amount;
  
  -- 5. Update payout status
  UPDATE payouts SET
    status = 'cancelled',
    failure_reason = 'Cancelled by merchant',
    cancel_reason = 'Cancelled by merchant',
    cancelled_at = NOW(),
    updated_at = NOW()
  WHERE id = v_payout_uuid;
  
  -- 6. Refund merchant balance
  UPDATE merchants SET
    available_balance = v_new_balance,
    updated_at = NOW()
  WHERE id = v_payout.merchant_id;
  
  -- 7. Return success
  RETURN jsonb_build_object(
    'success', true,
    'refunded', v_refund_amount,
    'new_balance', v_new_balance,
    'message', 'Payout cancelled. ₹' || v_refund_amount::TEXT || ' refunded.'
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_merchant_payout TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_merchant_payout TO anon;

-- Also allow merchants to insert payouts
DROP POLICY IF EXISTS "Merchants can create payouts" ON payouts;
CREATE POLICY "Merchants can create payouts" ON payouts
  FOR INSERT
  WITH CHECK (
    merchant_id IN (
      SELECT id FROM merchants WHERE profile_id = auth.uid()
    )
  );
