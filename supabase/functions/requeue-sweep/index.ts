import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'

/**
 * REQUEUE SWEEP
 * Checks actual USDT balance and creates sweep if needed
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get config
    const { data: config } = await supabase
      .from('tatum_config')
      .select('tatum_api_key')
      .eq('id', 'main')
      .single()

    // Get all trader addresses
    const { data: addresses } = await supabase
      .from('address_mapping')
      .select('address, trader_id')

    if (!addresses || addresses.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No addresses' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const results: any[] = []

    for (const { address, trader_id } of addresses) {
      // Check actual USDT balance via Tatum
      const accountResp = await fetch(
        `https://api.tatum.io/v3/tron/account/${address}`,
        { headers: { 'x-api-key': config.tatum_api_key } }
      )

      if (!accountResp.ok) {
        results.push({ address, status: 'account_not_found' })
        continue
      }

      const account = await accountResp.json()
      
      let usdtBalance = 0
      if (account.trc20 && Array.isArray(account.trc20)) {
        for (const token of account.trc20) {
          if (token[USDT_CONTRACT]) {
            usdtBalance = parseInt(token[USDT_CONTRACT]) / 1000000
            break
          }
        }
      }

      if (usdtBalance <= 0) {
        results.push({ address, status: 'no_usdt', balance: 0 })
        continue
      }

      // Check if pending sweep exists
      const { data: existingSweep } = await supabase
        .from('sweep_queue')
        .select('id')
        .eq('from_address', address)
        .eq('status', 'pending')
        .single()

      if (existingSweep) {
        results.push({ address, status: 'already_pending', balance: usdtBalance })
        continue
      }

      // Create new sweep entry
      const { error: insertError } = await supabase
        .from('sweep_queue')
        .insert({
          trader_id,
          from_address: address,
          amount: usdtBalance,
          status: 'pending'
        })

      if (insertError) {
        results.push({ address, status: 'insert_error', error: insertError.message })
      } else {
        results.push({ address, status: 'queued', balance: usdtBalance })
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
