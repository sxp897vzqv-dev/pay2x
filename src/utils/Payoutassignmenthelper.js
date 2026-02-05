// payoutAssignmentHelper.js — Supabase version
import { supabase } from '../supabase';

/**
 * Immediate auto-assign payouts to trader
 */
export async function immediateAutoAssignPayouts(traderId, requestedAmount) {
  try {
    console.log(`🚀 Starting auto-assignment for trader ${traderId}, amount: ₹${requestedAmount}`);

    // Fetch unassigned pending payouts
    const { data: pendingPayouts } = await supabase
      .from('payouts')
      .select('*')
      .eq('status', 'pending')
      .is('trader_id', null);

    const unassignedPayouts = (pendingPayouts || [])
      .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));

    console.log(`✅ Found ${unassignedPayouts.length} unassigned payouts`);

    // Select payouts to assign
    const payoutsToAssign = [];
    let totalAmount = 0;

    for (const payout of unassignedPayouts) {
      if (totalAmount >= requestedAmount) break;
      const payoutAmount = Number(payout.amount || 0);
      payoutsToAssign.push(payout);
      totalAmount += payoutAmount;
      console.log(`  ➕ Selected: ₹${payoutAmount} (${payout.id.substring(0, 8)}...)`);
    }

    const assignedAmount = totalAmount;
    const remainingAmount = requestedAmount - totalAmount;
    const fullyAssigned = remainingAmount <= 0;

    // Create request document
    const { data: requestDoc, error: reqErr } = await supabase
      .from('payout_requests')
      .insert({
        trader_id: traderId,
        requested_amount: requestedAmount,
        assigned_amount: assignedAmount,
        remaining_amount: remainingAmount > 0 ? remainingAmount : 0,
        status: fullyAssigned ? 'fully_assigned' : (payoutsToAssign.length > 0 ? 'partially_assigned' : 'waiting'),
        assigned_payouts: payoutsToAssign.map(p => p.id),
        fully_assigned: fullyAssigned,
        in_waiting_list: !fullyAssigned,
      })
      .select()
      .single();

    if (reqErr) throw reqErr;
    const requestId = requestDoc.id;
    console.log(`✅ Created request: ${requestId}`);

    // Assign payouts
    if (payoutsToAssign.length > 0) {
      const ts = new Date().toISOString();
      await Promise.all(payoutsToAssign.map(p =>
        supabase.from('payouts').update({
          trader_id: traderId,
          payout_request_id: requestId,
          assigned_at: ts,
          status: 'assigned',
        }).eq('id', p.id)
      ));
      console.log(`✅ Assigned ${payoutsToAssign.length} payouts`);
    }

    const message = fullyAssigned
      ? `✅ Fully assigned! ${payoutsToAssign.length} payouts ready to process.`
      : payoutsToAssign.length > 0
        ? `⚠️ Partially assigned! ${payoutsToAssign.length} payouts ready. ₹${remainingAmount.toLocaleString()} in waiting list.`
        : `⏳ No payouts available right now. Request added to waiting list for ₹${requestedAmount.toLocaleString()}.`;

    return {
      success: true, requestId, status: requestDoc.status,
      assignedCount: payoutsToAssign.length, assignedAmount,
      remainingAmount: remainingAmount > 0 ? remainingAmount : 0,
      fullyAssigned, inWaitingList: !fullyAssigned, message,
    };
  } catch (error) {
    console.error('❌ ERROR in auto-assignment:', error);
    throw error;
  }
}

/**
 * Process waiting list
 */
export async function processWaitingList() {
  try {
    console.log('🔄 Processing waiting list...');

    const { data: waitingRequests } = await supabase
      .from('payout_requests')
      .select('*')
      .eq('in_waiting_list', true)
      .order('created_at', { ascending: true });

    if (!waitingRequests?.length) {
      console.log('No requests in waiting list');
      return { processed: 0 };
    }

    let processedCount = 0;

    for (const request of waitingRequests) {
      const remainingAmount = request.remaining_amount || 0;
      if (remainingAmount <= 0) continue;

      const { data: unassigned } = await supabase
        .from('payouts')
        .select('*')
        .eq('status', 'pending')
        .is('trader_id', null)
        .order('created_at', { ascending: true });

      if (!unassigned?.length) break;

      const payoutsToAssign = [];
      let additionalAmount = 0;

      for (const payout of unassigned) {
        if (additionalAmount >= remainingAmount) break;
        payoutsToAssign.push(payout);
        additionalAmount += Number(payout.amount || 0);
      }

      if (payoutsToAssign.length === 0) break;

      const ts = new Date().toISOString();
      await Promise.all(payoutsToAssign.map(p =>
        supabase.from('payouts').update({
          trader_id: request.trader_id,
          payout_request_id: request.id,
          assigned_at: ts,
          status: 'assigned',
        }).eq('id', p.id)
      ));

      const newAssignedAmount = (request.assigned_amount || 0) + additionalAmount;
      const newRemainingAmount = request.requested_amount - newAssignedAmount;
      const nowFullyAssigned = newRemainingAmount <= 0;

      await supabase.from('payout_requests').update({
        assigned_amount: newAssignedAmount,
        remaining_amount: newRemainingAmount > 0 ? newRemainingAmount : 0,
        assigned_payouts: [...(request.assigned_payouts || []), ...payoutsToAssign.map(p => p.id)],
        fully_assigned: nowFullyAssigned,
        in_waiting_list: !nowFullyAssigned,
        status: nowFullyAssigned ? 'fully_assigned' : 'partially_assigned',
        last_assigned_at: ts,
      }).eq('id', request.id);

      processedCount++;
      if (nowFullyAssigned) console.log(`✅ Request ${request.id} now fully assigned!`);
    }

    console.log(`🎉 Processed ${processedCount} waiting requests`);
    return { processed: processedCount };
  } catch (error) {
    console.error('❌ Error processing waiting list:', error);
    throw error;
  }
}

/**
 * Cancel payout by trader
 */
export async function cancelPayoutByTrader(payoutId, reason) {
  try {
    const { data: payout } = await supabase.from('payouts').select('*').eq('id', payoutId).single();
    if (!payout) throw new Error('Payout not found');

    const payoutAmount = Number(payout.amount || 0);
    const requestId = payout.payout_request_id;
    const ts = new Date().toISOString();

    await supabase.from('payouts').update({
      status: 'cancelled_by_trader',
      cancelled_at: ts,
      cancel_reason: reason,
      cancelled_by: 'trader',
      trader_id: null,
      payout_request_id: null,
      assigned_at: null,
    }).eq('id', payoutId);

    if (requestId) {
      const { data: req } = await supabase.from('payout_requests').select('*').eq('id', requestId).single();
      if (req) {
        const assignedPayouts = (req.assigned_payouts || []).filter(id => id !== payoutId);
        const newAssignedAmount = (req.assigned_amount || 0) - payoutAmount;
        const newRemainingAmount = req.requested_amount - newAssignedAmount;

        if (assignedPayouts.length === 0) {
          await supabase.from('payout_requests').update({
            assigned_payouts: [], assigned_amount: 0,
            remaining_amount: req.requested_amount,
            fully_assigned: false, in_waiting_list: true, status: 'waiting',
          }).eq('id', requestId);
        } else {
          await supabase.from('payout_requests').update({
            assigned_payouts, assigned_amount: newAssignedAmount,
            remaining_amount: newRemainingAmount > 0 ? newRemainingAmount : 0,
            fully_assigned: newRemainingAmount <= 0,
            status: newRemainingAmount <= 0 ? 'fully_assigned' : 'partially_assigned',
          }).eq('id', requestId);
        }
      }
    }

    processWaitingList().catch(err => console.error('Error processing waiting list:', err));
    return { success: true };
  } catch (error) {
    console.error('❌ Error cancelling payout:', error);
    throw error;
  }
}

/**
 * Cancel request by trader
 */
export async function cancelPayoutRequestByTrader(requestId) {
  try {
    const { data: req } = await supabase.from('payout_requests').select('*').eq('id', requestId).single();
    if (!req) throw new Error('Request not found');

    // Check for assigned payouts
    const { count } = await supabase
      .from('payouts')
      .select('*', { count: 'exact', head: true })
      .eq('payout_request_id', requestId)
      .eq('status', 'assigned');

    if (count > 0) {
      throw new Error(`Cannot cancel: ${count} payout(s) still assigned. Cancel them first.`);
    }

    await supabase.from('payout_requests').update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: 'trader',
    }).eq('id', requestId);

    console.log(`✅ Request ${requestId} cancelled successfully`);
    return { success: true };
  } catch (error) {
    console.error('Error cancelling request:', error);
    throw error;
  }
}

/**
 * Get overdue payouts (assigned > 1 hour ago)
 */
export async function getPayoutsPendingOverOneHour() {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data } = await supabase
      .from('payouts')
      .select('*')
      .eq('status', 'assigned')
      .lt('assigned_at', oneHourAgo)
      .order('assigned_at', { ascending: true });

    return (data || []).map(p => ({
      ...p,
      pendingDuration: Math.floor((Date.now() - new Date(p.assigned_at).getTime()) / (1000 * 60)),
    }));
  } catch (error) {
    console.error('Error fetching overdue:', error);
    throw error;
  }
}

/**
 * Get cancelled payouts
 */
export async function getCancelledPayouts() {
  try {
    const { data } = await supabase
      .from('payouts')
      .select('*')
      .eq('status', 'cancelled_by_trader')
      .order('cancelled_at', { ascending: false });

    return data || [];
  } catch (error) {
    console.error('Error fetching cancelled:', error);
    throw error;
  }
}

/**
 * Admin remove payout
 */
export async function removePayoutByAdmin(payoutId, adminId) {
  try {
    await supabase.from('payouts').update({
      status: 'removed_by_admin',
      removed_at: new Date().toISOString(),
      removed_by: adminId,
    }).eq('id', payoutId);
    return { success: true };
  } catch (error) {
    console.error('Error removing payout:', error);
    throw error;
  }
}

/**
 * Admin reassign payout to pool
 */
export async function reassignPayoutToPool(payoutId) {
  try {
    await supabase.from('payouts').update({
      status: 'pending',
      trader_id: null,
      payout_request_id: null,
      assigned_at: null,
      cancelled_at: null,
      cancel_reason: null,
      cancelled_by: null,
    }).eq('id', payoutId);

    console.log(`✅ Payout reassigned to pool`);
    processWaitingList().catch(err => console.error('Error processing waiting list:', err));
    return { success: true };
  } catch (error) {
    console.error('Error reassigning:', error);
    throw error;
  }
}
