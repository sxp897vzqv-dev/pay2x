-- TRX topup logs (for account activation and energy refills)
CREATE TABLE IF NOT EXISTS trx_topups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id UUID REFERENCES traders(id),
  address TEXT NOT NULL,
  amount DECIMAL(15,6) NOT NULL,
  tx_id TEXT,
  reason TEXT, -- 'account_activation', 'energy_refill', 'manual'
  status TEXT DEFAULT 'pending', -- 'pending', 'confirmed', 'failed'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_trx_topups_trader ON trx_topups(trader_id);
CREATE INDEX IF NOT EXISTS idx_trx_topups_address ON trx_topups(address);
CREATE INDEX IF NOT EXISTS idx_trx_topups_created ON trx_topups(created_at DESC);

-- RLS
ALTER TABLE trx_topups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage trx_topups" ON trx_topups
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Traders can view own topups" ON trx_topups
  FOR SELECT TO authenticated
  USING (trader_id = auth.uid());
