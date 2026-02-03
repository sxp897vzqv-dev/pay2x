# 🔔 Webhook Guide for Merchants

## What Are Webhooks?

**Webhooks = Real-time Notifications**

Instead of constantly checking "Did my payment complete?", webhooks **automatically notify your server** when something happens.

Think of it like:
- ❌ **Without Webhooks:** You keep calling us asking "Is it done yet?"
- ✅ **With Webhooks:** We call YOU the moment it's done

---

## How It Works

```
Customer pays ₹1000
    ↓
Payment completes on pay2x
    ↓
pay2x sends HTTPS POST to YOUR server
    ↓
Your server receives notification instantly
    ↓
You update order status, send receipt, etc.
```

---

## 📋 Supported Events

### **1. Payin Events (Money IN)**

| Event | When It Fires | What It Means |
|-------|--------------|---------------|
| `payin.pending` | Payment initiated | Customer started payment |
| `payin.success` | Payment confirmed | ✅ Money received, credit merchant |
| `payin.failed` | Payment failed | ❌ Customer payment declined |

### **2. Payout Events (Money OUT)**

| Event | When It Fires | What It Means |
|-------|--------------|---------------|
| `payout.queued` | Payout created | Waiting for processing |
| `payout.processing` | Trader assigned | Being processed now |
| `payout.completed` | Sent successfully | ✅ Money sent to customer |
| `payout.failed` | Send failed | ❌ Could not send (refund merchant) |

### **3. Dispute Events**

| Event | When It Fires | What It Means |
|-------|--------------|---------------|
| `dispute.created` | Customer raised dispute | New dispute opened |
| `dispute.resolved` | Admin resolved | Dispute closed (check outcome) |
| `dispute.approved` | Approved for customer | Refund customer |
| `dispute.rejected` | Rejected | No refund needed |

---

## 🔧 Setup Instructions

### Step 1: Create a Webhook Endpoint

**Your Server (Example: Node.js/Express)**

```javascript
// POST /webhook
app.post('/webhook', (req, res) => {
  const event = req.body;
  
  console.log('Webhook received:', event.type);
  
  // Respond immediately (important!)
  res.status(200).send('OK');
  
  // Process event asynchronously
  processWebhook(event);
});

function processWebhook(event) {
  if (event.type === 'payin.success') {
    // Update order status
    updateOrder(event.orderId, 'paid');
    
    // Send receipt to customer
    sendReceipt(event.customerId, event.amount);
  }
  
  if (event.type === 'payout.completed') {
    // Mark payout as sent
    markPayoutComplete(event.payoutId);
  }
  
  if (event.type === 'dispute.approved') {
    // Refund customer
    processRefund(event.transactionId);
  }
}
```

**Key Rules:**
1. ✅ **Respond with 200 OK immediately** (within 5 seconds)
2. ✅ **Process the event after responding** (don't keep webhook waiting)
3. ✅ **Handle duplicates** (same event may be sent multiple times)
4. ✅ **Verify signature** (see security section below)

---

### Step 2: Configure Webhook in pay2x

1. Go to **API & Webhooks** in merchant dashboard
2. Enter your webhook URL: `https://yourdomain.com/webhook`
3. Select events you want:
   - ✅ `payin.success`
   - ✅ `payin.failed`
   - ✅ `payout.completed`
   - ✅ `dispute.resolved`
4. Click **Save Configuration**
5. Click **Test Webhook** to verify it works

---

### Step 3: Test Your Webhook

**Manual Test:**
```bash
# Send test event to your server
curl -X POST https://yourdomain.com/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event": "payin.success",
    "orderId": "test_123",
    "amount": 1000,
    "status": "completed"
  }'
```

**From pay2x Dashboard:**
1. Go to **API & Webhooks → Logs** tab
2. Click **Test Webhook**
3. Check your server logs for the test event

---

## 📦 Webhook Payload Examples

### Payin Success
```json
{
  "event": "payin.success",
  "timestamp": 1738589800000,
  "data": {
    "orderId": "order_abc123",
    "transactionId": "txn_xyz789",
    "customerId": "cust_456",
    "amount": 1000,
    "currency": "INR",
    "status": "completed",
    "paymentMethod": "UPI",
    "completedAt": "2026-02-03T15:30:00Z",
    "metadata": {
      "customerName": "John Doe",
      "customerEmail": "john@example.com"
    }
  }
}
```

### Payout Completed
```json
{
  "event": "payout.completed",
  "timestamp": 1738589900000,
  "data": {
    "payoutId": "payout_def456",
    "beneficiaryName": "Jane Smith",
    "amount": 5000,
    "currency": "INR",
    "status": "completed",
    "paymentMode": "upi",
    "upiId": "jane@paytm",
    "utrId": "UTR123456789",
    "completedAt": "2026-02-03T16:00:00Z"
  }
}
```

### Dispute Approved
```json
{
  "event": "dispute.approved",
  "timestamp": 1738590000000,
  "data": {
    "disputeId": "dispute_ghi789",
    "transactionId": "txn_xyz789",
    "orderId": "order_abc123",
    "amount": 1000,
    "reason": "Product not received",
    "resolution": "approved",
    "refundAmount": 1000,
    "resolvedAt": "2026-02-03T16:30:00Z"
  }
}
```

---

## 🔐 Security: Verify Webhook Signature

**Why?** Ensure webhooks are actually from pay2x, not attackers.

### Step 1: Get Your Webhook Secret

In **API & Webhooks** dashboard, you'll see:
```
Webhook Secret: whsec_8f7d57edef41cec41a367ca748191b1f...
```

**Keep this SECRET!** Don't commit to git.

---

### Step 2: Verify Signature (Node.js Example)

```javascript
const crypto = require('crypto');

app.post('/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const payload = JSON.stringify(req.body);
  
  // Verify signature
  const expectedSignature = crypto
    .createHmac('sha256', process.env.WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');
  
  if (signature !== expectedSignature) {
    console.error('❌ Invalid webhook signature!');
    return res.status(401).send('Unauthorized');
  }
  
  // ✅ Signature valid, process webhook
  res.status(200).send('OK');
  processWebhook(req.body);
});
```

**Other Languages:**

**PHP:**
```php
$signature = $_SERVER['HTTP_X_WEBHOOK_SIGNATURE'];
$payload = file_get_contents('php://input');
$expectedSignature = hash_hmac('sha256', $payload, getenv('WEBHOOK_SECRET'));

if ($signature !== $expectedSignature) {
  http_response_code(401);
  die('Unauthorized');
}
```

**Python:**
```python
import hmac
import hashlib

signature = request.headers.get('X-Webhook-Signature')
payload = request.get_data()
expected_signature = hmac.new(
    os.environ['WEBHOOK_SECRET'].encode(),
    payload,
    hashlib.sha256
).hexdigest()

if signature != expected_signature:
    return 'Unauthorized', 401
```

---

## ⚠️ Common Mistakes & Solutions

### Mistake 1: Slow Response
```javascript
// ❌ BAD - Webhook times out
app.post('/webhook', async (req, res) => {
  await updateDatabase(req.body); // Takes 10 seconds
  res.send('OK'); // Too late!
});

// ✅ GOOD - Respond immediately
app.post('/webhook', (req, res) => {
  res.send('OK'); // Respond first
  updateDatabase(req.body); // Process later
});
```

---

### Mistake 2: Not Handling Duplicates
```javascript
// ❌ BAD - Processes same payment twice
function processPayin(event) {
  creditMerchant(event.amount); // Duplicate = double credit!
}

// ✅ GOOD - Check if already processed
function processPayin(event) {
  if (alreadyProcessed(event.transactionId)) {
    console.log('Already processed, skipping');
    return;
  }
  creditMerchant(event.amount);
  markAsProcessed(event.transactionId);
}
```

---

### Mistake 3: Exposing Webhook URL
```javascript
// ❌ BAD - Anyone can send fake webhooks
app.post('/webhook', (req, res) => {
  processPayment(req.body); // No verification!
});

// ✅ GOOD - Verify signature
app.post('/webhook', (req, res) => {
  if (!verifySignature(req)) {
    return res.status(401).send('Unauthorized');
  }
  processPayment(req.body);
});
```

---

## 🧪 Testing Checklist

- [ ] Webhook URL is HTTPS (not HTTP)
- [ ] Server responds within 5 seconds
- [ ] Signature verification works
- [ ] Duplicate events are handled
- [ ] Database updates correctly
- [ ] Error handling exists
- [ ] Logs are being captured
- [ ] Test event received successfully

---

## 📊 Webhook Retry Logic

If your server is down or doesn't respond:

1. **Retry 1:** After 1 minute
2. **Retry 2:** After 5 minutes
3. **Retry 3:** After 30 minutes
4. **Final:** After 2 hours

**Total attempts:** 4  
**Status:** Check **API & Webhooks → Logs** tab

**If all fail:**
- Status: `failed`
- Action: Click "Retry" manually

---

## 🎯 Best Practices

### 1. **Idempotency**
Use `transactionId` or `payoutId` as unique key:
```javascript
const processed = await db.webhooks.findOne({ transactionId });
if (processed) return; // Already handled
```

### 2. **Logging**
Log every webhook:
```javascript
await db.webhookLogs.insert({
  event: req.body.event,
  transactionId: req.body.data.transactionId,
  receivedAt: new Date(),
  processed: false
});
```

### 3. **Async Processing**
Use job queue (Redis, RabbitMQ):
```javascript
app.post('/webhook', (req, res) => {
  res.send('OK');
  queue.add('process-webhook', req.body);
});
```

### 4. **Error Alerts**
Alert yourself if webhook fails:
```javascript
try {
  processWebhook(event);
} catch (err) {
  sendAlert('Webhook processing failed: ' + err.message);
}
```

---

## 🚀 Quick Start (Copy-Paste Ready)

**Minimal Working Example (Express.js):**

```javascript
const express = require('express');
const crypto = require('crypto');
const app = express();

app.use(express.json());

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const processedIds = new Set(); // In production, use database

app.post('/webhook', (req, res) => {
  // 1. Verify signature
  const signature = req.headers['x-webhook-signature'];
  const payload = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');
  
  if (signature !== expectedSignature) {
    return res.status(401).send('Unauthorized');
  }
  
  // 2. Respond immediately
  res.status(200).send('OK');
  
  // 3. Process asynchronously
  const event = req.body;
  const txnId = event.data.transactionId || event.data.payoutId;
  
  if (processedIds.has(txnId)) {
    console.log('Duplicate webhook, skipping');
    return;
  }
  
  processedIds.add(txnId);
  
  // Handle events
  switch (event.event) {
    case 'payin.success':
      console.log(`✅ Payment received: ₹${event.data.amount}`);
      // Update your database
      break;
      
    case 'payout.completed':
      console.log(`✅ Payout sent: ₹${event.data.amount}`);
      // Mark as completed
      break;
      
    case 'dispute.approved':
      console.log(`⚠️ Dispute approved, refund ₹${event.data.amount}`);
      // Process refund
      break;
  }
});

app.listen(3000, () => {
  console.log('Webhook server running on port 3000');
});
```

---

## 📞 Support

**Webhook not working?**

1. Check **API & Webhooks → Logs** tab
2. Look for delivery status and error messages
3. Verify your server is reachable (use ngrok for local testing)
4. Contact support with webhook log ID

**Need Help?**
- Email: support@pay2x.com
- Docs: https://docs.pay2x.com/webhooks
- Discord: https://discord.gg/pay2x

---

Last Updated: 2026-02-03
