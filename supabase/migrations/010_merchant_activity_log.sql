-- =============================================
-- Merchant Activity Log System
-- Complete audit trail for merchant actions
-- =============================================

-- Drop ALL existing log_merchant_activity functions (any signature)
DO $$
DECLARE
  func_record RECORD;
BEGIN
  FOR func_record IN
    SELECT p.oid::regprocedure as func_signature
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'log_merchant_activity'
      AND n.nspname = 'public'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || func_record.func_signature || ' CASCADE';
  END LOOP;
END $$;

-- Drop table if exists for clean migration
DROP TABLE IF EXISTS merchant_activity_log CASCADE;

-- Create merchant activity log table
CREATE TABLE merchant_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  
  -- Action details
  action TEXT NOT NULL,           -- e.g., 'payout.created', 'api_key.regenerated'
  category TEXT NOT NULL,         -- 'auth', 'api', 'payout', 'dispute', 'refund', 'settlement', 'settings'
  severity TEXT DEFAULT 'info',   -- 'info', 'warning', 'critical'
  
  -- What was affected
  entity_type TEXT,               -- 'payout', 'dispute', 'refund', 'settlement', 'webhook', etc.
  entity_id TEXT,                 -- ID of the affected entity
  
  -- Rich details
  description TEXT,               -- Human-readable description
  details JSONB DEFAULT '{}',     -- Full context (amounts, old/new values, etc.)
  
  -- Request context
  ip_address INET,
  user_agent TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX idx_merchant_activity_merchant ON merchant_activity_log(merchant_id);
CREATE INDEX idx_merchant_activity_created ON merchant_activity_log(created_at DESC);
CREATE INDEX idx_merchant_activity_category ON merchant_activity_log(category);
CREATE INDEX idx_merchant_activity_action ON merchant_activity_log(action);
CREATE INDEX idx_merchant_activity_severity ON merchant_activity_log(severity);

-- Enable RLS
ALTER TABLE merchant_activity_log ENABLE ROW LEVEL SECURITY;

-- Merchants can only see their own logs
CREATE POLICY "merchant_activity_log_select" ON merchant_activity_log
  FOR SELECT USING (
    merchant_id IN (
      SELECT id FROM merchants WHERE profile_id = auth.uid()
    )
  );

-- Insert allowed for authenticated users (their own merchant)
CREATE POLICY "merchant_activity_log_insert" ON merchant_activity_log
  FOR INSERT WITH CHECK (
    merchant_id IN (
      SELECT id FROM merchants WHERE profile_id = auth.uid()
    )
  );

-- =============================================
-- RPC Function for easy logging from frontend
-- =============================================
CREATE OR REPLACE FUNCTION log_merchant_activity(
  p_action TEXT,
  p_category TEXT,
  p_description TEXT DEFAULT NULL,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id TEXT DEFAULT NULL,
  p_details JSONB DEFAULT '{}',
  p_severity TEXT DEFAULT 'info',
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_merchant_id UUID;
  v_log_id UUID;
BEGIN
  -- Get merchant ID for current user
  SELECT id INTO v_merchant_id
  FROM merchants
  WHERE profile_id = auth.uid()
  LIMIT 1;
  
  IF v_merchant_id IS NULL THEN
    RAISE EXCEPTION 'Merchant not found for current user';
  END IF;
  
  -- Insert log entry
  INSERT INTO merchant_activity_log (
    merchant_id, user_id, action, category, severity,
    entity_type, entity_id, description, details,
    ip_address, user_agent
  ) VALUES (
    v_merchant_id, auth.uid(), p_action, p_category, p_severity,
    p_entity_type, p_entity_id, p_description, p_details,
    p_ip_address::INET, p_user_agent
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION log_merchant_activity TO authenticated;

-- =============================================
-- Comments for documentation
-- =============================================
COMMENT ON TABLE merchant_activity_log IS 'Complete audit trail of merchant actions';
COMMENT ON COLUMN merchant_activity_log.action IS 'Action identifier like payout.created, api_key.regenerated';
COMMENT ON COLUMN merchant_activity_log.category IS 'Category: auth, api, payout, dispute, refund, settlement, settings';
COMMENT ON COLUMN merchant_activity_log.severity IS 'Severity level: info, warning, critical';
COMMENT ON COLUMN merchant_activity_log.details IS 'JSON with full context (amounts, changes, metadata)';
