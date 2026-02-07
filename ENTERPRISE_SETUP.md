# Pay2X Enterprise Features Setup

## Quick Checklist

- [ ] Run `004_enterprise.sql` migration
- [ ] Create `kyc-documents` storage bucket
- [ ] Create `exports` storage bucket
- [ ] Deploy Edge Functions (optional - for background jobs)
- [ ] Set up Cron schedules (optional)
- [ ] Test new routes

---

## 1. Run Database Migration

Go to **Supabase Dashboard → SQL Editor** and run:

```sql
-- Copy entire contents of: supabase-migration/004_enterprise.sql
```

This creates:
- 25+ new tables (settlements, refunds, chargebacks, KYC, alerts, etc.)
- Helper functions (rate limiting, webhooks, holds)
- RLS policies for all tables
- Indexes for performance

---

## 2. Create Storage Buckets

Go to **Supabase Dashboard → Storage → New Bucket**

### Bucket 1: `kyc-documents`
- **Name:** `kyc-documents`
- **Public:** No (private)
- **File size limit:** 10MB
- **Allowed MIME types:** `image/*,application/pdf`

### Bucket 2: `exports`
- **Name:** `exports`
- **Public:** No (private)
- **File size limit:** 50MB
- **Allowed MIME types:** `text/csv,application/json`

### Storage Policies (run in SQL Editor):

```sql
-- KYC Documents policies
CREATE POLICY "Admins can manage KYC docs"
ON storage.objects FOR ALL
USING (bucket_id = 'kyc-documents' AND public.user_role() = 'admin');

CREATE POLICY "Users can upload own KYC docs"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'kyc-documents' AND
  (storage.foldername(name))[1] IN ('trader', 'merchant')
);

CREATE POLICY "Users can view own KYC docs"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'kyc-documents' AND
  auth.uid()::text = (storage.foldername(name))[2]
);

-- Exports policies
CREATE POLICY "Admins can manage exports"
ON storage.objects FOR ALL
USING (bucket_id = 'exports' AND public.user_role() = 'admin');
```

---

## 3. Deploy Edge Functions (Optional)

Edge Functions handle background jobs. You can skip this initially and trigger them manually.

### Install Supabase CLI:
```bash
npm install -g supabase
```

### Link your project:
```bash
cd C:\Users\hones\pay2x
supabase login
supabase link --project-ref jrzyndtowwwcydgcagcr
```

### Deploy functions:
```bash
supabase functions deploy process-webhooks
supabase functions deploy check-alerts
supabase functions deploy generate-daily-summary
supabase functions deploy release-holds
supabase functions deploy process-exports
```

### Set environment variables:
```bash
supabase secrets set TELEGRAM_BOT_TOKEN=your_bot_token_here
```

---

## 4. Set Up Cron Schedules (Optional)

Go to **Supabase Dashboard → Database → Extensions** and enable `pg_cron`.

Then run in SQL Editor:

```sql
-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Process webhooks every minute
SELECT cron.schedule(
  'process-webhooks',
  '* * * * *',
  $$SELECT net.http_post(
    url := 'https://jrzyndtowwwcydgcagcr.supabase.co/functions/v1/process-webhooks',
    headers := '{"Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
  )$$
);

-- Check alerts every 5 minutes
SELECT cron.schedule(
  'check-alerts',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := 'https://jrzyndtowwwcydgcagcr.supabase.co/functions/v1/check-alerts',
    headers := '{"Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
  )$$
);

-- Generate daily summary at 00:05 IST (18:35 UTC previous day)
SELECT cron.schedule(
  'daily-summary',
  '35 18 * * *',
  $$SELECT net.http_post(
    url := 'https://jrzyndtowwwcydgcagcr.supabase.co/functions/v1/generate-daily-summary',
    headers := '{"Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
  )$$
);

-- Release holds every 15 minutes
SELECT cron.schedule(
  'release-holds',
  '*/15 * * * *',
  $$SELECT net.http_post(
    url := 'https://jrzyndtowwwcydgcagcr.supabase.co/functions/v1/release-holds',
    headers := '{"Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
  )$$
);

-- Process exports every 5 minutes
SELECT cron.schedule(
  'process-exports',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := 'https://jrzyndtowwwcydgcagcr.supabase.co/functions/v1/process-exports',
    headers := '{"Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
  )$$
);
```

Replace `YOUR_ANON_KEY` with your Supabase anon key.

---

## 5. New Routes Available

After setup, these admin routes are available:

| Route | Description |
|-------|-------------|
| `/admin/settlements` | Settlement management |
| `/admin/refunds` | Refunds & chargebacks |
| `/admin/kyc` | KYC document review |
| `/admin/alerts` | Alert rules & history |
| `/admin/reports` | Daily summaries & exports |

---

## 6. New Features Summary

### Security
- ✅ 2FA (TOTP) with backup codes
- ✅ IP whitelisting for merchants
- ✅ API rate limiting
- ✅ Account lockout (already done)

### Finance
- ✅ Settlement cycles (daily/weekly/monthly)
- ✅ Balance holds with auto-release
- ✅ Refund management
- ✅ Chargeback tracking

### Operations
- ✅ Webhook retry queue
- ✅ Alert system with Telegram/email/webhook
- ✅ KYC document management
- ✅ Daily reconciliation

### Reporting
- ✅ Daily summary generation
- ✅ CSV exports for payins/payouts/settlements
- ✅ Data retention policies

### Compliance
- ✅ Terms acceptance tracking
- ✅ Anomaly detection table
- ✅ Audit logging (already done)

---

## 7. Test Locally

```bash
cd C:\Users\hones\pay2x
npm run dev
```

Then visit:
- http://localhost:5173/admin/settlements
- http://localhost:5173/admin/alerts
- http://localhost:5173/admin/kyc
- http://localhost:5173/admin/reports
- http://localhost:5173/admin/refunds

---

## Files Created

### Database
- `supabase-migration/004_enterprise.sql` - Full migration

### Utilities
- `src/utils/enterprise.js` - All enterprise functions
- `src/utils/twoFactor.js` - 2FA utilities

### Components
- `src/components/TwoFactorSetup.jsx` - 2FA setup UI
- `src/roles/admin/AdminSettlements.jsx`
- `src/roles/admin/AdminAlerts.jsx`
- `src/roles/admin/AdminKYC.jsx`
- `src/roles/admin/AdminReports.jsx`
- `src/roles/admin/AdminRefunds.jsx`

### Edge Functions
- `supabase/functions/process-webhooks/index.ts`
- `supabase/functions/check-alerts/index.ts`
- `supabase/functions/generate-daily-summary/index.ts`
- `supabase/functions/release-holds/index.ts`
- `supabase/functions/process-exports/index.ts`

### Updated
- `src/SignIn.jsx` - 2FA integration
- `src/App.jsx` - New routes
- `src/roles/admin/AdminLayout.jsx` - New nav items

---

## Need Help?

If you encounter issues:
1. Check browser console for errors
2. Check Supabase logs in Dashboard → Logs
3. Verify RLS policies aren't blocking access
4. Make sure storage buckets exist
