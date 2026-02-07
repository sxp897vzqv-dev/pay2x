/**
 * PayinEngine v2.0 for Supabase
 * Smart UPI selection with 8-factor scoring
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Default scoring weights (can be overridden by config)
const DEFAULT_WEIGHTS = {
  successRate: 25,
  dailyLimitLeft: 20,
  cooldown: 15,
  amountMatch: 15,
  traderBalance: 10,
  bankHealth: 5,
  timeWindow: 5,
  recentFailures: 5,
};

// Amount tiers
const AMOUNT_TIERS = {
  low: { min: 0, max: 5000 },
  medium: { min: 5001, max: 20000 },
  high: { min: 20001, max: 100000 },
};

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
  success_rate: number;
  last_used_at: string | null;
  hourly_failures: number;
  amount_tier: string;
  bank_name: string;
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
  error?: string;
}

interface ScoredUpi extends UpiCandidate {
  score: number;
  breakdown: Record<string, number>;
}

export class PayinEngine {
  private supabase: SupabaseClient;
  private weights: typeof DEFAULT_WEIGHTS;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
    this.weights = { ...DEFAULT_WEIGHTS };
  }

  /**
   * Load config from database
   */
  async loadConfig(): Promise<void> {
    try {
      const { data } = await this.supabase
        .from('system_config')
        .select('value')
        .eq('key', 'payin_engine_weights')
        .single();

      if (data?.value) {
        this.weights = { ...DEFAULT_WEIGHTS, ...data.value };
      }
    } catch (e) {
      console.log('Using default weights');
    }
  }

  /**
   * Get amount tier
   */
  private getAmountTier(amount: number): string {
    if (amount <= AMOUNT_TIERS.low.max) return 'low';
    if (amount <= AMOUNT_TIERS.medium.max) return 'medium';
    return 'high';
  }

  /**
   * Calculate score for a single UPI
   */
  private scoreUpi(upi: UpiCandidate, amount: number, bankHealthMap: Map<string, string>): ScoredUpi {
    const breakdown: Record<string, number> = {};
    let totalScore = 0;

    // 1. Success Rate (0-25 points)
    const successScore = (upi.success_rate / 100) * this.weights.successRate;
    breakdown.successRate = Math.round(successScore * 10) / 10;
    totalScore += successScore;

    // 2. Daily Limit Left (0-20 points)
    const limitLeft = Math.max(0, upi.daily_limit - upi.daily_volume);
    const limitRatio = Math.min(1, limitLeft / upi.daily_limit);
    const limitScore = limitRatio * this.weights.dailyLimitLeft;
    breakdown.dailyLimitLeft = Math.round(limitScore * 10) / 10;
    totalScore += limitScore;

    // 3. Cooldown (0-15 points) - More time since last use = better
    let cooldownScore = this.weights.cooldown; // Full points if never used
    if (upi.last_used_at) {
      const lastUsed = new Date(upi.last_used_at).getTime();
      const minutesSince = (Date.now() - lastUsed) / 60000;
      // Full points after 30 mins, linear decay before
      cooldownScore = Math.min(1, minutesSince / 30) * this.weights.cooldown;
    }
    breakdown.cooldown = Math.round(cooldownScore * 10) / 10;
    totalScore += cooldownScore;

    // 4. Amount Match (0-15 points)
    const requestedTier = this.getAmountTier(amount);
    const upiTier = upi.amount_tier || 'medium';
    let amountScore = 0;
    if (requestedTier === upiTier) {
      amountScore = this.weights.amountMatch;
    } else if (
      (requestedTier === 'low' && upiTier === 'medium') ||
      (requestedTier === 'medium' && (upiTier === 'low' || upiTier === 'high')) ||
      (requestedTier === 'high' && upiTier === 'medium')
    ) {
      amountScore = this.weights.amountMatch * 0.5;
    }
    breakdown.amountMatch = Math.round(amountScore * 10) / 10;
    totalScore += amountScore;

    // 5. Trader Balance (0-10 points)
    // Trader needs balance to pay out (though for payins it's less critical)
    const balanceScore = upi.trader_balance >= amount
      ? this.weights.traderBalance
      : (upi.trader_balance / amount) * this.weights.traderBalance;
    breakdown.traderBalance = Math.round(Math.min(balanceScore, this.weights.traderBalance) * 10) / 10;
    totalScore += breakdown.traderBalance;

    // 6. Bank Health (0-5 points)
    const bankHealth = bankHealthMap.get(upi.bank_name?.toLowerCase() || '') || 'healthy';
    let bankScore = 0;
    if (bankHealth === 'healthy') bankScore = this.weights.bankHealth;
    else if (bankHealth === 'degraded') bankScore = this.weights.bankHealth * 0.3;
    // down = 0
    breakdown.bankHealth = Math.round(bankScore * 10) / 10;
    totalScore += bankScore;

    // 7. Time Window (0-5 points) - Not in maintenance window
    // For now, assume all are in good time window
    breakdown.timeWindow = this.weights.timeWindow;
    totalScore += this.weights.timeWindow;

    // 8. Recent Failures Penalty (0 to -5 points)
    const failurePenalty = Math.min(upi.hourly_failures, 5) * (this.weights.recentFailures / 5);
    breakdown.recentFailures = -Math.round(failurePenalty * 10) / 10;
    totalScore -= failurePenalty;

    return {
      ...upi,
      score: Math.round(totalScore * 10) / 10,
      breakdown,
    };
  }

  /**
   * Weighted random selection (not always picking #1)
   */
  private weightedRandomSelect(candidates: ScoredUpi[], exponent: number = 2): ScoredUpi | null {
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    // Apply exponent to scores for selection weight
    const weights = candidates.map(c => Math.pow(Math.max(c.score, 1), exponent));
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    let random = Math.random() * totalWeight;
    for (let i = 0; i < candidates.length; i++) {
      random -= weights[i];
      if (random <= 0) return candidates[i];
    }

    return candidates[0];
  }

  /**
   * Main selection method
   */
  async selectUpi(amount: number, merchantId: string): Promise<SelectionResult> {
    await this.loadConfig();

    // 1. Get all active UPIs with trader info
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
        success_rate,
        last_used_at,
        hourly_failures,
        amount_tier,
        bank_name,
        traders!inner (
          id,
          name,
          balance,
          is_active,
          is_online
        )
      `)
      .eq('status', 'active')
      .eq('traders.is_active', true)
      .gte('daily_limit', amount);

    if (upiError) {
      console.error('Error fetching UPIs:', upiError);
      return { success: false, error: 'Database error fetching UPIs' };
    }

    if (!upis || upis.length === 0) {
      return { success: false, error: 'No active UPIs available' };
    }

    // 2. Transform to candidates
    const candidates: UpiCandidate[] = upis
      .filter((u: any) => u.traders && (u.daily_limit - u.daily_volume) >= amount)
      .map((u: any) => ({
        id: u.id,
        upi_id: u.upi_id,
        holder_name: u.holder_name,
        trader_id: u.trader_id,
        trader_name: u.traders.name,
        trader_balance: u.traders.balance || 0,
        status: u.status,
        daily_limit: u.daily_limit,
        daily_volume: u.daily_volume || 0,
        success_rate: u.success_rate || 100,
        last_used_at: u.last_used_at,
        hourly_failures: u.hourly_failures || 0,
        amount_tier: u.amount_tier || 'medium',
        bank_name: u.bank_name || '',
      }));

    if (candidates.length === 0) {
      return { success: false, error: 'No UPIs with sufficient daily limit' };
    }

    // 3. Get bank health status
    const { data: bankHealth } = await this.supabase
      .from('bank_health')
      .select('bank_name, status');

    const bankHealthMap = new Map<string, string>();
    (bankHealth || []).forEach((b: any) => {
      bankHealthMap.set(b.bank_name.toLowerCase(), b.status);
    });

    // 4. Score all candidates
    const scoredCandidates = candidates
      .map(c => this.scoreUpi(c, amount, bankHealthMap))
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scoredCandidates.length === 0) {
      return { success: false, error: 'All UPIs scored too low' };
    }

    // 5. Weighted random selection with fallback
    const maxAttempts = Math.min(3, scoredCandidates.length);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Take top candidates for selection pool
      const pool = scoredCandidates.slice(0, Math.min(10, scoredCandidates.length));
      const selected = this.weightedRandomSelect(pool);

      if (selected) {
        // Log selection
        await this.logSelection(selected, amount, merchantId, attempt);

        return {
          success: true,
          upiId: selected.upi_id,
          upiPoolId: selected.id,
          holderName: selected.holder_name || 'Account Holder',
          traderId: selected.trader_id,
          traderName: selected.trader_name,
          score: selected.score,
          attempts: attempt,
        };
      }
    }

    return { success: false, error: 'Selection failed after all attempts' };
  }

  /**
   * Log selection for debugging
   */
  private async logSelection(
    selected: ScoredUpi,
    amount: number,
    merchantId: string,
    attempt: number
  ): Promise<void> {
    try {
      await this.supabase.from('selection_logs').insert({
        upi_pool_id: selected.id,
        upi_id: selected.upi_id,
        trader_id: selected.trader_id,
        merchant_id: merchantId,
        amount,
        score: selected.score,
        score_breakdown: selected.breakdown,
        attempt,
      });
    } catch (e) {
      console.error('Failed to log selection:', e);
    }
  }

  /**
   * Update UPI stats after transaction completes
   */
  async updateUpiStats(
    upiPoolId: string,
    status: 'completed' | 'failed' | 'rejected',
    amount: number
  ): Promise<void> {
    const isSuccess = status === 'completed';

    const updates: Record<string, any> = {
      last_used_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (isSuccess) {
      // Use RPC for atomic increment
      await this.supabase.rpc('increment_upi_success', {
        p_upi_id: upiPoolId,
        p_amount: amount,
      });
    } else {
      await this.supabase.rpc('increment_upi_failure', {
        p_upi_id: upiPoolId,
      });
    }
  }
}
