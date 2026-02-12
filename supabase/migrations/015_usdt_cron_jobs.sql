-- =====================================================
-- USDT SYSTEM CRON JOBS
-- Uses pg_cron + pg_net to call Edge Functions
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- =====================================================
-- CRON JOB: Process USDT Sweeps (Every 5 minutes)
-- Moves USDT from trader addresses to admin wallet
-- =====================================================
SELECT cron.schedule(
    'process-usdt-sweeps',
    '*/5 * * * *',  -- Every 5 minutes
    $$
    SELECT net.http_post(
        url := 'https://jrzyndtowwwcydgcagcr.supabase.co/functions/v1/process-usdt-sweeps',
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyenluZHRvd3d3Y3lkZ2NhZ2NyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczODc1Njg1NSwiZXhwIjoyMDU0MzMyODU1fQ.V3BKGN8bZ8Y9jL8fYqvCqc4bQKvNvkPAzFIYbIPHvqc"}'::jsonb,
        body := '{}'::jsonb
    ) AS request_id;
    $$
);

-- =====================================================
-- CRON JOB: Poll for Missed Deposits (Every 2 minutes)
-- Backup polling in case webhook fails
-- =====================================================
SELECT cron.schedule(
    'poll-usdt-deposits',
    '*/2 * * * *',  -- Every 2 minutes
    $$
    SELECT net.http_post(
        url := 'https://jrzyndtowwwcydgcagcr.supabase.co/functions/v1/poll-usdt-deposits',
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyenluZHRvd3d3Y3lkZ2NhZ2NyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczODc1Njg1NSwiZXhwIjoyMDU0MzMyODU1fQ.V3BKGN8bZ8Y9jL8fYqvCqc4bQKvNvkPAzFIYbIPHvqc"}'::jsonb,
        body := '{}'::jsonb
    ) AS request_id;
    $$
);

-- =====================================================
-- View scheduled jobs
-- =====================================================
-- SELECT * FROM cron.job;

-- =====================================================
-- To unschedule (if needed):
-- SELECT cron.unschedule('process-usdt-sweeps');
-- SELECT cron.unschedule('poll-usdt-deposits');
-- =====================================================
