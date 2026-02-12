-- Migration: Fix RLS policies for payouts table
-- Traders need to see unassigned pending payouts to assign to themselves

-- Enable RLS if not already enabled
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Traders can view own payouts" ON payouts;
DROP POLICY IF EXISTS "Traders can view pending unassigned payouts" ON payouts;
DROP POLICY IF EXISTS "Traders can update assigned payouts" ON payouts;
DROP POLICY IF EXISTS "Admin full access payouts" ON payouts;
DROP POLICY IF EXISTS "Service role full access payouts" ON payouts;
DROP POLICY IF EXISTS "Merchants can view own payouts" ON payouts;

-- Traders can view their assigned payouts
CREATE POLICY "Traders can view own payouts" ON payouts
  FOR SELECT TO authenticated
  USING (trader_id = auth.uid());

-- Traders can view pending unassigned payouts (for auto-assignment)
CREATE POLICY "Traders can view pending unassigned payouts" ON payouts
  FOR SELECT TO authenticated
  USING (status = 'pending' AND trader_id IS NULL);

-- Traders can update payouts assigned to them
CREATE POLICY "Traders can update assigned payouts" ON payouts
  FOR UPDATE TO authenticated
  USING (trader_id = auth.uid())
  WITH CHECK (trader_id = auth.uid());

-- Merchants can view their own payouts
CREATE POLICY "Merchants can view own payouts" ON payouts
  FOR SELECT TO authenticated
  USING (merchant_id = auth.uid());

-- Admins can do everything
CREATE POLICY "Admin full access payouts" ON payouts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

-- Service role bypasses RLS
CREATE POLICY "Service role full access payouts" ON payouts
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
