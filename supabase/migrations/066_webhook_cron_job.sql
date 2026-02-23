-- 066_webhook_cron_job.sql
-- Cron job to call send-webhooks every minute
-- 
-- INSTRUCTIONS:
-- 1. Go to Supabase Dashboard > Settings > API
-- 2. Copy the "service_role" secret key
-- 3. Replace YOUR_SERVICE_ROLE_KEY below with that key
-- 4. Run this in SQL Editor

-- Enable pg_net extension (required for HTTP calls)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Enable pg_cron if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Grant usage to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Create the cron job to call send-webhooks every minute
SELECT cron.schedule(
  'send-webhooks-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://jrzyndtowwwcydgcagcr.supabase.co/functions/v1/send-webhooks',
    headers := '{"Authorization": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyenluZHRvd3d3Y3lkZ2NhZ2NyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDI5ODU0OSwiZXhwIjoyMDg1ODc0NTQ5fQ.2qF6QqtZ_KK_VCuixbIzGq5so1_e3c17gmx83NfpEPo", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);

-- Verify the job was created
SELECT * FROM cron.job WHERE jobname = 'send-webhooks-every-minute';
