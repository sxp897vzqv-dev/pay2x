const fs = require('fs');
const { Client } = require('pg');

const connStr = 'postgresql://postgres:D%40d9994725708@db.jrzyndtowwwcydgcagcr.supabase.co:5432/postgres';

async function run() {
  const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected to Supabase');

  const sql = fs.readFileSync(__dirname + '/002_storage_and_columns.sql', 'utf8');

  // Split by semicolons and run each statement
  const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith('--'));

  let success = 0, errors = 0;
  for (const stmt of statements) {
    try {
      await client.query(stmt);
      success++;
    } catch (e) {
      // Ignore "already exists" errors
      if (e.message.includes('already exists') || e.message.includes('duplicate key')) {
        console.log(`⏭️  Skipped (exists): ${stmt.slice(0, 60)}...`);
        success++;
      } else {
        console.error(`❌ Error: ${e.message}`);
        console.error(`   Statement: ${stmt.slice(0, 80)}...`);
        errors++;
      }
    }
  }

  console.log(`\n✅ Done: ${success} succeeded, ${errors} errors`);
  await client.end();
}

run().catch(e => { console.error(e); process.exit(1); });
