-- ============================================
-- DIAGNOSTIC: Check affiliate setup for MATHEWWADE124@GMAIL.COM
-- Run this in Supabase Dashboard SQL Editor
-- ============================================

-- 1. Check if affiliate exists
SELECT 
  'Affiliate' as type,
  id,
  name,
  email,
  status,
  default_commission_rate,
  total_earned,
  pending_settlement
FROM affiliates 
WHERE LOWER(email) = LOWER('MATHEWWADE124@GMAIL.COM');

-- 2. Check affiliate_traders links for this affiliate
SELECT 
  'Affiliate-Trader Link' as type,
  at.id as link_id,
  at.affiliate_id,
  at.trader_id,
  at.commission_rate,
  at.total_commission_earned,
  t.name as trader_name,
  t.email as trader_email,
  t.is_active as trader_active
FROM affiliate_traders at
JOIN affiliates a ON a.id = at.affiliate_id
JOIN traders t ON t.id = at.trader_id
WHERE LOWER(a.email) = LOWER('MATHEWWADE124@GMAIL.COM');

-- 3. Check if any earnings exist for this affiliate
SELECT 
  'Earnings' as type,
  ae.id,
  ae.transaction_type,
  ae.transaction_amount,
  ae.trader_earning,
  ae.affiliate_earning,
  ae.commission_rate,
  ae.status,
  ae.created_at
FROM affiliate_earnings ae
JOIN affiliates a ON a.id = ae.affiliate_id
WHERE LOWER(a.email) = LOWER('MATHEWWADE124@GMAIL.COM')
ORDER BY ae.created_at DESC
LIMIT 10;

-- 4. Check traders with this affiliate set
SELECT 
  'Trader with affiliate_id' as type,
  t.id,
  t.name,
  t.email,
  t.affiliate_id,
  t.is_active
FROM traders t
JOIN affiliates a ON t.affiliate_id = a.id
WHERE LOWER(a.email) = LOWER('MATHEWWADE124@GMAIL.COM');

-- 5. Check recent completed payins for linked traders (should trigger commission)
SELECT 
  'Recent Completed Payins' as type,
  p.id as payin_id,
  p.amount,
  p.commission as trader_commission,
  p.status,
  p.completed_at,
  t.name as trader_name
FROM payins p
JOIN traders t ON t.id = p.trader_id
JOIN affiliate_traders at ON at.trader_id = t.id
JOIN affiliates a ON a.id = at.affiliate_id
WHERE LOWER(a.email) = LOWER('MATHEWWADE124@GMAIL.COM')
  AND p.status = 'completed'
ORDER BY p.completed_at DESC
LIMIT 10;

-- SUMMARY: If query 2 returns 0 rows, the trader is NOT linked to the affiliate!
-- Fix: Go to Admin > Traders > Edit the trader > Select the affiliate from dropdown
