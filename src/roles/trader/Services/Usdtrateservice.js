const CLOUD_FUNCTION_BASE_URL = 'https://us-central1-pay2x-4748c.cloudfunctions.net';

export async function fetchUSDTRate() {
  try {
    const response = await fetch(`${CLOUD_FUNCTION_BASE_URL}/getUSDTBuyRate`);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch rate');
    }

    return {
      rate: data.rate,
      merchants: data.merchants,
      timestamp: new Date(data.timestamp),
      source: data.source,
      paymentMethods: data.paymentMethods
    };
  } catch (error) {
    console.error('Error fetching USDT rate:', error);
    return {
      rate: 92,
      merchants: [],
      timestamp: new Date(),
      source: 'Fallback',
      error: error.message
    };
  }
}

export async function fetchUSDTSellRate() {
  try {
    const response = await fetch(`${CLOUD_FUNCTION_BASE_URL}/getUSDTSellRate`);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch rate');
    }

    return {
      rate: data.rate,
      merchants: data.merchants,
      timestamp: new Date(data.timestamp),
      source: data.source,
      paymentMethods: data.paymentMethods
    };
  } catch (error) {
    console.error('Error fetching USDT sell rate:', error);
    return {
      rate: 90,
      merchants: [],
      timestamp: new Date(),
      source: 'Fallback',
      error: error.message
    };
  }
}

export async function storeRateInFirestore(db, rateData) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = (await import('../../supabase')).supabase;

    await supabase.from('usdt_rates').insert({
      buy_rate: rateData.rate,
      merchants: rateData.merchants,
      source: rateData.source,
      payment_methods: rateData.paymentMethods,
      last_updated: new Date().toISOString(),
    });

    console.log('✅ USDT rate stored');
  } catch (error) {
    console.error('Error storing rate:', error);
  }
}

export function startRateAutoUpdate(db, callback) {
  const UPDATE_INTERVAL = 5 * 60 * 1000;
  
  Promise.all([fetchUSDTRate(), fetchUSDTSellRate()]).then(([buyRate, sellRate]) => {
    callback({ buy: buyRate, sell: sellRate });
    storeRateInFirestore(db, buyRate);
  });
  
  const intervalId = setInterval(async () => {
    const [buyRate, sellRate] = await Promise.all([
      fetchUSDTRate(),
      fetchUSDTSellRate()
    ]);
    callback({ buy: buyRate, sell: sellRate });
    storeRateInFirestore(db, buyRate);
  }, UPDATE_INTERVAL);
  
  return () => clearInterval(intervalId);
}

export default {
  fetchUSDTRate,
  fetchUSDTSellRate,
  storeRateInFirestore,
  startRateAutoUpdate
};