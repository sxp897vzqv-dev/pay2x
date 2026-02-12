-- 018_email_queue.sql
-- Email queue table for send-email Edge Function

-- Create email_queue table
CREATE TABLE IF NOT EXISTS email_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    to_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    template TEXT NOT NULL,
    template_data JSONB DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    attempts INT NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient queue processing
CREATE INDEX IF NOT EXISTS idx_email_queue_status_attempts 
ON email_queue(status, attempts, created_at) 
WHERE status = 'pending' AND attempts < 3;

-- Index for cleanup
CREATE INDEX IF NOT EXISTS idx_email_queue_created_at ON email_queue(created_at);

-- Enable RLS
ALTER TABLE email_queue ENABLE ROW LEVEL SECURITY;

-- Only service role can access (Edge Functions use service role)
CREATE POLICY "Service role only" ON email_queue
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Function to cleanup old emails (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_emails()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM email_queue 
    WHERE created_at < NOW() - INTERVAL '30 days'
    AND status IN ('sent', 'failed');
END;
$$;

COMMENT ON TABLE email_queue IS 'Queue for outbound emails processed by send-email Edge Function';
