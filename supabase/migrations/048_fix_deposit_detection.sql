-- =====================================================
-- FIX DEPOSIT DETECTION
-- 1. Add webhook_id to address_mapping
-- 2. Create function to setup webhook for existing addresses
-- =====================================================

-- Add webhook_id column to track Tatum subscriptions
ALTER TABLE address_mapping 
ADD COLUMN IF NOT EXISTS webhook_id TEXT;

-- Add last_usdt_balance to track deposits via balance comparison
ALTER TABLE address_mapping 
ADD COLUMN IF NOT EXISTS last_usdt_balance DECIMAL(18,6) DEFAULT 0;

-- Index for cleanup
CREATE INDEX IF NOT EXISTS idx_address_mapping_webhook 
ON address_mapping(webhook_id) WHERE webhook_id IS NOT NULL;

-- =====================================================
-- FIX: crypto_transactions.amount alias
-- The table uses inr_amount but some code expects amount
-- =====================================================

-- Create a view that aliases the columns for backward compat
CREATE OR REPLACE VIEW v_crypto_transactions AS
SELECT 
    id,
    trader_id,
    type,
    usdt_amount,
    usdt_rate,
    inr_amount,
    inr_amount as amount,  -- Alias for backward compat
    tx_hash,
    from_address,
    to_address,
    status,
    auto_verified,
    description,
    created_at
FROM crypto_transactions;

-- Grant access
GRANT SELECT ON v_crypto_transactions TO authenticated;
GRANT SELECT ON v_crypto_transactions TO service_role;

-- =====================================================
-- RLS for service_role on all crypto tables
-- =====================================================

-- Ensure service_role policies exist (some might be missing)
DO $$
BEGIN
    -- Drop and recreate service role policies to ensure they work
    DROP POLICY IF EXISTS "Service role address mapping full" ON address_mapping;
    DROP POLICY IF EXISTS "Service role crypto txns full" ON crypto_transactions;
    DROP POLICY IF EXISTS "Service role sweep queue full" ON sweep_queue;
    
    CREATE POLICY "Service role address mapping full" ON address_mapping 
        FOR ALL USING (auth.role() = 'service_role');
    
    CREATE POLICY "Service role crypto txns full" ON crypto_transactions 
        FOR ALL USING (auth.role() = 'service_role');
    
    CREATE POLICY "Service role sweep queue full" ON sweep_queue 
        FOR ALL USING (auth.role() = 'service_role');
END $$;
