import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * REGISTER ADDRESS WEBHOOKS
 * Creates Tatum webhook subscriptions for all existing trader addresses
 * that don't have webhooks yet.
 * 
 * Call this once after deploying the system, or after generating addresses
 * without webhook registration.
 * 
 * No auth required - uses service_role internally
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  console.log('🔗 Registering webhooks for existing addresses...')

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get Tatum config
    const { data: config, error: configError } = await supabase
      .from('tatum_config')
      .select('tatum_api_key')
      .eq('id', 'main')
      .single()

    if (configError || !config?.tatum_api_key) {
      return new Response(
        JSON.stringify({ success: false, error: 'Tatum config not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get addresses without webhooks
    const { data: addresses, error: addrError } = await supabase
      .from('address_mapping')
      .select('address, trader_id, webhook_id')
      .is('webhook_id', null)

    if (addrError) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch addresses' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!addresses || addresses.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'All addresses already have webhooks', registered: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`📋 Found ${addresses.length} addresses without webhooks`)

    const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/tatum-usdt-webhook`
    let registered = 0
    const errors: string[] = []

    for (const { address, trader_id } of addresses) {
      try {
        console.log(`📡 Creating webhook for: ${address}`)

        const response = await fetch('https://api.tatum.io/v3/subscription', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.tatum_api_key,
          },
          body: JSON.stringify({
            type: 'ADDRESS_EVENT',
            attr: {
              address: address,
              chain: 'TRON',
              url: webhookUrl
            }
          }),
        })

        if (response.ok) {
          const webhookData = await response.json()
          console.log(`✅ Webhook created: ${webhookData.id}`)

          // Update address mapping with webhook ID
          await supabase
            .from('address_mapping')
            .update({ webhook_id: webhookData.id })
            .eq('address', address)

          registered++
        } else {
          const error = await response.json()
          console.error(`❌ Failed for ${address}:`, error)
          errors.push(`${address}: ${error.message || response.status}`)
        }

        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 200))

      } catch (error) {
        console.error(`Error registering ${address}:`, error.message)
        errors.push(`${address}: ${error.message}`)
      }
    }

    console.log(`✅ Registered ${registered}/${addresses.length} webhooks`)

    return new Response(
      JSON.stringify({
        success: true,
        total: addresses.length,
        registered,
        errors: errors.length > 0 ? errors : undefined
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
