const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://jrzyndtowwwcydgcagcr.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyenluZHRvd3d3Y3lkZ2NhZ2NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyOTg1NDksImV4cCI6MjA4NTg3NDU0OX0.7RgnBk7Xr2p2lmd_l4lQxBV7wZaGY3o50ti27Ra38QY'
);

async function test() {
  console.log('1. Signing in...');
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'admin@pay2x.io',
    password: 'D@d9994725708',
  });
  
  if (authErr) { console.error('❌ Auth failed:', authErr.message); return; }
  console.log('✅ Signed in, user ID:', auth.user.id);
  console.log('   app_metadata:', JSON.stringify(auth.user.app_metadata));
  
  // Check JWT claims
  const jwt = auth.session.access_token;
  const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString());
  console.log('   JWT role:', payload.app_metadata?.role);
  console.log('   JWT aud:', payload.aud);

  console.log('\n2. Querying profiles...');
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', auth.user.id)
    .single();
  
  if (profileErr) {
    console.error('❌ Profile query failed:', profileErr.message, profileErr.code);
  } else {
    console.log('✅ Profile found:', JSON.stringify(profile));
  }

  console.log('\n3. Testing audit log insert...');
  const { error: logErr } = await supabase.from('admin_logs').insert({
    action: 'test_login',
    category: 'security',
    entity_type: 'user',
    entity_id: auth.user.id,
    entity_name: 'admin@pay2x.io',
    severity: 'info',
    source: 'admin_panel',
    performed_by: auth.user.id,
    performed_by_name: 'admin@pay2x.io',
    performed_by_role: 'admin',
    details: { note: 'Test login' },
  });

  if (logErr) {
    console.error('❌ Audit log failed:', logErr.message, logErr.code);
  } else {
    console.log('✅ Audit log inserted');
  }

  await supabase.auth.signOut();
  console.log('\nDone!');
}

test().catch(console.error);
