-- 062: USDT Balance Tracking
-- Track actual USDT from transactions, not real-time conversion

-- Add USDT balance to merchants
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS usdt_balance DECIMAL(18,2) DEFAULT 0;

-- Add USDT amounts to payins (stored when completed)
ALTER TABLE payins ADD COLUMN IF NOT EXISTS net_amount_usdt DECIMAL(18,2);
ALTER TABLE payins ADD COLUMN IF NOT EXISTS usdt_rate_at_completion DECIMAL(10,2);

-- Add USDT amounts to payouts (stored when created/completed)
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS amount_usdt DECIMAL(18,2);
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS usdt_rate_at_creation DECIMAL(10,2);

-- Add USDT to balance_history for ledger
ALTER TABLE balance_history ADD COLUMN IF NOT EXISTS amount_usdt DECIMAL(18,2);
ALTER TABLE balance_history ADD COLUMN IF NOT EXISTS usdt_rate DECIMAL(10,2);

-- Index for faster balance queries
CREATE INDEX IF NOT EXISTS idx_merchants_usdt_balance ON merchants(usdt_balance);
