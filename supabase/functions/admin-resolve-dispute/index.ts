/**
 * Admin Resolve Dispute - Supabase Edge Function
 * Admin final decision on a dispute with balance adjustments
 * 
 * POST /admin-resolve-dispute
 * Body: { disputeId, decision: 'approved' | 'rejected', note? }
 * 
 * Balance Logic:
 * - Payin dispute approved (trader accepted) → Credit trader balance
 * - Payout dispute approved (not sent) → Deduct (amount + commission) from trader
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
    const { disputeId, decision, note } = await req.json();

    if (!disputeId || !decision) {
      return new Response(JSON.stringify({ error: 'Missing disputeId or decision' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!['approved', 'rejected'].includes(decision)) {
      return new Response(JSON.stringify({ error: 'Decision must be approved or rejected' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Get dispute with trader info
    const { data: dispute, error: disputeError } = await supabase
      .from('disputes')
      .select('*, traders(id, name, balance, payout_rate)')
      .eq('id', disputeId)
      .single();

    if (disputeError || !dispute) {
      return new Response(JSON.stringify({ error: 'Dispute not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Allow resolving disputes in any pending state (admin can override)
    const allowedStatuses = ['pending', 'routed_to_trader', 'trader_accepted', 'trader_rejected'];
    if (!allowedStatuses.includes(dispute.status)) {
      return new Response(JSON.stringify({ 
        error: `Cannot resolve dispute in status: ${dispute.status}. Already resolved.` 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Track if trader has responded for balance logic
    const traderResponded = ['trader_accepted', 'trader_rejected'].includes(dispute.status);

    const ts = new Date().toISOString();
    const amount = Number(dispute.amount) || 0;
    let balanceAdjusted = false;
    let adjustmentAmount = 0;
    let adjustmentType = '';

    // Balance adjustments only happen when admin approves AND trader has responded
    if (decision === 'approved' && traderResponded) {
      if (dispute.type === 'payin') {
        // Payin dispute approved = payment was actually made
        // If trader_accepted (status): they confirm receipt → credit their balance
        if (dispute.status === 'trader_accepted') {
          const traderRate = dispute.traders?.payout_rate || 4;
          const commission = Math.round((amount * traderRate) / 100);
          adjustmentAmount = amount - commission;
          
          await supabase.from('traders').update({
            balance: (Number(dispute.traders?.balance) || 0) + adjustmentAmount,
          }).eq('id', dispute.trader_id);
          
          balanceAdjusted = true;
          adjustmentType = 'credit_trader';
          console.log(`💰 Credited trader ₹${adjustmentAmount} for approved payin dispute`);
        }
      } else if (dispute.type === 'payout') {
        // Payout dispute approved = payout was NOT received by customer
        // If trader_rejected (claimed they sent but actually didn't): deduct from trader
        if (dispute.status === 'trader_rejected') {
          const traderRate = dispute.traders?.payout_rate || 1;
          const commission = Math.round((amount * traderRate) / 100);
          adjustmentAmount = amount + commission;
          
          await supabase.from('traders').update({
            balance: (Number(dispute.traders?.balance) || 0) - adjustmentAmount,
          }).eq('id', dispute.trader_id);
          
          balanceAdjusted = true;
          adjustmentType = 'debit_trader';
          console.log(`💸 Debited trader ₹${adjustmentAmount} for approved payout dispute`);

          // Credit merchant back (they paid but client didn't receive)
          if (dispute.merchant_id) {
            const { data: merchantData } = await supabase
              .from('merchants')
              .select('available_balance')
              .eq('id', dispute.merchant_id)
              .single();
            
            await supabase.from('merchants').update({
              available_balance: (merchantData?.available_balance || 0) + amount,
            }).eq('id', dispute.merchant_id);
            console.log(`💰 Credited merchant ₹${amount} for payout refund`);
          }
        }
      }
    }

    const newStatus = decision === 'approved' ? 'admin_approved' : 'admin_rejected';

    // Update dispute
    await supabase.from('disputes').update({
      status: newStatus,
      admin_decision: decision,
      admin_note: note || null,
      admin_resolved_at: ts,
      balance_adjusted: balanceAdjusted,
      adjustment_amount: adjustmentAmount,
      updated_at: ts,
    }).eq('id', disputeId);

    // Add to dispute messages
    await supabase.from('dispute_messages').insert({
      dispute_id: disputeId,
      sender: 'admin',
      message: `Admin ${decision} the dispute. ${note || ''} ${balanceAdjusted ? `Balance adjustment: ₹${adjustmentAmount}` : ''}`,
    });

    console.log(`✅ Admin resolved dispute ${disputeId}: ${decision}`);

    return new Response(JSON.stringify({
      success: true,
      status: newStatus,
      balanceAdjusted,
      adjustmentAmount,
      adjustmentType,
      message: `Dispute ${decision}.${balanceAdjusted ? ` Balance adjusted by ₹${adjustmentAmount}.` : ''}`,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('❌ Admin resolve error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
