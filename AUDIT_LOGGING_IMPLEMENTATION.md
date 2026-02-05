# Audit Logging System - Implementation Guide
**Status:** Week 1 Complete ✅  
**Date:** 2026-02-05

---

## ✅ Week 1 Complete: Foundation

### What's Been Implemented

#### 1. Audit Logger Helper (`src/utils/auditLogger.js`) ✅
**Central logging function with pre-configured helpers**

**Core Function:**
```javascript
import { logAuditEvent } from '../utils/auditLogger';

await logAuditEvent({
  action: 'upi_disabled',           // What happened
  category: 'operational',          // financial|entity|operational|security|system
  entityType: 'upi',                // What was affected
  entityId: 'upi_123',              // Which one
  entityName: '9876543210@paytm',   // Display name
  details: {
    before: 'active',
    after: 'disabled',
    note: 'Maintenance',
    metadata: { merchantId: 'abc' }
  },
  severity: 'warning',              // info|warning|critical
});
```

**Pre-configured Helper Functions:**
```javascript
// Financial
logBalanceTopup(traderId, name, amount, before, after, note)
logBalanceDeduct(traderId, name, amount, before, after, reason)
logSecurityHoldAdded(traderId, name, amount, before, after, reason)
logSecurityHoldReleased(traderId, name, amount, before, after, reason)

// UPI (YOUR PRIORITY)
logUPIEnabled(upiId, upiAddress, merchantId, reason)
logUPIDisabled(upiId, upiAddress, merchantId, reason)
logUPIAdded(upiId, upiAddress, merchantId)
logUPIDeleted(upiId, upiAddress, merchantId, reason)

// Trader/Merchant
logTraderActivated(traderId, name, reason)
logTraderDeactivated(traderId, name, reason)
logMerchantActivated(merchantId, name, reason)
logMerchantDeactivated(merchantId, name, reason)
logMerchantAPIKeyGenerated(merchantId, name, keyPrefix)

// Disputes
logDisputeResolved(disputeId, type, merchantId, traderId, outcome, note)

// System
logSettingsChanged(settingName, before, after, note)

// USDT Deposits
logUSDTDepositAddressGenerated(traderId, name, address, derivationIndex)
logUSDTDepositDetected(traderId, name, amount, usdtAmount, txHash, address)
logUSDTDepositCredited(traderId, name, amount, usdtAmount, txHash, before, after)

// Data Operations
logDataExported(dataType, recordCount, format, reason)
logDataDeleted(dataType, recordCount, reason, backupCreated)
```

---

#### 2. Enhanced AdminLogs Component ✅
**Location:** `src/roles/admin/AUDIT/AdminLogs.jsx`

**New Features:**
- ✅ **6 Category Tabs:**
  - All Events (complete view)
  - Financial (balance, deposits, settlements)
  - Entity Management (trader/merchant lifecycle)
  - Operations (payin, payout, UPI, disputes)
  - Security (API keys, login, data exports)
  - System (config changes, Tatum settings)

- ✅ **Advanced Filtering:**
  - Search by entity, performer, action, note
  - Filter by date range (from/to)
  - Filter by action type
  - Filter by severity (info/warning/critical)
  - Clear all filters button

- ✅ **Rich Log Cards:**
  - Severity stripe (blue/amber/red)
  - Action icon and label
  - Entity links (trader/merchant profiles)
  - Amount display for financial actions
  - Balance before/after with delta
  - State change (before → after)
  - Admin notes
  - Metadata summary
  - Performer + timestamp
  - Source badge (webhook, api, cron, etc.)

- ✅ **Export Functionality:**
  - Export filtered logs as CSV
  - Includes all relevant columns
  - Filename includes tab and timestamp

- ✅ **Performance:**
  - Loads 200 most recent logs
  - Client-side filtering (instant)
  - Memoized computations

---

#### 3. Firestore Indexes Added ✅
**Location:** `firestore.indexes.json`

**New Indexes for adminLog Collection:**
1. `category + createdAt` (tab filtering)
2. `entityType + createdAt` (entity filtering)
3. `action + createdAt` (action filtering)
4. `performedBy + createdAt` (performer filtering)
5. `severity + createdAt` (severity filtering)
6. `requiresReview + createdAt` (compliance filtering)

**Deploy Command:**
```bash
firebase deploy --only firestore:indexes
```

---

## 🚀 Week 2: Critical Event Logging (NEXT STEPS)

### Priority 1: UPI State Changes ← YOUR REQUIREMENT

**Where:** `src/roles/admin/OPERATIONS/AdminUPIPool.jsx` (or wherever UPI is managed)

**Implementation:**
```javascript
import { logUPIEnabled, logUPIDisabled } from '../../../utils/auditLogger';

const toggleUPIStatus = async (upiId, newStatus) => {
  const oldStatus = upi.status;
  
  // Update UPI status in Firestore
  await updateDoc(doc(db, 'upiPool', upiId), {
    status: newStatus,
    lastModified: serverTimestamp(),
    lastModifiedBy: auth.currentUser.uid,
  });
  
  // Log the change ← ADD THIS
  if (newStatus === 'active') {
    await logUPIEnabled(
      upiId,
      upi.upiId,           // e.g., "9876543210@paytm"
      upi.merchantId,
      'Status changed by admin'
    );
  } else {
    await logUPIDisabled(
      upiId,
      upi.upiId,
      upi.merchantId,
      'Status changed by admin'
    );
  }
};
```

**Test:**
1. Go to Admin UPI Pool
2. Toggle UPI on/off
3. Go to Admin Logs → Operations tab
4. Should see `upi_enabled` or `upi_disabled` logs with timestamps

---

### Priority 2: Balance Modifications

**Where:** `src/roles/admin/ENTITIES/AdminTraderDetail.jsx`

**Implementation:**
```javascript
import { logBalanceTopup, logBalanceDeduct } from '../../../utils/auditLogger';

const topUpBalance = async (amount, note) => {
  const balanceBefore = trader.balance;
  const balanceAfter = balanceBefore + amount;
  
  await runTransaction(db, async (tx) => {
    const traderRef = doc(db, 'trader', trader.uid);
    tx.update(traderRef, { balance: balanceAfter });
  });
  
  // Log the change ← ADD THIS
  await logBalanceTopup(
    trader.uid,
    trader.name,
    amount,
    balanceBefore,
    balanceAfter,
    note
  );
};

const deductBalance = async (amount, reason) => {
  const balanceBefore = trader.balance;
  const balanceAfter = balanceBefore - amount;
  
  await runTransaction(db, async (tx) => {
    const traderRef = doc(db, 'trader', trader.uid);
    tx.update(traderRef, { balance: balanceAfter });
  });
  
  // Log the change ← ADD THIS
  await logBalanceDeduct(
    trader.uid,
    trader.name,
    amount,
    balanceBefore,
    balanceAfter,
    reason
  );
};
```

---

### Priority 3: USDT Deposit Lifecycle

**Where:** `functions/index.js` (Cloud Functions)

**Implementation:**
```javascript
// In tatumUSDTWebhook function
const { logUSDTDepositDetected, logUSDTDepositCredited } = require('./utils/auditLogger');

exports.tatumUSDTWebhook = functions.https.onRequest(async (req, res) => {
  // ... existing code ...
  
  // After detecting deposit
  await logUSDTDepositDetected(
    traderId,
    traderName,
    inrAmount,
    usdtAmount,
    txHash,
    depositAddress
  );
  
  // After crediting balance
  await logUSDTDepositCredited(
    traderId,
    traderName,
    inrAmount,
    usdtAmount,
    txHash,
    balanceBefore,
    balanceAfter
  );
  
  res.status(200).send('OK');
});
```

---

### Priority 4: API Key Generation

**Where:** `src/roles/admin/ENTITIES/AdminMerchantDetail.jsx`

**Implementation:**
```javascript
import { logMerchantAPIKeyGenerated } from '../../../utils/auditLogger';

const generateAPIKey = async () => {
  const newKey = generateSecureKey();
  const keyPrefix = newKey.substring(0, 8);
  
  await updateDoc(doc(db, 'merchant', merchantId), {
    apiKey: newKey,
    apiKeyGeneratedAt: serverTimestamp(),
  });
  
  // Log the change ← ADD THIS
  await logMerchantAPIKeyGenerated(
    merchantId,
    merchant.businessName,
    keyPrefix
  );
};
```

---

## 📋 Week 3: Entity Operations (Remaining)

### Implement Logging For:

**Trader Operations:**
- Profile updates (name, email, phone, bank details)
- Bank account added/deleted
- UPI ID added/deleted
- Daily limit changes
- Commission rate changes

**Merchant Operations:**
- Profile updates
- Settlement address changes
- Webhook URL changes
- Commission rate changes

**Files to Update:**
- `src/roles/admin/ENTITIES/AdminTraderDetail.jsx`
- `src/roles/admin/ENTITIES/AdminMerchantDetail.jsx`

---

## 🔒 Week 4: Security & Polish

### Implement:
1. **Login tracking** (success/failure) - add to authentication flow
2. **Data export logging** - add to CSV export functions
3. **Data deletion logging** - add to delete operations
4. **Advanced search** - already implemented ✅
5. **Archiving** - move logs older than 1 year to `adminLog_archive`

---

## 🎨 UI Enhancements (Optional)

### Already Implemented ✅
- 6 category tabs with counts
- Advanced filtering (date, severity, action)
- Search across all fields
- CSV export
- Severity badges
- Rich log cards with all details
- Entity profile links

### Future Enhancements (Nice to Have):
- Timeline visualization
- Heatmap of admin activity
- UPI toggle frequency graph
- Real-time log streaming (WebSocket)
- Log archiving UI

---

## 📊 How to Use Audit Logs

### Common Queries

#### "Who disabled this UPI and when?"
1. Go to Admin Logs
2. Click "Operations" tab
3. Search for UPI ID
4. Look for `upi_disabled` action
5. See performer, timestamp, reason

#### "All balance changes this month"
1. Go to Admin Logs
2. Click "Financial" tab
3. Set date range (this month)
4. Look for balance topup/deduct actions
5. Export as CSV

#### "What did Admin X do today?"
1. Go to Admin Logs
2. Set date range (today)
3. Search for admin name
4. See all their actions

#### "Show me all critical events"
1. Go to Admin Logs
2. Open filters
3. Select "Critical" severity
4. See all high-priority events

---

## 🔍 Testing Checklist

### Week 1 Foundation (Test Now) ✅
- [ ] Navigate to Admin Logs page
- [ ] Verify 6 tabs render correctly
- [ ] Click each tab, verify log filtering
- [ ] Search for a trader name
- [ ] Open filters, set date range
- [ ] Filter by severity
- [ ] Export logs as CSV
- [ ] Verify CSV contains correct data

### Week 2 Critical Logging (Test After Implementation)
- [ ] Toggle UPI on/off
- [ ] Verify log appears in Operations tab
- [ ] Check log shows before/after status
- [ ] Top up trader balance
- [ ] Verify log shows balance change
- [ ] Check log shows amount and note
- [ ] Test USDT deposit
- [ ] Verify deposit detected log
- [ ] Verify deposit credited log

---

## 🐛 Troubleshooting

### "Logs not appearing"
**Check:**
1. Is `adminLog` collection created in Firestore?
2. Are indexes deployed? (`firebase deploy --only firestore:indexes`)
3. Does user have permission to read `adminLog`?
4. Check browser console for errors

### "Filtering not working"
**Check:**
1. Are Firestore indexes deployed?
2. Wait 5-10 minutes after deploying indexes
3. Check browser console for index errors
4. Firestore will show index creation link in error

### "Export CSV empty"
**Check:**
1. Are you exporting filtered logs (0 results)?
2. Clear filters and try again
3. Check browser console for errors

### "Performance slow"
**Solutions:**
1. Reduce query limit (currently 200)
2. Deploy missing indexes
3. Archive old logs to separate collection
4. Add pagination (load more button)

---

## 📈 Success Metrics

**After Week 2 implementation, you should be able to:**
- ✅ Answer "Who toggled UPI X" in 10 seconds
- ✅ Generate "All balance changes" report in 1 minute
- ✅ Track complete USDT deposit lifecycle
- ✅ Export audit trail for compliance

**After Week 3-4:**
- ✅ Complete forensic trail for any entity
- ✅ Security investigation support
- ✅ Regulatory compliance ready
- ✅ Data deletion accountability

---

## 🚀 Next Actions

### Immediate (You):
1. **Test the new UI:**
   - Navigate to Admin Logs
   - Click through all 6 tabs
   - Try searching and filtering
   - Export a CSV

2. **Deploy Firestore indexes:**
   ```bash
   cd C:\Users\hones\pay2x
   firebase deploy --only firestore:indexes
   ```
   Wait 5-10 minutes for indexes to build.

3. **Review Week 2 priorities:**
   - UPI state change logging (your #1 priority)
   - Balance modification logging
   - USDT deposit lifecycle
   - API key generation

### When Ready for Week 2:
- Tell me which component to start with (UPI logging recommended)
- I'll implement the logging calls in that component
- We'll test it together
- Move to next component

---

## 📝 Notes

### Silent Failure Design
The audit logger **never breaks app functionality**. If logging fails:
- Error is logged to console
- App continues normally
- Returns `{ success: false, error }` but doesn't throw

### Performance Considerations
- Logs limited to 200 most recent
- Client-side filtering (no additional queries)
- Indexes ensure fast queries
- Consider archiving after 1 year

### Security Considerations
- Never log sensitive data (passwords, full API keys, mnemonic)
- Mask account numbers (show last 4 digits)
- Store IP addresses for security investigations
- Mark sensitive actions with `requiresReview: true`

### Compliance Benefits
- Complete audit trail for RBI/regulators
- Forensic investigation support
- Dispute evidence
- Tax/commission reconciliation
- Data protection compliance (GDPR/similar)

---

**Status:** Foundation complete, ready for Week 2 implementation 🚀

**Questions?** Review `AUDIT_LOGGING_SYSTEM_DESIGN.md` for complete design details.
