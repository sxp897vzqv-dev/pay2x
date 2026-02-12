import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

/**
 * SETUP TATUM WEBHOOK
 * Creates webhook subscription in Tatum to notify us of deposits
 * Call this ONCE after deploying the system
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

    // Get Tatum config
    const { data: config, error: configError } = await supabase
      .from('tatum_config')
      .select('*')
      .eq('id', 'main')
      .single()

    if (configError || !config?.tatum_api_key) {
      return new Response(
        JSON.stringify({ success: false, error: 'Tatum config not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Webhook URL for our Edge Function
    const webhookUrl = 'https://jrzyndtowwwcydgcagcr.supabase.co/functions/v1/tatum-usdt-webhook'

    console.log('Setting up Tatum webhook to:', webhookUrl)

    // Create ADDRESS_EVENT subscription for Tron
    // Monitors the master address for incoming transactions
    const response = await fetch('https://api.tatum.io/v3/subscription', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.tatum_api_key,
      },
      body: JSON.stringify({
        type: 'ADDRESS_EVENT',
        attr: {
          address: config.master_address || config.admin_wallet,
          chain: 'TRON',
          url: webhookUrl
        }
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Tatum error:', error)
      return new Response(
        JSON.stringify({ success: false, error: error.message || 'Failed to create webhook' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const webhookData = await response.json()
    console.log('✅ Webhook created:', webhookData)

    // Save webhook ID to config
    await supabase
      .from('tatum_config')
      .update({
        webhook_id: webhookData.id,
        webhook_url: webhookUrl,
        webhook_created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', 'main')

    return new Response(
      JSON.stringify({
        success: true,
        webhook_id: webhookData.id,
        webhook_url: webhookUrl,
        message: 'Tatum webhook created successfully!'
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
