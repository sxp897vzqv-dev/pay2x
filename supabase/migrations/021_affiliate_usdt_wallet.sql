-- 021_affiliate_usdt_wallet.sql
-- Add USDT wallet support for affiliate settlements

-- Add USDT wallet address to affiliates
ALTER TABLE affiliates 
ADD COLUMN IF NOT EXISTS usdt_wallet_address TEXT;

-- Add USDT settlement fields to affiliate_settlements
ALTER TABLE affiliate_settlements 
ADD COLUMN IF NOT EXISTS usdt_amount DECIMAL(18, 8),
ADD COLUMN IF NOT EXISTS conversion_rate DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS tx_hash TEXT,
ADD COLUMN IF NOT EXISTS wallet_address TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_affiliates_usdt_wallet ON affiliates(usdt_wallet_address) WHERE usdt_wallet_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_affiliate_settlements_tx_hash ON affiliate_settlements(tx_hash) WHERE tx_hash IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN affiliates.usdt_wallet_address IS 'TRC20 wallet address for USDT settlements';
COMMENT ON COLUMN affiliate_settlements.usdt_amount IS 'Amount in USDT after conversion';
COMMENT ON COLUMN affiliate_settlements.conversion_rate IS 'INR to USDT conversion rate at time of settlement';
COMMENT ON COLUMN affiliate_settlements.tx_hash IS 'TRON transaction hash for the USDT transfer';
