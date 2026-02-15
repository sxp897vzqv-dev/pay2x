-- ============================================================================
-- RESET TATUM - FRESH START WITH NEW API KEY
-- Date: 2026-02-15
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. UPDATE TATUM CONFIG WITH NEW API KEY & CLEAR MASTER WALLET
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
-- 2. RESET DERIVATION INDEX TO 0
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE address_meta SET
    last_index = 0,
    last_updated = NOW()
WHERE id = 'main';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. DELETE ALL ADDRESS MAPPINGS
-- ─────────────────────────────────────────────────────────────────────────────

DELETE FROM address_mapping;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. DELETE ALL CRYPTO TRANSACTIONS
-- ─────────────────────────────────────────────────────────────────────────────

DELETE FROM crypto_transactions;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. DELETE ALL SWEEP QUEUE ENTRIES
-- ─────────────────────────────────────────────────────────────────────────────

DELETE FROM sweep_queue;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. CLEAR TRADER USDT COLUMNS
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE traders SET
    usdt_deposit_address = NULL,
    derivation_index = NULL,
    address_generated_at = NULL,
    last_deposit_at = NULL
WHERE usdt_deposit_address IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RESET wallet_config (alternative table from 012)
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE wallet_config SET
    wallet_id = NULL,
    mnemonic_encrypted = NULL,
    xpub = NULL,
    admin_wallet_address = NULL,
    tatum_api_key_encrypted = NULL,
    last_derivation_index = 0,
    updated_at = NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. DELETE ALL TRADER WALLETS & RELATED DATA
-- ─────────────────────────────────────────────────────────────────────────────

DELETE FROM wallet_sweep_queue;
DELETE FROM wallet_transactions;
DELETE FROM trader_wallets;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. CLEAR wallet_configs TABLE (used by AdminWalletRecovery)
-- ─────────────────────────────────────────────────────────────────────────────

DELETE FROM wallet_configs;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. CLEAR address_deposits TABLE (deposit history)
-- ─────────────────────────────────────────────────────────────────────────────

DELETE FROM address_deposits;

-- ─────────────────────────────────────────────────────────────────────────────
-- DONE - Fresh slate for new HD wallet generation
-- ─────────────────────────────────────────────────────────────────────────────
