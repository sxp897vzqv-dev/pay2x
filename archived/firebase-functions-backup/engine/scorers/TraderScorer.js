/**
 * Trader Scoring Engine for Payout Assignment
 * Calculates a score for each trader based on multiple factors
 * Each factor returns a reasoning string explaining why it scored that way
 */

/**
 * Get amount tier
 */
function getPayoutAmountTier(amount, config) {
  const tiers = config.amountTiers;
  if (amount <= tiers.low.max) return 'low';
  if (amount <= tiers.medium.max) return 'medium';
  return 'high';
}

/**
 * Calculate score for a single trader
 * Returns score + detailed breakdown with reasons
 */
function scoreTrader(trader, amount, context, config) {
  const w = config.weights;
  const scores = {};
  const reasons = {};
  let totalScore = 0;

  // === 1. SUCCESS RATE (0-25 points) ===
  const totalCompleted = trader.payoutStats?.totalCompleted || 0;
  const totalAttempted = trader.payoutStats?.totalAttempted || 0;
  const successRate = totalAttempted > 0
    ? (totalCompleted / totalAttempted) * 100
    : 80; // Default 80% for new traders

  scores.successRate = (successRate / 100) * w.successRate;

  if (totalAttempted === 0) {
    reasons.successRate = `New trader, no history yet (default 80%) → ${scores.successRate.toFixed(1)}pts`;
  } else if (successRate >= 95) {
    reasons.successRate = `Excellent ${successRate.toFixed(0)}% success (${totalCompleted}/${totalAttempted}) → ${scores.successRate.toFixed(1)}pts`;
  } else if (successRate >= 80) {
    reasons.successRate = `Good ${successRate.toFixed(0)}% success (${totalCompleted}/${totalAttempted}) → ${scores.successRate.toFixed(1)}pts`;
  } else {
    reasons.successRate = `Low ${successRate.toFixed(0)}% success (${totalCompleted}/${totalAttempted}) → ${scores.successRate.toFixed(1)}pts`;
  }
  totalScore += scores.successRate;

  // === 2. SPEED (0-20 points) ===
  const avgCompletionMins = trader.payoutStats?.avgCompletionMinutes || null;
  const benchmarks = config.speedBenchmarks;

  if (avgCompletionMins === null) {
    // New trader, give benefit of doubt
    scores.speed = w.speed * 0.6;
    reasons.speed = `No speed data yet (default 60%) → ${scores.speed.toFixed(1)}pts`;
  } else if (avgCompletionMins <= benchmarks.excellent) {
    scores.speed = w.speed * 1.0;
    reasons.speed = `Lightning fast avg ${avgCompletionMins.toFixed(1)}min (≤${benchmarks.excellent}min) → ${scores.speed.toFixed(1)}pts`;
  } else if (avgCompletionMins <= benchmarks.good) {
    scores.speed = w.speed * 0.8;
    reasons.speed = `Good speed avg ${avgCompletionMins.toFixed(1)}min (≤${benchmarks.good}min) → ${scores.speed.toFixed(1)}pts`;
  } else if (avgCompletionMins <= benchmarks.acceptable) {
    scores.speed = w.speed * 0.5;
    reasons.speed = `Average speed ${avgCompletionMins.toFixed(1)}min (≤${benchmarks.acceptable}min) → ${scores.speed.toFixed(1)}pts`;
  } else {
    scores.speed = w.speed * 0.2;
    reasons.speed = `Slow avg ${avgCompletionMins.toFixed(1)}min (>${benchmarks.acceptable}min) → ${scores.speed.toFixed(1)}pts`;
  }
  totalScore += scores.speed;

  // === 3. CURRENT LOAD (0-15 points) ===
  const activePayouts = trader.payoutStats?.activePayouts || 0;
  const maxActive = config.maxActivePayouts;
  const loadRatio = activePayouts / maxActive;

  if (activePayouts === 0) {
    scores.currentLoad = w.currentLoad * 1.0;
    reasons.currentLoad = `Free — no active payouts → ${scores.currentLoad.toFixed(1)}pts`;
  } else if (loadRatio <= 0.3) {
    scores.currentLoad = w.currentLoad * 0.8;
    reasons.currentLoad = `Light load ${activePayouts}/${maxActive} active → ${scores.currentLoad.toFixed(1)}pts`;
  } else if (loadRatio <= 0.6) {
    scores.currentLoad = w.currentLoad * 0.5;
    reasons.currentLoad = `Moderate load ${activePayouts}/${maxActive} active → ${scores.currentLoad.toFixed(1)}pts`;
  } else if (loadRatio < 1.0) {
    scores.currentLoad = w.currentLoad * 0.2;
    reasons.currentLoad = `Heavy load ${activePayouts}/${maxActive} active → ${scores.currentLoad.toFixed(1)}pts`;
  } else {
    scores.currentLoad = 0;
    reasons.currentLoad = `FULL ${activePayouts}/${maxActive} — at max capacity → 0pts`;
  }
  totalScore += scores.currentLoad;

  // === 4. CANCEL RATE (0-15 points) ===
  const totalCancelled = trader.payoutStats?.totalCancelled || 0;
  const cancelRate = totalAttempted > 0
    ? (totalCancelled / totalAttempted) * 100
    : 0;
  const recentCancels = trader.payoutStats?.todayCancelled || 0;

  if (recentCancels >= config.cancelThreshold) {
    scores.cancelRate = 0;
    reasons.cancelRate = `Too many cancels today (${recentCancels}) — blocked → 0pts`;
  } else if (cancelRate <= 2) {
    scores.cancelRate = w.cancelRate * 1.0;
    reasons.cancelRate = `Excellent — only ${cancelRate.toFixed(0)}% cancel rate → ${scores.cancelRate.toFixed(1)}pts`;
  } else if (cancelRate <= 10) {
    scores.cancelRate = w.cancelRate * 0.7;
    reasons.cancelRate = `Acceptable ${cancelRate.toFixed(0)}% cancel rate → ${scores.cancelRate.toFixed(1)}pts`;
  } else if (cancelRate <= 25) {
    scores.cancelRate = w.cancelRate * 0.3;
    reasons.cancelRate = `High ${cancelRate.toFixed(0)}% cancel rate — risky → ${scores.cancelRate.toFixed(1)}pts`;
  } else {
    scores.cancelRate = 0;
    reasons.cancelRate = `Very high ${cancelRate.toFixed(0)}% cancel rate — unreliable → 0pts`;
  }
  totalScore += scores.cancelRate;

  // === 5. COOLDOWN (0-10 points) ===
  const lastAssignedAt = trader.payoutStats?.lastAssignedAt?.toMillis?.() || 0;
  const minsIdle = lastAssignedAt ? (Date.now() - lastAssignedAt) / 60000 : 999;
  const cooldownMins = config.cooldownMinutes;

  if (minsIdle >= cooldownMins * 2) {
    scores.cooldown = w.cooldown * 1.0;
    reasons.cooldown = `Well rested — idle ${minsIdle.toFixed(0)}min → ${scores.cooldown.toFixed(1)}pts`;
  } else if (minsIdle >= cooldownMins) {
    scores.cooldown = w.cooldown * 0.7;
    reasons.cooldown = `Cooldown passed — idle ${minsIdle.toFixed(0)}min → ${scores.cooldown.toFixed(1)}pts`;
  } else {
    const recovery = minsIdle / cooldownMins;
    scores.cooldown = w.cooldown * recovery;
    reasons.cooldown = `Still cooling down — only ${minsIdle.toFixed(1)}min idle → ${scores.cooldown.toFixed(1)}pts`;
  }
  totalScore += scores.cooldown;

  // === 6. AMOUNT TIER MATCH (0-5 points) ===
  const requestedTier = getPayoutAmountTier(amount, config);
  const traderBestTier = trader.payoutStats?.bestAmountTier || 'medium';

  if (requestedTier === traderBestTier) {
    scores.amountTierMatch = w.amountTierMatch * 1.0;
    reasons.amountTierMatch = `Perfect tier match — trader excels at ${requestedTier} amounts → ${scores.amountTierMatch.toFixed(1)}pts`;
  } else {
    scores.amountTierMatch = w.amountTierMatch * 0.4;
    reasons.amountTierMatch = `Tier mismatch — trader best at ${traderBestTier}, this is ${requestedTier} → ${scores.amountTierMatch.toFixed(1)}pts`;
  }
  totalScore += scores.amountTierMatch;

  // === 7. ONLINE STATUS (0-5 points) ===
  const lastActiveAt = trader.lastActiveAt?.toMillis?.() || 0;
  const minsInactive = lastActiveAt ? (Date.now() - lastActiveAt) / 60000 : 999;
  const isOnline = trader.isOnline === true;

  if (isOnline && minsInactive < 5) {
    scores.onlineStatus = w.onlineStatus * 1.0;
    reasons.onlineStatus = `Online now — active ${minsInactive.toFixed(0)}min ago → ${scores.onlineStatus.toFixed(1)}pts`;
  } else if (minsInactive < 15) {
    scores.onlineStatus = w.onlineStatus * 0.7;
    reasons.onlineStatus = `Recently active — ${minsInactive.toFixed(0)}min ago → ${scores.onlineStatus.toFixed(1)}pts`;
  } else if (minsInactive < 60) {
    scores.onlineStatus = w.onlineStatus * 0.3;
    reasons.onlineStatus = `Idle — last seen ${minsInactive.toFixed(0)}min ago → ${scores.onlineStatus.toFixed(1)}pts`;
  } else {
    scores.onlineStatus = 0;
    reasons.onlineStatus = `Offline — last seen ${minsInactive > 999 ? 'unknown' : Math.floor(minsInactive / 60) + 'h ago'} → 0pts`;
  }
  totalScore += scores.onlineStatus;

  // === 8. PRIORITY (0-5 points) ===
  const priority = trader.priority || 'normal';
  const priorityMap = { high: 1.0, normal: 0.6, low: 0.2 };
  const priorityMultiplier = priorityMap[priority] ?? 0.6;

  scores.priority = w.priority * priorityMultiplier;
  reasons.priority = `Priority: ${priority} → ${scores.priority.toFixed(1)}pts`;
  totalScore += scores.priority;

  // === PENALTIES ===
  scores.penalties = 0;
  const penaltyReasons = [];

  // Daily limit approaching
  const todayCount = trader.payoutStats?.todayCount || 0;
  if (todayCount >= config.maxDailyPayouts) {
    scores.penalties -= 50;
    penaltyReasons.push(`Hit daily limit (${todayCount}/${config.maxDailyPayouts})`);
  } else if (todayCount > config.maxDailyPayouts * 0.9) {
    scores.penalties -= 20;
    penaltyReasons.push(`Near daily limit (${todayCount}/${config.maxDailyPayouts})`);
  }

  // Recent cancels penalty
  if (recentCancels >= 3) {
    scores.penalties -= 15;
    penaltyReasons.push(`${recentCancels} cancels today`);
  }

  if (penaltyReasons.length > 0) {
    reasons.penalties = `Penalties: ${penaltyReasons.join(', ')} → ${scores.penalties}pts`;
  } else {
    reasons.penalties = `No penalties → 0pts`;
  }
  totalScore += scores.penalties;

  // === RANDOMNESS FACTOR ===
  let randomBoost = 0;
  if (config.enableRandomness) {
    randomBoost = (Math.random() - 0.5) * config.randomnessFactor * totalScore;
    scores.randomBoost = randomBoost;
    reasons.randomBoost = `Random variation → ${randomBoost > 0 ? '+' : ''}${randomBoost.toFixed(1)}pts`;
    totalScore += randomBoost;
  }

  const finalScore = Math.max(0, Math.round(totalScore));

  return {
    traderId: trader.id,
    traderName: trader.name || 'Unknown',
    trader: trader,
    score: finalScore,
    breakdown: scores,
    reasons: reasons,
    summary: buildSummary(trader, finalScore, reasons),
  };
}

/**
 * Build a human-readable summary of why this trader was scored this way
 */
function buildSummary(trader, score, reasons) {
  const name = trader.name || trader.id;
  const parts = [];

  // Highlight top 3 positive factors
  const positiveFactors = Object.entries(reasons)
    .filter(([key]) => key !== 'penalties' && key !== 'randomBoost')
    .map(([key, reason]) => ({ key, reason }));

  parts.push(`${name} scored ${score}/100`);

  // Add key strengths
  const strengths = [];
  if (reasons.successRate?.includes('Excellent')) strengths.push('high success rate');
  if (reasons.speed?.includes('Lightning')) strengths.push('very fast');
  if (reasons.speed?.includes('Good speed')) strengths.push('good speed');
  if (reasons.currentLoad?.includes('Free')) strengths.push('no active load');
  if (reasons.currentLoad?.includes('Light')) strengths.push('light load');
  if (reasons.onlineStatus?.includes('Online now')) strengths.push('online');
  if (reasons.amountTierMatch?.includes('Perfect')) strengths.push('amount tier match');

  if (strengths.length > 0) {
    parts.push(`Strengths: ${strengths.join(', ')}`);
  }

  // Add key weaknesses
  const weaknesses = [];
  if (reasons.successRate?.includes('Low')) weaknesses.push('low success rate');
  if (reasons.speed?.includes('Slow')) weaknesses.push('slow completion');
  if (reasons.currentLoad?.includes('Heavy') || reasons.currentLoad?.includes('FULL')) weaknesses.push('overloaded');
  if (reasons.cancelRate?.includes('High') || reasons.cancelRate?.includes('Very high')) weaknesses.push('frequent cancels');
  if (reasons.onlineStatus?.includes('Offline')) weaknesses.push('offline');

  if (weaknesses.length > 0) {
    parts.push(`Concerns: ${weaknesses.join(', ')}`);
  }

  return parts.join('. ');
}

/**
 * Score all traders and return sorted list
 */
function scoreAllTraders(traders, amount, context, config) {
  const scored = traders.map(trader => scoreTrader(trader, amount, context, config));

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  return scored;
}

module.exports = {
  scoreTrader,
  scoreAllTraders,
  getPayoutAmountTier,
  buildSummary,
};
