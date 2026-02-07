-- ============================================
-- ADD MISSING COLUMNS TO PAYINS TABLE
-- Run this if columns don't exist
-- ============================================

-- Add columns if they don't exist
DO $$ 
BEGIN
  -- UPI ID (snapshot from upi_pool)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payins' AND column_name = 'upi_id') THEN
    ALTER TABLE payins ADD COLUMN upi_id TEXT;
  END IF;

  -- Holder name (snapshot)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payins' AND column_name = 'holder_name') THEN
    ALTER TABLE payins ADD COLUMN holder_name TEXT;
  END IF;

  -- User ID (customer identifier from merchant)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payins' AND column_name = 'user_id') THEN
    ALTER TABLE payins ADD COLUMN user_id TEXT;
  END IF;

  -- Timer (seconds)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payins' AND column_name = 'timer') THEN
    ALTER TABLE payins ADD COLUMN timer INTEGER DEFAULT 600;
  END IF;

  -- Expires at (calculated from timer)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payins' AND column_name = 'expires_at') THEN
    ALTER TABLE payins ADD COLUMN expires_at TIMESTAMPTZ;
  END IF;

  -- UTR submitted timestamp
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payins' AND column_name = 'utr_submitted_at') THEN
    ALTER TABLE payins ADD COLUMN utr_submitted_at TIMESTAMPTZ;
  END IF;

  -- Engine metadata
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payins' AND column_name = 'engine_version') THEN
    ALTER TABLE payins ADD COLUMN engine_version TEXT DEFAULT '2.0';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payins' AND column_name = 'selection_score') THEN
    ALTER TABLE payins ADD COLUMN selection_score DECIMAL(5,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payins' AND column_name = 'selection_attempts') THEN
    ALTER TABLE payins ADD COLUMN selection_attempts INTEGER;
  END IF;

  -- Requested at (alias for created_at in some contexts)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payins' AND column_name = 'requested_at') THEN
    ALTER TABLE payins ADD COLUMN requested_at TIMESTAMPTZ DEFAULT now();
  END IF;
END $$;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_payins_upi_id ON payins(upi_id);
CREATE INDEX IF NOT EXISTS idx_payins_user_id ON payins(user_id);
CREATE INDEX IF NOT EXISTS idx_payins_expires_at ON payins(expires_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_payins_txn_id ON payins(txn_id);

-- ============================================
-- ALSO ADD merchant API key columns if missing
-- ============================================

DO $$ 
BEGIN
  -- Live API key (production)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'merchants' AND column_name = 'live_api_key') THEN
    ALTER TABLE merchants ADD COLUMN live_api_key TEXT UNIQUE;
  END IF;

  -- Test API key (sandbox)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'merchants' AND column_name = 'test_api_key') THEN
    ALTER TABLE merchants ADD COLUMN test_api_key TEXT;
  END IF;

  -- Webhook secret
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'merchants' AND column_name = 'webhook_secret') THEN
    ALTER TABLE merchants ADD COLUMN webhook_secret TEXT;
  END IF;

  -- API key updated timestamp
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'merchants' AND column_name = 'api_key_updated_at') THEN
    ALTER TABLE merchants ADD COLUMN api_key_updated_at TIMESTAMPTZ;
  END IF;
END $$;

-- Create index for API key lookup
CREATE INDEX IF NOT EXISTS idx_merchants_live_api_key ON merchants(live_api_key) WHERE live_api_key IS NOT NULL;
