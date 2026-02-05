const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const client = new Client({
  host: 'db.jrzyndtowwwcydgcagcr.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'D@d9994725708',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    console.log('Connecting to Supabase PostgreSQL...');
    await client.connect();
    console.log('✅ Connected!\n');

    const sql = fs.readFileSync(path.join(__dirname, '001_schema.sql'), 'utf8');
    
    // Split by semicolons but be careful with function bodies
    // Run the whole thing as one statement
    console.log('Running schema migration...');
    await client.query(sql);
    console.log('✅ Schema migration complete!\n');

    // Verify tables
    const { rows } = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    console.log('Tables created:');
    rows.forEach(r => console.log('  ✓', r.table_name));
    console.log(`\nTotal: ${rows.length} tables`);

  } catch (err) {
    console.error('❌ Error:', err.message);
    if (err.position) {
      console.error('At position:', err.position);
    }
  } finally {
    await client.end();
  }
}

run();
