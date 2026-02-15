-- Migration 052: Merchant payout cancellation
-- Balance is NOT deducted on creation, only on completion
-- So cancel just changes status, no refund needed

DROP FUNCTION IF EXISTS cancel_merchant_payout(UUID);
DROP FUNCTION IF EXISTS cancel_merchant_payout(TEXT);

CREATE OR REPLACE FUNCTION cancel_merchant_payout(p_payout_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payout RECORD;
  v_payout_uuid UUID;
BEGIN
  -- Cast to UUID
  BEGIN
    v_payout_uuid := p_payout_id::UUID;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payout ID format');
  END;

  -- 1. Get payout info
  SELECT p.id, p.amount, p.commission, p.status, p.merchant_id, m.profile_id
  INTO v_payout
  FROM payouts p
  JOIN merchants m ON m.id = p.merchant_id
  WHERE p.id = v_payout_uuid;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payout not found');
  END IF;
  
  -- 2. Verify caller owns this payout
  IF auth.uid() IS NOT NULL AND v_payout.profile_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
  
  -- 3. Only PENDING can be cancelled (once assigned to trader, cannot cancel)
  IF v_payout.status::TEXT = 'assigned' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot cancel - payout is assigned to a trader. Contact support.');
  ELSIF v_payout.status::TEXT != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot cancel - status is ' || v_payout.status::TEXT);
  END IF;
  
  -- 4. Cancel the payout (no refund needed - balance wasn't deducted on creation)
  UPDATE payouts SET
    status = 'cancelled',
    failure_reason = 'Cancelled by merchant',
    cancel_reason = 'Cancelled by merchant',
    cancelled_at = NOW(),
    updated_at = NOW()
  WHERE id = v_payout_uuid;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Payout cancelled successfully.'
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_merchant_payout TO authenticated;

-- Allow merchants to insert payouts
DROP POLICY IF EXISTS "Merchants can create payouts" ON payouts;
CREATE POLICY "Merchants can create payouts" ON payouts
  FOR INSERT
  WITH CHECK (
    merchant_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid())
  );
