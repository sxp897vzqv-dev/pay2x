-- ============================================
-- 011: Cron Jobs for Background Processing
-- ============================================

-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage to postgres user
GRANT USAGE ON SCHEMA cron TO postgres;

-- 1. Process Payout Webhooks (every minute)
SELECT cron.schedule(
  'process-payout-webhooks',
  '* * * * *',  -- Every minute
  $$
  SELECT net.http_post(
    url := 'https://jrzyndtowwwcydgcagcr.supabase.co/functions/v1/process-payout-webhooks',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 2. Process Payin Webhooks (every minute) - if not already set up
SELECT cron.schedule(
  'process-webhook-queue',
  '* * * * *',  -- Every minute
  $$
  SELECT net.http_post(
    url := 'https://jrzyndtowwwcydgcagcr.supabase.co/functions/v1/process-webhook-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 3. Reset daily UPI stats (midnight IST = 18:30 UTC)
SELECT cron.schedule(
  'reset-daily-upi-stats',
  '30 18 * * *',  -- 00:00 IST
  $$
  UPDATE upi_pool SET
    daily_volume = 0,
    daily_count = 0,
    daily_success = 0,
    daily_failed = 0,
    updated_at = now();
  $$
);

-- 4. Reset hourly failures (every hour)
SELECT cron.schedule(
  'reset-hourly-failures',
  '0 * * * *',  -- Every hour
  $$
  UPDATE upi_pool SET
    hourly_failures = 0,
    updated_at = now()
  WHERE hourly_failures > 0;
  $$
);

-- 5. Expire pending payins (every 5 minutes)
SELECT cron.schedule(
  'expire-pending-payins',
  '*/5 * * * *',
  $$
  UPDATE payins SET
    status = 'expired',
    expired_at = now(),
    updated_at = now()
  WHERE status = 'pending'
    AND expires_at < now();
  $$
);

-- View all scheduled jobs
-- SELECT * FROM cron.job;
