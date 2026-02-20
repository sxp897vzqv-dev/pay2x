/**
 * Trader Selector
 * Weighted random selection with fallback chain for payout assignment
 */

/**
 * Weighted random pick from scored traders
 */
function weightedRandomPickTrader(scoredTraders, config) {
  const eligible = scoredTraders.filter(t => t.score >= config.minScoreThreshold);

  if (eligible.length === 0) {
    console.log('❌ No traders above minimum threshold:', config.minScoreThreshold);
    return null;
  }

  if (eligible.length === 1) {
    console.log('☝️ Only one eligible trader');
    return eligible[0];
  }

  // Take top N candidates
  const candidates = eligible.slice(0, config.maxCandidates);

  console.log(`🎯 Selecting from ${candidates.length} candidates:`);
  candidates.forEach((c, i) => {
    console.log(`   ${i + 1}. ${c.traderName} (${c.traderId}) - Score: ${c.score}`);
  });

  // Calculate weights using score^exponent
  const exponent = config.scoreExponent || 2;
  const weights = candidates.map(t => Math.pow(t.score, exponent));
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  // Calculate probabilities for logging
  const probabilities = weights.map(w => ((w / totalWeight) * 100).toFixed(1) + '%');
  console.log(`📊 Selection probabilities: ${probabilities.join(', ')}`);

  // Random selection based on weights
  let random = Math.random() * totalWeight;

  for (let i = 0; i < candidates.length; i++) {
    random -= weights[i];
    if (random <= 0) {
      console.log(`🎲 Randomly selected: ${candidates[i].traderName}`);
      return candidates[i];
    }
  }

  return candidates[0];
}

/**
 * Validate trader is still eligible in real-time
 */
function validateTraderRealtime(scoredTrader, amount, config) {
  const trader = scoredTrader.trader;

  // Check if trader is active
  if (trader.isActive === false || trader.active === false) {
    console.log(`⚠️ ${trader.name}: Trader is inactive`);
    return { valid: false, reason: 'Trader is inactive' };
  }

  // Check max active payouts
  const activePayouts = trader.payoutStats?.activePayouts || 0;
  if (activePayouts >= config.maxActivePayouts) {
    console.log(`⚠️ ${trader.name}: At max active payouts (${activePayouts})`);
    return { valid: false, reason: `At max capacity (${activePayouts}/${config.maxActivePayouts} active)` };
  }

  // Check daily limit
  const todayCount = trader.payoutStats?.todayCount || 0;
  if (todayCount >= config.maxDailyPayouts) {
    console.log(`⚠️ ${trader.name}: Hit daily payout limit (${todayCount})`);
    return { valid: false, reason: `Daily limit reached (${todayCount}/${config.maxDailyPayouts})` };
  }

  // Check cancel threshold
  const todayCancelled = trader.payoutStats?.todayCancelled || 0;
  if (todayCancelled >= config.cancelThreshold) {
    console.log(`⚠️ ${trader.name}: Too many cancels today (${todayCancelled})`);
    return { valid: false, reason: `Too many cancels today (${todayCancelled})` };
  }

  // Check cooldown
  const lastAssignedAt = trader.payoutStats?.lastAssignedAt?.toMillis?.() || 0;
  const minsIdle = lastAssignedAt ? (Date.now() - lastAssignedAt) / 60000 : 999;
  if (minsIdle < config.cooldownMinutes * 0.5) {
    console.log(`⚠️ ${trader.name}: Still in cooldown (${minsIdle.toFixed(1)} mins)`);
    return { valid: false, reason: `Still in cooldown (${minsIdle.toFixed(1)}min idle)` };
  }

  return { valid: true, reason: null };
}

/**
 * Select trader with fallback attempts
 */
function selectTraderWithFallback(scoredTraders, amount, config) {
  const maxAttempts = config.enableFallback ? config.maxFallbackAttempts : 1;
  const excludeIds = new Set();
  const attempts = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`\n🔄 Selection attempt ${attempt}/${maxAttempts}`);

    // Filter out already tried traders
    const available = scoredTraders.filter(t => !excludeIds.has(t.traderId));

    if (available.length === 0) {
      console.log('❌ No more traders available');
      break;
    }

    // Weighted random pick
    const selected = weightedRandomPickTrader(available, config);

    if (!selected) {
      console.log('❌ No trader selected (all below threshold)');
      break;
    }

    // Validate in real-time
    const validation = validateTraderRealtime(selected, amount, config);

    attempts.push({
      attempt,
      traderId: selected.traderId,
      traderName: selected.traderName,
      score: selected.score,
      valid: validation.valid,
      reason: validation.reason,
    });

    if (validation.valid) {
      console.log(`✅ Selected trader: ${selected.traderName} (Score: ${selected.score})`);
      return {
        success: true,
        selected: selected,
        attempts: attempts,
        totalAttempts: attempt,
      };
    }

    // Mark as tried and continue
    console.log(`⚠️ ${selected.traderName} failed validation: ${validation.reason}, trying next...`);
    excludeIds.add(selected.traderId);
  }

  // All attempts failed
  return {
    success: false,
    error: 'No suitable trader available after all attempts',
    attempts: attempts,
    totalAttempts: attempts.length,
  };
}

module.exports = {
  weightedRandomPickTrader,
  validateTraderRealtime,
  selectTraderWithFallback,
};
