-- ═══════════════════════════════════════════════════════════════════
-- PAYIN ENGINE v4.0 - COMPLETE UPGRADE
-- Features: Velocity Checks, Live Stats, Merchant Affinity, 
--           Peak Hours, Auto Limits, Webhook Queue
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- 1. VELOCITY TRACKING (Anti-Fraud)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS velocity_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL,           -- user_id, ip, upi_id, etc.
  identifier_type TEXT NOT NULL,      -- 'user', 'ip', 'upi', 'merchant'
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER DEFAULT 1,
  total_amount NUMERIC DEFAULT 0,
  last_request_at TIMESTAMPTZ DEFAULT NOW(),
  blocked_until TIMESTAMPTZ,
  block_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(identifier, identifier_type, window_start)
);

CREATE INDEX IF NOT EXISTS idx_velocity_identifier ON velocity_tracking(identifier, identifier_type);
CREATE INDEX IF NOT EXISTS idx_velocity_blocked ON velocity_tracking(blocked_until) WHERE blocked_until IS NOT NULL;

-- Velocity limits config
CREATE TABLE IF NOT EXISTS velocity_limits (
  identifier_type TEXT PRIMARY KEY,
  max_requests_per_minute INTEGER DEFAULT 5,
  max_requests_per_hour INTEGER DEFAULT 30,
  max_amount_per_hour NUMERIC DEFAULT 100000,
  block_duration_minutes INTEGER DEFAULT 30,
  is_active BOOLEAN DEFAULT true
);

INSERT INTO velocity_limits (identifier_type, max_requests_per_minute, max_requests_per_hour, max_amount_per_hour, block_duration_minutes) VALUES
  ('user', 3, 20, 50000, 30),
  ('ip', 10, 60, 200000, 15),
  ('upi', 20, 100, 500000, 10),
  ('merchant', 100, 1000, 10000000, 5)
ON CONFLICT (identifier_type) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- 2. MERCHANT-UPI AFFINITY (Success Tracking per Pair)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS merchant_upi_affinity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  upi_pool_id UUID NOT NULL REFERENCES upi_pool(id),
  total_transactions INTEGER DEFAULT 0,
  successful_transactions INTEGER DEFAULT 0,
  failed_transactions INTEGER DEFAULT 0,
  success_rate NUMERIC(5,2) DEFAULT 100,
  total_volume NUMERIC DEFAULT 0,
  avg_completion_time_seconds INTEGER,
  last_transaction_at TIMESTAMPTZ,
  affinity_score NUMERIC(5,2) DEFAULT 50,  -- 0-100 score
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(merchant_id, upi_pool_id)
);

CREATE INDEX IF NOT EXISTS idx_affinity_merchant ON merchant_upi_affinity(merchant_id);
CREATE INDEX IF NOT EXISTS idx_affinity_score ON merchant_upi_affinity(affinity_score DESC);

-- ═══════════════════════════════════════════════════════════════════
-- 3. PEAK HOURS CONFIGURATION
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS peak_hours_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week INTEGER NOT NULL,  -- 0=Sunday, 6=Saturday
  hour_start INTEGER NOT NULL,   -- 0-23
  hour_end INTEGER NOT NULL,     -- 0-23
  is_peak BOOLEAN DEFAULT false,
  is_maintenance BOOLEAN DEFAULT false,
  volume_multiplier NUMERIC(3,2) DEFAULT 1.0,  -- Adjust expectations
  bank_name TEXT,  -- NULL = all banks
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default peak hours (10 AM - 2 PM, 6 PM - 10 PM weekdays)
INSERT INTO peak_hours_config (day_of_week, hour_start, hour_end, is_peak, volume_multiplier) VALUES
  (1, 10, 14, true, 1.2),  -- Monday peak
  (1, 18, 22, true, 1.3),
  (2, 10, 14, true, 1.2),  -- Tuesday
  (2, 18, 22, true, 1.3),
  (3, 10, 14, true, 1.2),  -- Wednesday
  (3, 18, 22, true, 1.3),
  (4, 10, 14, true, 1.2),  -- Thursday
  (4, 18, 22, true, 1.3),
  (5, 10, 14, true, 1.2),  -- Friday
  (5, 18, 22, true, 1.5),  -- Friday evening highest
  (6, 11, 20, true, 1.4),  -- Saturday
  (0, 11, 20, true, 1.3)   -- Sunday
ON CONFLICT DO NOTHING;

-- Bank maintenance windows
INSERT INTO peak_hours_config (day_of_week, hour_start, hour_end, is_maintenance, bank_name, notes) VALUES
  (0, 0, 6, true, 'hdfc', 'HDFC Sunday maintenance'),
  (0, 0, 6, true, 'icici', 'ICICI Sunday maintenance'),
  (0, 2, 5, true, 'sbi', 'SBI early morning maintenance')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- 4. LIVE STATS (Real-time Dashboard)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS engine_stats_hourly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hour_timestamp TIMESTAMPTZ NOT NULL,
  total_requests INTEGER DEFAULT 0,
  successful INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  expired INTEGER DEFAULT 0,
  avg_selection_time_ms INTEGER,
  avg_completion_time_seconds INTEGER,
  total_volume NUMERIC DEFAULT 0,
  unique_merchants INTEGER DEFAULT 0,
  unique_users INTEGER DEFAULT 0,
  top_bank TEXT,
  top_upi_id TEXT,
  circuit_trips INTEGER DEFAULT 0,
  velocity_blocks INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(hour_timestamp)
);

CREATE INDEX IF NOT EXISTS idx_stats_hourly_time ON engine_stats_hourly(hour_timestamp DESC);

-- Real-time stats view
CREATE OR REPLACE VIEW v_engine_realtime_stats AS
SELECT
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') as requests_1h,
  COUNT(*) FILTER (WHERE status = 'completed' AND created_at > NOW() - INTERVAL '1 hour') as success_1h,
  COUNT(*) FILTER (WHERE status IN ('failed', 'rejected', 'expired') AND created_at > NOW() - INTERVAL '1 hour') as failed_1h,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'completed' AND created_at > NOW() - INTERVAL '1 hour')::NUMERIC /
    NULLIF(COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour'), 0) * 100, 1
  ) as success_rate_1h,
  COALESCE(SUM(amount) FILTER (WHERE status = 'completed' AND created_at > NOW() - INTERVAL '1 hour'), 0) as volume_1h,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '15 minutes') as requests_15m,
  COUNT(*) FILTER (WHERE status = 'completed' AND created_at > NOW() - INTERVAL '15 minutes') as success_15m,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'completed' AND created_at > NOW() - INTERVAL '15 minutes')::NUMERIC /
    NULLIF(COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '15 minutes'), 0) * 100, 1
  ) as success_rate_15m
FROM payins;

-- ═══════════════════════════════════════════════════════════════════
-- 5. AUTO DAILY LIMITS (Performance-based)
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS base_daily_limit INTEGER DEFAULT 100000;
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS auto_limit_enabled BOOLEAN DEFAULT true;
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS performance_multiplier NUMERIC(3,2) DEFAULT 1.0;
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS consecutive_successes INTEGER DEFAULT 0;
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER DEFAULT 0;

-- ═══════════════════════════════════════════════════════════════════
-- 6. ALERTS SYSTEM
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS engine_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL,  -- 'circuit_trip', 'low_success_rate', 'high_volume', 'velocity_block'
  severity TEXT NOT NULL DEFAULT 'warning',  -- 'info', 'warning', 'critical'
  title TEXT NOT NULL,
  message TEXT,
  metadata JSONB,
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_by UUID,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_unack ON engine_alerts(created_at DESC) WHERE acknowledged = false;

-- ═══════════════════════════════════════════════════════════════════
-- 7. RPC FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════

-- Check velocity limits
CREATE OR REPLACE FUNCTION check_velocity(
  p_identifier TEXT,
  p_identifier_type TEXT,
  p_amount NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_limits RECORD;
  v_minute_count INTEGER;
  v_hour_count INTEGER;
  v_hour_amount NUMERIC;
  v_blocked_until TIMESTAMPTZ;
BEGIN
  -- Get limits
  SELECT * INTO v_limits FROM velocity_limits WHERE identifier_type = p_identifier_type AND is_active = true;
  IF v_limits IS NULL THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'no_limits_configured');
  END IF;

  -- Check if currently blocked
  SELECT blocked_until INTO v_blocked_until
  FROM velocity_tracking
  WHERE identifier = p_identifier AND identifier_type = p_identifier_type
  AND blocked_until > NOW()
  LIMIT 1;

  IF v_blocked_until IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'blocked',
      'blocked_until', v_blocked_until,
      'retry_after_seconds', EXTRACT(EPOCH FROM (v_blocked_until - NOW()))::INTEGER
    );
  END IF;

  -- Count requests in last minute
  SELECT COUNT(*) INTO v_minute_count
  FROM velocity_tracking
  WHERE identifier = p_identifier 
  AND identifier_type = p_identifier_type
  AND last_request_at > NOW() - INTERVAL '1 minute';

  IF v_minute_count >= v_limits.max_requests_per_minute THEN
    -- Block user
    INSERT INTO velocity_tracking (identifier, identifier_type, window_start, blocked_until, block_reason)
    VALUES (p_identifier, p_identifier_type, date_trunc('minute', NOW()), 
            NOW() + (v_limits.block_duration_minutes || ' minutes')::INTERVAL,
            'Exceeded ' || v_limits.max_requests_per_minute || ' requests/minute');
    
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'rate_limit_minute',
      'limit', v_limits.max_requests_per_minute,
      'blocked_minutes', v_limits.block_duration_minutes
    );
  END IF;

  -- Count requests in last hour
  SELECT COUNT(*), COALESCE(SUM(total_amount), 0) INTO v_hour_count, v_hour_amount
  FROM velocity_tracking
  WHERE identifier = p_identifier 
  AND identifier_type = p_identifier_type
  AND last_request_at > NOW() - INTERVAL '1 hour';

  IF v_hour_count >= v_limits.max_requests_per_hour THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'rate_limit_hour', 'limit', v_limits.max_requests_per_hour);
  END IF;

  IF v_hour_amount + p_amount > v_limits.max_amount_per_hour THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'amount_limit_hour', 'limit', v_limits.max_amount_per_hour);
  END IF;

  -- Record this request
  INSERT INTO velocity_tracking (identifier, identifier_type, window_start, total_amount, last_request_at)
  VALUES (p_identifier, p_identifier_type, date_trunc('minute', NOW()), p_amount, NOW())
  ON CONFLICT (identifier, identifier_type, window_start) 
  DO UPDATE SET request_count = velocity_tracking.request_count + 1,
                total_amount = velocity_tracking.total_amount + p_amount,
                last_request_at = NOW();

  RETURN jsonb_build_object('allowed', true, 'requests_this_hour', v_hour_count + 1);
END;
$$;

-- Update merchant-UPI affinity after transaction
CREATE OR REPLACE FUNCTION update_merchant_affinity(
  p_merchant_id UUID,
  p_upi_pool_id UUID,
  p_success BOOLEAN,
  p_amount NUMERIC,
  p_completion_time_seconds INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_affinity RECORD;
  v_new_success_rate NUMERIC;
  v_new_affinity_score NUMERIC;
BEGIN
  -- Upsert affinity record
  INSERT INTO merchant_upi_affinity (merchant_id, upi_pool_id, total_transactions, 
    successful_transactions, failed_transactions, total_volume, last_transaction_at)
  VALUES (p_merchant_id, p_upi_pool_id, 1, 
    CASE WHEN p_success THEN 1 ELSE 0 END,
    CASE WHEN p_success THEN 0 ELSE 1 END,
    CASE WHEN p_success THEN p_amount ELSE 0 END,
    NOW())
  ON CONFLICT (merchant_id, upi_pool_id) DO UPDATE SET
    total_transactions = merchant_upi_affinity.total_transactions + 1,
    successful_transactions = merchant_upi_affinity.successful_transactions + CASE WHEN p_success THEN 1 ELSE 0 END,
    failed_transactions = merchant_upi_affinity.failed_transactions + CASE WHEN p_success THEN 0 ELSE 1 END,
    total_volume = merchant_upi_affinity.total_volume + CASE WHEN p_success THEN p_amount ELSE 0 END,
    last_transaction_at = NOW(),
    updated_at = NOW();

  -- Recalculate scores
  SELECT * INTO v_affinity FROM merchant_upi_affinity 
  WHERE merchant_id = p_merchant_id AND upi_pool_id = p_upi_pool_id;

  v_new_success_rate := (v_affinity.successful_transactions::NUMERIC / NULLIF(v_affinity.total_transactions, 0)) * 100;
  
  -- Affinity score = weighted combination of success rate and volume
  v_new_affinity_score := (v_new_success_rate * 0.7) + 
    (LEAST(v_affinity.total_transactions, 100)::NUMERIC / 100 * 30);

  UPDATE merchant_upi_affinity SET
    success_rate = v_new_success_rate,
    affinity_score = v_new_affinity_score,
    avg_completion_time_seconds = CASE 
      WHEN p_completion_time_seconds IS NOT NULL THEN
        COALESCE((avg_completion_time_seconds * (total_transactions - 1) + p_completion_time_seconds) / total_transactions, p_completion_time_seconds)
      ELSE avg_completion_time_seconds
    END
  WHERE merchant_id = p_merchant_id AND upi_pool_id = p_upi_pool_id;
END;
$$;

-- Auto-adjust daily limits based on performance
CREATE OR REPLACE FUNCTION auto_adjust_upi_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER := 0;
  v_upi RECORD;
  v_new_multiplier NUMERIC;
BEGIN
  FOR v_upi IN 
    SELECT id, success_rate, consecutive_successes, consecutive_failures, 
           base_daily_limit, performance_multiplier
    FROM upi_pool 
    WHERE auto_limit_enabled = true AND status = 'active'
  LOOP
    -- Calculate new multiplier
    IF v_upi.success_rate >= 95 AND v_upi.consecutive_successes >= 10 THEN
      v_new_multiplier := LEAST(v_upi.performance_multiplier * 1.1, 2.0);  -- Max 2x
    ELSIF v_upi.success_rate < 70 OR v_upi.consecutive_failures >= 3 THEN
      v_new_multiplier := GREATEST(v_upi.performance_multiplier * 0.8, 0.5);  -- Min 0.5x
    ELSE
      v_new_multiplier := v_upi.performance_multiplier;
    END IF;

    IF v_new_multiplier != v_upi.performance_multiplier THEN
      UPDATE upi_pool SET
        performance_multiplier = v_new_multiplier,
        daily_limit = (base_daily_limit * v_new_multiplier)::INTEGER,
        updated_at = NOW()
      WHERE id = v_upi.id;
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Get current peak status
CREATE OR REPLACE FUNCTION get_peak_status(p_bank_name TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_dow INTEGER;
  v_hour INTEGER;
  v_is_peak BOOLEAN := false;
  v_is_maintenance BOOLEAN := false;
  v_multiplier NUMERIC := 1.0;
BEGIN
  v_dow := EXTRACT(DOW FROM NOW());
  v_hour := EXTRACT(HOUR FROM NOW());

  -- Check peak hours
  SELECT is_peak, volume_multiplier INTO v_is_peak, v_multiplier
  FROM peak_hours_config
  WHERE day_of_week = v_dow 
  AND hour_start <= v_hour AND hour_end > v_hour
  AND is_peak = true
  AND bank_name IS NULL
  LIMIT 1;

  -- Check maintenance windows
  SELECT true INTO v_is_maintenance
  FROM peak_hours_config
  WHERE day_of_week = v_dow 
  AND hour_start <= v_hour AND hour_end > v_hour
  AND is_maintenance = true
  AND (bank_name IS NULL OR bank_name = LOWER(p_bank_name))
  LIMIT 1;

  RETURN jsonb_build_object(
    'is_peak', COALESCE(v_is_peak, false),
    'is_maintenance', COALESCE(v_is_maintenance, false),
    'volume_multiplier', COALESCE(v_multiplier, 1.0),
    'current_hour', v_hour,
    'day_of_week', v_dow
  );
END;
$$;

-- Create alert
CREATE OR REPLACE FUNCTION create_engine_alert(
  p_type TEXT,
  p_severity TEXT,
  p_title TEXT,
  p_message TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO engine_alerts (alert_type, severity, title, message, metadata)
  VALUES (p_type, p_severity, p_title, p_message, p_metadata)
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

-- Get realtime stats
CREATE OR REPLACE FUNCTION get_engine_realtime_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stats RECORD;
  v_top_banks JSONB;
  v_alerts INTEGER;
BEGIN
  SELECT * INTO v_stats FROM v_engine_realtime_stats;

  -- Top performing banks last hour
  SELECT jsonb_agg(jsonb_build_object('bank', bank_name, 'count', cnt, 'success_rate', rate))
  INTO v_top_banks
  FROM (
    SELECT 
      COALESCE(up.bank_name, 'unknown') as bank_name,
      COUNT(*) as cnt,
      ROUND(COUNT(*) FILTER (WHERE p.status = 'completed')::NUMERIC / COUNT(*) * 100, 1) as rate
    FROM payins p
    LEFT JOIN upi_pool up ON p.upi_pool_id = up.id
    WHERE p.created_at > NOW() - INTERVAL '1 hour'
    GROUP BY up.bank_name
    ORDER BY cnt DESC
    LIMIT 5
  ) t;

  -- Unacknowledged alerts count
  SELECT COUNT(*) INTO v_alerts FROM engine_alerts WHERE acknowledged = false;

  RETURN jsonb_build_object(
    'requests_1h', v_stats.requests_1h,
    'success_1h', v_stats.success_1h,
    'failed_1h', v_stats.failed_1h,
    'success_rate_1h', v_stats.success_rate_1h,
    'volume_1h', v_stats.volume_1h,
    'requests_15m', v_stats.requests_15m,
    'success_15m', v_stats.success_15m,
    'success_rate_15m', v_stats.success_rate_15m,
    'top_banks', v_top_banks,
    'unack_alerts', v_alerts,
    'timestamp', NOW()
  );
END;
$$;

-- Cleanup old velocity records (run daily)
CREATE OR REPLACE FUNCTION cleanup_velocity_records()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM velocity_tracking WHERE last_request_at < NOW() - INTERVAL '24 hours';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 8. GRANTS
-- ═══════════════════════════════════════════════════════════════════

GRANT SELECT ON velocity_tracking TO authenticated;
GRANT SELECT ON velocity_limits TO authenticated;
GRANT SELECT ON merchant_upi_affinity TO authenticated;
GRANT SELECT ON peak_hours_config TO authenticated;
GRANT SELECT ON engine_stats_hourly TO authenticated;
GRANT SELECT ON engine_alerts TO authenticated;
GRANT SELECT ON v_engine_realtime_stats TO authenticated;

GRANT EXECUTE ON FUNCTION check_velocity(TEXT, TEXT, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION update_merchant_affinity(UUID, UUID, BOOLEAN, NUMERIC, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION auto_adjust_upi_limits() TO service_role;
GRANT EXECUTE ON FUNCTION get_peak_status(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_engine_alert(TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION get_engine_realtime_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_velocity_records() TO service_role;

-- ═══════════════════════════════════════════════════════════════════
-- DONE! Payin Engine v4.0 Complete
-- ═══════════════════════════════════════════════════════════════════
