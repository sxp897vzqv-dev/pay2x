-- Migration 055: Remove payment_links table and related objects
-- Payment links feature removed from merchant panel

-- Drop policies first
DROP POLICY IF EXISTS "Merchants can manage their own payment links" ON payment_links;
DROP POLICY IF EXISTS "Public can view active payment links" ON payment_links;

-- Drop indexes
DROP INDEX IF EXISTS idx_payment_links_merchant;
DROP INDEX IF EXISTS idx_payment_links_short_code;
DROP INDEX IF EXISTS idx_payment_links_status;

-- Drop the table
DROP TABLE IF EXISTS payment_links CASCADE;
