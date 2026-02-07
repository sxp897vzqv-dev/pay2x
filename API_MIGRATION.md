# Pay2X API Migration to Supabase

## Overview

This document covers the migration from Firebase Cloud Functions to Supabase Edge Functions for the Pay2X payment API.

## New API Endpoints

Base URL: `https://<project-ref>.supabase.co/functions/v1`

### 1. Create Payin
```bash
POST /create-payin
Authorization: Bearer <live_api_key>
Content-Type: application/json

{
  "amount": 5000,
  "userId": "customer123",
  "orderId": "ORDER-456",  // optional
  "metadata": {}           // optional
}
```

**Response:**
```json
{
  "success": true,
  "payinId": "uuid",
  "txnId": "TXN1707234567ABC",
  "upiId": "merchant@okaxis",
  "holderName": "Rajesh Kumar",
  "amount": 5000,
  "timer": 600,
  "expiresAt": "2026-02-06T12:10:00Z"
}
```

### 2. Update Payin (Submit UTR)
```bash
PATCH /update-payin
Authorization: Bearer <live_api_key>
Content-Type: application/json

{
  "payinId": "uuid",
  "utrId": "412345678901"
}
```

**Response:**
```json
{
  "success": true,
  "message": "UTR submitted successfully. Payment is being verified.",
  "payinId": "uuid",
  "status": "assigned"
}
```

### 3. Get Payin Status
```bash
GET /get-payin-status?payinId=uuid
Authorization: Bearer <live_api_key>
```

**Response:**
```json
{
  "success": true,
  "payin": {
    "payinId": "uuid",
    "txnId": "TXN1707234567ABC",
    "orderId": "ORDER-456",
    "amount": 5000,
    "status": "completed",
    "utrId": "412345678901",
    "userId": "customer123",
    "createdAt": "2026-02-06T12:00:00Z",
    "completedAt": "2026-02-06T12:05:00Z"
  }
}
```

### 4. Health Check
```bash
GET /api-health
```

## Webhooks

When a payin status changes to `completed`, `failed`, `rejected`, or `expired`, a webhook is sent to the merchant's configured URL.

**Webhook Payload:**
```json
{
  "event": "payment.completed",
  "timestamp": 1707234567890,
  "data": {
    "payinId": "uuid",
    "txnId": "TXN1707234567ABC",
    "orderId": "ORDER-456",
    "amount": 5000,
    "status": "completed",
    "utrId": "412345678901",
    "userId": "customer123",
    "completedAt": "2026-02-06T12:05:00Z",
    "metadata": {}
  }
}
```

**Headers:**
- `X-Webhook-Signature`: HMAC-SHA256 signature of the payload
- `X-Webhook-Event`: Event type (e.g., `payment.completed`)
- `User-Agent`: `Pay2X-Webhooks/2.0`

**Signature Verification (Node.js):**
```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(JSON.stringify(payload)).digest('hex');
  return signature === digest;
}
```

## Migration Steps

### 1. Run Database Migration
```sql
-- Run in Supabase SQL Editor
-- File: supabase-migration/006_payin_engine.sql
```

This creates:
- `system_config` - Engine configuration
- `selection_logs` - UPI selection history
- `bank_health` - Bank status tracking
- `payin_webhook_queue` - Webhook queue
- Trigger: `payin_status_webhook_trigger`
- Functions: `increment_upi_success`, `increment_upi_failure`

### 2. Deploy Edge Functions

```bash
# Install Supabase CLI
scoop install supabase

# Login
supabase login

# Link project
supabase link --project-ref <your-project-ref>

# Deploy functions
supabase functions deploy create-payin
supabase functions deploy update-payin
supabase functions deploy get-payin-status
supabase functions deploy send-webhooks
supabase functions deploy api-health
```

### 3. Set Environment Variables

In Supabase Dashboard > Edge Functions > Secrets:
- `SUPABASE_URL` (auto-set)
- `SUPABASE_SERVICE_ROLE_KEY` (auto-set)

### 4. Schedule Webhook Processing

Create a cron job in Supabase Dashboard or use pg_cron:
```sql
SELECT cron.schedule(
  'process-webhooks',
  '* * * * *',  -- Every minute
  $$SELECT net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/send-webhooks',
    headers := '{"Authorization": "Bearer <service_role_key>"}'::jsonb
  )$$
);
```

### 5. Schedule Daily Stats Reset
```sql
SELECT cron.schedule(
  'reset-daily-stats',
  '0 0 * * *',  -- Midnight IST (adjust for timezone)
  $$SELECT reset_daily_upi_stats()$$
);
```

### 6. Schedule Payin Expiry Check
```sql
SELECT cron.schedule(
  'expire-payins',
  '*/5 * * * *',  -- Every 5 minutes
  $$SELECT expire_old_payins()$$
);
```

## PayinEngine v2.0 Scoring

The engine scores UPIs based on 8 factors:

| Factor | Weight | Description |
|--------|--------|-------------|
| Success Rate | 25 | Historical success percentage |
| Daily Limit Left | 20 | Remaining daily capacity |
| Cooldown | 15 | Time since last transaction |
| Amount Match | 15 | UPI tier matches amount range |
| Trader Balance | 10 | Trader has sufficient funds |
| Bank Health | 5 | Bank's current status |
| Time Window | 5 | Not in maintenance window |
| Recent Failures | 5 | Penalty for recent failures |

Selection uses **weighted random** (not always picking #1) to distribute load fairly.

## Error Codes

| Status | Error | Description |
|--------|-------|-------------|
| 400 | Missing required fields | `amount` and `userId` required |
| 400 | Invalid amount | Amount must be 100-100000 |
| 401 | Invalid API key | API key not found or inactive |
| 403 | Merchant inactive | Account is disabled |
| 404 | Payment not found | Payin ID doesn't exist |
| 409 | Duplicate orderId | Order already exists |
| 409 | Duplicate UTR | UTR used for another payment |
| 503 | No UPIs available | No active payment methods |

## File Structure

```
supabase/functions/
├── _shared/
│   ├── cors.ts           # CORS headers
│   └── payin-engine.ts   # UPI selection engine
├── create-payin/
│   └── index.ts
├── update-payin/
│   └── index.ts
├── get-payin-status/
│   └── index.ts
├── send-webhooks/
│   └── index.ts
└── api-health/
    └── index.ts

supabase-migration/
└── 006_payin_engine.sql  # Database setup
```

## Testing

```bash
# Health check
curl https://<ref>.supabase.co/functions/v1/api-health

# Create payin
curl -X POST https://<ref>.supabase.co/functions/v1/create-payin \
  -H "Authorization: Bearer live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"amount": 1000, "userId": "test123"}'
```

## Rollback

If issues occur, you can:
1. Point merchants back to Firebase endpoints
2. Drop the trigger: `DROP TRIGGER payin_status_webhook_trigger ON payins;`
3. Keep both systems running in parallel during transition
