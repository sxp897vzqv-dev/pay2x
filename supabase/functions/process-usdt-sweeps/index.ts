import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * PROCESS USDT SWEEPS
 * Moves USDT from trader addresses to admin wallet
 * Should be called by cron every 5 minutes
 * No auth required - uses service_role internally
 */

const USDT_TRC20_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
const REFILL_TRX_AMOUNT = '10' // TRX to send back after sweep

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  console.log('🧹 Starting sweep process...')

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get Tatum config
    const { data: config, error: configError } = await supabase
      .from('tatum_config')
      .select('*')
      .eq('id', 'main')
      .single()

    if (configError || !config) {
      console.log('❌ Tatum config not found')
      return new Response(
        JSON.stringify({ success: false, error: 'Config not found' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!config.admin_wallet) {
      console.log('❌ Admin wallet not configured')
      return new Response(
        JSON.stringify({ success: false, error: 'Admin wallet not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get pending sweeps
    const { data: sweeps, error: sweepsError } = await supabase
      .from('sweep_queue')
      .select('*, traders(derivation_index)')
      .eq('status', 'pending')
      .limit(10)

    if (sweepsError) {
      console.error('Error fetching sweeps:', sweepsError)
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch sweeps' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!sweeps || sweeps.length === 0) {
      console.log('✅ No pending sweeps')
      return new Response(
        JSON.stringify({ success: true, message: 'No pending sweeps', processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`📋 Found ${sweeps.length} pending sweeps`)

    let processed = 0
    let succeeded = 0
    let failed = 0

    for (const sweep of sweeps) {
      processed++
      const { id, from_address, amount, trader_id, traders } = sweep
      const derivationIndex = traders?.derivation_index

      if (!derivationIndex) {
        console.error(`❌ No derivation index for trader ${trader_id}`)
        await supabase.from('sweep_queue').update({
          status: 'failed',
          error: 'No derivation index',
          failed_at: new Date().toISOString()
        }).eq('id', id)
        failed++
        continue
      }

      try {
        console.log(`💸 Sweeping ${amount} USDT from ${from_address} to ${config.admin_wallet}`)

        // Get private key from mnemonic + index
        const privateKeyResponse = await fetch(
          'https://api.tatum.io/v3/tron/wallet/priv',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': config.tatum_api_key,
            },
            body: JSON.stringify({
              mnemonic: config.master_mnemonic,
              index: derivationIndex,
            }),
          }
        )

        if (!privateKeyResponse.ok) {
          throw new Error('Failed to get private key')
        }

        const { key: privateKey } = await privateKeyResponse.json()

        // Send USDT to admin wallet using Tatum TRC20 transfer
        // API: POST /v3/tron/trc20/transaction
        const sendResponse = await fetch(
          'https://api.tatum.io/v3/tron/trc20/transaction',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': config.tatum_api_key,
            },
            body: JSON.stringify({
              to: config.admin_wallet,
              amount: amount.toString(),
              tokenAddress: USDT_TRC20_CONTRACT,
              fromPrivateKey: privateKey,
              feeLimit: 100  // 100 TRX fee limit (for energy)
            }),
          }
        )

        const sendData = await sendResponse.json()
        console.log('Tatum response:', JSON.stringify(sendData))

        if (sendData.txId) {
          console.log(`✅ Sweep successful: ${sendData.txId}`)

          // Update sweep status
          await supabase.from('sweep_queue').update({
            status: 'completed',
            sweep_tx_hash: sendData.txId,
            completed_at: new Date().toISOString()
          }).eq('id', id)

          // Create sweep transaction record
          await supabase.from('crypto_transactions').insert({
            trader_id,
            type: 'sweep',
            usdt_amount: amount,
            tx_hash: sendData.txId,
            from_address,
            to_address: config.admin_wallet,
            status: 'completed',
            description: `Auto-sweep ${amount} USDT to admin wallet`
          })

          // Reset last_usdt_balance to 0 after sweep (so new deposits are detected)
          await supabase.from('address_mapping')
            .update({ last_usdt_balance: 0 })
            .eq('address', from_address)

          // Refill TRX for next sweep
          try {
            console.log(`💸 Refilling ${REFILL_TRX_AMOUNT} TRX to ${from_address}`)
            
            // Get master private key
            const masterPkResponse = await fetch(
              'https://api.tatum.io/v3/tron/wallet/priv',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-api-key': config.tatum_api_key,
                },
                body: JSON.stringify({
                  mnemonic: config.master_mnemonic,
                  index: 0,
                }),
              }
            )
            
            if (masterPkResponse.ok) {
              const { key: masterPk } = await masterPkResponse.json()
              
              const refillResponse = await fetch('https://api.tatum.io/v3/tron/transaction', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-api-key': config.tatum_api_key,
                },
                body: JSON.stringify({
                  fromPrivateKey: masterPk,
                  to: from_address,
                  amount: REFILL_TRX_AMOUNT
                }),
              })
              
              const refillData = await refillResponse.json()
              if (refillData.txId) {
                console.log(`✅ TRX refill sent: ${refillData.txId}`)
              } else {
                console.log(`⚠️ TRX refill failed: ${refillData.message}`)
              }
            }
          } catch (refillError) {
            console.error('⚠️ TRX refill error (non-fatal):', refillError.message)
          }

          succeeded++
        } else {
          throw new Error(sendData.message || 'No txId in response')
        }

      } catch (error) {
        console.error(`❌ Sweep failed for ${id}:`, error.message)

        await supabase.from('sweep_queue').update({
          status: 'failed',
          error: error.message,
          failed_at: new Date().toISOString()
        }).eq('id', id)

        failed++
      }
    }

    console.log(`✅ Sweep process complete: ${succeeded} succeeded, ${failed} failed`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed,
        succeeded,
        failed
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Error in sweep process:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
