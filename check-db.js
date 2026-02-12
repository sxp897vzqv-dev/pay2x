// Quick DB check
const SUPABASE_URL = 'https://jrzyndtowwwcydgcagcr.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyenluZHRvd3d3Y3lkZ2NhZ2NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyOTg1NDksImV4cCI6MjA4NTg3NDU0OX0.7RgnBk7Xr2p2lmd_l4lQxBV7wZaGY3o50ti27Ra38QY';

async function check() {
  // Check merchants with specific API key
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/merchants?live_api_key=eq.live_1770660122657_mevpz&select=id,name,live_api_key,is_active`,
    {
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`
      }
    }
  );
  console.log('Merchant by API key:', await res.json());

  // Check all merchants
  const res2 = await fetch(
    `${SUPABASE_URL}/rest/v1/merchants?select=id,name,live_api_key,is_active&limit=5`,
    {
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`
      }
    }
  );
  console.log('All merchants:', await res2.json());

  // Check traders
  const res3 = await fetch(
    `${SUPABASE_URL}/rest/v1/traders?select=id,name,balance,is_active&limit=5`,
    {
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`
      }
    }
  );
  console.log('Traders:', await res3.json());
}

check();
