-- ============================================================================
-- Migration 035: Fix dispute_type enum
-- ============================================================================
-- Current: 'payin', 'payout'
-- Need: 'payment_not_received', 'wrong_amount', 'duplicate_payment', 
--       'refund_request', 'payout_not_received', 'other'
-- ============================================================================

-- Add new values to enum (PostgreSQL 10+)
ALTER TYPE dispute_type ADD VALUE IF NOT EXISTS 'payment_not_received';
ALTER TYPE dispute_type ADD VALUE IF NOT EXISTS 'wrong_amount';
ALTER TYPE dispute_type ADD VALUE IF NOT EXISTS 'duplicate_payment';
ALTER TYPE dispute_type ADD VALUE IF NOT EXISTS 'refund_request';
ALTER TYPE dispute_type ADD VALUE IF NOT EXISTS 'payout_not_received';
ALTER TYPE dispute_type ADD VALUE IF NOT EXISTS 'other';
