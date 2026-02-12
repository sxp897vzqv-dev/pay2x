-- Migration: Create missing webhook tables
-- Date: 2026-02-10

-- Webhook Deliveries (for payin webhooks)
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  payin_id UUID REFERENCES payins(id),
  webhook_url TEXT NOT NULL,
  webhook_secret TEXT,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  signature TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'delivered', 'failed', 'exhausted')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 6,
  next_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  last_response_code INTEGER,
  last_response_body TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Webhook Attempts (delivery history)
CREATE TABLE IF NOT EXISTS webhook_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_delivery_id UUID NOT NULL REFERENCES webhook_deliveries(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  response_code INTEGER,
  response_body TEXT,
  response_time_ms INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_next_attempt ON webhook_deliveries(next_attempt_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_merchant ON webhook_deliveries(merchant_id);
CREATE INDEX IF NOT EXISTS idx_webhook_attempts_delivery ON webhook_attempts(webhook_delivery_id);

-- RLS
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_attempts ENABLE ROW LEVEL SECURITY;

-- Admin can see all
CREATE POLICY "Admin full access webhooks" ON webhook_deliveries FOR ALL USING (true);
CREATE POLICY "Admin full access webhook_attempts" ON webhook_attempts FOR ALL USING (true);

-- Also add missing columns to existing tables if needed

-- Add trace_id to payins if not exists
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payins' AND column_name = 'trace_id') THEN
    ALTER TABLE payins ADD COLUMN trace_id TEXT;
  END IF;
END $$;

-- Add description to payins if not exists
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payins' AND column_name = 'description') THEN
    ALTER TABLE payins ADD COLUMN description TEXT;
  END IF;
END $$;

-- Add metadata to payouts if not exists
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payouts' AND column_name = 'metadata') THEN
    ALTER TABLE payouts ADD COLUMN metadata JSONB;
  END IF;
END $$;

-- Add plan to merchants if not exists (commonly used)
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'merchants' AND column_name = 'plan') THEN
    ALTER TABLE merchants ADD COLUMN plan TEXT DEFAULT 'starter';
  END IF;
END $$;

COMMENT ON TABLE webhook_deliveries IS 'Queue for payin webhook deliveries with retry support';
COMMENT ON TABLE webhook_attempts IS 'History of webhook delivery attempts';
