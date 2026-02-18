/**
 * PayinEngine v5.0 - Improved Distribution
 * 
 * Changes from v4:
 * - Trader diversity factor (avoid same trader consecutively)
 * - Flatter random selection (score^1.3 instead of ^2)
 * - Load balancing across active traders
 * - Time-based rotation
 * - Better tier matching
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getGeoMatch, GeoLocation } from './geo.ts';
import { getCached, setCache, TTL } from './cache.ts';

// ═══════════════════════════════════════════════════════════════════
// CONFIGURATION v5
// ═══════════════════════════════════════════════════════════════════

const DEFAULT_WEIGHTS = {
  successRate: 15,       // Reduced from 20 (less penalty for new UPIs)
  dailyLimitLeft: 15,
  cooldown: 20,          // Increased from 10 (more important for distribution)
  amountMatch: 10,       // Reduced from 15
  traderDiversity: 15,   // NEW: Prefer different traders
  merchantAffinity: 10,  // Reduced from 15
  bankHealth: 5,         // Reduced from 10
  peakHourBonus: 3,
  recentFailures: 5,
  consecutiveSuccess: 2,
  sameCity: 12,
  sameState: 6,
};

// More granular tiers
const AMOUNT_TIERS = {
  micro:   { min: 100,    max: 500 },
  tiny:    { min: 501,    max: 1000 },
  small:   { min: 1001,   max: 3000 },
  medium:  { min: 3001,   max: 7000 },
  large:   { min: 7001,   max: 15000 },
  xlarge:  { min: 15001,  max: 30000 },
  jumbo:   { min: 30001,  max: 50000 },
};

type AmountTier = keyof typeof AMOUNT_TIERS;

interface UpiCandidate {
  id: string;
  upi_id: string;
  holder_name: string;
  trader_id: string;
  trader_name: string;
  trader_balance: number;
  status: string;
  daily_limit: number;
  daily_volume: number;
  daily_count: number;
  success_rate: number;
  last_used_at: string | null;
  hourly_failures: number;
  amount_tier: string;
  min_amount: number;
  max_amount: number;
  bank_name: string;
  consecutive_successes: number;
  consecutive_failures: number;
  performance_multiplier: number;
  bank_city: string | null;
  bank_state: string | null;
}

interface ScoredUpi extends UpiCandidate {
  score: number;
  breakdown: Record<string, number>;
  tierMatch: 'exact' | 'adjacent' | 'mismatch';
  geoMatch: 'city' | 'state' | 'none';
  geoBoost: number;
}

// Track recently used traders (in-memory, resets on cold start)
const recentTraders: string[] = [];
const MAX_RECENT_TRADERS = 5;

export class PayinEngineV5 {
  private supabase: SupabaseClient;
  private weights = DEFAULT_WEIGHTS;
  private bankCircuits: Map<string, { state: string; failureRate: number }> = new Map();
  private merchantAffinities: Map<string, number> = new Map();
  private userGeo: GeoLocation | null = null;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  private getAmountTier(amount: number): AmountTier {
    for (const [tier, range] of Object.entries(AMOUNT_TIERS)) {
      if (amount >= range.min && amount <= range.max) {
        return tier as AmountTier;
      }
    }
    return 'medium';
  }

  private checkTierMatch(requestedTier: AmountTier, upiTier: string, amount: number, minAmount: number, maxAmount: number): 'exact' | 'adjacent' | 'mismatch' {
    if (minAmount > 0 && amount < minAmount) return 'mismatch';
    if (maxAmount > 0 && amount > maxAmount) return 'mismatch';
    if (upiTier === requestedTier) return 'exact';
    
    const tierOrder = Object.keys(AMOUNT_TIERS);
    const reqIdx = tierOrder.indexOf(requestedTier);
    const upiIdx = tierOrder.indexOf(upiTier);
    
    if (Math.abs(reqIdx - upiIdx) <= 1) return 'adjacent';
    return 'mismatch';
  }

  private scoreUpi(upi: UpiCandidate, amount: number, allowTierMismatch: boolean = false): ScoredUpi | null {
    const requestedTier = this.getAmountTier(amount);
    const breakdown: Record<string, number> = {};
    let totalScore = 0;

    // Bank circuit check
    const circuit = this.bankCircuits.get(upi.bank_name.toLowerCase());
    if (circuit?.state === 'OPEN') return null;

    // Tier check
    const tierMatch = this.checkTierMatch(
      requestedTier,
      upi.amount_tier || 'medium',
      amount,
      upi.min_amount || 0,
      upi.max_amount || 999999
    );
    
    // Only reject tier mismatch if NOT in fallback mode
    if (tierMatch === 'mismatch' && amount > 10000 && !allowTierMismatch) return null;

    // Daily limit check (always required)
    const effectiveLimit = upi.daily_limit * (upi.performance_multiplier || 1);
    const limitLeft = Math.max(0, effectiveLimit - upi.daily_volume);
    if (limitLeft < amount) return null;

    // 1. Success Rate (0-15) - less weight for new UPIs
    const successScore = (upi.success_rate / 100) * this.weights.successRate;
    breakdown.successRate = Math.round(successScore * 10) / 10;
    totalScore += successScore;

    // 2. Daily Limit Left (0-15)
    const limitRatio = Math.min(1, limitLeft / effectiveLimit);
    const limitScore = limitRatio * this.weights.dailyLimitLeft;
    breakdown.dailyLimitLeft = Math.round(limitScore * 10) / 10;
    totalScore += limitScore;

    // 3. Cooldown (0-20) - CRITICAL for distribution
    let cooldownScore = this.weights.cooldown;
    if (upi.last_used_at) {
      const minutesSince = (Date.now() - new Date(upi.last_used_at).getTime()) / 60000;
      // Logarithmic cooldown: quick recovery in first 5 mins, then slower
      if (minutesSince < 1) {
        cooldownScore = 0; // Just used - no score
      } else if (minutesSince < 5) {
        cooldownScore = (minutesSince / 5) * this.weights.cooldown * 0.5;
      } else {
        cooldownScore = Math.min(1, minutesSince / 30) * this.weights.cooldown;
      }
    }
    breakdown.cooldown = Math.round(cooldownScore * 10) / 10;
    totalScore += cooldownScore;

    // 4. Amount Match (0-10) - give partial score even for mismatch in fallback mode
    let amountScore = 0;
    if (tierMatch === 'exact') amountScore = this.weights.amountMatch;
    else if (tierMatch === 'adjacent') amountScore = this.weights.amountMatch * 0.6;
    else if (allowTierMismatch) amountScore = this.weights.amountMatch * 0.2; // Fallback: small score
    breakdown.amountMatch = Math.round(amountScore * 10) / 10;
    totalScore += amountScore;

    // 5. Trader Diversity (0-15) - NEW
    let diversityScore = this.weights.traderDiversity;
    const recentIdx = recentTraders.indexOf(upi.trader_id);
    if (recentIdx !== -1) {
      // Penalize recently used traders
      // Most recent = 0 score, older = partial score
      diversityScore = (recentIdx / MAX_RECENT_TRADERS) * this.weights.traderDiversity;
    }
    breakdown.traderDiversity = Math.round(diversityScore * 10) / 10;
    totalScore += diversityScore;

    // 6. Merchant Affinity (0-10)
    const affinity = this.merchantAffinities.get(upi.id) || 50;
    const affinityScore = (affinity / 100) * this.weights.merchantAffinity;
    breakdown.merchantAffinity = Math.round(affinityScore * 10) / 10;
    totalScore += affinityScore;

    // 7. Bank Health (0-5)
    let bankScore = this.weights.bankHealth;
    if (circuit?.state === 'HALF_OPEN') bankScore *= 0.3;
    breakdown.bankHealth = Math.round(bankScore * 10) / 10;
    totalScore += bankScore;

    // 8. Recent Failures Penalty
    const failurePenalty = Math.min(upi.hourly_failures, 5);
    breakdown.recentFailures = -failurePenalty;
    totalScore -= failurePenalty;

    // 9. Consecutive Success Bonus (0-2)
    const consecutiveBonus = Math.min(upi.consecutive_successes || 0, 5) / 5 * this.weights.consecutiveSuccess;
    breakdown.consecutiveSuccess = Math.round(consecutiveBonus * 10) / 10;
    totalScore += consecutiveBonus;

    // 10. Consecutive failure penalty
    if ((upi.consecutive_failures || 0) >= 2) {
      const penalty = upi.consecutive_failures * 3;
      totalScore -= penalty;
      breakdown.consecutiveFailures = -penalty;
    }

    // 11. Geo scoring
    let geoMatch: 'city' | 'state' | 'none' = 'none';
    let geoBoost = 0;
    if (this.userGeo && (this.userGeo.city || this.userGeo.state)) {
      const geoResult = getGeoMatch(this.userGeo.city, this.userGeo.state, upi.bank_city, upi.bank_state);
      geoMatch = geoResult.match;
      geoBoost = geoResult.boost;
      if (geoBoost > 0) {
        totalScore += geoBoost;
        breakdown.geoBoost = geoBoost;
      }
    }

    // Minimum score threshold
    if (totalScore < 10) return null;

    return {
      ...upi,
      score: Math.round(totalScore * 10) / 10,
      breakdown,
      tierMatch,
      geoMatch,
      geoBoost,
    };
  }

  // FLATTER weighted random - score^1.3 instead of ^2
  private weightedRandomSelect(candidates: ScoredUpi[]): ScoredUpi | null {
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    // Use flatter exponent for more even distribution
    const boosted = candidates.map(c => ({
      ...c,
      weight: Math.pow(c.score, 1.3), // Flatter than ^2
    }));

    const totalWeight = boosted.reduce((a, b) => a + b.weight, 0);
    let random = Math.random() * totalWeight;

    for (const c of boosted) {
      random -= c.weight;
      if (random <= 0) {
        // Track this trader as recently used
        const idx = recentTraders.indexOf(c.trader_id);
        if (idx !== -1) recentTraders.splice(idx, 1);
        recentTraders.unshift(c.trader_id);
        if (recentTraders.length > MAX_RECENT_TRADERS) recentTraders.pop();
        
        return c;
      }
    }

    return candidates[0];
  }

  async selectUpi(amount: number, merchantId: string, userId: string, userGeo?: GeoLocation | null): Promise<any> {
    this.userGeo = userGeo || null;
    const tier = this.getAmountTier(amount);

    // Load context
    await Promise.all([
      this.loadBankCircuits(),
      this.loadMerchantAffinities(merchantId),
    ]);

    // Get active UPIs
    const { data: upis } = await this.supabase
      .from('upi_pool')
      .select(`
        id, upi_id, holder_name, trader_id, status,
        daily_limit, daily_volume, daily_count, success_rate,
        last_used_at, hourly_failures, amount_tier,
        min_amount, max_amount, bank_name,
        consecutive_successes, consecutive_failures, performance_multiplier,
        bank_city, bank_state,
        traders!inner (id, name, balance, is_active)
      `)
      .eq('status', 'active')
      .eq('traders.is_active', true);

    if (!upis?.length) {
      return { success: false, error: 'No active UPIs', errorCode: 'NO_UPIS' };
    }

    // Transform and score
    const candidates: UpiCandidate[] = upis.map((u: any) => ({
      id: u.id,
      upi_id: u.upi_id,
      holder_name: u.holder_name,
      trader_id: u.trader_id,
      trader_name: u.traders?.name || 'Unknown',
      trader_balance: u.traders?.balance || 0,
      status: u.status,
      daily_limit: u.daily_limit || 100000,
      daily_volume: u.daily_volume || 0,
      daily_count: u.daily_count || 0,
      success_rate: u.success_rate ?? 100,
      last_used_at: u.last_used_at,
      hourly_failures: u.hourly_failures || 0,
      amount_tier: u.amount_tier || 'medium',
      min_amount: u.min_amount || 0,
      max_amount: u.max_amount || 100000,
      bank_name: u.bank_name || 'unknown',
      consecutive_successes: u.consecutive_successes || 0,
      consecutive_failures: u.consecutive_failures || 0,
      performance_multiplier: u.performance_multiplier || 1,
      bank_city: u.bank_city || null,
      bank_state: u.bank_state || null,
    }));

    // First try: strict tier matching
    let scored = candidates
      .map(c => this.scoreUpi(c, amount, false))
      .filter((c): c is ScoredUpi => c !== null)
      .sort((a, b) => b.score - a.score);

    // Fallback: if no tier-matched UPIs, try ANY UPI that can handle the amount
    let usedFallback = false;
    if (scored.length === 0) {
      console.log(`[Engine v5] No tier match for ${amount}, trying fallback...`);
      scored = candidates
        .map(c => this.scoreUpi(c, amount, true)) // allowTierMismatch = true
        .filter((c): c is ScoredUpi => c !== null)
        .sort((a, b) => b.score - a.score);
      usedFallback = true;
    }

    if (scored.length === 0) {
      return { success: false, error: 'No suitable UPIs', errorCode: 'NO_MATCH' };
    }

    // Select with weighted random
    const selected = this.weightedRandomSelect(scored);
    if (!selected) {
      return { success: false, error: 'Selection failed', errorCode: 'SELECT_FAIL' };
    }

    // Build fallback chain (top 3 from different traders)
    const fallbackChain = this.buildFallbackChain(scored, 3);

    // Log selection
    await this.logSelection(selected, amount, merchantId, tier, fallbackChain.map(u => u.id), usedFallback);

    return {
      success: true,
      upiId: selected.upi_id,
      upiPoolId: selected.id,
      holderName: selected.holder_name || 'Account Holder',
      traderId: selected.trader_id,
      traderName: selected.trader_name,
      score: selected.score,
      tier,
      usedTierFallback: usedFallback,
      fallbackChain: fallbackChain.map(u => u.id),
      maxAttempts: fallbackChain.length,
      geoMatch: selected.geoMatch,
      geoBoost: selected.geoBoost,
    };
  }

  private buildFallbackChain(candidates: ScoredUpi[], maxSize: number): ScoredUpi[] {
    const chain: ScoredUpi[] = [];
    const usedTraders = new Set<string>();

    for (const c of candidates) {
      if (chain.length >= maxSize) break;
      if (!usedTraders.has(c.trader_id) || chain.length === 0) {
        chain.push(c);
        usedTraders.add(c.trader_id);
      }
    }

    return chain;
  }

  private async loadBankCircuits() {
    const cached = getCached<any[]>('bank_circuits');
    if (cached) {
      this.bankCircuits.clear();
      cached.forEach(c => this.bankCircuits.set(c.bank_name.toLowerCase(), { state: c.state, failureRate: c.failure_rate }));
      return;
    }
    const { data } = await this.supabase.from('bank_circuits').select('bank_name, state, failure_rate');
    if (data) setCache('bank_circuits', data, TTL.BANK_CIRCUITS);
    this.bankCircuits.clear();
    (data || []).forEach((c: any) => this.bankCircuits.set(c.bank_name.toLowerCase(), { state: c.state, failureRate: c.failure_rate }));
  }

  private async loadMerchantAffinities(merchantId: string) {
    const cacheKey = `merchant_affinity_${merchantId}`;
    const cached = getCached<any[]>(cacheKey);
    if (cached) {
      this.merchantAffinities.clear();
      cached.forEach(a => this.merchantAffinities.set(a.upi_pool_id, a.affinity_score));
      return;
    }
    const { data } = await this.supabase.from('merchant_upi_affinity').select('upi_pool_id, affinity_score').eq('merchant_id', merchantId).gte('total_transactions', 3);
    if (data) setCache(cacheKey, data, TTL.MERCHANT_AFFINITY);
    this.merchantAffinities.clear();
    (data || []).forEach((a: any) => this.merchantAffinities.set(a.upi_pool_id, a.affinity_score));
  }

  private async logSelection(selected: ScoredUpi, amount: number, merchantId: string, tier: string, fallbackChain: string[], usedFallback: boolean = false) {
    try {
      await this.supabase.from('selection_logs').insert({
        upi_pool_id: selected.id,
        upi_id: selected.upi_id,
        trader_id: selected.trader_id,
        merchant_id: merchantId,
        amount,
        amount_tier: tier,
        tier_match: usedFallback ? 'fallback' : selected.tierMatch,
        score: selected.score,
        score_breakdown: selected.breakdown,
        bank_name: selected.bank_name,
        engine_version: 'v5.1',
        geo_match: selected.geoMatch,
        geo_boost: selected.geoBoost,
        user_city: this.userGeo?.city || null,
        upi_city: selected.bank_city || null,
        metadata: { fallback_chain: fallbackChain },
      });
    } catch (e) {
      console.error('[Engine v5] Log error:', e);
    }
  }
}

export function createPayinEngineV5(supabase: SupabaseClient): PayinEngineV5 {
  return new PayinEngineV5(supabase);
}
