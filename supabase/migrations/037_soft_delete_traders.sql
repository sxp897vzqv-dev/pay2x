-- Add soft delete columns to traders table
-- This allows "deleting" traders without breaking FK constraints

ALTER TABLE traders ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE traders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_traders_is_deleted ON traders(is_deleted) WHERE is_deleted = true;

-- Also add to merchants table for consistency
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_merchants_is_deleted ON merchants(is_deleted) WHERE is_deleted = true;

COMMENT ON COLUMN traders.is_deleted IS 'Soft delete flag - trader hidden but preserved for audit trail';
COMMENT ON COLUMN merchants.is_deleted IS 'Soft delete flag - merchant hidden but preserved for audit trail';

-- Also add to upi_pool
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_upi_pool_is_deleted ON upi_pool(is_deleted) WHERE is_deleted = true;

COMMENT ON COLUMN upi_pool.is_deleted IS 'Soft delete flag - UPI hidden but preserved for audit trail';
