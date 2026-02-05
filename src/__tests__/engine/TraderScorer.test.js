/**
 * Trader Scorer Tests
 * Tests the scoring logic in functions/engine/scorers/TraderScorer.js
 */
import { describe, it, expect, vi } from 'vitest';

const { scoreTrader, scoreAllTraders, getPayoutAmountTier } = await import(
  '../../../functions/engine/scorers/TraderScorer.js'
);

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeConfig(overrides = {}) {
  return {
    weights: {
      successRate: 25,
      speed: 20,
      currentLoad: 15,
      cancelRate: 15,
      cooldown: 10,
      amountTierMatch: 5,
      onlineStatus: 5,
      priority: 5,
    },
    amountTiers: {
      low:    { max: 5000 },
      medium: { max: 25000 },
      high:   { max: Infinity },
    },
    speedBenchmarks: {
      excellent: 5,   // ≤5 min
      good: 15,       // ≤15 min
      acceptable: 30, // ≤30 min
    },
    maxActivePayouts: 10,
    cooldownMinutes: 5,
    cancelThreshold: 5,
    maxDailyPayouts: 50,
    enableRandomness: false,
    randomnessFactor: 0.1,
    ...overrides,
  };
}

function makeTrader(overrides = {}) {
  return {
    id: 'trader1',
    name: 'Test Trader',
    isOnline: true,
    lastActiveAt: { toMillis: () => Date.now() - 60000 }, // 1 min ago
    priority: 'normal',
    payoutStats: {
      totalCompleted: 90,
      totalAttempted: 100,
      totalCancelled: 2,
      avgCompletionMinutes: 8,
      activePayouts: 1,
      todayCount: 10,
      todayCancelled: 0,
      bestAmountTier: 'medium',
      lastAssignedAt: { toMillis: () => Date.now() - 30 * 60000 }, // 30 min ago
    },
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('getPayoutAmountTier', () => {
  const config = makeConfig();

  it('classifies amounts into tiers', () => {
    expect(getPayoutAmountTier(1000, config)).toBe('low');
    expect(getPayoutAmountTier(5000, config)).toBe('low');
    expect(getPayoutAmountTier(5001, config)).toBe('medium');
    expect(getPayoutAmountTier(25000, config)).toBe('medium');
    expect(getPayoutAmountTier(50000, config)).toBe('high');
  });
});

describe('scoreTrader — Success Rate', () => {
  it('higher success rate scores better', () => {
    const config = makeConfig();
    const ctx = {};

    const good = scoreTrader(
      makeTrader({ payoutStats: { ...makeTrader().payoutStats, totalCompleted: 95, totalAttempted: 100 } }),
      10000, ctx, config,
    );
    const poor = scoreTrader(
      makeTrader({ payoutStats: { ...makeTrader().payoutStats, totalCompleted: 50, totalAttempted: 100 } }),
      10000, ctx, config,
    );

    expect(good.breakdown.successRate).toBeGreaterThan(poor.breakdown.successRate);
    expect(good.score).toBeGreaterThan(poor.score);
  });

  it('new trader with no attempts gets default 80% score', () => {
    const config = makeConfig();
    const ctx = {};

    const newTrader = scoreTrader(
      makeTrader({ payoutStats: { ...makeTrader().payoutStats, totalCompleted: 0, totalAttempted: 0 } }),
      10000, ctx, config,
    );

    // 80/100 * 25 = 20
    expect(newTrader.breakdown.successRate).toBe(20);
  });
});

describe('scoreTrader — Online Status', () => {
  it('online trader scores better than offline one', () => {
    const config = makeConfig();
    const ctx = {};

    const online = scoreTrader(
      makeTrader({
        isOnline: true,
        lastActiveAt: { toMillis: () => Date.now() - 60000 }, // 1 min ago
      }),
      10000, ctx, config,
    );
    const offline = scoreTrader(
      makeTrader({
        isOnline: false,
        lastActiveAt: { toMillis: () => Date.now() - 120 * 60000 }, // 2 hours ago
      }),
      10000, ctx, config,
    );

    expect(online.breakdown.onlineStatus).toBeGreaterThan(offline.breakdown.onlineStatus);
  });

  it('offline trader gets 0 online status score', () => {
    const config = makeConfig();
    const ctx = {};

    const offline = scoreTrader(
      makeTrader({
        isOnline: false,
        lastActiveAt: { toMillis: () => Date.now() - 120 * 60000 },
      }),
      10000, ctx, config,
    );

    expect(offline.breakdown.onlineStatus).toBe(0);
  });
});

describe('scoreTrader — Current Load', () => {
  it('trader with high current load scores lower', () => {
    const config = makeConfig({ maxActivePayouts: 10 });
    const ctx = {};

    const free = scoreTrader(
      makeTrader({ payoutStats: { ...makeTrader().payoutStats, activePayouts: 0 } }),
      10000, ctx, config,
    );
    const heavy = scoreTrader(
      makeTrader({ payoutStats: { ...makeTrader().payoutStats, activePayouts: 8 } }),
      10000, ctx, config,
    );
    const full = scoreTrader(
      makeTrader({ payoutStats: { ...makeTrader().payoutStats, activePayouts: 10 } }),
      10000, ctx, config,
    );

    expect(free.breakdown.currentLoad).toBeGreaterThan(heavy.breakdown.currentLoad);
    expect(heavy.breakdown.currentLoad).toBeGreaterThan(full.breakdown.currentLoad);
    expect(full.breakdown.currentLoad).toBe(0);
  });
});

describe('scoreTrader — Cancel Rate', () => {
  it('high cancel rate scores lower', () => {
    const config = makeConfig();
    const ctx = {};

    const low = scoreTrader(
      makeTrader({ payoutStats: { ...makeTrader().payoutStats, totalCancelled: 1, totalAttempted: 100, todayCancelled: 0 } }),
      10000, ctx, config,
    );
    const high = scoreTrader(
      makeTrader({ payoutStats: { ...makeTrader().payoutStats, totalCancelled: 30, totalAttempted: 100, todayCancelled: 0 } }),
      10000, ctx, config,
    );

    expect(low.breakdown.cancelRate).toBeGreaterThan(high.breakdown.cancelRate);
  });

  it('trader above cancel threshold today gets 0 cancel rate score', () => {
    const config = makeConfig({ cancelThreshold: 5 });
    const ctx = {};

    const blocked = scoreTrader(
      makeTrader({ payoutStats: { ...makeTrader().payoutStats, todayCancelled: 5 } }),
      10000, ctx, config,
    );

    expect(blocked.breakdown.cancelRate).toBe(0);
  });
});

describe('scoreTrader — Speed Factor', () => {
  it('faster traders score better', () => {
    const config = makeConfig();
    const ctx = {};

    const fast = scoreTrader(
      makeTrader({ payoutStats: { ...makeTrader().payoutStats, avgCompletionMinutes: 3 } }),
      10000, ctx, config,
    );
    const slow = scoreTrader(
      makeTrader({ payoutStats: { ...makeTrader().payoutStats, avgCompletionMinutes: 45 } }),
      10000, ctx, config,
    );

    expect(fast.breakdown.speed).toBeGreaterThan(slow.breakdown.speed);
  });

  it('excellent speed (<= 5min) gets full speed score', () => {
    const config = makeConfig();
    const ctx = {};

    const lightning = scoreTrader(
      makeTrader({ payoutStats: { ...makeTrader().payoutStats, avgCompletionMinutes: 3 } }),
      10000, ctx, config,
    );

    expect(lightning.breakdown.speed).toBe(config.weights.speed * 1.0);
  });

  it('no speed data gets 60% of speed weight', () => {
    const config = makeConfig();
    const ctx = {};

    const noData = scoreTrader(
      makeTrader({ payoutStats: { ...makeTrader().payoutStats, avgCompletionMinutes: null } }),
      10000, ctx, config,
    );

    expect(noData.breakdown.speed).toBe(config.weights.speed * 0.6);
  });
});

describe('scoreTrader — Priority Factor', () => {
  it('high priority trader gets bonus', () => {
    const config = makeConfig();
    const ctx = {};

    const highP  = scoreTrader(makeTrader({ priority: 'high' }),   10000, ctx, config);
    const normP  = scoreTrader(makeTrader({ priority: 'normal' }), 10000, ctx, config);
    const lowP   = scoreTrader(makeTrader({ priority: 'low' }),    10000, ctx, config);

    expect(highP.breakdown.priority).toBeGreaterThan(normP.breakdown.priority);
    expect(normP.breakdown.priority).toBeGreaterThan(lowP.breakdown.priority);
  });

  it('high = 100%, normal = 60%, low = 20% of priority weight', () => {
    const config = makeConfig();
    const ctx = {};
    const w = config.weights.priority;

    const highP  = scoreTrader(makeTrader({ priority: 'high' }),   10000, ctx, config);
    const normP  = scoreTrader(makeTrader({ priority: 'normal' }), 10000, ctx, config);
    const lowP   = scoreTrader(makeTrader({ priority: 'low' }),    10000, ctx, config);

    expect(highP.breakdown.priority).toBe(w * 1.0);
    expect(normP.breakdown.priority).toBe(w * 0.6);
    expect(lowP.breakdown.priority).toBe(w * 0.2);
  });
});

describe('scoreTrader — All factors in valid range', () => {
  it('every factor is between 0 and its max weight', () => {
    const config = makeConfig();
    const ctx = {};
    const result = scoreTrader(makeTrader(), 10000, ctx, config);
    const w = config.weights;

    expect(result.breakdown.successRate).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.successRate).toBeLessThanOrEqual(w.successRate);

    expect(result.breakdown.speed).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.speed).toBeLessThanOrEqual(w.speed);

    expect(result.breakdown.currentLoad).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.currentLoad).toBeLessThanOrEqual(w.currentLoad);

    expect(result.breakdown.cancelRate).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.cancelRate).toBeLessThanOrEqual(w.cancelRate);

    expect(result.breakdown.cooldown).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.cooldown).toBeLessThanOrEqual(w.cooldown);

    expect(result.breakdown.amountTierMatch).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.amountTierMatch).toBeLessThanOrEqual(w.amountTierMatch);

    expect(result.breakdown.onlineStatus).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.onlineStatus).toBeLessThanOrEqual(w.onlineStatus);

    expect(result.breakdown.priority).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.priority).toBeLessThanOrEqual(w.priority);
  });

  it('final score is non-negative', () => {
    const config = makeConfig();
    const ctx = {};
    const result = scoreTrader(makeTrader(), 10000, ctx, config);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});

describe('scoreTrader — Penalties', () => {
  it('daily limit hit → -50 penalty', () => {
    const config = makeConfig({ maxDailyPayouts: 50 });
    const ctx = {};

    const atLimit = scoreTrader(
      makeTrader({ payoutStats: { ...makeTrader().payoutStats, todayCount: 50 } }),
      10000, ctx, config,
    );

    expect(atLimit.breakdown.penalties).toBeLessThanOrEqual(-50);
  });

  it('near daily limit (>90%) → -20 penalty', () => {
    const config = makeConfig({ maxDailyPayouts: 50 });
    const ctx = {};

    const nearLimit = scoreTrader(
      makeTrader({ payoutStats: { ...makeTrader().payoutStats, todayCount: 46 } }),
      10000, ctx, config,
    );

    expect(nearLimit.breakdown.penalties).toBeLessThanOrEqual(-20);
  });

  it('3+ cancels today → additional -15 penalty', () => {
    const config = makeConfig({ maxDailyPayouts: 50, cancelThreshold: 10 });
    const ctx = {};

    const cancelPenalty = scoreTrader(
      makeTrader({ payoutStats: { ...makeTrader().payoutStats, todayCancelled: 3, todayCount: 10 } }),
      10000, ctx, config,
    );

    expect(cancelPenalty.breakdown.penalties).toBe(-15);
  });
});

describe('scoreTrader — Result shape', () => {
  it('returns traderId, traderName, score, breakdown, reasons, and summary', () => {
    const config = makeConfig();
    const ctx = {};
    const result = scoreTrader(makeTrader(), 10000, ctx, config);

    expect(result).toHaveProperty('traderId');
    expect(result).toHaveProperty('traderName');
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('breakdown');
    expect(result).toHaveProperty('reasons');
    expect(result).toHaveProperty('summary');
    expect(typeof result.summary).toBe('string');
    expect(result.summary.length).toBeGreaterThan(0);
  });
});

describe('scoreAllTraders', () => {
  it('returns traders sorted by score descending', () => {
    const config = makeConfig();
    const ctx = {};

    const traders = [
      makeTrader({ id: 'bad',  name: 'Bad',  payoutStats: { ...makeTrader().payoutStats, totalCompleted: 20, totalAttempted: 100 } }),
      makeTrader({ id: 'good', name: 'Good', payoutStats: { ...makeTrader().payoutStats, totalCompleted: 98, totalAttempted: 100 } }),
      makeTrader({ id: 'mid',  name: 'Mid',  payoutStats: { ...makeTrader().payoutStats, totalCompleted: 60, totalAttempted: 100 } }),
    ];

    const results = scoreAllTraders(traders, 10000, ctx, config);

    expect(results[0].traderId).toBe('good');
    expect(results[results.length - 1].traderId).toBe('bad');
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });
});
