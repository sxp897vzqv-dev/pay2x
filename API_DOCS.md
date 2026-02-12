# Pay2X API Documentation

**Base URL:** `https://<project-ref>.supabase.co/functions/v1`

**Authentication:** Bearer token  
`Authorization: Bearer <live_api_key>`

---

## 1. Create Payin

Initiate a payment collection request.

**Endpoint:** `POST /create-payin`

### Request Headers
```
Authorization: Bearer <live_api_key>
Content-Type: application/json
X-Idempotency-Key: <unique_key> (optional)
```

### Request Body
```json
{
  "amount": 1000,
  "userId": "user_123",
  "orderId": "order_456",
  "description": "Premium subscription",
  "metadata": {
    "plan": "gold",
    "duration": "3_months"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| amount | number | ✅ | Amount in INR (100 - 100,000) |
| userId | string | ✅ | Your customer's unique ID |
| orderId | string | ❌ | Your order/transaction ID |
| description | string | ❌ | Payment description |
| metadata | object | ❌ | Custom data (returned in webhooks) |

### Success Response (200)
```json
{
  "success": true,
  "payment_id": "abc123",
  "txn_id": "TXN1707356789ABC",
  "order_id": "order_456",
  "upi_id": "merchant@upi",
  "holder_name": "Merchant Name",
  "amount": 1000,
  "currency": "INR",
  "status": "pending",
  "timer": 600,
  "expires_at": "2026-02-08T10:20:00Z",
  "trace_id": "abc123-def456"
}
```

### Error Responses
| Code | HTTP | Description |
|------|------|-------------|
| AUTH_MISSING_KEY | 401 | No API key provided |
| AUTH_INVALID_KEY | 401 | Invalid API key |
| MERCHANT_INACTIVE | 403 | Merchant account disabled |
| AMOUNT_TOO_LOW | 400 | Amount below ₹100 |
| AMOUNT_TOO_HIGH | 400 | Amount above ₹100,000 |
| DUPLICATE_REQUEST | 400 | orderId already used |
| UPI_UNAVAILABLE | 503 | No UPI available, retry later |
| RATE_LIMIT_EXCEEDED | 429 | Too many requests |

---

## 2. Get Payin Status

Check the status of a payment.

**Endpoint:** `GET /get-payin-status?payinId=<payment_id>`

### Request
```
GET /get-payin-status?payinId=abc123
Authorization: Bearer <live_api_key>
```

### Success Response (200)
```json
{
  "success": true,
  "payin": {
    "payinId": "abc123",
    "txnId": "TXN1707356789ABC",
    "orderId": "order_456",
    "amount": 1000,
    "status": "completed",
    "utrId": "123456789012",
    "userId": "user_123",
    "createdAt": "2026-02-08T10:10:00Z",
    "completedAt": "2026-02-08T10:15:00Z",
    "expiresAt": "2026-02-08T10:20:00Z",
    "metadata": {}
  }
}
```

### Status Values
| Status | Description |
|--------|-------------|
| pending | Awaiting payment |
| completed | Payment confirmed |
| expired | Timer expired |
| failed | Payment failed |
| disputed | Under dispute |

---

## 3. Create Payout

Request a bank transfer to a beneficiary.

**Endpoint:** `POST /create-payout`

### Request Body
```json
{
  "amount": 5000,
  "accountNumber": "50100807030844",
  "ifscCode": "HDFC0001234",
  "accountName": "John Doe",
  "bankName": "HDFC Bank",
  "orderId": "payout_789",
  "description": "Refund for order #123",
  "metadata": {}
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| amount | number | ✅ | Amount in INR (100 - 200,000) |
| accountNumber | string | ✅ | Bank account number |
| ifscCode | string | ✅ | IFSC code |
| accountName | string | ✅ | Account holder name |
| bankName | string | ❌ | Bank name |
| orderId | string | ❌ | Your payout reference ID |
| description | string | ❌ | Payout description |
| metadata | object | ❌ | Custom data |

### Success Response (200)
```json
{
  "success": true,
  "payout_id": "PO1707356789XYZ",
  "order_id": "payout_789",
  "amount": 5000,
  "fee": 100,
  "total_deducted": 5100,
  "status": "pending",
  "message": "Payout request created. Will be processed within 24 hours."
}
```

### Error Responses
| Code | HTTP | Description |
|------|------|-------------|
| INSUFFICIENT_BALANCE | 400 | Not enough balance for payout + fee |
| AMOUNT_TOO_LOW | 400 | Amount below ₹100 |
| AMOUNT_TOO_HIGH | 400 | Amount above ₹200,000 |
| DUPLICATE_ORDER | 400 | orderId already used |

---

## 4. Create Dispute

Raise a dispute for a transaction.

**Endpoint:** `POST /create-dispute`

### Request Body
```json
{
  "payinId": "abc123",
  "type": "payment_not_received",
  "reason": "Customer claims payment was made but not credited",
  "utr": "123456789012",
  "amount": 1000,
  "proofUrl": "https://example.com/screenshot.jpg"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| payinId | string | ❌* | Payin ID (if payin dispute) |
| payoutId | string | ❌* | Payout ID (if payout dispute) |
| type | string | ✅ | Dispute type (see below) |
| reason | string | ✅ | Detailed reason |
| utr | string | ❌ | UTR/Reference number |
| amount | number | ❌ | Disputed amount |
| proofUrl | string | ❌ | URL to proof image |

*Either payinId or payoutId is required.

### Dispute Types
- `payment_not_received` - Payment made but not credited
- `wrong_amount` - Incorrect amount credited
- `duplicate_payment` - Charged twice
- `refund_request` - Request for refund
- `payout_not_received` - Payout not received
- `other` - Other issues

### Success Response (200)
```json
{
  "success": true,
  "dispute_id": "disp_123",
  "status": "pending",
  "message": "Dispute created. You will be notified when it is resolved."
}
```

---

## 5. Webhooks

Pay2X sends webhooks to your configured URL for events.

### Webhook Headers
```
Content-Type: application/json
X-Pay2X-Signature: v1=<hmac_sha256_hex>
X-Pay2X-Timestamp: 1707356789
```

### Verify Signature (Node.js)
```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret, timestamp) {
  const message = `${timestamp}.${JSON.stringify(payload)}`;
  const expected = 'v1=' + crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

### Payin Events
```json
{
  "event": "payment.completed",
  "timestamp": "2026-02-08T10:15:00Z",
  "data": {
    "payment_id": "abc123",
    "txn_id": "TXN1707356789ABC",
    "order_id": "order_456",
    "amount": 1000,
    "status": "completed",
    "utr": "123456789012",
    "user_id": "user_123",
    "metadata": {}
  }
}
```

| Event | Description |
|-------|-------------|
| payment.created | Payment initiated |
| payment.completed | Payment confirmed |
| payment.expired | Payment timer expired |
| payment.failed | Payment failed |

### Payout Events
```json
{
  "event": "payout.completed",
  "timestamp": "2026-02-08T10:15:00Z",
  "data": {
    "payout_id": "PO1707356789XYZ",
    "order_id": "payout_789",
    "amount": 5000,
    "status": "completed",
    "utr": "987654321098",
    "account_number": "****0844",
    "ifsc_code": "HDFC0001234"
  }
}
```

| Event | Description |
|-------|-------------|
| payout.created | Payout request received |
| payout.completed | Payout sent successfully |
| payout.failed | Payout failed |

### Dispute Events
```json
{
  "event": "dispute.resolved",
  "timestamp": "2026-02-08T10:15:00Z",
  "data": {
    "dispute_id": "disp_123",
    "status": "admin_approved",
    "resolution": "Refund processed",
    "amount_refunded": 1000
  }
}
```

| Event | Description |
|-------|-------------|
| dispute.created | Dispute raised |
| dispute.routed | Assigned to trader |
| dispute.resolved | Admin decision made |

---

## Rate Limits

| Plan | Requests/min | Requests/day |
|------|--------------|--------------|
| Free | 10 | 100 |
| Starter | 30 | 1,000 |
| Business | 60 | 10,000 |
| Enterprise | 120 | Unlimited |

Rate limit headers:
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

---

## SDKs & Examples

### Node.js
```javascript
const Pay2X = require('pay2x-sdk');

const client = new Pay2X({
  apiKey: 'live_xxx',
  baseUrl: 'https://xxx.supabase.co/functions/v1'
});

// Create payin
const payment = await client.createPayin({
  amount: 1000,
  userId: 'user_123',
  orderId: 'order_456'
});

console.log(payment.upi_id); // Show to customer
```

### cURL
```bash
curl -X POST https://xxx.supabase.co/functions/v1/create-payin \
  -H "Authorization: Bearer live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"amount": 1000, "userId": "user_123"}'
```

---

## 5. Virtual Accounts API

Virtual Accounts let you generate unique bank account numbers for each customer. When customers transfer to their VA, funds are automatically credited to your merchant balance.

### 5.1 Generate Virtual Account

Create a new virtual account for a customer.

**Endpoint:** `POST /generate-virtual-account`

### Request Headers
```
X-API-Key: <live_api_key>
Content-Type: application/json
```

### Request Body
```json
{
  "customer_id": "cust_123",
  "customer_name": "John Doe",
  "customer_email": "john@example.com",
  "customer_phone": "9876543210",
  "expected_amount": 5000,
  "expires_in_days": 30,
  "auto_sweep": true,
  "metadata": {
    "plan": "premium"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| customer_id | string | ❌ | Your customer's unique ID |
| customer_name | string | ❌ | Customer's name (used as account holder name) |
| customer_email | string | ❌ | Customer email |
| customer_phone | string | ❌ | Customer phone |
| expected_amount | number | ❌ | Expected payment amount (null = any) |
| min_amount | number | ❌ | Minimum accepted amount |
| max_amount | number | ❌ | Maximum accepted amount |
| expires_in_days | number | ❌ | VA validity in days (null = no expiry) |
| auto_sweep | boolean | ❌ | Auto-credit to balance (default: true) |
| webhook_url | string | ❌ | Custom webhook URL for this VA |
| metadata | object | ❌ | Custom data |

### Success Response (200)
```json
{
  "success": true,
  "virtual_account": {
    "id": "va_abc123",
    "account_number": "TB123456789012",
    "ifsc_code": "TEST0000001",
    "bank_name": "Test Bank Ltd",
    "account_holder_name": "John Doe",
    "expected_amount": 5000,
    "min_amount": 1,
    "max_amount": 10000000,
    "expires_at": "2026-03-12T00:00:00Z",
    "customer_id": "cust_123"
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": "Invalid API key"
}
```

---

### 5.2 Get VA Transactions

List all VAs or get transactions for a specific VA.

**Endpoint:** `GET /get-va-transactions`

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| va_id | string | Get specific VA by ID |
| account_number | string | Get specific VA by account number |
| customer_id | string | Filter VAs by customer ID |
| status | string | Filter by status (active/expired/closed or pending/credited/failed for txns) |
| limit | number | Results per page (default: 50) |
| offset | number | Pagination offset |

### List All VAs
```
GET /get-va-transactions?limit=20&status=active
```

### Response
```json
{
  "success": true,
  "virtual_accounts": [
    {
      "id": "va_abc123",
      "account_number": "TB123456789012",
      "ifsc_code": "TEST0000001",
      "bank_name": "Test Bank Ltd",
      "status": "active",
      "total_collected": 15000,
      "transaction_count": 3,
      "customer_id": "cust_123",
      "customer_name": "John Doe",
      "expires_at": null,
      "created_at": "2026-02-10T10:00:00Z"
    }
  ],
  "pagination": {
    "total": 45,
    "limit": 20,
    "offset": 0
  }
}
```

### Get VA with Transactions
```
GET /get-va-transactions?account_number=TB123456789012
```

### Response
```json
{
  "success": true,
  "virtual_account": {
    "id": "va_abc123",
    "account_number": "TB123456789012",
    "ifsc_code": "TEST0000001",
    "bank_name": "Test Bank Ltd",
    "status": "active",
    "total_collected": 15000,
    "transaction_count": 3
  },
  "transactions": [
    {
      "id": "txn_xyz",
      "amount": 5000,
      "utr": "UTR123456",
      "sender_name": "Alice Smith",
      "status": "credited",
      "fee_amount": 100,
      "net_amount": 4900,
      "credited_at": "2026-02-10T11:00:00Z",
      "created_at": "2026-02-10T11:00:00Z"
    }
  ]
}
```

---

### 5.3 VA Webhook Events

When a payment is received on a virtual account, we'll send a webhook:

**Event:** `va.transaction.received`

```json
{
  "event": "va.transaction.received",
  "data": {
    "transaction_id": "txn_xyz",
    "virtual_account_id": "va_abc123",
    "account_number": "TB123456789012",
    "customer_id": "cust_123",
    "amount": 5000,
    "utr": "UTR123456",
    "sender_name": "Alice Smith",
    "status": "credited",
    "created_at": "2026-02-10T11:00:00Z"
  }
}
```

**Signature Verification:**
```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expected = 'v1=' + crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return signature === expected;
}

// Usage
const isValid = verifyWebhook(
  rawBody,
  req.headers['x-pay2x-signature'],
  process.env.WEBHOOK_SECRET
);
```

---

### 5.4 Virtual Account Flow

```
1. Merchant calls generate-virtual-account API
   → Returns unique VA number (e.g., TB123456789012)

2. Merchant shows VA details to customer:
   - Account Number: TB123456789012
   - IFSC: TEST0000001
   - Bank: Test Bank Ltd

3. Customer transfers money via NEFT/IMPS/UPI

4. Bank notifies Pay2X of deposit

5. Pay2X:
   - Records transaction
   - Credits merchant balance (if auto_sweep)
   - Sends webhook to merchant

6. Merchant receives webhook, updates customer status
```

---

## Support

- **Dashboard:** https://pay2x.io/admin
- **Email:** support@pay2x.io
- **Discord:** https://discord.gg/pay2x
