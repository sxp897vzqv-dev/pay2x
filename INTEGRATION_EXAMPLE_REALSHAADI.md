# 🔗 Integration Example: realshaadi.com ↔ pay2x

## Overview

**Players:**
- **pay2x** = Payment Gateway (YOU)
- **realshaadi.com** = Merchant (YOUR CUSTOMER)

**Merchant Credentials:**
- API Key: `live_1770122628828_fwksi7`
- Webhook Secret: `whsec_8f7d57edef41cec41a367ca748191b1f5dfb7a398525225b378b8bc727f2d7a2`

---

## 📊 Flow Diagram

```
Customer on realshaadi.com
    ↓
Wants to pay ₹1000 for premium membership
    ↓
realshaadi calls pay2x API to create payin
    ↓
pay2x assigns trader, processes payment
    ↓
Payment completes
    ↓
pay2x sends webhook to realshaadi
    ↓
realshaadi activates membership
```

---

## 🔧 Step-by-Step Implementation

### **STEP 1: Realshaadi Creates Payin**

**Scenario:** User wants to buy ₹1,000 premium membership

**Realshaadi Backend (Node.js example):**

```javascript
// realshaadi server - Create payin request
const axios = require('axios');

async function createPayin(userId, amount, orderId) {
  const response = await axios.post('https://api.pay2x.com/v1/payin', {
    orderId: orderId,           // realshaadi's order ID
    amount: amount,              // 1000
    currency: 'INR',
    customerId: userId,          // realshaadi user ID
    customerEmail: 'user@example.com',
    customerPhone: '+919876543210',
    returnUrl: 'https://realshaadi.com/payment/success',
    cancelUrl: 'https://realshaadi.com/payment/cancel',
    metadata: {
      plan: 'premium',
      duration: '1-year'
    }
  }, {
    headers: {
      'Authorization': `Bearer live_1770122628828_fwksi7`,
      'Content-Type': 'application/json'
    }
  });
  
  return response.data;
  // Returns: { paymentUrl: 'https://pay2x.com/pay/abc123', transactionId: 'txn_xyz' }
}

// Usage
const paymentLink = await createPayin('user_123', 1000, 'order_456');
// Redirect customer to paymentLink.paymentUrl
```

---

### **STEP 2: pay2x Processes Payment**

**pay2x Backend (Firebase Cloud Function):**

```javascript
// pay2x backend - Process payin
exports.processPayin = functions.https.onRequest(async (req, res) => {
  const { orderId, amount, customerId } = req.body;
  
  // 1. Verify API key
  const apiKey = req.headers.authorization?.replace('Bearer ', '');
  const merchant = await verifyApiKey(apiKey);
  if (!merchant) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  // 2. Create payin document
  const payinId = generateId();
  await db.collection('payin').add({
    id: payinId,
    merchantId: merchant.uid,
    orderId: orderId,
    amount: amount,
    customerId: customerId,
    status: 'pending',
    requestedAt: FieldValue.serverTimestamp()
  });
  
  // 3. Assign to available trader
  const trader = await findAvailableTrader();
  await db.collection('payin').doc(payinId).update({
    traderId: trader.id,
    assignedAt: FieldValue.serverTimestamp()
  });
  
  // 4. Generate payment URL
  const paymentUrl = `https://pay2x.com/pay/${payinId}`;
  
  res.json({
    paymentUrl: paymentUrl,
    transactionId: payinId
  });
});
```

---

### **STEP 3: Customer Pays (Trader Receives UPI)**

**pay2x Trader App:**

```javascript
// Trader confirms payment received
async function confirmPayment(payinId, utrNumber) {
  await db.collection('payin').doc(payinId).update({
    status: 'completed',
    utrId: utrNumber,
    completedAt: FieldValue.serverTimestamp()
  });
  
  // ✅ Trigger webhook to merchant
  await sendWebhook(payinId, 'payin.success');
}
```

---

### **STEP 4: pay2x Sends Webhook to Realshaadi**

**pay2x Backend - Webhook Sender:**

```javascript
// pay2x backend - Send webhook
const crypto = require('crypto');
const axios = require('axios');

async function sendWebhook(payinId, eventType) {
  // 1. Get payin details
  const payinDoc = await db.collection('payin').doc(payinId).get();
  const payin = payinDoc.data();
  
  // 2. Get merchant details
  const merchantDoc = await db.collection('merchant')
    .where('uid', '==', payin.merchantId)
    .get();
  const merchant = merchantDoc.docs[0].data();
  
  // 3. Check if merchant has webhook configured
  if (!merchant.webhookUrl) {
    console.log('No webhook URL configured for merchant');
    return;
  }
  
  // 4. Build webhook payload
  const payload = {
    event: eventType,
    timestamp: Date.now(),
    data: {
      transactionId: payin.id,
      orderId: payin.orderId,
      amount: payin.amount,
      currency: 'INR',
      status: payin.status,
      customerId: payin.customerId,
      paymentMethod: 'UPI',
      utrId: payin.utrId,
      completedAt: payin.completedAt?.toDate().toISOString()
    }
  };
  
  // 5. Generate signature (HMAC-SHA256)
  const signature = crypto
    .createHmac('sha256', merchant.webhookSecret)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  // 6. Send POST request to merchant's webhook URL
  try {
    const response = await axios.post(merchant.webhookUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'User-Agent': 'pay2x-webhook/1.0'
      },
      timeout: 5000 // 5 second timeout
    });
    
    // 7. Log webhook delivery
    await db.collection('webhookLogs').add({
      merchantId: merchant.uid,
      event: eventType,
      transactionId: payin.id,
      url: merchant.webhookUrl,
      status: 'delivered',
      responseCode: response.status,
      deliveredAt: FieldValue.serverTimestamp()
    });
    
    console.log('✅ Webhook delivered successfully');
    
  } catch (error) {
    // 8. Log failure and schedule retry
    await db.collection('webhookLogs').add({
      merchantId: merchant.uid,
      event: eventType,
      transactionId: payin.id,
      url: merchant.webhookUrl,
      status: 'failed',
      error: error.message,
      failedAt: FieldValue.serverTimestamp(),
      retryCount: 0
    });
    
    console.error('❌ Webhook delivery failed:', error.message);
    
    // Schedule retry
    await scheduleWebhookRetry(payin.id, eventType);
  }
}
```

---

### **STEP 5: Realshaadi Receives Webhook**

**Realshaadi Backend - Webhook Receiver:**

```javascript
// realshaadi server - Receive webhook from pay2x
const express = require('express');
const crypto = require('crypto');
const app = express();

app.use(express.json());

const WEBHOOK_SECRET = 'whsec_8f7d57edef41cec41a367ca748191b1f5dfb7a398525225b378b8bc727f2d7a2';

// Track processed transactions (prevent duplicates)
const processedTransactions = new Set();

app.post('/webhooks/pay2x', async (req, res) => {
  console.log('📨 Webhook received from pay2x');
  
  // 1. Verify signature
  const signature = req.headers['x-webhook-signature'];
  const payload = JSON.stringify(req.body);
  
  const expectedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');
  
  if (signature !== expectedSignature) {
    console.error('❌ Invalid webhook signature!');
    return res.status(401).send('Unauthorized');
  }
  
  console.log('✅ Signature verified');
  
  // 2. Respond immediately (important!)
  res.status(200).send('OK');
  
  // 3. Process webhook asynchronously
  const event = req.body;
  
  // Check for duplicates
  if (processedTransactions.has(event.data.transactionId)) {
    console.log('⚠️ Duplicate webhook, already processed');
    return;
  }
  
  processedTransactions.add(event.data.transactionId);
  
  // 4. Handle different event types
  try {
    switch (event.event) {
      case 'payin.success':
        await handlePayinSuccess(event.data);
        break;
        
      case 'payin.failed':
        await handlePayinFailed(event.data);
        break;
        
      case 'payout.completed':
        await handlePayoutCompleted(event.data);
        break;
        
      case 'dispute.approved':
        await handleDisputeApproved(event.data);
        break;
        
      default:
        console.log('Unknown event type:', event.event);
    }
  } catch (error) {
    console.error('Error processing webhook:', error);
    // Send alert to admin
    await sendAlert('Webhook processing failed: ' + error.message);
  }
});

// Handle payin success
async function handlePayinSuccess(data) {
  console.log(`✅ Payment received: ₹${data.amount} for order ${data.orderId}`);
  
  // 1. Update order status in database
  await db.collection('orders').doc(data.orderId).update({
    status: 'paid',
    paymentId: data.transactionId,
    paidAt: new Date(data.completedAt),
    utrId: data.utrId
  });
  
  // 2. Activate premium membership
  await db.collection('users').doc(data.customerId).update({
    isPremium: true,
    premiumActivatedAt: new Date(),
    premiumExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
  });
  
  // 3. Send confirmation email
  await sendEmail(data.customerId, {
    subject: 'Payment Successful - Premium Activated!',
    body: `Your payment of ₹${data.amount} has been received. Your premium membership is now active!`
  });
  
  console.log('✅ Order fulfilled, membership activated');
}

// Handle payin failed
async function handlePayinFailed(data) {
  console.log(`❌ Payment failed for order ${data.orderId}`);
  
  await db.collection('orders').doc(data.orderId).update({
    status: 'payment_failed',
    failedAt: new Date()
  });
  
  await sendEmail(data.customerId, {
    subject: 'Payment Failed',
    body: 'Your payment could not be processed. Please try again.'
  });
}

// Handle payout completed
async function handlePayoutCompleted(data) {
  console.log(`✅ Payout sent: ₹${data.amount}, UTR: ${data.utrId}`);
  
  await db.collection('withdrawals').doc(data.payoutId).update({
    status: 'completed',
    utrId: data.utrId,
    completedAt: new Date(data.completedAt)
  });
  
  await sendEmail(data.beneficiaryId, {
    subject: 'Withdrawal Successful',
    body: `Your withdrawal of ₹${data.amount} has been sent. UTR: ${data.utrId}`
  });
}

// Handle dispute approved (refund customer)
async function handleDisputeApproved(data) {
  console.log(`⚠️ Dispute approved, refunding ₹${data.refundAmount}`);
  
  // 1. Refund customer's account
  await db.collection('users').doc(data.customerId).update({
    balance: FieldValue.increment(data.refundAmount)
  });
  
  // 2. Cancel premium if it was a membership purchase
  const order = await db.collection('orders').doc(data.orderId).get();
  if (order.data().type === 'premium') {
    await db.collection('users').doc(data.customerId).update({
      isPremium: false,
      premiumCancelledAt: new Date()
    });
  }
  
  // 3. Send notification
  await sendEmail(data.customerId, {
    subject: 'Dispute Approved - Refund Issued',
    body: `Your dispute has been approved. ₹${data.refundAmount} has been refunded to your account.`
  });
}

app.listen(3000, () => {
  console.log('Webhook server running on port 3000');
});
```

---

## 🔄 Complete Flow Example

### **Example: User Buys Premium Membership**

**1. User on realshaadi.com clicks "Buy Premium"**

```
User: Clicks "Buy Premium - ₹1000"
    ↓
realshaadi frontend: Sends request to realshaadi backend
```

**2. Realshaadi creates order and calls pay2x**

```javascript
// realshaadi backend
app.post('/api/orders/create', async (req, res) => {
  // Create order
  const order = await db.collection('orders').add({
    userId: req.user.id,
    type: 'premium',
    amount: 1000,
    status: 'pending',
    createdAt: new Date()
  });
  
  // Call pay2x API
  const payment = await createPayin(req.user.id, 1000, order.id);
  
  // Return payment URL to frontend
  res.json({ paymentUrl: payment.paymentUrl });
});
```

**3. User redirected to pay2x payment page**

```
User: Redirected to https://pay2x.com/pay/abc123
    ↓
pay2x: Shows UPI QR code / payment details
    ↓
User: Scans QR, pays ₹1000
```

**4. Trader confirms payment**

```
Trader: Receives ₹1000 in UPI
    ↓
Trader: Opens pay2x app, clicks "Confirm"
    ↓
pay2x: Updates payin status to 'completed'
    ↓
pay2x: Triggers sendWebhook('payin.success')
```

**5. Webhook sent to realshaadi**

```
pay2x backend: POST https://realshaadi.com/webhooks/pay2x
Headers:
  X-Webhook-Signature: abc123...
Body:
  {
    "event": "payin.success",
    "data": {
      "orderId": "order_456",
      "amount": 1000,
      "status": "completed"
    }
  }
```

**6. Realshaadi activates membership**

```
realshaadi webhook receiver:
  ✅ Verifies signature
  ✅ Updates order status to 'paid'
  ✅ Activates premium for user
  ✅ Sends confirmation email
```

**7. User sees success**

```
User: Redirected to https://realshaadi.com/payment/success
    ↓
realshaadi: "Payment successful! Premium activated"
```

---

## 🧪 Testing the Integration

### **Test 1: Manual Payin Creation**

```bash
# Call pay2x API (simulating realshaadi)
curl -X POST https://api.pay2x.com/v1/payin \
  -H "Authorization: Bearer live_1770122628828_fwksi7" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "test_order_123",
    "amount": 100,
    "customerId": "test_user",
    "customerEmail": "test@realshaadi.com"
  }'
```

### **Test 2: Simulate Webhook (pay2x → realshaadi)**

```javascript
// pay2x test script
const crypto = require('crypto');
const axios = require('axios');

const webhookUrl = 'https://realshaadi.com/webhooks/pay2x';
const webhookSecret = 'whsec_8f7d57edef41cec41a367ca748191b1f5dfb7a398525225b378b8bc727f2d7a2';

const payload = {
  event: 'payin.success',
  timestamp: Date.now(),
  data: {
    transactionId: 'test_txn_123',
    orderId: 'test_order_123',
    amount: 100,
    status: 'completed'
  }
};

const signature = crypto
  .createHmac('sha256', webhookSecret)
  .update(JSON.stringify(payload))
  .digest('hex');

await axios.post(webhookUrl, payload, {
  headers: {
    'Content-Type': 'application/json',
    'X-Webhook-Signature': signature
  }
});
```

---

## 📊 Summary

**Architecture:**

```
realshaadi.com (Merchant)
    ↕ API calls
pay2x (Payment Gateway)
    ↕ UPI payments
Traders (Process payments)
    ↓
pay2x sends webhooks
    ↓
realshaadi.com receives & processes
```

**Key Components:**

1. **pay2x API** - Receives payin/payout requests
2. **pay2x Backend** - Processes payments, sends webhooks
3. **Traders** - Confirm payments
4. **Webhooks** - Real-time notifications
5. **realshaadi Backend** - Receives webhooks, fulfills orders

---

## 🔐 Security Checklist

- ✅ API key in headers (not URL)
- ✅ Webhook signature verification (HMAC-SHA256)
- ✅ HTTPS only
- ✅ Duplicate detection
- ✅ Immediate response (200 OK)
- ✅ Async processing
- ✅ Error logging & alerts

---

**Next Steps:**
1. Implement webhook sender in pay2x backend
2. Set up webhook retry logic
3. Build webhook logs viewer in merchant dashboard
4. Test end-to-end flow

---

Last Updated: 2026-02-03
