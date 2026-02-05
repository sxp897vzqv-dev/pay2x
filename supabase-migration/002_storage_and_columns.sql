-- ============================================
-- 002: Storage Buckets + Missing Columns
-- ============================================

-- 1. Storage Buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('payout-proofs', 'payout-proofs', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('dispute-proofs', 'dispute-proofs', true) ON CONFLICT (id) DO NOTHING;

-- Storage policies: anyone authenticated can upload, public can read
CREATE POLICY "Authenticated users can upload payout proofs" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'payout-proofs');
CREATE POLICY "Public can read payout proofs" ON storage.objects FOR SELECT USING (bucket_id = 'payout-proofs');
CREATE POLICY "Authenticated users can upload dispute proofs" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'dispute-proofs');
CREATE POLICY "Public can read dispute proofs" ON storage.objects FOR SELECT USING (bucket_id = 'dispute-proofs');

-- 2. Missing columns on admin_logs (for review queue)
ALTER TABLE admin_logs ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE admin_logs ADD COLUMN IF NOT EXISTS review_status TEXT;
ALTER TABLE admin_logs ADD COLUMN IF NOT EXISTS review_note TEXT;
ALTER TABLE admin_logs ADD COLUMN IF NOT EXISTS reviewed_by TEXT;

-- 3. Missing columns on traders (UPI arrays as JSONB)
ALTER TABLE traders ADD COLUMN IF NOT EXISTS current_merchant_upis JSONB DEFAULT '[]'::jsonb;
ALTER TABLE traders ADD COLUMN IF NOT EXISTS corporate_merchant_upis JSONB DEFAULT '[]'::jsonb;
ALTER TABLE traders ADD COLUMN IF NOT EXISTS normal_upis JSONB DEFAULT '[]'::jsonb;
ALTER TABLE traders ADD COLUMN IF NOT EXISTS big_upis JSONB DEFAULT '[]'::jsonb;
ALTER TABLE traders ADD COLUMN IF NOT EXISTS imps_accounts JSONB DEFAULT '[]'::jsonb;
ALTER TABLE traders ADD COLUMN IF NOT EXISTS security_hold NUMERIC DEFAULT 0;
ALTER TABLE traders ADD COLUMN IF NOT EXISTS payout_commission NUMERIC DEFAULT 1;
ALTER TABLE traders ADD COLUMN IF NOT EXISTS commission_rate NUMERIC DEFAULT 4;
ALTER TABLE traders ADD COLUMN IF NOT EXISTS overall_commission NUMERIC DEFAULT 0;
ALTER TABLE traders ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'Normal';

-- 4. Missing columns on merchants
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS business_name TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS live_api_key TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS test_api_key TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS api_key TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS secret_key TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS webhook_url TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS webhook_secret TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS webhook_events JSONB DEFAULT '["payin.success","payin.failed","payout.completed"]'::jsonb;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS api_key_updated_at TIMESTAMPTZ;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS available_balance NUMERIC DEFAULT 0;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS pending_settlement NUMERIC DEFAULT 0;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS reserved_amount NUMERIC DEFAULT 0;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS payin_commission_rate NUMERIC DEFAULT 6;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS payout_commission_rate NUMERIC DEFAULT 2;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS support_email TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS support_phone TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS gst TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS notifications JSONB;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT false;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS total_orders INTEGER DEFAULT 0;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS total_volume NUMERIC DEFAULT 0;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS success_rate NUMERIC DEFAULT 0;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS dispute_count INTEGER DEFAULT 0;

-- 5. Missing columns on payins
ALTER TABLE payins ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ;
ALTER TABLE payins ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE payins ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
ALTER TABLE payins ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;
ALTER TABLE payins ADD COLUMN IF NOT EXISTS transaction_id TEXT;
ALTER TABLE payins ADD COLUMN IF NOT EXISTS upi_id TEXT;
ALTER TABLE payins ADD COLUMN IF NOT EXISTS utr TEXT;
ALTER TABLE payins ADD COLUMN IF NOT EXISTS screenshot_url TEXT;
ALTER TABLE payins ADD COLUMN IF NOT EXISTS auto_rejected BOOLEAN DEFAULT false;
ALTER TABLE payins ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE payins ADD COLUMN IF NOT EXISTS commission NUMERIC;
ALTER TABLE payins ADD COLUMN IF NOT EXISTS order_id TEXT;
ALTER TABLE payins ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'UPI';

-- 6. Missing columns on payouts
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS payout_request_id TEXT;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS payout_id TEXT;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS utr TEXT;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS proof_url TEXT;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS commission NUMERIC;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS beneficiary_name TEXT;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS payment_mode TEXT;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS upi_id TEXT;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS account_number TEXT;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS ifsc_code TEXT;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS purpose TEXT;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS failure_reason TEXT;

-- 7. Missing columns on disputes
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS trader_note TEXT;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS trader_action TEXT;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS proof_url TEXT;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS evidence_url TEXT;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS dispute_id TEXT;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS transaction_id TEXT;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS order_id TEXT;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS upi_id TEXT;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS message_count INTEGER DEFAULT 0;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS last_message_from TEXT;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS deadline TIMESTAMPTZ;

-- 8. Missing tables
CREATE TABLE IF NOT EXISTS saved_banks (
  id TEXT PRIMARY KEY,
  trader_id TEXT REFERENCES traders(id),
  type TEXT,
  upi_id TEXT,
  account_number TEXT,
  ifsc_code TEXT,
  holder_name TEXT,
  is_active BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMPTZ,
  last_modified TIMESTAMPTZ DEFAULT now(),
  added_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dispute_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id TEXT,
  "from" TEXT,
  text TEXT,
  is_decision BOOLEAN DEFAULT false,
  action TEXT,
  proof_url TEXT,
  timestamp TIMESTAMPTZ DEFAULT now(),
  read_by_trader BOOLEAN DEFAULT false,
  read_by_trader_at TIMESTAMPTZ,
  read_by_merchant BOOLEAN DEFAULT false,
  read_by_merchant_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payout_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id TEXT REFERENCES traders(id),
  amount NUMERIC,
  status TEXT DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  fully_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS merchant_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id TEXT REFERENCES merchants(id),
  type TEXT,
  amount NUMERIC,
  balance_after NUMERIC,
  description TEXT,
  reference_id TEXT,
  timestamp TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS merchant_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id TEXT REFERENCES merchants(id),
  amount NUMERIC,
  usdt_address TEXT,
  network TEXT DEFAULT 'TRC20',
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS merchant_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id TEXT REFERENCES merchants(id),
  account_number TEXT,
  ifsc_code TEXT,
  holder_name TEXT,
  bank_name TEXT,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS merchant_team (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id TEXT REFERENCES merchants(id),
  name TEXT,
  email TEXT,
  role TEXT,
  permissions JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id TEXT REFERENCES merchants(id),
  event TEXT,
  url TEXT,
  status TEXT,
  response_code INTEGER,
  payload JSONB,
  timestamp TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. RLS on new tables
ALTER TABLE saved_banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispute_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_team ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS; for now allow authenticated users full access
CREATE POLICY "Auth full access" ON saved_banks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth full access" ON dispute_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth full access" ON payout_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth full access" ON merchant_ledger FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth full access" ON merchant_settlements FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth full access" ON merchant_bank_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth full access" ON merchant_team FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth full access" ON webhook_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 10. Indexes on new tables
CREATE INDEX IF NOT EXISTS idx_saved_banks_trader ON saved_banks(trader_id);
CREATE INDEX IF NOT EXISTS idx_dispute_messages_dispute ON dispute_messages(dispute_id);
CREATE INDEX IF NOT EXISTS idx_payout_requests_trader ON payout_requests(trader_id);
CREATE INDEX IF NOT EXISTS idx_merchant_ledger_merchant ON merchant_ledger(merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_settlements_merchant ON merchant_settlements(merchant_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_merchant ON webhook_logs(merchant_id);
