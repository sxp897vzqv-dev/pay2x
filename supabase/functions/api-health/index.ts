/**
 * API Health Check
 * 
 * GET /api-health
 * Returns API status and available endpoints
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

serve(async (req: Request) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  return new Response(
    JSON.stringify({
      status: 'healthy',
      version: '2.0.0',
      platform: 'supabase',
      timestamp: new Date().toISOString(),
      endpoints: {
        payin: {
          create: {
            method: 'POST',
            path: '/create-payin',
            description: 'Create a new payin request',
            auth: 'Bearer <api_key>',
            body: {
              amount: 'number (required, 100-100000)',
              userId: 'string (required)',
              orderId: 'string (optional)',
              metadata: 'object (optional)',
            },
          },
          update: {
            method: 'PATCH',
            path: '/update-payin',
            description: 'Submit UTR for a payin',
            auth: 'Bearer <api_key>',
            body: {
              payinId: 'string (required)',
              utrId: 'string (required)',
            },
          },
          status: {
            method: 'GET',
            path: '/get-payin-status?payinId=xxx',
            description: 'Get payin status',
            auth: 'Bearer <api_key>',
          },
        },
        utility: {
          health: {
            method: 'GET',
            path: '/api-health',
            description: 'Health check',
          },
        },
      },
      webhookEvents: [
        'payment.completed',
        'payment.failed',
        'payment.expired',
      ],
      limits: {
        minAmount: 100,
        maxAmount: 100000,
        timerSeconds: 600,
      },
    }),
    { 
      status: 200, 
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      } 
    }
  );
});
