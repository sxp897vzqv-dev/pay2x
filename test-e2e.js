// End-to-End Test Script for Pay2X
// Run with: node test-e2e.js

const BASE_URL = 'https://jrzyndtowwwcydgcagcr.supabase.co/functions/v1';

async function runTests() {
  console.log('🧪 PAY2X END-TO-END TEST');
  console.log('========================\n');

  // Test 1: API Health
  console.log('1️⃣ Testing API Health...');
  try {
    const healthRes = await fetch(`${BASE_URL}/api-health`);
    const health = await healthRes.json();
    console.log('   ✅ API Health:', health.status);
  } catch (e) {
    console.log('   ❌ API Health Failed:', e.message);
  }

  // Test 2: Create Payin (will fail without valid API key, but tests endpoint)
  console.log('\n2️⃣ Testing Create Payin...');
  try {
    const payinRes = await fetch(`${BASE_URL}/create-payin`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-API-Key': 'test_invalid_key'
      },
      body: JSON.stringify({ amount: 1000, userId: 'test123' })
    });
    const payin = await payinRes.json();
    if (payin.error === 'Invalid API key') {
      console.log('   ✅ Payin endpoint working (auth check passed)');
    } else {
      console.log('   📋 Payin response:', JSON.stringify(payin).slice(0, 100));
    }
  } catch (e) {
    console.log('   ❌ Payin Failed:', e.message);
  }

  // Test 3: Create Payout
  console.log('\n3️⃣ Testing Create Payout...');
  try {
    const payoutRes = await fetch(`${BASE_URL}/create-payout`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-API-Key': 'test_invalid_key'
      },
      body: JSON.stringify({ 
        amount: 1000, 
        accountNumber: '1234567890',
        ifscCode: 'HDFC0001234',
        accountName: 'Test User'
      })
    });
    const payout = await payoutRes.json();
    if (payout.error?.includes('Invalid') || payout.error?.includes('API key')) {
      console.log('   ✅ Payout endpoint working (auth check passed)');
    } else {
      console.log('   📋 Payout response:', JSON.stringify(payout).slice(0, 100));
    }
  } catch (e) {
    console.log('   ❌ Payout Failed:', e.message);
  }

  // Test 4: Create Dispute
  console.log('\n4️⃣ Testing Create Dispute...');
  try {
    const disputeRes = await fetch(`${BASE_URL}/create-dispute`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-API-Key': 'test_invalid_key'
      },
      body: JSON.stringify({ 
        type: 'payment_not_received',
        payinId: 'test123',
        description: 'Test dispute'
      })
    });
    const dispute = await disputeRes.json();
    if (dispute.error?.includes('Invalid') || dispute.error?.includes('API key')) {
      console.log('   ✅ Dispute endpoint working (auth check passed)');
    } else {
      console.log('   📋 Dispute response:', JSON.stringify(dispute).slice(0, 100));
    }
  } catch (e) {
    console.log('   ❌ Dispute Failed:', e.message);
  }

  // Test 5: USDT Functions
  console.log('\n5️⃣ Testing USDT System...');
  try {
    const usdtRes = await fetch(`${BASE_URL}/get-trader-crypto-stats?traderId=test`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    const usdt = await usdtRes.json();
    if (usdt.error === 'Trader not found') {
      console.log('   ✅ USDT Stats endpoint working (validation passed)');
    } else {
      console.log('   📋 USDT response:', JSON.stringify(usdt).slice(0, 100));
    }
  } catch (e) {
    console.log('   ❌ USDT Failed:', e.message);
  }

  // Test 6: Wallet Balance
  console.log('\n6️⃣ Testing Wallet Balance...');
  try {
    const walletRes = await fetch(`${BASE_URL}/get-wallet-balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: 'TM9yjURQcbFRNi7GycAXsWqzo3KEgxoXdZ' })
    });
    const wallet = await walletRes.json();
    console.log('   ✅ Wallet Balance:', wallet.success ? `${wallet.balance} USDT, ${wallet.trx} TRX` : wallet.error);
  } catch (e) {
    console.log('   ❌ Wallet Failed:', e.message);
  }

  console.log('\n========================');
  console.log('🏁 TESTS COMPLETE');
}

runTests();
