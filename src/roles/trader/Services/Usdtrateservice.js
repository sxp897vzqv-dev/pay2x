/**
 * USDT Rate Service
 * Fetches rates from Supabase (populated by update-usdt-rate Edge Function)
 */

import { supabase, SUPABASE_URL } from '../../../supabase';

// Fallback: fetch from Binance P2P directly if needed
async function fetchBinanceP2PRate() {
  try {
    const response = await fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        asset: 'USDT',
        fiat: 'INR',
        tradeType: 'BUY',
        page: 1,
        rows: 5,
        payTypes: [],
        publisherType: null,
      }),
    });
    
    const data = await response.json();
    if (data.data && data.data.length > 0) {
      const prices = data.data.map(ad => parseFloat(ad.adv.price));
      const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
      return Math.round(avgPrice * 100) / 100;
    }
    return null;
  } catch (error) {
    console.error('Binance P2P fetch error:', error);
    return null;
  }
}

export async function fetchUSDTRate() {
  try {
    // Get rate from tatum_config
    const { data, error } = await supabase
      .from('tatum_config')
      .select('default_usdt_rate, admin_usdt_rate, rate_source, rate_updated_at')
      .eq('id', 'main')
      .single();
    
    if (error || !data) {
      // Fallback to Binance
      const binanceRate = await fetchBinanceP2PRate();
      return {
        rate: binanceRate || 92,
        timestamp: new Date(),
        source: binanceRate ? 'Binance P2P' : 'Fallback',
      };
    }

    return {
      rate: data.default_usdt_rate || data.admin_usdt_rate || 92,
      timestamp: data.rate_updated_at ? new Date(data.rate_updated_at) : new Date(),
      source: data.rate_source || 'Database',
    };
  } catch (error) {
    console.error('Error fetching USDT rate:', error);
    return {
      rate: 92,
      timestamp: new Date(),
      source: 'Fallback',
      error: error.message
    };
  }
}

export async function fetchUSDTSellRate() {
  try {
    // Sell rate is typically admin rate - spread (trader rate)
    const { data, error } = await supabase
      .from('tatum_config')
      .select('default_usdt_rate, admin_usdt_rate')
      .eq('id', 'main')
      .single();
    
    if (error || !data) {
      return {
        rate: 90,
        timestamp: new Date(),
        source: 'Fallback',
      };
    }

    // Trader rate (sell to trader) = admin rate - 1 (platform profit)
    const sellRate = (data.admin_usdt_rate || data.default_usdt_rate || 92) - 1;

    return {
      rate: sellRate,
      timestamp: new Date(),
      source: 'Database',
    };
  } catch (error) {
    console.error('Error fetching USDT sell rate:', error);
    return {
      rate: 90,
      timestamp: new Date(),
      source: 'Fallback',
      error: error.message
    };
  }
}

export async function storeRate(rateData) {
  try {
    await supabase.from('usdt_rate_history').insert({
      rate: rateData.rate,
      source: rateData.source,
      created_at: new Date().toISOString(),
    });
    console.log('✅ USDT rate stored');
  } catch (error) {
    console.error('Error storing rate:', error);
  }
}

export function startRateAutoUpdate(callback) {
  const UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutes
  
  // Initial fetch
  Promise.all([fetchUSDTRate(), fetchUSDTSellRate()]).then(([buyRate, sellRate]) => {
    callback({ buy: buyRate, sell: sellRate });
  });
  
  // Set up interval
  const intervalId = setInterval(async () => {
    const [buyRate, sellRate] = await Promise.all([
      fetchUSDTRate(),
      fetchUSDTSellRate()
    ]);
    callback({ buy: buyRate, sell: sellRate });
  }, UPDATE_INTERVAL);
  
  return () => clearInterval(intervalId);
}

export default {
  fetchUSDTRate,
  fetchUSDTSellRate,
  storeRate,
  startRateAutoUpdate
};
