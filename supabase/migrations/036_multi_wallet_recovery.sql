-- ============================================================================
-- Migration 036: Multi-Wallet Recovery System
-- ============================================================================
-- Allows recovery of funds even if master wallet is changed
-- Keeps ALL wallet configs (current + legacy)
-- Tracks which wallet generated which address
-- ============================================================================

-- 1. Create wallet_configs table (replaces single tatum_config)
CREATE TABLE IF NOT EXISTS wallet_configs (
  id TEXT PRIMARY KEY DEFAULT 'wallet_' || extract(epoch from now())::int,
  name TEXT NOT NULL DEFAULT 'Default Wallet',
  master_xpub TEXT NOT NULL,
  master_mnemonic_encrypted TEXT, -- Encrypted mnemonic for recovery (optional)
  admin_wallet TEXT, -- Where to sweep funds
  tatum_api_key TEXT,
  network TEXT DEFAULT 'tron', -- tron, ethereum, etc.
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'legacy', 'disabled')),
  is_current BOOLEAN DEFAULT false, -- Only ONE can be current
  total_addresses INT DEFAULT 0,
  total_deposited DECIMAL(20,6) DEFAULT 0,
  last_derivation_index INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add wallet tracking to address_mapping
ALTER TABLE address_mapping 
ADD COLUMN IF NOT EXISTS wallet_config_id TEXT REFERENCES wallet_configs(id);

ALTER TABLE address_mapping 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' 
CHECK (status IN ('active', 'orphan', 'swept', 'disabled'));

ALTER TABLE address_mapping 
ADD COLUMN IF NOT EXISTS last_balance DECIMAL(20,6) DEFAULT 0;

ALTER TABLE address_mapping 
ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;

ALTER TABLE address_mapping 
ADD COLUMN IF NOT EXISTS total_received DECIMAL(20,6) DEFAULT 0;

-- 3. Track deposits per address (for recovery)
CREATE TABLE IF NOT EXISTS address_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address TEXT NOT NULL,
  wallet_config_id TEXT REFERENCES wallet_configs(id),
  tx_hash TEXT UNIQUE NOT NULL,
  amount DECIMAL(20,6) NOT NULL,
  token TEXT DEFAULT 'USDT',
  from_address TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'credited', 'swept', 'orphan')),
  trader_id UUID REFERENCES traders(id), -- NULL if trader deleted
  credited_at TIMESTAMPTZ,
  swept_at TIMESTAMPTZ,
  sweep_tx_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_address_deposits_address ON address_deposits(address);
CREATE INDEX idx_address_deposits_status ON address_deposits(status);

-- 4. Ensure only one active wallet
CREATE OR REPLACE FUNCTION ensure_single_current_wallet()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_current = true THEN
    UPDATE wallet_configs SET is_current = false WHERE id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_single_current_wallet
BEFORE INSERT OR UPDATE ON wallet_configs
FOR EACH ROW
WHEN (NEW.is_current = true)
EXECUTE FUNCTION ensure_single_current_wallet();

-- 5. Function to get current wallet
CREATE OR REPLACE FUNCTION get_current_wallet()
RETURNS TABLE(
  id TEXT,
  master_xpub TEXT,
  admin_wallet TEXT,
  tatum_api_key TEXT,
  last_derivation_index INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    wc.id,
    wc.master_xpub,
    wc.admin_wallet,
    wc.tatum_api_key,
    wc.last_derivation_index
  FROM wallet_configs wc
  WHERE wc.is_current = true
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- 6. Function to get orphan addresses (addresses with balance but no active trader)
CREATE OR REPLACE FUNCTION get_orphan_addresses()
RETURNS TABLE(
  address TEXT,
  wallet_config_id TEXT,
  derivation_index INT,
  last_balance DECIMAL,
  trader_id UUID,
  status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    am.address,
    am.wallet_config_id,
    am.derivation_index,
    am.last_balance,
    am.trader_id,
    am.status
  FROM address_mapping am
  WHERE am.status = 'orphan' 
     OR am.trader_id IS NULL 
     OR am.last_balance > 0;
END;
$$ LANGUAGE plpgsql;

-- 7. Migrate existing tatum_config to wallet_configs
INSERT INTO wallet_configs (id, name, master_xpub, admin_wallet, tatum_api_key, is_current, status)
SELECT 
  'wallet_main',
  'Main Wallet',
  master_xpub,
  admin_wallet,
  tatum_api_key,
  true,
  'active'
FROM tatum_config
WHERE id = 'main'
ON CONFLICT (id) DO NOTHING;

-- 8. Update address_mapping with wallet_config_id
UPDATE address_mapping 
SET wallet_config_id = 'wallet_main'
WHERE wallet_config_id IS NULL;

-- 9. RLS
ALTER TABLE wallet_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE address_deposits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage wallets" ON wallet_configs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins manage deposits" ON address_deposits
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 10. Comments
COMMENT ON TABLE wallet_configs IS 'All HD wallets (current + legacy). Never delete, only mark as legacy.';
COMMENT ON COLUMN wallet_configs.is_current IS 'Only one wallet can be current. New addresses use this.';
COMMENT ON COLUMN wallet_configs.status IS 'active=in use, legacy=old but monitored, disabled=ignore';
COMMENT ON TABLE address_deposits IS 'Track ALL deposits for recovery. Even if trader deleted.';
COMMENT ON COLUMN address_mapping.status IS 'orphan=trader deleted but may have funds';
