-- ============================================================================
-- Migration 034: Geo-based UPI Scoring
-- ============================================================================
-- 1. Add location columns to upi_pool (trader bank location)
-- 2. Add user location columns to payins
-- 3. Update selection_logs to show geo matching
-- ============================================================================

-- Trader UPI bank location (from IFSC)
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS bank_city TEXT;
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS bank_state TEXT;
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS bank_branch TEXT;
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS bank_ifsc TEXT;

-- User location (from IP geolocation)
ALTER TABLE payins ADD COLUMN IF NOT EXISTS user_city TEXT;
ALTER TABLE payins ADD COLUMN IF NOT EXISTS user_state TEXT;
ALTER TABLE payins ADD COLUMN IF NOT EXISTS user_ip TEXT;
ALTER TABLE payins ADD COLUMN IF NOT EXISTS user_lat DECIMAL(10, 7);
ALTER TABLE payins ADD COLUMN IF NOT EXISTS user_lon DECIMAL(10, 7);

-- Geo match info in selection logs
ALTER TABLE selection_logs ADD COLUMN IF NOT EXISTS geo_match TEXT; -- 'city', 'state', 'none'
ALTER TABLE selection_logs ADD COLUMN IF NOT EXISTS geo_boost INT DEFAULT 0;
ALTER TABLE selection_logs ADD COLUMN IF NOT EXISTS user_city TEXT;
ALTER TABLE selection_logs ADD COLUMN IF NOT EXISTS upi_city TEXT;

-- Index for geo queries
CREATE INDEX IF NOT EXISTS idx_upi_pool_city ON upi_pool(bank_city) WHERE bank_city IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_upi_pool_state ON upi_pool(bank_state) WHERE bank_state IS NOT NULL;

-- ============================================================================
-- Add geo scoring weights to engine config
-- ============================================================================
UPDATE system_config 
SET value = jsonb_set(
  COALESCE(value, '{}'::jsonb),
  '{scoring_weights}',
  COALESCE(value->'scoring_weights', '{}'::jsonb) || 
  '{"sameCity": 15, "sameState": 8}'::jsonb
)
WHERE key = 'payin_engine';

-- If no config exists, create it
INSERT INTO system_config (key, value)
SELECT 'payin_engine', '{"scoring_weights": {"sameCity": 15, "sameState": 8}}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM system_config WHERE key = 'payin_engine');

COMMENT ON COLUMN upi_pool.bank_city IS 'Bank branch city from IFSC lookup';
COMMENT ON COLUMN upi_pool.bank_state IS 'Bank branch state from IFSC lookup';
COMMENT ON COLUMN payins.user_city IS 'User city from IP geolocation';
COMMENT ON COLUMN payins.user_state IS 'User state from IP geolocation';
COMMENT ON COLUMN selection_logs.geo_match IS 'Geo match level: city, state, or none';
COMMENT ON COLUMN selection_logs.geo_boost IS 'Score boost from geo matching';
