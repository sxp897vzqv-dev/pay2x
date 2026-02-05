const { createClient } = require('@supabase/supabase-js');
const s = createClient(
  'https://jrzyndtowwwcydgcagcr.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyenluZHRvd3d3Y3lkZ2NhZ2NyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDI5ODU0OSwiZXhwIjoyMDg1ODc0NTQ5fQ.2qF6QqtZ_KK_VCuixbIzGq5so1_e3c17gmx83NfpEPo'
);

async function checkCols(table, cols) {
  const { data, error } = await s.from(table).select(cols).limit(1);
  if (error) {
    console.log(`${table}: MISSING - ${error.message}`);
  } else {
    console.log(`${table}: OK (cols exist)`);
  }
}

(async () => {
  // Check trader extra columns
  await checkCols('traders', 'current_merchant_upis,corporate_merchant_upis,normal_upis,big_upis,imps_accounts,security_hold,payout_commission,commission_rate,overall_commission,priority');
  
  // Check merchant extra columns
  await checkCols('merchants', 'business_name,live_api_key,test_api_key,api_key,secret_key,webhook_url,webhook_secret,webhook_events,available_balance,pending_settlement,is_active,payin_commission_rate,payout_commission_rate');
  
  // Check payin extra columns
  await checkCols('payins', 'requested_at,completed_at,rejected_at,transaction_id,upi_id,utr,screenshot_url,commission,order_id');
  
  // Check payout extra columns
  await checkCols('payouts', 'assigned_at,completed_at,payout_request_id,utr,proof_url,commission,beneficiary_name,payment_mode,upi_id,account_number,ifsc_code');
  
  // Check dispute extra columns
  await checkCols('disputes', 'trader_note,trader_action,proof_url,evidence_url,responded_at,dispute_id,transaction_id,order_id,upi_id,message_count');
  
  // Check admin_logs extra columns
  await checkCols('admin_logs', 'reviewed_at,review_status,review_note,reviewed_by');
  
  // Check saved_banks columns
  await checkCols('saved_banks', 'id,trader_id,type,upi_id,account_number,ifsc_code,holder_name,is_active,is_deleted');
  
  // Check dispute_messages columns
  await checkCols('dispute_messages', 'id,dispute_id,text,is_decision,action,proof_url');
  
  // Check payout_requests columns
  await checkCols('payout_requests', 'id,trader_id,amount,status');
})();
