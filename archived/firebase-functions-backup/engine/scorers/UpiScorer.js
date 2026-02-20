/**
 * UPI Scoring Engine
 * Calculates a score for each UPI based on multiple factors
 */

/**
 * Get amount tier for routing
 */
function getAmountTier(amount, config) {
  const tiers = config.amountTiers;
  if (amount <= tiers.low.max) return 'low';
  if (amount <= tiers.medium.max) return 'medium';
  return 'high';
}

/**
 * Check if current time is in bank's maintenance window
 */
function isInMaintenanceWindow(bankHealth) {
  if (!bankHealth?.maintenanceWindows?.length) return false;
  
  const now = new Date();
  const currentDay = now.toLocaleDateString('en-US', { weekday: 'lowercase' });
  const currentTime = now.toTimeString().slice(0, 5); // HH:MM
  
  for (const window of bankHealth.maintenanceWindows) {
    if (window.day === currentDay || window.day === 'daily') {
      if (currentTime >= window.start && currentTime <= window.end) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Calculate score for a single UPI
 */
function scoreUpi(upi, amount, context, config) {
  const w = config.weights;
  const scores = {};
  let totalScore = 0;
  
  // === 1. SUCCESS RATE (0-25 points) ===
  const successRate = upi.performance?.successRate ?? 80; // Default 80% if new
  scores.successRate = (successRate / 100) * w.successRate;
  totalScore += scores.successRate;
  
  // === 2. DAILY LIMIT HEADROOM (0-20 points) ===
  const dailyLimit = upi.dailyLimit || 100000;
  const todayVolume = upi.stats?.todayVolume || 0;
  const headroom = Math.max(0, dailyLimit - todayVolume);
  
  // Check if this transaction would fit
  if (headroom < amount) {
    scores.dailyLimitLeft = 0; // Can't handle this amount
  } else {
    // Score based on remaining capacity percentage
    const capacityLeft = headroom / dailyLimit;
    scores.dailyLimitLeft = capacityLeft * w.dailyLimitLeft;
  }
  totalScore += scores.dailyLimitLeft;
  
  // === 3. COOLDOWN RECOVERY (0-15 points) ===
  const lastUsedAt = upi.stats?.lastUsedAt?.toMillis?.() || 0;
  const minsIdle = lastUsedAt ? (Date.now() - lastUsedAt) / 60000 : 999;
  const cooldownScore = Math.min(minsIdle / config.cooldownMinutes, 1);
  scores.cooldown = cooldownScore * w.cooldown;
  totalScore += scores.cooldown;
  
  // === 4. AMOUNT TIER MATCH (0-15 points) ===
  const requestedTier = getAmountTier(amount, config);
  const upiTier = upi.amountTier || 'medium';
  const tierMatch = requestedTier === upiTier;
  scores.amountMatch = (tierMatch ? 1 : 0.4) * w.amountMatch;
  totalScore += scores.amountMatch;
  
  // === 5. TRADER BALANCE (0-10 points) ===
  const trader = context.traders?.[upi.traderId];
  const traderBalance = trader?.balance || 0;
  // Trader should have enough balance to cover the payin (for settlement)
  const balanceOk = traderBalance >= 0; // Just needs to be active
  scores.traderBalance = (balanceOk ? 1 : 0) * w.traderBalance;
  totalScore += scores.traderBalance;
  
  // === 6. BANK HEALTH (0-5 points) ===
  const bankHealth = context.bankHealth?.[upi.bank];
  const bankStatus = bankHealth?.status || 'healthy';
  const healthMultiplier = bankStatus === 'healthy' ? 1 :
                           bankStatus === 'degraded' ? 0.5 : 0.1;
  scores.bankHealth = healthMultiplier * w.bankHealth;
  totalScore += scores.bankHealth;
  
  // === 7. TIME WINDOW (0-5 points) ===
  const inMaintenance = isInMaintenanceWindow(bankHealth);
  scores.timeWindow = (inMaintenance ? 0 : 1) * w.timeWindow;
  totalScore += scores.timeWindow;
  
  // === PENALTIES ===
  scores.penalties = 0;
  
  // Recent failures penalty
  const recentFailures = upi.stats?.lastHourFailures || 0;
  if (recentFailures >= 3) {
    scores.penalties -= 30;
  } else if (recentFailures >= 2) {
    scores.penalties -= 15;
  } else if (recentFailures >= 1) {
    scores.penalties -= 5;
  }
  
  // Overuse penalty
  const todayCount = upi.stats?.todayCount || 0;
  if (todayCount > config.maxDailyTxnsPerUpi * 0.9) {
    scores.penalties -= 20; // Almost at limit
  } else if (todayCount > config.maxDailyTxnsPerUpi * 0.7) {
    scores.penalties -= 10; // Getting busy
  }
  
  totalScore += scores.penalties;
  
  // === RANDOMNESS FACTOR ===
  let randomBoost = 0;
  if (config.enableRandomness) {
    // Add ±10% random variation
    randomBoost = (Math.random() - 0.5) * config.randomnessFactor * totalScore;
    scores.randomBoost = randomBoost;
    totalScore += randomBoost;
  }
  
  return {
    upiId: upi.upiId,
    upi: upi,
    score: Math.max(0, Math.round(totalScore)),
    breakdown: scores,
  };
}

/**
 * Score all UPIs and return sorted list
 */
function scoreAllUpis(upis, amount, context, config) {
  const scored = upis.map(upi => scoreUpi(upi, amount, context, config));
  
  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  
  return scored;
}

module.exports = {
  scoreUpi,
  scoreAllUpis,
  getAmountTier,
  isInMaintenanceWindow,
};
