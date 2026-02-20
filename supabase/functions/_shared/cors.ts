// Shared CORS headers for Edge Functions

// Allowed origins (add your domains here)
const ALLOWED_ORIGINS = [
  'https://pay2x.io',
  'https://www.pay2x.io',
  'https://admin.pay2x.io',
  'https://api.pay2x.io',
  'http://localhost:5173',  // Vite dev
  'http://localhost:3000',  // Alt dev
  'http://127.0.0.1:5173',
];

// Get CORS headers based on request origin
export function getCorsHeaders(origin: string | null): Record<string, string> {
  // Check if origin is in allowed list
  const isAllowed = origin && ALLOWED_ORIGINS.includes(origin);
  
  // For API calls from merchants (no origin), allow through
  // For browser calls, check origin
  const allowedOrigin = isAllowed ? origin : (origin ? '' : '*');
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-request-id, x-idempotency-key, x-real-ip, x-client-ip',
    'Access-Control-Allow-Credentials': 'true',
  };
}

// Legacy export for backwards compatibility
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-request-id, x-idempotency-key',
};

export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    const origin = req.headers.get('origin');
    return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
  }
  return null;
}
