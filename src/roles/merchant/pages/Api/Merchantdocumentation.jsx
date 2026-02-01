import React, { useState } from 'react';
import { 
  Book, Code, Zap, Shield, Copy, Check, ChevronDown, ChevronRight,
  Terminal, Globe, Key, Lock, Bell, FileText, ExternalLink
} from 'lucide-react';

export default function MerchantDocumentation() {
  const [activeTab, setActiveTab] = useState('quickstart');
  const [expandedSection, setExpandedSection] = useState('authentication');
  const [copied, setCopied] = useState({});

  const handleCopy = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(prev => ({ ...prev, [id]: true }));
      setTimeout(() => {
        setCopied(prev => ({ ...prev, [id]: false }));
      }, 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const tabs = [
    { id: 'quickstart', label: 'Quick Start', icon: Zap },
    { id: 'authentication', label: 'Authentication', icon: Key },
    { id: 'api-reference', label: 'API Reference', icon: Code },
    { id: 'webhooks', label: 'Webhooks', icon: Bell },
    { id: 'examples', label: 'Code Examples', icon: Terminal },
    { id: 'security', label: 'Security', icon: Shield },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white py-12 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <Book className="w-10 h-10" />
            <h1 className="text-4xl font-bold">API Documentation</h1>
          </div>
          <p className="text-xl text-blue-100">
            Complete guide to integrate Pay2X payment gateway into your application
          </p>
          <div className="mt-6 flex gap-4">
            <a
              href="#quickstart"
              className="px-6 py-3 bg-white text-blue-600 rounded-lg font-semibold hover:bg-blue-50 transition-colors"
            >
              Get Started →
            </a>
            <a
              href="#examples"
              className="px-6 py-3 bg-blue-700 text-white rounded-lg font-semibold hover:bg-blue-600 transition-colors"
            >
              View Examples
            </a>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-4 font-medium transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-12">
        {activeTab === 'quickstart' && <QuickStartContent onCopy={handleCopy} copied={copied} />}
        {activeTab === 'authentication' && <AuthenticationContent onCopy={handleCopy} copied={copied} />}
        {activeTab === 'api-reference' && <APIReferenceContent onCopy={handleCopy} copied={copied} />}
        {activeTab === 'webhooks' && <WebhooksContent onCopy={handleCopy} copied={copied} />}
        {activeTab === 'examples' && <ExamplesContent onCopy={handleCopy} copied={copied} />}
        {activeTab === 'security' && <SecurityContent />}
      </div>
    </div>
  );
}

// Quick Start Content
function QuickStartContent({ onCopy, copied }) {
  return (
    <div className="space-y-8">
      <Section title="🚀 Quick Start Guide" subtitle="Get up and running in 5 minutes">
        <div className="space-y-6">
          <Step number={1} title="Get Your API Key">
            <p className="text-gray-600 mb-4">
              Navigate to <strong>Settings</strong> in your merchant dashboard to find your API key.
            </p>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                ⚠️ <strong>Important:</strong> Keep your API key secret! Never expose it in client-side code or public repositories.
              </p>
            </div>
          </Step>

          <Step number={2} title="Make Your First API Call">
            <CodeBlock
              language="bash"
              code={`curl -X POST https://api.pay2x.com/v1/payin/create \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 1000,
    "userId": "customer_123",
    "orderId": "ORDER_001"
  }'`}
              onCopy={onCopy}
              copied={copied}
              id="first-api-call"
            />
          </Step>

          <Step number={3} title="Handle the Response">
            <p className="text-gray-600 mb-4">You'll receive a response with payment details:</p>
            <CodeBlock
              language="json"
              code={`{
  "success": true,
  "payinId": "payin_abc123xyz",
  "upiId": "merchant@upi",
  "holderName": "Merchant Name",
  "amount": 1000,
  "timer": 600
}`}
              onCopy={onCopy}
              copied={copied}
              id="response-example"
            />
          </Step>

          <Step number={4} title="Show Payment Page to Customer">
            <p className="text-gray-600 mb-4">
              Display the UPI ID and amount to your customer. They'll make the payment using their UPI app and provide the UTR (transaction reference).
            </p>
          </Step>

          <Step number={5} title="Configure Webhook (Recommended)">
            <p className="text-gray-600 mb-4">
              Set up a webhook URL in your settings to receive automatic payment notifications.
            </p>
            <a href="#webhooks" className="text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-1">
              Learn about webhooks <ExternalLink className="w-4 h-4" />
            </a>
          </Step>
        </div>
      </Section>

      <Section title="📦 Installation">
        <div className="space-y-4">
          <h4 className="font-semibold text-gray-800">Node.js / JavaScript</h4>
          <CodeBlock
            language="bash"
            code="npm install axios"
            onCopy={onCopy}
            copied={copied}
            id="install-axios"
          />

          <h4 className="font-semibold text-gray-800 mt-6">Python</h4>
          <CodeBlock
            language="bash"
            code="pip install requests"
            onCopy={onCopy}
            copied={copied}
            id="install-requests"
          />

          <h4 className="font-semibold text-gray-800 mt-6">PHP</h4>
          <CodeBlock
            language="bash"
            code="composer require guzzlehttp/guzzle"
            onCopy={onCopy}
            copied={copied}
            id="install-guzzle"
          />
        </div>
      </Section>

      <Section title="🎯 Integration Checklist">
        <div className="space-y-3">
          <ChecklistItem>Get your API key from Settings</ChecklistItem>
          <ChecklistItem>Set up your development environment</ChecklistItem>
          <ChecklistItem>Make a test API call</ChecklistItem>
          <ChecklistItem>Implement payment flow in your app</ChecklistItem>
          <ChecklistItem>Configure webhook endpoint</ChecklistItem>
          <ChecklistItem>Test with small amounts</ChecklistItem>
          <ChecklistItem>Switch to live mode when ready</ChecklistItem>
        </div>
      </Section>
    </div>
  );
}

// Authentication Content
function AuthenticationContent({ onCopy, copied }) {
  return (
    <div className="space-y-8">
      <Section title="🔐 Authentication" subtitle="Secure your API requests">
        <p className="text-gray-600 mb-6">
          Pay2X uses API keys to authenticate requests. Include your API key in the <code className="bg-gray-100 px-2 py-1 rounded">Authorization</code> header with the <code className="bg-gray-100 px-2 py-1 rounded">Bearer</code> scheme.
        </p>

        <h3 className="text-xl font-bold text-gray-800 mb-4">API Key Format</h3>
      

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mt-6">
          <h4 className="font-semibold text-blue-900 mb-3">Test vs Live Keys</h4>
          <div className="space-y-2 text-sm text-blue-800">
            <p>• <strong>Test keys</strong> start with <code className="bg-blue-100 px-2 py-1 rounded">hgjk</code></p>
            <p>• <strong>Live keys</strong> start with <code className="bg-blue-100 px-2 py-1 rounded">ji</code></p>
            <p>• Toggle between test and live mode in Settings</p>
          </div>
        </div>

        <h3 className="text-xl font-bold text-gray-800 mb-4 mt-8">Example Request</h3>
        <CodeBlock
          language="javascript"
          code={`const axios = require('axios');

const response = await axios.post(
  'https://api.pay2x.com/v1/payin/create',
  {
    amount: 1000,
    userId: 'customer_123',
    orderId: 'ORDER_001'
  },
  {
    headers: {
      'Authorization': 'Bearer YOUR_API_KEY',
      'Content-Type': 'application/json'
    }
  }
);

console.log(response.data);`}
          onCopy={onCopy}
          copied={copied}
          id="auth-example"
        />
      </Section>

      <Section title="🔒 Security Best Practices">
        <div className="space-y-4">
          <SecurityTip icon="🔑" title="Store Keys Securely">
            Use environment variables, never hardcode keys in your source code
          </SecurityTip>
          <SecurityTip icon="🔄" title="Rotate Keys Regularly">
            Regenerate API keys periodically for enhanced security
          </SecurityTip>
          <SecurityTip icon="🚫" title="Never Expose Keys">
            Don't commit keys to Git or share them publicly
          </SecurityTip>
          <SecurityTip icon="🌐" title="Use HTTPS Only">
            Always make API requests over HTTPS
          </SecurityTip>
        </div>
      </Section>
    </div>
  );
}

// API Reference Content
function APIReferenceContent({ onCopy, copied }) {
  return (
    <div className="space-y-8">
      <Section title="📡 API Endpoints" subtitle="Complete API reference">
        
        {/* Create Payment */}
        <APIEndpoint
          method="POST"
          endpoint="/v1/payin/create"
          title="Create Payment"
          description="Initiate a new payment transaction"
        >
          <h4 className="font-semibold text-gray-800 mb-3">Request Body</h4>
          <ParamTable
            params={[
              { name: 'amount', type: 'number', required: true, description: 'Payment amount in INR (minimum: 1000, maximum: 50000)' },
              { name: 'userId', type: 'string', required: true, description: 'Your customer\'s unique identifier' },
              { name: 'orderId', type: 'string', required: false, description: 'Your order/transaction reference' },
              { name: 'metadata', type: 'object', required: false, description: 'Additional custom data (JSON object)' },
            ]}
          />

          <h4 className="font-semibold text-gray-800 mb-3 mt-6">Example Request</h4>
          <CodeBlock
            language="javascript"
            code={`const response = await fetch('https://api.pay2x.com/v1/payin/create', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    amount: 2500,
    userId: 'customer_456',
    orderId: 'ORDER_2024_001',
    metadata: {
      customerName: 'John Doe',
      customerEmail: 'john@example.com',
      productId: 'PROD_123'
    }
  })
});

const data = await response.json();`}
            onCopy={onCopy}
            copied={copied}
            id="create-payment-request"
          />

          <h4 className="font-semibold text-gray-800 mb-3 mt-6">Response</h4>
          <CodeBlock
            language="json"
            code={`{
  "success": true,
  "payinId": "payin_abc123xyz789",
  "upiId": "merchant@upi",
  "holderName": "Merchant Business Name",
  "amount": 2500,
  "timer": 600,
  "expiresAt": "2024-01-23T15:30:00Z"
}`}
            onCopy={onCopy}
            copied={copied}
            id="create-payment-response"
          />
        </APIEndpoint>

        {/* Update Payment */}
        <APIEndpoint
          method="PATCH"
          endpoint="/v1/payin/update/:payinId"
          title="Update Payment (Submit UTR)"
          description="Submit the UTR (transaction reference) after customer makes payment"
        >
          <h4 className="font-semibold text-gray-800 mb-3">Request Body</h4>
          <ParamTable
            params={[
              { name: 'utrId', type: 'string', required: true, description: '12-digit UTR/transaction reference from UPI payment' },
            ]}
          />

          <h4 className="font-semibold text-gray-800 mb-3 mt-6">Example Request</h4>
          <CodeBlock
            language="javascript"
            code={`const response = await fetch('https://api.pay2x.com/v1/payin/update/payin_abc123', {
  method: 'PATCH',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    utrId: '123456789012'
  })
});

const data = await response.json();`}
            onCopy={onCopy}
            copied={copied}
            id="update-payment-request"
          />
        </APIEndpoint>

        {/* Get Payment Status */}
        <APIEndpoint
          method="GET"
          endpoint="/v1/payin/status/:payinId"
          title="Get Payment Status"
          description="Check the current status of a payment"
        >
          <h4 className="font-semibold text-gray-800 mb-3">Response</h4>
          <CodeBlock
            language="json"
            code={`{
  "success": true,
  "payin": {
    "payinId": "payin_abc123",
    "status": "completed",
    "amount": 2500,
    "utrId": "123456789012",
    "orderId": "ORDER_2024_001",
    "completedAt": "2024-01-23T14:25:30Z"
  }
}`}
            onCopy={onCopy}
            copied={copied}
            id="status-response"
          />

          <h4 className="font-semibold text-gray-800 mb-3 mt-6">Payment Statuses</h4>
          <div className="space-y-2">
            <StatusBadge status="pending" description="Payment initiated, waiting for customer payment" />
            <StatusBadge status="completed" description="Payment verified and confirmed" />
            <StatusBadge status="rejected" description="Payment failed or was rejected" />
            <StatusBadge status="expired" description="Payment window expired (10 minutes)" />
          </div>
        </APIEndpoint>
      </Section>

      <Section title="⚠️ Error Handling">
        <h4 className="font-semibold text-gray-800 mb-3">HTTP Status Codes</h4>
        <div className="space-y-3">
          <ErrorCode code="200" description="Success - Request completed successfully" />
          <ErrorCode code="400" description="Bad Request - Invalid parameters" />
          <ErrorCode code="401" description="Unauthorized - Invalid or missing API key" />
          <ErrorCode code="404" description="Not Found - Resource doesn't exist" />
          <ErrorCode code="429" description="Too Many Requests - Rate limit exceeded" />
          <ErrorCode code="500" description="Server Error - Something went wrong on our end" />
          <ErrorCode code="503" description="Service Unavailable - No traders available" />
        </div>

        <h4 className="font-semibold text-gray-800 mb-3 mt-6">Error Response Format</h4>
        <CodeBlock
          language="json"
          code={`{
  "success": false,
  "error": {
    "code": "INVALID_AMOUNT",
    "message": "Amount must be between ₹1000 and ₹50000"
  }
}`}
          onCopy={onCopy}
          copied={copied}
          id="error-format"
        />
      </Section>
    </div>
  );
}

// Webhooks Content
function WebhooksContent({ onCopy, copied }) {
  return (
    <div className="space-y-8">
      <Section title="🔔 Webhooks" subtitle="Real-time payment notifications">
        <p className="text-gray-600 mb-6">
          Webhooks allow you to receive real-time notifications when payment events occur. Instead of polling our API, we'll send HTTP POST requests to your specified URL.
        </p>

        <h3 className="text-xl font-bold text-gray-800 mb-4">Setting Up Webhooks</h3>
        <div className="space-y-4">
          <Step number={1} title="Configure Webhook URL">
            <p className="text-gray-600">
              Go to <strong>Settings → Webhook Configuration</strong> and enter your webhook endpoint URL (must be HTTPS in production).
            </p>
          </Step>

          <Step number={2} title="Save Your Webhook Secret">
            <p className="text-gray-600">
              Copy the webhook secret provided - you'll use this to verify webhook signatures.
            </p>
          </Step>

          <Step number={3} title="Implement Webhook Handler">
            <p className="text-gray-600 mb-4">
              Create an endpoint on your server to receive webhook events.
            </p>
          </Step>
        </div>

        <h3 className="text-xl font-bold text-gray-800 mb-4 mt-8">Webhook Events</h3>
        <div className="space-y-3">
          <EventCard
            event="payment.completed"
            description="Payment was successfully verified and completed"
          />
          <EventCard
            event="payment.failed"
            description="Payment was rejected or failed verification"
          />
        </div>

        <h3 className="text-xl font-bold text-gray-800 mb-4 mt-8">Webhook Payload</h3>
        <CodeBlock
          language="json"
          code={`{
  "event": "payment.completed",
  "timestamp": 1705934567890,
  "data": {
    "payinId": "payin_abc123xyz",
    "orderId": "ORDER_2024_001",
    "amount": 2500,
    "status": "completed",
    "utrId": "123456789012",
    "completedAt": "2024-01-23T14:25:30Z",
    "userId": "customer_456",
    "metadata": {
      "customerName": "John Doe",
      "customerEmail": "john@example.com"
    }
  }
}`}
          onCopy={onCopy}
          copied={copied}
          id="webhook-payload"
        />

        <h3 className="text-xl font-bold text-gray-800 mb-4 mt-8">Verifying Webhook Signatures</h3>
        <p className="text-gray-600 mb-4">
          Always verify the webhook signature to ensure the request came from Pay2X and wasn't tampered with.
        </p>

        <CodeBlock
          language="javascript"
          code={`const crypto = require('crypto');

app.post('/api/payment-webhook', express.json(), (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const payload = req.body;
  
  // Verify signature
  const expectedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  if (signature !== expectedSignature) {
    console.error('Invalid webhook signature!');
    return res.status(401).send('Unauthorized');
  }
  
  // Process the webhook
  const { event, data } = payload;
  
  if (event === 'payment.completed') {
    // Update your database
    await updateOrder(data.orderId, {
      status: 'paid',
      payinId: data.payinId,
      paidAt: data.completedAt
    });
    
    // Send confirmation email
    await sendEmail(data.metadata.customerEmail, 'Payment Successful');
    
    // Fulfill order
    await fulfillOrder(data.orderId);
  }
  
  // IMPORTANT: Respond quickly (< 5 seconds)
  res.status(200).json({ received: true });
});`}
          onCopy={onCopy}
          copied={copied}
          id="webhook-verification"
        />

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mt-6">
          <h4 className="font-semibold text-yellow-900 mb-3">⚡ Best Practices</h4>
          <ul className="space-y-2 text-sm text-yellow-800">
            <li>• <strong>Respond quickly:</strong> Return 200 OK within 5 seconds</li>
            <li>• <strong>Process asynchronously:</strong> Do heavy work after responding</li>
            <li>• <strong>Handle duplicates:</strong> Make your endpoint idempotent</li>
            <li>• <strong>Verify signatures:</strong> Always validate the webhook signature</li>
            <li>• <strong>Use HTTPS:</strong> Required for production webhooks</li>
            <li>• <strong>Monitor delivery:</strong> Check webhook logs in Settings</li>
          </ul>
        </div>

        <h3 className="text-xl font-bold text-gray-800 mb-4 mt-8">Testing Webhooks</h3>
        <p className="text-gray-600 mb-4">
          Use the "Send Test Webhook" button in Settings to send a test event to your endpoint.
        </p>
        <CodeBlock
          language="json"
          code={`{
  "event": "payment.test",
  "timestamp": 1705934567890,
  "data": {
    "payinId": "test_123",
    "orderId": "TEST_ORDER",
    "amount": 1000,
    "status": "completed",
    "test": true
  }
}`}
          onCopy={onCopy}
          copied={copied}
          id="test-webhook"
        />
      </Section>

      <Section title="🔄 Webhook Retry Logic">
        <p className="text-gray-600 mb-4">
          If your endpoint is unreachable or returns an error, we'll automatically retry:
        </p>
        <div className="space-y-2">
          <RetryStep attempt={1} time="Immediately" />
          <RetryStep attempt={2} time="After 5 minutes" />
          <RetryStep attempt={3} time="After 10 minutes" />
          <RetryStep attempt={4} time="After 20 minutes" />
          <RetryStep attempt={5} time="After 40 minutes (final attempt)" />
        </div>
      </Section>
    </div>
  );
}

// Examples Content
function ExamplesContent({ onCopy, copied }) {
  return (
    <div className="space-y-8">
      <Section title="💻 Code Examples" subtitle="Ready-to-use integration examples">
        
        {/* Node.js Example */}
        <ExampleSection title="Node.js / Express" language="JavaScript">
          <CodeBlock
            language="javascript"
            code={`const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const API_KEY = process.env.PAY2X_API_KEY;
const WEBHOOK_SECRET = process.env.PAY2X_WEBHOOK_SECRET;

// Create payment endpoint
app.post('/create-payment', async (req, res) => {
  try {
    const { amount, customerId, orderId } = req.body;
    
    const response = await axios.post(
      'https://api.pay2x.com/v1/payin/create',
      {
        amount: amount,
        userId: customerId,
        orderId: orderId,
        metadata: {
          customerName: req.body.customerName,
          customerEmail: req.body.customerEmail
        }
      },
      {
        headers: {
          'Authorization': \`Bearer \${API_KEY}\`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    res.json(response.data);
  } catch (error) {
    console.error('Payment creation failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Webhook endpoint
app.post('/webhooks/payment', express.json(), async (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const payload = req.body;
  
  // Verify signature
  const expectedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  if (signature !== expectedSignature) {
    return res.status(401).send('Invalid signature');
  }
  
  // Process webhook
  const { event, data } = payload;
  
  if (event === 'payment.completed') {
    // Update order in database
    await db.orders.update(
      { orderId: data.orderId },
      { 
        status: 'paid',
        payinId: data.payinId,
        paidAt: new Date(data.completedAt)
      }
    );
    
    // Send confirmation email
    await sendEmail({
      to: data.metadata.customerEmail,
      subject: 'Payment Successful!',
      template: 'payment-confirmation',
      data: { amount: data.amount, orderId: data.orderId }
    });
  }
  
  res.status(200).json({ received: true });
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});`}
            onCopy={onCopy}
            copied={copied}
            id="nodejs-example"
          />
        </ExampleSection>

        {/* Python Example */}
        <ExampleSection title="Python / Flask" language="Python">
          <CodeBlock
            language="python"
            code={`from flask import Flask, request, jsonify
import requests
import hmac
import hashlib
import json
import os

app = Flask(__name__)
API_KEY = os.environ.get('PAY2X_API_KEY')
WEBHOOK_SECRET = os.environ.get('PAY2X_WEBHOOK_SECRET')

@app.route('/create-payment', methods=['POST'])
def create_payment():
    data = request.json
    
    try:
        response = requests.post(
            'https://api.pay2x.com/v1/payin/create',
            headers={
                'Authorization': f'Bearer {API_KEY}',
                'Content-Type': 'application/json'
            },
            json={
                'amount': data['amount'],
                'userId': data['customerId'],
                'orderId': data['orderId'],
                'metadata': {
                    'customerName': data.get('customerName'),
                    'customerEmail': data.get('customerEmail')
                }
            }
        )
        response.raise_for_status()
        return jsonify(response.json())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/webhooks/payment', methods=['POST'])
def webhook_handler():
    signature = request.headers.get('X-Webhook-Signature')
    payload = request.get_data()
    
    # Verify signature
    expected_signature = hmac.new(
        WEBHOOK_SECRET.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()
    
    if signature != expected_signature:
        return 'Invalid signature', 401
    
    # Process webhook
    data = request.json
    event = data.get('event')
    payment_data = data.get('data')
    
    if event == 'payment.completed':
        # Update order in database
        update_order(
            payment_data['orderId'],
            status='paid',
            payin_id=payment_data['payinId']
        )
        
        # Send confirmation email
        send_email(
            to=payment_data['metadata']['customerEmail'],
            subject='Payment Successful',
            amount=payment_data['amount']
        )
    
    return jsonify({'received': True})

if __name__ == '__main__':
    app.run(port=5000)`}
            onCopy={onCopy}
            copied={copied}
            id="python-example"
          />
        </ExampleSection>

        {/* PHP Example */}
        <ExampleSection title="PHP" language="PHP">
          <CodeBlock
            language="php"
            code={`<?php
require 'vendor/autoload.php';

use GuzzleHttp\\Client;

$apiKey = getenv('PAY2X_API_KEY');
$webhookSecret = getenv('PAY2X_WEBHOOK_SECRET');

// Create payment
function createPayment($amount, $customerId, $orderId) {
    global $apiKey;
    
    $client = new Client();
    
    try {
        $response = $client->post('https://api.pay2x.com/v1/payin/create', [
            'headers' => [
                'Authorization' => 'Bearer ' . $apiKey,
                'Content-Type' => 'application/json'
            ],
            'json' => [
                'amount' => $amount,
                'userId' => $customerId,
                'orderId' => $orderId,
                'metadata' => [
                    'customerName' => $_POST['customerName'],
                    'customerEmail' => $_POST['customerEmail']
                ]
            ]
        ]);
        
        return json_decode($response->getBody(), true);
    } catch (Exception $e) {
        error_log('Payment creation failed: ' . $e->getMessage());
        return ['error' => $e->getMessage()];
    }
}

// Webhook handler
function handleWebhook() {
    global $webhookSecret;
    
    $signature = $_SERVER['HTTP_X_WEBHOOK_SIGNATURE'] ?? '';
    $payload = file_get_contents('php://input');
    
    // Verify signature
    $expectedSignature = hash_hmac('sha256', $payload, $webhookSecret);
    
    if ($signature !== $expectedSignature) {
        http_response_code(401);
        exit('Invalid signature');
    }
    
    // Process webhook
    $data = json_decode($payload, true);
    $event = $data['event'];
    $paymentData = $data['data'];
    
    if ($event === 'payment.completed') {
        // Update order in database
        updateOrder(
            $paymentData['orderId'],
            'paid',
            $paymentData['payinId']
        );
        
        // Send confirmation email
        sendEmail(
            $paymentData['metadata']['customerEmail'],
            'Payment Successful',
            $paymentData['amount']
        );
    }
    
    http_response_code(200);
    echo json_encode(['received' => true]);
}

// Handle webhook request
if ($_SERVER['REQUEST_URI'] === '/webhooks/payment') {
    handleWebhook();
}
?>`}
            onCopy={onCopy}
            copied={copied}
            id="php-example"
          />
        </ExampleSection>

        {/* React Example */}
        <ExampleSection title="React / Next.js Frontend" language="JavaScript">
          <CodeBlock
            language="javascript"
            code={`import { useState } from 'react';

export default function CheckoutPage() {
  const [paymentData, setPaymentData] = useState(null);
  const [utrId, setUtrId] = useState('');
  const [loading, setLoading] = useState(false);

  const initiatePayment = async (amount, orderId) => {
    setLoading(true);
    try {
      const response = await fetch('/api/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          orderId,
          customerId: user.id,
          customerName: user.name,
          customerEmail: user.email
        })
      });
      
      const data = await response.json();
      setPaymentData(data);
    } catch (error) {
      alert('Payment initiation failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const submitUTR = async () => {
    if (!utrId || utrId.length !== 12) {
      alert('Please enter a valid 12-digit UTR');
      return;
    }
    
    setLoading(true);
    try {
      await fetch('/api/submit-utr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payinId: paymentData.payinId,
          utrId
        })
      });
      
      alert('UTR submitted! We will verify your payment.');
    } catch (error) {
      alert('Failed to submit UTR: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="checkout-container">
      {!paymentData ? (
        <button 
          onClick={() => initiatePayment(2500, 'ORDER_123')}
          disabled={loading}
        >
          {loading ? 'Processing...' : 'Pay ₹2,500'}
        </button>
      ) : (
        <div className="payment-details">
          <h2>Complete Your Payment</h2>
          <div className="upi-details">
            <p><strong>UPI ID:</strong> {paymentData.upiId}</p>
            <p><strong>Amount:</strong> ₹{paymentData.amount}</p>
            <p><strong>Account Holder:</strong> {paymentData.holderName}</p>
          </div>
          
          <div className="utr-input">
            <input
              type="text"
              placeholder="Enter 12-digit UTR"
              value={utrId}
              onChange={(e) => setUtrId(e.target.value.replace(/\\D/g, '').slice(0, 12))}
              maxLength={12}
            />
            <button onClick={submitUTR} disabled={loading}>
              {loading ? 'Submitting...' : 'Submit UTR'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}`}
            onCopy={onCopy}
            copied={copied}
            id="react-example"
          />
        </ExampleSection>
      </Section>
    </div>
  );
}

// Security Content
function SecurityContent() {
  return (
    <div className="space-y-8">
      <Section title="🔒 Security Best Practices">
        <div className="space-y-6">
          <SecurityCard
            icon={<Key className="w-6 h-6" />}
            title="API Key Security"
            color="blue"
          >
            <ul className="space-y-2 text-sm text-gray-700">
              <li>• Store API keys in environment variables, never in code</li>
              <li>• Use different keys for development and production</li>
              <li>• Rotate keys regularly (at least every 90 days)</li>
              <li>• Never commit keys to version control</li>
              <li>• Revoke compromised keys immediately</li>
            </ul>
          </SecurityCard>

          <SecurityCard
            icon={<Shield className="w-6 h-6" />}
            title="Webhook Security"
            color="green"
          >
            <ul className="space-y-2 text-sm text-gray-700">
              <li>• Always verify webhook signatures</li>
              <li>• Use HTTPS endpoints only</li>
              <li>• Implement idempotency to handle duplicate events</li>
              <li>• Respond quickly (within 5 seconds)</li>
              <li>• Log all webhook events for audit trails</li>
            </ul>
          </SecurityCard>

          <SecurityCard
            icon={<Lock className="w-6 h-6" />}
            title="Transaction Security"
            color="purple"
          >
            <ul className="space-y-2 text-sm text-gray-700">
              <li>• Validate all input parameters</li>
              <li>• Implement rate limiting on your endpoints</li>
              <li>• Never trust client-side data</li>
              <li>• Log all transactions for compliance</li>
              <li>• Monitor for suspicious patterns</li>
            </ul>
          </SecurityCard>

          <SecurityCard
            icon={<Globe className="w-6 h-6" />}
            title="Network Security"
            color="orange"
          >
            <ul className="space-y-2 text-sm text-gray-700">
              <li>• Always use HTTPS for API requests</li>
              <li>• Implement IP whitelisting where possible</li>
              <li>• Use firewall rules to restrict access</li>
              <li>• Monitor API usage for anomalies</li>
              <li>• Keep all dependencies up to date</li>
            </ul>
          </SecurityCard>
        </div>
      </Section>

      <Section title="🚨 Security Incidents">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h4 className="font-semibold text-red-900 mb-3">If You Suspect a Security Breach:</h4>
          <ol className="space-y-2 text-sm text-red-800 list-decimal list-inside">
            <li>Immediately regenerate your API keys in Settings</li>
            <li>Review recent transactions for suspicious activity</li>
            <li>Check webhook logs for unauthorized requests</li>
            <li>Update your webhook secret</li>
            <li>Contact our support team immediately</li>
            <li>Review and strengthen your security measures</li>
          </ol>
        </div>
      </Section>

      <Section title="✅ Security Checklist">
        <div className="space-y-3">
          <ChecklistItem>API keys stored in environment variables</ChecklistItem>
          <ChecklistItem>Webhook signature verification implemented</ChecklistItem>
          <ChecklistItem>HTTPS used for all API requests</ChecklistItem>
          <ChecklistItem>Input validation on all parameters</ChecklistItem>
          <ChecklistItem>Rate limiting configured</ChecklistItem>
          <ChecklistItem>Transaction logging enabled</ChecklistItem>
          <ChecklistItem>Regular security audits scheduled</ChecklistItem>
          <ChecklistItem>Incident response plan documented</ChecklistItem>
        </div>
      </Section>
    </div>
  );
}

// Helper Components
function Section({ title, subtitle, children }) {
  return (
    <div className="bg-white rounded-xl shadow-md p-8">
      <h2 className="text-2xl font-bold text-gray-800 mb-2">{title}</h2>
      {subtitle && <p className="text-gray-600 mb-6">{subtitle}</p>}
      {children}
    </div>
  );
}

function Step({ number, title, children }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
        {number}
      </div>
      <div className="flex-1">
        <h4 className="font-semibold text-gray-800 mb-2">{title}</h4>
        {children}
      </div>
    </div>
  );
}

function CodeBlock({ language, code, onCopy, copied, id }) {
  return (
    <div className="relative">
      <div className="absolute top-3 right-3 z-10">
        <button
          onClick={() => onCopy(code, id)}
          className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors"
        >
          {copied[id] ? (
            <>
              <Check className="w-4 h-4" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="bg-gray-900 text-gray-100 p-6 rounded-lg overflow-x-auto">
        <code className="text-sm">{code}</code>
      </pre>
    </div>
  );
}

function ChecklistItem({ children }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
      <div className="flex-shrink-0 w-5 h-5 bg-green-500 rounded flex items-center justify-center">
        <Check className="w-3 h-3 text-white" />
      </div>
      <span className="text-gray-700">{children}</span>
    </div>
  );
}

function APIEndpoint({ method, endpoint, title, description, children }) {
  const methodColors = {
    GET: 'bg-blue-100 text-blue-700',
    POST: 'bg-green-100 text-green-700',
    PATCH: 'bg-yellow-100 text-yellow-700',
    DELETE: 'bg-red-100 text-red-700',
  };

  return (
    <div className="border border-gray-200 rounded-lg p-6 mb-6">
      <div className="flex items-start gap-4 mb-4">
        <span className={`px-3 py-1 rounded font-semibold text-sm ${methodColors[method]}`}>
          {method}
        </span>
        <div className="flex-1">
          <code className="text-lg font-mono text-gray-800">{endpoint}</code>
          <h4 className="font-semibold text-gray-800 mt-2">{title}</h4>
          <p className="text-sm text-gray-600 mt-1">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function ParamTable({ params }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left py-3 px-4 font-semibold text-gray-700">Parameter</th>
            <th className="text-left py-3 px-4 font-semibold text-gray-700">Type</th>
            <th className="text-left py-3 px-4 font-semibold text-gray-700">Required</th>
            <th className="text-left py-3 px-4 font-semibold text-gray-700">Description</th>
          </tr>
        </thead>
        <tbody>
          {params.map((param, index) => (
            <tr key={index} className="border-b border-gray-100">
              <td className="py-3 px-4 font-mono text-blue-600">{param.name}</td>
              <td className="py-3 px-4 text-gray-600">{param.type}</td>
              <td className="py-3 px-4">
                <span className={`px-2 py-1 rounded text-xs font-semibold ${
                  param.required ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {param.required ? 'Required' : 'Optional'}
                </span>
              </td>
              <td className="py-3 px-4 text-gray-600">{param.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status, description }) {
  const colors = {
    pending: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    expired: 'bg-gray-100 text-gray-700',
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${colors[status]}`}>
        {status}
      </span>
      <span className="text-sm text-gray-600">{description}</span>
    </div>
  );
}

function ErrorCode({ code, description }) {
  return (
    <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
      <code className="flex-shrink-0 px-3 py-1 bg-gray-800 text-white rounded font-mono text-sm font-semibold">
        {code}
      </code>
      <p className="text-gray-700">{description}</p>
    </div>
  );
}

function EventCard({ event, description }) {
  return (
    <div className="border border-blue-200 bg-blue-50 rounded-lg p-4">
      <code className="text-blue-700 font-semibold">{event}</code>
      <p className="text-sm text-gray-700 mt-2">{description}</p>
    </div>
  );
}

function RetryStep({ attempt, time }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
      <div className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-sm">
        {attempt}
      </div>
      <span className="text-gray-700">{time}</span>
    </div>
  );
}

function ExampleSection({ title, language, children }) {
  return (
    <div className="border-l-4 border-blue-500 pl-6 mb-8">
      <h3 className="text-xl font-bold text-gray-800 mb-2">{title}</h3>
      <p className="text-sm text-gray-600 mb-4">{language}</p>
      {children}
    </div>
  );
}

function SecurityTip({ icon, title, children }) {
  return (
    <div className="flex gap-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
      <span className="text-2xl">{icon}</span>
      <div>
        <h4 className="font-semibold text-blue-900 mb-1">{title}</h4>
        <p className="text-sm text-blue-800">{children}</p>
      </div>
    </div>
  );
}

function SecurityCard({ icon, title, color, children }) {
  const colors = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    purple: 'from-purple-500 to-purple-600',
    orange: 'from-orange-500 to-orange-600',
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className={`bg-gradient-to-r ${colors[color]} text-white p-4 flex items-center gap-3`}>
        {icon}
        <h4 className="font-bold text-lg">{title}</h4>
      </div>
      <div className="p-6">
        {children}
      </div>
    </div>
  );
}