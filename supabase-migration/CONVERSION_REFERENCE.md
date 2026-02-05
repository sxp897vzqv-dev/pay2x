# Firebase → Supabase Conversion Reference

## Import Changes
```js
// REMOVE these Firebase imports:
import { collection, query, where, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, addDoc, orderBy, limit, startAfter, onSnapshot, Timestamp, serverTimestamp, writeBatch, increment } from 'firebase/firestore';
import { auth, db } from '../../firebase'; // or '../firebase' etc.
import { getAuth } from 'firebase/auth';

// ADD this Supabase import:
import { supabase } from '../../supabase'; // adjust path based on file depth
```

## Supabase Client Path
- From `src/roles/admin/FILE.jsx` → `import { supabase } from '../../supabase'`
- From `src/roles/admin/SUBFOLDER/FILE.jsx` → `import { supabase } from '../../../supabase'`
- From `src/roles/trader/SUBFOLDER/FILE.jsx` → `import { supabase } from '../../../supabase'`
- From `src/roles/merchant/FILE.jsx` → `import { supabase } from '../../supabase'`

## Collection → Table Mapping
| Firestore Collection | Supabase Table |
|---|---|
| `payin` | `payins` |
| `payouts` | `payouts` |
| `disputes` | `disputes` |
| `trader` | `traders` |
| `merchant` | `merchants` |
| `worker` | `workers` |
| `upiPool` | `upi_pool` |
| `savedBanks` | `saved_banks` |
| `payoutRequest` | `payout_requests` |
| `selectionLogs` | `payin_selection_logs` |
| `payoutSelectionLogs` | `payout_selection_logs` |
| `disputeEngineLogs` | `dispute_engine_logs` |
| `disputeMessages` | `dispute_messages` |
| `adminLog` | `admin_logs` |
| `bankHealth` | `bank_health` |
| `system/engineConfig` | `system_config` key='engine_config' |
| `system/payoutEngineConfig` | `system_config` key='payout_engine_config' |
| `system/disputeEngineConfig` | `system_config` key='dispute_engine_config' |

## Column Name Mapping (camelCase → snake_case)
| Firestore Field | Supabase Column |
|---|---|
| `createdAt` | `created_at` |
| `updatedAt` | `updated_at` |
| `merchantId` | `merchant_id` |
| `traderId` | `trader_id` |
| `upiId` | `upi_id` |
| `isActive` | `is_active` |
| `isOnline` | `is_online` |
| `businessName` | `business_name` |
| `payinRate` / `payinCommission` | `payin_commission` |
| `payoutRate` / `payoutCommission` | `payout_commission` |
| `overallCommission` | `overall_commission` |
| `liveApiKey` | `live_api_key` |
| `webhookUrl` | `webhook_url` |
| `webhookSecret` | `webhook_secret` |
| `orderId` | `order_id` |
| `txnId` | `txn_id` |
| `assignedUpi` | `assigned_upi` |
| `assignedUpiName` | `assigned_upi_name` |
| `customerName` | `customer_name` |
| `customerEmail` | `customer_email` |
| `customerPhone` | `customer_phone` |
| `webhookSent` | `webhook_sent` |
| `webhookResponse` | `webhook_response` |
| `assignedAt` | `assigned_at` |
| `completedAt` | `completed_at` |
| `expiredAt` | `expired_at` |
| `accountName` | `account_name` |
| `accountNumber` | `account_number` |
| `holderName` | `holder_name` |
| `bankName` | `bank_name` |
| `dailyLimit` | `daily_limit` |
| `perTransactionLimit` | `per_transaction_limit` |
| `minAmount` | `min_amount` |
| `dailyVolume` | `daily_volume` |
| `dailyCount` | `daily_count` |
| `dailySuccess` | `daily_success` |
| `dailyFailed` | `daily_failed` |
| `totalVolume` | `total_volume` |
| `totalCount` | `total_count` |
| `totalSuccess` | `total_success` |
| `totalFailed` | `total_failed` |
| `successRate` | `success_rate` |
| `lastUsedAt` | `last_used_at` |
| `hourlyFailures` | `hourly_failures` |
| `amountTier` | `amount_tier` |
| `lastOnlineAt` | `last_online_at` |
| `avgCompletionTime` | `avg_completion_time` |
| `activePayouts` | `active_payouts` |
| `cancelRate` | `cancel_rate` |
| `dailyCompleted` | `daily_completed` |
| `traderResponse` | `trader_response` |
| `traderProofUrl` | `trader_proof_url` |
| `traderStatement` | `trader_statement` |
| `traderRespondedAt` | `trader_responded_at` |
| `adminDecision` | `admin_decision` |
| `adminNote` | `admin_note` |
| `adminResolvedBy` | `admin_resolved_by` |
| `adminResolvedAt` | `admin_resolved_at` |
| `balanceAdjusted` | `balance_adjusted` |
| `adjustmentAmount` | `adjustment_amount` |
| `slaDeadline` | `sla_deadline` |
| `isEscalated` | `is_escalated` |
| `senderRole` | `sender_role` |
| `senderName` | `sender_name` |
| `attachmentUrl` | `attachment_url` |
| `disputeId` | `dispute_id` |
| `payinId` | `payin_id` |
| `payoutId` | `payout_id` |
| `payoutRequestId` | `payout_request_id` |
| `selectedUpiId` | `selected_upi_id` |
| `selectedUpi` | `selected_upi` |
| `selectedTraderId` | `selected_trader_id` |
| `selectedTraderName` | `selected_trader_name` |
| `eventType` | `event_type` |
| `entityType` | `entity_type` |
| `entityId` | `entity_id` |
| `entityName` | `entity_name` |
| `performedBy` | `performed_by` |
| `performedByName` | `performed_by_name` |
| `performedByRole` | `performed_by_role` |
| `performedByIp` | `performed_by_ip` |
| `balanceBefore` | `balance_before` |
| `balanceAfter` | `balance_after` |
| `requiresReview` | `requires_review` |
| `profileId` | `profile_id` |
| `displayName` | `display_name` |
| `avgResponseTime` | `avg_response_time` |
| `lastCheckedAt` | `last_checked_at` |
| `upiPoolId` | `upi_pool_id` |

## Common Query Patterns

### Fetch all with order
```js
// Firebase:
const q = query(collection(db, 'payin'), orderBy('createdAt', 'desc'), limit(50));
const snap = await getDocs(q);
const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));

// Supabase:
const { data, error } = await supabase
  .from('payins')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(50);
```

### Fetch with filters
```js
// Firebase:
const q = query(collection(db, 'payin'), where('status', '==', 'completed'), where('merchantId', '==', id));
const snap = await getDocs(q);

// Supabase:
const { data, error } = await supabase
  .from('payins')
  .select('*')
  .eq('status', 'completed')
  .eq('merchant_id', id);
```

### Fetch single doc by ID
```js
// Firebase:
const docSnap = await getDoc(doc(db, 'trader', traderId));
const data = docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;

// Supabase:
const { data, error } = await supabase
  .from('traders')
  .select('*')
  .eq('id', traderId)
  .single();
```

### Update document
```js
// Firebase:
await updateDoc(doc(db, 'trader', traderId), { isActive: true, balance: 1000 });

// Supabase:
await supabase.from('traders').update({ is_active: true, balance: 1000 }).eq('id', traderId);
```

### Create document
```js
// Firebase:
await addDoc(collection(db, 'payin'), { amount: 100, status: 'pending', createdAt: serverTimestamp() });

// Supabase (auto generates id and created_at):
await supabase.from('payins').insert({ amount: 100, status: 'pending' });
```

### Delete document
```js
// Firebase:
await deleteDoc(doc(db, 'upiPool', upiId));

// Supabase:
await supabase.from('upi_pool').delete().eq('id', upiId);
```

### Real-time listeners (onSnapshot → polling or Supabase Realtime)
```js
// Firebase:
const unsub = onSnapshot(query(collection(db, 'payin'), where('status', '==', 'pending')), (snap) => {
  setData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
});

// Supabase option 1: Simple fetch (replace real-time with manual refresh / interval)
const fetchData = async () => {
  const { data } = await supabase.from('payins').select('*').eq('status', 'pending');
  setData(data || []);
};
useEffect(() => { fetchData(); }, []);

// Supabase option 2: Supabase Realtime (if needed)
const channel = supabase.channel('payins-changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'payins' }, (payload) => {
    fetchData(); // re-fetch on change
  })
  .subscribe();
return () => supabase.removeChannel(channel);
```

### Pagination (startAfter → range)
```js
// Firebase cursor-based:
const q = query(collection(db, 'payin'), orderBy('createdAt', 'desc'), startAfter(lastDoc), limit(20));

// Supabase offset-based:
const { data } = await supabase
  .from('payins')
  .select('*', { count: 'exact' })
  .order('created_at', { ascending: false })
  .range(page * pageSize, (page + 1) * pageSize - 1);
```

### Count query
```js
// Firebase: snap.size or snap.docs.length

// Supabase:
const { count } = await supabase.from('payins').select('*', { count: 'exact', head: true }).eq('status', 'pending');
```

### Batch writes
```js
// Firebase:
const batch = writeBatch(db);
batch.update(doc(db, 'trader', id), { balance: newBal });
batch.set(doc(collection(db, 'adminLog')), logEntry);
await batch.commit();

// Supabase (separate calls, or use RPC for transactions):
await supabase.from('traders').update({ balance: newBal }).eq('id', id);
await supabase.from('admin_logs').insert(logEntry);
```

### Get current user
```js
// Firebase:
const user = auth.currentUser; // or getAuth().currentUser
const uid = user.uid;

// Supabase:
const { data: { user } } = await supabase.auth.getUser();
const uid = user.id;
// For sync access (no network call):
const { data: { session } } = await supabase.auth.getSession();
const uid = session?.user?.id;
```

### Date handling
```js
// Firebase Timestamp → JS Date:
const date = doc.data().createdAt?.toDate();

// Supabase returns ISO strings — just use directly:
const date = new Date(row.created_at);
// Or display directly since most date formatters handle ISO strings
```

### Firestore doc ID
```js
// Firebase: doc.id is the document ID
// Supabase: row.id is the UUID primary key (already in the data)
// No need to spread { id: doc.id, ...doc.data() } — just use data directly
```

## CRITICAL RULES
1. **Keep ALL UI exactly the same** — only change data fetching/mutations
2. **snake_case for all column names** in Supabase queries
3. **Supabase returns data directly** — no need for `.data()` or `.exists()` checks
4. **Supabase errors come as `{ data, error }`** — always check `error`
5. **Don't remove firebase.js import from files** — other files may still need it (remove ONLY the firebase imports used in that specific file)
6. **Replace onSnapshot with useEffect fetch** — for now, simple polling/manual refresh. Can add Supabase Realtime later.
7. **Firestore serverTimestamp() not needed** — Supabase auto-sets `created_at`/`updated_at` via defaults and triggers
8. **The supabase client is at `src/supabase.js`** — import as `import { supabase } from '../../supabase'` (adjust depth)
