-- =====================================================
-- PAYOUT VERIFICATION SYSTEM
-- Requires proof upload before balance is credited
-- =====================================================

-- =====================================================
-- 1. ADD VERIFICATION COLUMNS TO PAYOUTS
-- =====================================================

-- Verification status enum
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS 
  verification_status TEXT DEFAULT 'none' 
  CHECK (verification_status IN ('none', 'pending_proof', 'pending_verification', 'approved', 'rejected', 'escalated'));

-- Proof URLs
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS statement_proof_url TEXT;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS video_proof_url TEXT;

-- Timestamps
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS proof_submitted_at TIMESTAMPTZ;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- Verifier info
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES profiles(id);
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS verification_notes TEXT;

-- Rejection tracking
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS rejection_count INT DEFAULT 0;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS last_rejection_reason TEXT;

-- Flags for suspicious activity
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS verification_flags JSONB DEFAULT '[]';

-- =====================================================
-- 2. VERIFICATION AUDIT LOG
-- =====================================================

CREATE TABLE IF NOT EXISTS payout_verification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payout_id UUID NOT NULL REFERENCES payouts(id),
    
    -- Action details
    action TEXT NOT NULL CHECK (action IN (
        'proof_uploaded', 'submitted_for_verification', 
        'approved', 'rejected', 'escalated', 're_uploaded'
    )),
    
    -- Actor
    actor_id UUID REFERENCES profiles(id),
    actor_role TEXT, -- trader, worker, admin
    
    -- Status change
    old_status TEXT,
    new_status TEXT,
    
    -- Details
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_verification_logs_payout ON payout_verification_logs(payout_id);
CREATE INDEX idx_verification_logs_actor ON payout_verification_logs(actor_id);
CREATE INDEX idx_verification_logs_action ON payout_verification_logs(action);

-- =====================================================
-- 3. WORKER VERIFICATION STATS
-- =====================================================

CREATE TABLE IF NOT EXISTS worker_verification_stats (
    worker_id UUID PRIMARY KEY REFERENCES profiles(id),
    total_verified INT DEFAULT 0,
    total_approved INT DEFAULT 0,
    total_rejected INT DEFAULT 0,
    avg_verification_time_seconds INT DEFAULT 0,
    last_verification_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 4. RLS POLICIES
-- =====================================================

ALTER TABLE payout_verification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_verification_stats ENABLE ROW LEVEL SECURITY;

-- Verification logs: admins and workers can view
CREATE POLICY "Admin/worker view verification logs" ON payout_verification_logs
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'worker'))
    );

-- Traders can see their own payout logs
CREATE POLICY "Trader view own payout verification logs" ON payout_verification_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM payouts p 
            JOIN traders t ON t.id = p.trader_id 
            WHERE p.id = payout_id AND t.profile_id = auth.uid()
        )
    );

-- Insert: service role and authenticated
CREATE POLICY "Insert verification logs" ON payout_verification_logs
    FOR INSERT WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Worker stats: admins can view all, workers can view own
CREATE POLICY "Admin view all worker stats" ON worker_verification_stats
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Worker view own stats" ON worker_verification_stats
    FOR SELECT USING (worker_id = auth.uid());

-- Service role bypass
CREATE POLICY "Service role verification logs" ON payout_verification_logs 
    FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role worker stats" ON worker_verification_stats 
    FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- 5. FUNCTIONS
-- =====================================================

-- Submit proof for verification
CREATE OR REPLACE FUNCTION submit_payout_proof(
    p_payout_id UUID,
    p_statement_url TEXT,
    p_video_url TEXT
) RETURNS JSONB AS $$
DECLARE
    v_payout payouts%ROWTYPE;
    v_trader_profile_id UUID;
    v_flags JSONB := '[]';
BEGIN
    -- Get payout
    SELECT * INTO v_payout FROM payouts WHERE id = p_payout_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout not found');
    END IF;
    
    -- Verify trader owns this payout
    SELECT profile_id INTO v_trader_profile_id FROM traders WHERE id = v_payout.trader_id;
    IF v_trader_profile_id != auth.uid() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;
    
    -- Check status allows proof submission
    IF v_payout.verification_status NOT IN ('none', 'pending_proof', 'rejected') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot submit proof in current status');
    END IF;
    
    -- Validate both proofs provided
    IF p_statement_url IS NULL OR p_video_url IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Both statement and video proof required');
    END IF;
    
    -- Check for suspicious activity (completed too fast)
    IF v_payout.assigned_at IS NOT NULL AND 
       EXTRACT(EPOCH FROM (NOW() - v_payout.assigned_at)) < 30 THEN
        v_flags := v_flags || '["completed_too_fast"]'::jsonb;
    END IF;
    
    -- Update payout
    UPDATE payouts SET
        statement_proof_url = p_statement_url,
        video_proof_url = p_video_url,
        verification_status = 'pending_verification',
        proof_submitted_at = NOW(),
        verification_flags = v_flags,
        updated_at = NOW()
    WHERE id = p_payout_id;
    
    -- Log the action
    INSERT INTO payout_verification_logs (
        payout_id, action, actor_id, actor_role,
        old_status, new_status, metadata
    ) VALUES (
        p_payout_id, 'submitted_for_verification', auth.uid(), 'trader',
        v_payout.verification_status, 'pending_verification',
        jsonb_build_object('flags', v_flags)
    );
    
    RETURN jsonb_build_object(
        'success', true, 
        'flags', v_flags,
        'message', 'Proof submitted for verification'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Approve payout verification
CREATE OR REPLACE FUNCTION approve_payout_verification(
    p_payout_id UUID,
    p_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_payout payouts%ROWTYPE;
    v_trader traders%ROWTYPE;
    v_worker_role TEXT;
    v_old_balance DECIMAL;
    v_new_balance DECIMAL;
    v_amount DECIMAL;
    v_commission DECIMAL;
BEGIN
    -- Check caller is admin or worker with permission
    SELECT role INTO v_worker_role FROM profiles WHERE id = auth.uid();
    IF v_worker_role NOT IN ('admin', 'worker') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;
    
    -- If worker, check permission
    IF v_worker_role = 'worker' THEN
        IF NOT EXISTS (
            SELECT 1 FROM workers 
            WHERE profile_id = auth.uid() 
            AND 'payout_verification' = ANY(permissions)
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Missing payout_verification permission');
        END IF;
    END IF;
    
    -- Get payout
    SELECT * INTO v_payout FROM payouts WHERE id = p_payout_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout not found');
    END IF;
    
    -- Check status
    IF v_payout.verification_status != 'pending_verification' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout not pending verification');
    END IF;
    
    -- Get trader and calculate amounts
    SELECT * INTO v_trader FROM traders WHERE id = v_payout.trader_id;
    v_amount := v_payout.amount;
    v_commission := ROUND(v_amount * COALESCE(v_trader.payout_commission, 1) / 100, 2);
    v_old_balance := COALESCE(v_trader.balance, 0);
    v_new_balance := v_old_balance + v_commission;
    
    -- Update payout status
    UPDATE payouts SET
        verification_status = 'approved',
        status = 'completed',
        verified_by = auth.uid(),
        verified_at = NOW(),
        verification_notes = p_notes,
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_payout_id;
    
    -- Credit trader commission
    UPDATE traders SET
        balance = v_new_balance,
        updated_at = NOW()
    WHERE id = v_payout.trader_id;
    
    -- Log verification
    INSERT INTO payout_verification_logs (
        payout_id, action, actor_id, actor_role,
        old_status, new_status, notes, metadata
    ) VALUES (
        p_payout_id, 'approved', auth.uid(), v_worker_role,
        'pending_verification', 'approved', p_notes,
        jsonb_build_object(
            'commission', v_commission,
            'old_balance', v_old_balance,
            'new_balance', v_new_balance
        )
    );
    
    -- Update worker stats
    INSERT INTO worker_verification_stats (worker_id, total_verified, total_approved, last_verification_at)
    VALUES (auth.uid(), 1, 1, NOW())
    ON CONFLICT (worker_id) DO UPDATE SET
        total_verified = worker_verification_stats.total_verified + 1,
        total_approved = worker_verification_stats.total_approved + 1,
        last_verification_at = NOW(),
        updated_at = NOW();
    
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Payout approved',
        'commission_credited', v_commission,
        'new_balance', v_new_balance
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reject payout verification
CREATE OR REPLACE FUNCTION reject_payout_verification(
    p_payout_id UUID,
    p_reason TEXT
) RETURNS JSONB AS $$
DECLARE
    v_payout payouts%ROWTYPE;
    v_worker_role TEXT;
    v_new_rejection_count INT;
    v_new_status TEXT;
BEGIN
    -- Check caller is admin or worker with permission
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
    
    -- Require reason
    IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Rejection reason required');
    END IF;
    
    -- Get payout
    SELECT * INTO v_payout FROM payouts WHERE id = p_payout_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout not found');
    END IF;
    
    IF v_payout.verification_status != 'pending_verification' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout not pending verification');
    END IF;
    
    -- Increment rejection count
    v_new_rejection_count := COALESCE(v_payout.rejection_count, 0) + 1;
    
    -- If max rejections (3), escalate
    IF v_new_rejection_count >= 3 THEN
        v_new_status := 'escalated';
    ELSE
        v_new_status := 'rejected';
    END IF;
    
    -- Update payout
    UPDATE payouts SET
        verification_status = v_new_status,
        rejection_count = v_new_rejection_count,
        last_rejection_reason = p_reason,
        verified_by = auth.uid(),
        verified_at = NOW(),
        verification_notes = p_reason,
        -- Clear proofs so trader must re-upload
        statement_proof_url = NULL,
        video_proof_url = NULL,
        proof_submitted_at = NULL,
        updated_at = NOW()
    WHERE id = p_payout_id;
    
    -- Log rejection
    INSERT INTO payout_verification_logs (
        payout_id, action, actor_id, actor_role,
        old_status, new_status, notes, metadata
    ) VALUES (
        p_payout_id, 
        CASE WHEN v_new_status = 'escalated' THEN 'escalated' ELSE 'rejected' END,
        auth.uid(), v_worker_role,
        'pending_verification', v_new_status, p_reason,
        jsonb_build_object('rejection_count', v_new_rejection_count)
    );
    
    -- Update worker stats
    INSERT INTO worker_verification_stats (worker_id, total_verified, total_rejected, last_verification_at)
    VALUES (auth.uid(), 1, 1, NOW())
    ON CONFLICT (worker_id) DO UPDATE SET
        total_verified = worker_verification_stats.total_verified + 1,
        total_rejected = worker_verification_stats.total_rejected + 1,
        last_verification_at = NOW(),
        updated_at = NOW();
    
    RETURN jsonb_build_object(
        'success', true,
        'message', CASE WHEN v_new_status = 'escalated' 
            THEN 'Payout escalated to admin (max rejections reached)' 
            ELSE 'Payout rejected - trader must re-upload proof' 
        END,
        'new_status', v_new_status,
        'rejection_count', v_new_rejection_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 6. VIEWS
-- =====================================================

-- Pending verifications view for admin/worker
CREATE OR REPLACE VIEW v_pending_payout_verifications AS
SELECT 
    p.id,
    p.amount,
    p.merchant_id,
    m.name as merchant_name,
    p.trader_id,
    t.name as trader_name,
    t.phone as trader_phone,
    p.beneficiary_name,
    p.beneficiary_account,
    p.beneficiary_ifsc,
    p.beneficiary_bank,
    p.statement_proof_url,
    p.video_proof_url,
    p.proof_submitted_at,
    p.verification_status,
    p.verification_flags,
    p.rejection_count,
    p.last_rejection_reason,
    p.assigned_at,
    p.created_at,
    -- Time in queue
    EXTRACT(EPOCH FROM (NOW() - p.proof_submitted_at)) / 60 as minutes_in_queue,
    -- Priority based on time
    CASE 
        WHEN EXTRACT(EPOCH FROM (NOW() - p.proof_submitted_at)) > 14400 THEN 'critical' -- >4hr
        WHEN EXTRACT(EPOCH FROM (NOW() - p.proof_submitted_at)) > 3600 THEN 'high'      -- >1hr
        WHEN EXTRACT(EPOCH FROM (NOW() - p.proof_submitted_at)) > 1800 THEN 'medium'    -- >30min
        ELSE 'normal'
    END as priority,
    -- Has flags
    jsonb_array_length(COALESCE(p.verification_flags, '[]'::jsonb)) > 0 as has_flags
FROM payouts p
LEFT JOIN merchants m ON m.id = p.merchant_id
LEFT JOIN traders t ON t.id = p.trader_id
WHERE p.verification_status IN ('pending_verification', 'escalated')
ORDER BY 
    CASE p.verification_status WHEN 'escalated' THEN 0 ELSE 1 END,
    p.proof_submitted_at ASC;

-- Grant access to views
GRANT SELECT ON v_pending_payout_verifications TO authenticated;

-- =====================================================
-- 7. INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_payouts_verification_status 
    ON payouts(verification_status) WHERE verification_status IN ('pending_verification', 'escalated');
CREATE INDEX IF NOT EXISTS idx_payouts_proof_submitted 
    ON payouts(proof_submitted_at) WHERE verification_status = 'pending_verification';
