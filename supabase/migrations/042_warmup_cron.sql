-- Cron job to keep Edge Functions warm (every 5 minutes)
-- Prevents cold start latency

-- Enable pg_cron if not already (usually enabled by default on Supabase)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule warmup every 5 minutes
SELECT cron.schedule(
  'warmup-functions',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://jrzyndtowwwcydgcagcr.supabase.co/functions/v1/warmup',
    headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyenluZHRvd3d3Y3lkZ2NhZ2NyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDI5ODU0OSwiZXhwIjoyMDg1ODc0NTQ5fQ.2qF6QqtZ_KK_VCuixbIzGq5so1_e3c17gmx83NfpEPo"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Also schedule USDT rate update every 5 minutes
SELECT cron.schedule(
  'update-usdt-rate',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://jrzyndtowwwcydgcagcr.supabase.co/functions/v1/update-usdt-rate',
    headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyenluZHRvd3d3Y3lkZ2NhZ2NyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDI5ODU0OSwiZXhwIjoyMDg1ODc0NTQ5fQ.2qF6QqtZ_KK_VCuixbIzGq5so1_e3c17gmx83NfpEPo"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
