/**
 * UPI Scorer Tests
 * Tests the scoring logic in functions/engine/scorers/UpiScorer.js
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Import the CJS module — Vitest handles CJS ↔ ESM interop
const { scoreUpi, scoreAllUpis, getAmountTier } = await import('../../../functions/engine/scorers/UpiScorer.js');

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Standard scoring config matching production defaults */
function makeConfig(overrides = {}) {
  return {
    weights: {
      successRate: 25,
      dailyLimitLeft: 20,
      cooldown: 15,
      amountMatch: 15,
      traderBalance: 10,
      bankHealth: 5,
      timeWindow: 5,
    },
    amountTiers: {
      low:    { max: 5000 },
      medium: { max: 25000 },
      high:   { max: Infinity },
    },
    cooldownMinutes: 10,
    maxDailyTxnsPerUpi: 100,
    enableRandomness: false,   // Deterministic by default in tests
    randomnessFactor: 0.1,
    ...overrides,
  };
}

/** Build a UPI fixture */
function makeUpi(overrides = {}) {
  return {
    upiId: 'test@upi',
    bank: 'HDFC',
    dailyLimit: 100000,
    amountTier: 'medium',
    performance: { successRate: 95 },
    stats: {
      todayVolume: 20000,
      todayCount: 10,
      lastUsedAt: null,
      lastHourFailures: 0,
    },
    traderId: 'trader1',
    ...overrides,
  };
}

function makeContext(overrides = {}) {
  return {
    traders: {
      trader1: { balance: 50000 },
    },
    bankHealth: {
      HDFC: { status: 'healthy' },
    },
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('getAmountTier', () => {
  const config = makeConfig();

  it('classifies low amounts', () => {
    expect(getAmountTier(1000, config)).toBe('low');
    expect(getAmountTier(5000, config)).toBe('low');
  });

  it('classifies medium amounts', () => {
    expect(getAmountTier(5001, config)).toBe('medium');
    expect(getAmountTier(25000, config)).toBe('medium');
  });

  it('classifies high amounts', () => {
    expect(getAmountTier(25001, config)).toBe('high');
    expect(getAmountTier(100000, config)).toBe('high');
  });
});

describe('scoreUpi — Success Rate factor', () => {
  it('UPI with 100% success rate scores higher than one with 50%', () => {
    const config = makeConfig();
    const ctx = makeContext();

    const perfect = scoreUpi(makeUpi({ performance: { successRate: 100 } }), 5000, ctx, config);
    const half    = scoreUpi(makeUpi({ performance: { successRate: 50 } }),  5000, ctx, config);

    expect(perfect.breakdown.successRate).toBeGreaterThan(half.breakdown.successRate);
    expect(perfect.score).toBeGreaterThan(half.score);
  });

  it('success rate factor stays within 0–weight range', () => {
    const config = makeConfig();
    const ctx = makeContext();

    const best  = scoreUpi(makeUpi({ performance: { successRate: 100 } }), 5000, ctx, config);
    const worst = scoreUpi(makeUpi({ performance: { successRate: 0 } }),   5000, ctx, config);

    expect(best.breakdown.successRate).toBeLessThanOrEqual(config.weights.successRate);
    expect(best.breakdown.successRate).toBeGreaterThanOrEqual(0);
    expect(worst.breakdown.successRate).toBe(0);
  });
});

describe('scoreUpi — Daily Limit Headroom factor', () => {
  it('UPI near its daily limit scores lower', () => {
    const config = makeConfig();
    const ctx = makeContext();

    const fresh = scoreUpi(makeUpi({ stats: { todayVolume: 0, todayCount: 0, lastHourFailures: 0 } }),      5000, ctx, config);
    const near  = scoreUpi(makeUpi({ stats: { todayVolume: 95000, todayCount: 50, lastHourFailures: 0 } }), 5000, ctx, config);

    expect(fresh.breakdown.dailyLimitLeft).toBeGreaterThan(near.breakdown.dailyLimitLeft);
  });

  it('UPI that cannot handle the amount gets 0 headroom score', () => {
    const config = makeConfig();
    const ctx = makeContext();

    // todayVolume=99000, dailyLimit=100000, headroom=1000, but amount=5000
    const overloaded = scoreUpi(
      makeUpi({ stats: { todayVolume: 99000, todayCount: 90, lastHourFailures: 0 } }),
      5000, ctx, config,
    );

    expect(overloaded.breakdown.dailyLimitLeft).toBe(0);
  });
});

describe('scoreUpi — Cooldown factor', () => {
  it('recently used UPI scores lower on cooldown', () => {
    const config = makeConfig({ cooldownMinutes: 10 });
    const ctx = makeContext();

    // Last used 1 minute ago
    const recent = makeUpi({
      stats: {
        todayVolume: 5000,
        todayCount: 5,
        lastHourFailures: 0,
        lastUsedAt: { toMillis: () => Date.now() - 1 * 60000 },
      },
    });

    // Last used 60 minutes ago
    const rested = makeUpi({
      stats: {
        todayVolume: 5000,
        todayCount: 5,
        lastHourFailures: 0,
        lastUsedAt: { toMillis: () => Date.now() - 60 * 60000 },
      },
    });

    const recentScore = scoreUpi(recent, 3000, ctx, config);
    const restedScore = scoreUpi(rested, 3000, ctx, config);

    expect(restedScore.breakdown.cooldown).toBeGreaterThan(recentScore.breakdown.cooldown);
  });
});

describe('scoreUpi — Failure Penalties', () => {
  it('UPI with recent failures gets penalised', () => {
    const config = makeConfig();
    const ctx = makeContext();

    const clean  = scoreUpi(makeUpi({ stats: { todayVolume: 5000, todayCount: 5, lastHourFailures: 0 } }),  3000, ctx, config);
    const failed = scoreUpi(makeUpi({ stats: { todayVolume: 5000, todayCount: 5, lastHourFailures: 3 } }),  3000, ctx, config);

    // 3 failures → -30 penalty
    expect(failed.breakdown.penalties).toBe(-30);
    expect(clean.breakdown.penalties).toBe(0);
    expect(clean.score).toBeGreaterThan(failed.score);
  });

  it('1 failure = -5, 2 failures = -15, 3+ failures = -30', () => {
    const config = makeConfig();
    const ctx = makeContext();

    const score1 = scoreUpi(makeUpi({ stats: { todayVolume: 0, todayCount: 0, lastHourFailures: 1 } }), 3000, ctx, config);
    const score2 = scoreUpi(makeUpi({ stats: { todayVolume: 0, todayCount: 0, lastHourFailures: 2 } }), 3000, ctx, config);
    const score3 = scoreUpi(makeUpi({ stats: { todayVolume: 0, todayCount: 0, lastHourFailures: 3 } }), 3000, ctx, config);

    expect(score1.breakdown.penalties).toBe(-5);
    expect(score2.breakdown.penalties).toBe(-15);
    expect(score3.breakdown.penalties).toBe(-30);
  });
});

describe('scoreUpi — Amount Tier Match', () => {
  it('matching tier gets full score, mismatched tier gets 40%', () => {
    const config = makeConfig();
    const ctx = makeContext();

    // Amount 10000 → medium tier. UPI tier = medium → match
    const matched = scoreUpi(makeUpi({ amountTier: 'medium' }), 10000, ctx, config);
    // UPI tier = high → mismatch
    const mismatched = scoreUpi(makeUpi({ amountTier: 'high' }), 10000, ctx, config);

    expect(matched.breakdown.amountMatch).toBe(config.weights.amountMatch);
    expect(mismatched.breakdown.amountMatch).toBeCloseTo(config.weights.amountMatch * 0.4);
  });
});

describe('scoreUpi — All factors in valid range', () => {
  it('every individual factor is between 0 and its max weight', () => {
    const config = makeConfig();
    const ctx = makeContext();
    const result = scoreUpi(makeUpi(), 10000, ctx, config);
    const w = config.weights;

    expect(result.breakdown.successRate).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.successRate).toBeLessThanOrEqual(w.successRate);

    expect(result.breakdown.dailyLimitLeft).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.dailyLimitLeft).toBeLessThanOrEqual(w.dailyLimitLeft);

    expect(result.breakdown.cooldown).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.cooldown).toBeLessThanOrEqual(w.cooldown);

    expect(result.breakdown.amountMatch).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.amountMatch).toBeLessThanOrEqual(w.amountMatch);

    expect(result.breakdown.traderBalance).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.traderBalance).toBeLessThanOrEqual(w.traderBalance);

    expect(result.breakdown.bankHealth).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.bankHealth).toBeLessThanOrEqual(w.bankHealth);

    expect(result.breakdown.timeWindow).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.timeWindow).toBeLessThanOrEqual(w.timeWindow);
  });

  it('total score is non-negative', () => {
    const config = makeConfig();
    const ctx = makeContext();
    const result = scoreUpi(makeUpi(), 10000, ctx, config);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});

describe('scoreUpi — Brand new UPI (no stats)', () => {
  it('still returns a valid score with default success rate of 80%', () => {
    const config = makeConfig();
    const ctx = makeContext();

    const brandNew = makeUpi({
      performance: {},   // no successRate
      stats: {},         // no stats at all
    });

    const result = scoreUpi(brandNew, 5000, ctx, config);

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    // Default 80% → breakdown.successRate = 0.8 * 25 = 20
    expect(result.breakdown.successRate).toBe(20);
  });
});

describe('scoreUpi — Bank Health', () => {
  it('degraded bank scores lower than healthy', () => {
    const config = makeConfig();

    const healthyCtx  = makeContext({ bankHealth: { HDFC: { status: 'healthy' } } });
    const degradedCtx = makeContext({ bankHealth: { HDFC: { status: 'degraded' } } });

    const healthy  = scoreUpi(makeUpi(), 5000, healthyCtx, config);
    const degraded = scoreUpi(makeUpi(), 5000, degradedCtx, config);

    expect(healthy.breakdown.bankHealth).toBeGreaterThan(degraded.breakdown.bankHealth);
  });
});

describe('scoreUpi — Overuse Penalty', () => {
  it('UPI at 90%+ of max daily txns gets -20 penalty', () => {
    const config = makeConfig({ maxDailyTxnsPerUpi: 100 });
    const ctx = makeContext();

    const overused = scoreUpi(
      makeUpi({ stats: { todayVolume: 5000, todayCount: 95, lastHourFailures: 0 } }),
      3000, ctx, config,
    );

    expect(overused.breakdown.penalties).toBe(-20);
  });

  it('UPI at 70-90% of max daily txns gets -10 penalty', () => {
    const config = makeConfig({ maxDailyTxnsPerUpi: 100 });
    const ctx = makeContext();

    const busy = scoreUpi(
      makeUpi({ stats: { todayVolume: 5000, todayCount: 75, lastHourFailures: 0 } }),
      3000, ctx, config,
    );

    expect(busy.breakdown.penalties).toBe(-10);
  });
});

describe('scoreAllUpis', () => {
  it('returns scored UPIs sorted descending by score', () => {
    const config = makeConfig();
    const ctx = makeContext();

    const upis = [
      makeUpi({ upiId: 'low@upi',  performance: { successRate: 30 } }),
      makeUpi({ upiId: 'high@upi', performance: { successRate: 100 } }),
      makeUpi({ upiId: 'mid@upi',  performance: { successRate: 70 } }),
    ];

    const results = scoreAllUpis(upis, 5000, ctx, config);

    expect(results[0].upiId).toBe('high@upi');
    expect(results[results.length - 1].upiId).toBe('low@upi');
    // Verify descending order
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });
});

describe('scoreUpi — Randomness', () => {
  it('with randomness enabled, adds a randomBoost field', () => {
    const config = makeConfig({ enableRandomness: true, randomnessFactor: 0.1 });
    const ctx = makeContext();

    const result = scoreUpi(makeUpi(), 5000, ctx, config);
    expect(result.breakdown).toHaveProperty('randomBoost');
  });

  it('with randomness disabled, no randomBoost field', () => {
    const config = makeConfig({ enableRandomness: false });
    const ctx = makeContext();

    const result = scoreUpi(makeUpi(), 5000, ctx, config);
    expect(result.breakdown).not.toHaveProperty('randomBoost');
  });
});
