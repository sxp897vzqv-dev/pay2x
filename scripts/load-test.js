/**
 * Pay2X Load Testing Script
 * 
 * Tests the payin API under load:
 * - Creates test merchant + trader + UPI (if needed)
 * - Fires concurrent requests
 * - Measures response times and success rates
 * 
 * Usage: node scripts/load-test.js [concurrent] [total]
 * Example: node scripts/load-test.js 10 100  (10 concurrent, 100 total)
 */

const SUPABASE_URL = 'https://jrzyndtowwwcydgcagcr.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyenluZHRvd3d3Y3lkZ2NhZ2NyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDI5ODU0OSwiZXhwIjoyMDg1ODc0NTQ5fQ.2qF6QqtZ_KK_VCuixbIzGq5so1_e3c17gmx83NfpEPo';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyenluZHRvd3d3Y3lkZ2NhZ2NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyOTg1NDksImV4cCI6MjA4NTg3NDU0OX0.7RgnBk7Xr2p2lmd_l4lQxBV7wZaGY3o50ti27Ra38QY';

// Test config
const CONCURRENT = parseInt(process.argv[2]) || 10;
const TOTAL_REQUESTS = parseInt(process.argv[3]) || 100;

// Results tracking
const results = {
  success: 0,
  failed: 0,
  errors: {},
  responseTimes: [],
  startTime: null,
  endTime: null,
};

async function supabaseQuery(table, query = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  return res.json();
}

async function supabaseInsert(table, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(data),
  });
  return res.json();
}

async function setupTestData() {
  console.log('🔧 Setting up test data...\n');
  
  // Check for existing test merchant
  let merchants = await supabaseQuery('merchants', '?business_name=eq.LoadTest%20Merchant&limit=1');
  let apiKey;
  let merchantId;
  
  if (merchants.length > 0) {
    apiKey = merchants[0].live_api_key;
    merchantId = merchants[0].id;
    console.log(`   ✓ Using existing merchant: ${merchantId}`);
  } else {
    // Create test merchant
    merchantId = crypto.randomUUID();
    apiKey = `live_loadtest_${Date.now()}`;
    
    await supabaseInsert('merchants', {
      id: merchantId,
      name: 'LoadTest Merchant',
      business_name: 'LoadTest Merchant',
      email: `loadtest_${Date.now()}@test.com`,
      live_api_key: apiKey,
      is_active: true,
      payin_commission_rate: 6,
      payout_commission_rate: 2,
    });
    console.log(`   ✓ Created merchant: ${merchantId}`);
  }
  
  // Check for existing test trader
  let traders = await supabaseQuery('traders', '?name=eq.LoadTest%20Trader&limit=1');
  let traderId;
  
  if (traders.length > 0) {
    traderId = traders[0].id;
    console.log(`   ✓ Using existing trader: ${traderId}`);
  } else {
    // Create test trader
    traderId = crypto.randomUUID();
    
    await supabaseInsert('traders', {
      id: traderId,
      name: 'LoadTest Trader',
      email: `loadtest_trader_${Date.now()}@test.com`,
      is_active: true,
      balance: 1000000,
      payin_commission: 4,
      payout_commission: 1,
    });
    console.log(`   ✓ Created trader: ${traderId}`);
  }
  
  // Check for existing UPIs
  let upis = await supabaseQuery('upi_pool', `?trader_id=eq.${traderId}&status=eq.active&limit=1`);
  
  if (upis.length > 0) {
    console.log(`   ✓ Using existing UPI: ${upis[0].upi_id}`);
  } else {
    // Create test UPIs (3 for load distribution)
    for (let i = 1; i <= 3; i++) {
      await supabaseInsert('upi_pool', {
        trader_id: traderId,
        upi_id: `loadtest${i}@ybl`,
        account_name: `LoadTest Account ${i}`,
        bank_name: 'Yes Bank',
        daily_limit: 500000,
        status: 'active',
        success_rate: 95,
        tier: i === 1 ? 'high' : i === 2 ? 'medium' : 'low',
      });
    }
    console.log(`   ✓ Created 3 test UPIs`);
  }
  
  console.log(`\n   API Key: ${apiKey}\n`);
  return apiKey;
}

async function createPayin(apiKey, index) {
  const startTime = Date.now();
  
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-payin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        amount: 100 + Math.floor(Math.random() * 9900), // 100-10000
        userId: `user_${index}`,
        orderId: `LOAD-${Date.now()}-${index}`,
        customerName: 'Load Test User',
        customerEmail: 'loadtest@example.com',
        customerPhone: '9876543210',
      }),
    });
    
    const elapsed = Date.now() - startTime;
    const data = await res.json();
    
    if (data.success) {
      results.success++;
      results.responseTimes.push(elapsed);
      return { success: true, elapsed, payinId: data.payment_id };
    } else {
      results.failed++;
      const errCode = data.error?.code || 'UNKNOWN';
      results.errors[errCode] = (results.errors[errCode] || 0) + 1;
      return { success: false, elapsed, error: errCode };
    }
  } catch (err) {
    const elapsed = Date.now() - startTime;
    results.failed++;
    results.errors['NETWORK'] = (results.errors['NETWORK'] || 0) + 1;
    return { success: false, elapsed, error: err.message };
  }
}

async function runBatch(apiKey, batchSize, startIndex) {
  const promises = [];
  for (let i = 0; i < batchSize; i++) {
    promises.push(createPayin(apiKey, startIndex + i));
  }
  return Promise.all(promises);
}

function calculateStats() {
  const times = results.responseTimes.sort((a, b) => a - b);
  const sum = times.reduce((a, b) => a + b, 0);
  
  return {
    count: times.length,
    min: times[0] || 0,
    max: times[times.length - 1] || 0,
    avg: times.length ? Math.round(sum / times.length) : 0,
    p50: times[Math.floor(times.length * 0.5)] || 0,
    p95: times[Math.floor(times.length * 0.95)] || 0,
    p99: times[Math.floor(times.length * 0.99)] || 0,
  };
}

async function runLoadTest() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('   PAY2X LOAD TEST');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`   Concurrent requests: ${CONCURRENT}`);
  console.log(`   Total requests: ${TOTAL_REQUESTS}\n`);
  
  // Setup
  const apiKey = await setupTestData();
  
  // Warmup
  console.log('🔥 Warming up (5 requests)...');
  await runBatch(apiKey, 5, 0);
  results.success = 0;
  results.failed = 0;
  results.errors = {};
  results.responseTimes = [];
  
  // Run load test
  console.log('\n🚀 Running load test...\n');
  results.startTime = Date.now();
  
  let completed = 0;
  const batches = Math.ceil(TOTAL_REQUESTS / CONCURRENT);
  
  for (let batch = 0; batch < batches; batch++) {
    const batchSize = Math.min(CONCURRENT, TOTAL_REQUESTS - completed);
    const batchResults = await runBatch(apiKey, batchSize, completed);
    
    completed += batchSize;
    const progress = Math.round((completed / TOTAL_REQUESTS) * 100);
    const successRate = results.success > 0 ? Math.round((results.success / completed) * 100) : 0;
    
    process.stdout.write(`\r   Progress: ${completed}/${TOTAL_REQUESTS} (${progress}%) | Success: ${successRate}%`);
  }
  
  results.endTime = Date.now();
  const totalTime = (results.endTime - results.startTime) / 1000;
  
  // Results
  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('   RESULTS');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const stats = calculateStats();
  const rps = Math.round(TOTAL_REQUESTS / totalTime);
  const successRate = Math.round((results.success / TOTAL_REQUESTS) * 100);
  
  console.log(`   ✅ Success: ${results.success}/${TOTAL_REQUESTS} (${successRate}%)`);
  console.log(`   ❌ Failed:  ${results.failed}`);
  console.log(`   ⏱️  Total time: ${totalTime.toFixed(2)}s`);
  console.log(`   🚀 Throughput: ${rps} req/s\n`);
  
  console.log('   Response Times:');
  console.log(`   ├─ Min:  ${stats.min}ms`);
  console.log(`   ├─ Avg:  ${stats.avg}ms`);
  console.log(`   ├─ p50:  ${stats.p50}ms`);
  console.log(`   ├─ p95:  ${stats.p95}ms`);
  console.log(`   ├─ p99:  ${stats.p99}ms`);
  console.log(`   └─ Max:  ${stats.max}ms\n`);
  
  if (Object.keys(results.errors).length > 0) {
    console.log('   Errors:');
    for (const [code, count] of Object.entries(results.errors)) {
      console.log(`   └─ ${code}: ${count}`);
    }
    console.log('');
  }
  
  // Grade
  let grade = 'A+';
  if (successRate < 99) grade = 'A';
  if (successRate < 95) grade = 'B';
  if (successRate < 90) grade = 'C';
  if (successRate < 80) grade = 'D';
  if (successRate < 70) grade = 'F';
  
  if (stats.p95 > 2000) grade = grade === 'A+' ? 'A' : grade;
  if (stats.p95 > 5000) grade = 'B';
  
  console.log(`   📊 GRADE: ${grade}`);
  console.log('═══════════════════════════════════════════════════════════\n');
}

runLoadTest().catch(console.error);
