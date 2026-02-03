// payoutAssignmentHelper.js
// FINAL FIX: Removed orderBy to avoid index issues

import { 
  collection, 
  query, 
  where, 
  getDocs, 
  updateDoc, 
  doc, 
  serverTimestamp,
  writeBatch,
  addDoc
} from 'firebase/firestore';
import { db } from '../firebase';

/**
 * FINAL FIX: Immediate auto-assign without orderBy
 */
export async function immediateAutoAssignPayouts(traderId, requestedAmount) {
  try {
    console.log(`🚀 Starting auto-assignment for trader ${traderId}, amount: ₹${requestedAmount}`);

    // Simple query WITHOUT orderBy (no index needed)
    const payoutsQuery = query(
      collection(db, 'payouts'),
      where('status', '==', 'pending')
    );

    const payoutsSnapshot = await getDocs(payoutsQuery);
    
    console.log(`✅ Found ${payoutsSnapshot.size} pending payouts in database`);
    
    // Filter and sort in JavaScript
    const unassignedPayouts = [];
    payoutsSnapshot.forEach(docSnap => {
      const data = docSnap.data();
      // Only unassigned payouts (no traderId)
      if (!data.traderId || data.traderId === null || data.traderId === '') {
        unassignedPayouts.push({ 
          id: docSnap.id, 
          ...data,
          // Use any available timestamp for sorting
          sortTime: data.requestTime?.seconds || 
                    data.createdAt?.seconds || 
                    data.timestamp?.seconds ||
                    Date.now() / 1000
        });
      }
    });

    // Sort by time (oldest first - FIFO)
    unassignedPayouts.sort((a, b) => a.sortTime - b.sortTime);

    console.log(`✅ Found ${unassignedPayouts.length} unassigned payouts`);

    if (unassignedPayouts.length === 0) {
      console.log(`⚠️ NO UNASSIGNED PAYOUTS FOUND!`);
      console.log(`Total pending in DB: ${payoutsSnapshot.size}`);
      
      // Debug: Show what payouts exist
      let assignedCount = 0;
      payoutsSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.traderId) assignedCount++;
      });
      console.log(`Already assigned: ${assignedCount}`);
      console.log(`Available: ${payoutsSnapshot.size - assignedCount}`);
    }

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

    console.log(`📊 Summary:`);
    console.log(`  Requested: ₹${requestedAmount}`);
    console.log(`  Assigned: ₹${assignedAmount}`);
    console.log(`  Remaining: ₹${remainingAmount}`);
    console.log(`  Status: ${fullyAssigned ? 'FULLY' : payoutsToAssign.length > 0 ? 'PARTIAL' : 'WAITING'}`);

    // Create request document
    const requestData = {
      traderId: traderId,
      requestedAmount: requestedAmount,
      assignedAmount: assignedAmount,
      remainingAmount: remainingAmount > 0 ? remainingAmount : 0,
      status: fullyAssigned ? 'fully_assigned' : (payoutsToAssign.length > 0 ? 'partially_assigned' : 'waiting'),
      requestedAt: serverTimestamp(),
      assignedPayouts: payoutsToAssign.map(p => p.id),
      fullyAssigned: fullyAssigned,
      inWaitingList: !fullyAssigned
    };

    const requestRef = await addDoc(collection(db, 'payoutRequest'), requestData);
    const requestId = requestRef.id;

    console.log(`✅ Created request: ${requestId}`);

    // Assign payouts if any available
    if (payoutsToAssign.length > 0) {
      console.log(`💾 Assigning ${payoutsToAssign.length} payouts...`);
      const batch = writeBatch(db);
      const now = serverTimestamp();

      payoutsToAssign.forEach((payout, index) => {
        const payoutRef = doc(db, 'payouts', payout.id);
        batch.update(payoutRef, {
          traderId: traderId,
          payoutRequestId: requestId,
          assignedAt: now,
          status: 'assigned'
        });
        console.log(`  ${index + 1}. ✓ ${payout.id.substring(0, 8)}...`);
      });

      await batch.commit();
      console.log(`✅ SUCCESS! Assigned ${payoutsToAssign.length} payouts`);
    } else {
      console.log(`⚠️ No payouts to assign - added to waiting list`);
    }

    const message = fullyAssigned 
      ? `✅ Fully assigned! ${payoutsToAssign.length} payouts ready to process.`
      : payoutsToAssign.length > 0
        ? `⚠️ Partially assigned! ${payoutsToAssign.length} payouts ready. ₹${remainingAmount.toLocaleString()} in waiting list.`
        : `⏳ No payouts available right now. Request added to waiting list for ₹${requestedAmount.toLocaleString()}.`;

    console.log(`\n${message}\n`);

    return {
      success: true,
      requestId: requestId,
      status: requestData.status,
      assignedCount: payoutsToAssign.length,
      assignedAmount: assignedAmount,
      remainingAmount: remainingAmount > 0 ? remainingAmount : 0,
      fullyAssigned: fullyAssigned,
      inWaitingList: !fullyAssigned,
      message: message
    };

  } catch (error) {
    console.error('❌ ERROR in auto-assignment:', error);
    console.error('Error details:', error.message);
    throw error;
  }
}

/**
 * Process waiting list - FIXED without orderBy
 */
export async function processWaitingList() {
  try {
    console.log('🔄 Processing waiting list...');

    // Get waiting requests WITHOUT orderBy
    const waitingQuery = query(
      collection(db, 'payoutRequest'),
      where('inWaitingList', '==', true)
    );

    const waitingSnapshot = await getDocs(waitingQuery);
    
    if (waitingSnapshot.empty) {
      console.log('No requests in waiting list');
      return { processed: 0 };
    }

    // Sort in JavaScript by requestedAt
    const waitingRequests = [];
    waitingSnapshot.forEach(doc => {
      waitingRequests.push({
        id: doc.id,
        ...doc.data(),
        sortTime: doc.data().requestedAt?.seconds || 0
      });
    });
    waitingRequests.sort((a, b) => a.sortTime - b.sortTime);

    console.log(`Found ${waitingRequests.length} requests in waiting list`);

    let processedCount = 0;

    for (const request of waitingRequests) {
      const remainingAmount = request.remainingAmount || 0;

      if (remainingAmount <= 0) continue;

      console.log(`Processing request ${request.id}, remaining: ₹${remainingAmount}`);

      // Get available payouts WITHOUT orderBy
      const payoutsQuery = query(
        collection(db, 'payouts'),
        where('status', '==', 'pending')
      );

      const payoutsSnapshot = await getDocs(payoutsQuery);
      
      if (payoutsSnapshot.empty) {
        console.log('No payouts available');
        break;
      }

      // Filter and sort
      const unassignedPayouts = [];
      payoutsSnapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (!data.traderId || data.traderId === null || data.traderId === '') {
          unassignedPayouts.push({ 
            id: docSnap.id, 
            ...data,
            sortTime: data.requestTime?.seconds || 
                      data.createdAt?.seconds || 
                      Date.now() / 1000
          });
        }
      });

      if (unassignedPayouts.length === 0) {
        console.log('No unassigned payouts');
        break;
      }

      unassignedPayouts.sort((a, b) => a.sortTime - b.sortTime);

      // Select payouts
      const payoutsToAssign = [];
      let additionalAmount = 0;

      for (const payout of unassignedPayouts) {
        if (additionalAmount >= remainingAmount) break;
        
        const payoutAmount = Number(payout.amount || 0);
        payoutsToAssign.push(payout);
        additionalAmount += payoutAmount;
      }

      if (payoutsToAssign.length === 0) break;

      // Assign payouts
      const batch = writeBatch(db);
      const now = serverTimestamp();

      payoutsToAssign.forEach(payout => {
        const payoutRef = doc(db, 'payouts', payout.id);
        batch.update(payoutRef, {
          traderId: request.traderId,
          payoutRequestId: request.id,
          assignedAt: now,
          status: 'assigned'
        });
      });

      // Update request
      const newAssignedAmount = (request.assignedAmount || 0) + additionalAmount;
      const newRemainingAmount = request.requestedAmount - newAssignedAmount;
      const nowFullyAssigned = newRemainingAmount <= 0;

      const requestRef = doc(db, 'payoutRequest', request.id);
      batch.update(requestRef, {
        assignedAmount: newAssignedAmount,
        remainingAmount: newRemainingAmount > 0 ? newRemainingAmount : 0,
        assignedPayouts: [...(request.assignedPayouts || []), ...payoutsToAssign.map(p => p.id)],
        fullyAssigned: nowFullyAssigned,
        inWaitingList: !nowFullyAssigned,
        status: nowFullyAssigned ? 'fully_assigned' : 'partially_assigned',
        lastAssignedAt: now
      });

      await batch.commit();
      
      console.log(`✅ Assigned ${payoutsToAssign.length} more payouts`);
      processedCount++;

      if (nowFullyAssigned) {
        console.log(`✅ Request ${request.id} now fully assigned!`);
      }
    }

    console.log(`🎉 Processed ${processedCount} waiting requests`);
    return { processed: processedCount };

  } catch (error) {
    console.error('❌ Error processing waiting list:', error);
    throw error;
  }
}

/**
 * Check if trader can create request
 */
export async function canTraderCreateRequest(traderId) {
  try {
    const requestQuery = query(
      collection(db, 'payoutRequest'),
      where('traderId', '==', traderId),
      where('status', 'in', ['fully_assigned', 'partially_assigned', 'waiting'])
    );

    const requestSnap = await getDocs(requestQuery);
    
    if (!requestSnap.empty) {
      const request = requestSnap.docs[0].data();
      const requestId = requestSnap.docs[0].id;

      const assignedPayoutsQuery = query(
        collection(db, 'payouts'),
        where('payoutRequestId', '==', requestId),
        where('status', '==', 'assigned')
      );

      const assignedPayoutsSnap = await getDocs(assignedPayoutsQuery);

      if (!assignedPayoutsSnap.empty) {
        return {
          canCreate: false,
          reason: 'You have pending payouts to process',
          pendingCount: assignedPayoutsSnap.size,
          activeRequest: { id: requestId, ...request }
        };
      }

      await updateDoc(doc(db, 'payoutRequest', requestId), {
        status: 'completed',
        completedAt: serverTimestamp()
      });
    }

    return {
      canCreate: true,
      reason: null
    };

  } catch (error) {
    console.error('Error checking eligibility:', error);
    throw error;
  }
}

/**
 * Complete payout
 */
export async function completePayoutWithProof(payoutId, traderId, utrId, proofUrl) {
  try {
    const payoutDoc = await getDocs(
      query(collection(db, 'payouts'), where('__name__', '==', payoutId))
    );
    
    if (payoutDoc.empty) {
      throw new Error('Payout not found');
    }

    const payoutData = payoutDoc.docs[0].data();
    const payoutAmount = Number(payoutData.amount || 0);

    const batch = writeBatch(db);

    const payoutRef = doc(db, 'payouts', payoutId);
    batch.update(payoutRef, {
      status: 'completed',
      completedAt: serverTimestamp(),
      utrId: utrId,
      proofUrl: proofUrl
    });

    const traderQuery = query(
      collection(db, 'trader'),
      where('uid', '==', traderId)
    );
    const traderSnap = await getDocs(traderQuery);

    if (!traderSnap.empty) {
      const traderDoc = traderSnap.docs[0];
      const currentBalance = Number(traderDoc.data().balance || 0);
      const newBalance = currentBalance + payoutAmount;

      batch.update(doc(db, 'trader', traderDoc.id), {
        balance: newBalance
      });
    }

    await batch.commit();

    console.log(`✅ Payout completed: ₹${payoutAmount} added`);

    processWaitingList().catch(err => console.error('Error processing waiting list:', err));

    return {
      success: true,
      amountAdded: payoutAmount
    };

  } catch (error) {
    console.error('❌ Error completing payout:', error);
    throw error;
  }
}

/**
 * Cancel payout by trader
 */
export async function cancelPayoutByTrader(payoutId, reason) {
  try {
    // Get payout data first
    const payoutSnap = await getDocs(
      query(collection(db, 'payouts'), where('__name__', '==', payoutId))
    );
    
    if (payoutSnap.empty) {
      throw new Error('Payout not found');
    }

    const payoutData = payoutSnap.docs[0].data();
    const payoutAmount = Number(payoutData.amount || 0);
    const requestId = payoutData.payoutRequestId;

    // Update payout
    const payoutRef = doc(db, 'payouts', payoutId);
    await updateDoc(payoutRef, {
      status: 'cancelled_by_trader',
      cancelledAt: serverTimestamp(),
      cancelReason: reason,
      cancelledBy: 'trader',
      traderId: null,
      payoutRequestId: null,
      assignedAt: null
    });

    console.log(`✅ Payout cancelled`);

    // Update the payoutRequest if it exists
    if (requestId) {
      const requestSnap = await getDocs(
        query(collection(db, 'payoutRequest'), where('__name__', '==', requestId))
      );

      if (!requestSnap.empty) {
        const requestData = requestSnap.docs[0].data();
        const assignedPayouts = (requestData.assignedPayouts || []).filter(id => id !== payoutId);
        const newAssignedAmount = (requestData.assignedAmount || 0) - payoutAmount;
        const newRemainingAmount = requestData.requestedAmount - newAssignedAmount;

        const requestRef = doc(db, 'payoutRequest', requestId);
        
        // If no more assigned payouts, allow cancellation
        if (assignedPayouts.length === 0) {
          await updateDoc(requestRef, {
            assignedPayouts: [],
            assignedAmount: 0,
            remainingAmount: requestData.requestedAmount,
            fullyAssigned: false,
            inWaitingList: true,
            status: 'waiting'
          });
          console.log(`✅ Request ${requestId} status updated - now waiting (no assigned payouts)`);
        } else {
          // Update with remaining assignments
          await updateDoc(requestRef, {
            assignedPayouts,
            assignedAmount: newAssignedAmount,
            remainingAmount: newRemainingAmount > 0 ? newRemainingAmount : 0,
            fullyAssigned: newRemainingAmount <= 0,
            status: newRemainingAmount <= 0 ? 'fully_assigned' : 'partially_assigned'
          });
          console.log(`✅ Request ${requestId} updated - remaining ${assignedPayouts.length} payouts`);
        }
      }
    }

    // Process waiting list for the freed payout slot
    processWaitingList().catch(err => console.error('Error processing waiting list:', err));

    return { success: true };

  } catch (error) {
    console.error('❌ Error cancelling payout:', error);
    throw error;
  }
}

/**
 * Get overdue payouts - FIXED without orderBy
 */
export async function getPayoutsPendingOverOneHour() {
  try {
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    const payoutsQuery = query(
      collection(db, 'payouts'),
      where('status', '==', 'assigned')
    );

    const snapshot = await getDocs(payoutsQuery);
    const overduePayouts = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      const assignedAt = data.assignedAt?.toDate();
      
      if (assignedAt && assignedAt < oneHourAgo) {
        overduePayouts.push({
          id: doc.id,
          ...data,
          pendingDuration: Math.floor((Date.now() - assignedAt.getTime()) / (1000 * 60))
        });
      }
    });

    // Sort by time (oldest first)
    overduePayouts.sort((a, b) => {
      const timeA = a.assignedAt?.seconds || 0;
      const timeB = b.assignedAt?.seconds || 0;
      return timeA - timeB;
    });

    return overduePayouts;

  } catch (error) {
    console.error('Error fetching overdue:', error);
    throw error;
  }
}

/**
 * Get cancelled payouts - FIXED without orderBy
 */
export async function getCancelledPayouts() {
  try {
    const payoutsQuery = query(
      collection(db, 'payouts'),
      where('status', '==', 'cancelled_by_trader')
    );

    const snapshot = await getDocs(payoutsQuery);
    const cancelledPayouts = [];

    snapshot.forEach(doc => {
      cancelledPayouts.push({
        id: doc.id,
        ...doc.data()
      });
    });

    // Sort by cancelled time (newest first)
    cancelledPayouts.sort((a, b) => {
      const timeA = a.cancelledAt?.seconds || 0;
      const timeB = b.cancelledAt?.seconds || 0;
      return timeB - timeA;
    });

    return cancelledPayouts;

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
    const payoutRef = doc(db, 'payouts', payoutId);
    
    await updateDoc(payoutRef, {
      status: 'removed_by_admin',
      removedAt: serverTimestamp(),
      removedBy: adminId
    });

    return { success: true };

  } catch (error) {
    console.error('Error removing payout:', error);
    throw error;
  }
}

/**
 * Admin reassign payout
 */
export async function reassignPayoutToPool(payoutId) {
  try {
    const payoutRef = doc(db, 'payouts', payoutId);
    
    await updateDoc(payoutRef, {
      status: 'pending',
      traderId: null,
      payoutRequestId: null,
      assignedAt: null,
      cancelledAt: null,
      cancelReason: null,
      cancelledBy: null
    });

    console.log(`✅ Payout reassigned to pool`);

    processWaitingList().catch(err => console.error('Error processing waiting list:', err));

    return { success: true };

  } catch (error) {
    console.error('Error reassigning:', error);
    throw error;
  }
}

/**
 * Cancel request by trader
 */
export async function cancelPayoutRequestByTrader(requestId) {
  try {
    const requestSnap = await getDocs(
      query(collection(db, 'payoutRequest'), where('__name__', '==', requestId))
    );

    if (requestSnap.empty) {
      throw new Error('Request not found');
    }

    const requestData = requestSnap.docs[0].data();

    // Check for ACTUAL assigned payouts in database (not just array)
    const assignedPayoutsQuery = query(
      collection(db, 'payouts'),
      where('payoutRequestId', '==', requestId),
      where('status', '==', 'assigned')
    );

    const assignedPayoutsSnap = await getDocs(assignedPayoutsQuery);

    if (!assignedPayoutsSnap.empty) {
      throw new Error(`Cannot cancel: ${assignedPayoutsSnap.size} payout(s) still assigned. Cancel them first.`);
    }

    await updateDoc(doc(db, 'payoutRequest', requestId), {
      status: 'cancelled',
      cancelledAt: serverTimestamp(),
      cancelledBy: 'trader'
    });

    console.log(`✅ Request ${requestId} cancelled successfully`);

    return { success: true };

  } catch (error) {
    console.error('Error cancelling request:', error);
    throw error;
  }
}