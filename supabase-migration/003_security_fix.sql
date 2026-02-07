-- =====================================================
-- Quick fix: Allow anon users to insert security logs
-- Run AFTER 003_security.sql
-- =====================================================

-- Allow anyone to insert audit logs (for failed login logging)
CREATE POLICY "anyone_insert_audit_logs" ON admin_logs
  FOR INSERT WITH CHECK (TRUE);

-- Done!
SELECT 'Security logging fix applied!' as status;
