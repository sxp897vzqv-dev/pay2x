# Pay2X: Firebase → Supabase Migration Plan

## Supabase Project
- URL: https://jrzyndtowwwcydgcagcr.supabase.co
- Anon Key: (pending)
- Service Role Key: (pending)

## Phase 1: Database Schema (PostgreSQL)
Convert Firestore collections → PostgreSQL tables with proper relations

### Firestore → PostgreSQL Mapping

| Firestore Collection | PostgreSQL Table | Notes |
|---------------------|-----------------|-------|
| auth users | auth.users (built-in) | Supabase Auth handles this |
| trader | traders | |
| merchant | merchants | |
| worker | workers | |
| payin | payins | |
| payouts | payouts | |
| payoutRequest | payout_requests | |
| disputes | disputes | |
| disputeMessages | dispute_messages | FK → disputes |
| upiPool | upi_pool | |
| savedBanks | saved_banks | |
| bankHealth | bank_health | |
| selectionLogs | payin_selection_logs | |
| payoutSelectionLogs | payout_selection_logs | |
| disputeEngineLogs | dispute_engine_logs | |
| adminLog | admin_logs | |
| system/engineConfig | system_config | key-value config |
| system/payoutEngineConfig | system_config | |
| system/disputeEngineConfig | system_config | |

## Phase 2: Auth Migration
- Firebase Auth → Supabase Auth
- Role-based access via custom claims or app_metadata
- Roles: admin, trader, merchant, worker

## Phase 3: Frontend Migration
- Replace firebase.js with supabase.js
- Replace all Firestore queries with Supabase client queries
- Replace onSnapshot with Supabase Realtime subscriptions
- Replace Cloud Function calls with Supabase Edge Functions or direct RPC

## Phase 4: Backend Migration
- Cloud Functions → Supabase Edge Functions (Deno) OR Express API
- Scheduled functions → pg_cron or Supabase cron
- Webhooks → Supabase Edge Functions

## Key Advantages of Migration
1. **SQL** - Proper JOINs, aggregations, complex queries
2. **RLS** - Row Level Security (way better than Firestore rules)
3. **No vendor lock-in** - Standard PostgreSQL
4. **Cost** - More predictable pricing
5. **Real-time** - Built-in, based on Postgres changes
6. **Edge Functions** - Deno-based, fast cold starts
