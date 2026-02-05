/**
 * Audit Logger Tests
 * Tests the audit logging utility at src/utils/auditLogger.js
 *
 * The auditLogger now uses Supabase (not Firebase).
 * We mock the Supabase client.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Supabase ────────────────────────────────────────────────────────────

let lastInsertData = null;
let insertShouldFail = false;

const mockSupabase = {
  auth: {
    getUser: vi.fn(async () => ({
      data: {
        user: {
          id: 'admin-uid-123',
          email: 'admin@pay2x.com',
          user_metadata: { display_name: 'Admin User' },
        },
      },
    })),
  },
  from: vi.fn(() => ({
    insert: vi.fn(async (data) => {
      if (insertShouldFail) return { error: { message: 'Supabase write failed' } };
      lastInsertData = { data };
      return { error: null };
    }),
  })),
};

vi.mock('../../supabase', () => ({
  supabase: mockSupabase,
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
  lastInsertData = null;
  insertShouldFail = false;
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
    expect(lastInsertData).not.toBeNull();

    const entry = lastInsertData.data;
    expect(entry.action).toBe('test_action');
    expect(entry.category).toBe('operational');
    expect(entry.entity_type).toBe('trader');
    expect(entry.entity_id).toBe('T1');
    expect(entry.entity_name).toBe('Test Trader');
  });

  it('includes performer info from auth', async () => {
    await logAuditEvent({ action: 'test', category: 'security' });

    const entry = lastInsertData.data;
    expect(entry.performed_by).toBe('admin-uid-123');
    expect(entry.performed_by_name).toBe('admin@pay2x.com');
    expect(entry.performed_by_ip).toBe('192.168.1.100');
  });

  it('handles missing optional fields gracefully', async () => {
    await logAuditEvent({ action: 'minimal', category: 'system' });

    const entry = lastInsertData.data;
    expect(entry.entity_type).toBeNull();
    expect(entry.entity_id).toBeNull();
    expect(entry.entity_name).toBeNull();
    expect(entry.balance_before).toBeNull();
    expect(entry.balance_after).toBeNull();
    expect(entry.severity).toBe('info');
    expect(entry.requires_review).toBe(false);
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

    const entry = lastInsertData.data;
    expect(entry.performed_by).toBe('custom-uid');
    expect(entry.performed_by_name).toBe('Custom User');
    expect(entry.performed_by_role).toBe('superadmin');
  });

  it('returns success:false without throwing on Supabase failure', async () => {
    insertShouldFail = true;

    const result = await logAuditEvent({ action: 'fail_test', category: 'system' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Supabase write failed');
  });

  it('returns error if action is missing', async () => {
    const result = await logAuditEvent({ category: 'system' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Action is required');
  });

  it('returns error if category is missing', async () => {
    const result = await logAuditEvent({ action: 'test' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Category is required');
  });
});

describe('logBalanceTopup', () => {
  it('creates correct audit entry with amount, before/after', async () => {
    await logBalanceTopup('T1', 'Alice', 5000, 10000, 15000, 'Manual topup');

    expect(lastInsertData).not.toBeNull();
    const entry = lastInsertData.data;

    expect(entry.action).toBe('trader_balance_topup');
    expect(entry.category).toBe('financial');
    expect(entry.entity_type).toBe('trader');
    expect(entry.entity_id).toBe('T1');
    expect(entry.entity_name).toBe('Alice');
    expect(entry.balance_before).toBe(10000);
    expect(entry.balance_after).toBe(15000);
    expect(entry.severity).toBe('info');
  });
});

describe('logBalanceDeduct', () => {
  it('creates deduction entry with warning severity', async () => {
    await logBalanceDeduct('T2', 'Bob', 3000, 20000, 17000, 'Dispute deduction');

    const entry = lastInsertData.data;
    expect(entry.action).toBe('trader_balance_deduct');
    expect(entry.severity).toBe('warning');
    expect(entry.balance_before).toBe(20000);
    expect(entry.balance_after).toBe(17000);
  });
});

describe('logDataDeleted', () => {
  it('includes entity type and ID with critical severity', async () => {
    await logDataDeleted('trader', 'T5', 'Deleted Trader', 'Compliance request');

    const entry = lastInsertData.data;
    expect(entry.action).toBe('data_deleted');
    expect(entry.category).toBe('security');
    expect(entry.entity_type).toBe('trader');
    expect(entry.entity_id).toBe('T5');
    expect(entry.entity_name).toBe('Deleted Trader');
    expect(entry.severity).toBe('critical');
    expect(entry.requires_review).toBe(true);
  });
});

describe('logDataExported', () => {
  it('flags large exports for review', async () => {
    await logDataExported('transactions', 15000, { dateRange: '2025-01-01 to 2025-12-31' });

    const entry = lastInsertData.data;
    expect(entry.action).toBe('data_exported');
    expect(entry.requires_review).toBe(true); // > 10000 records
  });

  it('does not flag small exports', async () => {
    await logDataExported('traders', 50, {});

    const entry = lastInsertData.data;
    expect(entry.requires_review).toBe(false);
  });
});

describe('logUPIEnabled / logUPIDisabled', () => {
  it('logUPIEnabled records correct action', async () => {
    await logUPIEnabled('upi-001', 'test@upi', 'M1', 'Reactivated');

    const entry = lastInsertData.data;
    expect(entry.action).toBe('upi_enabled');
  });

  it('logUPIDisabled records correct action', async () => {
    await logUPIDisabled('upi-002', 'disabled@upi', 'M2', 'Suspicious activity');

    const entry = lastInsertData.data;
    expect(entry.action).toBe('upi_disabled');
  });
});

describe('logDisputeResolved', () => {
  it('records dispute outcome', async () => {
    await logDisputeResolved('D1', 'payin', 'M1', 'T1', 'approved', 'Verified');

    const entry = lastInsertData.data;
    expect(entry.action).toBe('dispute_resolved');
    expect(entry.category).toBe('operational');
    expect(entry.entity_type).toBe('dispute');
    expect(entry.entity_id).toBe('D1');
  });
});

describe('logSettingsChanged', () => {
  it('records setting change with review flag', async () => {
    await logSettingsChanged('maxDailyLimit', 50000, 100000, 'Increased for holiday');

    const entry = lastInsertData.data;
    expect(entry.action).toBe('settings_changed');
    expect(entry.category).toBe('system');
    expect(entry.requires_review).toBe(true);
  });
});

describe('All log functions include timestamp and actor', () => {
  const logFunctions = [
    ['logBalanceTopup', () => logBalanceTopup('T1', 'X', 100, 0, 100, '')],
    ['logTraderActivated', () => logTraderActivated('T1', 'X', 'reason')],
    ['logTraderDeactivated', () => logTraderDeactivated('T1', 'X', 'reason')],
    ['logDataDeleted', () => logDataDeleted('trader', 'T1', 'X')],
  ];

  it.each(logFunctions)('%s includes performed_by', async (name, fn) => {
    await fn();

    const entry = lastInsertData.data;
    expect(entry.performed_by).toBeTruthy();
    expect(entry.performed_by_name).toBeTruthy();
  });
});
