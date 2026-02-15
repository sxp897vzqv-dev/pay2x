-- ============================================================================
-- CONSOLIDATE WALLET SYSTEM - Single Source of Truth
-- Date: 2026-02-15
-- ============================================================================
-- This migration:
-- 1. Sets new Tatum API key
-- 2. Clears all wallet data for fresh start
-- 3. Removes duplicate tables (wallet_config, wallet_configs, trader_wallets)
-- 4. tatum_config becomes THE ONLY config source
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. UPDATE tatum_config WITH NEW API KEY (SINGLE SOURCE OF TRUTH)
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE tatum_config SET
    tatum_api_key = 't-69917547bf6daa3a2060a52e-65798efb58454ad2bbc40efd',
    master_xpub = NULL,
    master_mnemonic = NULL,
    master_address = NULL,
    admin_wallet = NULL,
    webhook_id = NULL,
    webhook_url = NULL,
    webhook_created_at = NULL,
    updated_at = NOW()
WHERE id = 'main';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RESET DERIVATION INDEX
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE address_meta SET
    last_index = 0,
    last_updated = NOW()
WHERE id = 'main';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CLEAR ADDRESS DATA
-- ─────────────────────────────────────────────────────────────────────────────

TRUNCATE address_mapping CASCADE;
TRUNCATE crypto_transactions CASCADE;
TRUNCATE sweep_queue CASCADE;
TRUNCATE address_deposits CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CLEAR TRADER USDT COLUMNS
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE traders SET
    usdt_deposit_address = NULL,
    derivation_index = NULL,
    address_generated_at = NULL,
    last_deposit_at = NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. DROP DUPLICATE TABLES (they cause confusion)
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop wallet_configs (was used by AdminWalletRecovery, will use tatum_config)
DROP TABLE IF EXISTS wallet_configs CASCADE;

-- Drop wallet_config (old unused table from migration 012)
DROP TABLE IF EXISTS wallet_config CASCADE;

-- Drop trader_wallets (duplicate of traders.usdt_deposit_address)
DROP TABLE IF EXISTS trader_wallets CASCADE;

-- Drop wallet_transactions (duplicate of crypto_transactions)  
DROP TABLE IF EXISTS wallet_transactions CASCADE;

-- Drop wallet_sweep_queue (duplicate of sweep_queue)
DROP TABLE IF EXISTS wallet_sweep_queue CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. DROP ASSOCIATED VIEWS (they reference dropped tables)
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS v_trader_wallets CASCADE;
DROP VIEW IF EXISTS v_wallet_transactions CASCADE;
DROP VIEW IF EXISTS v_wallet_stats CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RECREATE VIEWS USING CORRECT TABLES
-- ─────────────────────────────────────────────────────────────────────────────

-- Trader wallets view (using traders table directly)
CREATE OR REPLACE VIEW v_trader_wallets AS
SELECT 
    t.id,
    t.id as trader_id,
    t.name as trader_name,
    t.phone as trader_phone,
    t.usdt_deposit_address as address,
    t.derivation_index,
    0::decimal as balance_trx,  -- Would need to fetch from Tatum
    0::decimal as balance_usdt, -- Would need to fetch from Tatum
    t.address_generated_at as last_balance_check,
    t.is_active,
    t.address_generated_at as created_at,
    (SELECT COUNT(*) FROM crypto_transactions ct WHERE ct.trader_id = t.id) as tx_count,
    (SELECT COALESCE(SUM(usdt_amount), 0) FROM crypto_transactions ct 
     WHERE ct.trader_id = t.id AND ct.type = 'deposit' AND ct.status = 'completed') as total_deposits
FROM traders t
WHERE t.usdt_deposit_address IS NOT NULL
ORDER BY t.address_generated_at DESC;

-- Wallet transactions view (using crypto_transactions)
CREATE OR REPLACE VIEW v_wallet_transactions AS
SELECT 
    ct.*,
    t.name as trader_name,
    t.usdt_deposit_address as wallet_address
FROM crypto_transactions ct
LEFT JOIN traders t ON ct.trader_id = t.id
ORDER BY ct.created_at DESC;

-- Wallet stats view
CREATE OR REPLACE VIEW v_wallet_stats AS
SELECT 
    (SELECT COUNT(*) FROM traders WHERE usdt_deposit_address IS NOT NULL AND is_active = true) as total_wallets,
    0::decimal as total_usdt_balance, -- Would need Tatum API call
    0::decimal as total_trx_balance,  -- Would need Tatum API call
    (SELECT COUNT(*) FROM crypto_transactions WHERE status = 'pending') as pending_transactions,
    (SELECT COUNT(*) FROM sweep_queue WHERE status = 'pending') as pending_sweeps,
    (SELECT COALESCE(SUM(usdt_amount), 0) FROM crypto_transactions 
     WHERE type = 'deposit' AND status = 'completed' AND created_at > NOW() - INTERVAL '24 hours') as deposits_24h,
    (SELECT admin_wallet FROM tatum_config WHERE id = 'main') as admin_wallet;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. DROP UNUSED FUNCTIONS (handles overloaded versions)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
    r RECORD;
    func_names TEXT[] := ARRAY[
        'create_trader_wallet',
        'update_wallet_balance', 
        'record_wallet_transaction',
        'get_current_wallet',
        'get_orphan_addresses',
        'ensure_single_current_wallet'
    ];
    fn TEXT;
BEGIN
    FOREACH fn IN ARRAY func_names
    LOOP
        FOR r IN SELECT oid::regprocedure::text as func_sig 
                 FROM pg_proc WHERE proname = fn
        LOOP
            EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig || ' CASCADE';
        END LOOP;
    END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- DONE - System now uses ONLY tatum_config as source of truth
-- ─────────────────────────────────────────────────────────────────────────────

-- Add comment for future reference
COMMENT ON TABLE tatum_config IS 'SINGLE SOURCE OF TRUTH for all wallet config. Do not create alternative config tables.';
