const fs = require('fs');
const { Client } = require('pg');

// Use Supabase session pooler with project ref in username
const client = new Client({
  host: 'aws-0-ap-south-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.jrzyndtowwwcydgcagcr',
  password: 'D@d9994725708',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000,
});

const sql = fs.readFileSync(__dirname + '/002_storage_and_columns.sql', 'utf8');
const statements = sql.split(';')
  .map(s => s.trim())
  .filter(s => s.length > 10 && !s.startsWith('--'))
  .filter(s => !s.includes('storage.buckets') && !s.includes('storage.objects'));

async function run() {
  console.log('Connecting via pooler...');
  await client.connect();
  console.log('Connected!');

  let success = 0, errors = 0;
  for (const stmt of statements) {
    try {
      await client.query(stmt);
      success++;
      process.stdout.write('.');
    } catch (e) {
      if (e.message.includes('already exists') || e.message.includes('duplicate key')) {
        success++;
        process.stdout.write('s');
      } else {
        errors++;
        console.error(`\n❌ ${e.message}\n   ${stmt.slice(0, 100)}`);
      }
    }
  }

  console.log(`\n\n✅ Done: ${success} succeeded, ${errors} errors`);

  const { rows } = await client.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
  );
  console.log(`\nTables (${rows.length}):`);
  rows.forEach(r => console.log('  ✓', r.table_name));

  await client.end();
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
