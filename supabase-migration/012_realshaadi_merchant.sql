-- ============================================
-- RealShaadi Merchant Setup
-- Configure webhook URL for payment notifications
-- ============================================

-- Update webhook URL for RealShaadi merchant
-- The API key was already created, just need webhook config
UPDATE merchants 
SET 
  webhook_url = 'https://realshaadi.com/api/webhooks/pay2x',
  webhook_secret = 'whsec_33c73ec32a7be2f6fcc3fd90428320f4b355a76ae922b170',
  updated_at = now()
WHERE live_api_key = 'live_realshaadi_94e74d722f3f084b0f79be005d240047';

-- If merchant doesn't exist, create it
INSERT INTO merchants (
  business_name,
  email,
  live_api_key,
  test_api_key,
  webhook_url,
  webhook_secret,
  payin_commission_rate,
  payout_commission_rate,
  is_active,
  created_at
) 
SELECT 
  'RealShaadi',
  'contact@realshaadi.com',
  'live_realshaadi_94e74d722f3f084b0f79be005d240047',
  'test_realshaadi_94e74d722f3f084b0f79be005d240047',
  'https://realshaadi.com/api/webhooks/pay2x',
  'whsec_33c73ec32a7be2f6fcc3fd90428320f4b355a76ae922b170',
  2.0,  -- 2% payin commission
  1.5,  -- 1.5% payout commission
  true,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM merchants 
  WHERE live_api_key = 'live_realshaadi_94e74d722f3f084b0f79be005d240047'
);

-- Verify the setup
SELECT 
  id,
  business_name,
  webhook_url,
  CASE WHEN webhook_secret IS NOT NULL THEN '✅ Set' ELSE '❌ Missing' END as webhook_secret_status,
  live_api_key,
  is_active
FROM merchants 
WHERE business_name ILIKE '%realshaadi%' 
   OR live_api_key LIKE '%realshaadi%';
