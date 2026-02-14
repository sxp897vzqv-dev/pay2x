-- ============================================
-- Migration 047: Balance + Commission + Earnings Structure
-- ============================================
-- New trader balance model:
-- 1. balance = Working capital (deposits, operational funds)
-- 2. commission_balance = Earned commission (withdrawable separately)
-- 3. lifetime_earnings = Total earned ever (audit trail)
-- ============================================

-- Add new columns to traders table
ALTER TABLE traders
ADD COLUMN IF NOT EXISTS commission_balance NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS lifetime_earnings NUMERIC(15,2) DEFAULT 0;

-- Initialize commission_balance from existing overall_commission
UPDATE traders 
SET commission_balance = COALESCE(overall_commission, 0),
    lifetime_earnings = COALESCE(overall_commission, 0)
WHERE commission_balance IS NULL OR commission_balance = 0;

-- Add comments for clarity
COMMENT ON COLUMN traders.balance IS 'Working capital - used for payout operations';
COMMENT ON COLUMN traders.commission_balance IS 'Earned commission - can be withdrawn separately';
COMMENT ON COLUMN traders.lifetime_earnings IS 'Total earnings ever - audit trail, never decreases';
COMMENT ON COLUMN traders.security_hold IS 'Locked amount - released after verification period';
COMMENT ON COLUMN traders.overall_commission IS 'DEPRECATED - use commission_balance and lifetime_earnings instead';

-- Create function to credit commission (adds to both commission_balance and lifetime_earnings)
CREATE OR REPLACE FUNCTION credit_trader_commission(
  p_trader_id UUID,
  p_amount NUMERIC,
  p_reason TEXT DEFAULT 'transaction_commission'
)
RETURNS VOID AS $$
BEGIN
  UPDATE traders
  SET 
    commission_balance = commission_balance + p_amount,
    lifetime_earnings = lifetime_earnings + p_amount,
    overall_commission = overall_commission + p_amount, -- Keep legacy field in sync
    updated_at = NOW()
  WHERE id = p_trader_id;
  
  -- Log to balance history
  INSERT INTO balance_history (trader_id, change_type, amount, balance_after, reason, created_at)
  SELECT 
    p_trader_id, 
    'commission_credit', 
    p_amount, 
    commission_balance,
    p_reason,
    NOW()
  FROM traders WHERE id = p_trader_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to transfer commission to balance (for operations)
CREATE OR REPLACE FUNCTION transfer_commission_to_balance(
  p_trader_id UUID,
  p_amount NUMERIC
)
RETURNS JSONB AS $$
DECLARE
  v_commission_balance NUMERIC;
  v_new_balance NUMERIC;
BEGIN
  -- Check available commission
  SELECT commission_balance INTO v_commission_balance
  FROM traders WHERE id = p_trader_id;
  
  IF v_commission_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient commission balance');
  END IF;
  
  -- Transfer
  UPDATE traders
  SET 
    commission_balance = commission_balance - p_amount,
    balance = balance + p_amount,
    updated_at = NOW()
  WHERE id = p_trader_id
  RETURNING balance INTO v_new_balance;
  
  -- Log
  INSERT INTO balance_history (trader_id, change_type, amount, balance_after, reason, created_at)
  VALUES (p_trader_id, 'commission_to_balance', p_amount, v_new_balance, 'Transfer commission to working balance', NOW());
  
  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update complete_payin to credit commission to commission_balance
CREATE OR REPLACE FUNCTION complete_payin(
  p_payin_id UUID,
  p_utr TEXT,
  p_completed_by UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_payin RECORD;
  v_trader RECORD;
  v_commission NUMERIC;
  v_merchant_commission NUMERIC;
  v_new_balance NUMERIC;
  v_new_commission_balance NUMERIC;
BEGIN
  -- Get payin details
  SELECT * INTO v_payin FROM payins WHERE id = p_payin_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payin not found');
  END IF;
  
  IF v_payin.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payin is not pending');
  END IF;
  
  -- Get trader with commission rate
  SELECT * INTO v_trader FROM traders WHERE id = v_payin.trader_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Trader not found');
  END IF;
  
  -- Calculate commissions
  v_commission := v_payin.amount * (COALESCE(v_trader.payin_commission, 4) / 100);
  
  -- Update trader: balance - amount (trader receives cash), commission_balance + commission
  UPDATE traders
  SET 
    balance = balance - v_payin.amount + v_commission,
    commission_balance = commission_balance + v_commission,
    lifetime_earnings = lifetime_earnings + v_commission,
    overall_commission = overall_commission + v_commission,
    updated_at = NOW()
  WHERE id = v_payin.trader_id
  RETURNING balance, commission_balance INTO v_new_balance, v_new_commission_balance;
  
  -- Get merchant commission rate
  SELECT payin_commission INTO v_merchant_commission 
  FROM merchants WHERE id = v_payin.merchant_id;
  
  -- Credit merchant balance (amount - platform commission)
  UPDATE merchants
  SET 
    balance = balance + (v_payin.amount - (v_payin.amount * COALESCE(v_merchant_commission, 2) / 100)),
    updated_at = NOW()
  WHERE id = v_payin.merchant_id;
  
  -- Update payin status
  UPDATE payins
  SET 
    status = 'completed',
    utr = p_utr,
    commission = v_commission,
    completed_at = NOW(),
    completed_by = p_completed_by
  WHERE id = p_payin_id;
  
  -- Update UPI stats
  UPDATE upi_pool
  SET 
    completed_today = completed_today + 1,
    amount_today = amount_today + v_payin.amount,
    success_rate = CASE 
      WHEN (completed_today + failed_today + 1) > 0 
      THEN (completed_today + 1)::NUMERIC / (completed_today + failed_today + 1) * 100 
      ELSE 100 
    END,
    last_used_at = NOW()
  WHERE upi_id = v_payin.upi_id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'new_balance', v_new_balance,
    'new_commission_balance', v_new_commission_balance,
    'commission_earned', v_commission
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update approve_payout_verification to credit commission to commission_balance
CREATE OR REPLACE FUNCTION approve_payout_verification(
  p_payout_id UUID,
  p_admin_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_payout RECORD;
  v_trader RECORD;
  v_commission NUMERIC;
  v_total_credit NUMERIC;
  v_new_balance NUMERIC;
  v_new_commission_balance NUMERIC;
BEGIN
  -- Get payout details
  SELECT * INTO v_payout FROM payouts WHERE id = p_payout_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payout not found');
  END IF;
  
  IF v_payout.verification_status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payout verification is not pending');
  END IF;
  
  -- Get trader with commission rate
  SELECT * INTO v_trader FROM traders WHERE id = v_payout.trader_id;
  
  -- Calculate commission
  v_commission := v_payout.amount * (COALESCE(v_trader.payout_commission, 3) / 100);
  v_total_credit := v_payout.amount + v_commission;
  
  -- Credit trader: balance + amount (reimbursement), commission_balance + commission
  UPDATE traders
  SET 
    balance = balance + v_payout.amount,
    commission_balance = commission_balance + v_commission,
    lifetime_earnings = lifetime_earnings + v_commission,
    overall_commission = overall_commission + v_commission,
    updated_at = NOW()
  WHERE id = v_payout.trader_id
  RETURNING balance, commission_balance INTO v_new_balance, v_new_commission_balance;
  
  -- Update payout status
  UPDATE payouts
  SET 
    verification_status = 'approved',
    status = 'completed',
    commission = v_commission,
    verified_by = p_admin_id,
    verified_at = NOW(),
    completed_at = NOW()
  WHERE id = p_payout_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'new_commission_balance', v_new_commission_balance,
    'commission_earned', v_commission,
    'total_credited', v_total_credit
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_traders_commission_balance ON traders(commission_balance);
CREATE INDEX IF NOT EXISTS idx_traders_lifetime_earnings ON traders(lifetime_earnings);

-- Grant permissions
GRANT EXECUTE ON FUNCTION credit_trader_commission TO authenticated;
GRANT EXECUTE ON FUNCTION transfer_commission_to_balance TO authenticated;
GRANT EXECUTE ON FUNCTION complete_payin TO authenticated;
GRANT EXECUTE ON FUNCTION approve_payout_verification TO authenticated;
