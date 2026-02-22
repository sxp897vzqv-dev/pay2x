-- Fix affiliate_dashboard_view to include created_at
CREATE OR REPLACE VIEW affiliate_dashboard_view AS
SELECT 
  a.id,
  a.name,
  a.email,
  a.phone,
  a.default_commission_rate,
  a.total_earned,
  a.pending_settlement,
  a.total_settled,
  a.status,
  a.created_at,
  -- Trader counts
  (SELECT COUNT(*) FROM affiliate_traders WHERE affiliate_id = a.id) as total_traders,
  -- Recent earnings
  (SELECT COALESCE(SUM(affiliate_earning), 0) FROM affiliate_earnings 
   WHERE affiliate_id = a.id AND created_at > NOW() - INTERVAL '30 days') as earnings_30d,
  (SELECT COALESCE(SUM(affiliate_earning), 0) FROM affiliate_earnings 
   WHERE affiliate_id = a.id AND created_at > NOW() - INTERVAL '7 days') as earnings_7d,
  -- This month
  (SELECT COALESCE(SUM(affiliate_earning), 0) FROM affiliate_earnings 
   WHERE affiliate_id = a.id AND created_at >= DATE_TRUNC('month', NOW())) as earnings_this_month
FROM affiliates a;
