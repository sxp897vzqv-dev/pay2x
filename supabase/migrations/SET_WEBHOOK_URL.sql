-- Run this in Supabase Dashboard SQL Editor
-- Sets webhook URL for merchant with API key: live_1771152712640_w502o

-- First find the merchant
SELECT id, name, webhook_url FROM merchants WHERE live_api_key = 'live_1771152712640_w502o';

-- Then update the webhook URL (replace URL with actual endpoint)
UPDATE merchants 
SET 
  webhook_url = 'https://realshaadi.com/api/pay2x-webhook',
  webhook_secret = 'whsec_realshaadi_' || substr(md5(random()::text), 1, 24),
  updated_at = NOW()
WHERE live_api_key = 'live_1771152712640_w502o'
RETURNING id, name, webhook_url, webhook_secret;
