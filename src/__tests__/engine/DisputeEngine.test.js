/**
 * Dispute Engine Tests
 * Tests the dispute resolution logic and balance calculations
 * in functions/engine/DisputeEngine.js
 *
 * Uses an in-memory Firestore mock so no real DB is needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── In-memory Firestore mock ────────────────────────────────────────────────

function createMockFirestore(initialData = {}) {
  // initialData: { collectionName: { docId: { ...fields } } }
  const store = {};

  // Deep-clone initial data into store
  for (const [col, docs] of Object.entries(initialData)) {
    store[col] = {};
    for (const [id, data] of Object.entries(docs)) {
      store[col][id] = { ...data };
    }
  }

  function getCollection(name) {
    if (!store[name]) store[name] = {};
    return store[name];
  }

  // A tiny mock that satisfies the DisputeEngine's usage patterns
  const db = {
    collection: (colName) => ({
      doc: (docId) => ({
        get: async () => {
          const col = getCollection(colName);
          const data = col[docId];
          return {
            exists: !!data,
            data: () => (data ? { ...data } : undefined),
            id: docId,
          };
        },
        update: async (updates) => {
          const col = getCollection(colName);
          if (!col[docId]) col[docId] = {};
          Object.assign(col[docId], updates);
        },
        set: async (data) => {
          getCollection(colName)[docId] = { ...data };
        },
      }),
      add: async (data) => {
        const col = getCollection(colName);
        const id = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        col[id] = { ...data };
        return { id };
      },
      where: () => ({
        limit: () => ({
          get: async () => ({
            empty: true,
            docs: [],
            forEach: () => {},
          }),
        }),
        get: async () => ({
          empty: true,
          docs: [],
          forEach: () => {},
        }),
      }),
      orderBy: () => ({
        limit: () => ({
          get: async () => ({
            empty: true,
            docs: [],
            forEach: () => {},
          }),
        }),
      }),
      get: async () => {
        const col = getCollection(colName);
        const docs = Object.entries(col).map(([id, data]) => ({
          id,
          data: () => ({ ...data }),
        }));
        return {
          forEach: (fn) => docs.forEach(fn),
          docs,
          size: docs.length,
        };
      },
    }),
    _store: store, // exposed for test assertions
  };

  return db;
}

// ── Import DisputeEngine (CJS) ──────────────────────────────────────────────

const DisputeEngine = (await import('../../../functions/engine/DisputeEngine.js')).default;

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DisputeEngine — Payin resolution balance logic', () => {
  it('Scenario 1: trader_accepted + admin_approved → credit trader balance', async () => {
    const db = createMockFirestore({
      disputes: {
        d1: {
          type: 'payin',
          amount: 5000,
          traderId: 'T1',
          merchantId: 'M1',
          status: 'trader_accepted',
        },
      },
      trader: {
        T1: { name: 'Alice', balance: 10000 },
      },
      system: {
        disputeEngineConfig: null,
      },
    });

    const engine = new DisputeEngine(db);
    const result = await engine.adminResolve('d1', 'approve', 'Looks good', 'admin1');

    expect(result.success).toBe(true);
    expect(result.balanceChanges).toHaveLength(1);

    const change = result.balanceChanges[0];
    expect(change.entity).toBe('trader');
    expect(change.entityId).toBe('T1');
    expect(change.type).toBe('credit');
    expect(change.amount).toBe(5000);
    expect(change.previousBalance).toBe(10000);
    expect(change.newBalance).toBe(15000);

    // Verify actual store was updated
    const traderDoc = await db.collection('trader').doc('T1').get();
    expect(traderDoc.data().balance).toBe(15000);
  });

  it('Scenario 2: trader_accepted + admin_rejected → NO balance change', async () => {
    const db = createMockFirestore({
      disputes: {
        d2: {
          type: 'payin',
          amount: 3000,
          traderId: 'T1',
          merchantId: 'M1',
          status: 'trader_accepted',
        },
      },
      trader: {
        T1: { name: 'Alice', balance: 10000 },
      },
      system: {},
    });

    const engine = new DisputeEngine(db);
    const result = await engine.adminResolve('d2', 'reject', 'Not convinced', 'admin1');

    expect(result.success).toBe(true);
    expect(result.balanceChanges).toHaveLength(0);

    // Balance unchanged
    const traderDoc = await db.collection('trader').doc('T1').get();
    expect(traderDoc.data().balance).toBe(10000);
  });

  it('Scenario 3: trader_rejected + admin_approved → NO balance change (trader was right)', async () => {
    const db = createMockFirestore({
      disputes: {
        d3: {
          type: 'payin',
          amount: 7000,
          traderId: 'T1',
          merchantId: 'M1',
          status: 'trader_rejected',
        },
      },
      trader: {
        T1: { name: 'Alice', balance: 10000 },
      },
      system: {},
    });

    const engine = new DisputeEngine(db);
    const result = await engine.adminResolve('d3', 'approve', 'Trader confirmed no receipt', 'admin1');

    expect(result.success).toBe(true);
    expect(result.balanceChanges).toHaveLength(0);

    const traderDoc = await db.collection('trader').doc('T1').get();
    expect(traderDoc.data().balance).toBe(10000);
  });

  it('Scenario 4: trader_rejected + admin_rejected → force credit to trader', async () => {
    const db = createMockFirestore({
      disputes: {
        d4: {
          type: 'payin',
          amount: 4000,
          traderId: 'T1',
          merchantId: 'M1',
          status: 'trader_rejected',
        },
      },
      trader: {
        T1: { name: 'Alice', balance: 10000 },
      },
      system: {},
    });

    const engine = new DisputeEngine(db);
    const result = await engine.adminResolve('d4', 'reject', 'Evidence shows payment received', 'admin1');

    expect(result.success).toBe(true);
    expect(result.balanceChanges).toHaveLength(1);

    const change = result.balanceChanges[0];
    expect(change.type).toBe('credit');
    expect(change.amount).toBe(4000);
    expect(change.previousBalance).toBe(10000);
    expect(change.newBalance).toBe(14000);
    expect(change.reason).toContain('overrode');

    const traderDoc = await db.collection('trader').doc('T1').get();
    expect(traderDoc.data().balance).toBe(14000);
  });
});

describe('DisputeEngine — Payout resolution balance logic', () => {
  it('Scenario 1: trader_accepted + admin_approved → deduct amount + commission', async () => {
    const db = createMockFirestore({
      disputes: {
        d5: {
          type: 'payout',
          amount: 10000,
          traderId: 'T2',
          merchantId: 'M1',
          status: 'trader_accepted',
        },
      },
      trader: {
        T2: { name: 'Bob', balance: 50000, payoutCommission: 2 }, // 2%
      },
      system: {},
    });

    const engine = new DisputeEngine(db);
    const result = await engine.adminResolve('d5', 'approve', 'Confirmed not sent', 'admin1');

    expect(result.success).toBe(true);
    expect(result.balanceChanges).toHaveLength(1);

    const change = result.balanceChanges[0];
    expect(change.entity).toBe('trader');
    expect(change.type).toBe('debit');
    // amount + 2% commission = 10000 + 200 = 10200
    expect(change.amount).toBe(10200);
    expect(change.breakdown.payoutAmount).toBe(10000);
    expect(change.breakdown.commission).toBe(200);
    expect(change.breakdown.commissionRate).toBe(2);
    expect(change.previousBalance).toBe(50000);
    expect(change.newBalance).toBe(39800);

    const traderDoc = await db.collection('trader').doc('T2').get();
    expect(traderDoc.data().balance).toBe(39800);
  });

  it('Scenario 2: trader_rejected (proof) + admin_approved → NO deduction', async () => {
    const db = createMockFirestore({
      disputes: {
        d6: {
          type: 'payout',
          amount: 8000,
          traderId: 'T2',
          merchantId: 'M1',
          status: 'trader_rejected',
        },
      },
      trader: {
        T2: { name: 'Bob', balance: 50000, payoutCommission: 2 },
      },
      system: {},
    });

    const engine = new DisputeEngine(db);
    const result = await engine.adminResolve('d6', 'approve', 'Proof looks valid', 'admin1');

    expect(result.success).toBe(true);
    expect(result.balanceChanges).toHaveLength(0);

    const traderDoc = await db.collection('trader').doc('T2').get();
    expect(traderDoc.data().balance).toBe(50000);
  });

  it('Scenario 3: trader_rejected (proof) + admin_rejected → deduct (proof invalid)', async () => {
    const db = createMockFirestore({
      disputes: {
        d7: {
          type: 'payout',
          amount: 6000,
          traderId: 'T2',
          merchantId: 'M1',
          status: 'trader_rejected',
        },
      },
      trader: {
        T2: { name: 'Bob', balance: 50000, payoutCommission: 1.5 }, // 1.5%
      },
      system: {},
    });

    const engine = new DisputeEngine(db);
    const result = await engine.adminResolve('d7', 'reject', 'Proof is fake', 'admin1');

    expect(result.success).toBe(true);
    expect(result.balanceChanges).toHaveLength(1);

    const change = result.balanceChanges[0];
    expect(change.type).toBe('debit');
    // 6000 + (6000 * 1.5 / 100) = 6000 + 90 = 6090
    expect(change.amount).toBe(6090);
    expect(change.previousBalance).toBe(50000);
    expect(change.newBalance).toBe(43910);
    expect(change.reason).toContain('rejected trader proof');
  });

  it('Scenario 4: trader_accepted + admin_rejected → NO deduction (override)', async () => {
    const db = createMockFirestore({
      disputes: {
        d8: {
          type: 'payout',
          amount: 5000,
          traderId: 'T2',
          merchantId: 'M1',
          status: 'trader_accepted',
        },
      },
      trader: {
        T2: { name: 'Bob', balance: 50000, payoutCommission: 2 },
      },
      system: {},
    });

    const engine = new DisputeEngine(db);
    const result = await engine.adminResolve('d8', 'reject', 'Payout was actually sent', 'admin1');

    expect(result.success).toBe(true);
    expect(result.balanceChanges).toHaveLength(0);

    const traderDoc = await db.collection('trader').doc('T2').get();
    expect(traderDoc.data().balance).toBe(50000);
  });
});

describe('DisputeEngine — Status flow transitions', () => {
  it('dispute not found returns error', async () => {
    const db = createMockFirestore({ disputes: {} });
    const engine = new DisputeEngine(db);
    const result = await engine.adminResolve('nonexistent', 'approve', '', 'admin1');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Dispute not found');
  });

  it('admin_approved status is set when admin approves', async () => {
    const db = createMockFirestore({
      disputes: {
        d9: {
          type: 'payin',
          amount: 1000,
          traderId: 'T1',
          merchantId: 'M1',
          status: 'trader_accepted',
        },
      },
      trader: { T1: { name: 'X', balance: 5000 } },
      system: {},
    });

    const engine = new DisputeEngine(db);
    await engine.adminResolve('d9', 'approve', '', 'admin1');

    const doc = await db.collection('disputes').doc('d9').get();
    expect(doc.data().status).toBe('admin_approved');
    expect(doc.data().adminId).toBe('admin1');
  });

  it('admin_rejected status is set when admin rejects', async () => {
    const db = createMockFirestore({
      disputes: {
        d10: {
          type: 'payin',
          amount: 1000,
          traderId: 'T1',
          merchantId: 'M1',
          status: 'trader_rejected',
        },
      },
      trader: { T1: { name: 'X', balance: 5000 } },
      system: {},
    });

    const engine = new DisputeEngine(db);
    await engine.adminResolve('d10', 'reject', '', 'admin1');

    const doc = await db.collection('disputes').doc('d10').get();
    expect(doc.data().status).toBe('admin_rejected');
  });
});

describe('DisputeEngine — processTraderResponse', () => {
  it('payin accept → trader_accepted', async () => {
    const db = createMockFirestore({
      disputes: {
        d11: { type: 'payin', amount: 2000, traderId: 'T1', status: 'routed_to_trader' },
      },
    });

    const engine = new DisputeEngine(db);
    const result = await engine.processTraderResponse('d11', 'accept', 'Received', null);

    expect(result.success).toBe(true);
    expect(result.newStatus).toBe('trader_accepted');

    const doc = await db.collection('disputes').doc('d11').get();
    expect(doc.data().status).toBe('trader_accepted');
  });

  it('payin reject → trader_rejected', async () => {
    const db = createMockFirestore({
      disputes: {
        d12: { type: 'payin', amount: 2000, traderId: 'T1', status: 'routed_to_trader' },
      },
    });

    const engine = new DisputeEngine(db);
    const result = await engine.processTraderResponse('d12', 'reject', 'Not received', 'proof.jpg');

    expect(result.success).toBe(true);
    expect(result.newStatus).toBe('trader_rejected');
  });

  it('payout accept → trader_accepted (admits not sent)', async () => {
    const db = createMockFirestore({
      disputes: {
        d13: { type: 'payout', amount: 3000, traderId: 'T1', status: 'routed_to_trader' },
      },
    });

    const engine = new DisputeEngine(db);
    const result = await engine.processTraderResponse('d13', 'accept', 'Not sent', null);

    expect(result.success).toBe(true);
    expect(result.newStatus).toBe('trader_accepted');
    expect(result.traderAction).toContain('NOT sent');
  });

  it('payout reject → trader_rejected (provides proof)', async () => {
    const db = createMockFirestore({
      disputes: {
        d14: { type: 'payout', amount: 3000, traderId: 'T1', status: 'routed_to_trader' },
      },
    });

    const engine = new DisputeEngine(db);
    const result = await engine.processTraderResponse('d14', 'reject', 'Sent it', 'screenshot.png');

    expect(result.success).toBe(true);
    expect(result.newStatus).toBe('trader_rejected');
    expect(result.traderAction).toContain('WAS sent');
  });

  it('dispute not found returns error', async () => {
    const db = createMockFirestore({ disputes: {} });
    const engine = new DisputeEngine(db);
    const result = await engine.processTraderResponse('missing', 'accept', '', null);
    expect(result.success).toBe(false);
  });
});

describe('DisputeEngine — Resolution text', () => {
  it('payin approved gives correct resolution text', async () => {
    const db = createMockFirestore({
      disputes: {
        d15: { type: 'payin', amount: 1000, traderId: 'T1', merchantId: 'M1', status: 'trader_accepted' },
      },
      trader: { T1: { name: 'X', balance: 5000 } },
      system: {},
    });

    const engine = new DisputeEngine(db);
    const result = await engine.adminResolve('d15', 'approve', '', 'admin1');

    expect(result.resolution).toContain('Payin confirmed');
    expect(result.resolution).toContain('credited');
  });

  it('payout deduction gives correct resolution text', async () => {
    const db = createMockFirestore({
      disputes: {
        d16: { type: 'payout', amount: 5000, traderId: 'T2', merchantId: 'M1', status: 'trader_accepted' },
      },
      trader: { T2: { name: 'Bob', balance: 20000, payoutCommission: 1 } },
      system: {},
    });

    const engine = new DisputeEngine(db);
    const result = await engine.adminResolve('d16', 'approve', '', 'admin1');

    expect(result.resolution).toContain('NOT sent');
    expect(result.resolution).toContain('deducted');
  });
});
