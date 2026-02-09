-- ============================================================================
-- PAY2X CRYPTO WALLET MANAGEMENT (TATUM API - TRX/USDT)
-- ============================================================================
-- HD Wallet system for trader settlements via TRON USDT
-- - Master HD wallet (admin controlled)
-- - Derived wallets for each trader
-- - Admin withdrawal wallet
-- - Transaction monitoring
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- MASTER WALLET CONFIG
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE wallet_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- HD Wallet (from Tatum)
  wallet_id TEXT,                          -- Tatum wallet ID
  mnemonic_encrypted TEXT,                 -- Encrypted mnemonic (for derivation)
  xpub TEXT,                               -- Extended public key
  
  -- Admin withdrawal wallet
  admin_wallet_address TEXT,               -- Where admin receives funds
  admin_wallet_memo TEXT,                  -- Optional memo/tag
  
  -- Network config
  network TEXT DEFAULT 'tron',             -- tron, ethereum, bsc
  token TEXT DEFAULT 'USDT',               -- USDT, USDC, etc.
  contract_address TEXT,                   -- Token contract (TRC20 USDT)
  
  -- Tatum API
  tatum_api_key_encrypted TEXT,            -- Encrypted API key
  
  -- Derivation tracking
  last_derivation_index INTEGER DEFAULT 0,
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID
);

-- Only one config row allowed
CREATE UNIQUE INDEX wallet_config_singleton ON wallet_config ((true));

-- ─────────────────────────────────────────────────────────────────────────────
-- TRADER WALLETS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE trader_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Trader link
  trader_id UUID NOT NULL REFERENCES traders(id) ON DELETE CASCADE,
  
  -- Wallet details
  address TEXT NOT NULL,                   -- TRX wallet address
  derivation_index INTEGER NOT NULL,       -- HD derivation path index
  derivation_path TEXT,                    -- Full path e.g. m/44'/195'/0'/0/5
  
  -- Private key (encrypted, only if needed for auto-sweep)
  private_key_encrypted TEXT,
  
  -- Balance tracking (cached, updated periodically)
  balance_trx DECIMAL(18,6) DEFAULT 0,     -- TRX balance (for gas)
  balance_usdt DECIMAL(18,6) DEFAULT 0,    -- USDT balance
  last_balance_check TIMESTAMPTZ,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT unique_trader_wallet UNIQUE (trader_id),
  CONSTRAINT unique_address UNIQUE (address)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- WALLET TRANSACTIONS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Wallet reference
  wallet_id UUID REFERENCES trader_wallets(id),
  trader_id UUID REFERENCES traders(id),
  
  -- Transaction details
  tx_hash TEXT NOT NULL UNIQUE,
  tx_type TEXT NOT NULL,                   -- 'deposit', 'withdrawal', 'sweep', 'gas_topup'
  
  -- Addresses
  from_address TEXT,
  to_address TEXT,
  
  -- Amount
  amount DECIMAL(18,6) NOT NULL,
  token TEXT NOT NULL,                     -- 'TRX', 'USDT'
  
  -- Status
  status TEXT DEFAULT 'pending',           -- pending, confirmed, failed
  confirmations INTEGER DEFAULT 0,
  block_number BIGINT,
  
  -- Timestamps
  tx_timestamp TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- SWEEP QUEUE (Auto-transfer to admin wallet)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE wallet_sweep_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  wallet_id UUID NOT NULL REFERENCES trader_wallets(id),
  trader_id UUID NOT NULL REFERENCES traders(id),
  
  -- Amount to sweep
  amount DECIMAL(18,6) NOT NULL,
  token TEXT DEFAULT 'USDT',
  
  -- Status
  status TEXT DEFAULT 'pending',           -- pending, processing, completed, failed
  
  -- Transaction reference
  tx_hash TEXT,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ,
  
  -- Threshold settings
  min_sweep_amount DECIMAL(18,6) DEFAULT 10,
  
  CONSTRAINT positive_sweep CHECK (amount > 0)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX idx_trader_wallets_trader ON trader_wallets(trader_id);
CREATE INDEX idx_trader_wallets_address ON trader_wallets(address);
CREATE INDEX idx_wallet_transactions_wallet ON wallet_transactions(wallet_id);
CREATE INDEX idx_wallet_transactions_trader ON wallet_transactions(trader_id);
CREATE INDEX idx_wallet_transactions_hash ON wallet_transactions(tx_hash);
CREATE INDEX idx_wallet_transactions_status ON wallet_transactions(status);
CREATE INDEX idx_wallet_sweep_status ON wallet_sweep_queue(status);

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCTIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- Get next derivation index
CREATE OR REPLACE FUNCTION get_next_derivation_index()
RETURNS INTEGER AS $$
DECLARE
  v_index INTEGER;
BEGIN
  UPDATE wallet_config 
  SET last_derivation_index = last_derivation_index + 1,
      updated_at = now()
  RETURNING last_derivation_index INTO v_index;
  
  IF v_index IS NULL THEN
    -- No config exists yet
    RETURN 0;
  END IF;
  
  RETURN v_index;
END;
$$ LANGUAGE plpgsql;

-- Create trader wallet record
CREATE OR REPLACE FUNCTION create_trader_wallet(
  p_trader_id UUID,
  p_address TEXT,
  p_derivation_index INTEGER,
  p_derivation_path TEXT DEFAULT NULL,
  p_private_key_encrypted TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_wallet_id UUID;
BEGIN
  INSERT INTO trader_wallets (trader_id, address, derivation_index, derivation_path, private_key_encrypted)
  VALUES (p_trader_id, p_address, p_derivation_index, p_derivation_path, p_private_key_encrypted)
  ON CONFLICT (trader_id) DO UPDATE SET
    address = EXCLUDED.address,
    derivation_index = EXCLUDED.derivation_index,
    derivation_path = EXCLUDED.derivation_path,
    private_key_encrypted = EXCLUDED.private_key_encrypted,
    updated_at = now()
  RETURNING id INTO v_wallet_id;
  
  RETURN v_wallet_id;
END;
$$ LANGUAGE plpgsql;

-- Update wallet balance
CREATE OR REPLACE FUNCTION update_wallet_balance(
  p_address TEXT,
  p_balance_trx DECIMAL,
  p_balance_usdt DECIMAL
) RETURNS VOID AS $$
BEGIN
  UPDATE trader_wallets
  SET balance_trx = p_balance_trx,
      balance_usdt = p_balance_usdt,
      last_balance_check = now(),
      updated_at = now()
  WHERE address = p_address;
END;
$$ LANGUAGE plpgsql;

-- Record wallet transaction
CREATE OR REPLACE FUNCTION record_wallet_transaction(
  p_tx_hash TEXT,
  p_tx_type TEXT,
  p_from_address TEXT,
  p_to_address TEXT,
  p_amount DECIMAL,
  p_token TEXT,
  p_status TEXT DEFAULT 'pending',
  p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
  v_tx_id UUID;
  v_wallet_id UUID;
  v_trader_id UUID;
BEGIN
  -- Find wallet by address
  SELECT id, trader_id INTO v_wallet_id, v_trader_id
  FROM trader_wallets
  WHERE address = p_to_address OR address = p_from_address
  LIMIT 1;
  
  INSERT INTO wallet_transactions (
    wallet_id, trader_id, tx_hash, tx_type, from_address, to_address,
    amount, token, status, metadata
  ) VALUES (
    v_wallet_id, v_trader_id, p_tx_hash, p_tx_type, p_from_address, p_to_address,
    p_amount, p_token, p_status, p_metadata
  )
  ON CONFLICT (tx_hash) DO UPDATE SET
    status = EXCLUDED.status,
    metadata = wallet_transactions.metadata || EXCLUDED.metadata
  RETURNING id INTO v_tx_id;
  
  RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- VIEWS
-- ─────────────────────────────────────────────────────────────────────────────

-- Trader wallets with trader info
CREATE OR REPLACE VIEW v_trader_wallets AS
SELECT 
  tw.id,
  tw.trader_id,
  t.name as trader_name,
  t.phone as trader_phone,
  tw.address,
  tw.derivation_index,
  tw.balance_trx,
  tw.balance_usdt,
  tw.last_balance_check,
  tw.is_active,
  tw.created_at,
  (SELECT COUNT(*) FROM wallet_transactions wt WHERE wt.wallet_id = tw.id) as tx_count,
  (SELECT SUM(amount) FROM wallet_transactions wt WHERE wt.wallet_id = tw.id AND wt.tx_type = 'deposit' AND wt.token = 'USDT') as total_deposits
FROM trader_wallets tw
JOIN traders t ON tw.trader_id = t.id
ORDER BY tw.created_at DESC;

-- Recent transactions
CREATE OR REPLACE VIEW v_wallet_transactions AS
SELECT 
  wt.*,
  t.name as trader_name,
  tw.address as wallet_address
FROM wallet_transactions wt
LEFT JOIN traders t ON wt.trader_id = t.id
LEFT JOIN trader_wallets tw ON wt.wallet_id = tw.id
ORDER BY wt.created_at DESC;

-- Wallet summary stats
CREATE OR REPLACE VIEW v_wallet_stats AS
SELECT 
  (SELECT COUNT(*) FROM trader_wallets WHERE is_active = true) as total_wallets,
  (SELECT COALESCE(SUM(balance_usdt), 0) FROM trader_wallets) as total_usdt_balance,
  (SELECT COALESCE(SUM(balance_trx), 0) FROM trader_wallets) as total_trx_balance,
  (SELECT COUNT(*) FROM wallet_transactions WHERE status = 'pending') as pending_transactions,
  (SELECT COUNT(*) FROM wallet_sweep_queue WHERE status = 'pending') as pending_sweeps,
  (SELECT COALESCE(SUM(amount), 0) FROM wallet_transactions WHERE tx_type = 'deposit' AND token = 'USDT' AND created_at > now() - interval '24 hours') as deposits_24h,
  (SELECT admin_wallet_address FROM wallet_config LIMIT 1) as admin_wallet;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS POLICIES
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE wallet_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE trader_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_sweep_queue ENABLE ROW LEVEL SECURITY;

-- Admin only for config
CREATE POLICY wallet_config_admin ON wallet_config FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Admin sees all wallets
CREATE POLICY trader_wallets_admin ON trader_wallets FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Traders see own wallet
CREATE POLICY trader_wallets_trader ON trader_wallets FOR SELECT TO authenticated
  USING (trader_id IN (SELECT id FROM traders WHERE profile_id = auth.uid()));

-- Admin sees all transactions
CREATE POLICY wallet_transactions_admin ON wallet_transactions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Traders see own transactions
CREATE POLICY wallet_transactions_trader ON wallet_transactions FOR SELECT TO authenticated
  USING (trader_id IN (SELECT id FROM traders WHERE profile_id = auth.uid()));

-- Admin only for sweep queue
CREATE POLICY wallet_sweep_admin ON wallet_sweep_queue FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ─────────────────────────────────────────────────────────────────────────────
-- INITIAL CONFIG (empty - admin sets up)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO wallet_config (network, token, contract_address)
VALUES ('tron', 'USDT', 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')  -- TRC20 USDT mainnet
ON CONFLICT DO NOTHING;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
