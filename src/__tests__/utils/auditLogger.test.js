/**
 * Audit Logger Tests
 * Tests the audit logging utility at src/utils/auditLogger.js
 *
 * Since the auditLogger uses Firebase client SDK (ESM imports),
 * we mock the Firebase modules entirely.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Firebase modules ────────────────────────────────────────────────────

// Capture what gets written via addDoc
let lastAddDocData = null;
let addDocShouldFail = false;

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((db, name) => ({ _name: name })),
  addDoc: vi.fn(async (colRef, data) => {
    if (addDocShouldFail) throw new Error('Firestore write failed');
    lastAddDocData = { collection: colRef._name, data };
    return { id: 'mock-doc-id' };
  }),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
}));

vi.mock('../../firebase', () => ({
  db: { _mockDb: true },
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({
    currentUser: {
      uid: 'admin-uid-123',
      email: 'admin@pay2x.com',
      displayName: 'Admin User',
    },
  })),
}));

vi.mock('../../utils/ipCapture', () => ({
  getCachedIP: vi.fn(() => '192.168.1.100'),
}));

// ── Import the module under test (after mocks are in place) ──────────────────

const {
  logAuditEvent,
  logBalanceTopup,
  logBalanceDeduct,
  logDataDeleted,
  logDataExported,
  logUPIEnabled,
  logUPIDisabled,
  logTraderActivated,
  logTraderDeactivated,
  logDisputeResolved,
  logSettingsChanged,
} = await import('../../utils/auditLogger.js');

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  lastAddDocData = null;
  addDocShouldFail = false;
});

describe('logAuditEvent — core function', () => {
  it('creates a log entry with all required fields', async () => {
    const result = await logAuditEvent({
      action: 'test_action',
      category: 'operational',
      entityType: 'trader',
      entityId: 'T1',
      entityName: 'Test Trader',
    });

    expect(result.success).toBe(true);
    expect(lastAddDocData).not.toBeNull();
    expect(lastAddDocData.collection).toBe('adminLog');

    const entry = lastAddDocData.data;
    expect(entry.action).toBe('test_action');
    expect(entry.category).toBe('operational');
    expect(entry.entityType).toBe('trader');
    expect(entry.entityId).toBe('T1');
    expect(entry.entityName).toBe('Test Trader');
  });

  it('includes performer info from auth', async () => {
    await logAuditEvent({ action: 'test', category: 'security' });

    const entry = lastAddDocData.data;
    expect(entry.performedBy).toBe('admin-uid-123');
    expect(entry.performedByName).toBe('admin@pay2x.com');
    expect(entry.performedByIp).toBe('192.168.1.100');
  });

  it('includes timestamp', async () => {
    await logAuditEvent({ action: 'test', category: 'system' });

    const entry = lastAddDocData.data;
    expect(entry.createdAt).toBe('SERVER_TIMESTAMP');
  });

  it('handles missing optional fields gracefully', async () => {
    await logAuditEvent({ action: 'minimal', category: 'system' });

    const entry = lastAddDocData.data;
    expect(entry.entityType).toBeNull();
    expect(entry.entityId).toBeNull();
    expect(entry.entityName).toBeNull();
    expect(entry.balanceBefore).toBeNull();
    expect(entry.balanceAfter).toBeNull();
    expect(entry.severity).toBe('info');
    expect(entry.requiresReview).toBe(false);
    expect(entry.source).toBe('admin_panel');
  });

  it('allows performer override', async () => {
    await logAuditEvent({
      action: 'test',
      category: 'system',
      performedBy: 'custom-uid',
      performedByName: 'Custom User',
      performedByRole: 'superadmin',
    });

    const entry = lastAddDocData.data;
    expect(entry.performedBy).toBe('custom-uid');
    expect(entry.performedByName).toBe('Custom User');
    expect(entry.performedByRole).toBe('superadmin');
  });

  it('returns success:false without throwing on Firestore failure', async () => {
    addDocShouldFail = true;

    const result = await logAuditEvent({ action: 'fail_test', category: 'system' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Firestore write failed');
  });

  it('throws if action is missing', async () => {
    const result = await logAuditEvent({ category: 'system' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Action is required');
  });

  it('throws if category is missing', async () => {
    const result = await logAuditEvent({ action: 'test' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Category is required');
  });
});

describe('logBalanceTopup', () => {
  it('creates correct audit entry with amount, before/after', async () => {
    await logBalanceTopup('T1', 'Alice', 5000, 10000, 15000, 'Manual topup');

    expect(lastAddDocData).not.toBeNull();
    const entry = lastAddDocData.data;

    expect(entry.action).toBe('trader_balance_topup');
    expect(entry.category).toBe('financial');
    expect(entry.entityType).toBe('trader');
    expect(entry.entityId).toBe('T1');
    expect(entry.entityName).toBe('Alice');
    expect(entry.balanceBefore).toBe(10000);
    expect(entry.balanceAfter).toBe(15000);
    expect(entry.details.amount).toBe(5000);
    expect(entry.details.note).toBe('Manual topup');
    expect(entry.severity).toBe('info');
  });
});

describe('logBalanceDeduct', () => {
  it('creates deduction entry with warning severity', async () => {
    await logBalanceDeduct('T2', 'Bob', 3000, 20000, 17000, 'Dispute deduction');

    const entry = lastAddDocData.data;
    expect(entry.action).toBe('trader_balance_deduct');
    expect(entry.severity).toBe('warning');
    expect(entry.balanceBefore).toBe(20000);
    expect(entry.balanceAfter).toBe(17000);
    expect(entry.details.amount).toBe(3000);
  });
});

describe('logDataDeleted', () => {
  it('includes entity type and ID with critical severity', async () => {
    await logDataDeleted('trader', 'T5', 'Deleted Trader', 'Compliance request');

    const entry = lastAddDocData.data;
    expect(entry.action).toBe('data_deleted');
    expect(entry.category).toBe('security');
    expect(entry.entityType).toBe('trader');
    expect(entry.entityId).toBe('T5');
    expect(entry.entityName).toBe('Deleted Trader');
    expect(entry.severity).toBe('critical');
    expect(entry.requiresReview).toBe(true);
    expect(entry.details.note).toBe('Compliance request');
  });

  it('uses default message when no reason provided', async () => {
    await logDataDeleted('merchant', 'M3', 'Old Merchant');

    const entry = lastAddDocData.data;
    expect(entry.details.note).toContain('merchant permanently deleted');
  });
});

describe('logDataExported', () => {
  it('flags large exports for review', async () => {
    await logDataExported('transactions', 15000, { dateRange: '2025-01-01 to 2025-12-31' });

    const entry = lastAddDocData.data;
    expect(entry.action).toBe('data_exported');
    expect(entry.requiresReview).toBe(true); // > 10000 records
    expect(entry.details.metadata.recordCount).toBe(15000);
  });

  it('does not flag small exports', async () => {
    await logDataExported('traders', 50, {});

    const entry = lastAddDocData.data;
    expect(entry.requiresReview).toBe(false);
  });
});

describe('logUPIEnabled / logUPIDisabled', () => {
  it('logUPIEnabled records before=disabled, after=active', async () => {
    await logUPIEnabled('upi-001', 'test@upi', 'M1', 'Reactivated');

    const entry = lastAddDocData.data;
    expect(entry.action).toBe('upi_enabled');
    expect(entry.details.before).toBe('disabled');
    expect(entry.details.after).toBe('active');
    expect(entry.details.metadata.merchantId).toBe('M1');
  });

  it('logUPIDisabled records before=active, after=disabled', async () => {
    await logUPIDisabled('upi-002', 'disabled@upi', 'M2', 'Suspicious activity');

    const entry = lastAddDocData.data;
    expect(entry.action).toBe('upi_disabled');
    expect(entry.details.before).toBe('active');
    expect(entry.details.after).toBe('disabled');
  });
});

describe('logDisputeResolved', () => {
  it('records dispute outcome with metadata', async () => {
    await logDisputeResolved('D1', 'payin', 'M1', 'T1', 'approved', 'Verified');

    const entry = lastAddDocData.data;
    expect(entry.action).toBe('dispute_resolved');
    expect(entry.category).toBe('operational');
    expect(entry.entityType).toBe('dispute');
    expect(entry.entityId).toBe('D1');
    expect(entry.details.after).toBe('approved');
    expect(entry.details.metadata.merchantId).toBe('M1');
    expect(entry.details.metadata.traderId).toBe('T1');
    expect(entry.details.metadata.type).toBe('payin');
  });
});

describe('logSettingsChanged', () => {
  it('records before/after with review flag', async () => {
    await logSettingsChanged('maxDailyLimit', 50000, 100000, 'Increased for holiday');

    const entry = lastAddDocData.data;
    expect(entry.action).toBe('settings_changed');
    expect(entry.category).toBe('system');
    expect(entry.details.before).toBe(50000);
    expect(entry.details.after).toBe(100000);
    expect(entry.details.note).toBe('Increased for holiday');
    expect(entry.requiresReview).toBe(true);
  });
});

describe('All log functions include timestamp and actor', () => {
  const logFunctions = [
    ['logBalanceTopup', () => logBalanceTopup('T1', 'X', 100, 0, 100, '')],
    ['logTraderActivated', () => logTraderActivated('T1', 'X', 'reason')],
    ['logTraderDeactivated', () => logTraderDeactivated('T1', 'X', 'reason')],
    ['logDataDeleted', () => logDataDeleted('trader', 'T1', 'X')],
  ];

  it.each(logFunctions)('%s includes createdAt and performedBy', async (name, fn) => {
    await fn();

    const entry = lastAddDocData.data;
    expect(entry.createdAt).toBe('SERVER_TIMESTAMP');
    expect(entry.performedBy).toBeTruthy();
    expect(entry.performedByName).toBeTruthy();
  });
});
