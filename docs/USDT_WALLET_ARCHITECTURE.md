# USDT Wallet System - Clean Architecture

## The Problem (Before)

We had 3 config tables doing the same thing:
- `tatum_config` - Edge Functions use this
- `wallet_config` - Old, unused (from migration 012)  
- `wallet_configs` - Multi-wallet recovery (from migration 036)

This caused constant bugs - update one, another breaks.

## Clean Architecture (After)

### Single Source of Truth: `tatum_config`

```
┌─────────────────────────────────────────────────────────────────┐
│                      tatum_config (id='main')                   │
├─────────────────────────────────────────────────────────────────┤
│ tatum_api_key      │ API key for Tatum                         │
│ master_xpub        │ HD wallet extended public key             │
│ master_mnemonic    │ Encrypted mnemonic (recovery only)        │
│ master_address     │ Index 0 address (cached)                  │
│ admin_wallet       │ Where sweeps go                           │
│ webhook_id         │ Tatum webhook ID                          │
│ default_usdt_rate  │ Fallback rate if live fails               │
│ admin_usdt_rate    │ Current live rate from Binance            │
│ trader_usdt_rate   │ Rate for traders (admin - margin)         │
└─────────────────────────────────────────────────────────────────┘
```

### Derivation Index: `address_meta`

```
┌─────────────────────────────────────────────────────────────────┐
│                    address_meta (id='main')                     │
├─────────────────────────────────────────────────────────────────┤
│ last_index         │ Last used derivation index                │
│ last_updated       │ Timestamp                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Address Storage: `traders` table

Each trader has their address directly:
```
traders.usdt_deposit_address  │ Their unique TRON address
traders.derivation_index      │ Which index generated this
```

### Transaction History: `crypto_transactions`

All deposits and sweeps recorded here.

---

## Flow: Generate Address for Trader

```
1. Admin clicks "Generate Wallet" for trader
2. Call Edge Function: generate-usdt-address
   ├─ Read xpub from tatum_config
   ├─ Get next index from address_meta (atomic increment)
   ├─ Derive address using Tatum API
   └─ Return address + index
3. Update traders table:
   ├─ usdt_deposit_address = new address
   ├─ derivation_index = index
   └─ address_generated_at = now()
4. Insert into address_mapping (for lookup by address)
```

## Flow: Process USDT Deposit

```
1. Tatum webhook fires → tatum-usdt-webhook Edge Function
2. Look up trader by address (address_mapping or traders table)
3. Get current rate from tatum_config.trader_usdt_rate
4. Calculate INR: usdt_amount × rate
5. Credit trader balance (atomic RPC)
6. Record in crypto_transactions
7. Queue sweep to admin_wallet
```

## Flow: Sweep to Admin

```
1. Cron job or manual trigger → process-usdt-sweeps
2. Find pending sweeps in sweep_queue
3. For each sweep:
   ├─ Get private key (derive from mnemonic + index)
   ├─ Send USDT to admin_wallet via Tatum
   └─ Mark as completed
```

---

## Tables to DELETE (cleanup)

These are duplicates that cause confusion:

| Table | Why Delete |
|-------|-----------|
| `wallet_config` | Unused, from old migration 012 |
| `wallet_configs` | Multi-wallet overkill, just use tatum_config |
| `trader_wallets` | Duplicate of traders.usdt_deposit_address |
| `wallet_transactions` | Duplicate of crypto_transactions |
| `wallet_sweep_queue` | Duplicate of sweep_queue |

## Frontend Components

| Component | Should Use |
|-----------|-----------|
| AdminWallets.jsx | `tatum_config` ✓ (already correct) |
| AdminWalletRecovery.jsx | `tatum_config` (needs fix) |
| AdminTraderList.jsx | `tatum_config` + `address_meta` ✓ |
| TraderBalance.jsx | `tatum_config` ✓ |

## Edge Functions

All use `tatum_config` ✓ (already correct)

---

## Migration Plan

1. Run cleanup migration (drop duplicate tables)
2. Update AdminWalletRecovery to use tatum_config only
3. Test full flow: generate → deposit → credit → sweep
