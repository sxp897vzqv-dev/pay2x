-- =============================================
-- Pay2X Full Platform Seed Data
-- Realistic test data for development/demo
-- =============================================
-- Run AFTER all migrations (009-011)
-- =============================================

-- Disable triggers temporarily for faster inserts
SET session_replication_role = 'replica';

-- =============================================
-- 1. PROFILES (Users in auth.users referenced here)
-- =============================================
-- Admin profile
INSERT INTO profiles (id, email, role, display_name, created_at) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'admin@pay2x.io', 'admin', 'Super Admin', NOW() - INTERVAL '6 months')
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- 2. AFFILIATES
-- =============================================
INSERT INTO affiliates (id, email, name, phone, default_commission_rate, status, bank_account_number, bank_ifsc, bank_account_name, bank_name, total_earned, pending_settlement, total_settled, created_at) VALUES
  ('af000001-0000-0000-0000-000000000001', 'rahul.sharma@gmail.com', 'Rahul Sharma', '9876543210', 10.00, 'active', '1234567890123456', 'HDFC0001234', 'Rahul Sharma', 'HDFC Bank', 45000.00, 12500.00, 32500.00, NOW() - INTERVAL '4 months'),
  ('af000002-0000-0000-0000-000000000002', 'priya.patel@gmail.com', 'Priya Patel', '9876543211', 8.00, 'active', '9876543210987654', 'ICIC0002345', 'Priya Patel', 'ICICI Bank', 28000.00, 8000.00, 20000.00, NOW() - INTERVAL '3 months'),
  ('af000003-0000-0000-0000-000000000003', 'amit.verma@gmail.com', 'Amit Verma', '9876543212', 12.00, 'suspended', '5678901234567890', 'SBIN0003456', 'Amit Verma', 'State Bank of India', 5000.00, 5000.00, 0.00, NOW() - INTERVAL '2 months')
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- 3. TRADERS
-- =============================================
INSERT INTO traders (id, email, name, phone, balance, security_hold, payin_commission, payout_commission, is_active, telegram, telegram_group_link, usdt_deposit_address, affiliate_id, created_at, updated_at) VALUES
  -- Traders with affiliates
  ('11000001-0000-0000-0000-000000000001', 'vikram.singh@trader.com', 'Vikram Singh', '9111111111', 250000.00, 50000.00, 4.00, 1.00, true, '@vikram_trader', 'https://t.me/vikram_group', 'TRX1111111111111111111111111111111', 'af000001-0000-0000-0000-000000000001', NOW() - INTERVAL '4 months', NOW()),
  ('11000002-0000-0000-0000-000000000002', 'neha.gupta@trader.com', 'Neha Gupta', '9222222222', 180000.00, 30000.00, 4.50, 1.00, true, '@neha_trade', 'https://t.me/neha_group', 'TRX2222222222222222222222222222222', 'af000001-0000-0000-0000-000000000001', NOW() - INTERVAL '3 months', NOW()),
  ('11000003-0000-0000-0000-000000000003', 'arjun.reddy@trader.com', 'Arjun Reddy', '9333333333', 320000.00, 80000.00, 3.50, 0.80, true, '@arjun_pay', 'https://t.me/arjun_group', 'TRX3333333333333333333333333333333', 'af000002-0000-0000-0000-000000000002', NOW() - INTERVAL '3 months', NOW()),
  -- Traders without affiliates
  ('11000004-0000-0000-0000-000000000004', 'deepak.kumar@trader.com', 'Deepak Kumar', '9444444444', 450000.00, 100000.00, 4.00, 1.00, true, '@deepak_upi', 'https://t.me/deepak_group', 'TRX4444444444444444444444444444444', NULL, NOW() - INTERVAL '5 months', NOW()),
  ('11000005-0000-0000-0000-000000000005', 'sneha.joshi@trader.com', 'Sneha Joshi', '9555555555', 95000.00, 20000.00, 5.00, 1.20, true, '@sneha_p2p', NULL, 'TRX5555555555555555555555555555555', NULL, NOW() - INTERVAL '2 months', NOW()),
  ('11000006-0000-0000-0000-000000000006', 'mohit.agarwal@trader.com', 'Mohit Agarwal', '9666666666', 15000.00, 5000.00, 4.00, 1.00, false, '@mohit_inactive', NULL, NULL, 'af000003-0000-0000-0000-000000000003', NOW() - INTERVAL '2 months', NOW())
ON CONFLICT (id) DO NOTHING;

-- Link traders to affiliates
INSERT INTO affiliate_traders (id, affiliate_id, trader_id, commission_rate, total_commission_earned, created_at) VALUES
  ('a1000001-0000-0000-0000-000000000001', 'af000001-0000-0000-0000-000000000001', '11000001-0000-0000-0000-000000000001', 10.00, 25000.00, NOW() - INTERVAL '4 months'),
  ('a1000002-0000-0000-0000-000000000002', 'af000001-0000-0000-0000-000000000001', '11000002-0000-0000-0000-000000000002', 8.00, 12000.00, NOW() - INTERVAL '3 months'),
  ('a1000003-0000-0000-0000-000000000003', 'af000002-0000-0000-0000-000000000002', '11000003-0000-0000-0000-000000000003', 8.00, 18000.00, NOW() - INTERVAL '3 months'),
  ('a1000004-0000-0000-0000-000000000004', 'af000003-0000-0000-0000-000000000003', '11000006-0000-0000-0000-000000000006', 12.00, 2000.00, NOW() - INTERVAL '2 months')
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- 4. MERCHANTS
-- =============================================
INSERT INTO merchants (id, email, name, business_name, phone, balance, payin_commission, payout_commission, is_active, webhook_url, webhook_secret, live_api_key, created_at, updated_at) VALUES
  ('22000001-0000-0000-0000-000000000001', 'finance@realshaadi.com', 'RealShaadi Admin', 'RealShaadi Premium Matrimony', '9000000001', 850000.00, 6.00, 2.00, true, 'https://realshaadi.com/api/webhooks/pay2x', 'whsec_realshaadi_secret_123', 'pk_live_realshaadi_1234567890abcdef', NOW() - INTERVAL '5 months', NOW()),
  ('22000002-0000-0000-0000-000000000002', 'payments@quickmart.in', 'QuickMart Payments', 'QuickMart E-commerce', '9000000002', 420000.00, 5.50, 1.80, true, 'https://quickmart.in/webhooks/payment', 'whsec_quickmart_secret_456', 'pk_live_quickmart_abcdef1234567890', NOW() - INTERVAL '4 months', NOW()),
  ('22000003-0000-0000-0000-000000000003', 'billing@streamflix.io', 'StreamFlix Billing', 'StreamFlix OTT Platform', '9000000003', 180000.00, 7.00, 2.50, true, 'https://api.streamflix.io/hooks/payment', 'whsec_streamflix_secret_789', 'pk_live_streamflix_xyz123abc456def', NOW() - INTERVAL '3 months', NOW()),
  ('22000004-0000-0000-0000-000000000004', 'accounts@testmerchant.dev', 'Test Merchant', 'Development Testing Co', '9000000004', 50000.00, 6.00, 2.00, false, 'https://localhost:3000/webhook', 'whsec_test_secret', 'pk_live_testmerchant_devonly123456', NOW() - INTERVAL '1 month', NOW())
ON CONFLICT (id) DO NOTHING;

-- Update additional columns if they exist (from migration 010)
DO $$
BEGIN
  UPDATE merchants SET 
    available_balance = balance * 0.88,
    pending_balance = balance * 0.12,
    payin_rate = payin_commission,
    payout_rate = payout_commission
  WHERE id IN ('22000001-0000-0000-0000-000000000001', '22000002-0000-0000-0000-000000000002', '22000003-0000-0000-0000-000000000003', '22000004-0000-0000-0000-000000000004');
EXCEPTION WHEN undefined_column THEN
  -- Columns don't exist yet, skip
  NULL;
END $$;

-- =============================================
-- 5. UPI POOL
-- =============================================
INSERT INTO upi_pool (id, upi_id, holder_name, trader_id, daily_limit, status, created_at) VALUES
  -- Vikram's UPIs
  ('33000001-0000-0000-0000-000000000001', 'vikram.singh@okaxis', 'Vikram Singh', '11000001-0000-0000-0000-000000000001', 500000, 'active', NOW() - INTERVAL '4 months'),
  ('33000002-0000-0000-0000-000000000002', 'vikram1234@ybl', 'Vikram Singh', '11000001-0000-0000-0000-000000000001', 300000, 'active', NOW() - INTERVAL '3 months'),
  -- Neha's UPIs
  ('33000003-0000-0000-0000-000000000003', 'neha.gupta@okicici', 'Neha Gupta', '11000002-0000-0000-0000-000000000002', 400000, 'active', NOW() - INTERVAL '3 months'),
  ('33000004-0000-0000-0000-000000000004', 'nehag@paytm', 'Neha Gupta', '11000002-0000-0000-0000-000000000002', 200000, 'active', NOW() - INTERVAL '2 months'),
  -- Arjun's UPIs
  ('33000005-0000-0000-0000-000000000005', 'arjun.reddy@okhdfcbank', 'Arjun Reddy', '11000003-0000-0000-0000-000000000003', 600000, 'active', NOW() - INTERVAL '3 months'),
  ('33000006-0000-0000-0000-000000000006', 'arjunr@upi', 'Arjun Reddy', '11000003-0000-0000-0000-000000000003', 250000, 'active', NOW() - INTERVAL '2 months'),
  -- Deepak's UPIs (top performer)
  ('33000007-0000-0000-0000-000000000007', 'deepak.k@oksbi', 'Deepak Kumar', '11000004-0000-0000-0000-000000000004', 800000, 'active', NOW() - INTERVAL '5 months'),
  ('33000008-0000-0000-0000-000000000008', 'deepak9444@ibl', 'Deepak Kumar', '11000004-0000-0000-0000-000000000004', 400000, 'active', NOW() - INTERVAL '4 months'),
  -- Sneha's UPIs
  ('33000009-0000-0000-0000-000000000009', 'sneha.joshi@okaxis', 'Sneha Joshi', '11000005-0000-0000-0000-000000000005', 300000, 'active', NOW() - INTERVAL '2 months'),
  -- Inactive UPI
  ('33000010-0000-0000-0000-000000000010', 'mohit.old@ybl', 'Mohit Agarwal', '11000006-0000-0000-0000-000000000006', 200000, 'inactive', NOW() - INTERVAL '2 months')
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- 6. PAYINS (30 transactions over past 2 months)
-- =============================================
INSERT INTO payins (id, merchant_id, trader_id, upi_id, amount, status, order_id, utr, created_at, requested_at, completed_at) VALUES
  -- Today's payins
  ('44000001-0000-0000-0000-000000000001', '22000001-0000-0000-0000-000000000001', '11000004-0000-0000-0000-000000000004', 'deepak.k@oksbi', 2999.00, 'pending', 'RS-2026020801', NULL, NOW() - INTERVAL '10 minutes', NOW() - INTERVAL '10 minutes', NULL),
  ('44000002-0000-0000-0000-000000000002', '22000002-0000-0000-0000-000000000002', '11000001-0000-0000-0000-000000000001', 'vikram.singh@okaxis', 1499.00, 'pending', 'QM-2026020801', NULL, NOW() - INTERVAL '5 minutes', NOW() - INTERVAL '5 minutes', NULL),
  ('44000003-0000-0000-0000-000000000003', '22000003-0000-0000-0000-000000000003', '11000003-0000-0000-0000-000000000003', 'arjun.reddy@okhdfcbank', 499.00, 'completed', 'SF-2026020801', '412345678901', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour'),
  
  -- Yesterday's payins
  ('44000004-0000-0000-0000-000000000004', '22000001-0000-0000-0000-000000000001', '11000001-0000-0000-0000-000000000001', 'vikram1234@ybl', 4999.00, 'completed', 'RS-2026020701', '412345678902', NOW() - INTERVAL '1 day' - INTERVAL '3 hours', NOW() - INTERVAL '1 day' - INTERVAL '3 hours', NOW() - INTERVAL '1 day'),
  ('44000005-0000-0000-0000-000000000005', '22000002-0000-0000-0000-000000000002', '11000002-0000-0000-0000-000000000002', 'neha.gupta@okicici', 2199.00, 'completed', 'QM-2026020701', '412345678903', NOW() - INTERVAL '1 day' - INTERVAL '5 hours', NOW() - INTERVAL '1 day' - INTERVAL '5 hours', NOW() - INTERVAL '1 day'),
  ('44000006-0000-0000-0000-000000000006', '22000001-0000-0000-0000-000000000001', '11000004-0000-0000-0000-000000000004', 'deepak9444@ibl', 2999.00, 'rejected', 'RS-2026020702', NULL, NOW() - INTERVAL '1 day' - INTERVAL '8 hours', NOW() - INTERVAL '1 day' - INTERVAL '8 hours', NULL),
  
  -- This week
  ('44000007-0000-0000-0000-000000000007', '22000003-0000-0000-0000-000000000003', '11000003-0000-0000-0000-000000000003', 'arjunr@upi', 999.00, 'completed', 'SF-2026020601', '412345678904', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'),
  ('44000008-0000-0000-0000-000000000008', '22000001-0000-0000-0000-000000000001', '11000005-0000-0000-0000-000000000005', 'sneha.joshi@okaxis', 2999.00, 'completed', 'RS-2026020501', '412345678905', NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days'),
  ('44000009-0000-0000-0000-000000000009', '22000002-0000-0000-0000-000000000002', '11000001-0000-0000-0000-000000000001', 'vikram.singh@okaxis', 3499.00, 'completed', 'QM-2026020401', '412345678906', NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days'),
  ('44000010-0000-0000-0000-000000000010', '22000001-0000-0000-0000-000000000001', '11000002-0000-0000-0000-000000000002', 'nehag@paytm', 4999.00, 'completed', 'RS-2026020301', '412345678907', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days'),
  
  -- Last week
  ('44000011-0000-0000-0000-000000000011', '22000003-0000-0000-0000-000000000003', '11000004-0000-0000-0000-000000000004', 'deepak.k@oksbi', 199.00, 'completed', 'SF-2026013101', '412345678908', NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days'),
  ('44000012-0000-0000-0000-000000000012', '22000002-0000-0000-0000-000000000002', '11000003-0000-0000-0000-000000000003', 'arjun.reddy@okhdfcbank', 5999.00, 'completed', 'QM-2026013001', '412345678909', NOW() - INTERVAL '9 days', NOW() - INTERVAL '9 days', NOW() - INTERVAL '9 days'),
  ('44000013-0000-0000-0000-000000000013', '22000001-0000-0000-0000-000000000001', '11000001-0000-0000-0000-000000000001', 'vikram1234@ybl', 2999.00, 'rejected', 'RS-2026012901', NULL, NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days', NULL),
  ('44000014-0000-0000-0000-000000000014', '22000001-0000-0000-0000-000000000001', '11000004-0000-0000-0000-000000000004', 'deepak9444@ibl', 4999.00, 'completed', 'RS-2026012801', '412345678910', NOW() - INTERVAL '11 days', NOW() - INTERVAL '11 days', NOW() - INTERVAL '11 days'),
  
  -- 2 weeks ago
  ('44000015-0000-0000-0000-000000000015', '22000002-0000-0000-0000-000000000002', '11000002-0000-0000-0000-000000000002', 'neha.gupta@okicici', 1299.00, 'completed', 'QM-2026012501', '412345678911', NOW() - INTERVAL '14 days', NOW() - INTERVAL '14 days', NOW() - INTERVAL '14 days'),
  ('44000016-0000-0000-0000-000000000016', '22000003-0000-0000-0000-000000000003', '11000005-0000-0000-0000-000000000005', 'sneha.joshi@okaxis', 499.00, 'completed', 'SF-2026012401', '412345678912', NOW() - INTERVAL '15 days', NOW() - INTERVAL '15 days', NOW() - INTERVAL '15 days'),
  ('44000017-0000-0000-0000-000000000017', '22000001-0000-0000-0000-000000000001', '11000003-0000-0000-0000-000000000003', 'arjunr@upi', 2999.00, 'completed', 'RS-2026012301', '412345678913', NOW() - INTERVAL '16 days', NOW() - INTERVAL '16 days', NOW() - INTERVAL '16 days'),
  
  -- 3-4 weeks ago
  ('44000018-0000-0000-0000-000000000018', '22000002-0000-0000-0000-000000000002', '11000001-0000-0000-0000-000000000001', 'vikram.singh@okaxis', 7999.00, 'completed', 'QM-2026011801', '412345678914', NOW() - INTERVAL '21 days', NOW() - INTERVAL '21 days', NOW() - INTERVAL '21 days'),
  ('44000019-0000-0000-0000-000000000019', '22000001-0000-0000-0000-000000000001', '11000004-0000-0000-0000-000000000004', 'deepak.k@oksbi', 4999.00, 'completed', 'RS-2026011501', '412345678915', NOW() - INTERVAL '24 days', NOW() - INTERVAL '24 days', NOW() - INTERVAL '24 days'),
  ('44000020-0000-0000-0000-000000000020', '22000003-0000-0000-0000-000000000003', '11000002-0000-0000-0000-000000000002', 'nehag@paytm', 999.00, 'completed', 'SF-2026011201', '412345678916', NOW() - INTERVAL '27 days', NOW() - INTERVAL '27 days', NOW() - INTERVAL '27 days'),
  
  -- Last month (January)
  ('44000021-0000-0000-0000-000000000021', '22000001-0000-0000-0000-000000000001', '11000001-0000-0000-0000-000000000001', 'vikram1234@ybl', 2999.00, 'completed', 'RS-2026010801', '412345678917', NOW() - INTERVAL '31 days', NOW() - INTERVAL '31 days', NOW() - INTERVAL '31 days'),
  ('44000022-0000-0000-0000-000000000022', '22000002-0000-0000-0000-000000000002', '11000003-0000-0000-0000-000000000003', 'arjun.reddy@okhdfcbank', 4599.00, 'completed', 'QM-2026010501', '412345678918', NOW() - INTERVAL '34 days', NOW() - INTERVAL '34 days', NOW() - INTERVAL '34 days'),
  ('44000023-0000-0000-0000-000000000023', '22000001-0000-0000-0000-000000000001', '11000004-0000-0000-0000-000000000004', 'deepak9444@ibl', 2999.00, 'completed', 'RS-2026010101', '412345678919', NOW() - INTERVAL '38 days', NOW() - INTERVAL '38 days', NOW() - INTERVAL '38 days'),
  
  -- December (older)
  ('44000024-0000-0000-0000-000000000024', '22000003-0000-0000-0000-000000000003', '11000005-0000-0000-0000-000000000005', 'sneha.joshi@okaxis', 299.00, 'completed', 'SF-2025122501', '412345678920', NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days'),
  ('44000025-0000-0000-0000-000000000025', '22000001-0000-0000-0000-000000000001', '11000002-0000-0000-0000-000000000002', 'neha.gupta@okicici', 4999.00, 'completed', 'RS-2025122001', '412345678921', NOW() - INTERVAL '50 days', NOW() - INTERVAL '50 days', NOW() - INTERVAL '50 days'),
  ('44000026-0000-0000-0000-000000000026', '22000002-0000-0000-0000-000000000002', '11000001-0000-0000-0000-000000000001', 'vikram.singh@okaxis', 8999.00, 'completed', 'QM-2025121501', '412345678922', NOW() - INTERVAL '55 days', NOW() - INTERVAL '55 days', NOW() - INTERVAL '55 days'),
  ('44000027-0000-0000-0000-000000000027', '22000001-0000-0000-0000-000000000001', '11000003-0000-0000-0000-000000000003', 'arjunr@upi', 2999.00, 'completed', 'RS-2025121001', '412345678923', NOW() - INTERVAL '60 days', NOW() - INTERVAL '60 days', NOW() - INTERVAL '60 days'),
  
  -- High-value transactions
  ('44000028-0000-0000-0000-000000000028', '22000001-0000-0000-0000-000000000001', '11000004-0000-0000-0000-000000000004', 'deepak.k@oksbi', 24999.00, 'completed', 'RS-2025120501', '412345678924', NOW() - INTERVAL '65 days', NOW() - INTERVAL '65 days', NOW() - INTERVAL '65 days'),
  ('44000029-0000-0000-0000-000000000029', '22000002-0000-0000-0000-000000000002', '11000004-0000-0000-0000-000000000004', 'deepak9444@ibl', 15999.00, 'completed', 'QM-2025120101', '412345678925', NOW() - INTERVAL '69 days', NOW() - INTERVAL '69 days', NOW() - INTERVAL '69 days'),
  ('44000030-0000-0000-0000-000000000030', '22000001-0000-0000-0000-000000000001', '11000001-0000-0000-0000-000000000001', 'vikram1234@ybl', 9999.00, 'completed', 'RS-2025112501', '412345678926', NOW() - INTERVAL '75 days', NOW() - INTERVAL '75 days', NOW() - INTERVAL '75 days')
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- 7. PAYOUTS (20 transactions)
-- =============================================
INSERT INTO payouts (id, merchant_id, trader_id, amount, status, utr, created_at, completed_at) VALUES
  -- Today/recent pending
  ('55000001-0000-0000-0000-000000000001', '22000001-0000-0000-0000-000000000001', '11000004-0000-0000-0000-000000000004', 15000.00, 'pending', NULL, NOW() - INTERVAL '30 minutes', NULL),
  ('55000002-0000-0000-0000-000000000002', '22000002-0000-0000-0000-000000000002', '11000001-0000-0000-0000-000000000001', 8500.00, 'assigned', NULL, NOW() - INTERVAL '15 minutes', NULL),
  
  -- Yesterday
  ('55000003-0000-0000-0000-000000000003', '22000001-0000-0000-0000-000000000001', '11000002-0000-0000-0000-000000000002', 25000.00, 'completed', '512345678901', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
  ('55000004-0000-0000-0000-000000000004', '22000002-0000-0000-0000-000000000002', '11000003-0000-0000-0000-000000000003', 12000.00, 'completed', '512345678902', NOW() - INTERVAL '1 day' - INTERVAL '3 hours', NOW() - INTERVAL '1 day'),
  
  -- This week
  ('55000005-0000-0000-0000-000000000005', '22000003-0000-0000-0000-000000000003', '11000004-0000-0000-0000-000000000004', 5000.00, 'completed', '512345678903', NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days'),
  ('55000006-0000-0000-0000-000000000006', '22000001-0000-0000-0000-000000000001', '11000001-0000-0000-0000-000000000001', 35000.00, 'completed', '512345678904', NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days'),
  ('55000007-0000-0000-0000-000000000007', '22000002-0000-0000-0000-000000000002', '11000005-0000-0000-0000-000000000005', 7500.00, 'failed', NULL, NOW() - INTERVAL '5 days', NULL),
  
  -- Last week
  ('55000008-0000-0000-0000-000000000008', '22000001-0000-0000-0000-000000000001', '11000002-0000-0000-0000-000000000002', 18000.00, 'completed', '512345678905', NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days'),
  ('55000009-0000-0000-0000-000000000009', '22000003-0000-0000-0000-000000000003', '11000003-0000-0000-0000-000000000003', 3000.00, 'completed', '512345678906', NOW() - INTERVAL '11 days', NOW() - INTERVAL '11 days'),
  ('55000010-0000-0000-0000-000000000010', '22000002-0000-0000-0000-000000000002', '11000004-0000-0000-0000-000000000004', 22000.00, 'completed', '512345678907', NOW() - INTERVAL '14 days', NOW() - INTERVAL '14 days'),
  
  -- 2-3 weeks ago
  ('55000011-0000-0000-0000-000000000011', '22000001-0000-0000-0000-000000000001', '11000001-0000-0000-0000-000000000001', 45000.00, 'completed', '512345678908', NOW() - INTERVAL '19 days', NOW() - INTERVAL '19 days'),
  ('55000012-0000-0000-0000-000000000012', '22000002-0000-0000-0000-000000000002', '11000002-0000-0000-0000-000000000002', 9000.00, 'completed', '512345678909', NOW() - INTERVAL '24 days', NOW() - INTERVAL '24 days'),
  
  -- Last month
  ('55000013-0000-0000-0000-000000000013', '22000001-0000-0000-0000-000000000001', '11000003-0000-0000-0000-000000000003', 30000.00, 'completed', '512345678910', NOW() - INTERVAL '31 days', NOW() - INTERVAL '31 days'),
  ('55000014-0000-0000-0000-000000000014', '22000003-0000-0000-0000-000000000003', '11000004-0000-0000-0000-000000000004', 6000.00, 'completed', '512345678911', NOW() - INTERVAL '34 days', NOW() - INTERVAL '34 days'),
  ('55000015-0000-0000-0000-000000000015', '22000002-0000-0000-0000-000000000002', '11000001-0000-0000-0000-000000000001', 50000.00, 'completed', '512345678912', NOW() - INTERVAL '38 days', NOW() - INTERVAL '38 days'),
  
  -- December (older)
  ('55000016-0000-0000-0000-000000000016', '22000001-0000-0000-0000-000000000001', '11000004-0000-0000-0000-000000000004', 75000.00, 'completed', '512345678913', NOW() - INTERVAL '50 days', NOW() - INTERVAL '50 days'),
  ('55000017-0000-0000-0000-000000000017', '22000002-0000-0000-0000-000000000002', '11000002-0000-0000-0000-000000000002', 12500.00, 'completed', '512345678914', NOW() - INTERVAL '55 days', NOW() - INTERVAL '55 days'),
  ('55000018-0000-0000-0000-000000000018', '22000001-0000-0000-0000-000000000001', '11000003-0000-0000-0000-000000000003', 28000.00, 'completed', '512345678915', NOW() - INTERVAL '60 days', NOW() - INTERVAL '60 days'),
  ('55000019-0000-0000-0000-000000000019', '22000003-0000-0000-0000-000000000003', '11000001-0000-0000-0000-000000000001', 4500.00, 'completed', '512345678916', NOW() - INTERVAL '65 days', NOW() - INTERVAL '65 days'),
  ('55000020-0000-0000-0000-000000000020', '22000001-0000-0000-0000-000000000001', '11000004-0000-0000-0000-000000000004', 100000.00, 'completed', '512345678917', NOW() - INTERVAL '69 days', NOW() - INTERVAL '69 days')
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- 8. PLATFORM EARNINGS (from completed payins)
-- Skip if table doesn't exist
-- =============================================
DO $$
BEGIN
  INSERT INTO platform_earnings (id, type, reference_id, merchant_id, trader_id, transaction_amount, merchant_fee, trader_fee, platform_profit, created_at)
  SELECT 
    gen_random_uuid(), 'payin', p.id, p.merchant_id, p.trader_id, p.amount,
    ROUND((p.amount * m.payin_commission / 100)::numeric, 2),
    ROUND((p.amount * t.payin_commission / 100)::numeric, 2),
    ROUND(((p.amount * m.payin_commission / 100) - (p.amount * t.payin_commission / 100))::numeric, 2),
    p.completed_at
  FROM payins p
  JOIN merchants m ON m.id = p.merchant_id
  JOIN traders t ON t.id = p.trader_id
  WHERE p.status = 'completed' AND p.completed_at IS NOT NULL
  ON CONFLICT DO NOTHING;

  INSERT INTO platform_earnings (id, type, reference_id, merchant_id, trader_id, transaction_amount, merchant_fee, trader_fee, platform_profit, created_at)
  SELECT 
    gen_random_uuid(), 'payout', p.id, p.merchant_id, p.trader_id, p.amount,
    ROUND((p.amount * m.payout_commission / 100)::numeric, 2),
    ROUND((p.amount * t.payout_commission / 100)::numeric, 2),
    ROUND(((p.amount * m.payout_commission / 100) - (p.amount * t.payout_commission / 100))::numeric, 2),
    p.completed_at
  FROM payouts p
  JOIN merchants m ON m.id = p.merchant_id
  JOIN traders t ON t.id = p.trader_id
  WHERE p.status = 'completed' AND p.completed_at IS NOT NULL
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN undefined_table OR undefined_column THEN
  NULL;
END $$;

-- =============================================
-- 9. AFFILIATE EARNINGS (from traders with affiliates)
-- Skip if tables don't exist
-- =============================================
DO $$
BEGIN
  INSERT INTO affiliate_earnings (id, affiliate_id, trader_id, transaction_type, transaction_id, transaction_amount, trader_earning, commission_rate, affiliate_earning, status, created_at)
  SELECT
    gen_random_uuid(), at.affiliate_id, p.trader_id, 'payin', p.id, p.amount,
    ROUND((p.amount * t.payin_commission / 100)::numeric, 2), at.commission_rate,
    ROUND(((p.amount * t.payin_commission / 100) * at.commission_rate / 100)::numeric, 2),
    'pending', p.completed_at
  FROM payins p
  JOIN traders t ON t.id = p.trader_id
  JOIN affiliate_traders at ON at.trader_id = p.trader_id
  WHERE p.status = 'completed' AND p.completed_at IS NOT NULL
  ON CONFLICT DO NOTHING;

  INSERT INTO affiliate_earnings (id, affiliate_id, trader_id, transaction_type, transaction_id, transaction_amount, trader_earning, commission_rate, affiliate_earning, status, created_at)
  SELECT
    gen_random_uuid(), at.affiliate_id, p.trader_id, 'payout', p.id, p.amount,
    ROUND((p.amount * t.payout_commission / 100)::numeric, 2), at.commission_rate,
    ROUND(((p.amount * t.payout_commission / 100) * at.commission_rate / 100)::numeric, 2),
    'pending', p.completed_at
  FROM payouts p
  JOIN traders t ON t.id = p.trader_id
  JOIN affiliate_traders at ON at.trader_id = p.trader_id
  WHERE p.status = 'completed' AND p.completed_at IS NOT NULL
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN undefined_table OR undefined_column THEN
  NULL;
END $$;

-- =============================================
-- 10. DISPUTES
-- Skip if table doesn't exist
-- =============================================
DO $$
BEGIN
  INSERT INTO disputes (id, merchant_id, trader_id, type, amount, status, description, created_at, updated_at) VALUES
    ('66000001-0000-0000-0000-000000000001', '22000001-0000-0000-0000-000000000001', '11000001-0000-0000-0000-000000000001', 'payin', 2999.00, 'pending', 'Customer claims payment was made but not credited. UTR: 412345999888', NOW() - INTERVAL '2 days', NOW()),
    ('66000002-0000-0000-0000-000000000002', '22000002-0000-0000-0000-000000000002', '11000004-0000-0000-0000-000000000004', 'payout', 7500.00, 'routed_to_trader', 'Beneficiary claims funds not received. Please check with bank.', NOW() - INTERVAL '5 days', NOW() - INTERVAL '4 days'),
    ('66000003-0000-0000-0000-000000000003', '22000001-0000-0000-0000-000000000001', '11000002-0000-0000-0000-000000000002', 'payin', 4999.00, 'trader_accepted', 'Verified: Payment was made to wrong UPI. Refund processed.', NOW() - INTERVAL '40 days', NOW() - INTERVAL '38 days'),
    ('66000004-0000-0000-0000-000000000004', '22000003-0000-0000-0000-000000000003', '11000003-0000-0000-0000-000000000003', 'payout', 3000.00, 'trader_rejected', 'Bank confirmed: Payment credited successfully. Customer error.', NOW() - INTERVAL '10 days', NOW() - INTERVAL '8 days'),
    ('66000005-0000-0000-0000-000000000005', '22000002-0000-0000-0000-000000000002', '11000001-0000-0000-0000-000000000001', 'payin', 8999.00, 'trader_accepted', 'Trader acknowledged: Will process manually.', NOW() - INTERVAL '50 days', NOW() - INTERVAL '48 days'),
    ('66000006-0000-0000-0000-000000000006', '22000001-0000-0000-0000-000000000001', '11000004-0000-0000-0000-000000000004', 'payin', 24999.00, 'trader_rejected', 'Trader disputes: UTR does not match any transaction.', NOW() - INTERVAL '60 days', NOW() - INTERVAL '55 days')
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN undefined_table OR undefined_column OR invalid_text_representation THEN
  NULL;
END $$;

-- =============================================
-- 11. AFFILIATE SETTLEMENTS (January settlement done)
-- Skip if tables don't exist
-- =============================================
DO $$
BEGIN
  INSERT INTO affiliate_settlements (id, affiliate_id, settlement_month, amount, earnings_count, bank_details, status, processed_by, processed_at, transaction_reference, notes, created_at) VALUES
    ('77000001-0000-0000-0000-000000000001', 'af000001-0000-0000-0000-000000000001', '2026-01-01', 18500.00, 42, '{"account_number": "1234567890123456", "ifsc": "HDFC0001234", "account_name": "Rahul Sharma", "bank_name": "HDFC Bank"}', 'completed', 'a0000000-0000-0000-0000-000000000001', '2026-02-02 10:30:00+05:30', 'NEFT202602021234567', 'January 2026 settlement processed', '2026-02-02 09:00:00+05:30'),
    ('77000002-0000-0000-0000-000000000002', 'af000002-0000-0000-0000-000000000002', '2026-01-01', 12000.00, 28, '{"account_number": "9876543210987654", "ifsc": "ICIC0002345", "account_name": "Priya Patel", "bank_name": "ICICI Bank"}', 'completed', 'a0000000-0000-0000-0000-000000000001', '2026-02-02 11:00:00+05:30', 'NEFT202602027654321', 'January 2026 settlement processed', '2026-02-02 09:30:00+05:30')
  ON CONFLICT (id) DO NOTHING;

  -- Mark January earnings as settled
  UPDATE affiliate_earnings 
  SET status = 'settled', settlement_id = '77000001-0000-0000-0000-000000000001'
  WHERE affiliate_id = 'af000001-0000-0000-0000-000000000001' 
    AND status = 'pending' 
    AND created_at < '2026-02-01';

  UPDATE affiliate_earnings 
  SET status = 'settled', settlement_id = '77000002-0000-0000-0000-000000000002'
  WHERE affiliate_id = 'af000002-0000-0000-0000-000000000002' 
    AND status = 'pending' 
    AND created_at < '2026-02-01';
EXCEPTION WHEN undefined_table OR undefined_column THEN
  NULL;
END $$;

-- =============================================
-- 12. SAVED BANKS (for dispute routing)
-- Skip if table doesn't exist or has different schema
-- =============================================
DO $$
BEGIN
  INSERT INTO saved_banks (id, trader_id, upi_id, holder_name, bank_name, ifsc, account_number, created_at) VALUES
    ('88000001-0000-0000-0000-000000000001', '11000001-0000-0000-0000-000000000001', 'vikram.singh@okaxis', 'Vikram Singh', 'Axis Bank', 'UTIB0001234', '917010012345678', NOW() - INTERVAL '4 months'),
    ('88000002-0000-0000-0000-000000000002', '11000001-0000-0000-0000-000000000001', 'vikram1234@ybl', 'Vikram Singh', 'Yes Bank', 'YESB0002345', '918010012345678', NOW() - INTERVAL '3 months'),
    ('88000003-0000-0000-0000-000000000003', '11000002-0000-0000-0000-000000000002', 'neha.gupta@okicici', 'Neha Gupta', 'ICICI Bank', 'ICIC0003456', '919010012345678', NOW() - INTERVAL '3 months'),
    ('88000004-0000-0000-0000-000000000004', '11000003-0000-0000-0000-000000000003', 'arjun.reddy@okhdfcbank', 'Arjun Reddy', 'HDFC Bank', 'HDFC0004567', '920010012345678', NOW() - INTERVAL '3 months'),
    ('88000005-0000-0000-0000-000000000005', '11000004-0000-0000-0000-000000000004', 'deepak.k@oksbi', 'Deepak Kumar', 'State Bank of India', 'SBIN0005678', '921010012345678', NOW() - INTERVAL '5 months')
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN undefined_table OR undefined_column THEN
  NULL; -- Table or columns don't exist, skip
END $$;

-- =============================================
-- 13. ADMIN LOGS (audit trail)
-- Skip if table doesn't exist or has different schema
-- =============================================
DO $$
BEGIN
  INSERT INTO admin_logs (id, admin_id, action, entity_type, entity_id, old_value, new_value, ip_address, created_at) VALUES
    (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'create', 'trader', '11000001-0000-0000-0000-000000000001', NULL, '{"name": "Vikram Singh"}', '192.168.1.1', NOW() - INTERVAL '4 months'),
    (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'create', 'merchant', '22000001-0000-0000-0000-000000000001', NULL, '{"business_name": "RealShaadi Premium Matrimony"}', '192.168.1.1', NOW() - INTERVAL '5 months'),
    (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'update', 'trader', '11000004-0000-0000-0000-000000000004', '{"balance": 400000}', '{"balance": 450000}', '192.168.1.1', NOW() - INTERVAL '10 days'),
    (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'settlement_complete', 'affiliate', 'af000001-0000-0000-0000-000000000001', NULL, '{"amount": 18500, "reference": "NEFT202602021234567"}', '192.168.1.1', NOW() - INTERVAL '6 days'),
    (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'create', 'affiliate', 'af000001-0000-0000-0000-000000000001', NULL, '{"name": "Rahul Sharma"}', '192.168.1.1', NOW() - INTERVAL '4 months'),
    (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'enable', 'upi', '33000007-0000-0000-0000-000000000007', '{"is_active": false}', '{"is_active": true}', '192.168.1.1', NOW() - INTERVAL '5 months')
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN undefined_table OR undefined_column THEN
  NULL; -- Table or columns don't exist, skip
END $$;

-- Re-enable triggers
SET session_replication_role = 'origin';

-- =============================================
-- VERIFICATION QUERIES (run to check data)
-- =============================================
-- SELECT 'Profiles' as entity, count(*) as count FROM profiles
-- UNION ALL SELECT 'Affiliates', count(*) FROM affiliates
-- UNION ALL SELECT 'Traders', count(*) FROM traders
-- UNION ALL SELECT 'Merchants', count(*) FROM merchants
-- UNION ALL SELECT 'UPI Pool', count(*) FROM upi_pool
-- UNION ALL SELECT 'Payins', count(*) FROM payins
-- UNION ALL SELECT 'Payouts', count(*) FROM payouts
-- UNION ALL SELECT 'Disputes', count(*) FROM disputes
-- UNION ALL SELECT 'Platform Earnings', count(*) FROM platform_earnings
-- UNION ALL SELECT 'Affiliate Earnings', count(*) FROM affiliate_earnings
-- UNION ALL SELECT 'Affiliate Settlements', count(*) FROM affiliate_settlements;

-- =============================================
-- DONE! Seed data inserted successfully.
-- =============================================
