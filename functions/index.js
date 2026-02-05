/**
 * Firebase Cloud Functions - Combined
 * USDT Rate Fetching + Payin/Payout Operations
 */

const functions = require("firebase-functions");
const cors = require("cors")({origin: true});
const admin = require("firebase-admin");
const crypto = require("crypto");
const PayinEngine = require("./engine/PayinEngine");
const PayoutEngine = require("./engine/PayoutEngine");
const DisputeEngine = require("./engine/DisputeEngine");

// Initialize Firebase Admin (only once)
admin.initializeApp();
const db = admin.firestore();

// ============================================
// AUDIT LOGGING HELPER (Week 2 - Priority #3)
// ============================================
async function logAuditEvent({
  action,
  category,
  entityType,
  entityId,
  entityName,
  details = {},
  balanceBefore = null,
  balanceAfter = null,
  severity = 'info',
  source = 'webhook',
}) {
  try {
    await db.collection('adminLog').add({
      action,
      category,
      entityType: entityType || null,
      entityId: entityId || null,
      entityName: entityName || null,
      performedBy: 'system',
      performedByName: 'Cloud Function',
      performedByRole: 'system',
      performedByIp: null,
      details: {
        before: details.before !== undefined ? details.before : null,
        after: details.after !== undefined ? details.after : null,
        amount: details.amount || null,
        note: details.note || null,
        metadata: details.metadata || null,
      },
      balanceBefore,
      balanceAfter,
      severity,
      requiresReview: false,
      source,
      version: '1.0.0',
      userAgent: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`✅ Audit log created: ${action}`);
  } catch (error) {
    console.error('❌ Failed to create audit log:', error);
  }
}

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
      .where('liveApiKey', '==', apiKey)
      .where('active', '==', true)
      .limit(1)
      .get();
    
    if (merchantSnapshot.empty) {
      console.log('❌ Invalid API key:', apiKey);
      return res.status(401).json({ 
        error: 'Invalid or inactive API key' 
      });
    }
    
    const merchantDoc = merchantSnapshot.docs[0];
    const merchantId = merchantDoc.id;
    const merchantData = merchantDoc.data();
    
    console.log('✅ Merchant verified:', merchantData.businessName);
    
    // 🚀 USE PAYIN ENGINE v2.0 FOR SMART UPI SELECTION
    const engine = new PayinEngine(db);
    const selectionResult = await engine.selectUpi(amountNum, merchantId);
    
    if (!selectionResult.success) {
      console.log('❌ Engine failed to select UPI:', selectionResult.error);
      return res.status(503).json({ 
        error: selectionResult.error || 'No payment method available. Please try again later.' 
      });
    }
    
    const { upiId, holderName, traderId, score, attempts } = selectionResult;
    console.log(`✅ Engine selected: ${upiId} (Score: ${score}, Attempts: ${attempts})`);
    
    const payinData = {
      merchantId: merchantId,
      traderId: traderId,
      userId: userId,
      orderId: orderId || null,
      amount: amountNum,
      status: 'pending',
      upiId: upiId,
      holderName: holderName || 'Account Holder',
      utrId: null,
      timer: 600,
      requestedAt: admin.firestore.FieldValue.serverTimestamp(),
      completedAt: null,
      metadata: metadata || null,
      testMode: merchantData.testMode || false,
      // Engine metadata
      engineVersion: '2.0',
      selectionScore: score,
      selectionAttempts: attempts,
    };
    
    const payinRef = await db.collection('payin').add(payinData);
    console.log('✅ Payin created:', payinRef.id);
    
    return res.status(200).json({
      success: true,
      payinId: payinRef.id,
      upiId: upiId,
      holderName: holderName,
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
      .where('liveApiKey', '==', apiKey)
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
    
    // 🚀 UPDATE UPI STATS via Payin Engine
    try {
      const engine = new PayinEngine(db);
      await engine.updateUpiStats(
        after.upiId,
        after.traderId,
        after.status,
        after.amount
      );
      console.log('✅ UPI stats updated');
    } catch (statsError) {
      console.error('⚠️ Failed to update UPI stats:', statsError.message);
      // Continue with webhook - stats update is non-critical
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
      .where('liveApiKey', '==', apiKey)
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

    // 🔥 AUDIT LOG: USDT Deposit Detected (Priority #3)
    await logAuditEvent({
      action: 'usdt_deposit_detected',
      category: 'financial',
      entityType: 'trader',
      entityId: traderId,
      entityName: traderId,
      details: {
        amount: inrAmount,
        metadata: {
          usdtAmount: amount,
          txHash: txId,
          address,
          rate: usdtRate,
        },
      },
      severity: 'info',
      source: 'webhook',
    });

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
    const traderName = traderDoc.data().name || 'Unknown Trader';

    await traderRef.update({
      balance: newBalance,
      lastDepositAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`✅ Balance updated: ₹${currentBalance} → ₹${newBalance}`);

    // 🔥 AUDIT LOG: USDT Deposit Credited (Priority #3)
    await logAuditEvent({
      action: 'usdt_deposit_credited',
      category: 'financial',
      entityType: 'trader',
      entityId: traderId,
      entityName: traderName,
      details: {
        amount: inrAmount,
        metadata: {
          usdtAmount: amount,
          txHash: txId,
        },
      },
      balanceBefore: currentBalance,
      balanceAfter: newBalance,
      severity: 'info',
      source: 'webhook',
    });

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
  try {
    // Check admin permission
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    
    // Optional: Check if admin (uncomment if you have admin claims set up)
    // if (!context.auth.token.admin) {
    //   throw new functions.https.HttpsError('permission-denied', 'Only admins can create traders');
    // }

    const { 
      email, 
      password, 
      name,
      phone,
      priority,
      payinCommission,
      payoutCommission,
      balance,
      securityHold,
      telegramId,
      telegramGroupLink,
      active
    } = data;

    // Validate required fields
    if (!email || !password) {
      throw new functions.https.HttpsError('invalid-argument', 'Email and password are required');
    }

    if (password.length < 6) {
      throw new functions.https.HttpsError('invalid-argument', 'Password must be at least 6 characters');
    }

    console.log('🚀 Creating trader:', email);

    // Step 1: CREATE AUTH USER SERVER-SIDE (admin stays logged in!)
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: name || email.split('@')[0],
    });

    const uid = userRecord.uid;
    console.log('✅ Auth user created:', uid);

    // Step 2: Set custom claims
    await admin.auth().setCustomUserClaims(uid, { role: 'trader' });
    console.log('✅ Custom claims set');

    // Step 3: Calculate working balance
    const balanceNum = Number(balance) || 0;
    const securityHoldNum = Number(securityHold) || 0;
    const workingBalance = balanceNum - securityHoldNum;

    // Step 4: Create FULL Firestore document with ALL fields
    const traderData = {
      // CRITICAL FIELDS
      uid: uid,
      role: 'trader',
      userType: 'trader',
      
      // Basic Info
      email: email,
      name: name || email.split('@')[0],
      phone: phone || '',
      priority: priority || 'Normal',
      
      // Financial Fields
      balance: balanceNum,
      securityHold: securityHoldNum,
      workingBalance: workingBalance,
      overallCommission: 0,
      
      // Commission Rates
      payinCommission: Number(payinCommission) || 4,
      payoutCommission: Number(payoutCommission) || 1,
      commissionRate: Number(payinCommission) || 4, // backwards compatibility
      
      // Status
      active: active !== undefined ? active : true,
      isActive: active !== undefined ? active : true,
      isApproved: true,
      status: active !== false ? 'active' : 'inactive',
      
      // Telegram
      telegramId: telegramId || '',
      telegramGroupLink: telegramGroupLink || '',
      
      // Payment Accounts (empty arrays)
      currentMerchantUpis: [],
      corporateMerchantUpis: [],
      normalUpis: [],
      bigUpis: [],
      impsAccounts: [],
      
      // USDT (will be set later)
      usdtDepositAddress: null,
      derivationIndex: null,
      mnemonic: null,
      
      // Stats
      totalPayins: 0,
      totalPayouts: 0,
      
      // Timestamps
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastModified: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection('trader').doc(uid).set(traderData);
    console.log('✅ Firestore document created with all fields');

    return { 
      success: true, 
      uid: uid,
      message: 'Trader created successfully'
    };

  } catch (error) {
    console.error('❌ Error creating trader:', error);
    
    // If auth user was created but Firestore failed, we should handle cleanup
    // but for now just throw the error
    throw new functions.https.HttpsError('internal', error.message || 'Failed to create trader');
  }
});


/**
 * FALLBACK: Auth trigger - Only runs if createTraderComplete wasn't used
 * This is a safety net, not the primary method
 */
exports.createTraderDocument = functions.auth.user().onCreate(async (user) => {
  try {
    const uid = user.uid;
    const email = user.email;
    
    console.log('🔔 Auth trigger - New user:', uid, email);

    // Check if document already exists (created by createTraderComplete)
    const existingDoc = await db.collection('trader').doc(uid).get();
    if (existingDoc.exists) {
      console.log('ℹ️ Trader document already exists, skipping trigger');
      return { success: true, message: 'Document already exists' };
    }

    // Wait a moment for custom claims to be set
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get custom claims to check role
    const userRecord = await admin.auth().getUser(uid);
    const customClaims = userRecord.customClaims || {};
    
    console.log('📋 Custom claims:', customClaims);

    // Only create trader document if role is 'trader'
    if (customClaims.role === 'trader') {
      console.log('✅ Creating trader document via trigger for:', uid);

      await db.collection('trader').doc(uid).set({
        uid: uid,
        role: 'trader',
        userType: 'trader',
        email: email,
        name: userRecord.displayName || email.split('@')[0],
        phone: userRecord.phoneNumber || '',
        priority: 'Normal',
        balance: 0,
        workingBalance: 0,
        securityHold: 0,
        overallCommission: 0,
        payinCommission: 4,
        payoutCommission: 1,
        commissionRate: 4,
        isActive: true,
        active: true,
        isApproved: true,
        status: 'active',
        currentMerchantUpis: [],
        corporateMerchantUpis: [],
        normalUpis: [],
        bigUpis: [],
        impsAccounts: [],
        usdtDepositAddress: null,
        derivationIndex: null,
        totalPayins: 0,
        totalPayouts: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log('✅ Trader document created via trigger');
      return { success: true, message: 'Trader document created' };
    } else {
      console.log('ℹ️ Not a trader role, skipping');
      return { success: false, message: 'Not a trader role' };
    }

  } catch (error) {
    console.error('❌ Error in trigger:', error);
    return { success: false, error: error.message };
  }
});


/**
 * UPDATE TRADER - For editing existing traders
 */
exports.updateTrader = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { traderId, updates } = data;

    if (!traderId) {
      throw new functions.https.HttpsError('invalid-argument', 'Trader ID is required');
    }

    // Calculate working balance if balance or securityHold changed
    if (updates.balance !== undefined || updates.securityHold !== undefined) {
      const traderDoc = await db.collection('trader').doc(traderId).get();
      const currentData = traderDoc.data() || {};
      
      const newBalance = updates.balance !== undefined ? updates.balance : currentData.balance || 0;
      const newSecurityHold = updates.securityHold !== undefined ? updates.securityHold : currentData.securityHold || 0;
      
      updates.workingBalance = newBalance - newSecurityHold;
    }

    // Sync active/isActive/status
    if (updates.active !== undefined) {
      updates.isActive = updates.active;
      updates.status = updates.active ? 'active' : 'inactive';
    }

    updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    updates.lastModified = admin.firestore.FieldValue.serverTimestamp();

    await db.collection('trader').doc(traderId).update(updates);

    console.log('✅ Trader updated:', traderId);

    return { success: true, message: 'Trader updated successfully' };

  } catch (error) {
    console.error('❌ Error updating trader:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});


/**
 * DELETE TRADER - Removes auth user and Firestore document
 */
exports.deleteTrader = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { traderId } = data;

    if (!traderId) {
      throw new functions.https.HttpsError('invalid-argument', 'Trader ID is required');
    }

    // Delete Firestore document
    await db.collection('trader').doc(traderId).delete();
    console.log('✅ Firestore document deleted');

    // Try to delete auth user (might fail if doesn't exist)
    try {
      await admin.auth().deleteUser(traderId);
      console.log('✅ Auth user deleted');
    } catch (authError) {
      console.log('ℹ️ Auth user not found or already deleted');
    }

    return { success: true, message: 'Trader deleted successfully' };

  } catch (error) {
    console.error('❌ Error deleting trader:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================
// PAYIN ENGINE - SETUP & MAINTENANCE
// ============================================

/**
 * INITIALIZE ENGINE CONFIG (Call once to setup)
 * GET /initPayinEngine
 */
exports.initPayinEngine = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  
  try {
    console.log('🚀 Initializing Payin Engine v2.0...');
    
    // 1. Create engine config
    const engineConfig = {
      weights: {
        successRate: 25,
        dailyLimitLeft: 20,
        cooldown: 15,
        amountMatch: 15,
        traderBalance: 10,
        bankHealth: 5,
        timeWindow: 5,
        recentFailures: 5,
      },
      minScoreThreshold: 30,
      maxCandidates: 5,
      maxFallbackAttempts: 3,
      cooldownMinutes: 2,
      maxDailyTxnsPerUpi: 50,
      failureThreshold: 3,
      amountTiers: {
        low: { min: 500, max: 2000 },
        medium: { min: 2001, max: 10000 },
        high: { min: 10001, max: 50000 },
      },
      enableRandomness: true,
      enableFallback: true,
      enableLogging: true,
      randomnessFactor: 0.1,
      scoreExponent: 2,
      version: '2.0',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    await db.collection('system').doc('engineConfig').set(engineConfig, { merge: true });
    console.log('✅ Engine config created');
    
    // 2. Create bank health documents
    const banks = {
      sbi: { status: 'healthy', successRate24h: 95, maintenanceWindows: [{ day: 'sunday', start: '00:00', end: '06:00' }] },
      hdfc: { status: 'healthy', successRate24h: 96, maintenanceWindows: [] },
      axis: { status: 'healthy', successRate24h: 94, maintenanceWindows: [] },
      icici: { status: 'healthy', successRate24h: 95, maintenanceWindows: [] },
      paytm: { status: 'healthy', successRate24h: 92, maintenanceWindows: [] },
      iob: { status: 'healthy', successRate24h: 90, maintenanceWindows: [] },
      kotak: { status: 'healthy', successRate24h: 93, maintenanceWindows: [] },
      yes: { status: 'healthy', successRate24h: 91, maintenanceWindows: [] },
    };
    
    for (const [bank, health] of Object.entries(banks)) {
      await db.collection('bankHealth').doc(bank).set({
        ...health,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    console.log('✅ Bank health data created');
    
    // 3. Initialize upiPool placeholder
    await db.collection('upiPool').doc('_placeholder').set({
      _note: 'UPIs are extracted from trader documents. Migrate here for advanced tracking.',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    console.log('✅ upiPool initialized');
    
    res.status(200).json({
      success: true,
      message: 'Payin Engine v2.0 initialized successfully!',
      config: {
        weights: engineConfig.weights,
        features: {
          randomness: engineConfig.enableRandomness,
          fallback: engineConfig.enableFallback,
          logging: engineConfig.enableLogging,
        },
      },
      banksConfigured: Object.keys(banks),
    });
    
  } catch (error) {
    console.error('❌ Init error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * MIGRATE UPIs FROM TRADERS TO upiPool
 * GET /migrateUpisToPool
 */
exports.migrateUpisToPool = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  
  try {
    console.log('🔄 Migrating UPIs to upiPool...');
    
    const tradersSnapshot = await db.collection('trader').get();
    let migratedCount = 0;
    const migrated = [];
    
    for (const traderDoc of tradersSnapshot.docs) {
      const trader = traderDoc.data();
      const traderId = traderDoc.id;
      
      if (!trader.active) continue;
      
      // Process all UPI arrays
      const upiSources = [
        { upis: trader.bigUpis || [], tier: 'high', type: 'big' },
        { upis: trader.currentMerchantUpis || [], tier: 'medium', type: 'merchant' },
        { upis: trader.normalUpis || [], tier: 'low', type: 'normal' },
      ];
      
      for (const source of upiSources) {
        for (const upi of source.upis) {
          if (!upi.upiId) continue;
          
          // Create unique doc ID from UPI
          const docId = upi.upiId.replace(/[@.]/g, '_').toLowerCase();
          
          // Extract bank from UPI handle
          const handle = upi.upiId.split('@')[1]?.toLowerCase() || '';
          let bank = 'other';
          const bankMap = {
            'oksbi': 'sbi', 'sbi': 'sbi',
            'okaxis': 'axis', 'axisbank': 'axis', 'axis': 'axis',
            'okicici': 'icici', 'icici': 'icici', 'ibl': 'icici',
            'okhdfcbank': 'hdfc', 'hdfcbank': 'hdfc',
            'ybl': 'paytm', 'paytm': 'paytm',
            'iob': 'iob',
            'kotak': 'kotak',
            'yesbank': 'yes',
          };
          for (const [key, value] of Object.entries(bankMap)) {
            if (handle.includes(key)) { bank = value; break; }
          }
          
          const upiDoc = {
            upiId: upi.upiId,
            holderName: upi.holderName || trader.name || 'Account Holder',
            bank: bank,
            type: source.type,
            amountTier: source.tier,
            traderId: traderId,
            traderName: trader.name || '',
            
            // Limits
            dailyLimit: upi.dailyLimit || (source.type === 'big' ? 200000 : 100000),
            perTxnMin: upi.perTxnMin || 500,
            perTxnMax: upi.perTxnMax || (source.type === 'big' ? 50000 : 25000),
            
            // Stats (initialize fresh)
            stats: {
              todayVolume: 0,
              todayCount: 0,
              todaySuccess: 0,
              todayFailed: 0,
              lastHourFailures: 0,
              lastUsedAt: null,
              lastSuccessAt: null,
              lastFailedAt: null,
              lastResetAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            
            // Performance (will be calculated over time)
            performance: {
              successRate: 85, // Default assumption
              totalTxns: 0,
              totalSuccess: 0,
              totalFailed: 0,
              avgCompletionTime: 0,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            
            active: upi.active !== false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            migratedFrom: 'trader',
          };
          
          await db.collection('upiPool').doc(docId).set(upiDoc, { merge: true });
          migratedCount++;
          migrated.push({ upiId: upi.upiId, bank, type: source.type, trader: trader.name });
        }
      }
    }
    
    // Remove placeholder if it exists
    await db.collection('upiPool').doc('_placeholder').delete().catch(() => {});
    
    console.log(`✅ Migrated ${migratedCount} UPIs`);
    
    res.status(200).json({
      success: true,
      message: `Migrated ${migratedCount} UPIs to upiPool`,
      count: migratedCount,
      upis: migrated,
    });
    
  } catch (error) {
    console.error('❌ Migration error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET ENGINE STATS & SELECTION LOGS
 * GET /getEngineStats
 */
exports.getEngineStats = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  
  try {
    // Get recent selection logs
    const logsSnapshot = await db.collection('selectionLogs')
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get();
    
    const logs = [];
    logsSnapshot.forEach(doc => {
      const data = doc.data();
      logs.push({
        id: doc.id,
        merchantId: data.merchantId,
        amount: data.amount,
        selectedUpi: data.selected?.upiId || null,
        score: data.selected?.score || null,
        attempts: data.totalAttempts,
        success: data.success,
        timestamp: data.timestamp,
      });
    });
    
    // Get UPI pool stats
    const upiPoolSnapshot = await db.collection('upiPool').get();
    const upiStats = [];
    let totalVolume = 0;
    let totalTxns = 0;
    
    upiPoolSnapshot.forEach(doc => {
      if (doc.id === '_placeholder') return;
      const data = doc.data();
      const stats = data.stats || {};
      
      upiStats.push({
        upiId: data.upiId,
        bank: data.bank,
        type: data.type,
        trader: data.traderName,
        todayVolume: stats.todayVolume || 0,
        todayCount: stats.todayCount || 0,
        todaySuccess: stats.todaySuccess || 0,
        todayFailed: stats.todayFailed || 0,
        successRate: data.performance?.successRate || 0,
        active: data.active,
      });
      
      totalVolume += stats.todayVolume || 0;
      totalTxns += stats.todayCount || 0;
    });
    
    // Sort by today's volume
    upiStats.sort((a, b) => b.todayVolume - a.todayVolume);
    
    // Get engine config
    const configDoc = await db.collection('system').doc('engineConfig').get();
    const config = configDoc.exists ? configDoc.data() : {};
    
    res.status(200).json({
      success: true,
      summary: {
        totalUpisInPool: upiStats.length,
        activeUpis: upiStats.filter(u => u.active).length,
        todayTotalVolume: totalVolume,
        todayTotalTxns: totalTxns,
      },
      recentSelections: logs,
      upiPerformance: upiStats.slice(0, 20), // Top 20
      config: {
        weights: config.weights,
        minScoreThreshold: config.minScoreThreshold,
        enableRandomness: config.enableRandomness,
      },
    });
    
  } catch (error) {
    console.error('❌ Stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * RESET DAILY UPI STATS (Runs at midnight IST)
 */
exports.resetDailyUpiStats = functions.pubsub
  .schedule('0 0 * * *')
  .timeZone('Asia/Kolkata')
  .onRun(async (context) => {
    console.log('🔄 Starting daily UPI stats reset...');
    
    try {
      // Reset upiPool stats
      const upiPoolSnapshot = await db.collection('upiPool').get();
      
      let resetCount = 0;
      const batch = db.batch();
      
      upiPoolSnapshot.forEach(doc => {
        if (doc.id !== '_placeholder') {
          batch.update(doc.ref, {
            'stats.todayVolume': 0,
            'stats.todayCount': 0,
            'stats.todaySuccess': 0,
            'stats.todayFailed': 0,
            'stats.lastHourFailures': 0,
            'stats.lastResetAt': admin.firestore.FieldValue.serverTimestamp(),
          });
          resetCount++;
        }
      });
      
      if (resetCount > 0) {
        await batch.commit();
        console.log(`✅ Reset stats for ${resetCount} UPIs in upiPool`);
      }
      
      // Also reset selection logs older than 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const oldLogsSnapshot = await db.collection('selectionLogs')
        .where('timestamp', '<', sevenDaysAgo)
        .limit(500)
        .get();
      
      if (!oldLogsSnapshot.empty) {
        const logBatch = db.batch();
        oldLogsSnapshot.forEach(doc => {
          logBatch.delete(doc.ref);
        });
        await logBatch.commit();
        console.log(`🗑️ Deleted ${oldLogsSnapshot.size} old selection logs`);
      }
      
      console.log('✅ Daily reset complete');
      return null;
      
    } catch (error) {
      console.error('❌ Error in daily reset:', error);
      return null;
    }
  });

/**
 * RESET HOURLY FAILURE COUNTS (Runs every hour)
 */
exports.resetHourlyFailures = functions.pubsub
  .schedule('0 * * * *')
  .timeZone('Asia/Kolkata')
  .onRun(async (context) => {
    console.log('🔄 Resetting hourly failure counts...');
    
    try {
      const upiPoolSnapshot = await db.collection('upiPool')
        .where('stats.lastHourFailures', '>', 0)
        .get();
      
      if (upiPoolSnapshot.empty) {
        console.log('✅ No UPIs with failures to reset');
        return null;
      }
      
      const batch = db.batch();
      upiPoolSnapshot.forEach(doc => {
        batch.update(doc.ref, {
          'stats.lastHourFailures': 0,
        });
      });
      
      await batch.commit();
      console.log(`✅ Reset failure counts for ${upiPoolSnapshot.size} UPIs`);
      return null;
      
    } catch (error) {
      console.error('❌ Error resetting hourly failures:', error);
      return null;
    }
  });

// ============================================
// PAYOUT ENGINE FUNCTIONS
// ============================================

/**
 * ASSIGN PAYOUT - Smart trader selection using Payout Engine
 * POST /assignPayout { payoutId }
 * Automatically picks the best trader for a pending payout
 */
exports.assignPayout = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).send('');

  try {
    const { payoutId } = req.body;

    if (!payoutId) {
      return res.status(400).json({ error: 'payoutId is required' });
    }

    // Get payout document
    const payoutRef = db.collection('payouts').doc(payoutId);
    const payoutDoc = await payoutRef.get();

    if (!payoutDoc.exists) {
      return res.status(404).json({ error: 'Payout not found' });
    }

    const payoutData = payoutDoc.data();

    if (payoutData.status !== 'pending') {
      return res.status(400).json({
        error: `Payout is not pending (current status: ${payoutData.status})`,
      });
    }

    const amount = Number(payoutData.amount);
    const merchantId = payoutData.merchantId || null;

    // Use Payout Engine for smart trader selection
    const engine = new PayoutEngine(db);
    const result = await engine.selectTrader(amount, merchantId, payoutId);

    if (!result.success) {
      console.log('❌ Payout Engine failed:', result.error);
      return res.status(503).json({
        error: result.error || 'No trader available. Try again later.',
      });
    }

    // Assign payout to selected trader
    await payoutRef.update({
      traderId: result.traderId,
      status: 'assigned',
      assignedAt: admin.firestore.FieldValue.serverTimestamp(),
      engineVersion: 'payout-1.0',
      selectionScore: result.score,
      selectionSummary: result.summary,
    });

    // Update trader's active payout count
    await engine.updateTraderStats(result.traderId, 'assigned', amount, null);

    console.log(`✅ Payout ${payoutId} assigned to ${result.traderName}`);

    return res.status(200).json({
      success: true,
      payoutId,
      traderId: result.traderId,
      traderName: result.traderName,
      score: result.score,
      summary: result.summary,
      reasons: result.reasons,
    });

  } catch (error) {
    console.error('❌ Error in assignPayout:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * AUTO-ASSIGN ALL PENDING PAYOUTS
 * POST /autoAssignPayouts
 * Runs the engine on all pending unassigned payouts
 */
exports.autoAssignPayouts = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).send('');

  try {
    // Get all pending unassigned payouts
    const pendingSnapshot = await db.collection('payouts')
      .where('status', '==', 'pending')
      .get();

    const unassigned = [];
    pendingSnapshot.forEach(doc => {
      const data = doc.data();
      if (!data.traderId) {
        unassigned.push({ id: doc.id, ...data });
      }
    });

    if (unassigned.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No pending payouts to assign',
        assigned: 0,
        failed: 0,
      });
    }

    console.log(`📋 Found ${unassigned.length} unassigned payouts`);

    const engine = new PayoutEngine(db);
    const results = { assigned: 0, failed: 0, details: [] };

    // Sort by oldest first (FIFO)
    unassigned.sort((a, b) => {
      const timeA = a.requestTime?.seconds || a.createdAt?.seconds || 0;
      const timeB = b.requestTime?.seconds || b.createdAt?.seconds || 0;
      return timeA - timeB;
    });

    for (const payout of unassigned) {
      const amount = Number(payout.amount);
      const result = await engine.selectTrader(amount, payout.merchantId, payout.id);

      if (result.success) {
        await db.collection('payouts').doc(payout.id).update({
          traderId: result.traderId,
          status: 'assigned',
          assignedAt: admin.firestore.FieldValue.serverTimestamp(),
          engineVersion: 'payout-1.0',
          selectionScore: result.score,
          selectionSummary: result.summary,
        });

        await engine.updateTraderStats(result.traderId, 'assigned', amount, null);

        results.assigned++;
        results.details.push({
          payoutId: payout.id,
          amount,
          traderId: result.traderId,
          traderName: result.traderName,
          score: result.score,
          summary: result.summary,
        });
      } else {
        results.failed++;
        results.details.push({
          payoutId: payout.id,
          amount,
          error: result.error,
        });
      }
    }

    console.log(`✅ Assigned: ${results.assigned}, Failed: ${results.failed}`);

    return res.status(200).json({
      success: true,
      total: unassigned.length,
      assigned: results.assigned,
      failed: results.failed,
      details: results.details,
    });

  } catch (error) {
    console.error('❌ Error in autoAssignPayouts:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET PAYOUT ENGINE STATS & SELECTION LOGS
 * GET /getPayoutEngineStats
 */
exports.getPayoutEngineStats = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');

  try {
    // Get recent payout selection logs
    const logsSnapshot = await db.collection('payoutSelectionLogs')
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get();

    const logs = [];
    logsSnapshot.forEach(doc => {
      const data = doc.data();
      logs.push({
        id: doc.id,
        payoutId: data.payoutId,
        merchantId: data.merchantId,
        amount: data.amount,
        amountTier: data.amountTier,
        selectedTrader: data.selected ? {
          traderId: data.selected.traderId,
          traderName: data.selected.traderName,
          score: data.selected.score,
          summary: data.selected.summary,
          whySelected: data.selected.whySelected,
        } : null,
        candidates: (data.candidates || []).map(c => ({
          traderId: c.traderId,
          traderName: c.traderName,
          score: c.score,
          summary: c.summary,
          reasons: c.reasons,
        })),
        success: data.success,
        error: data.error,
        attempts: data.totalAttempts,
        timestamp: data.timestamp,
      });
    });

    // Get trader stats
    const tradersSnapshot = await db.collection('trader').get();
    const traderStats = [];
    let totalActive = 0;

    tradersSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.isActive === false && data.active === false) return;

      const stats = data.payoutStats || {};
      traderStats.push({
        traderId: doc.id,
        traderName: data.name || 'Unknown',
        isOnline: data.isOnline || false,
        priority: data.priority || 'normal',
        activePayouts: stats.activePayouts || 0,
        todayCount: stats.todayCount || 0,
        todayCompleted: stats.todayCompleted || 0,
        todayCancelled: stats.todayCancelled || 0,
        todayVolume: stats.todayVolume || 0,
        totalCompleted: stats.totalCompleted || 0,
        totalCancelled: stats.totalCancelled || 0,
        avgCompletionMinutes: stats.avgCompletionMinutes || null,
        successRate: stats.totalAttempted > 0
          ? Math.round((stats.totalCompleted / stats.totalAttempted) * 100)
          : null,
      });
      totalActive++;
    });

    // Sort by today's completed
    traderStats.sort((a, b) => b.todayCompleted - a.todayCompleted);

    // Get payout engine config
    const configDoc = await db.collection('system').doc('payoutEngineConfig').get();
    const config = configDoc.exists ? configDoc.data() : {};

    // Summary stats
    const totalTodayPayouts = traderStats.reduce((sum, t) => sum + t.todayCount, 0);
    const totalTodayCompleted = traderStats.reduce((sum, t) => sum + t.todayCompleted, 0);
    const totalTodayVolume = traderStats.reduce((sum, t) => sum + t.todayVolume, 0);
    const totalActivePayouts = traderStats.reduce((sum, t) => sum + t.activePayouts, 0);

    res.status(200).json({
      success: true,
      summary: {
        totalTraders: totalActive,
        totalActivePayouts,
        todayTotalPayouts: totalTodayPayouts,
        todayCompleted: totalTodayCompleted,
        todayVolume: totalTodayVolume,
      },
      recentSelections: logs,
      traderPerformance: traderStats,
      config: {
        weights: config.weights,
        minScoreThreshold: config.minScoreThreshold,
        maxActivePayouts: config.maxActivePayouts,
        enableRandomness: config.enableRandomness,
      },
    });

  } catch (error) {
    console.error('❌ Payout stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * INIT PAYOUT ENGINE CONFIG
 * POST /initPayoutEngine
 */
exports.initPayoutEngine = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');

  try {
    const { DEFAULT_PAYOUT_CONFIG } = require('./engine/payoutConfig');

    await db.collection('system').doc('payoutEngineConfig').set(DEFAULT_PAYOUT_CONFIG, { merge: true });

    console.log('✅ Payout Engine config initialized');

    res.status(200).json({
      success: true,
      message: 'Payout Engine config initialized in Firestore',
      config: DEFAULT_PAYOUT_CONFIG,
    });

  } catch (error) {
    console.error('❌ Init error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * RESET DAILY PAYOUT STATS (Runs at midnight IST)
 */
exports.resetDailyPayoutStats = functions.pubsub
  .schedule('0 0 * * *')
  .timeZone('Asia/Kolkata')
  .onRun(async (context) => {
    console.log('🔄 Resetting daily payout stats...');
    try {
      const engine = new PayoutEngine(db);
      const result = await engine.resetDailyStats();
      console.log(`✅ Daily payout stats reset: ${result.reset} traders`);

      // Also clean up old payout selection logs (older than 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const oldLogs = await db.collection('payoutSelectionLogs')
        .where('timestamp', '<', sevenDaysAgo)
        .limit(500)
        .get();

      if (!oldLogs.empty) {
        const batch = db.batch();
        oldLogs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        console.log(`🗑️ Deleted ${oldLogs.size} old payout selection logs`);
      }

      return null;
    } catch (error) {
      console.error('❌ Error in daily payout reset:', error);
      return null;
    }
  });

// ============================================
// DISPUTE ENGINE FUNCTIONS
// ============================================

/**
 * ROUTE DISPUTE - Smart routing to the correct trader
 * POST /routeDispute { disputeId }
 */
exports.routeDispute = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).send('');

  try {
    const { disputeId } = req.body;
    if (!disputeId) {
      return res.status(400).json({ error: 'disputeId is required' });
    }

    const engine = new DisputeEngine(db);
    const result = await engine.routeDispute(disputeId);

    if (result.success) {
      return res.status(200).json({
        success: true,
        traderId: result.traderId,
        traderName: result.traderName,
        routeReason: result.routeReason,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

  } catch (error) {
    console.error('❌ Error in routeDispute:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * PROCESS TRADER RESPONSE
 * POST /processTraderDisputeResponse { disputeId, action, note, proofUrl }
 * action: 'accept' or 'reject'
 */
exports.processTraderDisputeResponse = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).send('');

  try {
    const { disputeId, action, note, proofUrl } = req.body;

    if (!disputeId || !action) {
      return res.status(400).json({ error: 'disputeId and action are required' });
    }

    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'action must be accept or reject' });
    }

    const engine = new DisputeEngine(db);
    const result = await engine.processTraderResponse(disputeId, action, note, proofUrl);

    return res.status(200).json(result);

  } catch (error) {
    console.error('❌ Error in processTraderDisputeResponse:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * ADMIN RESOLVE DISPUTE
 * POST /adminResolveDispute { disputeId, decision, adminNote, adminId }
 * decision: 'approve' or 'reject'
 * This is where balances get adjusted
 */
exports.adminResolveDispute = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).send('');

  try {
    const { disputeId, decision, adminNote, adminId } = req.body;

    if (!disputeId || !decision) {
      return res.status(400).json({ error: 'disputeId and decision are required' });
    }

    if (!['approve', 'reject'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be approve or reject' });
    }

    const engine = new DisputeEngine(db);
    const result = await engine.adminResolve(disputeId, decision, adminNote, adminId);

    return res.status(200).json(result);

  } catch (error) {
    console.error('❌ Error in adminResolveDispute:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET DISPUTE ENGINE STATS
 * GET /getDisputeEngineStats
 */
exports.getDisputeEngineStats = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');

  try {
    const engine = new DisputeEngine(db);
    const { stats, logs } = await engine.getStats();

    res.status(200).json({
      success: true,
      stats,
      logs,
    });

  } catch (error) {
    console.error('❌ Dispute stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * INIT DISPUTE ENGINE CONFIG
 * POST /initDisputeEngine
 */
exports.initDisputeEngine = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');

  try {
    const { DEFAULT_DISPUTE_CONFIG } = require('./engine/disputeConfig');
    await db.collection('system').doc('disputeEngineConfig').set(DEFAULT_DISPUTE_CONFIG, { merge: true });

    console.log('✅ Dispute Engine config initialized');

    res.status(200).json({
      success: true,
      message: 'Dispute Engine config initialized',
      config: DEFAULT_DISPUTE_CONFIG,
    });

  } catch (error) {
    console.error('❌ Init error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// WORKER MANAGEMENT FUNCTIONS
// ============================================

/**
 * CREATE WORKER
 * POST /createWorker { name, email, password, permissions }
 */
exports.createWorker = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).send('');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, email, password, permissions } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    console.log('🚀 Creating worker:', email);

    // Create Firebase Auth user
    const newUser = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: name,
    });

    console.log('✅ Auth user created:', newUser.uid);

    // Create Firestore doc in 'worker' collection
    const workerRef = db.collection('worker').doc(newUser.uid);
    await workerRef.set({
      uid: newUser.uid,
      name: name,
      email: email,
      permissions: permissions || [],
      isActive: true,
      role: 'worker',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: 'admin',
    });

    console.log('✅ Worker document created:', newUser.uid);

    return res.status(200).json({
      success: true,
      workerId: newUser.uid,
      message: 'Worker created successfully',
    });

  } catch (error) {
    console.error('❌ Error creating worker:', error);

    // If auth user was created but Firestore failed, try cleanup
    if (error.code !== 'auth/email-already-exists') {
      try {
        const { email } = req.body || {};
        if (email) {
          const userRecord = await admin.auth().getUserByEmail(email);
          await admin.auth().deleteUser(userRecord.uid);
          console.log('🧹 Cleaned up auth user after error');
        }
      } catch (cleanupErr) {
        // Ignore cleanup errors
      }
    }

    return res.status(500).json({
      error: error.message || 'Failed to create worker',
    });
  }
});

/**
 * DELETE WORKER
 * POST /deleteWorker { workerId, uid }
 */
exports.deleteWorker = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).send('');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { workerId, uid } = req.body;

    if (!workerId) {
      return res.status(400).json({ error: 'workerId is required' });
    }

    const authUid = uid || workerId;

    console.log('🗑️ Deleting worker:', workerId);

    // Delete Firestore document
    await db.collection('worker').doc(workerId).delete();
    console.log('✅ Firestore document deleted');

    // Delete Firebase Auth user
    try {
      await admin.auth().deleteUser(authUid);
      console.log('✅ Auth user deleted');
    } catch (authErr) {
      console.log('ℹ️ Auth user not found or already deleted:', authErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Worker deleted successfully',
    });

  } catch (error) {
    console.error('❌ Error deleting worker:', error);
    return res.status(500).json({
      error: error.message || 'Failed to delete worker',
    });
  }
});

// ============================================
// ENGINE CONFIG UPDATE FUNCTIONS
// ============================================

/**
 * UPDATE PAYIN ENGINE CONFIG
 * POST /updateEngineConfig { weights, enableRandomness, randomExponent }
 */
exports.updateEngineConfig = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).send('');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { weights, enableRandomness, randomExponent } = req.body;
    const updateData = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };

    if (weights && typeof weights === 'object') {
      updateData.weights = weights;
    }
    if (enableRandomness !== undefined) {
      updateData.enableRandomness = Boolean(enableRandomness);
    }
    if (randomExponent !== undefined) {
      updateData.scoreExponent = Number(randomExponent);
    }

    await db.collection('system').doc('engineConfig').set(updateData, { merge: true });
    console.log('✅ Payin engine config updated');

    return res.status(200).json({ success: true, message: 'Payin engine config updated' });
  } catch (error) {
    console.error('❌ Error updating engine config:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * UPDATE PAYOUT ENGINE CONFIG
 * POST /updatePayoutEngineConfig { weights, minScoreThreshold, maxActivePayouts, enableRandomness }
 */
exports.updatePayoutEngineConfig = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).send('');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { weights, minScoreThreshold, maxActivePayouts, enableRandomness } = req.body;
    const updateData = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };

    if (weights && typeof weights === 'object') {
      updateData.weights = weights;
    }
    if (minScoreThreshold !== undefined) {
      updateData.minScoreThreshold = Number(minScoreThreshold);
    }
    if (maxActivePayouts !== undefined) {
      updateData.maxActivePayouts = Number(maxActivePayouts);
    }
    if (enableRandomness !== undefined) {
      updateData.enableRandomness = Boolean(enableRandomness);
    }

    await db.collection('system').doc('payoutEngineConfig').set(updateData, { merge: true });
    console.log('✅ Payout engine config updated');

    return res.status(200).json({ success: true, message: 'Payout engine config updated' });
  } catch (error) {
    console.error('❌ Error updating payout engine config:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * UPDATE DISPUTE ENGINE CONFIG
 * POST /updateDisputeEngineConfig { slaHours, autoEscalateAfterHours, maxDisputeAmount }
 */
exports.updateDisputeEngineConfig = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).send('');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { slaHours, autoEscalateAfterHours, maxDisputeAmount } = req.body;
    const updateData = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };

    if (slaHours !== undefined) {
      updateData.slaHours = Number(slaHours);
    }
    if (autoEscalateAfterHours !== undefined) {
      updateData.autoEscalateAfterHours = Number(autoEscalateAfterHours);
    }
    if (maxDisputeAmount !== undefined) {
      updateData.maxDisputeAmount = Number(maxDisputeAmount);
    }

    await db.collection('system').doc('disputeEngineConfig').set(updateData, { merge: true });
    console.log('✅ Dispute engine config updated');

    return res.status(200).json({ success: true, message: 'Dispute engine config updated' });
  } catch (error) {
    console.error('❌ Error updating dispute engine config:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

















