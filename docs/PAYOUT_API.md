# Pay2X Payout API Documentation

> **Base URL:** `https://api.pay2x.io`  
> **Version:** 2.0  
> **Last Updated:** February 2026

---

## Overview

The Payout API allows merchants to send money to their customers via Bank Transfer (IMPS/NEFT) or UPI.

**Payout Flow:**
1. Merchant submits payout request with beneficiary details
2. System assigns payout to an available trader
3. Trader completes the transfer
4. Merchant receives webhook confirmation

---

## Authentication

All API requests require a Bearer token in the Authorization header.

```
Authorization: Bearer <your_live_api_key>
```

---

## How It Works

1. **Merchant provides ALL details** — Bank account + UPI ID
2. **Trader chooses method** — Bank Transfer (IMPS/NEFT) or UPI
3. **Trader completes payout** — Enters UTR as proof
4. **Merchant gets webhook** — With completion details

---

## Quick Start

```bash
curl -X POST https://api.pay2x.io/v1/payout/create \
  -H "Authorization: Bearer live_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 10000,
    "accountName": "John Doe",
    "accountNumber": "1234567890123",
    "ifscCode": "SBIN0001234",
    "upiId": "johndoe@okaxis",
    "bankName": "State Bank of India",
    "userId": "customer_123",
    "orderId": "WITHDRAWAL-001"
  }'
```

---

## Endpoints

### 1. Create Payout

Creates a new payout request to send money to a beneficiary.

```
POST /v1/payout/create
```

#### Request Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes | `Bearer <api_key>` |
| `Content-Type` | Yes | `application/json` |

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | number | ✅ Yes | Amount in INR (₹100 - ₹2,00,000) |
| `accountName` | string | ✅ Yes | Beneficiary's full name |
| `accountNumber` | string | ✅ Yes | Bank account number |
| `ifscCode` | string | ✅ Yes | Bank IFSC code |
| `upiId` | string | ✅ Yes | UPI ID (e.g., name@upi) |
| `bankName` | string | No | Bank name (optional) |
| `userId` | string | No | Your customer's ID |
| `orderId` | string | No | Your unique reference |
| `metadata` | object | No | Any additional data |

> **Note:** ALL payment details (Bank + UPI) are required. The trader will choose which method to use.

#### Example Request

```json
{
  "amount": 25000,
  "accountName": "Priya Sharma",
  "accountNumber": "50100123456789",
  "ifscCode": "HDFC0001234",
  "upiId": "priya.sharma@okicici",
  "bankName": "HDFC Bank",
  "userId": "user_456",
  "orderId": "WD-2026-001",
  "metadata": {
    "reason": "Refund",
    "original_order": "ORD-123"
  }
}
```

#### Success Response (200)

```json
{
  "success": true,
  "payout_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "txn_id": "PO1708123456ABCD",
  "order_id": "WD-2026-001",
  "user_id": "user_456",
  "amount": 25000,
  "fee": 500,
  "total_on_completion": 25500,
  "status": "pending",
  "message": "Payout request created. Trader will choose Bank or UPI method."
}
```

#### Response Fields

| Field | Description |
|-------|-------------|
| `payout_id` | Unique payout ID (use for status checks) |
| `txn_id` | Transaction reference number |
| `fee` | Platform fee (percentage of amount) |
| `total_on_completion` | Amount + Fee (deducted when completed) |
| `status` | Initial status is `pending` |

#### Important Notes

- **Balance is NOT deducted on creation** — only when payout is completed
- Payout is assigned to a trader automatically
- Trader completes the transfer and provides UTR
- You receive a webhook when status changes

---

### 2. Get Payout Status

Check the current status of a payout.

```
GET /v1/payout/status?payoutId=<payout_id>
```

#### Query Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `payoutId` | Yes | Payout ID from create response |

#### Example Request

```
GET /v1/payout/status?payoutId=f47ac10b-58cc-4372-a567-0e02b2c3d479
```

#### Success Response (200)

```json
{
  "success": true,
  "payout": {
    "payout_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "txn_id": "PO1708123456ABCD",
    "order_id": "WD-2026-001",
    "user_id": "user_456",
    "amount": 25000,
    "fee": 500,
    "status": "completed",
    "account_number": "*********6789",
    "ifsc_code": "HDFC0001234",
    "bank_name": "HDFC Bank",
    "upi_id": "priya.sharma@okicici",
    "account_name": "Priya Sharma",
    "utr": "HDFC12345678901234",
    "method_used": "bank",
    "created_at": "2026-02-17T10:00:00.000Z",
    "completed_at": "2026-02-17T11:30:00.000Z"
  }
}
```

---

## Payout Status

| Status | Description |
|--------|-------------|
| `pending` | Payout created, waiting to be assigned |
| `assigned` | Assigned to a trader |
| `processing` | Trader is processing the transfer |
| `completed` | Money sent successfully (UTR available) |
| `rejected` | Payout rejected |
| `cancelled` | Payout cancelled |
| `failed` | Payout failed |

---

## Payout Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PAYOUT LIFECYCLE                                   │
└─────────────────────────────────────────────────────────────────────────────┘

Step 1: Merchant submits payout request (with Bank + UPI details)
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  POST /v1/payout/create                                                     │
│  { amount, accountName, accountNumber, ifscCode, upiId, userId, orderId }  │
│                                                                             │
│  Returns: { payout_id, txn_id, status: "pending" }                         │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
Step 2: System assigns payout to trader
         │
         ▼
Step 3: Trader sees payout in dashboard (both Bank & UPI shown)
         │
         ├── Trader CHOOSES method (Bank or UPI)
         │
         ├── Trader completes transfer → Enters UTR
         │   │
         │   ▼
         │   status = "completed" (includes method_used)
         │   └── Webhook: payout.completed (with UTR)
         │
         └── Trader rejects → status = "rejected"
             └── Webhook: payout.rejected
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  WEBHOOK → Merchant's URL                                                   │
│  {                                                                          │
│    "event": "payout.completed",                                            │
│    "data": {                                                                │
│      "payout_id": "xxx",                                                   │
│      "txn_id": "PO...",                                                    │
│      "amount": 25000,                                                      │
│      "utr": "HDFC12345678901234",                                         │
│      "completed_at": "2026-02-17T11:30:00.000Z"                           │
│    }                                                                        │
│  }                                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
Step 4: Merchant credits customer (optional: poll status)
┌─────────────────────────────────────────────────────────────────────────────┐
│  GET /v1/payout/status?payoutId=xxx                                        │
│                                                                             │
│  Returns: { status: "completed", utr: "...", completed_at: "..." }        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Webhooks

When payout status changes, we send a POST request to your webhook URL.

### Webhook Events

| Event | Description |
|-------|-------------|
| `payout.created` | Payout request created |
| `payout.assigned` | Assigned to trader |
| `payout.completed` | Money sent successfully |
| `payout.rejected` | Payout rejected |
| `payout.cancelled` | Payout cancelled |
| `payout.failed` | Payout failed |

### Webhook Payload - Completed

```json
{
  "event": "payout.completed",
  "timestamp": 1708171530000,
  "data": {
    "payout_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "txn_id": "PO1708123456ABCD",
    "order_id": "WD-2026-001",
    "user_id": "user_456",
    "amount": 25000,
    "fee": 500,
    "status": "completed",
    "method_used": "bank",
    "account_number": "*********6789",
    "ifsc_code": "HDFC0001234",
    "bank_name": "HDFC Bank",
    "upi_id": "priya.sharma@okicici",
    "account_name": "Priya Sharma",
    "utr": "HDFC12345678901234",
    "completed_at": "2026-02-17T11:30:00.000Z"
  }
}
```

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
```

---

## Error Codes

### Common Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `AUTH_MISSING_KEY` | 401 | API key not provided |
| `AUTH_INVALID_KEY` | 401 | Invalid API key |
| `MERCHANT_INACTIVE` | 403 | Account is disabled |
| `MISSING_FIELDS` | 400 | Required fields missing (amount, accountName, accountNumber, ifscCode, upiId) |
| `AMOUNT_TOO_LOW` | 400 | Below ₹100 minimum |
| `AMOUNT_TOO_HIGH` | 400 | Above ₹2,00,000 maximum |
| `DUPLICATE_ORDER` | 400 | Order ID already used |
| `NOT_FOUND` | 404 | Payout not found |

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "MISSING_PAYOUT_METHOD",
    "message": "Provide either (accountNumber + ifscCode) for bank transfer OR upiId for UPI transfer"
  }
}
```

---

## Fees

Payout fees are calculated as a percentage of the amount:

| Plan | Fee Rate |
|------|----------|
| Default | 2% |
| Custom | Negotiable |

**Example:**
- Amount: ₹10,000
- Fee (2%): ₹200
- Total deducted on completion: ₹10,200

---

## Code Examples

### Node.js

```javascript
const axios = require('axios');

const PAY2X_API = 'https://api.pay2x.io';
const API_KEY = 'live_your_api_key';

// Create payout (both bank + UPI required, trader chooses method)
async function createPayout(data) {
  const response = await axios.post(
    `${PAY2X_API}/v1/payout/create`,
    data,
    { headers: { Authorization: `Bearer ${API_KEY}` } }
  );
  return response.data;
}

// Example usage
const payout = await createPayout({
  amount: 10000,
  accountName: 'John Doe',
  accountNumber: '1234567890123',
  ifscCode: 'SBIN0001234',
  upiId: 'johndoe@okaxis',
  bankName: 'State Bank',
  userId: 'customer_123',
  orderId: 'WD-001'
});

// Check status
async function getPayoutStatus(payoutId) {
  const response = await axios.get(
    `${PAY2X_API}/v1/payout/status?payoutId=${payoutId}`,
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

def create_payout(amount, account_name, account_number, ifsc, upi_id, 
                  bank_name=None, user_id=None, order_id=None):
    response = requests.post(
        f'{PAY2X_API}/v1/payout/create',
        json={
            'amount': amount,
            'accountName': account_name,
            'accountNumber': account_number,
            'ifscCode': ifsc,
            'upiId': upi_id,
            'bankName': bank_name,
            'userId': user_id,
            'orderId': order_id
        },
        headers=HEADERS
    )
    return response.json()

def get_payout_status(payout_id):
    response = requests.get(
        f'{PAY2X_API}/v1/payout/status?payoutId={payout_id}',
        headers=HEADERS
    )
    return response.json()

# Example
payout = create_payout(
    amount=10000,
    account_name='John Doe',
    account_number='1234567890123',
    ifsc='SBIN0001234',
    upi_id='johndoe@okaxis',
    order_id='WD-001'
)
```

### PHP

```php
<?php
$apiKey = 'live_your_api_key';
$baseUrl = 'https://api.pay2x.io';

function createPayout($data) {
    global $apiKey, $baseUrl;
    
    $ch = curl_init("$baseUrl/v1/payout/create");
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Authorization: Bearer $apiKey",
        'Content-Type: application/json'
    ]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    
    $response = curl_exec($ch);
    curl_close($ch);
    
    return json_decode($response, true);
}

// Create payout (both bank + UPI required)
$payout = createPayout([
    'amount' => 10000,
    'accountName' => 'John Doe',
    'accountNumber' => '1234567890123',
    'ifscCode' => 'SBIN0001234',
    'upiId' => 'johndoe@upi',
    'orderId' => 'WD-001'
]);
```

---

## IFSC Code Lookup

Need to find IFSC code? Use Razorpay's free API:

```
GET https://ifsc.razorpay.com/HDFC0001234
```

---

## Best Practices

1. **Always store `payout_id`** — You'll need it to track status
2. **Use `orderId`** — Helps you match payouts with your orders
3. **Handle webhooks** — Don't rely only on polling
4. **Verify signatures** — Always verify webhook authenticity
5. **Idempotency** — Use unique `orderId` to prevent duplicates

---

## Support

- **Email:** support@pay2x.io
- **Dashboard:** https://pay2x.io/dashboard

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | Feb 2026 | Added UPI payout support, userId field |
| 1.0 | Jan 2026 | Initial release |
