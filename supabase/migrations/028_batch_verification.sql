-- Migration: Batch verification system
-- Verification is at payout_request level, not individual payout level

-- Add verification columns to payout_requests
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'pending';
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS statement_proof_url TEXT;
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS video_proof_url TEXT;
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS verification_submitted_at TIMESTAMPTZ;
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS verified_by UUID;
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS rejection_count INTEGER DEFAULT 0;

-- Add verification_status to payouts (if not exists)
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS verification_status TEXT;

-- Create index for pending verifications
CREATE INDEX IF NOT EXISTS idx_payout_requests_pending_verification 
ON payout_requests(verification_status) 
WHERE verification_status = 'pending_review';

-- RPC: Admin approve batch verification
CREATE OR REPLACE FUNCTION approve_batch_verification(
  p_request_id UUID,
  p_admin_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_trader RECORD;
  v_total_amount NUMERIC := 0;
  v_total_commission NUMERIC := 0;
BEGIN
  -- Get request
  SELECT * INTO v_request FROM payout_requests WHERE id = p_request_id;
  IF v_request IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;

  IF v_request.verification_status != 'pending_review' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not pending review');
  END IF;

  -- Get trader
  SELECT * INTO v_trader FROM traders WHERE id = v_request.trader_id;
  IF v_trader IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Trader not found');
  END IF;

  -- Calculate totals from completed payouts
  SELECT 
    COALESCE(SUM(amount), 0),
    COALESCE(SUM(commission), 0)
  INTO v_total_amount, v_total_commission
  FROM payouts 
  WHERE payout_request_id = p_request_id 
  AND status = 'completed';

  -- Update request
  UPDATE payout_requests SET
    verification_status = 'verified',
    status = 'completed',
    verified_at = NOW(),
    verified_by = p_admin_id
  WHERE id = p_request_id;

  -- Update all payouts in this request
  UPDATE payouts SET
    verification_status = 'verified'
  WHERE payout_request_id = p_request_id
  AND status = 'completed';

  -- Credit trader balance (amount - commission they already earned on assignment)
  -- Actually for payouts, traders PAY from their balance, so we need to add back the commission they earned
  UPDATE traders SET
    balance = balance + v_total_commission, -- Add commission earned
    overall_commission = COALESCE(overall_commission, 0) + v_total_commission
  WHERE id = v_request.trader_id;

  RETURN jsonb_build_object(
    'success', true,
    'totalAmount', v_total_amount,
    'commissionEarned', v_total_commission
  );
END;
$$;

-- RPC: Admin reject batch verification
CREATE OR REPLACE FUNCTION reject_batch_verification(
  p_request_id UUID,
  p_admin_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_new_count INTEGER;
BEGIN
  -- Get request
  SELECT * INTO v_request FROM payout_requests WHERE id = p_request_id;
  IF v_request IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;

  IF v_request.verification_status != 'pending_review' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not pending review');
  END IF;

  v_new_count := COALESCE(v_request.rejection_count, 0) + 1;

  -- Update request - allow resubmission
  UPDATE payout_requests SET
    verification_status = 'rejected',
    rejection_reason = p_reason,
    rejection_count = v_new_count,
    statement_proof_url = NULL,
    video_proof_url = NULL,
    verification_submitted_at = NULL
  WHERE id = p_request_id;

  -- Update payouts
  UPDATE payouts SET
    verification_status = 'rejected'
  WHERE payout_request_id = p_request_id
  AND status = 'completed';

  RETURN jsonb_build_object(
    'success', true,
    'rejectionCount', v_new_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION approve_batch_verification(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION reject_batch_verification(UUID, UUID, TEXT) TO authenticated;
