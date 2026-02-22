-- 064: USDT tracking for Payouts and Disputes
-- Same pattern as payins: capture rate at creation, use at completion

-- ============================================================
-- DISPUTES: Add USDT columns
-- ============================================================
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS usdt_rate_at_creation DECIMAL(10,2);
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS amount_usdt DECIMAL(18,2);
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS usdt_rate_at_resolution DECIMAL(10,2);
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS resolved_amount_usdt DECIMAL(18,2);

-- ============================================================
-- PAYOUT: Update approve_payout_verification to track USDT
-- Uses usdt_rate_at_creation from payout record
-- ============================================================
CREATE OR REPLACE FUNCTION approve_payout_verification(
    p_payout_id UUID,
    p_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_payout payouts%ROWTYPE;
    v_trader traders%ROWTYPE;
    v_merchant merchants%ROWTYPE;
    v_worker_role TEXT;
    v_old_balance DECIMAL;
    v_new_balance DECIMAL;
    v_amount DECIMAL;
    v_merchant_fee DECIMAL;
    v_trader_rate DECIMAL;
    v_trader_earnings DECIMAL;
    v_total_credit DECIMAL;
    v_usdt_rate DECIMAL;
    v_amount_usdt DECIMAL;
BEGIN
    SELECT role INTO v_worker_role FROM profiles WHERE id = auth.uid();
    IF v_worker_role NOT IN ('admin', 'worker') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;
    
    IF v_worker_role = 'worker' THEN
        IF NOT EXISTS (
            SELECT 1 FROM workers 
            WHERE profile_id = auth.uid() 
            AND 'payout_verification' = ANY(permissions)
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Missing payout_verification permission');
        END IF;
    END IF;
    
    SELECT * INTO v_payout FROM payouts WHERE id = p_payout_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout not found');
    END IF;
    
    IF v_payout.verification_status != 'pending_verification' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout not pending verification');
    END IF;
    
    SELECT * INTO v_trader FROM traders WHERE id = v_payout.trader_id;
    SELECT * INTO v_merchant FROM merchants WHERE id = v_payout.merchant_id;
    
    v_amount := v_payout.amount;
    v_merchant_fee := COALESCE(v_payout.commission, 0);
    v_trader_rate := COALESCE(v_trader.payout_commission, 0);
    v_trader_earnings := ROUND(v_amount * v_trader_rate / 100, 2);
    
    -- Use USDT rate from payout creation
    v_usdt_rate := v_payout.usdt_rate_at_creation;
    IF v_usdt_rate IS NULL OR v_usdt_rate <= 0 THEN
        SELECT admin_usdt_rate INTO v_usdt_rate FROM tatum_config ORDER BY updated_at DESC NULLS LAST LIMIT 1;
    END IF;
    IF v_usdt_rate IS NULL OR v_usdt_rate <= 0 THEN v_usdt_rate := 95; END IF;
    
    v_amount_usdt := ROUND(v_amount / v_usdt_rate, 2);
    
    v_old_balance := COALESCE(v_trader.balance, 0);
    v_total_credit := v_amount + v_trader_earnings;
    v_new_balance := v_old_balance + v_total_credit;
    
    -- Update payout with USDT info
    UPDATE payouts SET
        verification_status = 'approved',
        status = 'completed',
        verified_by = auth.uid(),
        verified_at = NOW(),
        verification_notes = p_notes,
        completed_at = NOW(),
        updated_at = NOW(),
        amount_usdt = v_amount_usdt
    WHERE id = p_payout_id;
    
    -- Update trader balance
    UPDATE traders SET
        balance = v_new_balance,
        overall_commission = COALESCE(overall_commission, 0) + v_trader_earnings,
        updated_at = NOW()
    WHERE id = v_payout.trader_id;
    
    -- Deduct from merchant balance (INR)
    UPDATE merchants SET
        balance = balance - (v_amount + v_merchant_fee),
        available_balance = COALESCE(available_balance, 0) - (v_amount + v_merchant_fee),
        updated_at = NOW()
    WHERE id = v_payout.merchant_id;
    
    -- Balance history for merchant (debit)
    INSERT INTO balance_history (entity_type, entity_id, reason, amount, balance_before, balance_after, amount_usdt, usdt_rate, note, reference_type, reference_id)
    VALUES ('merchant', v_payout.merchant_id, 'payout_completed', -(v_amount + v_merchant_fee), 0, -(v_amount + v_merchant_fee), -v_amount_usdt, v_usdt_rate, 'Payout #' || COALESCE(v_payout.txn_id, LEFT(p_payout_id::TEXT, 8)), 'payout', p_payout_id);
    
    -- Log
    INSERT INTO payout_verification_logs (payout_id, action, actor_id, actor_role, old_status, new_status, notes, metadata)
    VALUES (p_payout_id, 'approved', auth.uid(), v_worker_role, 'pending_verification', 'approved', p_notes,
        jsonb_build_object('amount', v_amount, 'merchant_fee', v_merchant_fee, 'trader_earnings', v_trader_earnings, 'usdt_rate', v_usdt_rate, 'amount_usdt', v_amount_usdt));
    
    RETURN jsonb_build_object('success', true, 'amount', v_amount, 'usdt_rate', v_usdt_rate, 'amount_usdt', v_amount_usdt, 'newBalance', v_new_balance);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION approve_payout_verification(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION approve_payout_verification(UUID, TEXT) TO service_role;
