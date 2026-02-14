-- Fix missing columns in saved_banks table
-- Run this if you get schema cache errors

-- All columns from migration 039
ALTER TABLE saved_banks ADD COLUMN IF NOT EXISTS upi_provider TEXT;
ALTER TABLE saved_banks ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE saved_banks ADD COLUMN IF NOT EXISTS bank_ifsc TEXT;
ALTER TABLE saved_banks ADD COLUMN IF NOT EXISTS bank_branch TEXT;
ALTER TABLE saved_banks ADD COLUMN IF NOT EXISTS bank_city TEXT;
ALTER TABLE saved_banks ADD COLUMN IF NOT EXISTS bank_state TEXT;
ALTER TABLE saved_banks ADD COLUMN IF NOT EXISTS account_number TEXT;
ALTER TABLE saved_banks ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'savings';
ALTER TABLE saved_banks ADD COLUMN IF NOT EXISTS qr_type TEXT DEFAULT 'personal';
ALTER TABLE saved_banks ADD COLUMN IF NOT EXISTS mobile_number TEXT;
ALTER TABLE saved_banks ADD COLUMN IF NOT EXISTS daily_limit INT DEFAULT 100000;
ALTER TABLE saved_banks ADD COLUMN IF NOT EXISTS per_txn_limit INT DEFAULT 50000;
ALTER TABLE saved_banks ADD COLUMN IF NOT EXISTS monthly_limit INT DEFAULT 1000000;
ALTER TABLE saved_banks ADD COLUMN IF NOT EXISTS amount_tier TEXT DEFAULT 'small';
ALTER TABLE saved_banks ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE saved_banks ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE saved_banks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE saved_banks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Also ensure upi_pool has all columns
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'savings';
ALTER TABLE upi_pool ADD COLUMN IF NOT EXISTS saved_bank_id UUID REFERENCES saved_banks(id);
