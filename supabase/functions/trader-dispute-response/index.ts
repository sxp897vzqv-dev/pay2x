/**
 * Trader Dispute Response - Supabase Edge Function
 * Processes trader's response to a dispute
 * 
 * POST /trader-dispute-response
 * Body: { disputeId, response: 'accepted' | 'rejected', statement?, proofUrl? }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { disputeId, response, statement, proofUrl } = await req.json();

    if (!disputeId || !response) {
      return new Response(JSON.stringify({ error: 'Missing disputeId or response' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!['accepted', 'rejected'].includes(response)) {
      return new Response(JSON.stringify({ error: 'Response must be accepted or rejected' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Get dispute
    const { data: dispute, error: disputeError } = await supabase
      .from('disputes')
      .select('*')
      .eq('id', disputeId)
      .single();

    if (disputeError || !dispute) {
      return new Response(JSON.stringify({ error: 'Dispute not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Allow response if pending or routed_to_trader
    const allowedStatuses = ['pending', 'routed_to_trader'];
    if (!allowedStatuses.includes(dispute.status)) {
      return new Response(JSON.stringify({ 
        error: `Cannot respond to dispute in status: ${dispute.status}` 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ts = new Date().toISOString();
    const newStatus = response === 'accepted' ? 'trader_accepted' : 'trader_rejected';

    // Update dispute
    await supabase.from('disputes').update({
      status: newStatus,
      trader_response: response,
      trader_statement: statement || null,
      trader_proof_url: proofUrl || null,
      trader_responded_at: ts,
      updated_at: ts,
    }).eq('id', disputeId);

    // Add to dispute messages
    const { error: msgError } = await supabase.from('dispute_messages').insert({
      dispute_id: disputeId,
      sender_role: 'trader',
      sender: 'trader',
      message: response === 'accepted' 
        ? `Trader accepted the dispute. ${statement || ''}` 
        : `Trader rejected the dispute. ${statement || ''}`,
      proof_url: proofUrl,
    });
    if (msgError) {
      console.error('Failed to insert dispute message:', msgError);
    }

    console.log(`✅ Trader responded to dispute ${disputeId}: ${response}`);

    return new Response(JSON.stringify({
      success: true,
      status: newStatus,
      message: `Dispute ${response}. Awaiting admin review.`,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('❌ Trader response error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
