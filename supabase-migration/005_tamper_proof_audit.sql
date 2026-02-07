-- ============================================
-- TAMPER-PROOF AUDIT TRAIL
-- Hash chain + append-only + integrity check
-- ============================================

-- 1. Add hash chain columns to admin_logs
ALTER TABLE admin_logs ADD COLUMN IF NOT EXISTS sequence_num BIGSERIAL;
ALTER TABLE admin_logs ADD COLUMN IF NOT EXISTS prev_hash TEXT;
ALTER TABLE admin_logs ADD COLUMN IF NOT EXISTS row_hash TEXT;
ALTER TABLE admin_logs ADD COLUMN IF NOT EXISTS timestamp_ms BIGINT;

-- 2. Create hash computation function
CREATE OR REPLACE FUNCTION compute_audit_hash()
RETURNS TRIGGER AS $$
DECLARE
  prev_record RECORD;
  hash_input TEXT;
BEGIN
  -- Get the previous record's hash (for chain)
  SELECT row_hash, sequence_num INTO prev_record 
  FROM admin_logs 
  ORDER BY sequence_num DESC 
  LIMIT 1;
  
  -- Set previous hash (genesis if first record)
  NEW.prev_hash := COALESCE(prev_record.row_hash, 'GENESIS_BLOCK_PAY2X_2026');
  
  -- Set timestamp in milliseconds for precision
  NEW.timestamp_ms := EXTRACT(EPOCH FROM NOW()) * 1000;
  
  -- Build hash input: prev_hash + action + entity + details + timestamp
  hash_input := NEW.prev_hash || '|' ||
                COALESCE(NEW.action, '') || '|' ||
                COALESCE(NEW.category, '') || '|' ||
                COALESCE(NEW.entity_type, '') || '|' ||
                COALESCE(NEW.entity_id::TEXT, '') || '|' ||
                COALESCE(NEW.entity_name, '') || '|' ||
                COALESCE(NEW.details::TEXT, '{}') || '|' ||
                COALESCE(NEW.performed_by::TEXT, '') || '|' ||
                COALESCE(NEW.performed_by_ip::TEXT, '') || '|' ||
                NEW.timestamp_ms::TEXT;
  
  -- Compute SHA-256 hash
  NEW.row_hash := encode(sha256(hash_input::bytea), 'hex');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create trigger (drop if exists first)
DROP TRIGGER IF EXISTS audit_hash_chain_trigger ON admin_logs;

CREATE TRIGGER audit_hash_chain_trigger
BEFORE INSERT ON admin_logs
FOR EACH ROW EXECUTE FUNCTION compute_audit_hash();

-- 4. REVOKE UPDATE and DELETE permissions (append-only)
-- Note: This makes audit logs immutable!
REVOKE UPDATE ON admin_logs FROM authenticated;
REVOKE DELETE ON admin_logs FROM authenticated;
REVOKE UPDATE ON admin_logs FROM anon;
REVOKE DELETE ON admin_logs FROM anon;

-- Keep service_role ability to delete for GDPR compliance if needed
-- But log any such deletions separately

-- 5. Create audit integrity verification function
CREATE OR REPLACE FUNCTION verify_audit_chain(
  p_start_seq BIGINT DEFAULT 1,
  p_end_seq BIGINT DEFAULT NULL
)
RETURNS TABLE (
  is_valid BOOLEAN,
  total_records BIGINT,
  verified_records BIGINT,
  first_invalid_seq BIGINT,
  first_invalid_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec RECORD;
  prev_hash TEXT := 'GENESIS_BLOCK_PAY2X_2026';
  computed_hash TEXT;
  hash_input TEXT;
  record_count BIGINT := 0;
  verified_count BIGINT := 0;
  invalid_seq BIGINT := NULL;
  invalid_reason TEXT := NULL;
BEGIN
  -- Get total count
  SELECT COUNT(*) INTO record_count 
  FROM admin_logs 
  WHERE sequence_num >= p_start_seq 
  AND (p_end_seq IS NULL OR sequence_num <= p_end_seq);
  
  -- Iterate through records in order
  FOR rec IN 
    SELECT * FROM admin_logs 
    WHERE sequence_num >= p_start_seq 
    AND (p_end_seq IS NULL OR sequence_num <= p_end_seq)
    ORDER BY sequence_num ASC
  LOOP
    -- Check if prev_hash matches
    IF rec.prev_hash != prev_hash THEN
      invalid_seq := rec.sequence_num;
      invalid_reason := 'prev_hash mismatch: expected ' || LEFT(prev_hash, 16) || '..., got ' || LEFT(rec.prev_hash, 16) || '...';
      EXIT;
    END IF;
    
    -- Recompute hash
    hash_input := rec.prev_hash || '|' ||
                  COALESCE(rec.action, '') || '|' ||
                  COALESCE(rec.category, '') || '|' ||
                  COALESCE(rec.entity_type, '') || '|' ||
                  COALESCE(rec.entity_id::TEXT, '') || '|' ||
                  COALESCE(rec.entity_name, '') || '|' ||
                  COALESCE(rec.details::TEXT, '{}') || '|' ||
                  COALESCE(rec.performed_by::TEXT, '') || '|' ||
                  COALESCE(rec.performed_by_ip::TEXT, '') || '|' ||
                  rec.timestamp_ms::TEXT;
    
    computed_hash := encode(sha256(hash_input::bytea), 'hex');
    
    -- Verify hash matches
    IF rec.row_hash != computed_hash THEN
      invalid_seq := rec.sequence_num;
      invalid_reason := 'row_hash mismatch: data may have been tampered';
      EXIT;
    END IF;
    
    -- Update for next iteration
    prev_hash := rec.row_hash;
    verified_count := verified_count + 1;
  END LOOP;
  
  RETURN QUERY SELECT 
    (invalid_seq IS NULL) AS is_valid,
    record_count AS total_records,
    verified_count AS verified_records,
    invalid_seq AS first_invalid_seq,
    invalid_reason AS first_invalid_reason;
END;
$$;

-- 6. Create function to get audit chain summary
CREATE OR REPLACE FUNCTION get_audit_chain_status()
RETURNS TABLE (
  total_records BIGINT,
  first_record_at TIMESTAMPTZ,
  last_record_at TIMESTAMPTZ,
  last_hash TEXT,
  chain_valid BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  verification RECORD;
BEGIN
  -- Get verification result
  SELECT * INTO verification FROM verify_audit_chain();
  
  RETURN QUERY 
  SELECT 
    (SELECT COUNT(*) FROM admin_logs),
    (SELECT MIN(created_at) FROM admin_logs),
    (SELECT MAX(created_at) FROM admin_logs),
    (SELECT row_hash FROM admin_logs ORDER BY sequence_num DESC LIMIT 1),
    verification.is_valid;
END;
$$;

-- 7. Create audit snapshot table for periodic verification
CREATE TABLE IF NOT EXISTS audit_chain_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_at TIMESTAMPTZ DEFAULT now(),
  last_sequence_num BIGINT NOT NULL,
  last_row_hash TEXT NOT NULL,
  total_records BIGINT NOT NULL,
  verification_result JSONB NOT NULL,
  verified_by UUID REFERENCES profiles(id),
  notes TEXT
);

ALTER TABLE audit_chain_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_snapshots ON audit_chain_snapshots
  FOR ALL USING (public.user_role() = 'admin');

-- 8. Function to create a snapshot
CREATE OR REPLACE FUNCTION create_audit_snapshot(p_notes TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_snapshot_id UUID;
  v_last_seq BIGINT;
  v_last_hash TEXT;
  v_total BIGINT;
  v_verification JSONB;
BEGIN
  -- Get current state
  SELECT sequence_num, row_hash INTO v_last_seq, v_last_hash
  FROM admin_logs ORDER BY sequence_num DESC LIMIT 1;
  
  SELECT COUNT(*) INTO v_total FROM admin_logs;
  
  -- Run verification
  SELECT jsonb_build_object(
    'is_valid', is_valid,
    'total_records', total_records,
    'verified_records', verified_records,
    'first_invalid_seq', first_invalid_seq,
    'first_invalid_reason', first_invalid_reason
  ) INTO v_verification
  FROM verify_audit_chain();
  
  -- Create snapshot
  INSERT INTO audit_chain_snapshots (
    last_sequence_num,
    last_row_hash,
    total_records,
    verification_result,
    verified_by,
    notes
  ) VALUES (
    COALESCE(v_last_seq, 0),
    COALESCE(v_last_hash, 'EMPTY'),
    v_total,
    v_verification,
    auth.uid(),
    p_notes
  )
  RETURNING id INTO v_snapshot_id;
  
  RETURN v_snapshot_id;
END;
$$;

-- 9. Backfill existing records with hashes
-- Run this once to add hashes to existing records
DO $$
DECLARE
  rec RECORD;
  v_prev_hash TEXT := 'GENESIS_BLOCK_PAY2X_2026';
  hash_input TEXT;
  computed_hash TEXT;
  ts_ms BIGINT;
BEGIN
  -- Only backfill if not already done
  IF EXISTS (SELECT 1 FROM admin_logs WHERE row_hash IS NULL LIMIT 1) THEN
    RAISE NOTICE 'Backfilling audit log hashes...';
    
    FOR rec IN 
      SELECT * FROM admin_logs 
      WHERE row_hash IS NULL
      ORDER BY created_at ASC, id ASC
    LOOP
      ts_ms := EXTRACT(EPOCH FROM rec.created_at) * 1000;
      
      hash_input := v_prev_hash || '|' ||
                    COALESCE(rec.action, '') || '|' ||
                    COALESCE(rec.category, '') || '|' ||
                    COALESCE(rec.entity_type, '') || '|' ||
                    COALESCE(rec.entity_id::TEXT, '') || '|' ||
                    COALESCE(rec.entity_name, '') || '|' ||
                    COALESCE(rec.details::TEXT, '{}') || '|' ||
                    COALESCE(rec.performed_by::TEXT, '') || '|' ||
                    COALESCE(rec.performed_by_ip::TEXT, '') || '|' ||
                    ts_ms::TEXT;
      
      computed_hash := encode(sha256(hash_input::bytea), 'hex');
      
      UPDATE admin_logs 
      SET prev_hash = v_prev_hash,
          row_hash = computed_hash,
          timestamp_ms = ts_ms
      WHERE id = rec.id;
      
      v_prev_hash := computed_hash;
    END LOOP;
    
    RAISE NOTICE 'Backfill complete!';
  ELSE
    RAISE NOTICE 'Audit logs already have hashes, skipping backfill.';
  END IF;
END $$;

-- 10. Grant execute permissions
GRANT EXECUTE ON FUNCTION verify_audit_chain TO authenticated;
GRANT EXECUTE ON FUNCTION get_audit_chain_status TO authenticated;
GRANT EXECUTE ON FUNCTION create_audit_snapshot TO authenticated;

-- Done!
SELECT 'Tamper-proof audit trail configured!' as status;
