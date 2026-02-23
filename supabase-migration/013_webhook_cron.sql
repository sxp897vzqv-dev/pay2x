-- ============================================
-- Webhook Processing Setup
-- ============================================

-- The webhook queue system works as follows:
-- 1. When a payin status changes to completed/failed/expired:
--    - The queue_payin_webhook() trigger queues a webhook in payin_webhook_queue
-- 2. The send-webhooks Edge Function processes the queue
-- 3. We need to call send-webhooks periodically (cron)

-- OPTION A: Use pg_cron + pg_net (if pg_net is enabled)
-- ============================================

-- Check if pg_net is available
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'pg_net is enabled - can use direct HTTP calls';
  ELSE
    RAISE NOTICE 'pg_net not enabled - use Edge Function invoke or external cron';
  END IF;
END $$;

-- OPTION B: Use Supabase Database Webhooks (simpler)
-- ============================================
-- Go to Supabase Dashboard > Database > Webhooks
-- Create a new webhook:
--   Name: process-payin-webhooks
--   Table: payin_webhook_queue
--   Events: INSERT
--   URL: https://jrzyndtowwwcydgcagcr.supabase.co/functions/v1/send-webhooks
--   Headers: Authorization: Bearer <service_role_key>

-- OPTION C: Use pg_cron to call send-webhooks via HTTP
-- ============================================
-- This requires pg_net extension. Run in SQL Editor:

/*
-- Schedule every minute
SELECT cron.schedule(
  'send-webhooks-cron',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://jrzyndtowwwcydgcagcr.supabase.co/functions/v1/send-webhooks',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);

-- Verify: SELECT * FROM cron.job;
-- Remove: SELECT cron.unschedule('send-webhooks-cron');
*/

-- OPTION D: Use Vercel Cron (external)
-- ============================================
-- Add to pay2x-api/vercel.json:
/*
{
  "crons": [
    {
      "path": "/api/cron/webhooks",
      "schedule": "* * * * *"
    }
  ]
}
*/
-- Create pay2x-api/api/cron/webhooks.ts that calls send-webhooks

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Check pending webhooks
-- SELECT id, event_type, status, attempts, created_at 
-- FROM payin_webhook_queue 
-- WHERE status = 'pending' 
-- ORDER BY created_at DESC 
-- LIMIT 10;

-- Check delivered webhooks
-- SELECT id, event_type, status, response_code, last_attempt_at 
-- FROM payin_webhook_queue 
-- WHERE status = 'delivered' 
-- ORDER BY last_attempt_at DESC 
-- LIMIT 10;

-- Manual test: Update a payin to completed
-- UPDATE payins SET status = 'completed' WHERE id = '<payin_id>';
-- Then check: SELECT * FROM payin_webhook_queue WHERE payin_id = '<payin_id>';
