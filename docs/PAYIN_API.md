# Pay2X Payin API Documentation

> **Base URL:** `https://api.pay2x.io`  
> **Version:** 2.0  
> **Last Updated:** February 2026

---

## Overview

The Payin API allows merchants to collect payments from customers via UPI. The flow is simple:

1. Create a payment request
2. Show UPI details to customer
3. Customer pays and enters UTR
4. Trader verifies and approves
5. Receive webhook confirmation

---

## Authentication

All API requests require a Bearer token in the Authorization header.

```
Authorization: Bearer <your_live_api_key>
```

Your API key can be found in the merchant dashboard under **Settings → API Keys**.

| Environment | Key Prefix | Usage |
|-------------|------------|-------|
| Production | `live_` | Real transactions |
| Sandbox | `test_` | Testing only |

---

## Quick Start

```bash
# 1. Create a payment
curl -X POST https://api.pay2x.io/v1/payin/create \
  -H "Authorization: Bearer live_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 5000,
    "userId": "customer_123",
    "orderId": "ORDER-001"
  }'

# 2. After customer pays, submit UTR
curl -X PATCH https://api.pay2x.io/v1/payin/submit-utr \
  -H "Authorization: Bearer live_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "payinId": "abc123-uuid",
    "utrId": "412345678901"
  }'

# 3. Check status (optional - webhooks are recommended)
curl "https://api.pay2x.io/v1/payin/status?payinId=abc123-uuid" \
  -H "Authorization: Bearer live_your_api_key"
```

---

## Endpoints

### 1. Create Payin

Creates a new payment request and returns UPI details to show the customer.

```
POST /v1/payin/create
```

#### Request Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes | `Bearer <api_key>` |
| `Content-Type` | Yes | `application/json` |
| `X-Idempotency-Key` | No | Unique key for retry safety |

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | number | Yes | Amount in INR (₹500 - ₹50,000) |
| `userId` | string | Yes | Your customer's unique ID |
| `orderId` | string | No | Your order reference (must be unique) |
| `metadata` | object | No | Any additional data to store |

#### Example Request

```json
{
  "amount": 5000,
  "userId": "cust_abc123",
  "orderId": "ORDER-2026-001",
  "metadata": {
    "product": "Premium Plan",
    "customer_email": "user@example.com"
  }
}
```

#### Success Response (200)

```json
{
  "success": true,
  "payment_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "txn_id": "TXN1708123456ABC",
  "order_id": "ORDER-2026-001",
  "upi_id": "merchant@okaxis",
  "holder_name": "Rajesh Kumar",
  "amount": 5000,
  "currency": "INR",
  "status": "pending",
  "timer": 600,
  "expires_at": "2026-02-17T12:10:00.000Z",
  "attempt_number": 1,
  "max_attempts": 3,
  "fallback_available": true,
  "commission_pct": 2.5,
  "commission_amount": 125,
  "net_amount": 4875,
  "usdt_rate": 87.45,
  "net_amount_usdt": 55.75,
  "trace_id": "abc123def456"
}
```

#### Response Fields

| Field | Description |
|-------|-------------|
| `payment_id` | Unique payment ID (use this for all subsequent calls) |
| `txn_id` | Transaction reference number |
| `upi_id` | UPI ID to display to customer |
| `holder_name` | Account holder name to display |
| `timer` | Seconds until payment expires |
| `expires_at` | ISO timestamp when payment expires |
| `fallback_available` | If true, customer can try a different UPI |
| `commission_pct` | Your commission rate (percentage) |
| `commission_amount` | Commission in INR |
| `net_amount` | Amount you'll receive after commission (INR) |
| `usdt_rate` | Current INR/USDT exchange rate |
| `net_amount_usdt` | Net amount in USDT (null if rate unavailable) |

#### What to Show Customer

Display a payment screen with:
- UPI ID: `merchant@okaxis`
- Name: `Rajesh Kumar`
- Amount: ₹5,000
- Timer: 10:00 countdown
- UTR input field
- "Try Different UPI" button (if `fallback_available` is true)

---

### 2. Submit UTR

After the customer pays via their UPI app, they enter the UTR (transaction reference number).

```
PATCH /v1/payin/submit-utr
```

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `payinId` | string | Yes | Payment ID from create response |
| `utrId` | string | Yes | UTR number (10-22 characters) |

#### Example Request

```json
{
  "payinId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "utrId": "412345678901"
}
```

#### Success Response (200)

```json
{
  "success": true,
  "message": "UTR submitted successfully. Payment is being verified.",
  "payinId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "status": "pending"
}
```

#### What Happens Next

1. Payment status remains `pending`
2. Trader sees the UTR in their dashboard
3. Trader verifies and clicks Accept/Reject
4. You receive a webhook with the final status

---

### 3. Get Payment Status

Check the current status of a payment. **Webhooks are recommended** over polling.

```
GET /v1/payin/status?payinId=<payment_id>
```

#### Query Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `payinId` | Yes | Payment ID |

#### Example Request

```
GET /v1/payin/status?payinId=f47ac10b-58cc-4372-a567-0e02b2c3d479
```

#### Success Response (200)

```json
{
  "success": true,
  "payin": {
    "payinId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "txnId": "TXN1708123456ABC",
    "orderId": "ORDER-2026-001",
    "amount": 5000,
    "status": "completed",
    "utrId": "412345678901",
    "userId": "cust_abc123",
    "createdAt": "2026-02-17T12:00:00.000Z",
    "completedAt": "2026-02-17T12:05:30.000Z",
    "expiresAt": "2026-02-17T12:10:00.000Z",
    "metadata": {
      "product": "Premium Plan"
    }
  }
}
```

---

### 4. Switch UPI (Fallback)

If the customer can't pay to the first UPI, they can request a different one.

```
POST /v1/payin/switch
```

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `paymentId` | string | Yes* | Payment ID |
| `orderId` | string | Yes* | Or use your order ID |

*Provide either `paymentId` or `orderId`

#### Example Request

```json
{
  "paymentId": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```

#### Success Response (200)

```json
{
  "success": true,
  "payment_id": "new-payment-uuid",
  "old_payment_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "upi_id": "different@ybl",
  "holder_name": "Another Trader",
  "attempt_number": 2,
  "max_attempts": 3,
  "fallback_available": true,
  "trace_id": "xyz789"
}
```

> **Note:** This creates a NEW payment. The old payment is marked as failed. Use the new `payment_id` for subsequent calls.

---

## Payment Status

| Status | Description |
|--------|-------------|
| `pending` | Payment created, waiting for customer |
| `completed` | Payment verified and approved |
| `rejected` | Payment rejected by trader |
| `expired` | Timer ran out |
| `failed` | Payment failed (e.g., switched to different UPI) |

---

## Webhooks

When a payment status changes, we send a POST request to your webhook URL.

### Webhook Payload

```json
{
  "event": "payment.completed",
  "timestamp": 1708171530000,
  "data": {
    "payinId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "txnId": "TXN1708123456ABC",
    "orderId": "ORDER-2026-001",
    "amount": 5000,
    "status": "completed",
    "utrId": "412345678901",
    "userId": "cust_abc123",
    "completedAt": "2026-02-17T12:05:30.000Z",
    "metadata": {}
  }
}
```

### Webhook Events

| Event | Description |
|-------|-------------|
| `payment.created` | Payment request created |
| `payment.completed` | Payment successful |
| `payment.rejected` | Payment rejected |
| `payment.expired` | Payment expired |
| `payment.failed` | Payment failed |

### Webhook Headers

| Header | Description |
|--------|-------------|
| `X-Webhook-Signature` | HMAC-SHA256 signature |
| `X-Webhook-Event` | Event type |
| `User-Agent` | `Pay2X-Webhooks/2.0` |

### Verifying Webhook Signature

```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(JSON.stringify(payload)).digest('hex');
  return signature === digest;
}

// Usage
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const isValid = verifyWebhook(req.body, signature, 'your_webhook_secret');
  
  if (!isValid) {
    return res.status(401).send('Invalid signature');
  }
  
  // Process webhook
  const { event, data } = req.body;
  
  if (event === 'payment.completed') {
    // Update order status, send confirmation email, etc.
  }
  
  res.status(200).send('OK');
});
```

---

## Error Codes

### HTTP Status Codes

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 400 | Bad Request - Invalid parameters |
| 401 | Unauthorized - Invalid API key |
| 402 | Payment Required - No UPIs available |
| 403 | Forbidden - Merchant inactive |
| 404 | Not Found - Payment not found |
| 409 | Conflict - Duplicate request |
| 429 | Too Many Requests - Rate limited |
| 500 | Internal Server Error |

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "AMOUNT_TOO_LOW",
    "message": "Amount is below minimum limit (₹100)",
    "details": {
      "amount": 50,
      "minimum": 100
    }
  },
  "trace_id": "abc123"
}
```

### Common Error Codes

| Code | HTTP | Description | Retryable |
|------|------|-------------|-----------|
| `AUTH_MISSING_KEY` | 401 | API key not provided | No |
| `AUTH_INVALID_KEY` | 401 | Invalid API key | No |
| `MERCHANT_INACTIVE` | 403 | Account is disabled | No |
| `AMOUNT_TOO_LOW` | 400 | Below ₹500 minimum | No |
| `AMOUNT_TOO_HIGH` | 400 | Above ₹50,000 maximum | No |
| `DUPLICATE_REQUEST` | 409 | Order ID already used | No |
| `UPI_UNAVAILABLE` | 402 | No UPIs available | Yes (60s) |
| `PAYMENT_NOT_FOUND` | 404 | Invalid payment ID | No |
| `MAX_ATTEMPTS_REACHED` | 400 | No more fallback UPIs | No |
| `RATE_LIMIT_MINUTE` | 429 | Too many requests | Yes (60s) |

---

## Rate Limits

| Plan | Per Minute | Per Hour | Per Day |
|------|------------|----------|---------|
| Free | 10 | 100 | 500 |
| Basic | 30 | 500 | 5,000 |
| Pro | 100 | 2,000 | 20,000 |
| Enterprise | Custom | Custom | Custom |

Rate limit headers are included in all responses:

```
X-RateLimit-Remaining: 28
X-RateLimit-Reset: 1708171590
```

---

## Integration Checklist

- [ ] Get API key from merchant dashboard
- [ ] Set up webhook URL in dashboard
- [ ] Implement create payin endpoint
- [ ] Build payment UI with UPI display
- [ ] Implement UTR submission
- [ ] Handle webhook events
- [ ] Implement signature verification
- [ ] Add error handling
- [ ] Test with sandbox key
- [ ] Switch to live key

---

## Code Examples

### Node.js / Express

```javascript
const axios = require('axios');

const PAY2X_API = 'https://api.pay2x.io';
const API_KEY = 'live_your_api_key';

// Create payment
async function createPayment(amount, userId, orderId) {
  const response = await axios.post(
    `${PAY2X_API}/v1/payin/create`,
    { amount, userId, orderId },
    { headers: { Authorization: `Bearer ${API_KEY}` } }
  );
  return response.data;
}

// Submit UTR
async function submitUTR(payinId, utrId) {
  const response = await axios.patch(
    `${PAY2X_API}/v1/payin/submit-utr`,
    { payinId, utrId },
    { headers: { Authorization: `Bearer ${API_KEY}` } }
  );
  return response.data;
}

// Check status
async function getStatus(payinId) {
  const response = await axios.get(
    `${PAY2X_API}/v1/payin/status?payinId=${payinId}`,
    { headers: { Authorization: `Bearer ${API_KEY}` } }
  );
  return response.data;
}
```

### Python

```python
import requests

PAY2X_API = 'https://api.pay2x.io'
API_KEY = 'live_your_api_key'
HEADERS = {'Authorization': f'Bearer {API_KEY}'}

def create_payment(amount, user_id, order_id=None):
    response = requests.post(
        f'{PAY2X_API}/v1/payin/create',
        json={'amount': amount, 'userId': user_id, 'orderId': order_id},
        headers=HEADERS
    )
    return response.json()

def submit_utr(payin_id, utr_id):
    response = requests.patch(
        f'{PAY2X_API}/v1/payin/submit-utr',
        json={'payinId': payin_id, 'utrId': utr_id},
        headers=HEADERS
    )
    return response.json()

def get_status(payin_id):
    response = requests.get(
        f'{PAY2X_API}/v1/payin/status?payinId={payin_id}',
        headers=HEADERS
    )
    return response.json()
```

### PHP

```php
<?php
$apiKey = 'live_your_api_key';
$baseUrl = 'https://api.pay2x.io';

function createPayment($amount, $userId, $orderId = null) {
    global $apiKey, $baseUrl;
    
    $ch = curl_init("$baseUrl/v1/payin/create");
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
        'amount' => $amount,
        'userId' => $userId,
        'orderId' => $orderId
    ]));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Authorization: Bearer $apiKey",
        'Content-Type: application/json'
    ]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    
    $response = curl_exec($ch);
    curl_close($ch);
    
    return json_decode($response, true);
}
```

---

## Support

- **Email:** support@pay2x.io
- **Dashboard:** https://pay2x.io/dashboard
- **Status Page:** https://status.pay2x.io

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | Feb 2026 | Added geo-scoring, fallback chain, rate limiting |
| 1.0 | Jan 2026 | Initial release |
