-- Add UTR column to disputes (merchant provides this when raising dispute)
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS utr TEXT;

-- Index for searching by UTR
CREATE INDEX IF NOT EXISTS idx_disputes_utr ON disputes(utr) WHERE utr IS NOT NULL;
