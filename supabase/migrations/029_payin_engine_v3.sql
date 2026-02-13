-- Migration: Payin Engine v3.0
-- Features: Bank Circuit Breaker + Amount-based Routing

-- ═══════════════════════════════════════════════════════════════════
-- 1. BANK CIRCUITS TABLE (Circuit Breaker State)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bank_circuits (
  bank_name TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'CLOSED' CHECK (state IN ('CLOSED', 'OPEN', 'HALF_OPEN')),
  failure_rate NUMERIC(5,4) DEFAULT 0,
  total_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  last_tripped_at TIMESTAMPTZ,
  half_open_attempts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick state lookups
CREATE INDEX IF NOT EXISTS idx_bank_circuits_state ON bank_circuits(state);

-- ═══════════════════════════════════════════════════════════════════
-- 2. ADD AMOUNT ROUTING COLUMNS TO UPI_POOL
-- ═══════════════════════════════════════════════════════════════════

-- Amount tier this UPI handles best
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS amount_tier TEXT DEFAULT 'medium'
  CHECK (amount_tier IN ('micro', 'small', 'medium', 'large', 'xlarge'));

-- Hard limits (0 = no limit)
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS min_amount INTEGER DEFAULT 100;
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS max_amount INTEGER DEFAULT 100000;

-- Daily transaction count (not just volume)
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS daily_count INTEGER DEFAULT 0;

-- Ensure bank_name exists
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS bank_name TEXT;

-- Index for amount-based queries
CREATE INDEX IF NOT EXISTS idx_upi_pool_amount_tier ON upi_pool(amount_tier) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_upi_pool_bank_name ON upi_pool(bank_name) WHERE status = 'active';

-- ═══════════════════════════════════════════════════════════════════
-- 3. UPDATE SELECTION_LOGS FOR V3
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE selection_logs ADD COLUMN IF NOT EXISTS amount_tier TEXT;
ALTER TABLE selection_logs ADD COLUMN IF NOT EXISTS tier_match TEXT;
ALTER TABLE selection_logs ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE selection_logs ADD COLUMN IF NOT EXISTS engine_version TEXT DEFAULT 'v2';

-- ═══════════════════════════════════════════════════════════════════
-- 4. RPC: INCREMENT UPI SUCCESS (atomic)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION increment_upi_success(p_upi_id UUID, p_amount NUMERIC DEFAULT 0)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_rate NUMERIC;
  v_total_count INTEGER;
BEGIN
  -- Get current stats
  SELECT success_rate, daily_count INTO v_current_rate, v_total_count
  FROM upi_pool WHERE id = p_upi_id;

  -- Calculate new success rate (weighted moving average)
  -- New rate = (old_rate * count + 100) / (count + 1)
  v_total_count := COALESCE(v_total_count, 0) + 1;
  v_current_rate := COALESCE(v_current_rate, 100);

  UPDATE upi_pool SET
    daily_volume = COALESCE(daily_volume, 0) + p_amount,
    daily_count = v_total_count,
    success_rate = ((v_current_rate * (v_total_count - 1)) + 100) / v_total_count,
    hourly_failures = GREATEST(0, COALESCE(hourly_failures, 0) - 1), -- Decay failures on success
    last_used_at = NOW(),
    updated_at = NOW()
  WHERE id = p_upi_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 5. RPC: INCREMENT UPI FAILURE (atomic)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION increment_upi_failure(p_upi_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_rate NUMERIC;
  v_total_count INTEGER;
BEGIN
  -- Get current stats
  SELECT success_rate, daily_count INTO v_current_rate, v_total_count
  FROM upi_pool WHERE id = p_upi_id;

  v_total_count := COALESCE(v_total_count, 0) + 1;
  v_current_rate := COALESCE(v_current_rate, 100);

  UPDATE upi_pool SET
    daily_count = v_total_count,
    success_rate = ((v_current_rate * (v_total_count - 1)) + 0) / v_total_count,
    hourly_failures = COALESCE(hourly_failures, 0) + 1,
    last_used_at = NOW(),
    updated_at = NOW()
  WHERE id = p_upi_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 6. RPC: RESET DAILY UPI STATS (call at midnight)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION reset_daily_upi_stats()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE upi_pool SET
    daily_volume = 0,
    daily_count = 0,
    updated_at = NOW()
  WHERE daily_volume > 0 OR daily_count > 0;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 7. RPC: RESET HOURLY FAILURES (call every hour)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION reset_hourly_upi_failures()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE upi_pool SET
    hourly_failures = 0,
    updated_at = NOW()
  WHERE hourly_failures > 0;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 8. RPC: GET CIRCUIT BREAKER STATUS (for admin dashboard)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_bank_circuit_status()
RETURNS TABLE (
  bank_name TEXT,
  state TEXT,
  failure_rate NUMERIC,
  total_count INTEGER,
  failure_count INTEGER,
  last_tripped_at TIMESTAMPTZ,
  active_upis INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    bc.bank_name,
    bc.state,
    bc.failure_rate,
    bc.total_count,
    bc.failure_count,
    bc.last_tripped_at,
    COUNT(up.id)::INTEGER as active_upis
  FROM bank_circuits bc
  LEFT JOIN upi_pool up ON LOWER(up.bank_name) = bc.bank_name AND up.status = 'active'
  GROUP BY bc.bank_name, bc.state, bc.failure_rate, bc.total_count, bc.failure_count, bc.last_tripped_at
  ORDER BY 
    CASE bc.state 
      WHEN 'OPEN' THEN 1 
      WHEN 'HALF_OPEN' THEN 2 
      ELSE 3 
    END,
    bc.failure_rate DESC;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 9. RPC: MANUALLY RESET CIRCUIT (for admin)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION reset_bank_circuit(p_bank_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE bank_circuits SET
    state = 'CLOSED',
    failure_rate = 0,
    total_count = 0,
    failure_count = 0,
    last_tripped_at = NULL,
    half_open_attempts = 0,
    updated_at = NOW()
  WHERE bank_name = LOWER(p_bank_name);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bank not found');
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Circuit reset to CLOSED');
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 10. GRANT PERMISSIONS
-- ═══════════════════════════════════════════════════════════════════

GRANT SELECT ON bank_circuits TO authenticated;
GRANT EXECUTE ON FUNCTION increment_upi_success(UUID, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION increment_upi_failure(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION reset_daily_upi_stats() TO service_role;
GRANT EXECUTE ON FUNCTION reset_hourly_upi_failures() TO service_role;
GRANT EXECUTE ON FUNCTION get_bank_circuit_status() TO authenticated;
GRANT EXECUTE ON FUNCTION reset_bank_circuit(TEXT) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- 11. ADD ENGINE VERSION TO CONFIG
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO system_config (key, value, description)
VALUES (
  'payin_engine_v3_weights',
  '{
    "successRate": 25,
    "dailyLimitLeft": 20,
    "cooldown": 15,
    "amountMatch": 20,
    "traderBalance": 5,
    "bankHealth": 10,
    "recentFailures": 5
  }'::jsonb,
  'Payin Engine v3.0 scoring weights'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO system_config (key, value, description)
VALUES (
  'circuit_breaker_config',
  '{
    "failureThreshold": 0.3,
    "windowMinutes": 15,
    "cooldownMinutes": 10,
    "minSampleSize": 5,
    "halfOpenTestCount": 2
  }'::jsonb,
  'Circuit breaker configuration'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ═══════════════════════════════════════════════════════════════════
-- DONE! Run this in Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════════
