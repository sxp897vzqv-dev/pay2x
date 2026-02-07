# Pay2X API Setup Guide

## Domain: api.pay2x.io

---

## Step 1: Add Domain to Cloudflare

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Click **Add a Site** → Enter `pay2x.io`
3. Select **Free** plan
4. Update nameservers at your domain registrar to Cloudflare's:
   ```
   NS1: xxxxx.ns.cloudflare.com
   NS2: xxxxx.ns.cloudflare.com
   ```
5. Wait for DNS propagation (5-30 mins)

---

## Step 2: Deploy Cloudflare Worker

### Install Wrangler CLI
```bash
npm install -g wrangler
```

### Login to Cloudflare
```bash
wrangler login
```

### Deploy Worker
```bash
cd C:\Users\hones\pay2x\cloudflare
wrangler deploy
```

### Output
```
✅ Deployed pay2x-api to pay2x-api.xxxxx.workers.dev
```

---

## Step 3: Add Custom Domain

### Option A: Via Wrangler
Edit `wrangler.toml`:
```toml
routes = [
  { pattern = "api.pay2x.io/*", zone_name = "pay2x.io" }
]
```

Then redeploy:
```bash
wrangler deploy
```

### Option B: Via Dashboard
1. Go to **Workers & Pages** → **pay2x-api**
2. Click **Settings** → **Triggers**
3. Add **Custom Domain** → `api.pay2x.io`
4. Cloudflare auto-creates DNS record

---

## Step 4: Verify Setup

### Test API Health
```bash
curl https://api.pay2x.io/v1/health
```

Expected:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Test Payin Create
```bash
curl -X POST https://api.pay2x.io/v1/payin/create \
  -H "Authorization: Bearer live_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{"amount": 1000, "userId": "test_user"}'
```

---

## DNS Records Summary

| Type | Name | Content |
|------|------|---------|
| CNAME | api | pay2x-api.xxxxx.workers.dev |
| A | @ | (your hosting IP) |
| CNAME | app | (your app hosting) |
| CNAME | docs | (your docs hosting) |

---

## SSL/HTTPS

Cloudflare automatically provides:
- ✅ Free SSL certificate
- ✅ Auto-renewal
- ✅ HTTP → HTTPS redirect

---

## Final URLs

| URL | Purpose |
|-----|---------|
| `https://api.pay2x.io/v1` | API Base URL |
| `https://app.pay2x.io` | Merchant Dashboard |
| `https://docs.pay2x.io` | API Documentation |
| `https://pay2x.io` | Landing Page |

---

## Rate Limiting (Optional)

Add Cloudflare rate limiting rules:

1. Go to **Security** → **WAF** → **Rate Limiting Rules**
2. Add rule:
   - **Name:** API Rate Limit
   - **Expression:** `http.host eq "api.pay2x.io"`
   - **Requests:** 100 per 1 minute
   - **Action:** Block

---

## Monitoring

### Cloudflare Analytics
- Go to **Workers & Pages** → **pay2x-api** → **Analytics**
- View: Requests, Errors, Latency

### Supabase Logs
- Go to Supabase Dashboard → **Edge Functions** → **Logs**
- View function invocations and errors

---

## Troubleshooting

### "Route not found"
- Check the URL path matches `/v1/payin/create`, etc.
- Ensure you're using correct HTTP method (POST, GET, etc.)

### "502 Bad Gateway"
- Supabase Edge Functions might be down
- Check Supabase Dashboard for errors

### "401 Unauthorized"
- API key is missing or invalid
- Check `Authorization: Bearer <key>` header

### CORS Errors
- Worker includes CORS headers automatically
- If issues persist, check browser console for details
