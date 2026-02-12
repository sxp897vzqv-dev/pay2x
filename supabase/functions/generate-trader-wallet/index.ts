import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

/**
 * GENERATE TRADER WALLET (Admin version)
 * Same as generate-usdt-address but allows specifying derivation index
 */

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
    console.log('✅ Address generated:', addressData.address)

    // Update trader
    const { error: traderError } = await supabase
      .from('traders')
      .update({
        usdt_deposit_address: addressData.address,
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
        address: addressData.address,
        trader_id: traderId,
        derivation_index: nextIndex
      })

    return new Response(
      JSON.stringify({
        success: true,
        address: addressData.address,
        derivationIndex: nextIndex
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
