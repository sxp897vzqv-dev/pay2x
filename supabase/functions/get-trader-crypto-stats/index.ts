import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

/**
 * GET TRADER CRYPTO STATS
 * Returns deposit stats and transaction history for a trader
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const traderId = url.searchParams.get('traderId')
    const limit = parseInt(url.searchParams.get('limit') || '50')

    if (!traderId) {
      return new Response(
        JSON.stringify({ success: false, error: 'traderId required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get trader info
    const { data: trader, error: traderError } = await supabase
      .from('traders')
      .select('usdt_deposit_address, derivation_index, last_deposit_at, balance')
      .eq('id', traderId)
      .single()

    if (traderError) {
      return new Response(
        JSON.stringify({ success: false, error: 'Trader not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get transaction stats
    const { data: stats } = await supabase
      .from('crypto_transactions')
      .select('usdt_amount, inr_amount, type')
      .eq('trader_id', traderId)
      .eq('type', 'deposit')
      .eq('status', 'completed')

    const totalDeposits = stats?.length || 0
    const totalUsdt = stats?.reduce((sum, t) => sum + (t.usdt_amount || 0), 0) || 0
    const totalInr = stats?.reduce((sum, t) => sum + (t.inr_amount || 0), 0) || 0

    // Get recent transactions
    const { data: transactions } = await supabase
      .from('crypto_transactions')
      .select('*')
      .eq('trader_id', traderId)
      .order('created_at', { ascending: false })
      .limit(limit)

    // Get pending sweeps
    const { data: pendingSweeps } = await supabase
      .from('sweep_queue')
      .select('id, amount')
      .eq('trader_id', traderId)
      .eq('status', 'pending')

    // Get current USDT rate
    const { data: config } = await supabase
      .from('tatum_config')
      .select('default_usdt_rate')
      .eq('id', 'main')
      .single()

    return new Response(
      JSON.stringify({
        success: true,
        address: trader.usdt_deposit_address,
        balance: trader.balance,
        stats: {
          total_deposits: totalDeposits,
          total_usdt: totalUsdt,
          total_inr: totalInr,
          last_deposit_at: trader.last_deposit_at
        },
        pending_sweeps: pendingSweeps?.length || 0,
        pending_sweep_amount: pendingSweeps?.reduce((sum, s) => sum + (s.amount || 0), 0) || 0,
        current_rate: config?.default_usdt_rate || 92,
        transactions: transactions || []
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
