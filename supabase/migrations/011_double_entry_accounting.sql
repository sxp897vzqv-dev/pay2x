-- ============================================================================
-- PAY2X DOUBLE-ENTRY ACCOUNTING SYSTEM
-- ============================================================================
-- Implements full double-entry bookkeeping with:
-- - Chart of Accounts (system + entity accounts)
-- - Journal Entries with balanced debit/credit lines
-- - Automatic account creation for merchants/traders
-- - Balance validation (debits must equal credits)
-- - Audit trail and reporting views
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- ENUM TYPES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE account_type AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');
CREATE TYPE entry_direction AS ENUM ('debit', 'credit');
CREATE TYPE journal_status AS ENUM ('draft', 'posted', 'voided');

-- ─────────────────────────────────────────────────────────────────────────────
-- CHART OF ACCOUNTS
-- ─────────────────────────────────────────────────────────────────────────────
-- Hierarchical account structure supporting both system accounts and 
-- auto-generated entity accounts (one per merchant/trader)

CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Account identification
  code VARCHAR(30) UNIQUE NOT NULL,        -- '1100', 'M-abc123', 'T-xyz789'
  name TEXT NOT NULL,
  description TEXT,
  
  -- Classification
  account_type account_type NOT NULL,
  parent_code VARCHAR(30) REFERENCES accounts(code), -- For hierarchy
  
  -- Entity linkage (null for system accounts)
  entity_type TEXT CHECK (entity_type IN ('merchant', 'trader', 'platform')),
  entity_id UUID,
  
  -- Flags
  is_system BOOLEAN DEFAULT false,         -- System accounts can't be deleted
  is_active BOOLEAN DEFAULT true,
  
  -- Denormalized balance (updated via triggers)
  current_balance DECIMAL(18,2) DEFAULT 0,
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Constraints
  CONSTRAINT valid_entity CHECK (
    (entity_type IS NULL AND entity_id IS NULL) OR
    (entity_type IS NOT NULL AND entity_id IS NOT NULL)
  )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- JOURNAL ENTRIES (Transaction Headers)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Entry identification
  entry_number SERIAL,                     -- Auto-incrementing for reference
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Reference to source transaction
  reference_type TEXT NOT NULL,            -- 'payin', 'payout', 'dispute', 'settlement', 'adjustment', 'opening'
  reference_id UUID,                       -- Links to payins.id, payouts.id, etc.
  
  -- Description
  description TEXT NOT NULL,
  notes TEXT,
  
  -- Status
  status journal_status DEFAULT 'posted',
  
  -- Totals (for quick validation)
  total_amount DECIMAL(18,2) NOT NULL,     -- Sum of one side (debits = credits)
  line_count INTEGER NOT NULL DEFAULT 0,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Audit
  created_by UUID,                         -- Admin user for manual entries
  created_at TIMESTAMPTZ DEFAULT now(),
  posted_at TIMESTAMPTZ DEFAULT now(),
  voided_at TIMESTAMPTZ,
  voided_by UUID,
  void_reason TEXT
);

-- ─────────────────────────────────────────────────────────────────────────────
-- JOURNAL LINES (Individual Debit/Credit Entries)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE journal_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Parent entry
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  
  -- Account affected
  account_id UUID NOT NULL REFERENCES accounts(id),
  
  -- Entry details
  entry_type entry_direction NOT NULL,
  amount DECIMAL(18,2) NOT NULL CHECK (amount > 0),
  
  -- Optional line description
  description TEXT,
  
  -- Denormalized for faster queries
  account_code VARCHAR(30) NOT NULL,
  
  -- Running balance at this point (for account statements)
  balance_after DECIMAL(18,2),
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT now(),
  
  -- Index for account ledger queries
  CONSTRAINT fk_account_code FOREIGN KEY (account_code) REFERENCES accounts(code)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- SYSTEM ACCOUNTS (Chart of Accounts Setup)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO accounts (code, name, description, account_type, is_system) VALUES
-- ASSETS (1xxx) - What platform owns/is owed
('1000', 'Assets', 'All asset accounts', 'asset', true),
('1100', 'Trader Receivables', 'Aggregate of amounts owed by traders', 'asset', true),
('1200', 'Platform Cash', 'Cash held by platform', 'asset', true),
('1300', 'Merchant Receivables', 'Amounts owed by merchants (rare)', 'asset', true),

-- LIABILITIES (2xxx) - What platform owes
('2000', 'Liabilities', 'All liability accounts', 'liability', true),
('2100', 'Merchant Payables', 'Aggregate balance owed to merchants', 'liability', true),
('2200', 'Trader Payables', 'Commissions owed to traders', 'liability', true),
('2300', 'Reserves', 'Held reserves for disputes/chargebacks', 'liability', true),

-- EQUITY (3xxx) - Net worth
('3000', 'Equity', 'All equity accounts', 'equity', true),
('3100', 'Retained Earnings', 'Accumulated profits', 'equity', true),
('3200', 'Opening Balances', 'Opening balance equity', 'equity', true),

-- REVENUE (4xxx) - Income
('4000', 'Revenue', 'All revenue accounts', 'revenue', true),
('4100', 'Payin Commission Revenue', 'Commission earned on payins', 'revenue', true),
('4200', 'Payout Commission Revenue', 'Commission earned on payouts', 'revenue', true),
('4300', 'Other Revenue', 'Miscellaneous income', 'revenue', true),

-- EXPENSES (5xxx) - Costs
('5000', 'Expenses', 'All expense accounts', 'expense', true),
('5100', 'Trader Payin Commission', 'Commission paid to traders on payins', 'expense', true),
('5200', 'Trader Payout Commission', 'Commission paid to traders on payouts', 'expense', true),
('5300', 'Refunds & Chargebacks', 'Losses from disputes', 'expense', true),
('5400', 'Other Expenses', 'Miscellaneous expenses', 'expense', true);

-- Set parent codes for hierarchy
UPDATE accounts SET parent_code = '1000' WHERE code IN ('1100', '1200', '1300');
UPDATE accounts SET parent_code = '2000' WHERE code IN ('2100', '2200', '2300');
UPDATE accounts SET parent_code = '3000' WHERE code IN ('3100', '3200');
UPDATE accounts SET parent_code = '4000' WHERE code IN ('4100', '4200', '4300');
UPDATE accounts SET parent_code = '5000' WHERE code IN ('5100', '5200', '5300', '5400');

-- ─────────────────────────────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX idx_accounts_entity ON accounts(entity_type, entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX idx_accounts_type ON accounts(account_type);
CREATE INDEX idx_accounts_parent ON accounts(parent_code) WHERE parent_code IS NOT NULL;

CREATE INDEX idx_journal_entries_date ON journal_entries(entry_date DESC);
CREATE INDEX idx_journal_entries_reference ON journal_entries(reference_type, reference_id);
CREATE INDEX idx_journal_entries_status ON journal_entries(status);
CREATE INDEX idx_journal_entries_created ON journal_entries(created_at DESC);

CREATE INDEX idx_journal_lines_entry ON journal_lines(journal_entry_id);
CREATE INDEX idx_journal_lines_account ON journal_lines(account_id);
CREATE INDEX idx_journal_lines_code ON journal_lines(account_code);

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCTION: Create Entity Account
-- ─────────────────────────────────────────────────────────────────────────────
-- Automatically creates accounts for new merchants/traders

CREATE OR REPLACE FUNCTION create_entity_account(
  p_entity_type TEXT,
  p_entity_id UUID,
  p_entity_name TEXT
) RETURNS UUID AS $$
DECLARE
  v_account_id UUID;
  v_code TEXT;
  v_parent_code TEXT;
  v_account_type account_type;
BEGIN
  -- Generate account code
  IF p_entity_type = 'merchant' THEN
    v_code := 'M-' || SUBSTRING(p_entity_id::TEXT, 1, 8);
    v_parent_code := '2100'; -- Merchant Payables
    v_account_type := 'liability';
  ELSIF p_entity_type = 'trader' THEN
    v_code := 'T-' || SUBSTRING(p_entity_id::TEXT, 1, 8);
    v_parent_code := '1100'; -- Trader Receivables
    v_account_type := 'asset';
  ELSE
    RAISE EXCEPTION 'Invalid entity type: %', p_entity_type;
  END IF;
  
  -- Check if already exists
  SELECT id INTO v_account_id FROM accounts WHERE entity_type = p_entity_type AND entity_id = p_entity_id;
  
  IF v_account_id IS NOT NULL THEN
    RETURN v_account_id;
  END IF;
  
  -- Create account
  INSERT INTO accounts (code, name, description, account_type, parent_code, entity_type, entity_id)
  VALUES (
    v_code,
    p_entity_name || ' (' || INITCAP(p_entity_type) || ')',
    p_entity_type || ' account for ' || p_entity_name,
    v_account_type,
    v_parent_code,
    p_entity_type,
    p_entity_id
  )
  RETURNING id INTO v_account_id;
  
  RETURN v_account_id;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCTION: Get or Create Entity Account
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_entity_account(
  p_entity_type TEXT,
  p_entity_id UUID
) RETURNS UUID AS $$
DECLARE
  v_account_id UUID;
  v_entity_name TEXT;
BEGIN
  -- Check if exists
  SELECT id INTO v_account_id 
  FROM accounts 
  WHERE entity_type = p_entity_type AND entity_id = p_entity_id;
  
  IF v_account_id IS NOT NULL THEN
    RETURN v_account_id;
  END IF;
  
  -- Get entity name
  IF p_entity_type = 'merchant' THEN
    SELECT COALESCE(business_name, name, 'Merchant') INTO v_entity_name FROM merchants WHERE id = p_entity_id;
  ELSIF p_entity_type = 'trader' THEN
    SELECT COALESCE(name, 'Trader') INTO v_entity_name FROM traders WHERE id = p_entity_id;
  END IF;
  
  -- Create and return
  RETURN create_entity_account(p_entity_type, p_entity_id, COALESCE(v_entity_name, 'Unknown'));
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCTION: Post Journal Entry (with validation)
-- ─────────────────────────────────────────────────────────────────────────────
-- Creates a balanced journal entry with multiple lines

CREATE OR REPLACE FUNCTION post_journal_entry(
  p_reference_type TEXT,
  p_reference_id UUID,
  p_description TEXT,
  p_lines JSONB,  -- Array of {account_code, entry_type, amount, description}
  p_metadata JSONB DEFAULT '{}',
  p_created_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_entry_id UUID;
  v_total_debits DECIMAL(18,2) := 0;
  v_total_credits DECIMAL(18,2) := 0;
  v_line JSONB;
  v_account_id UUID;
  v_balance_after DECIMAL(18,2);
  v_line_count INTEGER := 0;
BEGIN
  -- Calculate totals and validate
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    IF (v_line->>'entry_type') = 'debit' THEN
      v_total_debits := v_total_debits + (v_line->>'amount')::DECIMAL;
    ELSE
      v_total_credits := v_total_credits + (v_line->>'amount')::DECIMAL;
    END IF;
    v_line_count := v_line_count + 1;
  END LOOP;
  
  -- Validate balance
  IF v_total_debits != v_total_credits THEN
    RAISE EXCEPTION 'Journal entry not balanced: debits=% credits=%', v_total_debits, v_total_credits;
  END IF;
  
  IF v_total_debits = 0 THEN
    RAISE EXCEPTION 'Journal entry cannot be zero';
  END IF;
  
  -- Create journal entry header
  INSERT INTO journal_entries (reference_type, reference_id, description, total_amount, line_count, metadata, created_by)
  VALUES (p_reference_type, p_reference_id, p_description, v_total_debits, v_line_count, p_metadata, p_created_by)
  RETURNING id INTO v_entry_id;
  
  -- Create journal lines and update account balances
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    -- Get account ID
    SELECT id INTO v_account_id FROM accounts WHERE code = (v_line->>'account_code');
    
    IF v_account_id IS NULL THEN
      RAISE EXCEPTION 'Account not found: %', (v_line->>'account_code');
    END IF;
    
    -- Update account balance
    -- Assets & Expenses: Debit increases, Credit decreases
    -- Liabilities, Equity, Revenue: Credit increases, Debit decreases
    UPDATE accounts 
    SET current_balance = current_balance + 
      CASE 
        WHEN account_type IN ('asset', 'expense') THEN
          CASE WHEN (v_line->>'entry_type') = 'debit' THEN (v_line->>'amount')::DECIMAL ELSE -(v_line->>'amount')::DECIMAL END
        ELSE
          CASE WHEN (v_line->>'entry_type') = 'credit' THEN (v_line->>'amount')::DECIMAL ELSE -(v_line->>'amount')::DECIMAL END
      END,
      updated_at = now()
    WHERE id = v_account_id
    RETURNING current_balance INTO v_balance_after;
    
    -- Insert journal line
    INSERT INTO journal_lines (journal_entry_id, account_id, account_code, entry_type, amount, description, balance_after)
    VALUES (
      v_entry_id,
      v_account_id,
      (v_line->>'account_code'),
      (v_line->>'entry_type')::entry_direction,
      (v_line->>'amount')::DECIMAL,
      (v_line->>'description'),
      v_balance_after
    );
  END LOOP;
  
  RETURN v_entry_id;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCTION: Record Payin in Ledger
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION record_payin_ledger(
  p_payin_id UUID,
  p_merchant_id UUID,
  p_trader_id UUID,
  p_amount DECIMAL,
  p_merchant_rate DECIMAL,  -- e.g., 0.06 for 6%
  p_trader_rate DECIMAL     -- e.g., 0.04 for 4%
) RETURNS UUID AS $$
DECLARE
  v_merchant_account TEXT;
  v_trader_account TEXT;
  v_merchant_credit DECIMAL;
  v_platform_profit DECIMAL;
  v_trader_commission DECIMAL;
  v_lines JSONB;
BEGIN
  -- Get or create entity accounts
  PERFORM get_entity_account('merchant', p_merchant_id);
  PERFORM get_entity_account('trader', p_trader_id);
  
  -- Get account codes
  SELECT code INTO v_merchant_account FROM accounts WHERE entity_type = 'merchant' AND entity_id = p_merchant_id;
  SELECT code INTO v_trader_account FROM accounts WHERE entity_type = 'trader' AND entity_id = p_trader_id;
  
  -- Calculate amounts
  v_merchant_credit := p_amount * (1 - p_merchant_rate);  -- Amount after merchant fee
  v_trader_commission := p_amount * p_trader_rate;         -- Trader earns
  v_platform_profit := (p_amount * p_merchant_rate) - v_trader_commission;  -- Platform keeps
  
  -- Build journal lines
  v_lines := jsonb_build_array(
    -- Trader owes merchant's share to platform
    jsonb_build_object('account_code', v_trader_account, 'entry_type', 'debit', 'amount', v_merchant_credit, 'description', 'Merchant share receivable'),
    jsonb_build_object('account_code', v_merchant_account, 'entry_type', 'credit', 'amount', v_merchant_credit, 'description', 'Payin credit'),
    
    -- Platform profit
    jsonb_build_object('account_code', v_trader_account, 'entry_type', 'debit', 'amount', v_platform_profit, 'description', 'Platform fee receivable'),
    jsonb_build_object('account_code', '4100', 'entry_type', 'credit', 'amount', v_platform_profit, 'description', 'Payin commission revenue'),
    
    -- Trader commission
    jsonb_build_object('account_code', '5100', 'entry_type', 'debit', 'amount', v_trader_commission, 'description', 'Trader commission expense'),
    jsonb_build_object('account_code', v_trader_account, 'entry_type', 'credit', 'amount', v_trader_commission, 'description', 'Commission earned')
  );
  
  -- Post the entry
  RETURN post_journal_entry(
    'payin',
    p_payin_id,
    'Payin completed: ₹' || p_amount::TEXT,
    v_lines,
    jsonb_build_object('amount', p_amount, 'merchant_rate', p_merchant_rate, 'trader_rate', p_trader_rate)
  );
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCTION: Record Payout in Ledger
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION record_payout_ledger(
  p_payout_id UUID,
  p_merchant_id UUID,
  p_trader_id UUID,
  p_amount DECIMAL,
  p_merchant_rate DECIMAL,  -- e.g., 0.02 for 2%
  p_trader_rate DECIMAL     -- e.g., 0.01 for 1%
) RETURNS UUID AS $$
DECLARE
  v_merchant_account TEXT;
  v_trader_account TEXT;
  v_merchant_debit DECIMAL;
  v_platform_profit DECIMAL;
  v_trader_commission DECIMAL;
  v_lines JSONB;
BEGIN
  -- Get account codes
  SELECT code INTO v_merchant_account FROM accounts WHERE entity_type = 'merchant' AND entity_id = p_merchant_id;
  SELECT code INTO v_trader_account FROM accounts WHERE entity_type = 'trader' AND entity_id = p_trader_id;
  
  -- Calculate amounts
  v_merchant_debit := p_amount + (p_amount * p_merchant_rate);  -- Amount + fee
  v_trader_commission := p_amount * p_trader_rate;
  v_platform_profit := (p_amount * p_merchant_rate) - v_trader_commission;
  
  -- Build journal lines
  v_lines := jsonb_build_array(
    -- Merchant pays amount + fee
    jsonb_build_object('account_code', v_merchant_account, 'entry_type', 'debit', 'amount', v_merchant_debit, 'description', 'Payout debit'),
    jsonb_build_object('account_code', v_trader_account, 'entry_type', 'credit', 'amount', p_amount, 'description', 'Payout to process'),
    jsonb_build_object('account_code', '4200', 'entry_type', 'credit', 'amount', v_platform_profit, 'description', 'Payout commission revenue'),
    
    -- Trader commission
    jsonb_build_object('account_code', '5200', 'entry_type', 'debit', 'amount', v_trader_commission, 'description', 'Trader payout commission'),
    jsonb_build_object('account_code', v_trader_account, 'entry_type', 'credit', 'amount', v_trader_commission, 'description', 'Commission earned')
  );
  
  -- Post the entry
  RETURN post_journal_entry(
    'payout',
    p_payout_id,
    'Payout processed: ₹' || p_amount::TEXT,
    v_lines,
    jsonb_build_object('amount', p_amount, 'merchant_rate', p_merchant_rate, 'trader_rate', p_trader_rate)
  );
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCTION: Record Manual Adjustment
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION record_adjustment_ledger(
  p_entity_type TEXT,
  p_entity_id UUID,
  p_amount DECIMAL,
  p_is_credit BOOLEAN,
  p_reason TEXT,
  p_admin_id UUID
) RETURNS UUID AS $$
DECLARE
  v_entity_account TEXT;
  v_lines JSONB;
BEGIN
  -- Get entity account code
  SELECT code INTO v_entity_account FROM accounts WHERE entity_type = p_entity_type AND entity_id = p_entity_id;
  
  IF v_entity_account IS NULL THEN
    PERFORM get_entity_account(p_entity_type, p_entity_id);
    SELECT code INTO v_entity_account FROM accounts WHERE entity_type = p_entity_type AND entity_id = p_entity_id;
  END IF;
  
  -- Build lines based on credit/debit
  IF p_is_credit THEN
    -- Credit to entity (platform expense)
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', '5400', 'entry_type', 'debit', 'amount', p_amount, 'description', 'Adjustment expense'),
      jsonb_build_object('account_code', v_entity_account, 'entry_type', 'credit', 'amount', p_amount, 'description', p_reason)
    );
  ELSE
    -- Debit from entity (platform revenue/recovery)
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', v_entity_account, 'entry_type', 'debit', 'amount', p_amount, 'description', p_reason),
      jsonb_build_object('account_code', '4300', 'entry_type', 'credit', 'amount', p_amount, 'description', 'Adjustment recovery')
    );
  END IF;
  
  RETURN post_journal_entry(
    'adjustment',
    NULL,
    'Manual adjustment: ' || p_reason,
    v_lines,
    jsonb_build_object('entity_type', p_entity_type, 'entity_id', p_entity_id, 'is_credit', p_is_credit),
    p_admin_id
  );
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- VIEWS
-- ─────────────────────────────────────────────────────────────────────────────

-- Account balances with hierarchy
CREATE OR REPLACE VIEW v_account_balances AS
SELECT 
  a.id,
  a.code,
  a.name,
  a.account_type,
  a.parent_code,
  a.entity_type,
  a.entity_id,
  a.current_balance,
  a.is_system,
  CASE 
    WHEN a.entity_type = 'merchant' THEN m.business_name
    WHEN a.entity_type = 'trader' THEN t.name
    ELSE NULL
  END as entity_name
FROM accounts a
LEFT JOIN merchants m ON a.entity_type = 'merchant' AND a.entity_id = m.id
LEFT JOIN traders t ON a.entity_type = 'trader' AND a.entity_id = t.id
WHERE a.is_active = true
ORDER BY a.code;

-- Entity ledger view (all transactions for an entity)
CREATE OR REPLACE VIEW v_entity_ledger AS
SELECT 
  jl.id,
  je.entry_date,
  je.entry_number,
  jl.account_code,
  a.entity_type,
  a.entity_id,
  a.name as account_name,
  jl.entry_type,
  jl.amount,
  jl.balance_after,
  jl.description as line_description,
  je.description as entry_description,
  je.reference_type,
  je.reference_id,
  je.status,
  je.created_at
FROM journal_lines jl
JOIN journal_entries je ON jl.journal_entry_id = je.id
JOIN accounts a ON jl.account_id = a.id
WHERE je.status = 'posted'
ORDER BY je.created_at DESC, jl.id;

-- Daily summary view
CREATE OR REPLACE VIEW v_daily_summary AS
SELECT 
  je.entry_date,
  je.reference_type,
  COUNT(*) as entry_count,
  SUM(je.total_amount) as total_volume,
  SUM(CASE WHEN jl.account_code = '4100' AND jl.entry_type = 'credit' THEN jl.amount ELSE 0 END) as payin_revenue,
  SUM(CASE WHEN jl.account_code = '4200' AND jl.entry_type = 'credit' THEN jl.amount ELSE 0 END) as payout_revenue,
  SUM(CASE WHEN jl.account_code LIKE '51%' AND jl.entry_type = 'debit' THEN jl.amount ELSE 0 END) as trader_commissions
FROM journal_entries je
JOIN journal_lines jl ON je.id = jl.journal_entry_id
WHERE je.status = 'posted'
GROUP BY je.entry_date, je.reference_type
ORDER BY je.entry_date DESC;

-- Trial Balance
CREATE OR REPLACE VIEW v_trial_balance AS
SELECT 
  a.code,
  a.name,
  a.account_type,
  CASE WHEN a.account_type IN ('asset', 'expense') AND a.current_balance > 0 THEN a.current_balance
       WHEN a.account_type IN ('liability', 'equity', 'revenue') AND a.current_balance < 0 THEN ABS(a.current_balance)
       ELSE 0 END as debit_balance,
  CASE WHEN a.account_type IN ('liability', 'equity', 'revenue') AND a.current_balance > 0 THEN a.current_balance
       WHEN a.account_type IN ('asset', 'expense') AND a.current_balance < 0 THEN ABS(a.current_balance)
       ELSE 0 END as credit_balance
FROM accounts a
WHERE a.is_active = true AND (a.current_balance != 0 OR a.is_system = true)
ORDER BY a.code;

-- Profit & Loss Summary
CREATE OR REPLACE VIEW v_profit_loss AS
SELECT 
  'Revenue' as category,
  a.code,
  a.name,
  a.current_balance as amount
FROM accounts a
WHERE a.account_type = 'revenue' AND a.current_balance != 0
UNION ALL
SELECT 
  'Expenses' as category,
  a.code,
  a.name,
  a.current_balance as amount
FROM accounts a
WHERE a.account_type = 'expense' AND a.current_balance != 0
ORDER BY category, code;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS POLICIES
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;

-- Admin can see all
CREATE POLICY accounts_admin ON accounts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY journal_entries_admin ON journal_entries FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY journal_lines_admin ON journal_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Merchants can see their own account transactions
CREATE POLICY accounts_merchant ON accounts FOR SELECT TO authenticated
  USING (
    entity_type = 'merchant' AND 
    entity_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid())
  );

-- Traders can see their own account transactions
CREATE POLICY accounts_trader ON accounts FOR SELECT TO authenticated
  USING (
    entity_type = 'trader' AND 
    entity_id IN (SELECT id FROM traders WHERE profile_id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- TRIGGERS: Auto-create accounts for new merchants/traders
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trigger_create_merchant_account()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM create_entity_account('merchant', NEW.id, COALESCE(NEW.business_name, NEW.name, 'Merchant'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trigger_create_trader_account()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM create_entity_account('trader', NEW.id, COALESCE(NEW.name, 'Trader'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_merchant_created
  AFTER INSERT ON merchants
  FOR EACH ROW
  EXECUTE FUNCTION trigger_create_merchant_account();

CREATE TRIGGER on_trader_created
  AFTER INSERT ON traders
  FOR EACH ROW
  EXECUTE FUNCTION trigger_create_trader_account();

-- ─────────────────────────────────────────────────────────────────────────────
-- COMMENTS
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE accounts IS 'Chart of Accounts - both system accounts and entity-specific accounts';
COMMENT ON TABLE journal_entries IS 'Journal entry headers - each represents a balanced transaction';
COMMENT ON TABLE journal_lines IS 'Individual debit/credit lines within journal entries';

COMMENT ON FUNCTION post_journal_entry IS 'Creates a balanced journal entry with automatic validation';
COMMENT ON FUNCTION record_payin_ledger IS 'Records a completed payin with all accounting entries';
COMMENT ON FUNCTION record_payout_ledger IS 'Records a completed payout with all accounting entries';
COMMENT ON FUNCTION record_adjustment_ledger IS 'Records a manual balance adjustment by admin';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
