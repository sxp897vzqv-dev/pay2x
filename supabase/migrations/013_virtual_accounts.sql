-- =====================================================
-- VIRTUAL ACCOUNTS SYSTEM
-- Enables merchants to generate unique virtual bank accounts
-- for customers, with auto-sweep to merchant balance
-- =====================================================

-- Virtual Account Status
CREATE TYPE virtual_account_status AS ENUM ('active', 'expired', 'closed');

-- =====================================================
-- VIRTUAL ACCOUNTS TABLE
-- =====================================================
CREATE TABLE virtual_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id),
    
    -- Virtual Account Details (provided by bank partner)
    va_number VARCHAR(20) NOT NULL UNIQUE,        -- The virtual account number
    ifsc_code VARCHAR(11) NOT NULL,               -- Bank IFSC
    bank_name VARCHAR(100) NOT NULL,              -- Bank name
    account_holder_name VARCHAR(100) NOT NULL,    -- Name on account
    
    -- Customer Reference
    customer_id VARCHAR(100),                     -- Merchant's customer ID
    customer_name VARCHAR(200),                   -- Customer name
    customer_email VARCHAR(200),                  -- Customer email
    customer_phone VARCHAR(20),                   -- Customer phone
    
    -- Configuration
    expected_amount DECIMAL(12,2),                -- Expected amount (null = any)
    min_amount DECIMAL(12,2) DEFAULT 1,           -- Min accepted
    max_amount DECIMAL(12,2) DEFAULT 10000000,    -- Max accepted (1 crore)
    
    -- Expiry
    expires_at TIMESTAMPTZ,                       -- Optional expiry
    status virtual_account_status DEFAULT 'active',
    
    -- Stats
    total_collected DECIMAL(12,2) DEFAULT 0,
    transaction_count INT DEFAULT 0,
    last_transaction_at TIMESTAMPTZ,
    
    -- Auto-sweep config
    auto_sweep BOOLEAN DEFAULT true,              -- Auto credit to merchant balance
    sweep_immediately BOOLEAN DEFAULT true,       -- Sweep on each txn (vs daily batch)
    
    -- Metadata
    metadata JSONB DEFAULT '{}',                  -- Custom fields
    webhook_url TEXT,                             -- Custom webhook for this VA
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_va_merchant ON virtual_accounts(merchant_id);
CREATE INDEX idx_va_number ON virtual_accounts(va_number);
CREATE INDEX idx_va_customer ON virtual_accounts(merchant_id, customer_id);
CREATE INDEX idx_va_status ON virtual_accounts(status) WHERE status = 'active';
CREATE INDEX idx_va_expires ON virtual_accounts(expires_at) WHERE expires_at IS NOT NULL;

-- =====================================================
-- VA TRANSACTIONS TABLE
-- Records every deposit to a virtual account
-- =====================================================
CREATE TABLE va_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    virtual_account_id UUID NOT NULL REFERENCES virtual_accounts(id),
    merchant_id UUID NOT NULL REFERENCES merchants(id),
    
    -- Transaction details
    amount DECIMAL(12,2) NOT NULL,
    utr VARCHAR(50),                              -- Bank UTR reference
    sender_name VARCHAR(200),                     -- Sender's name
    sender_account VARCHAR(30),                   -- Sender's account (masked)
    sender_ifsc VARCHAR(11),                      -- Sender's IFSC
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending',         -- pending, credited, failed
    credited_at TIMESTAMPTZ,                      -- When credited to merchant
    
    -- Fees
    fee_amount DECIMAL(12,2) DEFAULT 0,           -- Platform fee
    net_amount DECIMAL(12,2),                     -- Amount after fee
    
    -- Bank notification
    bank_reference VARCHAR(100),                  -- Bank's reference
    bank_notified_at TIMESTAMPTZ,                 -- When bank notified us
    raw_payload JSONB,                            -- Raw bank webhook payload
    
    -- Webhook to merchant
    webhook_sent BOOLEAN DEFAULT false,
    webhook_sent_at TIMESTAMPTZ,
    webhook_response TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_va_txn_va ON va_transactions(virtual_account_id);
CREATE INDEX idx_va_txn_merchant ON va_transactions(merchant_id);
CREATE INDEX idx_va_txn_utr ON va_transactions(utr);
CREATE INDEX idx_va_txn_status ON va_transactions(status);
CREATE INDEX idx_va_txn_pending ON va_transactions(status) WHERE status = 'pending';

-- =====================================================
-- VA BANK PARTNERS CONFIG
-- Stores API credentials for bank partners
-- =====================================================
CREATE TABLE va_bank_partners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,                   -- Partner name (e.g., "ICICI", "YES Bank")
    code VARCHAR(20) NOT NULL UNIQUE,             -- Short code
    
    -- API Config
    api_base_url TEXT NOT NULL,
    api_key_encrypted TEXT,                       -- Encrypted API key
    api_secret_encrypted TEXT,                    -- Encrypted API secret
    
    -- VA Settings
    ifsc_code VARCHAR(11) NOT NULL,               -- Fixed IFSC for this partner
    bank_name VARCHAR(100) NOT NULL,
    va_prefix VARCHAR(10),                        -- Prefix for VA numbers
    va_length INT DEFAULT 16,                     -- Length of VA number
    
    -- Webhook
    webhook_secret TEXT,                          -- For verifying bank callbacks
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    priority INT DEFAULT 1,                       -- Higher = preferred
    
    -- Limits
    min_amount DECIMAL(12,2) DEFAULT 1,
    max_amount DECIMAL(12,2) DEFAULT 10000000,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- RLS POLICIES
-- =====================================================
ALTER TABLE virtual_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE va_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE va_bank_partners ENABLE ROW LEVEL SECURITY;

-- Merchants can see their own VAs
CREATE POLICY "Merchants view own VAs" ON virtual_accounts
    FOR SELECT USING (
        merchant_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid())
    );

-- Merchants can see their own VA transactions
CREATE POLICY "Merchants view own VA txns" ON va_transactions
    FOR SELECT USING (
        merchant_id IN (SELECT id FROM merchants WHERE profile_id = auth.uid())
    );

-- Admins can see all
CREATE POLICY "Admins view all VAs" ON virtual_accounts
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admins view all VA txns" ON va_transactions
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admins manage bank partners" ON va_bank_partners
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Service role bypass
CREATE POLICY "Service role VAs" ON virtual_accounts FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role VA txns" ON va_transactions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role bank partners" ON va_bank_partners FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Generate unique VA number
CREATE OR REPLACE FUNCTION generate_va_number(prefix TEXT DEFAULT 'VA')
RETURNS TEXT AS $$
DECLARE
    new_number TEXT;
    exists_check BOOLEAN;
BEGIN
    LOOP
        -- Generate: PREFIX + 12 random digits
        new_number := prefix || LPAD(FLOOR(RANDOM() * 1000000000000)::TEXT, 12, '0');
        
        -- Check uniqueness
        SELECT EXISTS(SELECT 1 FROM virtual_accounts WHERE va_number = new_number) INTO exists_check;
        
        EXIT WHEN NOT exists_check;
    END LOOP;
    
    RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Credit merchant on VA transaction
CREATE OR REPLACE FUNCTION credit_merchant_on_va_transaction(
    p_transaction_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_txn va_transactions%ROWTYPE;
    v_va virtual_accounts%ROWTYPE;
    v_merchant merchants%ROWTYPE;
    v_fee DECIMAL(12,2);
    v_net DECIMAL(12,2);
BEGIN
    -- Get transaction
    SELECT * INTO v_txn FROM va_transactions WHERE id = p_transaction_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Transaction not found');
    END IF;
    
    IF v_txn.status = 'credited' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Already credited');
    END IF;
    
    -- Get VA and merchant
    SELECT * INTO v_va FROM virtual_accounts WHERE id = v_txn.virtual_account_id;
    SELECT * INTO v_merchant FROM merchants WHERE id = v_txn.merchant_id;
    
    -- Calculate fee (use merchant's payin_rate)
    v_fee := v_txn.amount * COALESCE(v_merchant.payin_rate, 0.02);
    v_net := v_txn.amount - v_fee;
    
    -- Update transaction
    UPDATE va_transactions SET
        status = 'credited',
        fee_amount = v_fee,
        net_amount = v_net,
        credited_at = NOW()
    WHERE id = p_transaction_id;
    
    -- Credit merchant balance
    UPDATE merchants SET
        available_balance = COALESCE(available_balance, 0) + v_net,
        updated_at = NOW()
    WHERE id = v_merchant.id;
    
    -- Update VA stats
    UPDATE virtual_accounts SET
        total_collected = COALESCE(total_collected, 0) + v_txn.amount,
        transaction_count = COALESCE(transaction_count, 0) + 1,
        last_transaction_at = NOW(),
        updated_at = NOW()
    WHERE id = v_va.id;
    
    -- Log to platform earnings
    INSERT INTO platform_earnings (
        type, reference_id, transaction_amount, merchant_fee, trader_fee, platform_profit
    ) VALUES (
        'va_collection', p_transaction_id, v_txn.amount, v_fee, 0, v_fee
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'amount', v_txn.amount,
        'fee', v_fee,
        'net', v_net,
        'merchant_id', v_merchant.id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Expire old virtual accounts
CREATE OR REPLACE FUNCTION expire_virtual_accounts()
RETURNS INT AS $$
DECLARE
    expired_count INT;
BEGIN
    UPDATE virtual_accounts 
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'active' 
    AND expires_at IS NOT NULL 
    AND expires_at < NOW();
    
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- WEBHOOK QUEUE FOR VA NOTIFICATIONS
-- =====================================================
CREATE TABLE va_webhook_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES va_transactions(id),
    merchant_id UUID NOT NULL REFERENCES merchants(id),
    webhook_url TEXT NOT NULL,
    payload JSONB NOT NULL,
    
    attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 6,
    next_attempt_at TIMESTAMPTZ DEFAULT NOW(),
    last_attempt_at TIMESTAMPTZ,
    last_error TEXT,
    
    status VARCHAR(20) DEFAULT 'pending', -- pending, sent, failed
    sent_at TIMESTAMPTZ,
    response_status INT,
    response_body TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_va_webhook_pending ON va_webhook_queue(status, next_attempt_at) 
    WHERE status = 'pending';

-- RLS
ALTER TABLE va_webhook_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role VA webhooks" ON va_webhook_queue FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- SAMPLE BANK PARTNER (for testing)
-- =====================================================
INSERT INTO va_bank_partners (name, code, api_base_url, ifsc_code, bank_name, va_prefix, is_active)
VALUES (
    'Test Bank', 
    'TEST', 
    'https://api.testbank.example.com',
    'TEST0000001',
    'Test Bank Ltd',
    'TB',
    true
) ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- VIEWS
-- =====================================================

-- VA summary for admin dashboard
CREATE OR REPLACE VIEW va_summary AS
SELECT 
    COUNT(*) as total_vas,
    COUNT(*) FILTER (WHERE status = 'active') as active_vas,
    SUM(total_collected) as total_collected,
    SUM(transaction_count) as total_transactions,
    COUNT(DISTINCT merchant_id) as merchants_using_va
FROM virtual_accounts;

-- Daily VA collections
CREATE OR REPLACE VIEW va_daily_collections AS
SELECT 
    DATE(created_at) as date,
    COUNT(*) as transaction_count,
    SUM(amount) as total_amount,
    SUM(fee_amount) as total_fees,
    SUM(net_amount) as total_net
FROM va_transactions
WHERE status = 'credited'
GROUP BY DATE(created_at)
ORDER BY date DESC;
