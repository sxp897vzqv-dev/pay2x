-- Add missing columns to merchant_settlements for approve/reject flow
-- 2026-02-16

ALTER TABLE merchant_settlements 
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Add index for filtering by status
CREATE INDEX IF NOT EXISTS idx_merchant_settlements_status ON merchant_settlements(status);
CREATE INDEX IF NOT EXISTS idx_merchant_settlements_merchant ON merchant_settlements(merchant_id);
