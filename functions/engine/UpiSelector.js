/**
 * UPI Selector
 * Implements weighted random selection with fallback chain
 */

/**
 * Weighted random pick from scored UPIs
 * Higher scores have higher probability but aren't guaranteed
 */
function weightedRandomPick(scoredUpis, config) {
  // Filter by minimum threshold
  const eligible = scoredUpis.filter(u => u.score >= config.minScoreThreshold);
  
  if (eligible.length === 0) {
    console.log('❌ No UPIs above minimum threshold:', config.minScoreThreshold);
    return null;
  }
  
  // If only one candidate, return it
  if (eligible.length === 1) {
    console.log('☝️ Only one eligible UPI');
    return eligible[0];
  }
  
  // Take top N candidates
  const candidates = eligible.slice(0, config.maxCandidates);
  
  console.log(`🎯 Selecting from ${candidates.length} candidates:`);
  candidates.forEach((c, i) => {
    console.log(`   ${i + 1}. ${c.upiId} - Score: ${c.score}`);
  });
  
  // Calculate weights using score^exponent (higher exp = more bias to top)
  const exponent = config.scoreExponent || 2;
  const weights = candidates.map(u => Math.pow(u.score, exponent));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  
  // Calculate probabilities for logging
  const probabilities = weights.map(w => ((w / totalWeight) * 100).toFixed(1) + '%');
  console.log(`📊 Selection probabilities: ${probabilities.join(', ')}`);
  
  // Random selection based on weights
  let random = Math.random() * totalWeight;
  
  for (let i = 0; i < candidates.length; i++) {
    random -= weights[i];
    if (random <= 0) {
      console.log(`🎲 Randomly selected: ${candidates[i].upiId}`);
      return candidates[i];
    }
  }
  
  // Fallback (shouldn't reach here)
  return candidates[0];
}

/**
 * Validate UPI is still usable in real-time
 */
function validateUpiRealtime(scoredUpi, amount, config) {
  const upi = scoredUpi.upi;
  
  // Check if daily limit would be exceeded
  const todayVolume = upi.stats?.todayVolume || 0;
  const dailyLimit = upi.dailyLimit || 100000;
  if (todayVolume + amount > dailyLimit) {
    console.log(`⚠️ ${upi.upiId}: Would exceed daily limit`);
    return false;
  }
  
  // Check if in cooldown
  const lastUsedAt = upi.stats?.lastUsedAt?.toMillis?.() || 0;
  const minsIdle = lastUsedAt ? (Date.now() - lastUsedAt) / 60000 : 999;
  if (minsIdle < config.cooldownMinutes * 0.5) {
    // Allow if at least 50% of cooldown passed (some flexibility)
    console.log(`⚠️ ${upi.upiId}: Still in cooldown (${minsIdle.toFixed(1)} mins)`);
    return false;
  }
  
  // Check if too many recent failures
  const recentFailures = upi.stats?.lastHourFailures || 0;
  if (recentFailures >= config.failureThreshold) {
    console.log(`⚠️ ${upi.upiId}: Too many recent failures (${recentFailures})`);
    return false;
  }
  
  // Check if UPI is still active
  if (upi.active === false) {
    console.log(`⚠️ ${upi.upiId}: UPI is inactive`);
    return false;
  }
  
  // Check per-transaction limits
  if (upi.perTxnMin && amount < upi.perTxnMin) {
    console.log(`⚠️ ${upi.upiId}: Amount below min (${upi.perTxnMin})`);
    return false;
  }
  if (upi.perTxnMax && amount > upi.perTxnMax) {
    console.log(`⚠️ ${upi.upiId}: Amount above max (${upi.perTxnMax})`);
    return false;
  }
  
  return true;
}

/**
 * Select UPI with fallback attempts
 */
function selectWithFallback(scoredUpis, amount, config) {
  const maxAttempts = config.enableFallback ? config.maxFallbackAttempts : 1;
  const excludeIds = new Set();
  const attempts = [];
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`\n🔄 Selection attempt ${attempt}/${maxAttempts}`);
    
    // Filter out already tried UPIs
    const available = scoredUpis.filter(u => !excludeIds.has(u.upiId));
    
    if (available.length === 0) {
      console.log('❌ No more UPIs available');
      break;
    }
    
    // Weighted random pick
    const selected = weightedRandomPick(available, config);
    
    if (!selected) {
      console.log('❌ No UPI selected (all below threshold)');
      break;
    }
    
    attempts.push({
      attempt,
      upiId: selected.upiId,
      score: selected.score,
    });
    
    // Validate in real-time
    const isValid = validateUpiRealtime(selected, amount, config);
    
    if (isValid) {
      console.log(`✅ Selected UPI: ${selected.upiId} (Score: ${selected.score})`);
      return {
        success: true,
        selected: selected,
        attempts: attempts,
        totalAttempts: attempt,
      };
    }
    
    // Mark as tried and continue
    console.log(`⚠️ ${selected.upiId} failed validation, trying next...`);
    excludeIds.add(selected.upiId);
  }
  
  // All attempts failed
  return {
    success: false,
    error: 'No suitable UPI available after all attempts',
    attempts: attempts,
    totalAttempts: attempts.length,
  };
}

module.exports = {
  weightedRandomPick,
  validateUpiRealtime,
  selectWithFallback,
};
