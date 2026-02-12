-- 019_two_factor_auth.sql
-- Two-Factor Authentication System

-- 2FA secrets and settings per user
CREATE TABLE IF NOT EXISTS two_factor_auth (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    secret TEXT NOT NULL, -- Encrypted TOTP secret
    is_enabled BOOLEAN NOT NULL DEFAULT false,
    backup_codes TEXT[], -- Array of hashed backup codes
    backup_codes_used INT NOT NULL DEFAULT 0,
    verified_at TIMESTAMPTZ, -- When 2FA was first verified/enabled
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

-- 2FA verification logs (for audit)
CREATE TABLE IF NOT EXISTS two_factor_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    action TEXT NOT NULL, -- 'verify', 'setup', 'disable', 'backup_used'
    success BOOLEAN NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    protected_action TEXT, -- What action was being protected
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Actions that require 2FA
CREATE TABLE IF NOT EXISTS two_factor_protected_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_key TEXT NOT NULL UNIQUE, -- e.g., 'balance_adjustment', 'approve_payout_large'
    action_name TEXT NOT NULL, -- Human readable name
    description TEXT,
    risk_level TEXT NOT NULL DEFAULT 'high' CHECK (risk_level IN ('critical', 'high', 'medium')),
    threshold_amount DECIMAL(15,2), -- For amount-based actions (e.g., payouts > 50k)
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default protected actions
INSERT INTO two_factor_protected_actions (action_key, action_name, description, risk_level, threshold_amount) VALUES
-- Critical (Always require 2FA)
('balance_adjustment', 'Manual Balance Adjustment', 'Credit or debit trader/merchant balance', 'critical', NULL),
('approve_payout_large', 'Approve Large Payout', 'Approve payouts above threshold', 'critical', 50000),
('approve_dispute', 'Approve Dispute', 'Final dispute resolution with balance changes', 'critical', NULL),
('create_admin', 'Create Admin/Worker', 'Create new admin or worker account', 'critical', NULL),
('delete_admin', 'Delete Admin/Worker', 'Delete admin or worker account', 'critical', NULL),
('reset_password', 'Reset User Password', 'Reset password for any user', 'critical', NULL),
('change_commission', 'Change Commission Rate', 'Modify trader or merchant commission rates', 'critical', NULL),
('process_settlement', 'Process Settlement', 'Process bulk settlement payouts', 'critical', NULL),
('export_sensitive', 'Export Sensitive Data', 'Export financial or user data', 'critical', NULL),
-- High Risk
('deactivate_entity', 'Deactivate Trader/Merchant', 'Disable trader or merchant account', 'high', NULL),
('regenerate_api_key', 'Regenerate API Key', 'Generate new API key for merchant', 'high', NULL),
('change_webhook', 'Change Webhook URL', 'Modify merchant webhook configuration', 'high', NULL),
('modify_upi_pool', 'Modify UPI Pool', 'Add, remove or modify UPI accounts', 'high', NULL),
-- Medium Risk (Optional)
('delete_entity', 'Delete Trader/Merchant', 'Permanently delete trader or merchant', 'medium', NULL),
('change_engine_config', 'Change Engine Config', 'Modify payin/payout engine settings', 'medium', NULL)
ON CONFLICT (action_key) DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_2fa_user_id ON two_factor_auth(user_id);
CREATE INDEX IF NOT EXISTS idx_2fa_logs_user_id ON two_factor_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_2fa_logs_action ON two_factor_logs(protected_action, created_at DESC);

-- RLS
ALTER TABLE two_factor_auth ENABLE ROW LEVEL SECURITY;
ALTER TABLE two_factor_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE two_factor_protected_actions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own 2FA settings
CREATE POLICY "Users can view own 2FA" ON two_factor_auth
    FOR SELECT USING (auth.uid() = user_id);

-- Service role can manage all
CREATE POLICY "Service role full access 2FA" ON two_factor_auth
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access logs" ON two_factor_logs
    FOR ALL USING (auth.role() = 'service_role');

-- Admins can view protected actions
CREATE POLICY "Authenticated can view protected actions" ON two_factor_protected_actions
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Service role manage protected actions" ON two_factor_protected_actions
    FOR ALL USING (auth.role() = 'service_role');

-- Function to check if user has 2FA enabled
CREATE OR REPLACE FUNCTION has_2fa_enabled(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM two_factor_auth 
        WHERE user_id = p_user_id AND is_enabled = true
    );
END;
$$;

-- Function to check if action requires 2FA
CREATE OR REPLACE FUNCTION action_requires_2fa(p_action_key TEXT, p_amount DECIMAL DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_action two_factor_protected_actions%ROWTYPE;
BEGIN
    SELECT * INTO v_action FROM two_factor_protected_actions 
    WHERE action_key = p_action_key AND is_active = true;
    
    IF NOT FOUND THEN
        RETURN false;
    END IF;
    
    -- If action has threshold, check amount
    IF v_action.threshold_amount IS NOT NULL AND p_amount IS NOT NULL THEN
        RETURN p_amount >= v_action.threshold_amount;
    END IF;
    
    RETURN true;
END;
$$;

-- Add 2FA requirement flag to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS requires_2fa BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT false;

-- Update profiles when 2FA is enabled/disabled (trigger)
CREATE OR REPLACE FUNCTION sync_2fa_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE profiles SET two_factor_enabled = NEW.is_enabled WHERE id = NEW.user_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_2fa_status ON two_factor_auth;
CREATE TRIGGER trigger_sync_2fa_status
    AFTER INSERT OR UPDATE OF is_enabled ON two_factor_auth
    FOR EACH ROW EXECUTE FUNCTION sync_2fa_status();

COMMENT ON TABLE two_factor_auth IS 'TOTP 2FA secrets and settings per user';
COMMENT ON TABLE two_factor_logs IS 'Audit log of all 2FA verifications';
COMMENT ON TABLE two_factor_protected_actions IS 'Actions that require 2FA confirmation';
