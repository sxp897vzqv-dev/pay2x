# Pay2X Database Audit - 2026-02-15

## 🚨 Critical Issues Found

### 1. DUPLICATE TABLES (Same purpose, different names)

| Duplicate Set | Tables | Keep | Drop |
|--------------|--------|------|------|
| **Wallet Config** | `tatum_config`, `wallet_config`, `wallet_configs` | `tatum_config` | ~~wallet_config~~, ~~wallet_configs~~ |
| **Wallet Addresses** | `trader_wallets`, `traders.usdt_deposit_address` | `traders` column | ~~trader_wallets~~ |
| **Wallet Transactions** | `crypto_transactions`, `wallet_transactions` | `crypto_transactions` | ~~wallet_transactions~~ |
| **Sweep Queue** | `sweep_queue`, `wallet_sweep_queue` | `sweep_queue` | ~~wallet_sweep_queue~~ |
| **Webhook Tracking** | `webhook_deliveries` (009), `webhook_deliveries` (016) | Merge | - |

**Status:** ✅ Fixed in migration 046_consolidate_wallet_system.sql

---

### 2. FUNCTIONS DEFINED MULTIPLE TIMES

| Function | Created In | Issue |
|----------|-----------|-------|
| `switch_payin_upi` | 031, 033, 033b, 033c, 033d | 5 versions! |
| `get_next_derivation_index` | 012, 014, 022 | 3 versions |
| `approve_payout_verification` | 024, 028, 044? | 3 versions |
| `complete_payin` | Multiple | 2 versions |

**Risk:** Function behavior depends on which migration ran last

---

### 3. UNUSED TABLES (Created but not used by frontend)

| Table | Migration | Purpose | Verdict |
|-------|-----------|---------|---------|
| `accounts` | 011_double_entry | Double-entry accounting | ❓ Not implemented |
| `journal_entries` | 011_double_entry | Ledger entries | ❓ Not implemented |
| `journal_lines` | 011_double_entry | Ledger lines | ❓ Not implemented |
| `va_bank_partners` | 013_virtual_accounts | Virtual accounts | ❓ Not implemented |
| `virtual_accounts` | 013_virtual_accounts | Virtual accounts | ❓ Not implemented |
| `va_transactions` | 013_virtual_accounts | VA transactions | ❓ Not implemented |
| `va_webhook_queue` | 013_virtual_accounts | VA webhooks | ❓ Not implemented |
| `bank_circuits` | 029_payin_engine_v3 | Circuit breaker | ❓ Check if used |
| `velocity_limits` | 030_payin_engine_v4 | Rate limiting | ❓ Check if used |
| `velocity_tracking` | 030_payin_engine_v4 | Rate tracking | ❓ Check if used |
| `peak_hours_config` | 030_payin_engine_v4 | Peak hours | ❓ Check if used |
| `merchant_upi_affinity` | 030_payin_engine_v4 | UPI preferences | ❓ Check if used |
| `engine_stats_hourly` | 030_payin_engine_v4 | Hourly stats | ❓ Check if used |
| `account_type_stats` | 031_upi_pool | Account stats | ❓ Check if used |
| `provider_stats` | 031_upi_pool | Provider stats | ❓ Check if used |
| `banks` | 031_upi_pool | Bank list | ❓ Check if used |
| `audit_chain_snapshots` | 017 | Audit chain | ❓ Not implemented |
| `daily_summaries` | 017 | Daily reports | ❓ Not implemented |
| `email_queue` | 018 | Email sending | ❓ Check if used |
| `two_factor_auth` | 019 | 2FA | ❓ Not implemented |
| `two_factor_logs` | 019 | 2FA logs | ❓ Not implemented |
| `error_codes` | 009 | Error mapping | ❓ Check if used |
| `idempotency_keys` | 009 | Idempotency | ❓ Check if used |

---

### 4. MIGRATION NUMBERING CONFLICTS

Same number used for different migrations:

```
011_affiliate_system.sql
011_cron_jobs.sql
011_double_entry_accounting.sql

012_crypto_wallets.sql
012_realshaadi_merchant.sql

027_auto_assign_trigger.sql
027_auto_assign_trigger_fixed.sql
027_payout_assignment_rpc.sql

033_switch_creates_new_payin.sql
033b_fix_switch_rpc.sql
033c_fix_switch_columns.sql
033d_fix_txn_id.sql

036_fix_address_meta_index.sql
036_multi_wallet_recovery.sql

040_usdt_rate_auto_update.sql
040_usdt_rate_tracking.sql

045_fix_payin_flow.sql
045_reset_tatum_fresh_start.sql

046_balance_history.sql
046_consolidate_wallet_system.sql
```

---

## ✅ TABLES ACTUALLY USED (Keep these)

Core tables used by frontend:

| Category | Tables |
|----------|--------|
| **Auth** | `profiles`, `user_sessions`, `login_attempts`, `account_lockouts`, `security_settings`, `ip_whitelist` |
| **Entities** | `traders`, `merchants`, `workers`, `affiliates` |
| **Transactions** | `payins`, `payouts`, `payout_requests`, `disputes` |
| **UPI** | `upi_pool`, `saved_banks`, `selection_logs` |
| **Finance** | `balance_holds`, `merchant_ledger`, `merchant_settlements`, `platform_earnings` |
| **Crypto** | `tatum_config`, `address_meta`, `address_mapping`, `crypto_transactions`, `sweep_queue` |
| **Webhooks** | `webhook_deliveries`, `webhook_logs`, `webhook_queue` |
| **Logs** | `admin_logs`, `merchant_activity_log`, `api_requests` |
| **Features** | `payment_links`, `refunds`, `kyc_documents`, `engine_alerts` |
| **Config** | `system_config`, `rate_limits`, `rate_limit_config` |

---

## 🔧 Recommended Cleanup

### Phase 1: Already Done ✅
- Migration 046: Consolidated wallet tables to use `tatum_config` only

### Phase 2: Drop Unused Feature Tables
```sql
-- Features never implemented
DROP TABLE IF EXISTS accounts CASCADE;
DROP TABLE IF EXISTS journal_entries CASCADE;
DROP TABLE IF EXISTS journal_lines CASCADE;
DROP TABLE IF EXISTS virtual_accounts CASCADE;
DROP TABLE IF EXISTS va_bank_partners CASCADE;
DROP TABLE IF EXISTS va_transactions CASCADE;
DROP TABLE IF EXISTS va_webhook_queue CASCADE;
DROP TABLE IF EXISTS audit_chain_snapshots CASCADE;
DROP TABLE IF EXISTS daily_summaries CASCADE;
DROP TABLE IF EXISTS two_factor_auth CASCADE;
DROP TABLE IF EXISTS two_factor_logs CASCADE;
DROP TABLE IF EXISTS two_factor_protected_actions CASCADE;
```

### Phase 3: Consolidate Functions
Create a single migration that:
1. Drops ALL versions of duplicate functions
2. Creates ONE canonical version of each

### Phase 4: Rename Migrations
Rename files to have unique sequential numbers (optional, cosmetic)

---

## 📊 Summary

| Issue | Count | Status |
|-------|-------|--------|
| Duplicate table sets | 5 | ✅ Fixed (wallet) |
| Functions defined 2+ times | 9 | ⚠️ Needs fix |
| Unused tables | ~20 | ⚠️ Review needed |
| Migration number conflicts | 8 groups | ⚠️ Cosmetic |
