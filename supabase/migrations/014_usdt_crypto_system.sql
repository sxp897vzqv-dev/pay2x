-- =====================================================
-- USDT CRYPTO DEPOSIT & SWEEP SYSTEM
-- Ported from Firebase Cloud Functions
-- =====================================================

-- =====================================================
-- TATUM CONFIG (System settings)
-- =====================================================
CREATE TABLE IF NOT EXISTS tatum_config (
    id TEXT PRIMARY KEY DEFAULT 'main',
    tatum_api_key TEXT,
    
    -- Master HD Wallet
    master_xpub TEXT,
    master_mnemonic TEXT,  -- ENCRYPTED in production!
    master_address TEXT,
    
    -- Admin wallet (where sweeps go)
    admin_wallet TEXT,
    
    -- Webhook
    webhook_id TEXT,
    webhook_url TEXT,
    webhook_created_at TIMESTAMPTZ,
    
    -- Rate settings
    default_usdt_rate DECIMAL(10,2) DEFAULT 92,
    use_live_rate BOOLEAN DEFAULT false,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert placeholder
INSERT INTO tatum_config (id) VALUES ('main') ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- ADDRESS META (Track derivation index)
-- =====================================================
CREATE TABLE IF NOT EXISTS address_meta (
    id TEXT PRIMARY KEY DEFAULT 'main',
    last_index INT DEFAULT 0,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO address_meta (id, last_index) VALUES ('main', 0) ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- ADDRESS MAPPING (USDT Address → Trader)
-- =====================================================
CREATE TABLE IF NOT EXISTS address_mapping (
    address TEXT PRIMARY KEY,
    trader_id UUID NOT NULL REFERENCES traders(id),
    derivation_index INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_address_mapping_trader ON address_mapping(trader_id);

-- =====================================================
-- CRYPTO TRANSACTIONS (Deposits & Sweeps)
-- =====================================================
CREATE TABLE IF NOT EXISTS crypto_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trader_id UUID NOT NULL REFERENCES traders(id),
    
    -- Transaction type
    type TEXT NOT NULL CHECK (type IN ('deposit', 'sweep')),
    
    -- Amounts
    usdt_amount DECIMAL(18,6) NOT NULL,
    usdt_rate DECIMAL(10,2),
    inr_amount DECIMAL(12,2),
    
    -- Blockchain info
    tx_hash TEXT UNIQUE,
    from_address TEXT,
    to_address TEXT,
    
    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    auto_verified BOOLEAN DEFAULT true,
    
    -- Description
    description TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_crypto_txn_trader ON crypto_transactions(trader_id);
CREATE INDEX idx_crypto_txn_hash ON crypto_transactions(tx_hash);
CREATE INDEX idx_crypto_txn_type ON crypto_transactions(type);
CREATE INDEX idx_crypto_txn_status ON crypto_transactions(status);

-- =====================================================
-- SWEEP QUEUE (Pending USDT sweeps to admin)
-- =====================================================
CREATE TABLE IF NOT EXISTS sweep_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trader_id UUID NOT NULL REFERENCES traders(id),
    from_address TEXT NOT NULL,
    amount DECIMAL(18,6) NOT NULL,
    tx_hash TEXT,  -- Original deposit tx
    
    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    sweep_tx_hash TEXT,  -- Sweep transaction hash
    error TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    scheduled_for TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ
);

CREATE INDEX idx_sweep_queue_status ON sweep_queue(status) WHERE status = 'pending';
CREATE INDEX idx_sweep_queue_trader ON sweep_queue(trader_id);

-- =====================================================
-- ADD USDT COLUMNS TO TRADERS
-- =====================================================
ALTER TABLE traders ADD COLUMN IF NOT EXISTS usdt_deposit_address TEXT;
ALTER TABLE traders ADD COLUMN IF NOT EXISTS derivation_index INT;
ALTER TABLE traders ADD COLUMN IF NOT EXISTS address_generated_at TIMESTAMPTZ;
ALTER TABLE traders ADD COLUMN IF NOT EXISTS last_deposit_at TIMESTAMPTZ;

-- =====================================================
-- RLS POLICIES
-- =====================================================
ALTER TABLE tatum_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE address_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE address_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE crypto_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sweep_queue ENABLE ROW LEVEL SECURITY;

-- Only admins can see config
CREATE POLICY "Admins manage tatum config" ON tatum_config
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admins manage address meta" ON address_meta
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Traders can see their own addresses
CREATE POLICY "Traders view own addresses" ON address_mapping
    FOR SELECT USING (
        trader_id IN (SELECT id FROM traders WHERE profile_id = auth.uid())
    );

-- Traders can see their own transactions
CREATE POLICY "Traders view own crypto txns" ON crypto_transactions
    FOR SELECT USING (
        trader_id IN (SELECT id FROM traders WHERE profile_id = auth.uid())
    );

-- Admins see all
CREATE POLICY "Admins view all addresses" ON address_mapping
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admins view all crypto txns" ON crypto_transactions
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admins manage sweep queue" ON sweep_queue
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Service role bypass
CREATE POLICY "Service role tatum config" ON tatum_config FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role address meta" ON address_meta FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role address mapping" ON address_mapping FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role crypto txns" ON crypto_transactions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role sweep queue" ON sweep_queue FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Get next derivation index (atomic)
CREATE OR REPLACE FUNCTION get_next_derivation_index()
RETURNS INT AS $$
DECLARE
    next_index INT;
BEGIN
    UPDATE address_meta 
    SET last_index = last_index + 1, last_updated = NOW()
    WHERE id = 'main'
    RETURNING last_index INTO next_index;
    
    RETURN next_index;
END;
$$ LANGUAGE plpgsql;

-- Credit trader on USDT deposit
CREATE OR REPLACE FUNCTION credit_trader_on_usdt_deposit(
    p_trader_id UUID,
    p_usdt_amount DECIMAL,
    p_usdt_rate DECIMAL,
    p_tx_hash TEXT,
    p_from_address TEXT
) RETURNS JSONB AS $$
DECLARE
    v_inr_amount DECIMAL;
    v_old_balance DECIMAL;
    v_new_balance DECIMAL;
    v_trader traders%ROWTYPE;
BEGIN
    -- Calculate INR amount
    v_inr_amount := ROUND(p_usdt_amount * p_usdt_rate);
    
    -- Get current balance
    SELECT * INTO v_trader FROM traders WHERE id = p_trader_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Trader not found');
    END IF;
    
    v_old_balance := COALESCE(v_trader.balance, 0);
    v_new_balance := v_old_balance + v_inr_amount;
    
    -- Check for duplicate transaction
    IF EXISTS (SELECT 1 FROM crypto_transactions WHERE tx_hash = p_tx_hash) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Duplicate transaction');
    END IF;
    
    -- Update trader balance
    UPDATE traders SET 
        balance = v_new_balance,
        last_deposit_at = NOW(),
        updated_at = NOW()
    WHERE id = p_trader_id;
    
    -- Create transaction record
    INSERT INTO crypto_transactions (
        trader_id, type, usdt_amount, usdt_rate, inr_amount,
        tx_hash, from_address, status, description
    ) VALUES (
        p_trader_id, 'deposit', p_usdt_amount, p_usdt_rate, v_inr_amount,
        p_tx_hash, p_from_address, 'completed',
        'USDT Deposit - ' || p_usdt_amount || ' USDT @ ₹' || p_usdt_rate || ' = ₹' || v_inr_amount
    );
    
    -- Queue sweep
    INSERT INTO sweep_queue (trader_id, from_address, amount, tx_hash)
    VALUES (p_trader_id, p_from_address, p_usdt_amount, p_tx_hash);
    
    -- Log to admin_logs
    INSERT INTO admin_logs (
        action, category, entity_type, entity_id,
        details, balance_before, balance_after, severity, source
    ) VALUES (
        'usdt_deposit_credited', 'financial', 'trader', p_trader_id,
        jsonb_build_object('usdt_amount', p_usdt_amount, 'tx_hash', p_tx_hash, 'rate', p_usdt_rate),
        v_old_balance, v_new_balance, 'info', 'webhook'
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'inr_amount', v_inr_amount,
        'old_balance', v_old_balance,
        'new_balance', v_new_balance
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- VIEWS
-- =====================================================

-- Crypto stats summary
CREATE OR REPLACE VIEW crypto_stats AS
SELECT 
    COUNT(*) FILTER (WHERE type = 'deposit') as total_deposits,
    COUNT(*) FILTER (WHERE type = 'sweep') as total_sweeps,
    SUM(usdt_amount) FILTER (WHERE type = 'deposit' AND status = 'completed') as total_usdt_deposited,
    SUM(inr_amount) FILTER (WHERE type = 'deposit' AND status = 'completed') as total_inr_credited,
    COUNT(DISTINCT trader_id) as traders_with_deposits
FROM crypto_transactions;

-- Pending sweeps
CREATE OR REPLACE VIEW pending_sweeps AS
SELECT 
    sq.*,
    t.name as trader_name,
    t.usdt_deposit_address
FROM sweep_queue sq
JOIN traders t ON t.id = sq.trader_id
WHERE sq.status = 'pending'
ORDER BY sq.created_at;
