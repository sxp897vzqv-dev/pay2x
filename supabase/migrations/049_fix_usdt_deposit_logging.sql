-- =====================================================
-- FIX USDT DEPOSIT LOGGING
-- 1. Update RPC to include trader name in admin_logs
-- 2. Also insert into transactions table for balance history
-- =====================================================

-- Add entity_name column to admin_logs if not exists
ALTER TABLE admin_logs ADD COLUMN IF NOT EXISTS entity_name TEXT;

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
    v_trader_name TEXT;
BEGIN
    -- Calculate INR amount
    v_inr_amount := ROUND(p_usdt_amount * p_usdt_rate);
    
    -- Get current balance and trader info
    SELECT * INTO v_trader FROM traders WHERE id = p_trader_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Trader not found');
    END IF;
    
    v_trader_name := COALESCE(v_trader.name, 'Trader ' || LEFT(p_trader_id::TEXT, 8));
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
    
    -- Create crypto transaction record
    INSERT INTO crypto_transactions (
        trader_id, type, usdt_amount, usdt_rate, inr_amount,
        tx_hash, from_address, status, description
    ) VALUES (
        p_trader_id, 'deposit', p_usdt_amount, p_usdt_rate, v_inr_amount,
        p_tx_hash, p_from_address, 'completed',
        'USDT Deposit - ' || p_usdt_amount || ' USDT @ ₹' || p_usdt_rate || ' = ₹' || v_inr_amount
    );
    
    -- Also create regular transaction record (for balance history in admin panel)
    INSERT INTO transactions (
        trader_id, type, amount, note, admin_action, created_at
    ) VALUES (
        p_trader_id, 'usdt_deposit', v_inr_amount,
        'USDT Deposit: ' || p_usdt_amount || ' USDT @ ₹' || p_usdt_rate || ' (Tx: ' || LEFT(p_tx_hash, 16) || '...)',
        false, NOW()
    );
    
    -- Queue sweep
    INSERT INTO sweep_queue (trader_id, from_address, amount, tx_hash)
    VALUES (p_trader_id, p_from_address, p_usdt_amount, p_tx_hash);
    
    -- Log to admin_logs with trader name
    INSERT INTO admin_logs (
        action, category, entity_type, entity_id, entity_name,
        details, balance_before, balance_after, severity, source
    ) VALUES (
        'usdt_deposit_credited', 'financial', 'trader', p_trader_id, v_trader_name,
        jsonb_build_object(
            'trader_name', v_trader_name,
            'usdt_amount', p_usdt_amount, 
            'inr_amount', v_inr_amount,
            'tx_hash', p_tx_hash, 
            'rate', p_usdt_rate
        ),
        v_old_balance, v_new_balance, 'info', 'webhook'
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'inr_amount', v_inr_amount,
        'old_balance', v_old_balance,
        'new_balance', v_new_balance,
        'trader_name', v_trader_name
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- Add transactions table if it doesn't exist
-- (Some setups may not have it)
-- =====================================================
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trader_id UUID REFERENCES traders(id),
    type TEXT NOT NULL,
    amount DECIMAL(12,2),
    note TEXT,
    admin_action BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_trader ON transactions(trader_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
