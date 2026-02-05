const fs = require('fs');

const SUPABASE_URL = 'https://jrzyndtowwwcydgcagcr.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyenluZHRvd3d3Y3lkZ2NhZ2NyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDI5ODU0OSwiZXhwIjoyMDg1ODc0NTQ5fQ.2qF6QqtZ_KK_VCuixbIzGq5so1_e3c17gmx83NfpEPo';

const sql = fs.readFileSync(__dirname + '/002_storage_and_columns.sql', 'utf8');

// Split into individual statements
const statements = sql.split(';')
  .map(s => s.trim())
  .filter(s => s.length > 10 && !s.startsWith('--'));

async function runStatement(stmt) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ query: stmt }),
  });
  return res;
}

// Use pg directly with longer timeout
const { Client } = require('pg');

async function run() {
  const client = new Client({
    host: 'db.jrzyndtowwwcydgcagcr.supabase.co',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: 'D@d9994725708',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
  });
  
  console.log('Connecting...');
  await client.connect();
  console.log('Connected to Supabase');

  let success = 0, errors = 0;
  for (const stmt of statements) {
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
        console.error(`\n❌ ${e.message}\n   ${stmt.slice(0, 80)}`);
      }
    }
  }

  console.log(`\n\n✅ Done: ${success} succeeded, ${errors} errors`);
  await client.end();
}

run().catch(e => { console.error(e); process.exit(1); });
