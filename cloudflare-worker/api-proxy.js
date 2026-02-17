/**
 * Pay2X API Proxy - Cloudflare Worker
 * 
 * Routes api.pay2x.io/* to Supabase Edge Functions
 * 
 * Deploy: npx wrangler deploy
 */

const SUPABASE_URL = 'https://jrzyndtowwwcydgcagcr.supabase.co/functions/v1';

// Route mapping: clean URLs -> Supabase function names
const ROUTES = {
  // Payin
  'POST /v1/payin/create': 'create-payin',
  'POST /v1/payin/switch': 'switch-upi',
  'GET /v1/payin/status': 'get-payin-status',
  
  // Payout
  'POST /v1/payout/create': 'create-payout',
  
  // Dispute
  'POST /v1/dispute/create': 'create-dispute',
  
  // Health
  'GET /v1/health': 'api-health',
  
  // Legacy routes (for backward compatibility)
  'POST /createPayin': 'create-payin',
  'POST /createpayin': 'create-payin',
  'POST /create-payin': 'create-payin',
  'GET /getPayinStatus': 'get-payin-status',
  'POST /switchUpi': 'switch-upi',
  'POST /createPayout': 'create-payout',
  'POST /createDispute': 'create-dispute',
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Idempotency-Key, X-Request-Id',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Find matching route
    const routeKey = `${method} ${path}`;
    let functionName = ROUTES[routeKey];

    // Try without method for GET routes with query params
    if (!functionName && method === 'GET') {
      const basePath = path.split('?')[0];
      functionName = ROUTES[`GET ${basePath}`];
    }

    // Try case-insensitive match
    if (!functionName) {
      const lowerPath = path.toLowerCase();
      for (const [key, value] of Object.entries(ROUTES)) {
        const [routeMethod, routePath] = key.split(' ');
        if (routeMethod === method && routePath.toLowerCase() === lowerPath) {
          functionName = value;
          break;
        }
      }
    }

    if (!functionName) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'ROUTE_NOT_FOUND',
            message: `No route found for ${method} ${path}`,
            available_routes: Object.keys(ROUTES),
          },
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // Build Supabase URL
    const supabaseUrl = new URL(`${SUPABASE_URL}/${functionName}`);
    
    // Forward query params
    url.searchParams.forEach((value, key) => {
      supabaseUrl.searchParams.set(key, value);
    });

    // Forward request to Supabase
    const headers = new Headers(request.headers);
    headers.set('X-Forwarded-Host', url.hostname);
    headers.set('X-Original-Path', path);

    try {
      const response = await fetch(supabaseUrl.toString(), {
        method: request.method,
        headers: headers,
        body: request.method !== 'GET' && request.method !== 'HEAD' 
          ? await request.text() 
          : undefined,
      });

      // Clone response and add CORS headers
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.set('X-Powered-By', 'Pay2X');

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });

    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'PROXY_ERROR',
            message: 'Failed to reach API server',
          },
        }),
        {
          status: 502,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }
  },
};
