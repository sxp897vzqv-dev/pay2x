-- Create RealShaadi Merchant
-- Run this after running all previous migrations

-- Generate a secure API key
-- Format: live_<merchant_id_prefix>_<random>
DO $$
DECLARE
  v_merchant_id UUID;
  v_profile_id UUID;
  v_api_key TEXT;
  v_webhook_secret TEXT;
BEGIN
  -- Generate IDs
  v_merchant_id := gen_random_uuid();
  v_profile_id := gen_random_uuid();
  v_api_key := 'live_realshaadi_' || encode(gen_random_bytes(16), 'hex');
  v_webhook_secret := 'whsec_' || encode(gen_random_bytes(24), 'hex');

  -- Create profile for merchant owner
  INSERT INTO profiles (id, display_name, role, email, is_active)
  VALUES (
    v_profile_id,
    'RealShaadi Admin',
    'merchant',
    'admin@realshaadi.com',
    true
  )
  ON CONFLICT (id) DO NOTHING;

  -- Create merchant
  INSERT INTO merchants (
    id,
    user_id,
    name,
    business_name,
    email,
    phone,
    is_active,
    live_api_key,
    webhook_url,
    webhook_secret,
    plan,
    payin_rate,
    payout_rate,
    available_balance,
    pending_balance,
    created_at
  )
  VALUES (
    v_merchant_id,
    v_profile_id,
    'RealShaadi',
    'RealShaadi Matrimony Pvt Ltd',
    'payments@realshaadi.com',
    '+919876543210',
    true,
    v_api_key,
    'https://realshaadi.com/api/payments/webhook',
    v_webhook_secret,
    'business',
    6.0,  -- 6% payin rate
    2.0,  -- 2% payout rate
    0,
    0,
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Output the credentials
  RAISE NOTICE 'RealShaadi Merchant Created!';
  RAISE NOTICE 'Merchant ID: %', v_merchant_id;
  RAISE NOTICE 'API Key: %', v_api_key;
  RAISE NOTICE 'Webhook Secret: %', v_webhook_secret;
  RAISE NOTICE '';
  RAISE NOTICE 'Add these to RealShaadi .env.local:';
  RAISE NOTICE 'PAY2X_API_KEY=%', v_api_key;
  RAISE NOTICE 'PAY2X_WEBHOOK_SECRET=%', v_webhook_secret;
  
END $$;

-- Query to get the created merchant details
SELECT 
  id as merchant_id,
  name,
  live_api_key,
  webhook_secret,
  webhook_url,
  plan
FROM merchants 
WHERE name = 'RealShaadi'
ORDER BY created_at DESC
LIMIT 1;
