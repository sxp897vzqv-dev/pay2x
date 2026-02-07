# Pay2X API Documentation

**Base URL:** `https://api.pay2x.io/v1`

## Authentication

All API requests require an API key in the Authorization header:

```
Authorization: Bearer live_xxxxx
```

Get your API key from the Pay2X Merchant Dashboard → Settings → API Keys.

---

## Endpoints

### 1. Create Payin (Collect Payment)

**POST** `/payin/create`

Initiate a payment collection from a customer.

#### Request Headers
| Header | Required | Description |
|--------|----------|-------------|
| Authorization | Yes | `Bearer <your_api_key>` |
| Content-Type | Yes | `application/json` |
| X-Idempotency-Key | No | Unique key to prevent duplicate requests |

#### Request Body
```json
{
  "amount": 1000,
  "userId": "customer_123",
  "orderId": "ORDER_456",
  "description": "Payment for Order #456",
  "metadata": {
    "product": "Premium Plan",
    "customer_email": "customer@example.com"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| amount | number | Yes | Amount in INR (min: 100, max: 100000) |
| userId | string | Yes | Your customer's unique ID |
| orderId | string | No | Your order/transaction reference |
| description | string | No | Payment description |
| metadata | object | No | Custom data (returned in webhooks) |

#### Response
```json
{
  "success": true,
  "payment_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "txn_id": "TXN1234567890ABC",
  "order_id": "ORDER_456",
  "upi_id": "merchant@upi",
  "holder_name": "Merchant Name",
  "amount": 1000,
  "currency": "INR",
  "status": "pending",
  "timer": 600,
  "expires_at": "2024-01-01T12:10:00Z",
  "trace_id": "abc123def456"
}
```

#### Show to Customer
Display the UPI details to your customer:
- **UPI ID:** `upi_id`
- **Account Name:** `holder_name`  
- **Amount:** `amount`
- **Timer:** `timer` seconds to complete payment

---

### 2. Submit UTR (Customer Payment Proof)

**PATCH** `/payin/update`

Submit the UTR after customer makes payment.

#### Request Body
```json
{
  "payinId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "utrId": "123456789012"
}
```

#### Response
```json
{
  "success": true,
  "message": "UTR submitted successfully. Payment is being verified.",
  "payinId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "assigned"
}
```

---

### 3. Check Payment Status

**GET** `/payin/status?paymentId={payment_id}`

#### Response
```json
{
  "success": true,
  "payment_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "completed",
  "amount": 1000,
  "utr": "123456789012",
  "completed_at": "2024-01-01T12:05:00Z"
}
```

#### Payment Statuses
| Status | Description |
|--------|-------------|
| pending | Waiting for customer payment |
| assigned | UTR submitted, being verified |
| completed | Payment verified and credited |
| expired | Timer expired, no payment received |
| rejected | Payment rejected by verifier |

---

### 4. Create Payout (Send Money)

**POST** `/payout/create`

Send money to a beneficiary.

#### Request Body
```json
{
  "amount": 5000,
  "beneficiaryName": "John Doe",
  "paymentMode": "upi",
  "upiId": "john@upi",
  "purpose": "Refund for Order #123",
  "referenceId": "REF_789"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| amount | number | Yes | Amount in INR |
| beneficiaryName | string | Yes | Recipient's name |
| paymentMode | string | Yes | `upi` or `bank` |
| upiId | string | Conditional | Required if paymentMode is `upi` |
| accountNumber | string | Conditional | Required if paymentMode is `bank` |
| ifscCode | string | Conditional | Required if paymentMode is `bank` |
| purpose | string | No | Reason for payout |
| referenceId | string | No | Your reference ID |

#### Response
```json
{
  "success": true,
  "payout_id": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
  "amount": 5000,
  "fee": 100,
  "status": "queued",
  "message": "Payout queued for processing"
}
```

---

## Webhooks

Configure your webhook URL in the Merchant Dashboard.

### Webhook Headers
```
Content-Type: application/json
X-Pay2X-Signature: v1=<hmac_sha256_hex>
X-Pay2X-Event: payment.completed
X-Pay2X-Timestamp: 2024-01-01T12:05:00Z
```

### Verify Signature (Node.js)
```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expected = 'v1=' + crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return signature === expected;
}

// In your webhook handler
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-pay2x-signature'];
  const isValid = verifyWebhook(JSON.stringify(req.body), signature, 'your_webhook_secret');
  
  if (!isValid) {
    return res.status(401).send('Invalid signature');
  }
  
  // Process webhook
  const event = req.body;
  console.log('Event:', event.event);
  console.log('Payment ID:', event.payment_id);
  
  res.status(200).send('OK');
});
```

### Webhook Events

#### payment.created
```json
{
  "event": "payment.created",
  "payment_id": "a1b2c3d4...",
  "txn_id": "TXN123...",
  "amount": 1000,
  "status": "pending",
  "created_at": "2024-01-01T12:00:00Z"
}
```

#### payment.completed
```json
{
  "event": "payment.completed",
  "payment_id": "a1b2c3d4...",
  "txn_id": "TXN123...",
  "order_id": "ORDER_456",
  "amount": 1000,
  "status": "completed",
  "utr": "123456789012",
  "completed_at": "2024-01-01T12:05:00Z"
}
```

#### payout.completed
```json
{
  "event": "payout.completed",
  "payout_id": "b2c3d4e5...",
  "amount": 5000,
  "status": "completed",
  "utr": "987654321098",
  "completed_at": "2024-01-01T14:30:00Z"
}
```

---

## Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| AUTH_MISSING_KEY | 401 | No API key provided |
| AUTH_INVALID_KEY | 401 | Invalid API key |
| MERCHANT_INACTIVE | 403 | Merchant account is inactive |
| RATE_LIMIT_MINUTE | 429 | Too many requests |
| VALIDATION_ERROR | 400 | Invalid request parameters |
| AMOUNT_TOO_LOW | 400 | Amount below minimum (₹100) |
| AMOUNT_TOO_HIGH | 400 | Amount above maximum (₹100,000) |
| DUPLICATE_REQUEST | 409 | Duplicate order ID |
| UPI_UNAVAILABLE | 503 | No UPI available, retry later |
| INSUFFICIENT_BALANCE | 400 | Not enough balance for payout |

### Error Response Format
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Amount is required",
    "details": { "field": "amount" }
  },
  "trace_id": "abc123def456"
}
```

---

## Rate Limits

| Plan | Requests/Minute |
|------|-----------------|
| Free | 60 |
| Starter | 300 |
| Business | 1,000 |
| Enterprise | 5,000 |

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 55
X-RateLimit-Reset: 1704110400
```

---

## SDKs & Examples

### Node.js
```javascript
const Pay2X = require('pay2x-sdk');

const pay2x = new Pay2X({
  apiKey: 'live_xxxxx',
  baseUrl: 'https://api.pay2x.io/v1'
});

// Create payment
const payment = await pay2x.createPayin({
  amount: 1000,
  userId: 'customer_123',
  orderId: 'ORDER_456'
});

console.log('Show to customer:', payment.upi_id, payment.amount);
```

### PHP
```php
<?php
$apiKey = 'live_xxxxx';
$baseUrl = 'https://api.pay2x.io/v1';

$ch = curl_init($baseUrl . '/payin/create');
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Authorization: Bearer ' . $apiKey,
    'Content-Type: application/json'
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    'amount' => 1000,
    'userId' => 'customer_123',
    'orderId' => 'ORDER_456'
]));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

$response = json_decode(curl_exec($ch), true);
curl_close($ch);

echo "UPI: " . $response['upi_id'];
```

### Python
```python
import requests

api_key = 'live_xxxxx'
base_url = 'https://api.pay2x.io/v1'

response = requests.post(
    f'{base_url}/payin/create',
    headers={
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json'
    },
    json={
        'amount': 1000,
        'userId': 'customer_123',
        'orderId': 'ORDER_456'
    }
)

payment = response.json()
print(f"UPI: {payment['upi_id']}")
```

---

## Support

- **Email:** support@pay2x.io
- **Dashboard:** https://app.pay2x.io
- **Status:** https://status.pay2x.io
