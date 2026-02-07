// Edge Function: generate-daily-summary
// Generates daily summary statistics
// Deploy: supabase functions deploy generate-daily-summary
// Schedule: Daily at 00:05 IST via cron

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get date parameter or use yesterday
    const url = new URL(req.url)
    let targetDate = url.searchParams.get('date')
    
    if (!targetDate) {
      // Default to yesterday (IST timezone)
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      targetDate = yesterday.toISOString().split('T')[0]
    }

    const startOfDay = `${targetDate}T00:00:00.000Z`
    const endOfDay = `${targetDate}T23:59:59.999Z`

    console.log(`Generating summary for ${targetDate}`)

    // Fetch payin stats
    const { data: payins } = await supabase
      .from('payins')
      .select('status, amount, commission')
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay)

    const totalPayinCount = payins?.length || 0
    const completedPayins = payins?.filter(p => p.status === 'completed') || []
    const totalPayinAmount = completedPayins.reduce((sum, p) => sum + Number(p.amount || 0), 0)
    const payinSuccessRate = totalPayinCount > 0 
      ? (completedPayins.length / totalPayinCount) * 100 
      : 0
    const totalPayinFees = completedPayins.reduce((sum, p) => sum + Number(p.commission || 0), 0)

    // Fetch payout stats
    const { data: payouts } = await supabase
      .from('payouts')
      .select('status, amount, commission')
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay)

    const totalPayoutCount = payouts?.length || 0
    const completedPayouts = payouts?.filter(p => p.status === 'completed') || []
    const totalPayoutAmount = completedPayouts.reduce((sum, p) => sum + Number(p.amount || 0), 0)
    const payoutSuccessRate = totalPayoutCount > 0 
      ? (completedPayouts.length / totalPayoutCount) * 100 
      : 0
    const totalPayoutFees = completedPayouts.reduce((sum, p) => sum + Number(p.commission || 0), 0)

    // Fetch dispute count
    const { count: disputeCount } = await supabase
      .from('disputes')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay)

    // Fetch refund count (if table exists)
    let refundCount = 0
    try {
      const { count } = await supabase
        .from('refunds')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
      refundCount = count || 0
    } catch (e) {
      // Table might not exist yet
    }

    // Count active merchants
    const { data: activePayinMerchants } = await supabase
      .from('payins')
      .select('merchant_id')
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay)
    const activeMerchants = new Set(activePayinMerchants?.map(p => p.merchant_id)).size

    // Count active traders
    const { data: activePayoutTraders } = await supabase
      .from('payouts')
      .select('trader_id')
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay)
    const activeTraders = new Set(activePayoutTraders?.map(p => p.trader_id).filter(Boolean)).size

    // Count active UPIs (used in payins)
    const { data: activeUpiPayins } = await supabase
      .from('payins')
      .select('upi_id')
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay)
      .eq('status', 'completed')
    const activeUpis = new Set(activeUpiPayins?.map(p => p.upi_id).filter(Boolean)).size

    // Calculate total revenue
    const totalRevenue = totalPayinFees + totalPayoutFees

    // Upsert daily summary
    const summaryData = {
      summary_date: targetDate,
      total_payin_count: totalPayinCount,
      total_payin_amount: totalPayinAmount,
      total_payout_count: totalPayoutCount,
      total_payout_amount: totalPayoutAmount,
      payin_success_rate: Math.round(payinSuccessRate * 100) / 100,
      payout_success_rate: Math.round(payoutSuccessRate * 100) / 100,
      total_payin_fees: totalPayinFees,
      total_payout_fees: totalPayoutFees,
      total_revenue: totalRevenue,
      active_merchants: activeMerchants,
      active_traders: activeTraders,
      active_upis: activeUpis,
      dispute_count: disputeCount || 0,
      refund_count: refundCount,
    }

    const { data: summary, error: upsertError } = await supabase
      .from('daily_summaries')
      .upsert(summaryData, { onConflict: 'summary_date' })
      .select()
      .single()

    if (upsertError) throw upsertError

    console.log(`Summary generated for ${targetDate}:`, summaryData)

    return new Response(JSON.stringify({ 
      success: true, 
      date: targetDate,
      summary: summaryData 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Daily summary error:', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
