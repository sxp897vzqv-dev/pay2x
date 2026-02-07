/**
 * Pay2X API Gateway - Cloudflare Worker
 * 
 * Routes:
 *   POST /v1/payin/create    → create-payin
 *   PATCH /v1/payin/update   → update-payin
 *   GET  /v1/payin/status    → get-payin-status
 *   GET  /v1/health          → api-health
 * 
 * Deploy: wrangler deploy
 */

const SUPABASE_FUNCTIONS_URL = 'https://jrzyndtowwwcydgcagcr.supabase.co/functions/v1';

// Route mapping
const ROUTES = {
  'POST /v1/payin/create': 'create-payin',
  'PATCH /v1/payin/update': 'update-payin',
  'GET /v1/payin/status': 'get-payin-status',
  'GET /v1/health': 'api-health',
  'POST /v1/payout/create': 'create-payout',
  'GET /v1/payout/status': 'get-payout-status',
};

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Idempotency-Key',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const routeKey = `${method} ${path}`;

    // API docs redirect
    if (path === '/' || path === '/docs') {
      return Response.redirect('https://docs.pay2x.io', 302);
    }

    // Health check at root
    if (path === '/v1' || path === '/v1/') {
      return jsonResponse({
        name: 'Pay2X API',
        version: 'v1',
        status: 'operational',
        docs: 'https://docs.pay2x.io',
      });
    }

    // Find matching route
    let functionName = ROUTES[routeKey];
    
    // Handle status endpoint with query params
    if (!functionName && path === '/v1/payin/status' && method === 'GET') {
      functionName = 'get-payin-status';
    }

    if (!functionName) {
      return jsonResponse({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Route not found: ${method} ${path}`,
        },
      }, 404);
    }

    // Forward to Supabase Edge Function
    try {
      const supabaseUrl = `${SUPABASE_FUNCTIONS_URL}/${functionName}`;
      
      // Build headers
      const headers = new Headers();
      headers.set('Content-Type', 'application/json');
      
      // Forward auth header
      const authHeader = request.headers.get('Authorization');
      if (authHeader) {
        headers.set('Authorization', authHeader);
      }
      
      // Forward idempotency key
      const idempotencyKey = request.headers.get('X-Idempotency-Key');
      if (idempotencyKey) {
        headers.set('X-Idempotency-Key', idempotencyKey);
      }

      // Forward request
      const fetchOptions = {
        method: request.method,
        headers,
      };

      // Add body for POST/PATCH/PUT
      if (['POST', 'PATCH', 'PUT'].includes(method)) {
        const body = await request.text();
        if (body) {
          fetchOptions.body = body;
        }
      }

      // For GET with query params, forward them
      if (method === 'GET' && url.search) {
        const targetUrl = new URL(supabaseUrl);
        targetUrl.search = url.search;
        const response = await fetch(targetUrl.toString(), fetchOptions);
        return forwardResponse(response);
      }

      const response = await fetch(supabaseUrl, fetchOptions);
      return forwardResponse(response);

    } catch (error) {
      return jsonResponse({
        success: false,
        error: {
          code: 'GATEWAY_ERROR',
          message: error.message || 'Failed to connect to backend',
        },
      }, 502);
    }
  },
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

async function forwardResponse(response) {
  const body = await response.text();
  
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  
  // Copy relevant headers from Supabase
  const copyHeaders = [
    'X-Trace-Id',
    'X-Span-Id',
    'X-Response-Time',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'Retry-After',
  ];
  
  for (const header of copyHeaders) {
    const value = response.headers.get(header);
    if (value) headers.set(header, value);
  }
  
  // Add CORS headers
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  
  // Add custom header
  headers.set('X-Powered-By', 'Pay2X');

  return new Response(body, {
    status: response.status,
    headers,
  });
}
