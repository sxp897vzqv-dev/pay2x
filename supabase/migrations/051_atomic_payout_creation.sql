-- Migration 051: Atomic payout creation with balance check
-- Prevents merchants from creating payouts without sufficient balance

-- Drop if exists to allow re-run
DROP FUNCTION IF EXISTS create_merchant_payout(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DECIMAL, TEXT);

CREATE OR REPLACE FUNCTION create_merchant_payout(
  p_merchant_id UUID,
  p_beneficiary_name TEXT,
  p_payment_mode TEXT,  -- 'upi' or 'bank'
  p_upi_id TEXT DEFAULT NULL,
  p_account_number TEXT DEFAULT NULL,
  p_ifsc_code TEXT DEFAULT NULL,
  p_bank_name TEXT DEFAULT NULL,
  p_amount DECIMAL DEFAULT 0,
  p_purpose TEXT DEFAULT 'withdrawal'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_merchant RECORD;
  v_payout_fee DECIMAL;
  v_total_required DECIMAL;
  v_payout_id TEXT;
  v_new_payout_uuid UUID;
BEGIN
  -- 1. Lock merchant row and get current balance
  SELECT id, available_balance, payout_rate, is_active
  INTO v_merchant
  FROM merchants
  WHERE id = p_merchant_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Merchant not found');
  END IF;
  
  IF NOT v_merchant.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'Merchant account is inactive');
  END IF;
  
  -- 2. Validate amount
  IF p_amount < 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Minimum amount is ₹100');
  END IF;
  
  IF p_amount > 200000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Maximum amount is ₹2,00,000');
  END IF;
  
  -- 3. Calculate fee and total required
  v_payout_fee := ROUND((p_amount * COALESCE(v_merchant.payout_rate, 2)) / 100, 2);
  v_total_required := p_amount + v_payout_fee;
  
  -- 4. Check balance (THE CRITICAL CHECK)
  IF COALESCE(v_merchant.available_balance, 0) < v_total_required THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', format('Insufficient balance. Required: ₹%s, Available: ₹%s', 
                      v_total_required::TEXT, 
                      COALESCE(v_merchant.available_balance, 0)::TEXT)
    );
  END IF;
  
  -- 5. Generate payout ID
  v_payout_id := 'PO' || EXTRACT(EPOCH FROM NOW())::BIGINT || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 4));
  
  -- 6. Deduct balance FIRST (atomic with the lock)
  UPDATE merchants
  SET 
    available_balance = available_balance - v_total_required,
    updated_at = NOW()
  WHERE id = p_merchant_id;
  
  -- 7. Create payout record
  INSERT INTO payouts (
    merchant_id,
    payout_id,
    txn_id,
    beneficiary_name,
    payment_mode,
    upi_id,
    account_number,
    ifsc_code,
    bank_name,
    amount,
    merchant_fee,
    commission,
    purpose,
    status,
    created_at
  ) VALUES (
    p_merchant_id,
    v_payout_id,
    v_payout_id,
    p_beneficiary_name,
    p_payment_mode,
    CASE WHEN p_payment_mode = 'upi' THEN p_upi_id ELSE NULL END,
    CASE WHEN p_payment_mode = 'bank' THEN p_account_number ELSE NULL END,
    CASE WHEN p_payment_mode = 'bank' THEN p_ifsc_code ELSE NULL END,
    p_bank_name,
    p_amount,
    v_payout_fee,
    v_payout_fee,
    p_purpose,
    'pending',
    NOW()
  )
  RETURNING id INTO v_new_payout_uuid;
  
  -- 8. Return success
  RETURN jsonb_build_object(
    'success', true,
    'payout_id', v_payout_id,
    'payout_uuid', v_new_payout_uuid,
    'amount', p_amount,
    'fee', v_payout_fee,
    'total_deducted', v_total_required,
    'new_balance', v_merchant.available_balance - v_total_required
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Grant execute to authenticated users (merchants)
GRANT EXECUTE ON FUNCTION create_merchant_payout TO authenticated;

-- Add comment
COMMENT ON FUNCTION create_merchant_payout IS 'Atomically creates a payout with balance check. Uses FOR UPDATE lock to prevent race conditions.';
