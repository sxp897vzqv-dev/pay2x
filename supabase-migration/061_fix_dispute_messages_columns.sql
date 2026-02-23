-- Fix dispute_messages table to have ALL columns that code expects
-- This adds missing columns without breaking existing data

-- Add 'sender' column (edge function uses this)
ALTER TABLE dispute_messages ADD COLUMN IF NOT EXISTS sender TEXT;

-- Add 'sender_id' column (edge function uses this)
ALTER TABLE dispute_messages ADD COLUMN IF NOT EXISTS sender_id UUID;

-- Add 'message' column if it doesn't exist (edge function uses this)
ALTER TABLE dispute_messages ADD COLUMN IF NOT EXISTS message TEXT;

-- Add 'from' column if missing (frontend code might use this)
ALTER TABLE dispute_messages ADD COLUMN IF NOT EXISTS "from" TEXT;

-- Add 'text' column if missing (some code might use this)
ALTER TABLE dispute_messages ADD COLUMN IF NOT EXISTS text TEXT;

-- Add read tracking columns
ALTER TABLE dispute_messages ADD COLUMN IF NOT EXISTS read_by_trader BOOLEAN DEFAULT false;
ALTER TABLE dispute_messages ADD COLUMN IF NOT EXISTS read_by_merchant BOOLEAN DEFAULT false;
ALTER TABLE dispute_messages ADD COLUMN IF NOT EXISTS read_by_trader_at TIMESTAMPTZ;
ALTER TABLE dispute_messages ADD COLUMN IF NOT EXISTS read_by_merchant_at TIMESTAMPTZ;

-- Add decision tracking
ALTER TABLE dispute_messages ADD COLUMN IF NOT EXISTS is_decision BOOLEAN DEFAULT false;
ALTER TABLE dispute_messages ADD COLUMN IF NOT EXISTS action TEXT;
ALTER TABLE dispute_messages ADD COLUMN IF NOT EXISTS proof_url TEXT;

-- Add timestamp if missing
ALTER TABLE dispute_messages ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ DEFAULT now();

-- Create trigger to sync sender/from columns
CREATE OR REPLACE FUNCTION sync_dispute_message_sender()
RETURNS TRIGGER AS $$
BEGIN
  -- Sync sender -> from
  IF NEW.sender IS NOT NULL AND NEW."from" IS NULL THEN
    NEW."from" := NEW.sender;
  END IF;
  -- Sync from -> sender
  IF NEW."from" IS NOT NULL AND NEW.sender IS NULL THEN
    NEW.sender := NEW."from";
  END IF;
  -- Sync message -> text
  IF NEW.message IS NOT NULL AND NEW.text IS NULL THEN
    NEW.text := NEW.message;
  END IF;
  -- Sync text -> message
  IF NEW.text IS NOT NULL AND NEW.message IS NULL THEN
    NEW.message := NEW.text;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_dispute_message_sender_trigger ON dispute_messages;
CREATE TRIGGER sync_dispute_message_sender_trigger
  BEFORE INSERT OR UPDATE ON dispute_messages
  FOR EACH ROW EXECUTE FUNCTION sync_dispute_message_sender();

-- Update RLS policies
DROP POLICY IF EXISTS trader_own_disp_msgs ON dispute_messages;
DROP POLICY IF EXISTS "Auth full access" ON dispute_messages;

-- Simple policy: traders can do anything with messages for their disputes
CREATE POLICY trader_dispute_messages ON dispute_messages FOR ALL 
TO authenticated
USING (
  dispute_id IN (
    SELECT id FROM disputes WHERE trader_id IN (
      SELECT id FROM traders WHERE profile_id = auth.uid()
    )
  )
  OR
  dispute_id IN (
    SELECT id FROM disputes WHERE merchant_id IN (
      SELECT id FROM merchants WHERE profile_id = auth.uid()
    )
  )
  OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Also fix disputes table RLS for traders
DROP POLICY IF EXISTS trader_own_disputes ON disputes;

CREATE POLICY trader_disputes ON disputes FOR ALL
TO authenticated  
USING (
  trader_id IN (SELECT id FROM traders WHERE profile_id = auth.uid())
  OR
  merchant_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid())
  OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
