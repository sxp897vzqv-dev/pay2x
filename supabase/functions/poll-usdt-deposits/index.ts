import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

/**
 * POLL USDT DEPOSITS
 * Backup polling in case webhook fails
 * Should be called by cron every 2 minutes
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  console.log('🔍 Polling for missed deposits...')

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get Tatum config
    const { data: config, error: configError } = await supabase
      .from('tatum_config')
      .select('tatum_api_key, default_usdt_rate')
      .eq('id', 'main')
      .single()

    if (configError || !config?.tatum_api_key) {
      console.log('❌ Tatum config not found')
      return new Response(
        JSON.stringify({ success: false, error: 'Config not found' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get all trader addresses
    const { data: addressMappings, error: mappingsError } = await supabase
      .from('address_mapping')
      .select('address, trader_id')

    if (mappingsError || !addressMappings || addressMappings.length === 0) {
      console.log('✅ No addresses to poll')
      return new Response(
        JSON.stringify({ success: true, message: 'No addresses to poll', found: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`📋 Checking ${addressMappings.length} addresses`)

    const usdtRate = config.default_usdt_rate || 92
    let foundDeposits = 0

    for (const { address, trader_id } of addressMappings) {
      try {
        // Check last 10 transactions for this address
        const txResponse = await fetch(
          `https://api.tatum.io/v3/tron/transaction/account/${address}?limit=10`,
          {
            headers: { 'x-api-key': config.tatum_api_key },
          }
        )

        if (!txResponse.ok) {
          console.error(`Failed to fetch txs for ${address}`)
          continue
        }

        const transactions = await txResponse.json()

        if (!Array.isArray(transactions)) continue

        for (const tx of transactions) {
          // Skip if not USDT to this address
          if (tx.to !== address || tx.tokenInfo?.symbol !== 'USDT') continue

          // Check if already processed
          const { data: existing } = await supabase
            .from('crypto_transactions')
            .select('id')
            .eq('tx_hash', tx.txID)
            .single()

          if (existing) continue // Already processed

          console.log(`💰 Found missed deposit: ${tx.txID}`)

          // Process the deposit
          const amount = parseFloat(tx.value) / 1000000 // USDT has 6 decimals

          const { data: result, error: creditError } = await supabase
            .rpc('credit_trader_on_usdt_deposit', {
              p_trader_id: trader_id,
              p_usdt_amount: amount,
              p_usdt_rate: usdtRate,
              p_tx_hash: tx.txID,
              p_from_address: address
            })

          if (creditError) {
            console.error('Credit error:', creditError)
            continue
          }

          if (result?.success) {
            console.log(`✅ Polled deposit processed: ₹${result.inr_amount}`)
            foundDeposits++
          }
        }

        // Rate limit - don't hammer Tatum API
        await new Promise(resolve => setTimeout(resolve, 100))

      } catch (error) {
        console.error(`Error checking ${address}:`, error.message)
      }
    }

    console.log(`✅ Polling complete. Found ${foundDeposits} missed deposits`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        checked: addressMappings.length,
        found: foundDeposits
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Error in polling:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
