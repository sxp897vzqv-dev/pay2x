import React, { useState } from 'react';
import { 
  BookOpen, 
  Copy, 
  Check, 
  ChevronDown, 
  ChevronRight,
  Zap,
  ArrowRight,
  CreditCard,
  Send,
  AlertTriangle,
  ExternalLink,
  Terminal,
  Globe,
  Lock,
  Clock,
  Sparkles
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
    <div className="relative group rounded-xl overflow-hidden border border-white/10 bg-[#0d1117]">
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#161b22] border-b border-white/10">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">{language}</span>
        </div>
        <button
          onClick={() => copyToClipboard(code, id)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-200 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white"
        >
          {copiedCode === id ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied!</span>
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

  const Section = ({ id, title, subtitle, icon: Icon, children, gradient }) => {
    const isExpanded = expandedSection === id;

    return (
      <div className={`rounded-2xl overflow-hidden border transition-all duration-300 ${
        isExpanded ? 'border-white/20 shadow-2xl shadow-purple-500/10' : 'border-white/10 hover:border-white/20'
      }`}>
        <button
          onClick={() => setExpandedSection(isExpanded ? null : id)}
          className={`w-full flex items-center justify-between p-5 transition-all duration-300 ${gradient}`}
        >
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-white/10 backdrop-blur-sm">
              <Icon className="w-6 h-6 text-white" />
            </div>
            <div className="text-left">
              <h3 className="font-bold text-white text-lg">{title}</h3>
              <p className="text-white/60 text-sm">{subtitle}</p>
            </div>
          </div>
          <div className={`p-2 rounded-full bg-white/10 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
            <ChevronDown className="w-5 h-5 text-white" />
          </div>
        </button>
        
        <div className={`transition-all duration-300 ease-in-out ${
          isExpanded ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'
        }`}>
          <div className="p-6 bg-[#0a0a0f] space-y-8">
            {children}
          </div>
        </div>
      </div>
    );
  };

  const Step = ({ number, title, children, color = "violet" }) => {
    const colors = {
      violet: "from-violet-500 to-purple-500",
      emerald: "from-emerald-500 to-teal-500",
      amber: "from-amber-500 to-orange-500",
      blue: "from-blue-500 to-cyan-500",
    };
    
    return (
      <div className="flex gap-5">
        <div className="flex-shrink-0">
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colors[color]} flex items-center justify-center font-bold text-white shadow-lg`}>
            {number}
          </div>
        </div>
        <div className="flex-1 pt-1">
          <h4 className="font-semibold text-white text-lg mb-3">{title}</h4>
          <div className="text-gray-400 space-y-4">
            {children}
          </div>
        </div>
      </div>
    );
  };

  const FlowStep = ({ children, isLast, color = "violet" }) => {
    const colors = {
      violet: "bg-violet-500/20 text-violet-300 border-violet-500/30",
      emerald: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
      amber: "bg-amber-500/20 text-amber-300 border-amber-500/30",
      gray: "bg-white/5 text-gray-300 border-white/10",
    };
    
    return (
      <>
        <span className={`px-4 py-2 rounded-full text-sm font-medium border ${colors[color]}`}>
          {children}
        </span>
        {!isLast && <ArrowRight className="w-4 h-4 text-gray-600 flex-shrink-0" />}
      </>
    );
  };

  const StatusBadge = ({ status, description }) => {
    const styles = {
      pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      failed: "bg-red-500/10 text-red-400 border-red-500/20",
      rejected: "bg-red-500/10 text-red-400 border-red-500/20",
      expired: "bg-gray-500/10 text-gray-400 border-gray-500/20",
    };
    
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/5">
        <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${styles[status]}`}>
          {status}
        </span>
        <span className="text-gray-400 text-sm">{description}</span>
      </div>
    );
  };

  const MethodBadge = ({ method }) => {
    const styles = {
      GET: "bg-blue-500/20 text-blue-400",
      POST: "bg-emerald-500/20 text-emerald-400",
      PATCH: "bg-amber-500/20 text-amber-400",
      DELETE: "bg-red-500/20 text-red-400",
    };
    
    return (
      <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${styles[method]}`}>
        {method}
      </span>
    );
  };

  const baseUrl = 'https://api.pay2x.io';

  return (
    <div className="min-h-screen bg-[#050507]">
      <div className="max-w-5xl mx-auto px-4 py-12 space-y-12">
        
        {/* Hero Header */}
        <div className="text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-violet-500/20 to-purple-500/20 border border-violet-500/30">
            <Sparkles className="w-4 h-4 text-violet-400" />
            <span className="text-violet-300 text-sm font-medium">Developer Documentation</span>
          </div>
          
          <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-gray-200 to-gray-400">
            Pay2X API
          </h1>
          
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Accept payments and send money with just a few lines of code
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-gradient-to-br from-violet-500/10 to-purple-500/10 border border-violet-500/20">
            <Globe className="w-6 h-6 text-violet-400 mb-3" />
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Base URL</div>
            <code className="text-violet-300 text-sm font-mono">api.pay2x.io</code>
          </div>
          
          <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20">
            <Lock className="w-6 h-6 text-emerald-400 mb-3" />
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Auth</div>
            <code className="text-emerald-300 text-sm font-mono">Bearer Token</code>
          </div>
          
          <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20">
            <Clock className="w-6 h-6 text-amber-400 mb-3" />
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Rate Limit</div>
            <span className="text-amber-300 text-sm font-semibold">60/min</span>
          </div>
          
          <div className="p-5 rounded-2xl bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20">
            <Zap className="w-6 h-6 text-blue-400 mb-3" />
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Response</div>
            <span className="text-blue-300 text-sm font-semibold">&lt;200ms</span>
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
            gradient="bg-gradient-to-r from-violet-600 to-purple-600"
          >
            {/* Flow */}
            <div className="flex items-center justify-center gap-3 flex-wrap p-4 rounded-xl bg-white/5 border border-white/10">
              <FlowStep color="violet">Create Payin</FlowStep>
              <FlowStep color="gray">Show UPI</FlowStep>
              <FlowStep color="gray">User Pays</FlowStep>
              <FlowStep color="violet">Submit UTR</FlowStep>
              <FlowStep color="emerald" isLast>Webhook ✓</FlowStep>
            </div>

            <Step number="1" title="Create Payment Request" color="violet">
              <p className="text-gray-400">Get a UPI ID to show your customer</p>
              <CodeBlock id="payin-create" language="bash" code={`curl -X POST ${baseUrl}/v1/payin/create \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 5000,
    "userId": "customer_123",
    "orderId": "ORDER-001"
  }'`} />
              
              <div className="p-4 rounded-xl bg-gradient-to-r from-violet-500/10 to-purple-500/10 border border-violet-500/20">
                <h5 className="text-violet-300 font-medium mb-2">📱 Show to Customer</h5>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">UPI ID</span>
                    <div className="text-white font-mono">merchant@okaxis</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Name</span>
                    <div className="text-white">Rajesh Kumar</div>
                  </div>
                </div>
              </div>
            </Step>

            <Step number="2" title="Submit UTR After Payment" color="violet">
              <p className="text-gray-400">Customer pays and gives you UTR number</p>
              <CodeBlock id="payin-utr" language="bash" code={`curl -X PATCH ${baseUrl}/v1/payin/submit-utr \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "payinId": "abc-123-uuid",
    "utrId": "412345678901"
  }'`} />
            </Step>

            <Step number="3" title="Receive Success Webhook" color="emerald">
              <p className="text-gray-400">We'll POST to your webhook URL</p>
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
            gradient="bg-gradient-to-r from-emerald-600 to-teal-600"
          >
            <div className="flex items-center justify-center gap-3 flex-wrap p-4 rounded-xl bg-white/5 border border-white/10">
              <FlowStep color="emerald">Create Payout</FlowStep>
              <FlowStep color="gray">Trader Processes</FlowStep>
              <FlowStep color="emerald" isLast>Webhook ✓</FlowStep>
            </div>

            <Step number="1" title="Create Payout Request" color="emerald">
              <p className="text-gray-400">Provide <strong className="text-white">both</strong> Bank and UPI details — trader chooses the method</p>
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
              
              <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20">
                <p className="text-amber-300 text-sm">
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

            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <h5 className="text-white font-medium mb-3">Required Fields</h5>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between p-2 rounded bg-white/5">
                  <span className="text-gray-400">amount</span>
                  <span className="text-emerald-400">₹100 - ₹2,00,000</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-white/5">
                  <span className="text-gray-400">accountName</span>
                  <span className="text-white">Beneficiary</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-white/5">
                  <span className="text-gray-400">accountNumber</span>
                  <span className="text-white">Bank Account</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-white/5">
                  <span className="text-gray-400">ifscCode</span>
                  <span className="text-white">IFSC</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-white/5 col-span-2">
                  <span className="text-gray-400">upiId</span>
                  <span className="text-white">UPI ID</span>
                </div>
              </div>
            </div>
          </Section>

          {/* DISPUTE SECTION */}
          <Section 
            id="dispute" 
            title="Raise Dispute" 
            subtitle="Resolve payment issues"
            icon={AlertTriangle} 
            gradient="bg-gradient-to-r from-amber-600 to-orange-600"
          >
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-5 rounded-xl bg-gradient-to-br from-violet-500/10 to-purple-500/10 border border-violet-500/20">
                <div className="flex items-center gap-3 mb-4">
                  <CreditCard className="w-5 h-5 text-violet-400" />
                  <h4 className="font-semibold text-white">Payin Dispute</h4>
                </div>
                <p className="text-gray-400 text-sm mb-4">Customer paid but not credited</p>
                <CodeBlock id="dispute-payin" language="json" code={`{
  "type": "payment_not_received",
  "upiId": "merchant@okaxis",
  "amount": 5000,
  "utr": "412345678901",
  "userId": "customer_123",
  "receiptUrl": "https://...",
  "comment": "Customer paid"
}`} />
              </div>

              <div className="p-5 rounded-xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20">
                <div className="flex items-center gap-3 mb-4">
                  <Send className="w-5 h-5 text-emerald-400" />
                  <h4 className="font-semibold text-white">Payout Dispute</h4>
                </div>
                <p className="text-gray-400 text-sm mb-4">Customer didn't receive payout</p>
                <CodeBlock id="dispute-payout" language="json" code={`{
  "type": "payout_not_received",
  "orderId": "WITHDRAW-001",
  "amount": 10000,
  "userId": "customer_123",
  "accountNumber": "1234567890",
  "comment": "Not received"
}`} />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <h5 className="text-white font-medium mb-3">Dispute Types</h5>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center justify-between p-2 rounded bg-white/5">
                  <code className="text-gray-300">payment_not_received</code>
                  <span className="text-violet-400">Payin</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-white/5">
                  <code className="text-gray-300">wrong_amount</code>
                  <span className="text-violet-400">Payin</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-white/5">
                  <code className="text-gray-300">duplicate_payment</code>
                  <span className="text-violet-400">Payin</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-white/5">
                  <code className="text-gray-300">payout_not_received</code>
                  <span className="text-emerald-400">Payout</span>
                </div>
              </div>
            </div>
          </Section>
        </div>

        {/* Webhooks */}
        <div className="rounded-2xl overflow-hidden border border-white/10">
          <div className="p-5 bg-gradient-to-r from-yellow-600/20 to-amber-600/20 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/20">
                <Zap className="w-5 h-5 text-yellow-400" />
              </div>
              <h3 className="font-bold text-white text-lg">Webhook Signature Verification</h3>
            </div>
          </div>
          <div className="p-6 bg-[#0a0a0f]">
            <p className="text-gray-400 mb-4">Verify webhook authenticity using HMAC-SHA256</p>
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
        <div className="rounded-2xl overflow-hidden border border-white/10">
          <div className="p-5 bg-gradient-to-r from-gray-800 to-gray-900 border-b border-white/10">
            <h3 className="font-bold text-white text-lg">All Endpoints</h3>
          </div>
          <div className="divide-y divide-white/5 bg-[#0a0a0f]">
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
              <div key={i} className="flex items-center gap-4 p-4 hover:bg-white/5 transition-colors">
                <MethodBadge method={endpoint.method} />
                <code className="text-gray-300 font-mono flex-1">{endpoint.path}</code>
                <span className="text-gray-500 text-sm">{endpoint.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Limits & Errors */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Limits */}
          <div className="rounded-2xl overflow-hidden border border-white/10">
            <div className="p-4 bg-gradient-to-r from-blue-600/20 to-cyan-600/20 border-b border-white/10">
              <h3 className="font-bold text-white">Limits</h3>
            </div>
            <div className="p-4 bg-[#0a0a0f] space-y-3">
              <div className="flex justify-between items-center p-3 rounded-lg bg-white/5">
                <span className="text-gray-400">Minimum Amount</span>
                <span className="text-white font-semibold">₹100</span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-lg bg-white/5">
                <span className="text-gray-400">Max Payin</span>
                <span className="text-white font-semibold">₹1,00,000</span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-lg bg-white/5">
                <span className="text-gray-400">Max Payout</span>
                <span className="text-white font-semibold">₹2,00,000</span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-lg bg-white/5">
                <span className="text-gray-400">Rate Limit</span>
                <span className="text-white font-semibold">60 req/min</span>
              </div>
            </div>
          </div>

          {/* Error Codes */}
          <div className="rounded-2xl overflow-hidden border border-white/10">
            <div className="p-4 bg-gradient-to-r from-red-600/20 to-pink-600/20 border-b border-white/10">
              <h3 className="font-bold text-white">Error Codes</h3>
            </div>
            <div className="p-4 bg-[#0a0a0f] space-y-3">
              {[
                { code: '400', desc: 'Bad request' },
                { code: '401', desc: 'Invalid API key' },
                { code: '402', desc: 'No UPI available' },
                { code: '403', desc: 'Account inactive' },
                { code: '409', desc: 'Duplicate order' },
                { code: '429', desc: 'Rate limited' },
              ].map((err, i) => (
                <div key={i} className="flex justify-between items-center p-3 rounded-lg bg-white/5">
                  <span className="text-red-400 font-mono">{err.code}</span>
                  <span className="text-gray-400">{err.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center py-8 border-t border-white/10">
          <p className="text-gray-500">
            Need help? Contact{' '}
            <a href="mailto:support@pay2x.io" className="text-violet-400 hover:text-violet-300 transition-colors">
              support@pay2x.io
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ApiDocs;
