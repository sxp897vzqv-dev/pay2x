-- Performance Indexes
-- Note: Removed CONCURRENTLY - can't run in Supabase Dashboard (transaction block)
-- These indexes will briefly lock tables during creation (fast for small tables)

-- Payins - most queried table
CREATE INDEX IF NOT EXISTS idx_payins_status_created 
  ON payins(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payins_merchant_status 
  ON payins(merchant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payins_trader_pending 
  ON payins(trader_id, status) WHERE status IN ('pending', 'assigned');

CREATE INDEX IF NOT EXISTS idx_payins_assigned_upi 
  ON payins(assigned_upi) WHERE assigned_upi IS NOT NULL;

-- Payouts
CREATE INDEX IF NOT EXISTS idx_payouts_status_created 
  ON payouts(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payouts_trader_pending 
  ON payouts(trader_id, status) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_payouts_merchant 
  ON payouts(merchant_id, created_at DESC);

-- UPI Pool - critical for payin engine
CREATE INDEX IF NOT EXISTS idx_upi_pool_active_trader 
  ON upi_pool(trader_id, status) WHERE status = 'active' AND (is_deleted IS NULL OR is_deleted = FALSE);

CREATE INDEX IF NOT EXISTS idx_upi_pool_scoring 
  ON upi_pool(status, success_rate DESC, daily_volume) WHERE status = 'active';

-- Disputes
CREATE INDEX IF NOT EXISTS idx_disputes_pending 
  ON disputes(status, created_at DESC) WHERE status NOT IN ('admin_approved', 'admin_rejected');

CREATE INDEX IF NOT EXISTS idx_disputes_trader 
  ON disputes(trader_id, status);

-- Webhook queues
CREATE INDEX IF NOT EXISTS idx_webhook_queue_pending 
  ON webhook_queue(created_at) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_payout_webhook_pending 
  ON payout_webhook_queue(created_at) WHERE status = 'pending';

-- Traders/Merchants active
CREATE INDEX IF NOT EXISTS idx_traders_active 
  ON traders(is_active) WHERE is_active = TRUE AND (is_deleted IS NULL OR is_deleted = FALSE);

CREATE INDEX IF NOT EXISTS idx_merchants_active 
  ON merchants(is_active) WHERE is_active = TRUE AND (is_deleted IS NULL OR is_deleted = FALSE);

-- Selection logs (for analytics)
CREATE INDEX IF NOT EXISTS idx_selection_logs_created 
  ON selection_logs(created_at DESC);

-- Saved banks
CREATE INDEX IF NOT EXISTS idx_saved_banks_trader 
  ON saved_banks(trader_id, is_active) WHERE is_deleted IS NULL OR is_deleted = FALSE;
