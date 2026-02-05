/**
 * Weighted Random Selection Tests
 * Tests the weighted random pick algorithm used by UpiSelector and TraderSelector
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { weightedRandomPick } = await import('../../../functions/engine/UpiSelector.js');
const { weightedRandomPickTrader } = await import('../../../functions/engine/TraderSelector.js');

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeConfig(overrides = {}) {
  return {
    minScoreThreshold: 10,
    maxCandidates: 5,
    scoreExponent: 2,
    ...overrides,
  };
}

function makeScoredUpi(upiId, score) {
  return { upiId, score, upi: { upiId } };
}

function makeScoredTrader(traderId, traderName, score) {
  return { traderId, traderName, score, trader: { id: traderId, name: traderName } };
}

// ── UPI Weighted Random Tests ────────────────────────────────────────────────

describe('weightedRandomPick (UPI)', () => {
  it('returns null when no candidates above threshold', () => {
    const config = makeConfig({ minScoreThreshold: 50 });
    const scored = [
      makeScoredUpi('a@upi', 10),
      makeScoredUpi('b@upi', 20),
    ];

    const result = weightedRandomPick(scored, config);
    expect(result).toBeNull();
  });

  it('returns the single candidate when only one eligible', () => {
    const config = makeConfig({ minScoreThreshold: 10 });
    const scored = [makeScoredUpi('only@upi', 50)];

    const result = weightedRandomPick(scored, config);
    expect(result).not.toBeNull();
    expect(result.upiId).toBe('only@upi');
  });

  it('with equal scores, distribution is roughly even over many runs', () => {
    const config = makeConfig({ minScoreThreshold: 0, maxCandidates: 3, scoreExponent: 1 });
    const scored = [
      makeScoredUpi('a@upi', 50),
      makeScoredUpi('b@upi', 50),
      makeScoredUpi('c@upi', 50),
    ];

    const counts = { 'a@upi': 0, 'b@upi': 0, 'c@upi': 0 };
    const runs = 3000;

    for (let i = 0; i < runs; i++) {
      const pick = weightedRandomPick(scored, config);
      counts[pick.upiId]++;
    }

    // Each should be roughly 33% ± 5%
    for (const id of Object.keys(counts)) {
      const pct = counts[id] / runs;
      expect(pct).toBeGreaterThan(0.25);
      expect(pct).toBeLessThan(0.42);
    }
  });

  it('item with much higher score is selected most often', () => {
    const config = makeConfig({ minScoreThreshold: 0, maxCandidates: 3, scoreExponent: 2 });
    const scored = [
      makeScoredUpi('high@upi', 90),
      makeScoredUpi('low1@upi', 10),
      makeScoredUpi('low2@upi', 10),
    ];

    const counts = { 'high@upi': 0, 'low1@upi': 0, 'low2@upi': 0 };
    const runs = 1000;

    for (let i = 0; i < runs; i++) {
      const pick = weightedRandomPick(scored, config);
      counts[pick.upiId]++;
    }

    // high@upi: weight = 90^2 = 8100, lows = 100 each. Total=8300
    // high@upi should be picked ~97.6% of the time
    expect(counts['high@upi']).toBeGreaterThan(runs * 0.9);
  });

  it('with Math.random mocked to 0, always picks the first item (highest score wins)', () => {
    const mockRandom = vi.spyOn(Math, 'random').mockReturnValue(0);

    const config = makeConfig({ minScoreThreshold: 0, maxCandidates: 3 });
    const scored = [
      makeScoredUpi('first@upi', 80),
      makeScoredUpi('second@upi', 50),
      makeScoredUpi('third@upi', 20),
    ];

    const result = weightedRandomPick(scored, config);
    expect(result.upiId).toBe('first@upi');

    mockRandom.mockRestore();
  });

  it('respects maxCandidates — only top N are considered', () => {
    const config = makeConfig({ minScoreThreshold: 0, maxCandidates: 2, scoreExponent: 1 });
    // Scored list is already sorted (descending) by the scoring engine
    const scored = [
      makeScoredUpi('top1@upi', 90),
      makeScoredUpi('top2@upi', 80),
      makeScoredUpi('excluded@upi', 70),
    ];

    const picked = new Set();
    for (let i = 0; i < 500; i++) {
      const pick = weightedRandomPick(scored, config);
      picked.add(pick.upiId);
    }

    expect(picked.has('excluded@upi')).toBe(false);
    expect(picked.has('top1@upi')).toBe(true);
    expect(picked.has('top2@upi')).toBe(true);
  });
});

// ── Trader Weighted Random Tests ─────────────────────────────────────────────

describe('weightedRandomPickTrader', () => {
  it('returns null when no traders above threshold', () => {
    const config = makeConfig({ minScoreThreshold: 50 });
    const scored = [
      makeScoredTrader('t1', 'Trader1', 10),
      makeScoredTrader('t2', 'Trader2', 20),
    ];

    expect(weightedRandomPickTrader(scored, config)).toBeNull();
  });

  it('single eligible trader is always returned', () => {
    const config = makeConfig({ minScoreThreshold: 10 });
    const scored = [makeScoredTrader('only', 'Only One', 60)];

    const result = weightedRandomPickTrader(scored, config);
    expect(result.traderId).toBe('only');
  });

  it('higher scored trader is selected more often', () => {
    const config = makeConfig({ minScoreThreshold: 0, maxCandidates: 3, scoreExponent: 2 });
    const scored = [
      makeScoredTrader('best', 'Best Trader', 85),
      makeScoredTrader('avg', 'Avg Trader', 15),
      makeScoredTrader('low', 'Low Trader', 10),
    ];

    const counts = { best: 0, avg: 0, low: 0 };
    for (let i = 0; i < 1000; i++) {
      const pick = weightedRandomPickTrader(scored, config);
      counts[pick.traderId]++;
    }

    // best: 85^2 = 7225, avg: 225, low: 100. Total=7550
    // best should dominate (>90%)
    expect(counts.best).toBeGreaterThan(800);
  });
});

// ── Edge cases ───────────────────────────────────────────────────────────────

describe('Weighted Random — edge cases', () => {
  it('empty list returns null', () => {
    const config = makeConfig({ minScoreThreshold: 0 });
    expect(weightedRandomPick([], config)).toBeNull();
    expect(weightedRandomPickTrader([], config)).toBeNull();
  });

  it('all items below threshold returns null', () => {
    const config = makeConfig({ minScoreThreshold: 100 });
    const scored = [
      makeScoredUpi('a@upi', 99),
      makeScoredUpi('b@upi', 50),
    ];
    expect(weightedRandomPick(scored, config)).toBeNull();
  });

  it('items with score exactly at threshold are included', () => {
    const config = makeConfig({ minScoreThreshold: 50 });
    const scored = [makeScoredUpi('exact@upi', 50)];

    const result = weightedRandomPick(scored, config);
    expect(result).not.toBeNull();
    expect(result.upiId).toBe('exact@upi');
  });
});
