// payoutAssignmentHelper.js — Supabase RPC version
import { supabase } from '../supabase';

/**
 * Immediate auto-assign payouts to trader using RPC
 */
export async function immediateAutoAssignPayouts(traderId, requestedAmount) {
  try {
    console.log(`🚀 Starting auto-assignment for trader ${traderId}, amount: ₹${requestedAmount}`);

    const { data, error } = await supabase.rpc('assign_payouts_to_trader', {
      p_trader_id: traderId,
      p_requested_amount: requestedAmount
    });

    if (error) {
      console.error('❌ RPC error:', error);
      throw new Error(error.message || 'Assignment failed');
    }

    if (!data.success) {
      throw new Error(data.error || 'Assignment failed');
    }

    console.log(`✅ Assignment result:`, data);

    const message = data.fullyAssigned
      ? `✅ Fully assigned! ${data.assignedCount} payouts ready to process.`
      : data.assignedCount > 0
        ? `⚠️ Partially assigned! ${data.assignedCount} payouts ready. ₹${data.remainingAmount.toLocaleString()} in waiting list.`
        : `⏳ No payouts available right now. Request added to waiting list for ₹${requestedAmount.toLocaleString()}.`;

    return {
      success: true,
      requestId: data.requestId,
      status: data.status,
      assignedCount: data.assignedCount,
      assignedAmount: data.assignedAmount,
      remainingAmount: data.remainingAmount,
      fullyAssigned: data.fullyAssigned,
      inWaitingList: data.inWaitingList,
      message,
    };
  } catch (error) {
    console.error('❌ ERROR in auto-assignment:', error);
    throw error;
  }
}

/**
 * Cancel payout by trader using RPC
 */
export async function cancelPayoutByTrader(payoutId, reason) {
  try {
    const { data, error } = await supabase.rpc('cancel_payout_by_trader', {
      p_payout_id: payoutId,
      p_reason: reason
    });

    if (error) {
      console.error('❌ RPC error:', error);
      throw new Error(error.message || 'Cancel failed');
    }

    if (!data.success) {
      throw new Error(data.error || 'Cancel failed');
    }

    console.log(`✅ Payout ${payoutId} cancelled successfully`);
    return { success: true };
  } catch (error) {
    console.error('❌ Error cancelling payout:', error);
    throw error;
  }
}

/**
 * Cancel request by trader using RPC
 */
export async function cancelPayoutRequestByTrader(requestId) {
  try {
    const { data, error } = await supabase.rpc('cancel_payout_request_by_trader', {
      p_request_id: requestId
    });

    if (error) {
      console.error('❌ RPC error:', error);
      throw new Error(error.message || 'Cancel failed');
    }

    if (!data.success) {
      throw new Error(data.error || 'Cancel failed');
    }

    console.log(`✅ Request ${requestId} cancelled successfully`);
    return { success: true };
  } catch (error) {
    console.error('Error cancelling request:', error);
    throw error;
  }
}

/**
 * Process waiting list (admin/cron function)
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
