/**
 * Update USDT Rate - Fetches from Binance P2P
 * 
 * TWO SEPARATE CALCULATIONS:
 * 
 * Admin Rate:
 * - Payment: UPI, IMPS
 * - Liquidity: > 2 lakhs (200,000 INR)
 * - Calculation: Average of top 5 offers
 * 
 * Trader Rate:
 * - Payment: UPI, IMPS
 * - Liquidity: NO FILTER
 * - Calculation: Average of top 5 offers - ₹1
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MIN_LIQUIDITY = 200000; // 2 lakhs INR (for admin rate only)
const TOP_N = 5; // Average of top 5
const TRADER_MARGIN = 1; // ₹1 less for traders

interface P2POffer {
  price: number;
  surplusAmount: number;
  minAmount: number;
  maxAmount: number;
  nickName: string;
  payTypes: string[];
  liquidityINR: number;
}

interface RateResult {
  adminRate: number;
  traderRate: number;
  adminOffers: P2POffer[];
  traderOffers: P2POffer[];
}

async function fetchBinanceP2PRates(): Promise<RateResult> {
  console.log('Fetching Binance P2P rates...');
  
  const response = await fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Origin': 'https://p2p.binance.com',
      'Referer': 'https://p2p.binance.com/',
    },
    body: JSON.stringify({
      fiat: 'INR',
      page: 1,
      rows: 20,
      tradeType: 'BUY',
      asset: 'USDT',
      countries: [],
      proMerchantAds: false,
      shieldMerchantAds: false,
      publisherType: null,
      payTypes: ['UPI', 'IMPS'],
      classifies: ['mass', 'profession'],
    }),
  });

  console.log('Binance response status:', response.status);

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'No error text');
    console.error('Binance P2P API error:', response.status, errorText);
    throw new Error(`Binance API returned ${response.status}`);
  }

  const text = await response.text();
  if (!text || text.length === 0) {
    throw new Error('Empty response from Binance P2P');
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error('Failed to parse Binance response:', text.slice(0, 500));
    throw new Error('Invalid JSON from Binance P2P');
  }

  const ads = data?.data || [];
  console.log('Total ads received:', ads.length);

  if (ads.length === 0) {
    throw new Error('No Binance P2P ads found');
  }

  // Parse all offers with liquidity calculation
  const allOffers: P2POffer[] = ads
    .filter((ad: any) => parseFloat(ad.adv?.price || '0') > 0)
    .map((ad: any) => {
      const price = parseFloat(ad.adv?.price || '0');
      const surplusAmount = parseFloat(ad.adv?.surplusAmount || '0');
      return {
        price,
        surplusAmount,
        minAmount: parseFloat(ad.adv?.minSingleTransAmount || '0'),
        maxAmount: parseFloat(ad.adv?.maxSingleTransAmount || '0'),
        nickName: ad.advertiser?.nickName || 'Unknown',
        payTypes: ad.adv?.tradeMethods?.map((m: any) => m.identifier) || [],
        liquidityINR: surplusAmount * price,
      };
    });

  // ═══════════════════════════════════════════════════════════════
  // TRADER RATE: Top 5 avg (NO liquidity filter) - ₹1
  // ═══════════════════════════════════════════════════════════════
  const traderOffers = allOffers.slice(0, TOP_N);
  const traderAvg = traderOffers.reduce((sum, o) => sum + o.price, 0) / traderOffers.length;
  const traderRate = Math.round((traderAvg - TRADER_MARGIN) * 100) / 100;

  console.log(`\n📊 TRADER RATE (no liquidity filter):`);
  console.log(`   Top ${traderOffers.length} avg = ₹${traderAvg.toFixed(2)} - ₹${TRADER_MARGIN} = ₹${traderRate}`);
  traderOffers.forEach((o, i) => {
    console.log(`   ${i + 1}. ₹${o.price} - ${o.nickName} (${o.surplusAmount.toFixed(0)} USDT, ₹${(o.liquidityINR/100000).toFixed(1)}L)`);
  });

  // ═══════════════════════════════════════════════════════════════
  // ADMIN RATE: Top 5 avg (WITH >2L liquidity filter)
  // ═══════════════════════════════════════════════════════════════
  const highLiquidityOffers = allOffers.filter(o => o.liquidityINR >= MIN_LIQUIDITY);
  console.log(`\n💰 High liquidity offers (>₹2L): ${highLiquidityOffers.length}`);

  let adminOffers: P2POffer[];
  let adminRate: number;

  if (highLiquidityOffers.length >= TOP_N) {
    adminOffers = highLiquidityOffers.slice(0, TOP_N);
  } else if (highLiquidityOffers.length > 0) {
    // Use whatever high liquidity offers we have
    adminOffers = highLiquidityOffers;
    console.log(`   ⚠️ Only ${highLiquidityOffers.length} high liquidity offers found`);
  } else {
    // Fallback to all offers if none meet liquidity requirement
    adminOffers = allOffers.slice(0, TOP_N);
    console.log(`   ⚠️ No high liquidity offers, using all offers`);
  }

  const adminAvg = adminOffers.reduce((sum, o) => sum + o.price, 0) / adminOffers.length;
  adminRate = Math.round(adminAvg * 100) / 100;

  console.log(`\n📊 ADMIN RATE (>₹2L liquidity filter):`);
  console.log(`   Top ${adminOffers.length} avg = ₹${adminRate}`);
  adminOffers.forEach((o, i) => {
    console.log(`   ${i + 1}. ₹${o.price} - ${o.nickName} (${o.surplusAmount.toFixed(0)} USDT, ₹${(o.liquidityINR/100000).toFixed(1)}L)`);
  });

  return { adminRate, traderRate, adminOffers, traderOffers };
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const { adminRate, traderRate, adminOffers, traderOffers } = await fetchBinanceP2PRates();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Get current rates
    const { data: currentConfig } = await supabase
      .from('tatum_config')
      .select('admin_usdt_rate, default_usdt_rate')
      .eq('id', 'main')
      .single();

    const previousAdminRate = currentConfig?.admin_usdt_rate || 92;
    const previousTraderRate = currentConfig?.default_usdt_rate || 91;

    // Update both rates
    const { error: updateError } = await supabase
      .from('tatum_config')
      .update({ 
        admin_usdt_rate: adminRate,
        default_usdt_rate: traderRate,
        rate_updated_at: new Date().toISOString(),
        rate_source: 'binance_p2p',
        rate_offers: { admin: adminOffers, trader: traderOffers },
      })
      .eq('id', 'main');

    if (updateError) {
      console.error('Update error:', updateError);
      throw new Error('Failed to update rate in database: ' + updateError.message);
    }

    // Log rate change to history
    const { error: historyError } = await supabase.from('usdt_rate_history').insert({
      admin_rate: adminRate,
      trader_rate: traderRate,
      source: 'binance_p2p',
      offers: { admin: adminOffers, trader: traderOffers },
      margin: TRADER_MARGIN,
    });
    if (historyError) console.log('Rate history insert skipped:', historyError.message);

    console.log(`\n✅ USDT rates updated:`);
    console.log(`   Admin:  ₹${previousAdminRate} → ₹${adminRate} (>2L liquidity)`);
    console.log(`   Trader: ₹${previousTraderRate} → ₹${traderRate} (no filter - ₹1)`);

    return new Response(JSON.stringify({
      success: true,
      adminRate,
      traderRate,
      margin: TRADER_MARGIN,
      previousAdminRate,
      previousTraderRate,
      source: 'binance_p2p',
      adminOffers,
      traderOffers,
      updatedAt: new Date().toISOString(),
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('❌ Update rate error:', error.message);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || 'Failed to fetch Binance P2P rate'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
