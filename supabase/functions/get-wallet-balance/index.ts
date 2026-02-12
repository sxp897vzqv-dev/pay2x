import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

/**
 * GET WALLET BALANCE
 * Fetches USDT balance for a Tron address using Tatum API
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { address } = await req.json()
    
    if (!address) {
      return new Response(
        JSON.stringify({ success: false, error: 'address required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get Tatum config
    const { data: config } = await supabase
      .from('tatum_config')
      .select('tatum_api_key')
      .eq('id', 'main')
      .single()

    if (!config?.tatum_api_key) {
      return new Response(
        JSON.stringify({ success: false, error: 'Tatum API key not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get TRC20 USDT balance from Tatum
    const response = await fetch(
      `https://api.tatum.io/v3/tron/account/${address}`,
      {
        headers: { 'x-api-key': config.tatum_api_key }
      }
    )

    if (!response.ok) {
      // Account might not exist yet (no transactions)
      return new Response(
        JSON.stringify({ 
          success: true, 
          balance: 0,
          trx: 0
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const accountData = await response.json()
    
    // Find USDT TRC20 token balance
    // USDT contract: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
    let usdtBalance = 0
    if (accountData.trc20) {
      for (const token of accountData.trc20) {
        if (token.TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t) {
          usdtBalance = parseFloat(token.TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t) / 1000000 // 6 decimals
          break
        }
      }
    }

    // TRX balance (for gas)
    const trxBalance = accountData.balance ? accountData.balance / 1000000 : 0

    return new Response(
      JSON.stringify({
        success: true,
        balance: usdtBalance,
        trx: trxBalance
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
