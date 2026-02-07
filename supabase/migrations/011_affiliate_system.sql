-- =============================================
-- Pay2X Affiliate System v2
-- Affiliates refer TRADERS (not merchants)
-- Admin settles monthly on 2nd
-- =============================================

-- 1. Affiliates Table
CREATE TABLE affiliates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Login credentials (separate account)
  user_id UUID REFERENCES auth.users(id) UNIQUE,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  
  -- Commission settings (default, can override per trader)
  default_commission_rate DECIMAL(5,2) DEFAULT 5.00, -- 5% default
  
  -- Balances
  total_earned DECIMAL(18,2) DEFAULT 0,
  pending_settlement DECIMAL(18,2) DEFAULT 0, -- Unpaid amount
  total_settled DECIMAL(18,2) DEFAULT 0,
  
  -- Bank details for settlement
  bank_account_number TEXT,
  bank_ifsc TEXT,
  bank_account_name TEXT,
  bank_name TEXT,
  
  -- Status
  status TEXT DEFAULT 'active', -- active, suspended, inactive
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Affiliate-Trader Relationship
-- Links traders to affiliates with custom commission
CREATE TABLE affiliate_traders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID REFERENCES affiliates(id) NOT NULL,
  trader_id UUID REFERENCES traders(id) NOT NULL UNIQUE, -- One trader = one affiliate only
  
  -- Custom commission for this trader (overrides affiliate default)
  commission_rate DECIMAL(5,2) NOT NULL, -- % of trader earnings
  
  -- Stats
  total_commission_earned DECIMAL(18,2) DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(trader_id) -- Enforce one affiliate per trader
);

-- 3. Monthly Settlements (Admin pays on 2nd) - CREATE FIRST for FK reference
CREATE TABLE affiliate_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID REFERENCES affiliates(id) NOT NULL,
  
  -- Period
  settlement_month DATE NOT NULL, -- First day of month being settled
  
  -- Amount
  amount DECIMAL(18,2) NOT NULL,
  earnings_count INT NOT NULL, -- Number of transactions included
  
  -- Bank details (snapshot)
  bank_details JSONB NOT NULL,
  
  -- Status
  status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
  
  -- Processing
  processed_by UUID REFERENCES profiles(id),
  processed_at TIMESTAMPTZ,
  transaction_reference TEXT, -- UTR/NEFT reference
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(affiliate_id, settlement_month)
);

-- 4. Affiliate Earnings (per transaction)
CREATE TABLE affiliate_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID REFERENCES affiliates(id) NOT NULL,
  trader_id UUID REFERENCES traders(id) NOT NULL,
  
  -- Transaction details
  transaction_type TEXT NOT NULL, -- 'payin', 'payout'
  transaction_id UUID NOT NULL,
  transaction_amount DECIMAL(18,2) NOT NULL,
  
  -- Earnings calculation
  trader_earning DECIMAL(18,2) NOT NULL, -- What trader earned
  commission_rate DECIMAL(5,2) NOT NULL, -- Rate at time of txn
  affiliate_earning DECIMAL(18,2) NOT NULL, -- What affiliate gets
  
  -- Settlement status
  status TEXT DEFAULT 'pending', -- pending, settled
  settlement_id UUID REFERENCES affiliate_settlements(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- INDEXES
-- =============================================

CREATE INDEX idx_affiliates_email ON affiliates(email);
CREATE INDEX idx_affiliates_status ON affiliates(status);
CREATE INDEX idx_affiliates_user_id ON affiliates(user_id);

CREATE INDEX idx_affiliate_traders_affiliate ON affiliate_traders(affiliate_id);
CREATE INDEX idx_affiliate_traders_trader ON affiliate_traders(trader_id);

CREATE INDEX idx_affiliate_earnings_affiliate ON affiliate_earnings(affiliate_id);
CREATE INDEX idx_affiliate_earnings_trader ON affiliate_earnings(trader_id);
CREATE INDEX idx_affiliate_earnings_status ON affiliate_earnings(status);
CREATE INDEX idx_affiliate_earnings_created ON affiliate_earnings(created_at DESC);

CREATE INDEX idx_affiliate_settlements_affiliate ON affiliate_settlements(affiliate_id);
CREATE INDEX idx_affiliate_settlements_month ON affiliate_settlements(settlement_month);
CREATE INDEX idx_affiliate_settlements_status ON affiliate_settlements(status);

-- =============================================
-- RLS POLICIES
-- =============================================

ALTER TABLE affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_traders ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_settlements ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY admin_all_affiliates ON affiliates FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY admin_all_affiliate_traders ON affiliate_traders FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY admin_all_affiliate_earnings ON affiliate_earnings FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY admin_all_affiliate_settlements ON affiliate_settlements FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Affiliates can view their own data
CREATE POLICY affiliate_view_self ON affiliates FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY affiliate_view_own_traders ON affiliate_traders FOR SELECT
  USING (affiliate_id IN (SELECT id FROM affiliates WHERE user_id = auth.uid()));

CREATE POLICY affiliate_view_own_earnings ON affiliate_earnings FOR SELECT
  USING (affiliate_id IN (SELECT id FROM affiliates WHERE user_id = auth.uid()));

CREATE POLICY affiliate_view_own_settlements ON affiliate_settlements FOR SELECT
  USING (affiliate_id IN (SELECT id FROM affiliates WHERE user_id = auth.uid()));

-- =============================================
-- FUNCTIONS
-- =============================================

-- Credit affiliate when trader completes transaction
CREATE OR REPLACE FUNCTION credit_affiliate_on_trader_transaction(
  p_trader_id UUID,
  p_transaction_type TEXT,
  p_transaction_id UUID,
  p_transaction_amount DECIMAL,
  p_trader_earning DECIMAL -- What trader earned from this txn
)
RETURNS JSONB AS $$
DECLARE
  v_affiliate_trader affiliate_traders%ROWTYPE;
  v_affiliate affiliates%ROWTYPE;
  v_affiliate_earning DECIMAL;
BEGIN
  -- Find if trader has an affiliate
  SELECT * INTO v_affiliate_trader 
  FROM affiliate_traders 
  WHERE trader_id = p_trader_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('credited', false, 'reason', 'no_affiliate');
  END IF;
  
  -- Get affiliate
  SELECT * INTO v_affiliate 
  FROM affiliates 
  WHERE id = v_affiliate_trader.affiliate_id AND status = 'active';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('credited', false, 'reason', 'affiliate_inactive');
  END IF;
  
  -- Calculate affiliate earning (% of trader earning)
  v_affiliate_earning := p_trader_earning * (v_affiliate_trader.commission_rate / 100);
  
  -- Create earning record
  INSERT INTO affiliate_earnings (
    affiliate_id, trader_id,
    transaction_type, transaction_id, transaction_amount,
    trader_earning, commission_rate, affiliate_earning,
    status
  ) VALUES (
    v_affiliate.id, p_trader_id,
    p_transaction_type, p_transaction_id, p_transaction_amount,
    p_trader_earning, v_affiliate_trader.commission_rate, v_affiliate_earning,
    'pending'
  );
  
  -- Update affiliate pending balance
  UPDATE affiliates SET
    total_earned = total_earned + v_affiliate_earning,
    pending_settlement = pending_settlement + v_affiliate_earning,
    updated_at = NOW()
  WHERE id = v_affiliate.id;
  
  -- Update affiliate_traders stats
  UPDATE affiliate_traders SET
    total_commission_earned = total_commission_earned + v_affiliate_earning
  WHERE id = v_affiliate_trader.id;
  
  RETURN jsonb_build_object(
    'credited', true,
    'affiliate_id', v_affiliate.id,
    'affiliate_earning', v_affiliate_earning,
    'commission_rate', v_affiliate_trader.commission_rate
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Generate monthly settlement for an affiliate
CREATE OR REPLACE FUNCTION generate_affiliate_settlement(
  p_affiliate_id UUID,
  p_month DATE -- First day of month to settle (e.g., '2026-02-01')
)
RETURNS JSONB AS $$
DECLARE
  v_affiliate affiliates%ROWTYPE;
  v_total_amount DECIMAL;
  v_earnings_count INT;
  v_settlement_id UUID;
  v_next_month DATE;
BEGIN
  SELECT * INTO v_affiliate FROM affiliates WHERE id = p_affiliate_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'affiliate_not_found');
  END IF;
  
  -- Check if settlement already exists for this month
  IF EXISTS (SELECT 1 FROM affiliate_settlements WHERE affiliate_id = p_affiliate_id AND settlement_month = p_month) THEN
    RETURN jsonb_build_object('success', false, 'error', 'settlement_already_exists');
  END IF;
  
  v_next_month := p_month + INTERVAL '1 month';
  
  -- Calculate total pending earnings for the month
  SELECT COALESCE(SUM(affiliate_earning), 0), COUNT(*)
  INTO v_total_amount, v_earnings_count
  FROM affiliate_earnings
  WHERE affiliate_id = p_affiliate_id
    AND status = 'pending'
    AND created_at >= p_month
    AND created_at < v_next_month;
  
  IF v_total_amount = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_pending_earnings');
  END IF;
  
  -- Create settlement
  INSERT INTO affiliate_settlements (
    affiliate_id, settlement_month, amount, earnings_count,
    bank_details, status
  ) VALUES (
    p_affiliate_id, p_month, v_total_amount, v_earnings_count,
    jsonb_build_object(
      'account_number', v_affiliate.bank_account_number,
      'ifsc', v_affiliate.bank_ifsc,
      'account_name', v_affiliate.bank_account_name,
      'bank_name', v_affiliate.bank_name
    ),
    'pending'
  ) RETURNING id INTO v_settlement_id;
  
  -- Mark earnings as settled
  UPDATE affiliate_earnings SET
    status = 'settled',
    settlement_id = v_settlement_id
  WHERE affiliate_id = p_affiliate_id
    AND status = 'pending'
    AND created_at >= p_month
    AND created_at < v_next_month;
  
  RETURN jsonb_build_object(
    'success', true,
    'settlement_id', v_settlement_id,
    'amount', v_total_amount,
    'earnings_count', v_earnings_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Mark settlement as completed
CREATE OR REPLACE FUNCTION complete_affiliate_settlement(
  p_settlement_id UUID,
  p_admin_id UUID,
  p_transaction_reference TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_settlement affiliate_settlements%ROWTYPE;
BEGIN
  SELECT * INTO v_settlement FROM affiliate_settlements WHERE id = p_settlement_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'settlement_not_found');
  END IF;
  
  IF v_settlement.status = 'completed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_completed');
  END IF;
  
  -- Mark as completed
  UPDATE affiliate_settlements SET
    status = 'completed',
    processed_by = p_admin_id,
    processed_at = NOW(),
    transaction_reference = p_transaction_reference,
    notes = p_notes
  WHERE id = p_settlement_id;
  
  -- Update affiliate balances
  UPDATE affiliates SET
    pending_settlement = pending_settlement - v_settlement.amount,
    total_settled = total_settled + v_settlement.amount,
    updated_at = NOW()
  WHERE id = v_settlement.affiliate_id;
  
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- VIEWS
-- =============================================

-- Affiliate dashboard view
CREATE OR REPLACE VIEW affiliate_dashboard_view AS
SELECT 
  a.id,
  a.name,
  a.email,
  a.phone,
  a.default_commission_rate,
  a.total_earned,
  a.pending_settlement,
  a.total_settled,
  a.status,
  a.created_at,
  -- Trader counts
  (SELECT COUNT(*) FROM affiliate_traders WHERE affiliate_id = a.id) as total_traders,
  -- Recent earnings
  (SELECT COALESCE(SUM(affiliate_earning), 0) FROM affiliate_earnings 
   WHERE affiliate_id = a.id AND created_at > NOW() - INTERVAL '30 days') as earnings_30d,
  (SELECT COALESCE(SUM(affiliate_earning), 0) FROM affiliate_earnings 
   WHERE affiliate_id = a.id AND created_at > NOW() - INTERVAL '7 days') as earnings_7d,
  -- This month
  (SELECT COALESCE(SUM(affiliate_earning), 0) FROM affiliate_earnings 
   WHERE affiliate_id = a.id AND created_at >= DATE_TRUNC('month', NOW())) as earnings_this_month
FROM affiliates a;

-- Affiliate's trader view (for affiliate dashboard)
CREATE OR REPLACE VIEW affiliate_trader_view AS
SELECT 
  at.id,
  at.affiliate_id,
  at.trader_id,
  at.commission_rate,
  at.total_commission_earned,
  at.created_at,
  t.name as trader_name,
  t.email as trader_email,
  CASE WHEN t.is_active THEN 'active' ELSE 'inactive' END as trader_status,
  -- Trader stats
  (SELECT COUNT(*) FROM affiliate_earnings WHERE trader_id = at.trader_id) as total_transactions,
  (SELECT COALESCE(SUM(affiliate_earning), 0) FROM affiliate_earnings 
   WHERE trader_id = at.trader_id AND created_at > NOW() - INTERVAL '30 days') as earnings_30d
FROM affiliate_traders at
JOIN traders t ON t.id = at.trader_id;

-- =============================================
-- ADD affiliate_id TO TRADERS (optional, for easy lookup)
-- =============================================

-- Add column to traders for quick reference
ALTER TABLE traders ADD COLUMN IF NOT EXISTS affiliate_id UUID REFERENCES affiliates(id);

-- =============================================
-- ADD 'affiliate' role to profiles enum if needed
-- =============================================

-- If role is enum, you may need:
-- ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'affiliate';

-- Or if role is TEXT, add check:
-- ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
-- ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
--   CHECK (role IN ('admin', 'trader', 'merchant', 'affiliate'));
