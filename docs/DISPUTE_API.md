# Pay2X Dispute API Documentation

> **Base URL:** `https://api.pay2x.io`  
> **Version:** 2.0  
> **Last Updated:** February 2026

---

## Overview

The Dispute API allows merchants to raise disputes for payin and payout transactions. Disputes are routed to traders for resolution.

### Two Types of Disputes

| Type | When to Use |
|------|-------------|
| **Payin Dispute** | Customer paid but merchant says not credited |
| **Payout Dispute** | Trader marked payout complete but customer didn't receive |

---

## Authentication

```
Authorization: Bearer <your_live_api_key>
```

---

## Quick Start

### Payin Dispute (Payment Not Received)

```bash
curl -X POST https://api.pay2x.io/v1/dispute/create \
  -H "Authorization: Bearer live_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "payment_not_received",
    "upiId": "merchant@okaxis",
    "amount": 5000,
    "utr": "412345678901",
    "userId": "customer_123",
    "paymentDate": "2026-02-17",
    "receiptUrl": "https://...",
    "comment": "Customer paid but order not credited"
  }'
```

### Payout Dispute (Payout Not Received)

```bash
curl -X POST https://api.pay2x.io/v1/dispute/create \
  -H "Authorization: Bearer live_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "payout_not_received",
    "orderId": "WD-2026-001",
    "amount": 10000,
    "userId": "customer_123",
    "accountNumber": "1234567890",
    "accountName": "John Doe",
    "comment": "Customer says payout not received"
  }'
```

---

## Endpoints

### 1. Create Dispute

```
POST /v1/dispute/create
```

#### Dispute Types

| Type | Description | Category |
|------|-------------|----------|
| `payment_not_received` | Customer paid but not credited | Payin |
| `wrong_amount` | Credited wrong amount | Payin |
| `duplicate_payment` | Customer paid twice | Payin |
| `payout_not_received` | Payout not received by customer | Payout |
| `refund_request` | Requesting refund | Any |
| `other` | Other issues | Any |

---

#### Payin Dispute Request

For disputes where customer paid but merchant says not credited.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | ✅ Yes | `payment_not_received`, `wrong_amount`, or `duplicate_payment` |
| `amount` | number | ✅ Yes | Disputed amount in INR |
| `upiId` | string | ✅ One of | UPI ID the customer paid to |
| `payinId` | string | ✅ One of | Or provide the payin ID |
| `orderId` | string | ✅ One of | Or provide your order ID |
| `utr` | string | Recommended | UTR number from customer's payment |
| `userId` | string | Optional | Your customer's ID |
| `paymentDate` | string | Optional | Date of payment (YYYY-MM-DD) |
| `receiptUrl` | string | Optional | URL to payment screenshot/receipt |
| `comment` | string | Optional | Additional details |

**Example:**

```json
{
  "type": "payment_not_received",
  "upiId": "merchant@okaxis",
  "amount": 5000,
  "utr": "412345678901",
  "userId": "customer_123",
  "paymentDate": "2026-02-17",
  "receiptUrl": "https://storage.example.com/receipts/123.jpg",
  "comment": "Customer sent payment at 10:30 AM, shows successful on their side"
}
```

---

#### Payout Dispute Request

For disputes where trader says payout sent but customer didn't receive.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | ✅ Yes | `payout_not_received` |
| `amount` | number | ✅ Yes | Payout amount in INR |
| `payoutId` | string | ✅ One of | Payout ID |
| `orderId` | string | ✅ One of | Or your order ID |
| `userId` | string | Optional | Your customer's ID |
| `accountNumber` | string | Optional | Customer's bank account |
| `accountName` | string | Optional | Account holder name |
| `ifscCode` | string | Optional | Bank IFSC code |
| `comment` | string | Optional | Additional details |

**Example:**

```json
{
  "type": "payout_not_received",
  "orderId": "WD-2026-001",
  "amount": 10000,
  "userId": "customer_456",
  "accountNumber": "1234567890",
  "accountName": "John Doe",
  "ifscCode": "SBIN0001234",
  "comment": "Customer claims amount not received, trader says completed"
}
```

---

#### Success Response (200)

```json
{
  "success": true,
  "dispute_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "dispute_ref": "DSP1708123456ABCD",
  "type": "payment_not_received",
  "amount": 5000,
  "amount_usdt": 55.87,
  "usdt_rate": 89.50,
  "status": "routed_to_trader",
  "routed": true,
  "sla_deadline": "2026-02-19T10:00:00.000Z",
  "message": "Dispute created and sent to trader for review."
}
```

#### Response Fields

| Field | Description |
|-------|-------------|
| `dispute_id` | Unique dispute ID |
| `dispute_ref` | Human-readable reference |
| `amount` | Disputed amount in INR |
| `amount_usdt` | Disputed amount in USDT |
| `usdt_rate` | Current INR/USDT rate |
| `sla_deadline` | Trader must respond by this time |

---

### 2. Get Dispute Status

```
GET /v1/dispute/status?disputeId=<dispute_id>
```

#### Success Response (200)

```json
{
  "success": true,
  "dispute": {
    "dispute_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "dispute_ref": "DSP1708123456ABCD",
    "type": "payment_not_received",
    "status": "trader_accepted",
    "amount": 5000,
    "payin_id": "payin-uuid",
    "payout_id": null,
    "order_id": "ORDER-001",
    "upi_id": "merchant@okaxis",
    "utr": "412345678901",
    "reason": "Customer paid but order not credited",
    "proof_url": "https://...",
    "user_id": "customer_123",
    "payment_date": "2026-02-17",
    "created_at": "2026-02-17T10:00:00.000Z",
    "sla_deadline": "2026-02-19T10:00:00.000Z",
    "trader_response": {
      "decision": "received",
      "proof_url": "https://...",
      "statement": "Payment received in bank, credited now",
      "responded_at": "2026-02-17T12:00:00.000Z"
    }
  }
}
```

---

## Dispute Status

| Status | Description |
|--------|-------------|
| `pending` | Dispute created, waiting to be routed |
| `routed_to_trader` | Sent to trader for review |
| `trader_accepted` | Trader accepted (payment received) |
| `trader_rejected` | Trader rejected (payment not received) |
| `admin_approved` | Admin resolved in favor of merchant |
| `admin_rejected` | Admin resolved in favor of trader |
| `resolved` | Dispute resolved |
| `closed` | Dispute closed |

---

## Dispute Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PAYIN DISPUTE LIFECYCLE                              │
└─────────────────────────────────────────────────────────────────────────────┘

Step 1: Merchant raises dispute
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  POST /v1/dispute/create                                                    │
│  { type: "payment_not_received", upiId, amount, utr, receiptUrl, ... }     │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
Step 2: System routes to trader (auto or manual)
         │
         ▼
Step 3: Trader reviews dispute in dashboard
         │
         ├── PAYMENT FOUND → Trader accepts
         │   │
         │   └── Adds comment: "Payment found, credited"
         │       └── Status: trader_accepted
         │           └── Webhook: dispute.accepted
         │
         └── PAYMENT NOT FOUND → Trader rejects
             │
             └── Adds proof (bank statement) + comment
                 └── Status: trader_rejected
                     └── Webhook: dispute.rejected
         │
         ▼
Step 4: Admin reviews (if needed)
         │
         └── Final decision: admin_approved or admin_rejected
             └── Balance adjusted if applicable


┌─────────────────────────────────────────────────────────────────────────────┐
│                       PAYOUT DISPUTE LIFECYCLE                              │
└─────────────────────────────────────────────────────────────────────────────┘

Step 1: Merchant raises dispute (customer says not received)
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  POST /v1/dispute/create                                                    │
│  { type: "payout_not_received", orderId, amount, accountNumber, ... }      │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
Step 2: System routes to trader
         │
         ▼
Step 3: Trader reviews
         │
         ├── PAYOUT ACTUALLY SENT → Trader provides proof
         │   │
         │   └── Uploads transaction proof/screenshot
         │       └── Status: trader_rejected (claim rejected)
         │
         └── PAYOUT NOT SENT/FAILED → Trader accepts dispute
             │
             └── Acknowledges issue
                 └── Status: trader_accepted
                     └── Re-initiates payout or credits back
```

---

## Webhooks

When dispute status changes, we send a webhook to your URL.

### Webhook Events

| Event | Description |
|-------|-------------|
| `dispute.created` | Dispute created |
| `dispute.routed` | Routed to trader |
| `dispute.accepted` | Trader accepted (in merchant's favor) |
| `dispute.rejected` | Trader rejected (with proof) |
| `dispute.resolved` | Admin resolved |

### Webhook Payload

```json
{
  "event": "dispute.accepted",
  "timestamp": 1708171530000,
  "data": {
    "dispute_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "dispute_ref": "DSP1708123456ABCD",
    "type": "payment_not_received",
    "status": "trader_accepted",
    "amount": 5000,
    "order_id": "ORDER-001",
    "trader_response": {
      "decision": "received",
      "statement": "Payment found and credited"
    },
    "resolved_at": "2026-02-17T12:00:00.000Z"
  }
}
```

---

## Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `AUTH_MISSING_KEY` | 401 | API key not provided |
| `AUTH_INVALID_KEY` | 401 | Invalid API key |
| `MISSING_TYPE` | 400 | Dispute type required |
| `MISSING_AMOUNT` | 400 | Amount required |
| `MISSING_REFERENCE` | 400 | Need payinId, payoutId, upiId, or orderId |
| `DISPUTE_EXISTS` | 400 | Open dispute already exists for this transaction |
| `NOT_FOUND` | 404 | Dispute not found |

---

## Code Examples

### Node.js

```javascript
const axios = require('axios');

const PAY2X_API = 'https://api.pay2x.io';
const API_KEY = 'live_your_api_key';

// Create payin dispute
async function createPayinDispute(data) {
  const response = await axios.post(
    `${PAY2X_API}/v1/dispute/create`,
    {
      type: 'payment_not_received',
      ...data
    },
    { headers: { Authorization: `Bearer ${API_KEY}` } }
  );
  return response.data;
}

// Example
const dispute = await createPayinDispute({
  upiId: 'merchant@okaxis',
  amount: 5000,
  utr: '412345678901',
  userId: 'customer_123',
  receiptUrl: 'https://...',
  comment: 'Customer paid but not credited'
});

// Check status
async function getDisputeStatus(disputeId) {
  const response = await axios.get(
    `${PAY2X_API}/v1/dispute/status?disputeId=${disputeId}`,
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

def create_payin_dispute(upi_id, amount, utr, user_id=None, receipt_url=None, comment=None):
    response = requests.post(
        f'{PAY2X_API}/v1/dispute/create',
        json={
            'type': 'payment_not_received',
            'upiId': upi_id,
            'amount': amount,
            'utr': utr,
            'userId': user_id,
            'receiptUrl': receipt_url,
            'comment': comment
        },
        headers=HEADERS
    )
    return response.json()

def create_payout_dispute(order_id, amount, user_id=None, account_number=None, comment=None):
    response = requests.post(
        f'{PAY2X_API}/v1/dispute/create',
        json={
            'type': 'payout_not_received',
            'orderId': order_id,
            'amount': amount,
            'userId': user_id,
            'accountNumber': account_number,
            'comment': comment
        },
        headers=HEADERS
    )
    return response.json()

def get_dispute_status(dispute_id):
    response = requests.get(
        f'{PAY2X_API}/v1/dispute/status?disputeId={dispute_id}',
        headers=HEADERS
    )
    return response.json()
```

---

## SLA & Resolution Time

| Priority | Response Time |
|----------|---------------|
| Standard | 48 hours |
| Escalated | 24 hours |
| Critical | 4 hours |

Disputes are auto-escalated if not resolved within SLA.

---

## Best Practices

1. **Always provide UTR** for payin disputes — makes routing easier
2. **Include receipt/proof** — faster resolution
3. **Use orderId** — helps match transactions
4. **Don't create duplicate disputes** — check existing first
5. **Handle webhooks** — get instant updates

---

## Support

- **Email:** support@pay2x.io
- **Dashboard:** https://pay2x.io/dashboard

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 2.1 | Feb 2026 | Added amount, USDT rate, SLA deadline to response |
| 2.0 | Feb 2026 | Separate payin/payout dispute flows, added SLA |
| 1.0 | Jan 2026 | Initial release |
