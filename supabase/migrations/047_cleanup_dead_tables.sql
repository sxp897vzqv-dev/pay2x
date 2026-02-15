-- ============================================================================
-- CLEANUP DEAD TABLES & DUPLICATE FUNCTIONS
-- Date: 2026-02-15
-- ============================================================================
-- Removes tables from features that were planned but never implemented
-- Consolidates duplicate function definitions
-- Adds missing columns
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. ADD MISSING COMMISSION COLUMN TO PAYOUTS
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE payouts ADD COLUMN IF NOT EXISTS commission NUMERIC(15,2) DEFAULT 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. DROP DOUBLE-ENTRY ACCOUNTING (Never implemented)
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS journal_lines CASCADE;
DROP TABLE IF EXISTS journal_entries CASCADE;
DROP TABLE IF EXISTS accounts CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. DROP VIRTUAL ACCOUNTS (Never implemented)
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS va_webhook_queue CASCADE;
DROP TABLE IF EXISTS va_transactions CASCADE;
DROP TABLE IF EXISTS va_bank_partners CASCADE;
DROP TABLE IF EXISTS virtual_accounts CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. DROP UNUSED AUDIT TABLES
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS audit_chain_snapshots CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. DROP DUPLICATE WEBHOOK TABLES (keep the ones from 016)
-- ─────────────────────────────────────────────────────────────────────────────

-- webhook_deliveries and webhook_attempts were created in both 009 and 016
-- They should be the same table, IF NOT EXISTS handles this
-- No action needed if same table

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. CONSOLIDATE DUPLICATE FUNCTIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop all versions of frequently duplicated functions
DO $$
DECLARE
    r RECORD;
    func_names TEXT[] := ARRAY[
        'switch_payin_upi',
        'complete_payin',
        'increment_upi_failure',
        'increment_upi_success',
        'process_waiting_list_on_new_payout',
        'process_waiting_list_on_payout_reassign'
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
-- 6. RECREATE CANONICAL VERSIONS OF KEY FUNCTIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- switch_payin_upi: Switch to next UPI in fallback chain
CREATE OR REPLACE FUNCTION switch_payin_upi(
    p_payin_id UUID,
    p_merchant_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_payin RECORD;
    v_current_attempt INT;
    v_max_attempts INT;
    v_fallback_chain TEXT[];
    v_next_upi_id UUID;
    v_next_upi RECORD;
    v_new_txn_id TEXT;
BEGIN
    -- Get payin with fallback info
    SELECT * INTO v_payin FROM payins WHERE id = p_payin_id AND merchant_id = p_merchant_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payin not found');
    END IF;
    
    -- Check if switching allowed
    IF v_payin.status NOT IN ('pending', 'assigned') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot switch - status is ' || v_payin.status);
    END IF;
    
    v_current_attempt := COALESCE(v_payin.current_attempt, 1);
    v_max_attempts := COALESCE(v_payin.max_attempts, 3);
    v_fallback_chain := COALESCE(v_payin.fallback_chain, ARRAY[]::TEXT[]);
    
    -- Check if more attempts available
    IF v_current_attempt >= v_max_attempts THEN
        RETURN jsonb_build_object('success', false, 'error', 'No more fallback attempts');
    END IF;
    
    -- Get next UPI from fallback chain
    IF v_current_attempt < array_length(v_fallback_chain, 1) THEN
        v_next_upi_id := v_fallback_chain[v_current_attempt + 1]::UUID;
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'No more UPIs in fallback chain');
    END IF;
    
    -- Get next UPI details
    SELECT * INTO v_next_upi FROM upi_pool WHERE id = v_next_upi_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Next UPI not found');
    END IF;
    
    -- Generate new transaction ID
    v_new_txn_id := 'TXN' || EXTRACT(EPOCH FROM NOW())::BIGINT || FLOOR(RANDOM() * 1000)::INT;
    
    -- Update payin with new UPI
    UPDATE payins SET
        upi_id = v_next_upi_id,
        trader_id = v_next_upi.trader_id,
        upi_vpa = v_next_upi.upi_id,
        current_attempt = v_current_attempt + 1,
        txn_id = v_new_txn_id,
        attempt_history = COALESCE(attempt_history, '[]'::jsonb) || jsonb_build_object(
            'attempt', v_current_attempt,
            'upi_id', v_payin.upi_id,
            'upi_vpa', v_payin.upi_vpa,
            'switched_at', NOW()
        ),
        updated_at = NOW()
    WHERE id = p_payin_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'attempt', v_current_attempt + 1,
        'max_attempts', v_max_attempts,
        'new_upi_id', v_next_upi_id,
        'new_upi_vpa', v_next_upi.upi_id,
        'new_txn_id', v_new_txn_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- complete_payin: Mark payin as completed with UTR
CREATE OR REPLACE FUNCTION complete_payin(
    p_payin_id UUID,
    p_utr TEXT,
    p_completed_by UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_payin RECORD;
    v_trader RECORD;
    v_commission DECIMAL;
BEGIN
    -- Get payin
    SELECT * INTO v_payin FROM payins WHERE id = p_payin_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payin not found');
    END IF;
    
    IF v_payin.status = 'completed' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Already completed');
    END IF;
    
    -- Get trader for commission
    SELECT * INTO v_trader FROM traders WHERE id = v_payin.trader_id;
    v_commission := COALESCE(v_payin.amount * COALESCE(v_trader.payin_rate, 0) / 100, 0);
    
    -- Update payin
    UPDATE payins SET
        status = 'completed',
        utr = p_utr,
        commission = v_commission,
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_payin_id;
    
    -- Credit trader balance
    UPDATE traders SET
        balance = COALESCE(balance, 0) + v_payin.amount - v_commission,
        updated_at = NOW()
    WHERE id = v_payin.trader_id;
    
    -- Update UPI stats
    UPDATE upi_pool SET
        success_count = COALESCE(success_count, 0) + 1,
        daily_volume = COALESCE(daily_volume, 0) + v_payin.amount,
        last_success_at = NOW()
    WHERE id = v_payin.upi_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'commission', v_commission,
        'trader_credited', v_payin.amount - v_commission
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- increment_upi_success: Update UPI stats on success
CREATE OR REPLACE FUNCTION increment_upi_success(
    p_upi_id UUID,
    p_amount DECIMAL DEFAULT 0
) RETURNS VOID AS $$
BEGIN
    UPDATE upi_pool SET
        success_count = COALESCE(success_count, 0) + 1,
        daily_volume = COALESCE(daily_volume, 0) + p_amount,
        last_success_at = NOW(),
        hourly_failures = 0, -- Reset on success
        updated_at = NOW()
    WHERE id = p_upi_id;
END;
$$ LANGUAGE plpgsql;

-- increment_upi_failure: Update UPI stats on failure
CREATE OR REPLACE FUNCTION increment_upi_failure(
    p_upi_id UUID
) RETURNS VOID AS $$
BEGIN
    UPDATE upi_pool SET
        failure_count = COALESCE(failure_count, 0) + 1,
        hourly_failures = COALESCE(hourly_failures, 0) + 1,
        last_failure_at = NOW(),
        updated_at = NOW()
    WHERE id = p_upi_id;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. ADD COMMENTS FOR DOCUMENTATION
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON FUNCTION switch_payin_upi IS 'Canonical version - switches payin to next UPI in fallback chain';
COMMENT ON FUNCTION complete_payin IS 'Canonical version - marks payin complete and credits trader';
COMMENT ON FUNCTION increment_upi_success IS 'Canonical version - updates UPI stats on success';
COMMENT ON FUNCTION increment_upi_failure IS 'Canonical version - updates UPI stats on failure';

-- ─────────────────────────────────────────────────────────────────────────────
-- DONE
-- ─────────────────────────────────────────────────────────────────────────────
