-- Migration: Fix RLS policies for payout_requests table
-- Allows traders to create/view/update their own payout requests

-- Enable RLS if not already enabled
ALTER TABLE payout_requests ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (to avoid conflicts)
DROP POLICY IF EXISTS "Traders can view own payout requests" ON payout_requests;
DROP POLICY IF EXISTS "Traders can create own payout requests" ON payout_requests;
DROP POLICY IF EXISTS "Traders can update own payout requests" ON payout_requests;
DROP POLICY IF EXISTS "Admin full access payout_requests" ON payout_requests;
DROP POLICY IF EXISTS "Service role full access payout_requests" ON payout_requests;

-- Policy: Traders can view their own requests
CREATE POLICY "Traders can view own payout requests" ON payout_requests
  FOR SELECT TO authenticated
  USING (trader_id = auth.uid());

-- Policy: Traders can create their own requests
CREATE POLICY "Traders can create own payout requests" ON payout_requests
  FOR INSERT TO authenticated
  WITH CHECK (trader_id = auth.uid());

-- Policy: Traders can update their own requests
CREATE POLICY "Traders can update own payout requests" ON payout_requests
  FOR UPDATE TO authenticated
  USING (trader_id = auth.uid())
  WITH CHECK (trader_id = auth.uid());

-- Policy: Admins can do everything (check profile role)
CREATE POLICY "Admin full access payout_requests" ON payout_requests
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

-- Policy: Service role bypasses RLS
CREATE POLICY "Service role full access payout_requests" ON payout_requests
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
