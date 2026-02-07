/**
 * Route Dispute - Supabase Edge Function
 * Routes new disputes to the appropriate trader
 * 
 * POST /route-dispute
 * Body: { disputeId }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface RouteResult {
  success: boolean;
  traderId?: string;
  traderName?: string;
  routeReason?: string;
  routeSource?: string;
  error?: string;
}

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
    const { disputeId } = await req.json();
    
    if (!disputeId) {
      return new Response(JSON.stringify({ error: 'Missing disputeId' }), {
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

    console.log(`🚀 Routing dispute: ${disputeId}, type: ${dispute.type}`);

    let result: RouteResult;

    if (dispute.type === 'payin') {
      result = await routePayinDispute(supabase, dispute);
    } else {
      result = await routePayoutDispute(supabase, dispute);
    }

    if (!result.success) {
      // Mark as unroutable
      await supabase.from('disputes').update({
        status: 'unroutable',
        route_reason: result.error,
        updated_at: new Date().toISOString(),
      }).eq('id', disputeId);

      await logRouting(supabase, disputeId, null, null, false, result.error || 'Unknown error');

      return new Response(JSON.stringify({ success: false, error: result.error }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update dispute with routing info
    await supabase.from('disputes').update({
      trader_id: result.traderId,
      status: 'routed_to_trader',
      routed_at: new Date().toISOString(),
      route_reason: result.routeReason,
      updated_at: new Date().toISOString(),
    }).eq('id', disputeId);

    await logRouting(supabase, disputeId, result.traderId!, result.traderName!, true, result.routeReason!);

    console.log(`✅ Routed to trader: ${result.traderName} (${result.traderId})`);

    return new Response(JSON.stringify({
      success: true,
      traderId: result.traderId,
      traderName: result.traderName,
      routeReason: result.routeReason,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('❌ Route dispute error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function routePayinDispute(supabase: any, dispute: any): Promise<RouteResult> {
  // Priority 1: Check if payin_id is provided
  if (dispute.payin_id) {
    const { data: payin } = await supabase
      .from('payins')
      .select('trader_id, traders(name)')
      .eq('id', dispute.payin_id)
      .single();

    if (payin?.trader_id) {
      return {
        success: true,
        traderId: payin.trader_id,
        traderName: payin.traders?.name || 'Unknown',
        routeReason: 'Matched via payin record',
        routeSource: 'payin',
      };
    }
  }

  // Priority 2: Check transaction_id in payins
  if (dispute.transaction_id) {
    const { data: payin } = await supabase
      .from('payins')
      .select('trader_id, traders(name)')
      .eq('txn_id', dispute.transaction_id)
      .single();

    if (payin?.trader_id) {
      return {
        success: true,
        traderId: payin.trader_id,
        traderName: payin.traders?.name || 'Unknown',
        routeReason: 'Matched via transaction ID',
        routeSource: 'payin',
      };
    }
  }

  // Priority 3: Check saved_banks by UPI ID
  if (dispute.upi_id) {
    const { data: savedBank } = await supabase
      .from('saved_banks')
      .select('trader_id, traders(name)')
      .eq('upi_id', dispute.upi_id)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (savedBank?.trader_id) {
      return {
        success: true,
        traderId: savedBank.trader_id,
        traderName: savedBank.traders?.name || 'Unknown',
        routeReason: 'Matched via saved bank UPI',
        routeSource: 'saved_banks',
      };
    }
  }

  // Priority 4: Check upi_pool
  if (dispute.upi_id) {
    const { data: upi } = await supabase
      .from('upi_pool')
      .select('trader_id, traders(name)')
      .eq('upi_id', dispute.upi_id)
      .limit(1)
      .single();

    if (upi?.trader_id) {
      return {
        success: true,
        traderId: upi.trader_id,
        traderName: upi.traders?.name || 'Unknown',
        routeReason: 'Matched via UPI pool',
        routeSource: 'upi_pool',
      };
    }
  }

  // Priority 5: UTR search across payins
  if (dispute.utr) {
    const { data: payin } = await supabase
      .from('payins')
      .select('trader_id, traders(name)')
      .eq('utr', dispute.utr)
      .limit(1)
      .single();

    if (payin?.trader_id) {
      return {
        success: true,
        traderId: payin.trader_id,
        traderName: payin.traders?.name || 'Unknown',
        routeReason: 'Matched via UTR in payins',
        routeSource: 'payin',
      };
    }
  }

  return { success: false, error: 'Could not identify trader for payin dispute' };
}

async function routePayoutDispute(supabase: any, dispute: any): Promise<RouteResult> {
  // Priority 1: Check if payout_id is provided
  if (dispute.payout_id) {
    const { data: payout } = await supabase
      .from('payouts')
      .select('trader_id, traders(name)')
      .eq('id', dispute.payout_id)
      .single();

    if (payout?.trader_id) {
      return {
        success: true,
        traderId: payout.trader_id,
        traderName: payout.traders?.name || 'Unknown',
        routeReason: 'Matched via payout record',
        routeSource: 'payout',
      };
    }
  }

  // Priority 2: Check transaction_id in payouts
  if (dispute.transaction_id) {
    const { data: payout } = await supabase
      .from('payouts')
      .select('trader_id, traders(name)')
      .eq('payout_id', dispute.transaction_id)
      .single();

    if (payout?.trader_id) {
      return {
        success: true,
        traderId: payout.trader_id,
        traderName: payout.traders?.name || 'Unknown',
        routeReason: 'Matched via payout ID',
        routeSource: 'payout',
      };
    }
  }

  return { success: false, error: 'Could not identify trader for payout dispute' };
}

async function logRouting(
  supabase: any,
  disputeId: string,
  traderId: string | null,
  traderName: string | null,
  success: boolean,
  reason: string
) {
  await supabase.from('dispute_routing_logs').insert({
    dispute_id: disputeId,
    trader_id: traderId,
    trader_name: traderName,
    route_source: success ? 'auto' : null,
    route_reason: reason,
    success,
    error: success ? null : reason,
  });
}
