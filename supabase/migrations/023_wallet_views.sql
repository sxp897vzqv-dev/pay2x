-- =====================================================
-- WALLET VIEWS FOR ADMIN HD WALLETS PAGE
-- Creates missing views: v_trader_wallets, v_wallet_transactions, v_wallet_stats
-- =====================================================

-- View: Trader wallets with balances
CREATE OR REPLACE VIEW v_trader_wallets AS
SELECT 
    t.id,
    t.id as trader_id,
    t.name as trader_name,
    t.phone as trader_phone,
    t.usdt_deposit_address as address,
    t.derivation_index,
    COALESCE(t.balance, 0) as balance_inr,
    0::decimal as balance_usdt,  -- Will be updated by balance refresh
    0::decimal as balance_trx,   -- Will be updated by balance refresh
    NULL::timestamptz as last_balance_check,
    (
        SELECT COALESCE(SUM(usdt_amount), 0) 
        FROM crypto_transactions 
        WHERE trader_id = t.id AND type = 'deposit' AND status = 'completed'
    ) as total_deposits,
    t.address_generated_at,
    t.created_at
FROM traders t
WHERE t.usdt_deposit_address IS NOT NULL
ORDER BY t.created_at DESC;

-- View: Wallet transactions (deposits & sweeps)
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
    (SELECT COUNT(*) FROM traders WHERE usdt_deposit_address IS NOT NULL) as total_wallets,
    (SELECT COALESCE(SUM(usdt_amount), 0) FROM crypto_transactions WHERE type = 'deposit' AND status = 'completed') as total_usdt_balance,
    0::decimal as total_trx_balance,
    (
        SELECT COALESCE(SUM(usdt_amount), 0) 
        FROM crypto_transactions 
        WHERE type = 'deposit' 
        AND status = 'completed' 
        AND created_at > NOW() - INTERVAL '24 hours'
    ) as deposits_24h,
    (SELECT COUNT(*) FROM crypto_transactions WHERE status = 'pending') as pending_transactions,
    (SELECT admin_wallet FROM tatum_config WHERE id = 'main') as admin_wallet;

-- Grant access to views
GRANT SELECT ON v_trader_wallets TO authenticated;
GRANT SELECT ON v_wallet_transactions TO authenticated;
GRANT SELECT ON v_wallet_stats TO authenticated;
GRANT SELECT ON v_trader_wallets TO service_role;
GRANT SELECT ON v_wallet_transactions TO service_role;
GRANT SELECT ON v_wallet_stats TO service_role;
