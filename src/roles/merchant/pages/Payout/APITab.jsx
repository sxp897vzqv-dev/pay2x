import React, { useState, useEffect } from 'react';
import {
  Key,
  Book,
  Eye,
  Copy,
  Check,
  AlertCircle,
  Zap
} from 'lucide-react';

const APITab = ({ merchantId }) => {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Generate or fetch API key
    const key = `mk_${merchantId}_${Math.random().toString(36).substr(2, 32)}`;
    setApiKey(key);
  }, [merchantId]);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const curlExample = `curl -X POST https://api.yourplatform.com/v1/payouts \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "userId": "user123",
    "merchantId": "${merchantId}",
    "upiId": "user@paytm",
    "accountHolderName": "John Doe",
    "amount": 5000
  }'`;

  const jsExample = `const response = await fetch('https://api.yourplatform.com/v1/payouts', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ${apiKey}',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    userId: 'user123',
    merchantId: '${merchantId}',
    upiId: 'user@paytm',
    accountHolderName: 'John Doe',
    amount: 5000
  })
});

const data = await response.json();
console.log(data);`;

  return (
    <div className="space-y-6">
      {/* API Key Section */}
      <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-2xl p-6 border-2 border-purple-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-purple-600 rounded-xl">
            <Key className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Your API Key</h3>
            <p className="text-sm text-slate-600">Use this key to authenticate your requests</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-white rounded-xl px-4 py-3 border-2 border-slate-200 font-mono text-sm">
            {showKey ? apiKey : '********************************'}
          </div>
          <button
            onClick={() => setShowKey(!showKey)}
            className="p-3 bg-white rounded-xl border-2 border-slate-200 hover:bg-slate-50 transition-colors"
          >
            <Eye className="w-5 h-5" />
          </button>
          <button
            onClick={() => copyToClipboard(apiKey)}
            className="p-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors"
          >
            {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
          </button>
        </div>
        
        <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-900">
            Keep your API key secure. Never share it publicly or commit it to version control.
          </p>
        </div>
      </div>

      {/* Endpoint Documentation */}
      <div className="bg-white rounded-2xl p-6 border-2 border-slate-200">
        <div className="flex items-center gap-3 mb-6">
          <Book className="w-6 h-6 text-blue-600" />
          <h3 className="text-lg font-bold text-slate-900">API Documentation</h3>
        </div>

        <div className="space-y-6">
          {/* Endpoint */}
          <div>
            <h4 className="text-sm font-bold text-slate-700 mb-2">Endpoint</h4>
            <div className="bg-slate-900 text-green-400 rounded-xl p-4 font-mono text-sm">
              POST https://api.yourplatform.com/v1/payouts
            </div>
          </div>

          {/* Request Body */}
          <div>
            <h4 className="text-sm font-bold text-slate-700 mb-2">Request Body</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-200">
                    <th className="text-left py-2 px-3 font-bold text-slate-700">Field</th>
                    <th className="text-left py-2 px-3 font-bold text-slate-700">Type</th>
                    <th className="text-left py-2 px-3 font-bold text-slate-700">Required</th>
                    <th className="text-left py-2 px-3 font-bold text-slate-700">Description</th>
                  </tr>
                </thead>
                <tbody className="text-slate-600">
                  <tr className="border-b border-slate-100">
                    <td className="py-2 px-3 font-mono">userId</td>
                    <td className="py-2 px-3">string</td>
                    <td className="py-2 px-3 text-green-600 font-semibold">Yes</td>
                    <td className="py-2 px-3">Unique user identifier</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 px-3 font-mono">merchantId</td>
                    <td className="py-2 px-3">string</td>
                    <td className="py-2 px-3 text-green-600 font-semibold">Yes</td>
                    <td className="py-2 px-3">Your merchant ID</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 px-3 font-mono">upiId</td>
                    <td className="py-2 px-3">string</td>
                    <td className="py-2 px-3 text-amber-600 font-semibold">Optional</td>
                    <td className="py-2 px-3">UPI ID (if using UPI)</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 px-3 font-mono">accountNumber</td>
                    <td className="py-2 px-3">string</td>
                    <td className="py-2 px-3 text-amber-600 font-semibold">Optional</td>
                    <td className="py-2 px-3">Bank account number</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 px-3 font-mono">ifscCode</td>
                    <td className="py-2 px-3">string</td>
                    <td className="py-2 px-3 text-amber-600 font-semibold">Optional</td>
                    <td className="py-2 px-3">Bank IFSC code</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 px-3 font-mono">bankName</td>
                    <td className="py-2 px-3">string</td>
                    <td className="py-2 px-3 text-amber-600 font-semibold">Optional</td>
                    <td className="py-2 px-3">Bank name</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 px-3 font-mono">accountHolderName</td>
                    <td className="py-2 px-3">string</td>
                    <td className="py-2 px-3 text-green-600 font-semibold">Yes</td>
                    <td className="py-2 px-3">Account holder name</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-mono">amount</td>
                    <td className="py-2 px-3">number</td>
                    <td className="py-2 px-3 text-green-600 font-semibold">Yes</td>
                    <td className="py-2 px-3">Amount (Rs.100-Rs.50,000)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Code Examples */}
          <div>
            <h4 className="text-sm font-bold text-slate-700 mb-3">cURL Example</h4>
            <div className="relative">
              <pre className="bg-slate-900 text-green-400 rounded-xl p-4 overflow-x-auto text-xs font-mono">
                {curlExample}
              </pre>
              <button
                onClick={() => copyToClipboard(curlExample)}
                className="absolute top-3 right-3 p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              >
                <Copy className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-bold text-slate-700 mb-3">JavaScript Example</h4>
            <div className="relative">
              <pre className="bg-slate-900 text-green-400 rounded-xl p-4 overflow-x-auto text-xs font-mono">
                {jsExample}
              </pre>
              <button
                onClick={() => copyToClipboard(jsExample)}
                className="absolute top-3 right-3 p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              >
                <Copy className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>

          {/* Response */}
          <div>
            <h4 className="text-sm font-bold text-slate-700 mb-2">Success Response (200)</h4>
            <pre className="bg-slate-900 text-green-400 rounded-xl p-4 overflow-x-auto text-xs font-mono">
{`{
  "success": true,
  "data": {
    "payoutId": "payout_abc123xyz",
    "status": "pending",
    "amount": 5000,
    "createdAt": "2024-01-27T10:30:00Z"
  }
}`}
            </pre>
          </div>

          <div>
            <h4 className="text-sm font-bold text-slate-700 mb-2">Error Response (400)</h4>
            <pre className="bg-slate-900 text-red-400 rounded-xl p-4 overflow-x-auto text-xs font-mono">
{`{
  "success": false,
  "error": {
    "code": "INVALID_AMOUNT",
    "message": "Amount must be between Rs.100 and Rs.50,000"
  }
}`}
            </pre>
          </div>
        </div>
      </div>

      {/* Rate Limits */}
      <div className="bg-white rounded-2xl p-6 border-2 border-slate-200">
        <div className="flex items-center gap-3 mb-4">
          <Zap className="w-6 h-6 text-yellow-600" />
          <h3 className="text-lg font-bold text-slate-900">Rate Limits</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
            <p className="text-sm text-blue-600 font-semibold mb-1">Per Minute</p>
            <p className="text-2xl font-bold text-blue-700">60 requests</p>
          </div>
          <div className="p-4 bg-purple-50 rounded-xl border border-purple-200">
            <p className="text-sm text-purple-600 font-semibold mb-1">Per Hour</p>
            <p className="text-2xl font-bold text-purple-700">1,000 requests</p>
          </div>
          <div className="p-4 bg-green-50 rounded-xl border border-green-200">
            <p className="text-sm text-green-600 font-semibold mb-1">Per Day</p>
            <p className="text-2xl font-bold text-green-700">10,000 requests</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default APITab;