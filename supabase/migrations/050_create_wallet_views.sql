-- =====================================================
-- CREATE WALLET VIEWS FOR ADMIN HD WALLETS PAGE
-- =====================================================

-- View: Trader wallets with balances
CREATE OR REPLACE VIEW v_trader_wallets AS
SELECT 
    am.address,
    am.trader_id,
    am.derivation_index,
    am.webhook_id,
    am.last_usdt_balance as balance_usdt,
    t.name as trader_name,
    t.phone as trader_phone,
    t.balance as trader_balance,
    t.address_generated_at,
    t.last_deposit_at,
    -- Calculate total deposits
    COALESCE((
        SELECT SUM(usdt_amount) 
        FROM crypto_transactions ct 
        WHERE ct.trader_id = am.trader_id 
        AND ct.type = 'deposit' 
        AND ct.status = 'completed'
    ), 0) as total_deposits,
    -- TRX balance (we don't track this, set to 0)
    0 as balance_trx,
    -- Last balance check (use last deposit or address generated)
    COALESCE(t.last_deposit_at, t.address_generated_at) as last_balance_check
FROM address_mapping am
JOIN traders t ON t.id = am.trader_id
ORDER BY am.derivation_index DESC;

-- View: Wallet transactions (crypto_transactions formatted)
CREATE OR REPLACE VIEW v_wallet_transactions AS
SELECT 
    ct.id,
    ct.trader_id,
    t.name as trader_name,
    ct.type as tx_type,
    ct.tx_hash,
    ct.usdt_amount as amount,
    'USDT' as token,
    ct.status,
    ct.from_address,
    ct.to_address,
    ct.created_at
FROM crypto_transactions ct
LEFT JOIN traders t ON t.id = ct.trader_id
ORDER BY ct.created_at DESC;

-- View: Wallet stats summary
CREATE OR REPLACE VIEW v_wallet_stats AS
SELECT 
    (SELECT COUNT(*) FROM address_mapping) as total_wallets,
    (SELECT COALESCE(SUM(last_usdt_balance), 0) FROM address_mapping) as total_usdt_balance,
    0 as total_trx_balance,
    (SELECT COALESCE(SUM(usdt_amount), 0) 
     FROM crypto_transactions 
     WHERE type = 'deposit' 
     AND status = 'completed' 
     AND created_at > NOW() - INTERVAL '24 hours') as deposits_24h,
    (SELECT COUNT(*) FROM sweep_queue WHERE status = 'pending') as pending_transactions,
    (SELECT admin_wallet FROM tatum_config WHERE id = 'main') as admin_wallet;

-- Grant access
GRANT SELECT ON v_trader_wallets TO authenticated;
GRANT SELECT ON v_wallet_transactions TO authenticated;
GRANT SELECT ON v_wallet_stats TO authenticated;
GRANT SELECT ON v_trader_wallets TO service_role;
GRANT SELECT ON v_wallet_transactions TO service_role;
GRANT SELECT ON v_wallet_stats TO service_role;
