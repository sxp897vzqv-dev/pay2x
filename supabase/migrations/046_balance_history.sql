-- Balance History: Track every balance change with full audit trail

-- 1. Balance History Table
CREATE TABLE IF NOT EXISTS balance_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Who's balance changed
  entity_type TEXT NOT NULL CHECK (entity_type IN ('trader', 'merchant')),
  entity_id UUID NOT NULL,
  
  -- Change details
  amount DECIMAL(15,2) NOT NULL,  -- Positive = credit, Negative = debit
  balance_before DECIMAL(15,2) NOT NULL,
  balance_after DECIMAL(15,2) NOT NULL,
  
  -- Context
  reason TEXT NOT NULL,  -- 'payin_completed', 'payout_verified', 'dispute_approved', 'manual_adjustment', etc.
  reference_type TEXT,   -- 'payin', 'payout', 'dispute', 'settlement', etc.
  reference_id UUID,     -- ID of the related transaction
  
  -- Audit
  actor_id UUID,         -- Who made the change (null for system)
  actor_role TEXT,       -- 'system', 'admin', 'trader', 'merchant'
  note TEXT,             -- Optional note
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Indexes
  CONSTRAINT fk_entity CHECK (
    (entity_type = 'trader' AND entity_id IS NOT NULL) OR
    (entity_type = 'merchant' AND entity_id IS NOT NULL)
  )
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_balance_history_entity ON balance_history(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_balance_history_created ON balance_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_balance_history_reason ON balance_history(reason);
CREATE INDEX IF NOT EXISTS idx_balance_history_reference ON balance_history(reference_type, reference_id);

-- 2. RLS Policies
ALTER TABLE balance_history ENABLE ROW LEVEL SECURITY;

-- Admins can see all
CREATE POLICY "Admin full access balance_history" ON balance_history
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Traders can see their own
CREATE POLICY "Traders view own balance_history" ON balance_history
  FOR SELECT TO authenticated
  USING (
    entity_type = 'trader' AND 
    entity_id IN (SELECT id FROM traders WHERE profile_id = auth.uid())
  );

-- Merchants can see their own
CREATE POLICY "Merchants view own balance_history" ON balance_history
  FOR SELECT TO authenticated
  USING (
    entity_type = 'merchant' AND 
    entity_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid())
  );

-- Service role full access
CREATE POLICY "Service role balance_history" ON balance_history
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 3. Function to log balance changes
CREATE OR REPLACE FUNCTION log_balance_change(
  p_entity_type TEXT,
  p_entity_id UUID,
  p_amount DECIMAL,
  p_balance_before DECIMAL,
  p_balance_after DECIMAL,
  p_reason TEXT,
  p_reference_type TEXT DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL,
  p_actor_role TEXT DEFAULT 'system',
  p_note TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO balance_history (
    entity_type, entity_id, amount, balance_before, balance_after,
    reason, reference_type, reference_id, actor_id, actor_role, note, metadata
  ) VALUES (
    p_entity_type, p_entity_id, p_amount, p_balance_before, p_balance_after,
    p_reason, p_reference_type, p_reference_id, p_actor_id, p_actor_role, p_note, p_metadata
  ) RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. View for easy querying with entity names
CREATE OR REPLACE VIEW v_balance_history AS
SELECT 
  bh.*,
  CASE 
    WHEN bh.entity_type = 'trader' THEN t.name
    WHEN bh.entity_type = 'merchant' THEN m.name
  END as entity_name,
  CASE 
    WHEN bh.entity_type = 'trader' THEN t.email
    WHEN bh.entity_type = 'merchant' THEN m.email
  END as entity_email
FROM balance_history bh
LEFT JOIN traders t ON bh.entity_type = 'trader' AND bh.entity_id = t.id
LEFT JOIN merchants m ON bh.entity_type = 'merchant' AND bh.entity_id = m.id;

-- 5. Grant permissions
GRANT SELECT ON balance_history TO authenticated;
GRANT SELECT ON v_balance_history TO authenticated;
GRANT EXECUTE ON FUNCTION log_balance_change TO authenticated;
GRANT EXECUTE ON FUNCTION log_balance_change TO service_role;
