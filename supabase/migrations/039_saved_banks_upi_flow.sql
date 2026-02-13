-- New UPI Flow:
-- 1. Trader adds UPI → saved_banks (permanent record)
-- 2. Trader toggles ON → copy to upi_pool (active for routing)
-- 3. Trader toggles OFF → remove from upi_pool (stays in saved_banks)
-- 4. Trader deleted/inactive → auto-remove from upi_pool (trigger 038)

-- Create saved_banks table if not exists
CREATE TABLE IF NOT EXISTS saved_banks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id UUID NOT NULL REFERENCES traders(id),
  
  -- UPI details
  upi_id TEXT NOT NULL,
  holder_name TEXT NOT NULL,
  upi_provider TEXT, -- gpay, phonepe, paytm, bhim, other
  
  -- Bank details
  bank_name TEXT,
  bank_ifsc TEXT,
  bank_branch TEXT,
  bank_city TEXT,
  bank_state TEXT,
  account_number TEXT,
  account_type TEXT DEFAULT 'savings', -- savings, current, corporate
  
  -- Settings
  qr_type TEXT DEFAULT 'personal', -- personal, merchant
  mobile_number TEXT,
  daily_limit INT DEFAULT 100000,
  per_txn_limit INT DEFAULT 50000,
  monthly_limit INT DEFAULT 1000000,
  amount_tier TEXT DEFAULT 'small', -- small, medium, large
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE, -- toggled in upi_pool
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Constraints
  UNIQUE(trader_id, upi_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_saved_banks_trader ON saved_banks(trader_id);
CREATE INDEX IF NOT EXISTS idx_saved_banks_upi ON saved_banks(upi_id);
CREATE INDEX IF NOT EXISTS idx_saved_banks_active ON saved_banks(is_active) WHERE is_active = TRUE;

-- Enable RLS
ALTER TABLE saved_banks ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Traders can view own banks" ON saved_banks;
CREATE POLICY "Traders can view own banks" ON saved_banks
  FOR SELECT TO authenticated
  USING (trader_id = auth.uid() OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'worker')
  ));

DROP POLICY IF EXISTS "Traders can insert own banks" ON saved_banks;
CREATE POLICY "Traders can insert own banks" ON saved_banks
  FOR INSERT TO authenticated
  WITH CHECK (trader_id = auth.uid());

DROP POLICY IF EXISTS "Traders can update own banks" ON saved_banks;
CREATE POLICY "Traders can update own banks" ON saved_banks
  FOR UPDATE TO authenticated
  USING (trader_id = auth.uid() OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'worker')
  ));

-- Add is_active sync tracking to upi_pool
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS saved_bank_id UUID REFERENCES saved_banks(id);

-- Function: Sync UPI to pool when toggled ON
CREATE OR REPLACE FUNCTION sync_upi_to_pool(p_saved_bank_id UUID)
RETURNS UUID AS $$
DECLARE
  v_sb saved_banks%ROWTYPE;
  v_pool_id UUID;
BEGIN
  -- Get saved bank record
  SELECT * INTO v_sb FROM saved_banks WHERE id = p_saved_bank_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Saved bank not found';
  END IF;
  
  -- Check if already in pool
  SELECT id INTO v_pool_id FROM upi_pool 
  WHERE trader_id = v_sb.trader_id AND upi_id = v_sb.upi_id;
  
  IF v_pool_id IS NOT NULL THEN
    -- Update existing
    UPDATE upi_pool SET
      status = 'active',
      holder_name = v_sb.holder_name,
      upi_provider = v_sb.upi_provider,
      bank_name = v_sb.bank_name,
      bank_ifsc = v_sb.bank_ifsc,
      bank_branch = v_sb.bank_branch,
      bank_city = v_sb.bank_city,
      bank_state = v_sb.bank_state,
      account_number = v_sb.account_number,
      account_type = v_sb.account_type,
      qr_type = v_sb.qr_type,
      daily_limit = v_sb.daily_limit,
      per_txn_limit = v_sb.per_txn_limit,
      amount_tier = v_sb.amount_tier,
      saved_bank_id = p_saved_bank_id,
      is_deleted = FALSE
    WHERE id = v_pool_id;
    RETURN v_pool_id;
  ELSE
    -- Insert new
    INSERT INTO upi_pool (
      trader_id, upi_id, holder_name, upi_provider, bank_name, bank_ifsc,
      bank_branch, bank_city, bank_state, account_number, account_type,
      qr_type, daily_limit, per_txn_limit, amount_tier, status, saved_bank_id
    ) VALUES (
      v_sb.trader_id, v_sb.upi_id, v_sb.holder_name, v_sb.upi_provider, v_sb.bank_name, v_sb.bank_ifsc,
      v_sb.bank_branch, v_sb.bank_city, v_sb.bank_state, v_sb.account_number, v_sb.account_type,
      v_sb.qr_type, v_sb.daily_limit, v_sb.per_txn_limit, v_sb.amount_tier, 'active', p_saved_bank_id
    ) RETURNING id INTO v_pool_id;
    RETURN v_pool_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Remove UPI from pool when toggled OFF
CREATE OR REPLACE FUNCTION remove_upi_from_pool(p_saved_bank_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Soft delete from pool (to preserve FK references from payins)
  UPDATE upi_pool SET 
    status = 'inactive',
    is_deleted = TRUE,
    deleted_at = NOW()
  WHERE saved_bank_id = p_saved_bank_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION sync_upi_to_pool(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION remove_upi_from_pool(UUID) TO authenticated;

COMMENT ON TABLE saved_banks IS 'Permanent record of trader UPI accounts - source of truth';
COMMENT ON COLUMN saved_banks.is_active IS 'Whether UPI is active in upi_pool for routing';
