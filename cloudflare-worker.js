// Cloudflare Worker for api.pay2x.io
// Proxies requests to Supabase Edge Functions

export default {
  async fetch(request) {
    const url = new URL(request.url);
    
    // Proxy to Supabase Edge Functions
    const target = `https://jrzyndtowwwcydgcagcr.supabase.co/functions/v1${url.pathname}${url.search}`;
    
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Idempotency-Key',
        }
      });
    }
    
    // Forward request to Supabase
    const response = await fetch(target, {
      method: request.method,
      headers: request.headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    });

    // Clone response and add CORS
    const newResponse = new Response(response.body, response);
    newResponse.headers.set('Access-Control-Allow-Origin', '*');
    return newResponse;
  }
}
