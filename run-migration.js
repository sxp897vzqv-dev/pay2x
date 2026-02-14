const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  'https://jrzyndtowwwcydgcagcr.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyenluZHRvd3d3Y3lkZ2NhZ2NyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDI5ODU0OSwiZXhwIjoyMDg1ODc0NTQ5fQ.2qF6QqtZ_KK_VCuixbIzGq5so1_e3c17gmx83NfpEPo'
);

const sql = fs.readFileSync('./supabase/migrations/027_auto_assign_trigger.sql', 'utf8');

// Split by semicolon and run each statement
const statements = sql.split(/;\s*$/m).filter(s => s.trim() && !s.trim().startsWith('--'));

async function run() {
  for (const stmt of statements) {
    if (!stmt.trim()) continue;
    console.log('Running:', stmt.substring(0, 60) + '...');
    const { error } = await supabase.rpc('exec_sql', { sql_query: stmt });
    if (error) {
      console.error('Error:', error.message);
    } else {
      console.log('✓ Success');
    }
  }
}

run().catch(console.error);
