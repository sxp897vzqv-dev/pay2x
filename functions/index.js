/**
 * Firebase Cloud Functions - Combined
 * USDT Rate Fetching + Payin/Payout Operations
 */

const functions = require("firebase-functions");
const cors = require("cors")({origin: true});
const admin = require("firebase-admin");
const crypto = require("crypto");

// Initialize Firebase Admin (only once)
admin.initializeApp();
const db = admin.firestore();

// ============================================
// USDT RATE FETCHING FUNCTIONS
// ============================================

const BINANCE_P2P_API = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search";
const CACHE_DURATION = 60000; // 1 minute cache

// In-memory cache
let buyRateCache = { data: null, timestamp: 0 };
let sellRateCache = { data: null, timestamp: 0 };

/**
 * Helper: Check if cache is valid
 */
function isCacheValid(cache) {
  return cache.data && (Date.now() - cache.timestamp) < CACHE_DURATION;
}

/**
 * Helper: Fetch rates from Binance P2P
 */
async function fetchBinanceRate(tradeType) {
  const fetch = (await import("node-fetch")).default;

  const requestBody = {
    page: 1,
    rows: 10,
    payTypes: ["IMPS", "PhonePe", "UPI"],
    asset: "USDT",
    tradeType: tradeType,
    fiat: "INR",
    publisherType: null,
    merchantCheck: true,
  };

  const response = await fetch(BINANCE_P2P_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0",
    },
    body: JSON.stringify(requestBody),
    timeout: 10000,
  });

  if (!response.ok) {
    throw new Error(`Binance API error: ${response.status}`);
  }

  return await response.json();
}

/**
 * Helper: Process merchant data
 */
function processMerchants(data, count = 5) {
  if (!data.data || !data.data.length) {
    throw new Error("No merchants found");
  }

  const merchants = data.data.slice(0, count).map((ad) => ({
    merchantName: ad.advertiser.nickName,
    price: parseFloat(ad.adv.price),
    minAmount: parseFloat(ad.adv.minSingleTransAmount),
    maxAmount: parseFloat(ad.adv.maxSingleTransAmount),
    available: parseFloat(ad.adv.surplusAmount),
    payMethods: ad.adv.tradeMethods.map((m) => m.tradeMethodName),
    orderCount: ad.advertiser.monthOrderCount,
    completionRate: parseFloat(ad.advertiser.monthFinishRate) * 100,
  }));

  const totalPrice = merchants.reduce((sum, m) => sum + m.price, 0);
  const averageRate = totalPrice / merchants.length;
  const prices = merchants.map(m => m.price);
  const bestRate = Math.min(...prices);
  const worstRate = Math.max(...prices);

  return {
    merchants,
    averageRate: parseFloat(averageRate.toFixed(2)),
    bestRate: parseFloat(bestRate.toFixed(2)),
    worstRate: parseFloat(worstRate.toFixed(2)),
    spread: parseFloat((worstRate - bestRate).toFixed(2)),
  };
}

/**
 * Fetch USDT Buy Rate
 */
exports.getUSDTBuyRate = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      if (isCacheValid(buyRateCache)) {
        functions.logger.info("Returning cached buy rate");
        return res.status(200).json({
          ...buyRateCache.data,
          cached: true,
        });
      }

      const data = await fetchBinanceRate("BUY");
      const processed = processMerchants(data);

      const response = {
        success: true,
        rate: processed.averageRate,
        bestRate: processed.bestRate,
        worstRate: processed.worstRate,
        spread: processed.spread,
        merchants: processed.merchants,
        timestamp: new Date().toISOString(),
        source: "Binance P2P",
        paymentMethods: ["IMPS", "UPI", "PhonePe"],
        cached: false,
      };

      buyRateCache = { data: response, timestamp: Date.now() };
      res.status(200).json(response);
    } catch (error) {
      functions.logger.error("Error fetching buy rate:", error);
      res.status(500).json({
        success: false,
        error: error.message,
        rate: 92,
        bestRate: 91.5,
        worstRate: 92.5,
        spread: 1.0,
        merchants: [],
        timestamp: new Date().toISOString(),
        source: "Fallback",
      });
    }
  });
});

/**
 * Fetch USDT Sell Rate
 */
exports.getUSDTSellRate = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      if (isCacheValid(sellRateCache)) {
        functions.logger.info("Returning cached sell rate");
        return res.status(200).json({
          ...sellRateCache.data,
          cached: true,
        });
      }

      const data = await fetchBinanceRate("SELL");
      const processed = processMerchants(data);

      const response = {
        success: true,
        rate: processed.averageRate,
        bestRate: processed.bestRate,
        worstRate: processed.worstRate,
        spread: processed.spread,
        merchants: processed.merchants,
        timestamp: new Date().toISOString(),
        source: "Binance P2P",
        paymentMethods: ["IMPS", "UPI", "PhonePe"],
        cached: false,
      };

      sellRateCache = { data: response, timestamp: Date.now() };
      res.status(200).json(response);
    } catch (error) {
      functions.logger.error("Error fetching sell rate:", error);
      res.status(500).json({
        success: false,
        error: error.message,
        rate: 90,
        bestRate: 89.5,
        worstRate: 90.5,
        spread: 1.0,
        merchants: [],
        timestamp: new Date().toISOString(),
        source: "Fallback",
      });
    }
  });
});

/**
 * Get Both Buy and Sell Rates
 */
exports.getUSDTRates = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      let buyData, sellData;

      if (isCacheValid(buyRateCache)) {
        buyData = buyRateCache.data;
      } else {
        const buyResponse = await fetchBinanceRate("BUY");
        const buyProcessed = processMerchants(buyResponse);
        buyData = {
          success: true,
          rate: buyProcessed.averageRate,
          bestRate: buyProcessed.bestRate,
          worstRate: buyProcessed.worstRate,
          spread: buyProcessed.spread,
          merchants: buyProcessed.merchants,
          timestamp: new Date().toISOString(),
          source: "Binance P2P",
        };
        buyRateCache = { data: buyData, timestamp: Date.now() };
      }

      if (isCacheValid(sellRateCache)) {
        sellData = sellRateCache.data;
      } else {
        const sellResponse = await fetchBinanceRate("SELL");
        const sellProcessed = processMerchants(sellResponse);
        sellData = {
          success: true,
          rate: sellProcessed.averageRate,
          bestRate: sellProcessed.bestRate,
          worstRate: sellProcessed.worstRate,
          spread: sellProcessed.spread,
          merchants: sellProcessed.merchants,
          timestamp: new Date().toISOString(),
          source: "Binance P2P",
        };
        sellRateCache = { data: sellData, timestamp: Date.now() };
      }

      const buySellSpread = parseFloat((buyData.rate - sellData.rate).toFixed(2));

      res.status(200).json({
        success: true,
        buy: buyData,
        sell: sellData,
        buySellSpread: buySellSpread,
        timestamp: new Date().toISOString(),
        paymentMethods: ["IMPS", "UPI", "PhonePe"],
      });
    } catch (error) {
      functions.logger.error("Error fetching both rates:", error);
      res.status(500).json({
        success: false,
        error: error.message,
        buy: { rate: 92 },
        sell: { rate: 90 },
        buySellSpread: 2.0,
        timestamp: new Date().toISOString(),
        source: "Fallback",
      });
    }
  });
});

/**
 * Calculate Profit/Loss for a transaction
 */
exports.calculatePL = functions.https.onRequest((req, res) => {
  cors(req, res, () => {
    const { amount, buyRate, sellRate } = req.query;

    if (!amount || !buyRate || !sellRate) {
      return res.status(400).json({
        success: false,
        error: "Missing parameters: amount, buyRate, sellRate required",
      });
    }

    const amountNum = parseFloat(amount);
    const buyRateNum = parseFloat(buyRate);
    const sellRateNum = parseFloat(sellRate);

    if (isNaN(amountNum) || isNaN(buyRateNum) || isNaN(sellRateNum)) {
      return res.status(400).json({
        success: false,
        error: "Invalid numeric values",
      });
    }

    const usdtAmount = amountNum / buyRateNum;
    const sellValue = usdtAmount * sellRateNum;
    const profitLoss = sellValue - amountNum;
    const profitLossPercentage = (profitLoss / amountNum) * 100;

    res.status(200).json({
      success: true,
      input: {
        investmentINR: amountNum,
        buyRate: buyRateNum,
        sellRate: sellRateNum,
      },
      calculation: {
        usdtPurchased: parseFloat(usdtAmount.toFixed(4)),
        sellValueINR: parseFloat(sellValue.toFixed(2)),
        profitLossINR: parseFloat(profitLoss.toFixed(2)),
        profitLossPercentage: parseFloat(profitLossPercentage.toFixed(2)),
      },
      timestamp: new Date().toISOString(),
    });
  });
});

// ============================================
// PAYIN/PAYOUT FUNCTIONS
// ============================================

/**
 * CREATE PAYIN
 */
exports.createPayin = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('📥 Create Payin Request received');
    
    const { amount, userId, orderId, metadata } = req.body;
    const apiKey = req.headers.authorization?.replace('Bearer ', '');
    
    if (!amount || !userId) {
      return res.status(400).json({ 
        error: 'Missing required fields: amount and userId are required' 
      });
    }
    
    if (!apiKey) {
      return res.status(401).json({ 
        error: 'Missing API key. Include Authorization header with Bearer token' 
      });
    }
    
    const amountNum = Number(amount);
    if (isNaN(amountNum) || amountNum < 1000 || amountNum > 50000) {
      return res.status(400).json({ 
        error: 'Amount must be between 1000 and 50000' 
      });
    }
    
    console.log('✅ Validation passed');
    
    const merchantSnapshot = await db.collection('merchant')
      .where('apiKey', '==', apiKey)
      .where('active', '==', true)
      .limit(1)
      .get();
    
    if (merchantSnapshot.empty) {
      console.log('❌ Invalid API key');
      return res.status(401).json({ 
        error: 'Invalid or inactive API key' 
      });
    }
    
    const merchantDoc = merchantSnapshot.docs[0];
    const merchantId = merchantDoc.id;
    const merchantData = merchantDoc.data();
    
    console.log('✅ Merchant verified:', merchantData.businessName);
    
    const tradersSnapshot = await db.collection('trader')
      .where('active', '==', true)
      .limit(1)
      .get();
    
    if (tradersSnapshot.empty) {
      console.log('❌ No traders available');
      return res.status(503).json({ 
        error: 'No traders available at the moment. Please try again later.' 
      });
    }
    
    const traderDoc = tradersSnapshot.docs[0];
    const traderId = traderDoc.id;
    const traderData = traderDoc.data();
    
    console.log('✅ Trader assigned:', traderId);
    
    let upiDetails = null;
    
    if (amountNum >= 10000 && traderData.bigUpis && traderData.bigUpis.length > 0) {
      upiDetails = traderData.bigUpis.find(upi => upi.active === true);
      console.log('💰 Using Big UPI for large amount');
    }
    
    if (!upiDetails && traderData.currentMerchantUpis && traderData.currentMerchantUpis.length > 0) {
      upiDetails = traderData.currentMerchantUpis.find(upi => upi.active === true);
      console.log('🏪 Using Merchant UPI');
    }
    
    if (!upiDetails && traderData.normalUpis && traderData.normalUpis.length > 0) {
      upiDetails = traderData.normalUpis.find(upi => upi.active === true);
      console.log('👤 Using Normal UPI');
    }
    
    if (!upiDetails) {
      console.log('❌ No UPI available from trader');
      return res.status(503).json({ 
        error: 'No payment method available. Please try again later.' 
      });
    }
    
    console.log('✅ UPI selected:', upiDetails.upiId);
    
    const payinData = {
      merchantId: merchantId,
      traderId: traderId,
      userId: userId,
      orderId: orderId || null,
      amount: amountNum,
      status: 'pending',
      upiId: upiDetails.upiId,
      holderName: upiDetails.holderName || 'Merchant',
      utrId: null,
      timer: 600,
      requestedAt: admin.firestore.FieldValue.serverTimestamp(),
      completedAt: null,
      metadata: metadata || null,
      testMode: merchantData.testMode || false
    };
    
    const payinRef = await db.collection('payin').add(payinData);
    console.log('✅ Payin created:', payinRef.id);
    
    return res.status(200).json({
      success: true,
      payinId: payinRef.id,
      upiId: upiDetails.upiId,
      holderName: upiDetails.holderName,
      amount: amountNum,
      timer: 600,
      expiresAt: new Date(Date.now() + 600000).toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error in createPayin:', error);
    return res.status(500).json({ 
      error: 'Internal server error. Please try again.',
      message: error.message 
    });
  }
});

/**
 * UPDATE PAYIN (Submit UTR)
 */
exports.updatePayin = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'PATCH, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }

  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('📥 Update Payin Request received');
    
    const { payinId, utrId } = req.body;
    const apiKey = req.headers.authorization?.replace('Bearer ', '');
    
    if (!payinId || !utrId) {
      return res.status(400).json({ 
        error: 'Missing required fields: payinId and utrId are required' 
      });
    }
    
    if (!apiKey) {
      return res.status(401).json({ 
        error: 'Missing API key' 
      });
    }
    
    const merchantSnapshot = await db.collection('merchant')
      .where('apiKey', '==', apiKey)
      .limit(1)
      .get();
    
    if (merchantSnapshot.empty) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
    
    const merchantId = merchantSnapshot.docs[0].id;
    
    const payinRef = db.collection('payin').doc(payinId);
    const payinDoc = await payinRef.get();
    
    if (!payinDoc.exists) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    const payinData = payinDoc.data();
    
    if (payinData.merchantId !== merchantId) {
      return res.status(403).json({ error: 'Not authorized to update this payment' });
    }
    
    if (payinData.status === 'completed') {
      return res.status(400).json({ error: 'Payment already completed' });
    }
    
    await payinRef.update({
      utrId: utrId,
      utrSubmittedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log('✅ UTR updated:', payinId);
    
    return res.status(200).json({
      success: true,
      message: 'UTR submitted successfully. Payment is being verified.',
      payinId: payinId
    });
    
  } catch (error) {
    console.error('❌ Error in updatePayin:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

/**
 * SEND WEBHOOK (Triggered on payin update)
 */
exports.sendPaymentWebhook = functions.firestore
  .document('payin/{payinId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const payinId = context.params.payinId;
    
    console.log('🔔 Payin updated:', payinId);
    console.log('Status changed:', before.status, '→', after.status);
    
    if (before.status === after.status) {
      console.log('⏭️  Status unchanged, skipping webhook');
      return null;
    }
    
    if (after.status !== 'completed' && after.status !== 'rejected') {
      console.log('⏭️  Status not final, skipping webhook');
      return null;
    }
    
    try {
      const merchantDoc = await db.collection('merchant').doc(after.merchantId).get();
      
      if (!merchantDoc.exists) {
        console.log('❌ Merchant not found');
        return null;
      }
      
      const merchant = merchantDoc.data();
      
      if (!merchant.webhookUrl) {
        console.log('⚠️  No webhook URL configured for merchant');
        return null;
      }
      
      console.log('✅ Sending webhook to:', merchant.webhookUrl);
      
      const payload = {
        event: after.status === 'completed' ? 'payment.completed' : 'payment.failed',
        timestamp: Date.now(),
        data: {
          payinId: payinId,
          orderId: after.orderId,
          amount: after.amount,
          status: after.status,
          utrId: after.utrId,
          completedAt: after.completedAt ? after.completedAt.toDate().toISOString() : null,
          userId: after.userId,
          metadata: after.metadata || null,
          testMode: after.testMode || false
        }
      };
      
      const signature = crypto
        .createHmac('sha256', merchant.webhookSecret || '')
        .update(JSON.stringify(payload))
        .digest('hex');
      
      console.log('🔐 Signature created');
      
      const fetch = (await import("node-fetch")).default;
      const response = await fetch(merchant.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': payload.event,
          'User-Agent': 'Pay2X-Webhooks/1.0'
        },
        body: JSON.stringify(payload),
        timeout: 10000
      });
      
      const statusCode = response.status;
      const isSuccess = response.ok;
      
      console.log('📬 Webhook response:', statusCode, isSuccess ? '✅' : '❌');
      
      await db.collection('webhookLogs').add({
        merchantId: after.merchantId,
        payinId: payinId,
        event: payload.event,
        status: isSuccess ? 'success' : 'failed',
        statusCode: statusCode,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        retryCount: 0,
        webhookUrl: merchant.webhookUrl
      });
      
      console.log('✅ Webhook logged');
      
      return null;
      
    } catch (error) {
      console.error('❌ Webhook delivery failed:', error);
      
      try {
        await db.collection('webhookLogs').add({
          merchantId: after.merchantId,
          payinId: payinId,
          event: after.status === 'completed' ? 'payment.completed' : 'payment.failed',
          status: 'failed',
          error: error.message,
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          retryCount: 0
        });
      } catch (logError) {
        console.error('❌ Failed to log webhook error:', logError);
      }
      
      return null;
    }
  });

/**
 * RETRY FAILED WEBHOOKS (Scheduled)
 */
exports.retryFailedWebhooks = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async (context) => {
    console.log('🔄 Checking for failed webhooks to retry...');
    
    try {
      const failedWebhooks = await db.collection('webhookLogs')
        .where('status', '==', 'failed')
        .where('retryCount', '<', 5)
        .limit(100)
        .get();
      
      if (failedWebhooks.empty) {
        console.log('✅ No failed webhooks to retry');
        return null;
      }
      
      console.log(`📋 Found ${failedWebhooks.size} webhooks to retry`);
      
      const fetch = (await import("node-fetch")).default;
      
      for (const logDoc of failedWebhooks.docs) {
        const log = logDoc.data();
        
        try {
          const merchantDoc = await db.collection('merchant').doc(log.merchantId).get();
          const payinDoc = await db.collection('payin').doc(log.payinId).get();
          
          if (!merchantDoc.exists || !payinDoc.exists) {
            console.log('⏭️  Skipping - merchant or payin not found');
            continue;
          }
          
          const merchant = merchantDoc.data();
          const payin = payinDoc.data();
          
          if (!merchant.webhookUrl) {
            console.log('⏭️  Skipping - no webhook URL');
            continue;
          }
          
          const payload = {
            event: log.event,
            timestamp: Date.now(),
            data: {
              payinId: log.payinId,
              orderId: payin.orderId,
              amount: payin.amount,
              status: payin.status,
              utrId: payin.utrId,
              completedAt: payin.completedAt ? payin.completedAt.toDate().toISOString() : null,
              userId: payin.userId,
              metadata: payin.metadata
            }
          };
          
          const signature = crypto
            .createHmac('sha256', merchant.webhookSecret || '')
            .update(JSON.stringify(payload))
            .digest('hex');
          
          const response = await fetch(merchant.webhookUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Webhook-Signature': signature,
              'X-Webhook-Event': payload.event
            },
            body: JSON.stringify(payload),
            timeout: 10000
          });
          
          if (response.ok) {
            await logDoc.ref.update({
              status: 'success',
              statusCode: response.status,
              retriedAt: admin.firestore.FieldValue.serverTimestamp(),
              retryCount: admin.firestore.FieldValue.increment(1)
            });
            console.log('✅ Webhook retry successful:', log.payinId);
          } else {
            await logDoc.ref.update({
              retryCount: admin.firestore.FieldValue.increment(1),
              lastRetryAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log('❌ Webhook retry failed:', log.payinId);
          }
          
        } catch (error) {
          console.error('❌ Error retrying webhook:', error);
          await logDoc.ref.update({
            retryCount: admin.firestore.FieldValue.increment(1),
            lastError: error.message,
            lastRetryAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      }
      
      return null;
    } catch (error) {
      console.error('❌ Error in retryFailedWebhooks:', error);
      return null;
    }
  });

/**
 * GET PAYMENT STATUS
 */
exports.getPayinStatus = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payinId = req.query.payinId || req.params.payinId;
    const apiKey = req.headers.authorization?.replace('Bearer ', '');
    
    if (!payinId) {
      return res.status(400).json({ error: 'payinId is required' });
    }
    
    if (!apiKey) {
      return res.status(401).json({ error: 'Missing API key' });
    }
    
    const merchantSnapshot = await db.collection('merchant')
      .where('apiKey', '==', apiKey)
      .limit(1)
      .get();
    
    if (merchantSnapshot.empty) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
    
    const merchantId = merchantSnapshot.docs[0].id;
    
    const payinDoc = await db.collection('payin').doc(payinId).get();
    
    if (!payinDoc.exists) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    const payin = payinDoc.data();
    
    if (payin.merchantId !== merchantId) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    return res.status(200).json({
      success: true,
      payin: {
        payinId: payinId,
        status: payin.status,
        amount: payin.amount,
        orderId: payin.orderId,
        utrId: payin.utrId,
        completedAt: payin.completedAt ? payin.completedAt.toDate().toISOString() : null,
        requestedAt: payin.requestedAt ? payin.requestedAt.toDate().toISOString() : null
      }
    });
    
  } catch (error) {
    console.error('Error in getPayinStatus:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Health Check Endpoint
 */
exports.health = functions.https.onRequest((req, res) => {
  cors(req, res, () => {
    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: "3.0.0",
      endpoints: [
        // USDT Rate endpoints
        "/getUSDTBuyRate",
        "/getUSDTSellRate",
        "/getUSDTRates",
        "/calculatePL",
        // Payin/Payout endpoints
        "/createPayin",
        "/updatePayin",
        "/getPayinStatus",
        // Utility
        "/health",
      ],
    });
  });
});
exports.generateTraderUSDTAddress = functions.https.onRequest(async (req, res) => {
  // CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const { traderId } = req.body;
    
    if (!traderId) {
      res.status(400).json({ success: false, error: 'traderId required' });
      return;
    }

    // Get Tatum config
    const configDoc = await db.collection('system').doc('tatumConfig').get();
    
    if (!configDoc.exists || !configDoc.data().masterWallet) {
      res.status(400).json({ 
        success: false, 
        error: 'Master wallet not configured. Generate in Settings first.' 
      });
      return;
    }

    const config = configDoc.data();
    const { tatumApiKey, masterWallet } = config;

    if (!tatumApiKey || !masterWallet.xpub) {
      res.status(400).json({ success: false, error: 'Tatum API key or XPUB missing' });
      return;
    }

    // Get next derivation index
    const metaDoc = await db.collection('system').doc('addressMeta').get();
    const nextIndex = metaDoc.exists ? (metaDoc.data().lastIndex || 0) + 1 : 1;

    console.log(`Generating address for trader ${traderId} at index ${nextIndex}`);

    // Derive address from XPUB using Tatum API
    const response = await fetch(
      `https://api.tatum.io/v3/tron/address/${masterWallet.xpub}/${nextIndex}`,
      {
        method: 'GET',
        headers: {
          'x-api-key': tatumApiKey,
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to generate address');
    }

    const addressData = await response.json();
    console.log('✅ Address generated:', addressData.address);

    // Update trader with new address
    await db.collection('trader').doc(traderId).update({
      usdtDepositAddress: addressData.address,
      derivationIndex: nextIndex,
      addressGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Update address meta
    await db.collection('system').doc('addressMeta').set({
      lastIndex: nextIndex,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // Create address mapping for quick lookup
    await db.collection('addressMapping').doc(addressData.address).set({
      traderId: traderId,
      derivationIndex: nextIndex,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log('✅ Trader updated with USDT address');

    res.json({
      success: true,
      address: addressData.address,
      derivationIndex: nextIndex,
    });

  } catch (error) {
    console.error('Error generating address:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 2. SETUP TATUM WEBHOOK (Call once after deploying functions)
// ============================================================================
exports.setupTatumWebhook = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  
  try {
    const configDoc = await db.collection('system').doc('tatumConfig').get();
    
    if (!configDoc.exists) {
      res.status(400).json({ error: 'Tatum config not found' });
      return;
    }

    const { tatumApiKey, masterWallet } = configDoc.data();

    // Create webhook for USDT deposits on Tron
    const webhookResponse = await fetch('https://api.tatum.io/v3/subscription', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': tatumApiKey,
      },
      body: JSON.stringify({
        type: 'ADDRESS_EVENT',
        attr: {
          address: masterWallet.address, // Monitor master address
          chain: 'TRON',
          url: `https://us-central1-pay2x-4748c.cloudfunctions.net/tatumUSDTWebhook`
        }
      }),
    });

    const webhookData = await webhookResponse.json();
    console.log('✅ Webhook created:', webhookData);

    // Store webhook ID
    await db.collection('system').doc('tatumConfig').update({
      webhookId: webhookData.id,
      webhookCreatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({
      success: true,
      webhookId: webhookData.id,
      message: 'Webhook setup complete!'
    });

  } catch (error) {
    console.error('Error setting up webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// 3. TATUM WEBHOOK RECEIVER (Receives deposit notifications)
// ============================================================================
exports.tatumUSDTWebhook = functions.https.onRequest(async (req, res) => {
  console.log('🔔 Webhook received:', JSON.stringify(req.body));

  try {
    const webhookData = req.body;
    
    // Validate webhook data
    if (!webhookData || !webhookData.address || !webhookData.amount) {
      console.log('❌ Invalid webhook data');
      res.status(200).send('OK'); // Still return 200 to Tatum
      return;
    }

    const { address, amount, txId, currency } = webhookData;

    // Check if it's USDT transaction
    if (currency !== 'USDT' && currency !== 'USDT_TRON') {
      console.log('❌ Not a USDT transaction');
      res.status(200).send('OK');
      return;
    }

    console.log(`💰 USDT Deposit: ${amount} USDT to ${address}`);

    // Find trader by address
    const addressDoc = await db.collection('addressMapping').doc(address).get();
    
    if (!addressDoc.exists) {
      console.log('❌ Address not found in mapping');
      res.status(200).send('OK');
      return;
    }

    const { traderId } = addressDoc.data();
    console.log(`✅ Found trader: ${traderId}`);

    // Check for duplicate transaction
    const existingTx = await db.collection('transactions')
      .where('txHash', '==', txId)
      .limit(1)
      .get();

    if (!existingTx.empty) {
      console.log('⚠️ Duplicate transaction, skipping');
      res.status(200).send('OK');
      return;
    }

    // Get USDT rate (you can fetch from your rate service or use fixed rate)
    const usdtRate = 92; // You can make this dynamic
    const inrAmount = Math.round(amount * usdtRate);

    // Credit trader balance
    const traderRef = db.collection('trader').doc(traderId);
    const traderDoc = await traderRef.get();
    
    if (!traderDoc.exists) {
      console.log('❌ Trader not found');
      res.status(200).send('OK');
      return;
    }

    const currentBalance = traderDoc.data().balance || 0;
    const newBalance = currentBalance + inrAmount;

    await traderRef.update({
      balance: newBalance,
      lastDepositAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`✅ Balance updated: ₹${currentBalance} → ₹${newBalance}`);

    // Create transaction record
    await db.collection('transactions').add({
      traderId: traderId,
      type: 'deposit',
      amount: inrAmount,
      usdtAmount: amount,
      usdtRate: usdtRate,
      status: 'completed',
      autoVerified: true,
      txHash: txId,
      fromAddress: address,
      description: `USDT Deposit - ${amount} USDT @ ₹${usdtRate} = ₹${inrAmount}`,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log('✅ Transaction record created');

    // Schedule sweep (add to sweep queue)
    await db.collection('sweepQueue').add({
      traderId: traderId,
      fromAddress: address,
      amount: amount,
      txHash: txId,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      scheduledFor: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log('✅ Sweep scheduled');

    res.status(200).send('OK');

  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    res.status(200).send('OK'); // Still return 200 to avoid webhook retry
  }
});

// ============================================================================
// 4. PROCESS SWEEPS (Scheduled function - runs every 5 minutes)
// ============================================================================
exports.processSweeps = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async (context) => {
    console.log('🧹 Starting sweep process...');

    try {
      const configDoc = await db.collection('system').doc('tatumConfig').get();
      
      if (!configDoc.exists) {
        console.log('❌ Tatum config not found');
        return;
      }

      const { tatumApiKey, masterWallet, adminWallet } = configDoc.data();

      if (!adminWallet) {
        console.log('❌ Admin wallet not configured');
        return;
      }

      // Get pending sweeps
      const sweepsSnapshot = await db.collection('sweepQueue')
        .where('status', '==', 'pending')
        .limit(10)
        .get();

      if (sweepsSnapshot.empty) {
        console.log('✅ No pending sweeps');
        return;
      }

      console.log(`📋 Found ${sweepsSnapshot.size} pending sweeps`);

      for (const sweepDoc of sweepsSnapshot.docs) {
        const sweep = sweepDoc.data();
        const { fromAddress, amount, traderId } = sweep;

        try {
          console.log(`💸 Sweeping ${amount} USDT from ${fromAddress} to ${adminWallet}`);

          // Get trader's derivation index
          const traderDoc = await db.collection('trader').doc(traderId).get();
          const derivationIndex = traderDoc.data().derivationIndex;

          // Generate private key from mnemonic + index (for signing)
          // Note: In production, use secure key management
          const privateKeyResponse = await fetch(
            `https://api.tatum.io/v3/tron/wallet/priv`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': tatumApiKey,
              },
              body: JSON.stringify({
                mnemonic: masterWallet.mnemonic,
                index: derivationIndex,
              }),
            }
          );

          const { key: privateKey } = await privateKeyResponse.json();

          // Send USDT to admin wallet using Tatum
          const sendResponse = await fetch(
            'https://api.tatum.io/v3/tron/trc20/transaction',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': tatumApiKey,
              },
              body: JSON.stringify({
                from: fromAddress,
                to: adminWallet,
                amount: amount.toString(),
                tokenAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', // USDT TRC20 contract
                fromPrivateKey: privateKey,
              }),
            }
          );

          const sendData = await sendResponse.json();

          if (sendData.txId) {
            console.log(`✅ Sweep successful: ${sendData.txId}`);

            // Update sweep status
            await db.collection('sweepQueue').doc(sweepDoc.id).update({
              status: 'completed',
              sweepTxHash: sendData.txId,
              completedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // Create sweep transaction record
            await db.collection('transactions').add({
              traderId: traderId,
              type: 'sweep',
              amount: 0, // No INR value, just USDT movement
              usdtAmount: amount,
              status: 'completed',
              autoVerified: true,
              txHash: sendData.txId,
              fromAddress: fromAddress,
              toAddress: adminWallet,
              description: `Auto-sweep ${amount} USDT to admin wallet`,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          } else {
            throw new Error('No txId in response');
          }

        } catch (error) {
          console.error(`❌ Sweep failed for ${sweep.id}:`, error);
          
          // Update sweep with error
          await db.collection('sweepQueue').doc(sweepDoc.id).update({
            status: 'failed',
            error: error.message,
            failedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }

      console.log('✅ Sweep process complete');

    } catch (error) {
      console.error('❌ Error in sweep process:', error);
    }
  });

// ============================================================================
// 5. BACKUP POLLING (Runs every 10 minutes - in case webhook fails)
// ============================================================================
exports.pollForDeposits = functions.pubsub
  .schedule('every 2 minutes')
  .onRun(async (context) => {
    console.log('🔍 Polling for missed deposits...');

    try {
      const configDoc = await db.collection('system').doc('tatumConfig').get();
      
      if (!configDoc.exists) {
        console.log('❌ Tatum config not found');
        return;
      }

      const { tatumApiKey } = configDoc.data();

      // Get all trader addresses
      const addressMappings = await db.collection('addressMapping').get();
      
      for (const addressDoc of addressMappings.docs) {
        const { traderId } = addressDoc.data();
        const address = addressDoc.id;

        // Check last 10 transactions for this address
        const txResponse = await fetch(
          `https://api.tatum.io/v3/tron/transaction/account/${address}?limit=10`,
          {
            headers: { 'x-api-key': tatumApiKey },
          }
        );

        const transactions = await txResponse.json();

        // Process each transaction
        for (const tx of transactions) {
          // Check if already processed
          const existingTx = await db.collection('transactions')
            .where('txHash', '==', tx.txID)
            .limit(1)
            .get();

          if (!existingTx.empty) continue;

          // If USDT transaction to this address, process it
          if (tx.to === address && tx.tokenInfo?.symbol === 'USDT') {
            console.log(`💰 Found missed deposit: ${tx.txID}`);
            
            // Process same as webhook
            const amount = parseFloat(tx.value) / 1000000; // USDT has 6 decimals
            const usdtRate = 92;
            const inrAmount = Math.round(amount * usdtRate);

            // Credit balance and create records
            const traderRef = db.collection('trader').doc(traderId);
            await traderRef.update({
              balance: admin.firestore.FieldValue.increment(inrAmount),
            });

            await db.collection('transactions').add({
              traderId: traderId,
              type: 'deposit',
              amount: inrAmount,
              usdtAmount: amount,
              usdtRate: usdtRate,
              status: 'completed',
              autoVerified: true,
              txHash: tx.txID,
              fromAddress: address,
              description: `USDT Deposit (Polled) - ${amount} USDT`,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            console.log(`✅ Processed missed deposit: ₹${inrAmount}`);
          }
        }
      }

      console.log('✅ Polling complete');

    } catch (error) {
      console.error('❌ Error polling deposits:', error);
    }
  });

// ============================================================================
// 6. HELPER: GET TRADER DEPOSIT ADDRESS
// ============================================================================
exports.getTraderDepositAddress = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  
  try {
    const { traderId } = req.query;
    
    const traderDoc = await db.collection('trader').doc(traderId).get();
    
    if (!traderDoc.exists) {
      res.status(404).json({ error: 'Trader not found' });
      return;
    }

    const { usdtDepositAddress, derivationIndex } = traderDoc.data();

    res.json({
      success: true,
      address: usdtDepositAddress,
      derivationIndex: derivationIndex,
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// 7. HELPER: GET TRANSACTION HISTORY
// ============================================================================
exports.getTransactionHistory = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  
  try {
    const { traderId, limit = 50 } = req.query;
    
    const txSnapshot = await db.collection('transactions')
      .where('traderId', '==', traderId)
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit))
      .get();

    const transactions = [];
    txSnapshot.forEach(doc => {
      transactions.push({ id: doc.id, ...doc.data() });
    });

    res.json({
      success: true,
      transactions: transactions,
      count: transactions.length,
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// ===================================================================
// CREATE MERCHANT FUNCTION
// ===================================================================
exports.createMerchant = functions.https.onCall(async (data, context) => {
  // 1. Check authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated', 
      'Must be authenticated to create merchant'
    );
  }

  // 2. Verify admin role
  try {
   const adminDoc = await admin.firestore()
  .collection('admin')
  .doc(context.auth.uid)
  .get();

if (!adminDoc.exists) {
  throw new functions.https.HttpsError(
    'permission-denied',
    'Only admins can create merchants'
  );
}

  } catch (error) {
    throw new functions.https.HttpsError(
      'permission-denied', 
      'Error verifying admin role: ' + error.message
    );
  }

  // 3. Extract data
  const {
    email,
    password,
    businessName,
    contactPerson,
    phone,
    webhookUrl,
    testMode,
    active,
    initialBalance,
    payinCommissionRate,
    payoutCommissionRate,
    apiKey,
    webhookSecret
  } = data;

  // 4. Validate required fields
  if (!email || !password || !businessName) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Email, password, and business name are required'
    );
  }

  try {
    // 5. Create Firebase Auth user
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      emailVerified: false,
      disabled: false
    });

    const uid = userRecord.uid;
    console.log('Created auth user with UID:', uid);

    // 6. Create user role document
    await admin.firestore().collection('users').doc(uid).set({
      email: email,
      role: 'merchant',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: context.auth.uid
    });
    console.log('Created user role document');

    // 7. Create merchant document
    const merchantDoc = await admin.firestore().collection('merchant').add({
      uid: uid,
      email: email,
      businessName: businessName,
      contactPerson: contactPerson || '',
      phone: phone || '',
      
      // API Configuration
      apiKey: apiKey,
      webhookUrl: webhookUrl || '',
      webhookSecret: webhookSecret,
      
      // Settings
      testMode: testMode !== undefined ? testMode : true,
      active: active !== undefined ? active : true,
      
      // Financial
      balance: 0,
      currentBalance: Number(initialBalance) || 2000,
      initialCredit: Number(initialBalance) || 2000,
      totalRevenue: 0,
      totalTransactions: 0,
      totalPayinsProcessed: 0,
      totalPayoutsProcessed: 0,
      totalCommissionPaidINR: 0,
      totalCommissionPaidUSDT: 0,
      totalUSDTWithdrawn: 0,
      payinCommissionRate: Number(payinCommissionRate) || 5,
      payoutCommissionRate: Number(payoutCommissionRate) || 2,
      isActive: active !== undefined ? active : true,
      
      // Role
      role: 'merchant',
      
      // Timestamps
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      apiKeyUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      webhookSecretUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: context.auth.uid
    });
    console.log('Created merchant document:', merchantDoc.id);

    // 8. Return success
    return {
      success: true,
      uid: uid,
      merchantId: merchantDoc.id,
      email: email,
      businessName: businessName,
      message: 'Merchant created successfully'
    };

  } catch (error) {
    console.error('Error creating merchant:', error);
    
    // If user was created but something else failed, try to clean up
    if (error.code !== 'auth/email-already-exists') {
      // Attempt to delete the auth user if it was created
      try {
        const userRecord = await admin.auth().getUserByEmail(email);
        await admin.auth().deleteUser(userRecord.uid);
        console.log('Cleaned up auth user after error');
      } catch (cleanupError) {
        console.error('Could not clean up auth user:', cleanupError);
      }
    }
    
    throw new functions.https.HttpsError(
      'internal',
      'Failed to create merchant: ' + error.message
    );
  }
});
exports.createTraderComplete = functions.https.onCall(async (data, context) => {
  // Check admin permission
  if (!context.auth || !context.auth.token.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Only admins');
  }

  const { email, password } = data;

  // CREATE AUTH USER SERVER-SIDE (admin stays logged in!)
  const userRecord = await admin.auth().createUser({
    email: email,
    password: password,
  });

  const uid = userRecord.uid;

  // Set custom claim
  await admin.auth().setCustomUserClaims(uid, { role: 'trader' });

  // Create Firestore document
  await db.collection('trader').doc(uid).set({
    uid, role: 'trader', userType: 'trader',
    // ... all other fields
  });

  return { success: true, uid: uid };
});

exports.createTraderDocument = functions.auth.user().onCreate(async (user) => {
  try {
    const uid = user.uid;
    const email = user.email;
    
    console.log('🔔 New user created:', uid, email);

    // Get custom claims to check role
    const userRecord = await admin.auth().getUser(uid);
    const customClaims = userRecord.customClaims || {};
    
    console.log('📋 Custom claims:', customClaims);

    // Only create trader document if role is 'trader'
    if (customClaims.role === 'trader') {
      console.log('✅ Creating trader document for:', uid);

      // Create trader document
      await db.collection('trader').doc(uid).set({
        // CRITICAL FIELDS
        uid: uid,
        role: 'trader',
        userType: 'trader',
        
        // Basic Info
        email: email,
        name: userRecord.displayName || email.split('@')[0],
        phone: userRecord.phoneNumber || '',
        
        // Financial Fields
        balance: 0,
        workingBalance: 0,
        securityHold: 0,
        overallCommission: 0,
        
        // Commission Rates
        payinCommission: 3,
        payoutCommission: 1,
        
        // Status
        isActive: true,
        isApproved: true,
        
        // Payment Accounts
        currentMerchantUpis: [],
        corporateMerchantUpis: [],
        normalUpis: [],
        bigUpis: [],
        impsAccounts: [],
        
        // USDT
        usdtDepositAddress: null,
        derivationIndex: null,
        
        // Timestamps
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastModified: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log('✅ Trader document created successfully!');
      
      return { success: true, message: 'Trader document created' };
    } else {
      console.log('ℹ️ Not a trader, skipping document creation');
      return { success: false, message: 'Not a trader role' };
    }

  } catch (error) {
    console.error('❌ Error creating trader document:', error);
    // Don't throw error - let user creation succeed even if document creation fails
    return { success: false, error: error.message };
  }
});

/**
 * Alternative: HTTP Callable Function
 * Call this from admin panel after creating user
 */
exports.createTraderManual = functions.https.onCall(async (data, context) => {
  try {
    // Check if caller is admin
    if (!context.auth || !context.auth.token.admin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admins can create traders'
      );
    }

    const { uid, email, name, phone, payinCommission, payoutCommission } = data;

    if (!uid || !email) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'UID and email are required'
      );
    }

    // Set custom claims
    await admin.auth().setCustomUserClaims(uid, { role: 'trader' });

    // Create trader document
    await db.collection('trader').doc(uid).set({
      uid: uid,
      role: 'trader',
      userType: 'trader',
      email: email,
      name: name || email.split('@')[0],
      phone: phone || '',
      balance: 0,
      workingBalance: 0,
      securityHold: 0,
      overallCommission: 0,
      payinCommission: payinCommission || 3,
      payoutCommission: payoutCommission || 1,
      isActive: true,
      isApproved: true,
      currentMerchantUpis: [],
      corporateMerchantUpis: [],
      normalUpis: [],
      bigUpis: [],
      impsAccounts: [],
      usdtDepositAddress: null,
      derivationIndex: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastModified: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log('✅ Trader created:', uid);

    return { 
      success: true, 
      message: 'Trader created successfully',
      uid: uid 
    };

  } catch (error) {
    console.error('❌ Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Fix existing trader - Add missing uid field
 */
exports.fixTraderDocument = functions.https.onCall(async (data, context) => {
  try {
    // Check if caller is admin
    if (!context.auth || !context.auth.token.admin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admins can fix traders'
      );
    }

    const { traderId } = data;

    if (!traderId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Trader ID is required'
      );
    }

    // Update trader document
    await db.collection('trader').doc(traderId).set({
      uid: traderId,
      role: 'trader',
      userType: 'trader',
    }, { merge: true });

    console.log('✅ Fixed trader:', traderId);

    return { 
      success: true, 
      message: 'Trader document fixed successfully' 
    };

  } catch (error) {
    console.error('❌ Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Batch fix all traders - Add missing uid fields
 */
exports.fixAllTraders = functions.https.onCall(async (data, context) => {
  try {
    // Check if caller is admin
    if (!context.auth || !context.auth.token.admin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admins can run batch fixes'
      );
    }

    const tradersSnapshot = await db.collection('trader').get();
    const batch = db.batch();
    let fixedCount = 0;

    tradersSnapshot.forEach((doc) => {
      const data = doc.data();
      const docId = doc.id;

      // If uid field is missing or doesn't match doc ID
      if (!data.uid || data.uid !== docId) {
        batch.set(doc.ref, {
          uid: docId,
          role: 'trader',
          userType: 'trader',
        }, { merge: true });
        
        fixedCount++;
        console.log('Fixing trader:', docId);
      }
    });

    await batch.commit();

    console.log(`✅ Fixed ${fixedCount} traders`);

    return { 
      success: true, 
      message: `Fixed ${fixedCount} trader documents`,
      count: fixedCount
    };

  } catch (error) {
    console.error('❌ Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Set user role (custom claims)
 */
exports.setUserRole = functions.https.onCall(async (data, context) => {
  try {
    // Verify caller is admin
    if (!context.auth || !context.auth.token.admin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admins can set user roles'
      );
    }

    const { uid, role } = data;

    if (!uid || !role) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'UID and role are required'
      );
    }

    // Set custom claim
    await admin.auth().setCustomUserClaims(uid, { role: role });

    console.log(`✅ Set role "${role}" for user:`, uid);

    return { 
      success: true, 
      message: `Role "${role}" set successfully` 
    };

  } catch (error) {
    console.error('❌ Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});










