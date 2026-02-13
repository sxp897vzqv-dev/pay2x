-- Auto-update USDT rate from live exchanges
-- Adds tracking columns and cron job

-- Add rate tracking columns to tatum_config
ALTER TABLE tatum_config ADD COLUMN IF NOT EXISTS rate_updated_at TIMESTAMPTZ;
ALTER TABLE tatum_config ADD COLUMN IF NOT EXISTS rate_source TEXT;

-- Cron job to update rate every 5 minutes
SELECT cron.schedule(
  'update-usdt-rate',
  '*/5 * * * *',  -- Every 5 minutes
  $$
  SELECT net.http_post(
    url := 'https://jrzyndtowwwcydgcagcr.supabase.co/functions/v1/update-usdt-rate',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- View scheduled jobs
-- SELECT * FROM cron.job WHERE jobname = 'update-usdt-rate';
