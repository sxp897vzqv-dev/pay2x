-- Migration: Enhanced UPI Pool for Smart Engine v5
-- Adds provider, account type, QR type, and better limits tracking

-- ═══════════════════════════════════════════════════════════════════
-- 1. NEW COLUMNS FOR UPI DETAILS
-- ═══════════════════════════════════════════════════════════════════

-- Provider (GPay, PhonePe, Paytm, BHIM, Others)
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS upi_provider TEXT 
  CHECK (upi_provider IN ('gpay', 'phonepe', 'paytm', 'bhim', 'other'));

-- Account Type (Savings, Current, Corporate)
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'savings'
  CHECK (account_type IN ('savings', 'current', 'corporate'));

-- QR Type (Personal, Merchant)
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS qr_type TEXT DEFAULT 'personal'
  CHECK (qr_type IN ('personal', 'merchant'));

-- Mobile number linked to UPI
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS mobile_number TEXT;

-- ═══════════════════════════════════════════════════════════════════
-- 2. ENHANCED LIMITS
-- ═══════════════════════════════════════════════════════════════════

-- Per transaction limit
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS per_txn_limit INTEGER DEFAULT 100000;

-- Monthly limit and tracking
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS monthly_limit INTEGER DEFAULT 1000000;
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS monthly_volume NUMERIC DEFAULT 0;
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS monthly_count INTEGER DEFAULT 0;
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS month_reset_at TIMESTAMPTZ DEFAULT NOW();

-- ═══════════════════════════════════════════════════════════════════
-- 3. AUTO-LEARNED PERFORMANCE (Engine fills these)
-- ═══════════════════════════════════════════════════════════════════

-- Sweet spot amounts (learned from successful transactions)
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS learned_sweet_spot_min INTEGER;
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS learned_sweet_spot_max INTEGER;

-- Time-based performance (learned)
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS peak_hour_success_rate NUMERIC DEFAULT 100;
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS off_peak_success_rate NUMERIC DEFAULT 100;
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS weekend_success_rate NUMERIC DEFAULT 100;

-- Average completion time
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS avg_completion_seconds INTEGER;

-- Lifetime stats
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS lifetime_volume NUMERIC DEFAULT 0;
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS lifetime_txns INTEGER DEFAULT 0;
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS lifetime_success_rate NUMERIC DEFAULT 100;

-- Trust score (0-100, calculated by engine)
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS trust_score INTEGER DEFAULT 50;

-- Verification
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS verified_by UUID;

-- ═══════════════════════════════════════════════════════════════════
-- 4. PROVIDER-BASED SCORING ADJUSTMENTS
-- ═══════════════════════════════════════════════════════════════════

-- Provider reliability stats (aggregated)
CREATE TABLE IF NOT EXISTS provider_stats (
  provider TEXT PRIMARY KEY,
  total_txns INTEGER DEFAULT 0,
  successful_txns INTEGER DEFAULT 0,
  failed_txns INTEGER DEFAULT 0,
  success_rate NUMERIC DEFAULT 100,
  avg_completion_seconds INTEGER,
  last_updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO provider_stats (provider) VALUES 
  ('gpay'), ('phonepe'), ('paytm'), ('bhim'), ('other')
ON CONFLICT (provider) DO NOTHING;

-- Account type performance
CREATE TABLE IF NOT EXISTS account_type_stats (
  account_type TEXT PRIMARY KEY,
  avg_daily_limit INTEGER,
  avg_per_txn_limit INTEGER,
  success_rate NUMERIC DEFAULT 100,
  typical_sweet_spot_min INTEGER,
  typical_sweet_spot_max INTEGER
);

INSERT INTO account_type_stats (account_type, avg_daily_limit, avg_per_txn_limit, typical_sweet_spot_min, typical_sweet_spot_max) VALUES
  ('savings', 100000, 50000, 1000, 20000),
  ('current', 200000, 100000, 5000, 50000),
  ('corporate', 500000, 200000, 10000, 100000)
ON CONFLICT (account_type) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- 5. INDEXES
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_upi_pool_provider ON upi_pool(upi_provider) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_upi_pool_account_type ON upi_pool(account_type) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_upi_pool_qr_type ON upi_pool(qr_type) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_upi_pool_trust_score ON upi_pool(trust_score DESC) WHERE status = 'active';

-- ═══════════════════════════════════════════════════════════════════
-- 6. RPC: RESET MONTHLY UPI STATS (run on 1st of month)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION reset_monthly_upi_stats()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE upi_pool SET
    monthly_volume = 0,
    monthly_count = 0,
    month_reset_at = NOW()
  WHERE monthly_volume > 0 OR monthly_count > 0;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 7. RPC: UPDATE UPI LEARNED STATS (called after transactions)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_upi_learned_stats(
  p_upi_id UUID,
  p_amount NUMERIC,
  p_success BOOLEAN,
  p_completion_seconds INTEGER DEFAULT NULL,
  p_is_peak_hour BOOLEAN DEFAULT false,
  p_is_weekend BOOLEAN DEFAULT false
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_upi RECORD;
  v_new_lifetime_rate NUMERIC;
  v_new_trust_score INTEGER;
BEGIN
  SELECT * INTO v_upi FROM upi_pool WHERE id = p_upi_id;
  IF v_upi IS NULL THEN RETURN; END IF;

  -- Update lifetime stats
  UPDATE upi_pool SET
    lifetime_volume = lifetime_volume + CASE WHEN p_success THEN p_amount ELSE 0 END,
    lifetime_txns = lifetime_txns + 1,
    monthly_volume = monthly_volume + CASE WHEN p_success THEN p_amount ELSE 0 END,
    monthly_count = monthly_count + 1
  WHERE id = p_upi_id;

  -- Calculate new lifetime success rate
  v_new_lifetime_rate := CASE 
    WHEN v_upi.lifetime_txns > 0 THEN
      ((v_upi.lifetime_success_rate * v_upi.lifetime_txns) + CASE WHEN p_success THEN 100 ELSE 0 END) / (v_upi.lifetime_txns + 1)
    ELSE CASE WHEN p_success THEN 100 ELSE 0 END
  END;

  -- Update time-based success rates
  IF p_is_peak_hour THEN
    UPDATE upi_pool SET
      peak_hour_success_rate = ((peak_hour_success_rate * 0.9) + (CASE WHEN p_success THEN 100 ELSE 0 END * 0.1))
    WHERE id = p_upi_id;
  ELSE
    UPDATE upi_pool SET
      off_peak_success_rate = ((off_peak_success_rate * 0.9) + (CASE WHEN p_success THEN 100 ELSE 0 END * 0.1))
    WHERE id = p_upi_id;
  END IF;

  IF p_is_weekend THEN
    UPDATE upi_pool SET
      weekend_success_rate = ((weekend_success_rate * 0.9) + (CASE WHEN p_success THEN 100 ELSE 0 END * 0.1))
    WHERE id = p_upi_id;
  END IF;

  -- Update avg completion time
  IF p_success AND p_completion_seconds IS NOT NULL THEN
    UPDATE upi_pool SET
      avg_completion_seconds = COALESCE(
        (avg_completion_seconds * 0.8 + p_completion_seconds * 0.2)::INTEGER,
        p_completion_seconds
      )
    WHERE id = p_upi_id;
  END IF;

  -- Learn sweet spot (track amounts that succeed)
  IF p_success THEN
    UPDATE upi_pool SET
      learned_sweet_spot_min = LEAST(COALESCE(learned_sweet_spot_min, p_amount::INTEGER), p_amount::INTEGER),
      learned_sweet_spot_max = GREATEST(COALESCE(learned_sweet_spot_max, p_amount::INTEGER), p_amount::INTEGER)
    WHERE id = p_upi_id;
  END IF;

  -- Calculate trust score (weighted formula)
  v_new_trust_score := LEAST(100, GREATEST(0, (
    (v_new_lifetime_rate * 0.4) +  -- 40% lifetime success
    (LEAST(v_upi.lifetime_txns, 100) * 0.3) +  -- 30% experience (max 100 txns)
    (CASE WHEN v_upi.verified_at IS NOT NULL THEN 20 ELSE 0 END) +  -- 20% if verified
    (CASE WHEN v_upi.qr_type = 'merchant' THEN 10 ELSE 0 END)  -- 10% if merchant QR
  )::INTEGER));

  UPDATE upi_pool SET
    lifetime_success_rate = v_new_lifetime_rate,
    trust_score = v_new_trust_score,
    updated_at = NOW()
  WHERE id = p_upi_id;

  -- Update provider stats
  UPDATE provider_stats SET
    total_txns = total_txns + 1,
    successful_txns = successful_txns + CASE WHEN p_success THEN 1 ELSE 0 END,
    failed_txns = failed_txns + CASE WHEN p_success THEN 0 ELSE 1 END,
    success_rate = (successful_txns + CASE WHEN p_success THEN 1 ELSE 0 END)::NUMERIC / 
                   (total_txns + 1) * 100,
    last_updated_at = NOW()
  WHERE provider = v_upi.upi_provider;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 8. BANK LIST TABLE
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS banks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  short_name TEXT,
  upi_handles TEXT[],  -- ['@ybl', '@ibl'] for PhonePe banks
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 100
);

-- Insert common banks
INSERT INTO banks (code, name, short_name, upi_handles, display_order) VALUES
  ('hdfc', 'HDFC Bank', 'HDFC', ARRAY['@hdfcbank', '@okhdfcbank'], 1),
  ('sbi', 'State Bank of India', 'SBI', ARRAY['@sbi', '@oksbi'], 2),
  ('icici', 'ICICI Bank', 'ICICI', ARRAY['@icici', '@ibl'], 3),
  ('axis', 'Axis Bank', 'Axis', ARRAY['@axisbank', '@okaxis', '@axl'], 4),
  ('kotak', 'Kotak Mahindra Bank', 'Kotak', ARRAY['@kotak'], 5),
  ('yesbank', 'Yes Bank', 'Yes', ARRAY['@ybl'], 6),
  ('bob', 'Bank of Baroda', 'BoB', ARRAY['@barodampay'], 7),
  ('pnb', 'Punjab National Bank', 'PNB', ARRAY['@pnb'], 8),
  ('indusind', 'IndusInd Bank', 'IndusInd', ARRAY['@indus'], 9),
  ('rbl', 'RBL Bank', 'RBL', ARRAY['@rbl'], 10),
  ('federal', 'Federal Bank', 'Federal', ARRAY['@federal'], 11),
  ('idfc', 'IDFC First Bank', 'IDFC', ARRAY['@idfcbank'], 12),
  ('paytm', 'Paytm Payments Bank', 'Paytm', ARRAY['@paytm'], 13),
  ('airtel', 'Airtel Payments Bank', 'Airtel', ARRAY['@airtel'], 14),
  ('fino', 'Fino Payments Bank', 'Fino', ARRAY['@fino'], 15),
  ('other', 'Other Bank', 'Other', ARRAY[]::TEXT[], 99)
ON CONFLICT (code) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- 9. GRANTS
-- ═══════════════════════════════════════════════════════════════════

GRANT SELECT ON banks TO authenticated;
GRANT SELECT ON provider_stats TO authenticated;
GRANT SELECT ON account_type_stats TO authenticated;
GRANT EXECUTE ON FUNCTION reset_monthly_upi_stats() TO service_role;
GRANT EXECUTE ON FUNCTION update_upi_learned_stats(UUID, NUMERIC, BOOLEAN, INTEGER, BOOLEAN, BOOLEAN) TO service_role;

-- ═══════════════════════════════════════════════════════════════════
-- DONE!
-- ═══════════════════════════════════════════════════════════════════
