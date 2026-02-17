import React, { useState } from 'react';
import { 
  BookOpen, 
  Code, 
  Copy, 
  Check, 
  ChevronDown, 
  ChevronRight,
  Zap,
  ArrowRight,
  CreditCard,
  Send,
  AlertTriangle,
  CheckCircle,
  Clock,
  ExternalLink
} from 'lucide-react';

const ApiDocs = () => {
  const [copiedCode, setCopiedCode] = useState(null);
  const [expandedSection, setExpandedSection] = useState('payin');

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const CodeBlock = ({ code, language = 'bash', id }) => (
    <div className="relative bg-gray-900 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <span className="text-xs text-gray-400 uppercase">{language}</span>
        <button
          onClick={() => copyToClipboard(code, id)}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
        >
          {copiedCode === id ? (
            <>
              <Check className="w-3.5 h-3.5 text-green-400" />
              <span className="text-green-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-sm">
        <code className="text-gray-300 whitespace-pre">{code}</code>
      </pre>
    </div>
  );

  const Section = ({ id, title, icon: Icon, children, color = "blue" }) => {
    const isExpanded = expandedSection === id;
    const colors = {
      blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      green: 'bg-green-500/10 text-green-400 border-green-500/20',
      orange: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    };

    return (
      <div className="border border-gray-700 rounded-xl overflow-hidden">
        <button
          onClick={() => setExpandedSection(isExpanded ? null : id)}
          className={`w-full flex items-center justify-between p-4 ${colors[color]} border-b border-gray-700 hover:bg-opacity-20 transition-colors`}
        >
          <div className="flex items-center gap-3">
            <Icon className="w-5 h-5" />
            <span className="font-semibold text-white">{title}</span>
          </div>
          {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
        </button>
        {isExpanded && (
          <div className="p-6 bg-gray-800/50 space-y-6">
            {children}
          </div>
        )}
      </div>
    );
  };

  const Step = ({ number, title, children }) => (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-sm">
        {number}
      </div>
      <div className="flex-1">
        <h4 className="font-medium text-white mb-2">{title}</h4>
        <div className="text-gray-400 text-sm space-y-3">
          {children}
        </div>
      </div>
    </div>
  );

  const StatusBadge = ({ status, description }) => {
    const colors = {
      pending: 'bg-yellow-500/10 text-yellow-400',
      completed: 'bg-green-500/10 text-green-400',
      failed: 'bg-red-500/10 text-red-400',
      rejected: 'bg-red-500/10 text-red-400',
      expired: 'bg-gray-500/10 text-gray-400',
    };
    return (
      <div className="flex items-center gap-2">
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] || 'bg-gray-500/10 text-gray-400'}`}>
          {status}
        </span>
        <span className="text-gray-500 text-xs">— {description}</span>
      </div>
    );
  };

  const baseUrl = 'https://api.pay2x.io';

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-white flex items-center justify-center gap-3">
          <BookOpen className="w-8 h-8 text-blue-400" />
          API Documentation
        </h1>
        <p className="text-gray-400">Simple step-by-step guide to integrate Pay2X</p>
      </div>

      {/* Quick Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <div className="text-xs text-gray-500 uppercase mb-1">Base URL</div>
          <code className="text-blue-400 text-sm">{baseUrl}</code>
        </div>
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <div className="text-xs text-gray-500 uppercase mb-1">Authentication</div>
          <code className="text-blue-400 text-sm">Bearer &lt;api_key&gt;</code>
        </div>
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <div className="text-xs text-gray-500 uppercase mb-1">Rate Limit</div>
          <span className="text-white text-sm">60 requests/minute</span>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-4">
        
        {/* PAYIN SECTION */}
        <Section id="payin" title="Collect Payment (Payin)" icon={CreditCard} color="blue">
          <div className="space-y-8">
            {/* Flow Diagram */}
            <div className="flex items-center justify-center gap-2 text-sm flex-wrap">
              <span className="px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg">Create Payin</span>
              <ArrowRight className="w-4 h-4 text-gray-500" />
              <span className="px-3 py-1.5 bg-gray-700 text-gray-300 rounded-lg">Show UPI to User</span>
              <ArrowRight className="w-4 h-4 text-gray-500" />
              <span className="px-3 py-1.5 bg-gray-700 text-gray-300 rounded-lg">User Pays + Enters UTR</span>
              <ArrowRight className="w-4 h-4 text-gray-500" />
              <span className="px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg">Submit UTR</span>
              <ArrowRight className="w-4 h-4 text-gray-500" />
              <span className="px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg">Webhook</span>
            </div>

            {/* Step 1 */}
            <Step number="1" title="Create Payment Request">
              <p>Call this when user wants to pay. You'll get a UPI ID to show them.</p>
              <CodeBlock id="payin-create" language="bash" code={`curl -X POST ${baseUrl}/v1/payin/create \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 5000,
    "userId": "customer_123",
    "orderId": "ORDER-001"
  }'`} />
              <div className="bg-gray-800 rounded-lg p-4 mt-3">
                <div className="text-xs text-gray-500 uppercase mb-2">Response</div>
                <CodeBlock id="payin-create-res" language="json" code={`{
  "success": true,
  "payment_id": "abc-123-uuid",
  "upi_id": "merchant@okaxis",
  "holder_name": "Rajesh Kumar",
  "amount": 5000,
  "timer": 600,
  "expires_at": "2026-02-17T12:10:00Z"
}`} />
              </div>
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 mt-3">
                <p className="text-blue-300 text-sm">
                  💡 Show the <code className="bg-blue-900/50 px-1 rounded">upi_id</code> and <code className="bg-blue-900/50 px-1 rounded">holder_name</code> to your customer with a 10-minute countdown timer.
                </p>
              </div>
            </Step>

            {/* Step 2 */}
            <Step number="2" title="Submit UTR (After User Pays)">
              <p>After user pays via their UPI app, they'll have a UTR number. Submit it:</p>
              <CodeBlock id="payin-utr" language="bash" code={`curl -X PATCH ${baseUrl}/v1/payin/submit-utr \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "payinId": "abc-123-uuid",
    "utrId": "412345678901"
  }'`} />
            </Step>

            {/* Step 3 */}
            <Step number="3" title="Receive Webhook">
              <p>When trader verifies the payment, you'll receive a webhook:</p>
              <CodeBlock id="payin-webhook" language="json" code={`{
  "event": "payment.completed",
  "data": {
    "payinId": "abc-123-uuid",
    "orderId": "ORDER-001",
    "amount": 5000,
    "status": "completed",
    "utrId": "412345678901"
  }
}`} />
            </Step>

            {/* Check Status */}
            <Step number="?" title="Check Status (Optional)">
              <p>You can also poll for status instead of waiting for webhook:</p>
              <CodeBlock id="payin-status" language="bash" code={`curl "${baseUrl}/v1/payin/status?payinId=abc-123-uuid" \\
  -H "Authorization: Bearer YOUR_API_KEY"`} />
            </Step>

            {/* Statuses */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h4 className="font-medium text-white mb-3">Payment Statuses</h4>
              <div className="space-y-2">
                <StatusBadge status="pending" description="Waiting for payment" />
                <StatusBadge status="completed" description="Payment verified" />
                <StatusBadge status="rejected" description="Payment rejected" />
                <StatusBadge status="expired" description="Timer ran out" />
              </div>
            </div>
          </div>
        </Section>

        {/* PAYOUT SECTION */}
        <Section id="payout" title="Send Money (Payout)" icon={Send} color="green">
          <div className="space-y-8">
            {/* Flow */}
            <div className="flex items-center justify-center gap-2 text-sm flex-wrap">
              <span className="px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg">Create Payout</span>
              <ArrowRight className="w-4 h-4 text-gray-500" />
              <span className="px-3 py-1.5 bg-gray-700 text-gray-300 rounded-lg">Trader Processes</span>
              <ArrowRight className="w-4 h-4 text-gray-500" />
              <span className="px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg">Webhook</span>
            </div>

            <Step number="1" title="Create Payout Request">
              <p>Provide <strong>both</strong> bank account AND UPI details. Trader will choose the method.</p>
              <CodeBlock id="payout-create" language="bash" code={`curl -X POST ${baseUrl}/v1/payout/create \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 10000,
    "accountName": "John Doe",
    "accountNumber": "1234567890123",
    "ifscCode": "SBIN0001234",
    "upiId": "johndoe@okaxis",
    "bankName": "State Bank",
    "userId": "customer_123",
    "orderId": "WITHDRAW-001"
  }'`} />
              <div className="bg-gray-800 rounded-lg p-4 mt-3">
                <div className="text-xs text-gray-500 uppercase mb-2">Response</div>
                <CodeBlock id="payout-create-res" language="json" code={`{
  "success": true,
  "payout_id": "xyz-456-uuid",
  "txn_id": "PO1708123456AB",
  "amount": 10000,
  "fee": 200,
  "total_on_completion": 10200,
  "status": "pending"
}`} />
              </div>
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mt-3">
                <p className="text-yellow-300 text-sm">
                  ⚠️ Balance is deducted only when payout is <strong>completed</strong>, not when created.
                </p>
              </div>
            </Step>

            <Step number="2" title="Receive Webhook">
              <p>When trader completes the payout:</p>
              <CodeBlock id="payout-webhook" language="json" code={`{
  "event": "payout.completed",
  "data": {
    "payout_id": "xyz-456-uuid",
    "orderId": "WITHDRAW-001",
    "amount": 10000,
    "status": "completed",
    "utr": "SBIN12345678901"
  }
}`} />
            </Step>

            {/* Required Fields */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h4 className="font-medium text-white mb-3">Required Fields</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-gray-400">amount</div><div className="text-white">₹100 - ₹2,00,000</div>
                <div className="text-gray-400">accountName</div><div className="text-white">Beneficiary name</div>
                <div className="text-gray-400">accountNumber</div><div className="text-white">Bank account</div>
                <div className="text-gray-400">ifscCode</div><div className="text-white">Bank IFSC</div>
                <div className="text-gray-400">upiId</div><div className="text-white">UPI ID</div>
              </div>
            </div>
          </div>
        </Section>

        {/* DISPUTE SECTION */}
        <Section id="dispute" title="Raise Dispute" icon={AlertTriangle} color="orange">
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Payin Dispute */}
              <div className="bg-gray-800 rounded-lg p-4 border border-orange-500/20">
                <h4 className="font-medium text-white mb-2 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-orange-400" />
                  Payin Dispute
                </h4>
                <p className="text-gray-400 text-sm mb-3">Customer paid but not credited</p>
                <CodeBlock id="dispute-payin" language="json" code={`{
  "type": "payment_not_received",
  "upiId": "merchant@okaxis",
  "amount": 5000,
  "utr": "412345678901",
  "userId": "customer_123",
  "paymentDate": "2026-02-17",
  "receiptUrl": "https://...",
  "comment": "Customer says paid"
}`} />
              </div>

              {/* Payout Dispute */}
              <div className="bg-gray-800 rounded-lg p-4 border border-orange-500/20">
                <h4 className="font-medium text-white mb-2 flex items-center gap-2">
                  <Send className="w-4 h-4 text-orange-400" />
                  Payout Dispute
                </h4>
                <p className="text-gray-400 text-sm mb-3">Customer didn't receive payout</p>
                <CodeBlock id="dispute-payout" language="json" code={`{
  "type": "payout_not_received",
  "orderId": "WITHDRAW-001",
  "amount": 10000,
  "userId": "customer_123",
  "accountNumber": "1234567890",
  "comment": "Customer claims not received"
}`} />
              </div>
            </div>

            <Step number="1" title="Create Dispute">
              <CodeBlock id="dispute-create" language="bash" code={`curl -X POST ${baseUrl}/v1/dispute/create \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ ... dispute data ... }'`} />
            </Step>

            <div className="bg-gray-800 rounded-lg p-4">
              <h4 className="font-medium text-white mb-3">Dispute Types</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-gray-400">payment_not_received</span><span className="text-orange-400">Payin</span></div>
                <div className="flex justify-between"><span className="text-gray-400">wrong_amount</span><span className="text-orange-400">Payin</span></div>
                <div className="flex justify-between"><span className="text-gray-400">duplicate_payment</span><span className="text-orange-400">Payin</span></div>
                <div className="flex justify-between"><span className="text-gray-400">payout_not_received</span><span className="text-green-400">Payout</span></div>
              </div>
            </div>
          </div>
        </Section>

      </div>

      {/* Webhooks */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-yellow-400" />
          Webhooks
        </h3>
        <p className="text-gray-400 mb-4">
          Configure your webhook URL in Settings. We'll send POST requests with signature verification.
        </p>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <code className="bg-gray-900 px-2 py-1 rounded text-blue-400 text-sm">X-Webhook-Signature</code>
            <span className="text-gray-400 text-sm">HMAC-SHA256 signature</span>
          </div>
          <CodeBlock id="webhook-verify" language="javascript" code={`const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(JSON.stringify(payload)).digest('hex');
  return signature === digest;
}`} />
        </div>
      </div>

      {/* Error Codes */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-xl font-semibold text-white mb-4">Error Codes</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="flex justify-between p-2 bg-gray-900 rounded">
            <span className="text-red-400">401</span>
            <span className="text-gray-400">Invalid API key</span>
          </div>
          <div className="flex justify-between p-2 bg-gray-900 rounded">
            <span className="text-red-400">403</span>
            <span className="text-gray-400">Account inactive</span>
          </div>
          <div className="flex justify-between p-2 bg-gray-900 rounded">
            <span className="text-red-400">400</span>
            <span className="text-gray-400">Missing required fields</span>
          </div>
          <div className="flex justify-between p-2 bg-gray-900 rounded">
            <span className="text-red-400">429</span>
            <span className="text-gray-400">Rate limit exceeded</span>
          </div>
          <div className="flex justify-between p-2 bg-gray-900 rounded">
            <span className="text-red-400">409</span>
            <span className="text-gray-400">Duplicate order ID</span>
          </div>
          <div className="flex justify-between p-2 bg-gray-900 rounded">
            <span className="text-red-400">402</span>
            <span className="text-gray-400">No UPI available</span>
          </div>
        </div>
      </div>

      {/* Limits */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-xl font-semibold text-white mb-4">Limits</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center p-4 bg-gray-900 rounded-lg">
            <div className="text-2xl font-bold text-blue-400">₹100</div>
            <div className="text-gray-500 text-sm">Minimum Amount</div>
          </div>
          <div className="text-center p-4 bg-gray-900 rounded-lg">
            <div className="text-2xl font-bold text-blue-400">₹1,00,000</div>
            <div className="text-gray-500 text-sm">Max Payin</div>
          </div>
          <div className="text-center p-4 bg-gray-900 rounded-lg">
            <div className="text-2xl font-bold text-blue-400">₹2,00,000</div>
            <div className="text-gray-500 text-sm">Max Payout</div>
          </div>
        </div>
        <div className="mt-4 p-4 bg-gray-900 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Rate Limit</span>
            <span className="text-white font-medium">60 requests/minute</span>
          </div>
        </div>
      </div>

      {/* API Endpoints Summary */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-xl font-semibold text-white mb-4">All Endpoints</h3>
        <div className="space-y-2 text-sm font-mono">
          <div className="flex items-center gap-3 p-2 bg-gray-900 rounded">
            <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs">POST</span>
            <span className="text-gray-300">/v1/payin/create</span>
            <span className="text-gray-500 ml-auto">Create payment</span>
          </div>
          <div className="flex items-center gap-3 p-2 bg-gray-900 rounded">
            <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-xs">PATCH</span>
            <span className="text-gray-300">/v1/payin/submit-utr</span>
            <span className="text-gray-500 ml-auto">Submit UTR</span>
          </div>
          <div className="flex items-center gap-3 p-2 bg-gray-900 rounded">
            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs">GET</span>
            <span className="text-gray-300">/v1/payin/status</span>
            <span className="text-gray-500 ml-auto">Check payment</span>
          </div>
          <div className="flex items-center gap-3 p-2 bg-gray-900 rounded">
            <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs">POST</span>
            <span className="text-gray-300">/v1/payin/switch</span>
            <span className="text-gray-500 ml-auto">Try different UPI</span>
          </div>
          <div className="flex items-center gap-3 p-2 bg-gray-900 rounded">
            <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs">POST</span>
            <span className="text-gray-300">/v1/payout/create</span>
            <span className="text-gray-500 ml-auto">Create payout</span>
          </div>
          <div className="flex items-center gap-3 p-2 bg-gray-900 rounded">
            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs">GET</span>
            <span className="text-gray-300">/v1/payout/status</span>
            <span className="text-gray-500 ml-auto">Check payout</span>
          </div>
          <div className="flex items-center gap-3 p-2 bg-gray-900 rounded">
            <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs">POST</span>
            <span className="text-gray-300">/v1/dispute/create</span>
            <span className="text-gray-500 ml-auto">Raise dispute</span>
          </div>
          <div className="flex items-center gap-3 p-2 bg-gray-900 rounded">
            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs">GET</span>
            <span className="text-gray-300">/v1/dispute/status</span>
            <span className="text-gray-500 ml-auto">Check dispute</span>
          </div>
        </div>
      </div>

      {/* Help */}
      <div className="text-center text-gray-500 text-sm">
        Need help? Contact <a href="mailto:support@pay2x.io" className="text-blue-400 hover:underline">support@pay2x.io</a>
      </div>
    </div>
  );
};

export default ApiDocs;
