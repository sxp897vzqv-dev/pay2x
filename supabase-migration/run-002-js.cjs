const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://jrzyndtowwwcydgcagcr.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyenluZHRvd3d3Y3lkZ2NhZ2NyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDI5ODU0OSwiZXhwIjoyMDg1ODc0NTQ5fQ.2qF6QqtZ_KK_VCuixbIzGq5so1_e3c17gmx83NfpEPo',
  { db: { schema: 'public' } }
);

async function run() {
  // Step 1: Create the exec_sql function using raw fetch
  console.log('Step 1: Creating exec_sql helper function...');
  const createFnSql = `
    CREATE OR REPLACE FUNCTION exec_sql(query text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
    BEGIN EXECUTE query; END;
    $$;
  `;
  
  const res = await fetch('https://jrzyndtowwwcydgcagcr.supabase.co/rest/v1/rpc/exec_sql', {
    method: 'POST',
    headers: {
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyenluZHRvd3d3Y3lkZ2NhZ2NyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDI5ODU0OSwiZXhwIjoyMDg1ODc0NTQ5fQ.2qF6QqtZ_KK_VCuixbIzGq5so1_e3c17gmx83NfpEPo',
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyenluZHRvd3d3Y3lkZ2NhZ2NyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDI5ODU0OSwiZXhwIjoyMDg1ODc0NTQ5fQ.2qF6QqtZ_KK_VCuixbIzGq5so1_e3c17gmx83NfpEPo',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: createFnSql }),
  });

  if (res.status === 404) {
    // Function doesn't exist yet, need to create it differently
    // Use the pg-meta API endpoint
    console.log('  exec_sql not found, creating via pg-meta...');
    
    // Actually, use the supabase management API
    // POST /pg/query with authorization
    const queryRes = await fetch('https://jrzyndtowwwcydgcagcr.supabase.co/pg/query', {
      method: 'POST',
      headers: {
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyenluZHRvd3d3Y3lkZ2NhZ2NyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDI5ODU0OSwiZXhwIjoyMDg1ODc0NTQ5fQ.2qF6QqtZ_KK_VCuixbIzGq5so1_e3c17gmx83NfpEPo',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyenluZHRvd3d3Y3lkZ2NhZ2NyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDI5ODU0OSwiZXhwIjoyMDg1ODc0NTQ5fQ.2qF6QqtZ_KK_VCuixbIzGq5so1_e3c17gmx83NfpEPo',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: createFnSql }),
    });
    console.log('  pg/query status:', queryRes.status);
    const txt = await queryRes.text();
    console.log('  response:', txt.slice(0, 200));
  }

  // Step 2: Now run each SQL statement via exec_sql RPC
  const sql = fs.readFileSync(__dirname + '/002_storage_and_columns.sql', 'utf8');
  const statements = sql.split(';')
    .map(s => s.trim())
    .filter(s => s.length > 10 && !s.startsWith('--'))
    .filter(s => !s.includes('storage.buckets') && !s.includes('storage.objects'));

  console.log(`\nStep 2: Running ${statements.length} SQL statements...`);
  let success = 0, errors = 0;

  for (const stmt of statements) {
    const { error } = await supabase.rpc('exec_sql', { query: stmt });
    if (error) {
      if (error.message.includes('already exists') || error.message.includes('duplicate')) {
        success++;
        process.stdout.write('s');
      } else {
        errors++;
        console.error(`\n❌ ${error.message}\n   ${stmt.slice(0, 80)}`);
      }
    } else {
      success++;
      process.stdout.write('.');
    }
  }

  console.log(`\n\n✅ Done: ${success} succeeded, ${errors} errors`);
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
