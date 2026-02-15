import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * POLL USDT DEPOSITS
 * Simple balance-based detection:
 * - Check current USDT balance via Tatum
 * - Compare with last_usdt_balance in DB
 * - Credit the difference
 * 
 * Fee: 5 USDT if deposit < 1000 USDT
 */

const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
const SMALL_DEPOSIT_FEE_USDT = 5
const SMALL_DEPOSIT_THRESHOLD_USDT = 1000

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  console.log('🔍 Polling for USDT deposits...')

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

    if (!config?.tatum_api_key) {
      return new Response(
        JSON.stringify({ success: false, error: 'No Tatum API key' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get addresses
    const { data: addresses } = await supabase
      .from('address_mapping')
      .select('address, trader_id, last_usdt_balance')

    if (!addresses || addresses.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No addresses', found: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const usdtRate = config.default_usdt_rate || 92
    let foundDeposits = 0
    const results: any[] = []

    for (const addr of addresses) {
      try {
        // Get account from Tatum
        const accountResp = await fetch(
          `https://api.tatum.io/v3/tron/account/${addr.address}`,
          { headers: { 'x-api-key': config.tatum_api_key } }
        )

        if (!accountResp.ok) {
          console.log(`⚠️ Account not active: ${addr.address}`)
          results.push({ address: addr.address, status: 'inactive' })
          continue
        }

        const account = await accountResp.json()
        
        // Find USDT balance
        let currentUsdt = 0
        if (account.trc20 && Array.isArray(account.trc20)) {
          for (const token of account.trc20) {
            if (token[USDT_CONTRACT]) {
              currentUsdt = parseInt(token[USDT_CONTRACT]) / 1000000
              break
            }
          }
        }

        const lastKnown = parseFloat(addr.last_usdt_balance) || 0
        const newDeposit = currentUsdt - lastKnown

        console.log(`💰 ${addr.address}: current=${currentUsdt}, last=${lastKnown}, diff=${newDeposit}`)

        if (newDeposit > 0) {
          console.log(`🎉 New deposit detected: ${newDeposit} USDT`)

          // Apply fee if < 1000 USDT
          let creditAmount = newDeposit
          let feeAmount = 0
          
          if (newDeposit < SMALL_DEPOSIT_THRESHOLD_USDT) {
            feeAmount = Math.min(SMALL_DEPOSIT_FEE_USDT, newDeposit) // Don't fee more than deposit
            creditAmount = newDeposit - feeAmount
          }

          if (creditAmount <= 0) {
            console.log(`⚠️ Deposit too small after fee`)
            results.push({ address: addr.address, status: 'too_small', deposit: newDeposit, fee: feeAmount })
            continue
          }

          const inrAmount = Math.round(creditAmount * usdtRate)
          
          // Generate tx reference
          const txRef = `BAL_${Date.now()}_${addr.address.slice(-6)}`

          // Credit trader (with NET amount after fee, GROSS for sweep)
          const { data: result, error: creditError } = await supabase
            .rpc('credit_trader_on_usdt_deposit', {
              p_trader_id: addr.trader_id,
              p_usdt_amount: creditAmount,  // Net amount (after fee) for balance
              p_usdt_rate: usdtRate,
              p_tx_hash: txRef,
              p_from_address: addr.address,
              p_gross_amount: newDeposit    // Gross amount for sweep
            })

          if (creditError) {
            console.error('❌ Credit error:', creditError)
            results.push({ address: addr.address, status: 'credit_error', error: creditError.message })
            continue
          }

          if (result?.success) {
            console.log(`✅ Credited ₹${inrAmount}`)

            // Update last known balance
            await supabase
              .from('address_mapping')
              .update({ last_usdt_balance: currentUsdt })
              .eq('address', addr.address)

            foundDeposits++
            results.push({
              address: addr.address,
              status: 'credited',
              grossUsdt: newDeposit,
              feeUsdt: feeAmount,
              netUsdt: creditAmount,
              inr: inrAmount,
              newBalance: result.new_balance
            })
          } else {
            console.log(`⚠️ Credit failed:`, result)
            results.push({ address: addr.address, status: 'credit_failed', result })
          }
        } else {
          results.push({ address: addr.address, status: 'no_new', balance: currentUsdt })
        }

        await new Promise(r => setTimeout(r, 100))

      } catch (error) {
        console.error(`Error: ${error.message}`)
        results.push({ address: addr.address, status: 'error', error: error.message })
      }
    }

    console.log(`✅ Done. Found ${foundDeposits} deposits`)

    return new Response(
      JSON.stringify({ success: true, checked: addresses.length, found: foundDeposits, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
