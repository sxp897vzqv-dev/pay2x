import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'

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
      .select('tatum_api_key, default_usdt_rate')
      .eq('id', 'main')
      .single()

    // Get addresses from DB
    const { data: addresses } = await supabase
      .from('address_mapping')
      .select('address, trader_id, last_usdt_balance')

    const results: any = {
      config_ok: !!config?.tatum_api_key,
      rate: config?.default_usdt_rate,
      addresses: addresses,
      balances: []
    }

    // Check each address via Tatum
    for (const addr of (addresses || [])) {
      const accountResp = await fetch(
        `https://api.tatum.io/v3/tron/account/${addr.address}`,
        { headers: { 'x-api-key': config.tatum_api_key } }
      )
      
      let currentUsdt = 0
      let accountData = null
      
      if (accountResp.ok) {
        accountData = await accountResp.json()
        if (accountData.trc20) {
          for (const token of accountData.trc20) {
            if (token[USDT_CONTRACT]) {
              currentUsdt = parseInt(token[USDT_CONTRACT]) / 1000000
              break
            }
          }
        }
      }

      const lastKnown = parseFloat(addr.last_usdt_balance) || 0
      const difference = currentUsdt - lastKnown

      results.balances.push({
        address: addr.address,
        trader_id: addr.trader_id,
        db_last_usdt_balance: addr.last_usdt_balance,
        db_last_usdt_balance_parsed: lastKnown,
        tatum_current_usdt: currentUsdt,
        difference: difference,
        would_credit: difference > 0
      })
    }

    return new Response(
      JSON.stringify(results, null, 2),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
