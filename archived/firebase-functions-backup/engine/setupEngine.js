/**
 * Setup script to initialize Payin Engine config in Firestore
 * Run once: node engine/setupEngine.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json'); // You'll need this file

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const ENGINE_CONFIG = {
  // Scoring weights (sum to ~100)
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

  // Selection settings
  minScoreThreshold: 30,
  maxCandidates: 5,
  maxFallbackAttempts: 3,

  // UPI limits
  cooldownMinutes: 2,
  maxDailyTxnsPerUpi: 50,
  failureThreshold: 3,
  
  // Amount tiers
  amountTiers: {
    low: { min: 500, max: 2000 },
    medium: { min: 2001, max: 10000 },
    high: { min: 10001, max: 50000 },
  },

  // Features
  enableRandomness: true,
  enableFallback: true,
  enableLogging: true,
  
  // Randomness
  randomnessFactor: 0.1,
  scoreExponent: 2,
  
  // Metadata
  version: '2.0',
  updatedAt: new Date(),
  updatedBy: 'setup-script',
};

const BANK_HEALTH = {
  sbi: {
    status: 'healthy',
    successRate24h: 95,
    maintenanceWindows: [
      { day: 'sunday', start: '00:00', end: '06:00' }
    ],
  },
  hdfc: {
    status: 'healthy',
    successRate24h: 96,
    maintenanceWindows: [],
  },
  axis: {
    status: 'healthy',
    successRate24h: 94,
    maintenanceWindows: [],
  },
  icici: {
    status: 'healthy',
    successRate24h: 95,
    maintenanceWindows: [],
  },
  paytm: {
    status: 'healthy',
    successRate24h: 92,
    maintenanceWindows: [],
  },
};

async function setup() {
  console.log('🚀 Setting up Payin Engine v2.0...\n');
  
  try {
    // 1. Create engine config
    console.log('📝 Creating engine config...');
    await db.collection('system').doc('engineConfig').set(ENGINE_CONFIG);
    console.log('✅ Engine config created\n');
    
    // 2. Create bank health documents
    console.log('🏦 Creating bank health data...');
    for (const [bank, health] of Object.entries(BANK_HEALTH)) {
      await db.collection('bankHealth').doc(bank).set({
        ...health,
        updatedAt: new Date(),
      });
      console.log(`   ✅ ${bank}`);
    }
    console.log('');
    
    // 3. Create empty upiPool collection (placeholder)
    console.log('📦 Creating upiPool collection...');
    await db.collection('upiPool').doc('_placeholder').set({
      _note: 'This is a placeholder. UPIs will be extracted from traders until migrated here.',
      createdAt: new Date(),
    });
    console.log('✅ upiPool collection created\n');
    
    console.log('=' .repeat(50));
    console.log('✅ SETUP COMPLETE!');
    console.log('=' .repeat(50));
    console.log('\nThe Payin Engine v2.0 is ready.');
    console.log('Deploy functions with: firebase deploy --only functions');
    
  } catch (error) {
    console.error('❌ Setup failed:', error);
  }
  
  process.exit(0);
}

setup();
