import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * GENERATE TRADER WALLET (Admin version)
 * - Derives address from master XPUB
 * - Auto-activates address by sending TRX
 * - Creates address mapping for lookup
 */

// Amount of TRX to send for activation (in SUN, 1 TRX = 1,000,000 SUN)
// TRC20 transfers need ~10-15 TRX for energy
const ACTIVATION_TRX_SUN = 20000000 // 20 TRX (enough for activation + sweep)

/**
 * Derive private key from mnemonic using Tatum API
 */
async function derivePrivateKey(mnemonic: string, index: number, apiKey: string): Promise<string> {
  const response = await fetch(`https://api.tatum.io/v3/tron/wallet/priv`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      mnemonic,
      index
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to derive private key')
  }

  const data = await response.json()
  return data.key
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { traderId, derivationIndex: specifiedIndex } = await req.json()
    
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

    // Get Tatum config
    const { data: config, error: configError } = await supabase
      .from('tatum_config')
      .select('*')
      .eq('id', 'main')
      .single()

    if (configError || !config?.master_xpub) {
      return new Response(
        JSON.stringify({ success: false, error: 'Master wallet not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!config.tatum_api_key) {
      return new Response(
        JSON.stringify({ success: false, error: 'Tatum API key not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Use specified index or get next auto index
    let nextIndex = specifiedIndex
    if (!nextIndex) {
      const { data: autoIndex, error: indexError } = await supabase
        .rpc('get_next_derivation_index')
      if (indexError) {
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to get derivation index' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      nextIndex = autoIndex
    }

    console.log(`Generating address for trader ${traderId} at index ${nextIndex}`)

    // Derive address from XPUB using Tatum API
    const tatumResponse = await fetch(
      `https://api.tatum.io/v3/tron/address/${config.master_xpub}/${nextIndex}`,
      {
        method: 'GET',
        headers: { 'x-api-key': config.tatum_api_key },
      }
    )

    if (!tatumResponse.ok) {
      const error = await tatumResponse.json()
      throw new Error(error.message || 'Failed to generate address from Tatum')
    }

    const addressData = await tatumResponse.json()
    const newAddress = addressData.address
    console.log('✅ Address generated:', newAddress)

    // Update trader
    const { error: traderError } = await supabase
      .from('traders')
      .update({
        usdt_deposit_address: newAddress,
        derivation_index: nextIndex,
        address_generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', traderId)

    if (traderError) {
      throw new Error('Failed to update trader: ' + traderError.message)
    }

    // Create address mapping
    await supabase
      .from('address_mapping')
      .upsert({
        address: newAddress,
        trader_id: traderId,
        derivation_index: nextIndex,
        last_usdt_balance: 0
      })

    // Auto-activate address by sending TRX from master wallet
    let activationTxId = null
    let activationError = null
    
    if (config.master_mnemonic && config.master_address) {
      try {
        console.log('⚡ Activating address by sending TRX...')
        
        // Send TRX using Tatum's transfer endpoint
        const activationResponse = await fetch('https://api.tatum.io/v3/tron/transaction', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.tatum_api_key,
          },
          body: JSON.stringify({
            fromPrivateKey: await derivePrivateKey(config.master_mnemonic, 0, config.tatum_api_key),
            to: newAddress,
            amount: (ACTIVATION_TRX_SUN / 1000000).toString() // Convert SUN to TRX
          }),
        })

        if (activationResponse.ok) {
          const activationData = await activationResponse.json()
          activationTxId = activationData.txId
          console.log('✅ Address activated, txId:', activationTxId)
        } else {
          const error = await activationResponse.json()
          activationError = error.message || 'Activation failed'
          console.error('⚠️ Activation failed (non-fatal):', error)
        }
      } catch (activationErr) {
        activationError = activationErr.message
        console.error('⚠️ Activation error (non-fatal):', activationErr.message)
      }
    } else {
      console.log('⚠️ Skipping activation - no master mnemonic configured')
      activationError = 'No master mnemonic'
    }

    return new Response(
      JSON.stringify({
        success: true,
        address: newAddress,
        derivationIndex: nextIndex,
        activated: !!activationTxId,
        activationTxId,
        activationError
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
