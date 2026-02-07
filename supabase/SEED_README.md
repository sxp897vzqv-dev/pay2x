# Pay2X Seed Data

Realistic test data for development and demos.

## Quick Start

Run in Supabase Dashboard → SQL Editor:
```sql
-- First run all migrations (009-011)
-- Then run seed.sql
```

Or via CLI:
```bash
supabase db reset  # Runs migrations + seed automatically
```

## What's Included

| Entity | Count | Notes |
|--------|-------|-------|
| **Profiles** | 1 | Super admin |
| **Affiliates** | 3 | 2 active, 1 suspended |
| **Traders** | 6 | 4 with affiliates, 5 active |
| **Merchants** | 4 | 3 active (RealShaadi, QuickMart, StreamFlix) |
| **UPI Pool** | 10 | Various banks & tiers |
| **Payins** | 30 | 2 pending, 2 rejected, 26 completed |
| **Payouts** | 20 | 1 pending, 1 assigned, 1 failed, 17 completed |
| **Disputes** | 6 | Various statuses |
| **Platform Earnings** | ~45 | Auto-calculated from transactions |
| **Affiliate Earnings** | ~20 | From affiliated traders' transactions |
| **Settlements** | 2 | January settled, February pending |

## Test Accounts

### Affiliates
| Name | Email | Commission | Traders |
|------|-------|------------|---------|
| Rahul Sharma | rahul.sharma@gmail.com | 10% | Vikram, Neha |
| Priya Patel | priya.patel@gmail.com | 8% | Arjun |
| Amit Verma | amit.verma@gmail.com | 12% | Mohit (suspended) |

### Top Traders
| Name | Balance | UPIs | Affiliate |
|------|---------|------|-----------|
| Deepak Kumar | ₹4,50,000 | 2 (SBI, IDFC) | None |
| Arjun Reddy | ₹3,20,000 | 2 (HDFC, NPCI) | Priya |
| Vikram Singh | ₹2,50,000 | 2 (Axis, PhonePe) | Rahul |

### Merchants
| Business | Volume | Success Rate |
|----------|--------|--------------|
| RealShaadi | ₹25L | 94.5% |
| QuickMart | ₹18L | 92.1% |
| StreamFlix | ₹9.5L | 88.7% |

## Commission Flow Example

```
Payin ₹5,000 → RealShaadi (6%) → Vikram (4%) → Rahul (10%)

Merchant fee: ₹300 (6%)
Trader earns: ₹200 (4%)
Platform profit: ₹100
Affiliate earns: ₹20 (10% of ₹200)
```

## Transaction Distribution

- **Payins**: Spread over 2.5 months, realistic amounts (₹199 - ₹24,999)
- **Payouts**: Various bank accounts, proper IFSC codes
- **Disputes**: Mix of payin/payout disputes at different stages

## UUID Format

All IDs follow a predictable pattern for easy debugging:
- Affiliates: `af000000-0000-0000-0000-00000000000X`
- Traders: `tr000000-0000-0000-0000-00000000000X`
- Merchants: `me000000-0000-0000-0000-00000000000X`
- Payins: `pi000000-0000-0000-0000-0000000000XX`
- Payouts: `po000000-0000-0000-0000-0000000000XX`

## Creating Auth Users

The seed only creates database records. To login:

1. Create users in Supabase Auth (Dashboard → Authentication → Users)
2. Use matching emails from the seed
3. The `profiles` table links auth users to roles

**Quick test users:**
```
admin@pay2x.io → admin
vikram.singh@trader.com → trader
finance@realshaadi.com → merchant
rahul.sharma@gmail.com → affiliate
```

## Resetting Data

```sql
-- Truncate all tables (careful!)
TRUNCATE 
  affiliate_earnings, affiliate_settlements, affiliate_traders,
  platform_earnings, disputes, payouts, payins, 
  upi_pool, saved_banks, admin_logs,
  merchants, traders, affiliates, profiles
CASCADE;

-- Then re-run seed.sql
```

## Customization

Edit `seed.sql` to:
- Change amounts/volumes
- Add more transactions
- Modify date ranges
- Add specific test scenarios
