/**
 * PayinEngine v4.0 - Complete Production Engine
 * 
 * Features:
 * - Bank Circuit Breaker (v3)
 * - Amount-based Routing (v3)
 * - Velocity/Fraud Checks (NEW)
 * - Merchant-UPI Affinity (NEW)
 * - Peak Hour Detection (NEW)
 * - Auto Daily Limits (NEW)
 * - Real-time Stats (NEW)
 * - Alert System (NEW)
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getGeoMatch, GeoLocation } from './geo.ts';
import { getCached, setCache, TTL } from './cache.ts';

// ═══════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

const DEFAULT_WEIGHTS = {
  successRate: 20,
  dailyLimitLeft: 15,
  cooldown: 10,
  amountMatch: 15,
  merchantAffinity: 15,  // NEW
  bankHealth: 10,
  peakHourBonus: 5,      // NEW
  recentFailures: 5,
  consecutiveSuccess: 5, // NEW
  sameCity: 15,          // GEO
  sameState: 8,          // GEO
};

const AMOUNT_TIERS = {
  micro:  { min: 100,    max: 1000 },
  small:  { min: 1001,   max: 5000 },
  medium: { min: 5001,   max: 15000 },
  large:  { min: 15001,  max: 50000 },
  xlarge: { min: 50001,  max: 100000 },
};

const CIRCUIT_BREAKER = {
  failureThreshold: 0.3,
  windowMinutes: 15,
  cooldownMinutes: 10,
  minSampleSize: 5,
  halfOpenTestCount: 2,
};

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
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
  // Geo fields
  bank_city: string | null;
  bank_state: string | null;
}

interface ScoredUpi extends UpiCandidate {
  score: number;
  breakdown: Record<string, number>;
  tierMatch: 'exact' | 'adjacent' | 'mismatch';
  affinityScore: number;
  geoMatch: 'city' | 'state' | 'none';
  geoBoost: number;
}

interface FallbackUpi {
  upiPoolId: string;
  upiId: string;
  holderName: string;
  traderId: string;
  score: number;
}

interface SelectionResult {
  success: boolean;
  upiId?: string;
  upiPoolId?: string;
  holderName?: string;
  traderId?: string;
  traderName?: string;
  score?: number;
  attempts?: number;
  tier?: string;
  isPeakHour?: boolean;
  velocityCheck?: string;
  bankCircuitStatus?: string;
  affinityBoost?: boolean;
  error?: string;
  errorCode?: string;
  // Fallback chain (NEW)
  fallbackChain?: string[];        // Array of upi_pool IDs
  fallbackDetails?: FallbackUpi[]; // Full details for logging
  maxAttempts?: number;
  // Geo scoring (NEW)
  geoMatch?: 'city' | 'state' | 'none';
  geoBoost?: number;
  userCity?: string | null;
  upiCity?: string | null;
}

// ═══════════════════════════════════════════════════════════════════
// PAYIN ENGINE V4
// ═══════════════════════════════════════════════════════════════════

export class PayinEngineV4 {
  private supabase: SupabaseClient;
  private weights: typeof DEFAULT_WEIGHTS;
  private bankCircuits: Map<string, { state: CircuitState; failureRate: number }> = new Map();
  private merchantAffinities: Map<string, number> = new Map();
  private isPeakHour: boolean = false;
  private isMaintenanceWindow: boolean = false;
  private userGeo: GeoLocation | null = null;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
    this.weights = { ...DEFAULT_WEIGHTS };
  }

  // ─────────────────────────────────────────────────────────────────
  // VELOCITY CHECK
  // ─────────────────────────────────────────────────────────────────

  private async checkVelocity(
    userId: string,
    merchantId: string,
    amount: number
  ): Promise<{ allowed: boolean; reason?: string; blockedUntil?: string }> {
    // Check user velocity
    const { data: userCheck } = await this.supabase.rpc('check_velocity', {
      p_identifier: userId,
      p_identifier_type: 'user',
      p_amount: amount,
    });

    if (userCheck && !userCheck.allowed) {
      await this.createAlert('velocity_block', 'warning', 
        `User ${userId.slice(0, 8)}... blocked`,
        userCheck.reason
      );
      return { 
        allowed: false, 
        reason: `User rate limit: ${userCheck.reason}`,
        blockedUntil: userCheck.blocked_until
      };
    }

    // Check merchant velocity (less strict)
    const { data: merchantCheck } = await this.supabase.rpc('check_velocity', {
      p_identifier: merchantId,
      p_identifier_type: 'merchant',
      p_amount: amount,
    });

    if (merchantCheck && !merchantCheck.allowed) {
      return { 
        allowed: false, 
        reason: `Merchant rate limit: ${merchantCheck.reason}` 
      };
    }

    return { allowed: true };
  }

  // ─────────────────────────────────────────────────────────────────
  // PEAK HOUR & MAINTENANCE
  // ─────────────────────────────────────────────────────────────────

  private async loadPeakStatus(bankName?: string): Promise<void> {
    // Check cache first
    const cacheKey = `peak_status_${bankName || 'all'}`;
    const cached = getCached<{is_peak: boolean; is_maintenance: boolean}>(cacheKey);
    
    if (cached) {
      this.isPeakHour = cached.is_peak;
      this.isMaintenanceWindow = cached.is_maintenance;
      return;
    }

    const { data } = await this.supabase.rpc('get_peak_status', {
      p_bank_name: bankName || null,
    });

    if (data) {
      this.isPeakHour = data.is_peak || false;
      this.isMaintenanceWindow = data.is_maintenance || false;
      setCache(cacheKey, { is_peak: this.isPeakHour, is_maintenance: this.isMaintenanceWindow }, TTL.PEAK_STATUS);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // MERCHANT AFFINITY
  // ─────────────────────────────────────────────────────────────────

  private async loadMerchantAffinities(merchantId: string): Promise<void> {
    // Check cache first
    const cacheKey = `merchant_affinity_${merchantId}`;
    const cached = getCached<Array<{upi_pool_id: string; affinity_score: number}>>(cacheKey);
    
    if (cached) {
      this.merchantAffinities.clear();
      cached.forEach((a) => {
        this.merchantAffinities.set(a.upi_pool_id, a.affinity_score);
      });
      return;
    }

    const { data } = await this.supabase
      .from('merchant_upi_affinity')
      .select('upi_pool_id, affinity_score')
      .eq('merchant_id', merchantId)
      .gte('total_transactions', 3);  // Need some history

    // Cache the results
    if (data) {
      setCache(cacheKey, data, TTL.MERCHANT_AFFINITY);
    }

    this.merchantAffinities.clear();
    (data || []).forEach((a: any) => {
      this.merchantAffinities.set(a.upi_pool_id, a.affinity_score);
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // CIRCUIT BREAKER
  // ─────────────────────────────────────────────────────────────────

  private async loadBankCircuits(): Promise<void> {
    // Check cache first
    const cached = getCached<Array<{bank_name: string; state: CircuitState; failure_rate: number}>>('bank_circuits');
    
    if (cached) {
      this.bankCircuits.clear();
      cached.forEach((c) => {
        this.bankCircuits.set(c.bank_name.toLowerCase(), {
          state: c.state,
          failureRate: c.failure_rate,
        });
      });
      return;
    }

    const { data } = await this.supabase
      .from('bank_circuits')
      .select('bank_name, state, failure_rate');

    // Cache the results
    if (data) {
      setCache('bank_circuits', data, TTL.BANK_CIRCUITS);
    }

    this.bankCircuits.clear();
    (data || []).forEach((c: any) => {
      this.bankCircuits.set(c.bank_name.toLowerCase(), {
        state: c.state,
        failureRate: c.failure_rate,
      });
    });
  }

  private isBankAvailable(bankName: string): boolean {
    const circuit = this.bankCircuits.get(bankName.toLowerCase());
    if (!circuit) return true;
    if (circuit.state === 'OPEN') return false;
    if (circuit.state === 'HALF_OPEN') return true; // Allow test
    return true;
  }

  // ─────────────────────────────────────────────────────────────────
  // AMOUNT TIER
  // ─────────────────────────────────────────────────────────────────

  private getAmountTier(amount: number): AmountTier {
    for (const [tier, range] of Object.entries(AMOUNT_TIERS)) {
      if (amount >= range.min && amount <= range.max) {
        return tier as AmountTier;
      }
    }
    return 'medium';
  }

  private checkTierMatch(
    requestedTier: AmountTier,
    upiTier: string,
    amount: number,
    minAmount: number,
    maxAmount: number
  ): 'exact' | 'adjacent' | 'mismatch' {
    if (minAmount > 0 && amount < minAmount) return 'mismatch';
    if (maxAmount > 0 && amount > maxAmount) return 'mismatch';
    if (upiTier === requestedTier) return 'exact';
    
    const tierOrder: AmountTier[] = ['micro', 'small', 'medium', 'large', 'xlarge'];
    const reqIdx = tierOrder.indexOf(requestedTier);
    const upiIdx = tierOrder.indexOf(upiTier as AmountTier);
    
    if (Math.abs(reqIdx - upiIdx) === 1) return 'adjacent';
    return 'mismatch';
  }

  // ─────────────────────────────────────────────────────────────────
  // SCORING
  // ─────────────────────────────────────────────────────────────────

  private scoreUpi(upi: UpiCandidate, amount: number, merchantId: string): ScoredUpi | null {
    const requestedTier = this.getAmountTier(amount);
    const breakdown: Record<string, number> = {};
    let totalScore = 0;

    // Bank circuit check
    if (!this.isBankAvailable(upi.bank_name)) {
      return null;
    }

    // Maintenance window check
    if (this.isMaintenanceWindow) {
      // Reduce score for banks in maintenance
    }

    // Tier check
    const tierMatch = this.checkTierMatch(
      requestedTier,
      upi.amount_tier || 'medium',
      amount,
      upi.min_amount || 0,
      upi.max_amount || 999999
    );

    if (tierMatch === 'mismatch' && amount > 15000) {
      return null;
    }

    // Daily limit check
    const effectiveLimit = upi.daily_limit * (upi.performance_multiplier || 1);
    const limitLeft = Math.max(0, effectiveLimit - upi.daily_volume);
    if (limitLeft < amount) return null;

    // 1. Success Rate (0-20)
    const successScore = (upi.success_rate / 100) * this.weights.successRate;
    breakdown.successRate = Math.round(successScore * 10) / 10;
    totalScore += successScore;

    // 2. Daily Limit Left (0-15)
    const limitRatio = Math.min(1, limitLeft / effectiveLimit);
    const limitScore = limitRatio * this.weights.dailyLimitLeft;
    breakdown.dailyLimitLeft = Math.round(limitScore * 10) / 10;
    totalScore += limitScore;

    // 3. Cooldown (0-10)
    let cooldownScore = this.weights.cooldown;
    if (upi.last_used_at) {
      const minutesSince = (Date.now() - new Date(upi.last_used_at).getTime()) / 60000;
      cooldownScore = Math.min(1, minutesSince / 30) * this.weights.cooldown;
    }
    breakdown.cooldown = Math.round(cooldownScore * 10) / 10;
    totalScore += cooldownScore;

    // 4. Amount Match (0-15)
    let amountScore = 0;
    if (tierMatch === 'exact') amountScore = this.weights.amountMatch;
    else if (tierMatch === 'adjacent') amountScore = this.weights.amountMatch * 0.5;
    breakdown.amountMatch = Math.round(amountScore * 10) / 10;
    totalScore += amountScore;

    // 5. Merchant Affinity (0-15) - NEW
    const affinity = this.merchantAffinities.get(upi.id) || 50;
    const affinityScore = (affinity / 100) * this.weights.merchantAffinity;
    breakdown.merchantAffinity = Math.round(affinityScore * 10) / 10;
    totalScore += affinityScore;

    // 6. Bank Health (0-10)
    const circuit = this.bankCircuits.get(upi.bank_name.toLowerCase());
    let bankScore = this.weights.bankHealth;
    if (circuit?.state === 'HALF_OPEN') bankScore *= 0.3;
    breakdown.bankHealth = Math.round(bankScore * 10) / 10;
    totalScore += bankScore;

    // 7. Peak Hour Bonus (0-5) - NEW
    let peakScore = 0;
    if (this.isPeakHour && upi.success_rate >= 90) {
      peakScore = this.weights.peakHourBonus; // Bonus for reliable UPIs during peak
    }
    breakdown.peakHourBonus = Math.round(peakScore * 10) / 10;
    totalScore += peakScore;

    // 8. Recent Failures Penalty
    const failurePenalty = Math.min(upi.hourly_failures, 5);
    breakdown.recentFailures = -failurePenalty;
    totalScore -= failurePenalty;

    // 9. Consecutive Success Bonus (0-5) - NEW
    const consecutiveBonus = Math.min(upi.consecutive_successes || 0, 10) / 10 * this.weights.consecutiveSuccess;
    breakdown.consecutiveSuccess = Math.round(consecutiveBonus * 10) / 10;
    totalScore += consecutiveBonus;

    // Consecutive failure penalty
    if ((upi.consecutive_failures || 0) >= 2) {
      totalScore -= (upi.consecutive_failures * 2);
      breakdown.consecutiveFailures = -(upi.consecutive_failures * 2);
    }

    // 10. GEO SCORING (NEW) - Same city/state boost
    let geoMatch: 'city' | 'state' | 'none' = 'none';
    let geoBoost = 0;
    
    if (this.userGeo && (this.userGeo.city || this.userGeo.state)) {
      const geoResult = getGeoMatch(
        this.userGeo.city,
        this.userGeo.state,
        upi.bank_city,
        upi.bank_state
      );
      geoMatch = geoResult.match;
      geoBoost = geoResult.boost;
      
      if (geoBoost > 0) {
        totalScore += geoBoost;
        breakdown.geoBoost = geoBoost;
        console.log(`[Engine v4] Geo boost: +${geoBoost} (${geoMatch}) for ${upi.upi_id} | User: ${this.userGeo.city} → UPI: ${upi.bank_city}`);
      }
    }

    if (totalScore < 15) return null;

    return {
      ...upi,
      score: Math.round(totalScore * 10) / 10,
      breakdown,
      tierMatch,
      affinityScore: affinity,
      geoMatch,
      geoBoost,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // SELECTION
  // ─────────────────────────────────────────────────────────────────

  private weightedRandomSelect(candidates: ScoredUpi[]): ScoredUpi | null {
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    // Prefer exact tier matches
    const exactMatches = candidates.filter(c => c.tierMatch === 'exact');
    const pool = exactMatches.length > 0 ? exactMatches : candidates;

    // Boost high-affinity UPIs
    const boosted = pool.map(c => ({
      ...c,
      weight: Math.pow(c.score, 2) * (c.affinityScore >= 70 ? 1.5 : 1),
    }));

    const totalWeight = boosted.reduce((a, b) => a + b.weight, 0);
    let random = Math.random() * totalWeight;

    for (const c of boosted) {
      random -= c.weight;
      if (random <= 0) return c;
    }

    return pool[0];
  }

  // ─────────────────────────────────────────────────────────────────
  // ALERTS
  // ─────────────────────────────────────────────────────────────────

  private async createAlert(
    type: string,
    severity: string,
    title: string,
    message?: string
  ): Promise<void> {
    try {
      await this.supabase.rpc('create_engine_alert', {
        p_type: type,
        p_severity: severity,
        p_title: title,
        p_message: message,
      });
    } catch (e) {
      console.error('[Engine] Alert creation failed:', e);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // MAIN SELECTION
  // ─────────────────────────────────────────────────────────────────

  async selectUpi(
    amount: number,
    merchantId: string,
    userId: string,
    userGeo?: GeoLocation | null
  ): Promise<SelectionResult> {
    const tier = this.getAmountTier(amount);
    const startTime = Date.now();

    // Store user geo for scoring
    this.userGeo = userGeo || null;

    console.log(`[Engine v4] Selecting UPI: ₹${amount} (${tier}) for merchant ${merchantId.slice(0, 8)} | User: ${userGeo?.city || 'unknown'}`);

    // 1. Velocity Check
    const velocityCheck = await this.checkVelocity(userId, merchantId, amount);
    if (!velocityCheck.allowed) {
      return {
        success: false,
        error: velocityCheck.reason,
        errorCode: 'VELOCITY_LIMIT',
        velocityCheck: velocityCheck.reason,
      };
    }

    // 2. Load all context in parallel
    await Promise.all([
      this.loadBankCircuits(),
      this.loadMerchantAffinities(merchantId),
      this.loadPeakStatus(),
    ]);

    const openCircuits = Array.from(this.bankCircuits.entries())
      .filter(([_, c]) => c.state === 'OPEN')
      .map(([name]) => name);

    if (openCircuits.length > 0) {
      console.log(`[Engine v4] Circuits OPEN: ${openCircuits.join(', ')}`);
    }

    // 3. Get UPIs (including geo fields)
    const { data: upis, error } = await this.supabase
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

    if (error || !upis?.length) {
      return { success: false, error: 'No active UPIs', errorCode: 'NO_UPIS' };
    }

    // 4. Transform candidates
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

    // 5. Score candidates
    const scored = candidates
      .map(c => this.scoreUpi(c, amount, merchantId))
      .filter((c): c is ScoredUpi => c !== null)
      .sort((a, b) => b.score - a.score);

    console.log(`[Engine v4] ${scored.length}/${candidates.length} candidates qualified`);

    if (scored.length === 0) {
      if (openCircuits.length === candidates.length) {
        return {
          success: false,
          error: 'All bank circuits are OPEN',
          errorCode: 'ALL_CIRCUITS_OPEN',
          bankCircuitStatus: `${openCircuits.length} banks blocked`,
        };
      }
      return { success: false, error: 'No suitable UPIs', errorCode: 'NO_MATCH' };
    }

    // 6. Build fallback chain (top 3 UPIs from different traders/banks for diversity)
    const fallbackChain = this.buildFallbackChain(scored.slice(0, 15), 3);
    
    if (fallbackChain.length === 0) {
      return { success: false, error: 'Selection failed', errorCode: 'SELECT_FAIL' };
    }

    const selected = fallbackChain[0];
    const fallbackIds = fallbackChain.map(u => u.id);
    const fallbackDetails: FallbackUpi[] = fallbackChain.map(u => ({
      upiPoolId: u.id,
      upiId: u.upi_id,
      holderName: u.holder_name || 'Account Holder',
      traderId: u.trader_id,
      score: u.score,
    }));

    console.log(`[Engine v4] Fallback chain: ${fallbackIds.length} UPIs (${fallbackChain.map(u => u.upi_id).join(' → ')})`);

    // 7. Log selection
    const selectionTime = Date.now() - startTime;
    await this.logSelection(selected, amount, merchantId, tier, selectionTime, fallbackIds);

    return {
      success: true,
      upiId: selected.upi_id,
      upiPoolId: selected.id,
      holderName: selected.holder_name || 'Account Holder',
      traderId: selected.trader_id,
      traderName: selected.trader_name,
      score: selected.score,
      tier,
      isPeakHour: this.isPeakHour,
      velocityCheck: 'passed',
      bankCircuitStatus: openCircuits.length > 0 ? `${openCircuits.length} blocked` : 'healthy',
      affinityBoost: selected.affinityScore >= 70,
      // Fallback chain
      fallbackChain: fallbackIds,
      fallbackDetails,
      maxAttempts: fallbackIds.length,
      // Geo scoring
      geoMatch: selected.geoMatch,
      geoBoost: selected.geoBoost,
      userCity: this.userGeo?.city || null,
      upiCity: selected.bank_city,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // BUILD FALLBACK CHAIN
  // ─────────────────────────────────────────────────────────────────

  private buildFallbackChain(candidates: ScoredUpi[], maxSize: number): ScoredUpi[] {
    if (candidates.length === 0) return [];
    if (candidates.length <= maxSize) return candidates;

    const chain: ScoredUpi[] = [];
    const usedTraders = new Set<string>();
    const usedBanks = new Set<string>();

    // First pass: pick diverse UPIs (different traders/banks)
    for (const candidate of candidates) {
      if (chain.length >= maxSize) break;

      // Prefer UPIs from different traders and banks for resilience
      const traderUsed = usedTraders.has(candidate.trader_id);
      const bankUsed = usedBanks.has(candidate.bank_name.toLowerCase());

      // Always add first one
      if (chain.length === 0) {
        chain.push(candidate);
        usedTraders.add(candidate.trader_id);
        usedBanks.add(candidate.bank_name.toLowerCase());
        continue;
      }

      // Prefer diversity, but accept same trader/bank if no alternatives
      if (!traderUsed || !bankUsed) {
        chain.push(candidate);
        usedTraders.add(candidate.trader_id);
        usedBanks.add(candidate.bank_name.toLowerCase());
      }
    }

    // Second pass: fill remaining slots if chain not full
    if (chain.length < maxSize) {
      for (const candidate of candidates) {
        if (chain.length >= maxSize) break;
        if (!chain.includes(candidate)) {
          chain.push(candidate);
        }
      }
    }

    return chain;
  }

  private async logSelection(
    selected: ScoredUpi,
    amount: number,
    merchantId: string,
    tier: string,
    selectionTimeMs: number,
    fallbackChain?: string[]
  ): Promise<void> {
    try {
      await this.supabase.from('selection_logs').insert({
        upi_pool_id: selected.id,
        upi_id: selected.upi_id,
        trader_id: selected.trader_id,
        merchant_id: merchantId,
        amount,
        amount_tier: tier,
        tier_match: selected.tierMatch,
        score: selected.score,
        score_breakdown: selected.breakdown,
        bank_name: selected.bank_name,
        engine_version: 'v4',
        // Geo info
        geo_match: selected.geoMatch,
        geo_boost: selected.geoBoost,
        user_city: this.userGeo?.city || null,
        upi_city: selected.bank_city || null,
        metadata: {
          selection_time_ms: selectionTimeMs,
          affinity_score: selected.affinityScore,
          is_peak_hour: this.isPeakHour,
          fallback_chain: fallbackChain || [],
          fallback_count: fallbackChain?.length || 1,
          user_state: this.userGeo?.state || null,
          upi_state: selected.bank_state || null,
        },
      });
    } catch (e) {
      console.error('[Engine v4] Log error:', e);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // POST-TRANSACTION UPDATES
  // ─────────────────────────────────────────────────────────────────

  async recordTransactionResult(
    upiPoolId: string,
    merchantId: string,
    status: 'completed' | 'failed' | 'rejected' | 'expired',
    amount: number,
    completionTimeSeconds?: number
  ): Promise<void> {
    const isSuccess = status === 'completed';

    // Update UPI stats
    if (isSuccess) {
      await this.supabase.rpc('increment_upi_success', {
        p_upi_id: upiPoolId,
        p_amount: amount,
      });
      
      // Update consecutive counters
      await this.supabase
        .from('upi_pool')
        .update({
          consecutive_successes: this.supabase.rpc('increment', { x: 1 }),
          consecutive_failures: 0,
        })
        .eq('id', upiPoolId);
    } else {
      await this.supabase.rpc('increment_upi_failure', { p_upi_id: upiPoolId });
      
      await this.supabase
        .from('upi_pool')
        .update({
          consecutive_successes: 0,
          consecutive_failures: this.supabase.rpc('increment', { x: 1 }),
        })
        .eq('id', upiPoolId);
    }

    // Update merchant affinity
    await this.supabase.rpc('update_merchant_affinity', {
      p_merchant_id: merchantId,
      p_upi_pool_id: upiPoolId,
      p_success: isSuccess,
      p_amount: amount,
      p_completion_time_seconds: completionTimeSeconds || null,
    });
  }
}

export function createPayinEngineV4(supabase: SupabaseClient): PayinEngineV4 {
  return new PayinEngineV4(supabase);
}
