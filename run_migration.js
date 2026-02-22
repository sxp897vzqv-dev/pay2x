const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  'https://jrzyndtowwwcydgcagcr.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyenluZHRvd3d3Y3lkZ2NhZ2NyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDI5ODU0OSwiZXhwIjoyMDg1ODc0NTQ5fQ.2qF6QqtZ_KK_VCuixbIzGq5so1_e3c17gmx83NfpEPo'
);

async function runMigration() {
  // Run each statement separately
  const statements = [
    // 061: RLS
    `ALTER TABLE merchants ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "Merchants can view own record" ON merchants`,
    `CREATE POLICY "Merchants can view own record" ON merchants FOR SELECT TO authenticated USING (profile_id = auth.uid())`,
    `DROP POLICY IF EXISTS "Merchants can update own record" ON merchants`,
    `CREATE POLICY "Merchants can update own record" ON merchants FOR UPDATE TO authenticated USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid())`,
    `DROP POLICY IF EXISTS "Admins full access to merchants" ON merchants`,
    `CREATE POLICY "Admins full access to merchants" ON merchants FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))`,
    
    `ALTER TABLE traders ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "Traders can view own record" ON traders`,
    `CREATE POLICY "Traders can view own record" ON traders FOR SELECT TO authenticated USING (profile_id = auth.uid())`,
    `DROP POLICY IF EXISTS "Traders can update own record" ON traders`,
    `CREATE POLICY "Traders can update own record" ON traders FOR UPDATE TO authenticated USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid())`,
    `DROP POLICY IF EXISTS "Admins full access to traders" ON traders`,
    `CREATE POLICY "Admins full access to traders" ON traders FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))`,
    
    `GRANT SELECT, UPDATE ON merchants TO authenticated`,
    `GRANT SELECT, UPDATE ON traders TO authenticated`,
    
    // 062: USDT columns
    `ALTER TABLE merchants ADD COLUMN IF NOT EXISTS usdt_balance DECIMAL(18,2) DEFAULT 0`,
    `ALTER TABLE payins ADD COLUMN IF NOT EXISTS net_amount_usdt DECIMAL(18,2)`,
    `ALTER TABLE payins ADD COLUMN IF NOT EXISTS usdt_rate_at_completion DECIMAL(10,2)`,
    `ALTER TABLE payouts ADD COLUMN IF NOT EXISTS amount_usdt DECIMAL(18,2)`,
    `ALTER TABLE payouts ADD COLUMN IF NOT EXISTS usdt_rate_at_creation DECIMAL(10,2)`,
    `ALTER TABLE balance_history ADD COLUMN IF NOT EXISTS amount_usdt DECIMAL(18,2)`,
    `ALTER TABLE balance_history ADD COLUMN IF NOT EXISTS usdt_rate DECIMAL(10,2)`,
    `CREATE INDEX IF NOT EXISTS idx_merchants_usdt_balance ON merchants(usdt_balance)`,
  ];

  console.log('Running 061+062 migrations...');
  
  for (const sql of statements) {
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
    if (error && !error.message.includes('already exists')) {
      console.log('Error:', sql.substring(0, 50), error.message);
    }
  }
  
  console.log('061+062 done, now running 063 (complete_payin function)...');
  
  // Read the function SQL
  const funcSql = fs.readFileSync('supabase/migrations/063_usdt_payin_tracking.sql', 'utf8');
  
  // Try to execute via REST
  const response = await fetch('https://jrzyndtowwwcydgcagcr.supabase.co/rest/v1/rpc/exec_sql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyenluZHRvd3d3Y3lkZ2NhZ2NyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDI5ODU0OSwiZXhwIjoyMDg1ODc0NTQ5fQ.2qF6QqtZ_KK_VCuixbIzGq5so1_e3c17gmx83NfpEPo',
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyenluZHRvd3d3Y3lkZ2NhZ2NyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDI5ODU0OSwiZXhwIjoyMDg1ODc0NTQ5fQ.2qF6QqtZ_KK_VCuixbIzGq5so1_e3c17gmx83NfpEPo'
    },
    body: JSON.stringify({ sql_query: funcSql })
  });
  
  console.log('Function response:', response.status, await response.text());
}

runMigration().catch(console.error);
