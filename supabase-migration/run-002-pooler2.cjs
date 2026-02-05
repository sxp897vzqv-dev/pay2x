const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Try both session mode (5432) and transaction mode (6543) with pooler
async function tryConnect(port) {
  const client = new Client({
    host: 'aws-0-ap-south-1.pooler.supabase.com',
    port: port,
    database: 'postgres',
    user: 'postgres.jrzyndtowwwcydgcagcr',
    password: 'D@d9994725708',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  try {
    console.log(`Trying pooler port ${port}...`);
    await client.connect();
    console.log(`✅ Connected on port ${port}!`);
    
    const { rows } = await client.query('SELECT current_database(), current_user');
    console.log('DB info:', rows[0]);
    
    return client;
  } catch (err) {
    console.error(`❌ Port ${port} failed:`, err.message);
    try { await client.end(); } catch {}
    return null;
  }
}

async function run() {
  // Try session mode first (supports DDL), then transaction mode
  let client = await tryConnect(5432);
  if (!client) client = await tryConnect(6543);
  
  if (!client) {
    console.error('\nAll connection methods failed.');
    
    // Try direct connection with IPv6 explicitly
    console.log('\nTrying direct IPv6...');
    const directClient = new Client({
      host: '2406:da18:243:740e:64a8:9fe6:1b24:4011',
      port: 5432,
      database: 'postgres',
      user: 'postgres',
      password: 'D@d9994725708',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
    });
    try {
      await directClient.connect();
      console.log('✅ Connected via direct IPv6!');
      client = directClient;
    } catch (e) {
      console.error('❌ Direct IPv6 failed:', e.message);
      process.exit(1);
    }
  }
  
  // Read and execute SQL
  const sql = fs.readFileSync(path.join(__dirname, '002_storage_and_columns.sql'), 'utf8');
  
  // Split into individual statements
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));
  
  console.log(`\nExecuting ${statements.length} statements...`);
  
  let success = 0, failed = 0;
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    // Skip pure comment blocks
    const cleanStmt = stmt.replace(/--.*$/gm, '').trim();
    if (!cleanStmt) continue;
    
    try {
      await client.query(stmt + ';');
      success++;
      process.stdout.write('.');
    } catch (err) {
      failed++;
      // Only show non-duplicate errors
      if (!err.message.includes('already exists')) {
        console.error(`\n  Statement ${i+1} failed: ${err.message}`);
        console.error(`  SQL: ${cleanStmt.substring(0, 80)}...`);
      } else {
        process.stdout.write('s'); // skip existing
      }
    }
  }
  
  console.log(`\n\n✅ Done: ${success} succeeded, ${failed} failed`);
  await client.end();
}

run().catch(e => { console.error(e); process.exit(1); });
