-- DEBUG: Check why affiliate commission isn't working
-- Run each section separately

-- 1. Check if credit_affiliate_on_trader_transaction function exists
SELECT 
  routine_name, 
  routine_type 
FROM information_schema.routines 
WHERE routine_name = 'credit_affiliate_on_trader_transaction';

-- 2. Check recent completed payins for trader "kinda"
SELECT 
  p.id,
  p.amount,
  p.commission,
  p.status,
  p.completed_at,
  t.name as trader_name
FROM payins p
JOIN traders t ON t.id = p.trader_id
WHERE t.email = 'kindasouqllc@gmail.com'
  AND p.status = 'completed'
ORDER BY p.completed_at DESC
LIMIT 5;

-- 3. Check affiliate_earnings table for any records
SELECT * FROM affiliate_earnings 
WHERE trader_id = '92c6e958-b8e5-4bb2-8845-9e991d608f65'
ORDER BY created_at DESC
LIMIT 5;

-- 4. Manually test the credit function (DRY RUN - won't insert)
-- Get a completed payin ID first from query 2, then test:
/*
SELECT credit_affiliate_on_trader_transaction(
  '92c6e958-b8e5-4bb2-8845-9e991d608f65'::UUID,  -- trader_id (kinda)
  'payin',
  'PASTE_PAYIN_ID_HERE'::UUID,  -- transaction_id
  10000,  -- amount
  400     -- trader_earning (commission)
);
*/
