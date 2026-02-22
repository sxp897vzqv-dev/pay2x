-- Fix dispute_messages column names for compatibility
-- DB has: sender_role, created_at
-- Code uses: sender/from, timestamp

-- Add alias columns for code compatibility
ALTER TABLE dispute_messages ADD COLUMN IF NOT EXISTS "from" TEXT;
ALTER TABLE dispute_messages ADD COLUMN IF NOT EXISTS sender TEXT;
ALTER TABLE dispute_messages ADD COLUMN IF NOT EXISTS sender_id UUID;
ALTER TABLE dispute_messages ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ;

-- Create trigger to sync columns on insert/update
CREATE OR REPLACE FUNCTION sync_dispute_message_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- Sync from -> sender_role
  IF NEW."from" IS NOT NULL AND NEW.sender_role IS NULL THEN
    NEW.sender_role := NEW."from";
  END IF;
  
  -- Sync sender -> sender_role  
  IF NEW.sender IS NOT NULL AND NEW.sender_role IS NULL THEN
    NEW.sender_role := NEW.sender;
  END IF;
  
  -- Sync sender_role -> from and sender
  IF NEW.sender_role IS NOT NULL THEN
    NEW."from" := NEW.sender_role;
    NEW.sender := NEW.sender_role;
  END IF;
  
  -- Sync timestamp <-> created_at
  IF NEW.timestamp IS NOT NULL AND NEW.created_at IS NULL THEN
    NEW.created_at := NEW.timestamp;
  END IF;
  IF NEW.created_at IS NOT NULL THEN
    NEW.timestamp := NEW.created_at;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_dispute_message_cols ON dispute_messages;
CREATE TRIGGER sync_dispute_message_cols
  BEFORE INSERT OR UPDATE ON dispute_messages
  FOR EACH ROW EXECUTE FUNCTION sync_dispute_message_columns();

-- Backfill existing data
UPDATE dispute_messages SET
  "from" = sender_role,
  sender = sender_role,
  timestamp = created_at
WHERE "from" IS NULL OR sender IS NULL OR timestamp IS NULL;
