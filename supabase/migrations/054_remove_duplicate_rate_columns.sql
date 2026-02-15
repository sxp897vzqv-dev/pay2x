-- Migration 054: Remove duplicate rate columns from merchants
-- Keep only payin_commission_rate and payout_commission_rate

-- First, copy any values from payin_rate/payout_rate to commission_rate columns (if commission_rate is null)
UPDATE merchants 
SET payin_commission_rate = COALESCE(payin_commission_rate, payin_rate, 6),
    payout_commission_rate = COALESCE(payout_commission_rate, payout_rate, 2)
WHERE payin_commission_rate IS NULL OR payout_commission_rate IS NULL;

-- Drop the duplicate columns
ALTER TABLE merchants DROP COLUMN IF EXISTS payin_rate;
ALTER TABLE merchants DROP COLUMN IF EXISTS payout_rate;
