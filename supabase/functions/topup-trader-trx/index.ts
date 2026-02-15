import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * TOPUP TRADER TRX
 * Sends TRX to trader address for sweep energy
 * Call when sweep fails due to OUT_OF_ENERGY
 */

// Amount to send (15 TRX)
const TOPUP_TRX = '15'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { address } = await req.json().catch(() => ({}))
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get config
    const { data: config } = await supabase
      .from('tatum_config')
      .select('tatum_api_key, master_mnemonic')
      .eq('id', 'main')
      .single()

    if (!config?.tatum_api_key || !config?.master_mnemonic) {
      return new Response(
        JSON.stringify({ error: 'Missing config' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // If no address provided, get all addresses with failed sweeps
    let addressesToTopup: string[] = []
    
    if (address) {
      addressesToTopup = [address]
    } else {
      // Get addresses with failed sweeps (OUT_OF_ENERGY)
      const { data: failedSweeps } = await supabase
        .from('sweep_queue')
        .select('from_address')
        .eq('status', 'failed')
      
      if (failedSweeps) {
        addressesToTopup = [...new Set(failedSweeps.map(s => s.from_address))]
      }
    }

    if (addressesToTopup.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No addresses to topup' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get master private key (index 0)
    const pkResponse = await fetch('https://api.tatum.io/v3/tron/wallet/priv', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.tatum_api_key,
      },
      body: JSON.stringify({
        mnemonic: config.master_mnemonic,
        index: 0
      }),
    })

    if (!pkResponse.ok) {
      throw new Error('Failed to get master private key')
    }

    const { key: masterPrivateKey } = await pkResponse.json()

    const results: any[] = []

    for (const addr of addressesToTopup) {
      try {
        console.log(`💸 Sending ${TOPUP_TRX} TRX to ${addr}`)

        const sendResponse = await fetch('https://api.tatum.io/v3/tron/transaction', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.tatum_api_key,
          },
          body: JSON.stringify({
            fromPrivateKey: masterPrivateKey,
            to: addr,
            amount: TOPUP_TRX
          }),
        })

        const sendData = await sendResponse.json()

        if (sendData.txId) {
          console.log(`✅ Topup sent: ${sendData.txId}`)
          
          // Reset failed sweeps for this address
          await supabase
            .from('sweep_queue')
            .update({ status: 'pending', error: null, failed_at: null })
            .eq('from_address', addr)
            .eq('status', 'failed')

          results.push({ address: addr, success: true, txId: sendData.txId })
        } else {
          results.push({ address: addr, success: false, error: sendData.message || 'No txId' })
        }
      } catch (err) {
        results.push({ address: addr, success: false, error: err.message })
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
