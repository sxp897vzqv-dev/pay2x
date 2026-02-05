const fs = require('fs');

const SUPABASE_URL = 'https://jrzyndtowwwcydgcagcr.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyenluZHRvd3d3Y3lkZ2NhZ2NyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDI5ODU0OSwiZXhwIjoyMDg1ODc0NTQ5fQ.2qF6QqtZ_KK_VCuixbIzGq5so1_e3c17gmx83NfpEPo';

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const sql = fs.readFileSync(__dirname + '/002_storage_and_columns.sql', 'utf8');
const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 10 && !s.startsWith('--'));

async function run() {
  // First create a helper function in the DB
  // skip rpc test
  
  // Try creating the function via direct SQL
  // Actually, let's use supabase-js to do what we can directly
  
  // 1. Storage buckets via API
  console.log('Creating storage buckets...');
  for (const bucket of ['payout-proofs', 'dispute-proofs']) {
    const { error } = await supabase.storage.createBucket(bucket, { public: true });
    if (error && !error.message.includes('already exists')) {
      console.error(`  ❌ ${bucket}: ${error.message}`);
    } else {
      console.log(`  ✅ ${bucket}`);
    }
  }

  // 2. For DB changes, try the pg approach with IPv4 forced
  const { Client } = require('pg');
  const client = new Client({
    host: 'db.jrzyndtowwwcydgcagcr.supabase.co',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: 'D@d9994725708',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 60000,
  });

  console.log('\nConnecting to DB...');
  await client.connect();
  console.log('Connected!');

  // Filter out storage-related statements (handled above)
  const dbStatements = statements.filter(s => !s.includes('storage.buckets') && !s.includes('storage.objects'));

  let success = 0, errors = 0;
  for (const stmt of dbStatements) {
    try {
      await client.query(stmt);
      success++;
      process.stdout.write('.');
    } catch (e) {
      if (e.message.includes('already exists') || e.message.includes('duplicate key')) {
        success++;
        process.stdout.write('⏭');
      } else {
        errors++;
        console.error(`\n❌ ${e.message}\n   ${stmt.slice(0, 100)}`);
      }
    }
  }

  console.log(`\n\n✅ Done: ${success} succeeded, ${errors} errors`);
  
  // Verify new tables
  const { rows } = await client.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' ORDER BY table_name
  `);
  console.log(`\nTables (${rows.length}):`);
  rows.forEach(r => console.log('  ✓', r.table_name));
  
  await client.end();
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
