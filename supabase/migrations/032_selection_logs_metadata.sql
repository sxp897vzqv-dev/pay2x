-- ============================================================================
-- Migration 032: Add metadata column to selection_logs
-- ============================================================================

-- Add metadata column if not exists
ALTER TABLE selection_logs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::JSONB;

-- Create index for querying by engine version
CREATE INDEX IF NOT EXISTS idx_selection_logs_engine_version ON selection_logs (engine_version);
