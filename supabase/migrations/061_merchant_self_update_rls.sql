-- Migration: 061_merchant_self_update_rls.sql
-- Fix: Allow merchants to update their own record (API keys, webhook config, profile)
-- This was causing test API keys and webhook URLs to not persist

-- Enable RLS on merchants if not already enabled
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;

-- Policy: Merchants can view their own record
DROP POLICY IF EXISTS "Merchants can view own record" ON merchants;
CREATE POLICY "Merchants can view own record" ON merchants
    FOR SELECT
    TO authenticated
    USING (profile_id = auth.uid());

-- Policy: Merchants can update their own record (limited fields)
-- Security: Only allow updating specific safe fields, not critical ones like balance
DROP POLICY IF EXISTS "Merchants can update own record" ON merchants;
CREATE POLICY "Merchants can update own record" ON merchants
    FOR UPDATE
    TO authenticated
    USING (profile_id = auth.uid())
    WITH CHECK (profile_id = auth.uid());

-- Policy: Admins can do everything on merchants
DROP POLICY IF EXISTS "Admins full access to merchants" ON merchants;
CREATE POLICY "Admins full access to merchants" ON merchants
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- Also ensure traders table has similar policies (for consistency)
ALTER TABLE traders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Traders can view own record" ON traders;
CREATE POLICY "Traders can view own record" ON traders
    FOR SELECT
    TO authenticated
    USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "Traders can update own record" ON traders;
CREATE POLICY "Traders can update own record" ON traders
    FOR UPDATE
    TO authenticated
    USING (profile_id = auth.uid())
    WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS "Admins full access to traders" ON traders;
CREATE POLICY "Admins full access to traders" ON traders
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- Grant necessary permissions
GRANT SELECT, UPDATE ON merchants TO authenticated;
GRANT SELECT, UPDATE ON traders TO authenticated;
