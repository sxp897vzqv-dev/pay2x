/**
 * PayinEngine v3.0 for Supabase
 * 
 * New Features:
 * - Bank Circuit Breaker (auto-detect and block failing banks)
 * - Amount-based Routing (strict tier matching)
 * - Real-time failure tracking
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ═══════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

const DEFAULT_WEIGHTS = {
  successRate: 25,
  dailyLimitLeft: 20,
  cooldown: 15,
  amountMatch: 20,  // Increased from 15 - amount matching is critical
  traderBalance: 5, // Reduced - less critical for payins
  bankHealth: 10,   // Increased - circuit breaker makes this important
  recentFailures: 5,
};

// Amount tiers with stricter boundaries
const AMOUNT_TIERS = {
  micro:  { min: 100,    max: 1000,   label: 'Micro (₹100-1K)' },
  small:  { min: 1001,   max: 5000,   label: 'Small (₹1K-5K)' },
  medium: { min: 5001,   max: 15000,  label: 'Medium (₹5K-15K)' },
  large:  { min: 15001,  max: 50000,  label: 'Large (₹15K-50K)' },
  xlarge: { min: 50001,  max: 100000, label: 'XLarge (₹50K-1L)' },
};

// Circuit Breaker Config
const CIRCUIT_BREAKER = {
  failureThreshold: 0.3,      // 30% failure rate trips circuit
  windowMinutes: 15,          // Look at last 15 minutes
  cooldownMinutes: 10,        // Stay open for 10 minutes
  minSampleSize: 5,           // Need at least 5 transactions to evaluate
  halfOpenTestCount: 2,       // Allow 2 test transactions in half-open
};

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
type AmountTier = keyof typeof AMOUNT_TIERS;

interface BankCircuit {
  bankName: string;
  state: CircuitState;
  failureRate: number;
  totalCount: number;
  failureCount: number;
  lastTrippedAt: string | null;
  halfOpenAttempts: number;
}

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
}

interface ScoredUpi extends UpiCandidate {
  score: number;
  breakdown: Record<string, number>;
  tierMatch: 'exact' | 'adjacent' | 'mismatch';
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
  bankCircuitStatus?: string;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════
// PAYIN ENGINE V3
// ═══════════════════════════════════════════════════════════════════

export class PayinEngineV3 {
  private supabase: SupabaseClient;
  private weights: typeof DEFAULT_WEIGHTS;
  private bankCircuits: Map<string, BankCircuit> = new Map();

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
    this.weights = { ...DEFAULT_WEIGHTS };
  }

  // ─────────────────────────────────────────────────────────────────
  // CONFIG
  // ─────────────────────────────────────────────────────────────────

  async loadConfig(): Promise<void> {
    try {
      const { data } = await this.supabase
        .from('system_config')
        .select('value')
        .eq('key', 'payin_engine_v3_weights')
        .single();

      if (data?.value) {
        this.weights = { ...DEFAULT_WEIGHTS, ...data.value };
      }
    } catch (e) {
      console.log('[Engine] Using default weights');
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // CIRCUIT BREAKER
  // ─────────────────────────────────────────────────────────────────

  /**
   * Load and evaluate circuit breaker states for all banks
   */
  private async loadBankCircuits(): Promise<void> {
    const windowStart = new Date(Date.now() - CIRCUIT_BREAKER.windowMinutes * 60 * 1000).toISOString();

    // Get recent transaction stats per bank
    const { data: stats } = await this.supabase
      .from('payins')
      .select('upi_id, status, created_at')
      .gte('created_at', windowStart)
      .in('status', ['completed', 'failed', 'rejected', 'expired']);

    // Get bank name for each UPI
    const { data: upiBank } = await this.supabase
      .from('upi_pool')
      .select('upi_id, bank_name');

    const upiBankMap = new Map<string, string>();
    (upiBank || []).forEach((u: any) => {
      upiBankMap.set(u.upi_id, (u.bank_name || 'unknown').toLowerCase());
    });

    // Aggregate stats by bank
    const bankStats = new Map<string, { total: number; failed: number }>();
    (stats || []).forEach((txn: any) => {
      const bank = upiBankMap.get(txn.upi_id) || 'unknown';
      const current = bankStats.get(bank) || { total: 0, failed: 0 };
      current.total++;
      if (['failed', 'rejected', 'expired'].includes(txn.status)) {
        current.failed++;
      }
      bankStats.set(bank, current);
    });

    // Get stored circuit states
    const { data: storedCircuits } = await this.supabase
      .from('bank_circuits')
      .select('*');

    const storedMap = new Map<string, any>();
    (storedCircuits || []).forEach((c: any) => {
      storedMap.set(c.bank_name.toLowerCase(), c);
    });

    // Evaluate each bank
    for (const [bank, stat] of bankStats) {
      const stored = storedMap.get(bank);
      const failureRate = stat.total > 0 ? stat.failed / stat.total : 0;

      let state: CircuitState = 'CLOSED';
      let halfOpenAttempts = 0;

      if (stored) {
        // Check if circuit should remain open or transition
        if (stored.state === 'OPEN') {
          const trippedAt = new Date(stored.last_tripped_at).getTime();
          const cooldownExpired = Date.now() - trippedAt > CIRCUIT_BREAKER.cooldownMinutes * 60 * 1000;
          
          if (cooldownExpired) {
            state = 'HALF_OPEN';
            halfOpenAttempts = 0;
          } else {
            state = 'OPEN';
          }
        } else if (stored.state === 'HALF_OPEN') {
          halfOpenAttempts = stored.half_open_attempts || 0;
          // Check if we should close or re-open
          if (halfOpenAttempts >= CIRCUIT_BREAKER.halfOpenTestCount) {
            // Evaluate recent half-open transactions
            if (failureRate < CIRCUIT_BREAKER.failureThreshold) {
              state = 'CLOSED';
            } else {
              state = 'OPEN'; // Re-trip
            }
          } else {
            state = 'HALF_OPEN';
          }
        } else {
          // CLOSED - check if should trip
          if (stat.total >= CIRCUIT_BREAKER.minSampleSize && 
              failureRate >= CIRCUIT_BREAKER.failureThreshold) {
            state = 'OPEN';
            console.log(`[CircuitBreaker] TRIPPED for ${bank}: ${(failureRate * 100).toFixed(1)}% failure rate`);
          }
        }
      } else {
        // New bank - check if should trip immediately
        if (stat.total >= CIRCUIT_BREAKER.minSampleSize && 
            failureRate >= CIRCUIT_BREAKER.failureThreshold) {
          state = 'OPEN';
        }
      }

      this.bankCircuits.set(bank, {
        bankName: bank,
        state,
        failureRate,
        totalCount: stat.total,
        failureCount: stat.failed,
        lastTrippedAt: state === 'OPEN' ? (stored?.last_tripped_at || new Date().toISOString()) : null,
        halfOpenAttempts,
      });
    }

    // Persist circuit states
    await this.persistCircuitStates();
  }

  /**
   * Persist circuit states to database
   */
  private async persistCircuitStates(): Promise<void> {
    const upserts = Array.from(this.bankCircuits.values()).map(c => ({
      bank_name: c.bankName,
      state: c.state,
      failure_rate: c.failureRate,
      total_count: c.totalCount,
      failure_count: c.failureCount,
      last_tripped_at: c.lastTrippedAt,
      half_open_attempts: c.halfOpenAttempts,
      updated_at: new Date().toISOString(),
    }));

    if (upserts.length > 0) {
      await this.supabase
        .from('bank_circuits')
        .upsert(upserts, { onConflict: 'bank_name' });
    }
  }

  /**
   * Check if a bank is available (circuit not open)
   */
  private isBankAvailable(bankName: string): { available: boolean; state: CircuitState; reason?: string } {
    const bank = bankName.toLowerCase();
    const circuit = this.bankCircuits.get(bank);

    if (!circuit) {
      return { available: true, state: 'CLOSED' };
    }

    if (circuit.state === 'OPEN') {
      return { 
        available: false, 
        state: 'OPEN',
        reason: `Bank ${bankName} circuit OPEN (${(circuit.failureRate * 100).toFixed(0)}% failures)` 
      };
    }

    if (circuit.state === 'HALF_OPEN') {
      // Allow limited test transactions
      if (circuit.halfOpenAttempts < CIRCUIT_BREAKER.halfOpenTestCount) {
        return { available: true, state: 'HALF_OPEN' };
      }
      return { 
        available: false, 
        state: 'HALF_OPEN',
        reason: `Bank ${bankName} in HALF_OPEN, max test transactions reached` 
      };
    }

    return { available: true, state: 'CLOSED' };
  }

  // ─────────────────────────────────────────────────────────────────
  // AMOUNT ROUTING
  // ─────────────────────────────────────────────────────────────────

  /**
   * Determine amount tier
   */
  private getAmountTier(amount: number): AmountTier {
    for (const [tier, range] of Object.entries(AMOUNT_TIERS)) {
      if (amount >= range.min && amount <= range.max) {
        return tier as AmountTier;
      }
    }
    return 'medium'; // fallback
  }

  /**
   * Check tier compatibility
   */
  private checkTierMatch(
    requestedTier: AmountTier,
    upiTier: string,
    amount: number,
    minAmount: number,
    maxAmount: number
  ): 'exact' | 'adjacent' | 'mismatch' {
    // First check hard limits
    if (minAmount > 0 && amount < minAmount) return 'mismatch';
    if (maxAmount > 0 && amount > maxAmount) return 'mismatch';

    // Check tier match
    if (upiTier === requestedTier) return 'exact';

    // Adjacent tiers
    const tierOrder: AmountTier[] = ['micro', 'small', 'medium', 'large', 'xlarge'];
    const requestedIdx = tierOrder.indexOf(requestedTier);
    const upiIdx = tierOrder.indexOf(upiTier as AmountTier);

    if (Math.abs(requestedIdx - upiIdx) === 1) return 'adjacent';

    return 'mismatch';
  }

  // ─────────────────────────────────────────────────────────────────
  // SCORING
  // ─────────────────────────────────────────────────────────────────

  /**
   * Score a single UPI candidate
   */
  private scoreUpi(upi: UpiCandidate, amount: number): ScoredUpi | null {
    const requestedTier = this.getAmountTier(amount);
    const breakdown: Record<string, number> = {};
    let totalScore = 0;

    // Check bank circuit breaker FIRST
    const bankCheck = this.isBankAvailable(upi.bank_name);
    if (!bankCheck.available) {
      return null; // Skip this UPI entirely
    }

    // Check tier compatibility
    const tierMatch = this.checkTierMatch(
      requestedTier,
      upi.amount_tier || 'medium',
      amount,
      upi.min_amount || 0,
      upi.max_amount || 999999
    );

    // STRICT: Reject mismatched tiers for amounts > 15k
    if (tierMatch === 'mismatch') {
      if (amount > 15000) {
        return null; // Hard reject for large amounts
      }
      // For smaller amounts, heavy penalty but don't reject
    }

    // 1. Success Rate (0-25 points)
    const successScore = (upi.success_rate / 100) * this.weights.successRate;
    breakdown.successRate = Math.round(successScore * 10) / 10;
    totalScore += successScore;

    // 2. Daily Limit Left (0-20 points)
    const limitLeft = Math.max(0, upi.daily_limit - upi.daily_volume);
    if (limitLeft < amount) return null; // Can't handle this amount
    
    const limitRatio = Math.min(1, limitLeft / (upi.daily_limit || 100000));
    const limitScore = limitRatio * this.weights.dailyLimitLeft;
    breakdown.dailyLimitLeft = Math.round(limitScore * 10) / 10;
    totalScore += limitScore;

    // 3. Cooldown (0-15 points)
    let cooldownScore = 15; // Full points if never used
    if (upi.last_used_at) {
      const minutesSince = (Date.now() - new Date(upi.last_used_at).getTime()) / 60000;
      cooldownScore = Math.min(1, minutesSince / 30) * 15;
    }
    breakdown.cooldown = Math.round(cooldownScore * 10) / 10;
    totalScore += cooldownScore;

    // 4. Amount Match (0-20 points) - INCREASED IMPORTANCE
    let amountScore = 0;
    if (tierMatch === 'exact') {
      amountScore = this.weights.amountMatch;
    } else if (tierMatch === 'adjacent') {
      amountScore = this.weights.amountMatch * 0.5;
    } else {
      amountScore = 0; // Mismatch
    }
    breakdown.amountMatch = Math.round(amountScore * 10) / 10;
    totalScore += amountScore;

    // 5. Trader Balance (0-5 points)
    const balanceScore = upi.trader_balance >= 10000 ? this.weights.traderBalance : 
      (upi.trader_balance / 10000) * this.weights.traderBalance;
    breakdown.traderBalance = Math.round(balanceScore * 10) / 10;
    totalScore += balanceScore;

    // 6. Bank Health (0-10 points) - Based on circuit state
    let bankScore = 0;
    if (bankCheck.state === 'CLOSED') {
      bankScore = this.weights.bankHealth;
    } else if (bankCheck.state === 'HALF_OPEN') {
      bankScore = this.weights.bankHealth * 0.3; // Reduced but not zero
    }
    breakdown.bankHealth = Math.round(bankScore * 10) / 10;
    totalScore += bankScore;

    // 7. Recent Failures Penalty
    const failurePenalty = Math.min(upi.hourly_failures, 5);
    breakdown.recentFailures = -failurePenalty;
    totalScore -= failurePenalty;

    // Minimum score threshold
    if (totalScore < 20) return null;

    return {
      ...upi,
      score: Math.round(totalScore * 10) / 10,
      breakdown,
      tierMatch,
    };
  }

  /**
   * Weighted random selection
   */
  private weightedRandomSelect(candidates: ScoredUpi[]): ScoredUpi | null {
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    // Prioritize exact tier matches
    const exactMatches = candidates.filter(c => c.tierMatch === 'exact');
    const pool = exactMatches.length > 0 ? exactMatches : candidates;

    const weights = pool.map(c => Math.pow(Math.max(c.score, 1), 2));
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    let random = Math.random() * totalWeight;
    for (let i = 0; i < pool.length; i++) {
      random -= weights[i];
      if (random <= 0) return pool[i];
    }

    return pool[0];
  }

  // ─────────────────────────────────────────────────────────────────
  // MAIN SELECTION
  // ─────────────────────────────────────────────────────────────────

  /**
   * Select best UPI for amount
   */
  async selectUpi(amount: number, merchantId: string): Promise<SelectionResult> {
    const tier = this.getAmountTier(amount);
    console.log(`[Engine] Selecting UPI for ₹${amount} (tier: ${tier})`);

    // Load config and circuit breaker states
    await Promise.all([
      this.loadConfig(),
      this.loadBankCircuits(),
    ]);

    // Log circuit breaker status
    const openCircuits = Array.from(this.bankCircuits.values())
      .filter(c => c.state === 'OPEN')
      .map(c => c.bankName);
    
    if (openCircuits.length > 0) {
      console.log(`[Engine] Circuit OPEN for banks: ${openCircuits.join(', ')}`);
    }

    // 1. Get all active UPIs
    const { data: upis, error: upiError } = await this.supabase
      .from('upi_pool')
      .select(`
        id,
        upi_id,
        holder_name,
        trader_id,
        status,
        daily_limit,
        daily_volume,
        daily_count,
        success_rate,
        last_used_at,
        hourly_failures,
        amount_tier,
        min_amount,
        max_amount,
        bank_name,
        traders!inner (
          id,
          name,
          balance,
          is_active
        )
      `)
      .eq('status', 'active')
      .eq('traders.is_active', true);

    if (upiError) {
      console.error('[Engine] DB error:', upiError);
      return { success: false, error: 'Database error' };
    }

    if (!upis || upis.length === 0) {
      return { success: false, error: 'No active UPIs' };
    }

    // 2. Transform and filter candidates
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
    }));

    // 3. Score candidates (this filters out circuit-broken banks)
    const scoredCandidates = candidates
      .map(c => this.scoreUpi(c, amount))
      .filter((c): c is ScoredUpi => c !== null)
      .sort((a, b) => b.score - a.score);

    console.log(`[Engine] ${scoredCandidates.length}/${candidates.length} candidates after filtering`);

    if (scoredCandidates.length === 0) {
      // Check if all were circuit-broken
      const circuitBrokenCount = candidates.filter(c => {
        const check = this.isBankAvailable(c.bank_name);
        return !check.available;
      }).length;

      if (circuitBrokenCount === candidates.length) {
        return { 
          success: false, 
          error: 'All bank circuits are OPEN due to high failure rates',
          bankCircuitStatus: `${openCircuits.length} banks blocked`
        };
      }

      return { success: false, error: 'No suitable UPIs for this amount tier' };
    }

    // 4. Select with fallback
    const maxAttempts = Math.min(3, scoredCandidates.length);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const selected = this.weightedRandomSelect(
        scoredCandidates.slice(0, Math.min(10, scoredCandidates.length))
      );

      if (selected) {
        // Update half-open counter if applicable
        const circuit = this.bankCircuits.get(selected.bank_name.toLowerCase());
        if (circuit?.state === 'HALF_OPEN') {
          await this.supabase
            .from('bank_circuits')
            .update({ 
              half_open_attempts: (circuit.halfOpenAttempts || 0) + 1,
              updated_at: new Date().toISOString()
            })
            .eq('bank_name', selected.bank_name.toLowerCase());
        }

        // Log selection
        await this.logSelection(selected, amount, merchantId, attempt, tier);

        return {
          success: true,
          upiId: selected.upi_id,
          upiPoolId: selected.id,
          holderName: selected.holder_name || 'Account Holder',
          traderId: selected.trader_id,
          traderName: selected.trader_name,
          score: selected.score,
          attempts: attempt,
          tier,
          bankCircuitStatus: openCircuits.length > 0 
            ? `${openCircuits.length} banks blocked` 
            : 'all banks healthy',
        };
      }
    }

    return { success: false, error: 'Selection failed' };
  }

  /**
   * Log selection
   */
  private async logSelection(
    selected: ScoredUpi,
    amount: number,
    merchantId: string,
    attempt: number,
    tier: string
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
        attempt,
        bank_name: selected.bank_name,
        engine_version: 'v3',
      });
    } catch (e) {
      console.error('[Engine] Log error:', e);
    }
  }

  /**
   * Update stats after transaction (call from update-payin)
   */
  async recordTransactionResult(
    upiPoolId: string,
    bankName: string,
    status: 'completed' | 'failed' | 'rejected' | 'expired'
  ): Promise<void> {
    const isSuccess = status === 'completed';

    // Update UPI stats
    if (isSuccess) {
      await this.supabase.rpc('increment_upi_success', { p_upi_id: upiPoolId });
    } else {
      await this.supabase.rpc('increment_upi_failure', { p_upi_id: upiPoolId });
    }

    // Record for circuit breaker (it reads from payins table directly)
    console.log(`[Engine] Transaction ${status} for bank ${bankName}`);
  }
}

// Export singleton-friendly factory
export function createPayinEngine(supabase: SupabaseClient): PayinEngineV3 {
  return new PayinEngineV3(supabase);
}
