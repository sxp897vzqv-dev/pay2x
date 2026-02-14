/**
 * Update Payin - Submit UTR
 * 
 * PATCH /update-payin
 * Authorization: Bearer <live_api_key>
 * Body: { payinId, utrId }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface UpdatePayinRequest {
  payinId: string;
  utrId: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // Only allow PATCH
  if (req.method !== 'PATCH') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed. Use PATCH.' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // 1. Extract API key
    const authHeader = req.headers.get('Authorization');
    const apiKey = authHeader?.replace('Bearer ', '');

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Missing API key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Parse body
    const body: UpdatePayinRequest = await req.json();
    const { payinId, utrId } = body;

    // 3. Validate required fields
    if (!payinId || !utrId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: payinId and utrId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Validate UTR format (12-digit number typically)
    const utrTrimmed = utrId.toString().trim();
    if (utrTrimmed.length < 10 || utrTrimmed.length > 22) {
      return new Response(
        JSON.stringify({ error: 'Invalid UTR format. UTR should be 10-22 characters.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Create Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 6. Validate API key and get merchant
    const { data: merchant, error: merchantError } = await supabase
      .from('merchants')
      .select('id')
      .eq('live_api_key', apiKey)
      .single();

    if (merchantError || !merchant) {
      return new Response(
        JSON.stringify({ error: 'Invalid API key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 7. Get payin and verify ownership
    const { data: payin, error: payinError } = await supabase
      .from('payins')
      .select('id, merchant_id, status, expires_at')
      .eq('id', payinId)
      .single();

    if (payinError || !payin) {
      return new Response(
        JSON.stringify({ error: 'Payment not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 8. Verify merchant owns this payin
    if (payin.merchant_id !== merchant.id) {
      return new Response(
        JSON.stringify({ error: 'Not authorized to update this payment' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 9. Check if already completed
    if (payin.status === 'completed') {
      return new Response(
        JSON.stringify({ error: 'Payment already completed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 10. Check if expired
    if (payin.expires_at && new Date(payin.expires_at) < new Date()) {
      // Mark as expired
      await supabase
        .from('payins')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('id', payinId);

      return new Response(
        JSON.stringify({ error: 'Payment has expired' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 11. Check for duplicate UTR
    const { data: existingUtr } = await supabase
      .from('payins')
      .select('id')
      .eq('utr', utrTrimmed)
      .neq('id', payinId)
      .single();

    if (existingUtr) {
      return new Response(
        JSON.stringify({ error: 'This UTR has already been used for another payment' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 12. Update payin with UTR (keep status as pending for trader to verify)
    const { error: updateError } = await supabase
      .from('payins')
      .update({
        utr: utrTrimmed,
        utr_submitted_at: new Date().toISOString(),
        // Status stays 'pending' - trader will see UTR and can accept/reject
        updated_at: new Date().toISOString(),
      })
      .eq('id', payinId);

    if (updateError) {
      console.error('❌ Error updating payin:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update payment' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ UTR submitted: ${payinId} -> ${utrTrimmed}`);

    // 13. Return success
    return new Response(
      JSON.stringify({
        success: true,
        message: 'UTR submitted successfully. Payment is being verified.',
        payinId: payinId,
        status: 'pending',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in update-payin:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
