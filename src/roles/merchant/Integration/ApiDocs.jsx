import React, { useState } from 'react';
import { 
  Copy, 
  Check, 
  ChevronDown, 
  ArrowRight,
  CreditCard,
  Send,
  AlertTriangle,
  Terminal,
  Globe,
  Lock,
  Clock,
  Zap,
  Sparkles,
  CheckCircle2
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
    <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-900 shadow-sm">
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-green-400" />
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">{language}</span>
        </div>
        <button
          onClick={() => copyToClipboard(code, id)}
          className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white"
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
      <pre className="p-4 overflow-x-auto text-sm leading-relaxed">
        <code className="text-gray-300 font-mono">{code}</code>
      </pre>
    </div>
  );

  const Section = ({ id, title, subtitle, icon: Icon, children, color }) => {
    const isExpanded = expandedSection === id;
    
    const colors = {
      violet: { bg: 'bg-violet-500', light: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-600' },
      emerald: { bg: 'bg-emerald-500', light: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-600' },
      amber: { bg: 'bg-amber-500', light: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-600' },
    };
    
    const c = colors[color];

    return (
      <div className={`rounded-2xl overflow-hidden border-2 transition-all duration-300 ${
        isExpanded ? `${c.border} shadow-lg` : 'border-gray-200 hover:border-gray-300'
      }`}>
        <button
          onClick={() => setExpandedSection(isExpanded ? null : id)}
          className={`w-full flex items-center justify-between p-5 transition-all duration-300 ${c.bg} text-white`}
        >
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-white/20 backdrop-blur-sm">
              <Icon className="w-6 h-6" />
            </div>
            <div className="text-left">
              <h3 className="font-bold text-lg">{title}</h3>
              <p className="text-white/80 text-sm">{subtitle}</p>
            </div>
          </div>
          <div className={`p-2 rounded-full bg-white/20 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
            <ChevronDown className="w-5 h-5" />
          </div>
        </button>
        
        <div className={`transition-all duration-300 ease-in-out ${
          isExpanded ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'
        }`}>
          <div className={`p-6 ${c.light} space-y-8`}>
            {children}
          </div>
        </div>
      </div>
    );
  };

  const Step = ({ number, title, children, color = "violet" }) => {
    const colors = {
      violet: "bg-violet-500",
      emerald: "bg-emerald-500",
      amber: "bg-amber-500",
    };
    
    return (
      <div className="flex gap-5">
        <div className="flex-shrink-0">
          <div className={`w-10 h-10 rounded-xl ${colors[color]} flex items-center justify-center font-bold text-white shadow-lg`}>
            {number}
          </div>
        </div>
        <div className="flex-1 pt-1">
          <h4 className="font-semibold text-gray-900 text-lg mb-3">{title}</h4>
          <div className="text-gray-600 space-y-4">
            {children}
          </div>
        </div>
      </div>
    );
  };

  const FlowStep = ({ children, isLast, active }) => (
    <>
      <span className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
        active 
          ? 'bg-violet-100 text-violet-700 border-violet-300' 
          : 'bg-white text-gray-600 border-gray-200'
      }`}>
        {children}
      </span>
      {!isLast && <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
    </>
  );

  const StatusBadge = ({ status, description }) => {
    const styles = {
      pending: "bg-amber-100 text-amber-700 border-amber-200",
      completed: "bg-green-100 text-green-700 border-green-200",
      rejected: "bg-red-100 text-red-700 border-red-200",
      expired: "bg-gray-100 text-gray-600 border-gray-200",
    };
    
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl bg-white border border-gray-200 shadow-sm">
        <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${styles[status]}`}>
          {status}
        </span>
        <span className="text-gray-500 text-sm">{description}</span>
      </div>
    );
  };

  const MethodBadge = ({ method }) => {
    const styles = {
      GET: "bg-blue-100 text-blue-700",
      POST: "bg-green-100 text-green-700",
      PATCH: "bg-amber-100 text-amber-700",
      DELETE: "bg-red-100 text-red-700",
    };
    
    return (
      <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${styles[method]}`}>
        {method}
      </span>
    );
  };

  const baseUrl = 'https://api.pay2x.io';

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-12 space-y-12">
        
        {/* Hero Header */}
        <div className="text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-100 border border-violet-200">
            <Sparkles className="w-4 h-4 text-violet-500" />
            <span className="text-violet-700 text-sm font-medium">API Reference</span>
          </div>
          
          <h1 className="text-5xl font-black text-gray-900">
            Pay2X <span className="text-violet-500">API</span>
          </h1>
          
          <p className="text-xl text-gray-500 max-w-2xl mx-auto">
            Accept payments and send money with just a few lines of code
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-white border-2 border-violet-100 shadow-sm hover:shadow-md transition-shadow">
            <Globe className="w-6 h-6 text-violet-500 mb-3" />
            <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Base URL</div>
            <code className="text-violet-600 text-sm font-semibold">api.pay2x.io</code>
          </div>
          
          <div className="p-5 rounded-2xl bg-white border-2 border-emerald-100 shadow-sm hover:shadow-md transition-shadow">
            <Lock className="w-6 h-6 text-emerald-500 mb-3" />
            <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Auth</div>
            <code className="text-emerald-600 text-sm font-semibold">Bearer Token</code>
          </div>
          
          <div className="p-5 rounded-2xl bg-white border-2 border-amber-100 shadow-sm hover:shadow-md transition-shadow">
            <Clock className="w-6 h-6 text-amber-500 mb-3" />
            <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Rate Limit</div>
            <span className="text-amber-600 text-sm font-semibold">60/min</span>
          </div>
          
          <div className="p-5 rounded-2xl bg-white border-2 border-blue-100 shadow-sm hover:shadow-md transition-shadow">
            <Zap className="w-6 h-6 text-blue-500 mb-3" />
            <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Response</div>
            <span className="text-blue-600 text-sm font-semibold">&lt;200ms</span>
          </div>
        </div>

        {/* Main Sections */}
        <div className="space-y-4">
          
          {/* PAYIN SECTION */}
          <Section 
            id="payin" 
            title="Collect Payment" 
            subtitle="Accept payments via UPI"
            icon={CreditCard} 
            color="violet"
          >
            {/* Flow */}
            <div className="flex items-center justify-center gap-3 flex-wrap p-5 rounded-xl bg-white border border-gray-200 shadow-sm">
              <FlowStep active>Create Payin</FlowStep>
              <FlowStep>Show UPI</FlowStep>
              <FlowStep>User Pays</FlowStep>
              <FlowStep active>Submit UTR</FlowStep>
              <FlowStep isLast>
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  Done
                </span>
              </FlowStep>
            </div>

            <Step number="1" title="Create Payment Request" color="violet">
              <p>Get a UPI ID to show your customer</p>
              <CodeBlock id="payin-create" language="bash" code={`curl -X POST ${baseUrl}/v1/payin/create \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 5000,
    "userId": "customer_123",
    "orderId": "ORDER-001"
  }'`} />
              
              <div className="p-4 rounded-xl bg-violet-100 border border-violet-200">
                <h5 className="text-violet-800 font-semibold mb-2">📱 Display to Customer</h5>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-violet-600">UPI ID</span>
                    <div className="text-gray-900 font-mono font-semibold">merchant@okaxis</div>
                  </div>
                  <div>
                    <span className="text-violet-600">Name</span>
                    <div className="text-gray-900 font-semibold">Rajesh Kumar</div>
                  </div>
                </div>
              </div>
            </Step>

            <Step number="2" title="Submit UTR After Payment" color="violet">
              <p>Customer pays and gives you the UTR number</p>
              <CodeBlock id="payin-utr" language="bash" code={`curl -X PATCH ${baseUrl}/v1/payin/submit-utr \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "payinId": "abc-123-uuid",
    "utrId": "412345678901"
  }'`} />
            </Step>

            <Step number="3" title="Receive Success Webhook" color="emerald">
              <p>We'll POST to your webhook URL when verified</p>
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

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatusBadge status="pending" description="Waiting" />
              <StatusBadge status="completed" description="Success" />
              <StatusBadge status="rejected" description="Rejected" />
              <StatusBadge status="expired" description="Timeout" />
            </div>
          </Section>

          {/* PAYOUT SECTION */}
          <Section 
            id="payout" 
            title="Send Money" 
            subtitle="Payouts via Bank or UPI"
            icon={Send} 
            color="emerald"
          >
            <div className="flex items-center justify-center gap-3 flex-wrap p-5 rounded-xl bg-white border border-gray-200 shadow-sm">
              <FlowStep active>Create Payout</FlowStep>
              <FlowStep>Trader Processes</FlowStep>
              <FlowStep isLast>
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  Done
                </span>
              </FlowStep>
            </div>

            <Step number="1" title="Create Payout Request" color="emerald">
              <p>Provide <strong className="text-gray-900">both</strong> Bank and UPI details — trader chooses the method</p>
              <CodeBlock id="payout-create" language="bash" code={`curl -X POST ${baseUrl}/v1/payout/create \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 10000,
    "accountName": "John Doe",
    "accountNumber": "1234567890123",
    "ifscCode": "SBIN0001234",
    "upiId": "johndoe@okaxis",
    "orderId": "WITHDRAW-001"
  }'`} />
              
              <div className="p-4 rounded-xl bg-amber-100 border border-amber-200">
                <p className="text-amber-800 font-medium">
                  ⚡ Balance deducted only on <strong>completion</strong>, not on creation
                </p>
              </div>
            </Step>

            <Step number="2" title="Receive Completion Webhook" color="emerald">
              <CodeBlock id="payout-webhook" language="json" code={`{
  "event": "payout.completed",
  "data": {
    "payout_id": "xyz-456-uuid",
    "orderId": "WITHDRAW-001",
    "amount": 10000,
    "utr": "SBIN12345678901",
    "status": "completed"
  }
}`} />
            </Step>

            <div className="p-5 rounded-xl bg-white border border-gray-200 shadow-sm">
              <h5 className="text-gray-900 font-semibold mb-4">Required Fields</h5>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                {[
                  { field: 'amount', value: '₹5,000 - ₹50,000' },
                  { field: 'accountName', value: 'Beneficiary name' },
                  { field: 'accountNumber', value: 'Bank account' },
                  { field: 'ifscCode', value: 'Bank IFSC' },
                  { field: 'upiId', value: 'UPI ID' },
                ].map((item, i) => (
                  <div key={i} className="flex justify-between p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                    <code className="text-emerald-700 font-medium">{item.field}</code>
                    <span className="text-gray-600">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          {/* DISPUTE SECTION */}
          <Section 
            id="dispute" 
            title="Raise Dispute" 
            subtitle="Resolve payment issues"
            icon={AlertTriangle} 
            color="amber"
          >
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-5 rounded-xl bg-white border-2 border-violet-200 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-violet-100">
                    <CreditCard className="w-5 h-5 text-violet-600" />
                  </div>
                  <h4 className="font-semibold text-gray-900">Payin Dispute</h4>
                </div>
                <p className="text-gray-500 text-sm mb-4">Customer paid but not credited</p>
                <CodeBlock id="dispute-payin" language="json" code={`{
  "type": "payment_not_received",
  "upiId": "merchant@okaxis",
  "amount": 5000,
  "utr": "412345678901",
  "userId": "customer_123",
  "comment": "Customer paid"
}`} />
              </div>

              <div className="p-5 rounded-xl bg-white border-2 border-emerald-200 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-emerald-100">
                    <Send className="w-5 h-5 text-emerald-600" />
                  </div>
                  <h4 className="font-semibold text-gray-900">Payout Dispute</h4>
                </div>
                <p className="text-gray-500 text-sm mb-4">Customer didn't receive payout</p>
                <CodeBlock id="dispute-payout" language="json" code={`{
  "type": "payout_not_received",
  "orderId": "WITHDRAW-001",
  "amount": 10000,
  "userId": "customer_123",
  "comment": "Not received"
}`} />
              </div>
            </div>

            <div className="p-5 rounded-xl bg-white border border-gray-200 shadow-sm">
              <h5 className="text-gray-900 font-semibold mb-4">Dispute Types</h5>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                {[
                  { type: 'payment_not_received', cat: 'Payin', color: 'violet' },
                  { type: 'wrong_amount', cat: 'Payin', color: 'violet' },
                  { type: 'duplicate_payment', cat: 'Payin', color: 'violet' },
                  { type: 'payout_not_received', cat: 'Payout', color: 'emerald' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100">
                    <code className="text-gray-700">{item.type}</code>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      item.color === 'violet' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>{item.cat}</span>
                  </div>
                ))}
              </div>
            </div>
          </Section>
        </div>

        {/* Webhooks */}
        <div className="rounded-2xl overflow-hidden border-2 border-yellow-200 shadow-sm">
          <div className="p-5 bg-gradient-to-r from-yellow-400 to-amber-400">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-white/30">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-bold text-white text-lg">Webhook Signature Verification</h3>
            </div>
          </div>
          <div className="p-6 bg-yellow-50">
            <p className="text-gray-600 mb-4">Verify webhook authenticity using HMAC-SHA256</p>
            <CodeBlock id="webhook-verify" language="javascript" code={`const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(JSON.stringify(payload)).digest('hex');
  return signature === digest;
}

// Header: X-Webhook-Signature`} />
          </div>
        </div>

        {/* All Endpoints */}
        <div className="rounded-2xl overflow-hidden border-2 border-gray-200 shadow-sm">
          <div className="p-5 bg-gradient-to-r from-gray-700 to-gray-800">
            <h3 className="font-bold text-white text-lg">All Endpoints</h3>
          </div>
          <div className="divide-y divide-gray-100 bg-white">
            {[
              { method: 'POST', path: '/v1/payin/create', desc: 'Create payment' },
              { method: 'PATCH', path: '/v1/payin/submit-utr', desc: 'Submit UTR' },
              { method: 'GET', path: '/v1/payin/status', desc: 'Check payment' },
              { method: 'POST', path: '/v1/payin/switch', desc: 'Try different UPI' },
              { method: 'POST', path: '/v1/payout/create', desc: 'Create payout' },
              { method: 'GET', path: '/v1/payout/status', desc: 'Check payout' },
              { method: 'POST', path: '/v1/dispute/create', desc: 'Raise dispute' },
              { method: 'GET', path: '/v1/dispute/status', desc: 'Check dispute' },
            ].map((endpoint, i) => (
              <div key={i} className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors">
                <MethodBadge method={endpoint.method} />
                <code className="text-gray-800 font-mono flex-1">{endpoint.path}</code>
                <span className="text-gray-400 text-sm">{endpoint.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Limits & Errors */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Limits */}
          <div className="rounded-2xl overflow-hidden border-2 border-blue-200 shadow-sm">
            <div className="p-4 bg-gradient-to-r from-blue-500 to-cyan-500">
              <h3 className="font-bold text-white">Limits</h3>
            </div>
            <div className="p-4 bg-blue-50 space-y-3">
              {[
                { label: 'Payin Min', value: '₹500' },
                { label: 'Payin Max', value: '₹50,000' },
                { label: 'Payout Min', value: '₹5,000' },
                { label: 'Payout Max', value: '₹50,000' },
                { label: 'Rate Limit', value: '60 req/min' },
              ].map((item, i) => (
                <div key={i} className="flex justify-between items-center p-3 rounded-lg bg-white border border-blue-100">
                  <span className="text-gray-600">{item.label}</span>
                  <span className="text-blue-700 font-semibold">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Error Codes */}
          <div className="rounded-2xl overflow-hidden border-2 border-red-200 shadow-sm">
            <div className="p-4 bg-gradient-to-r from-red-500 to-pink-500">
              <h3 className="font-bold text-white">Error Codes</h3>
            </div>
            <div className="p-4 bg-red-50 space-y-3">
              {[
                { code: '400', desc: 'Bad request' },
                { code: '401', desc: 'Invalid API key' },
                { code: '402', desc: 'No UPI available' },
                { code: '403', desc: 'Account inactive' },
                { code: '409', desc: 'Duplicate order' },
                { code: '429', desc: 'Rate limited' },
              ].map((err, i) => (
                <div key={i} className="flex justify-between items-center p-3 rounded-lg bg-white border border-red-100">
                  <span className="text-red-600 font-mono font-bold">{err.code}</span>
                  <span className="text-gray-600">{err.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center py-8 border-t border-gray-200">
          <p className="text-gray-400">
            Need help? Contact{' '}
            <a href="mailto:support@pay2x.io" className="text-violet-500 hover:text-violet-600 font-medium transition-colors">
              support@pay2x.io
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ApiDocs;
