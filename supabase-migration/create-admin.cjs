const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jrzyndtowwwcydgcagcr.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyenluZHRvd3d3Y3lkZ2NhZ2NyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDI5ODU0OSwiZXhwIjoyMDg1ODc0NTQ5fQ.2qF6QqtZ_KK_VCuixbIzGq5so1_e3c17gmx83NfpEPo';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function createAdmin() {
  console.log('Creating admin user...');

  // 1. Create user in Supabase Auth with admin role in app_metadata
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: 'admin@pay2x.io',
    password: 'D@d9994725708',
    email_confirm: true,  // Skip email verification
    app_metadata: { role: 'admin' },
    user_metadata: { display_name: 'Admin' },
  });

  if (authError) {
    console.error('❌ Auth error:', authError.message);
    return;
  }

  const userId = authData.user.id;
  console.log(`✅ Auth user created: ${userId}`);

  // 2. Insert profile row
  const { error: profileError } = await supabase.from('profiles').insert({
    id: userId,
    role: 'admin',
    display_name: 'Admin',
    email: 'admin@pay2x.io',
    is_active: true,
  });

  if (profileError) {
    console.error('❌ Profile error:', profileError.message);
    return;
  }

  console.log('✅ Profile created with role=admin');
  console.log('\n🎉 Done! Login with:');
  console.log('   Email: admin@pay2x.io');
  console.log('   Password: D@d9994725708');
}

createAdmin().catch(console.error);
