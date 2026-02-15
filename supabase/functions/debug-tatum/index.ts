import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * DEBUG TATUM
 * Tests different Tatum API endpoints to find the right one for TRC20 deposits
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

    if (!config?.tatum_api_key) {
      return new Response(
        JSON.stringify({ error: 'No Tatum API key' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get trader address
    const { data: addresses } = await supabase
      .from('address_mapping')
      .select('address')
      .limit(1)

    const testAddress = addresses?.[0]?.address || 'TU8pHPymQMQ9Xq7UaSuBoHzRy49y5fhk9Z'

    const results: Record<string, any> = { testAddress }

    // Test different endpoints
    const endpoints = [
      `/v3/tron/transaction/account/${testAddress}`,
      `/v3/tron/account/${testAddress}`,
      `/v3/tron/account/${testAddress}/balance`,
    ]

    for (const endpoint of endpoints) {
      try {
        const resp = await fetch(`https://api.tatum.io${endpoint}`, {
          headers: { 'x-api-key': config.tatum_api_key },
        })
        
        const status = resp.status
        let body: any
        
        try {
          body = await resp.json()
        } catch {
          body = await resp.text()
        }
        
        results[endpoint] = { status, body }
      } catch (err) {
        results[endpoint] = { error: err.message }
      }
    }

    // Also list active subscriptions
    try {
      const subsResp = await fetch('https://api.tatum.io/v3/subscription?pageSize=50', {
        headers: { 'x-api-key': config.tatum_api_key },
      })
      results['subscriptions'] = await subsResp.json()
    } catch (err) {
      results['subscriptions'] = { error: err.message }
    }
    
    // Check notification webhooks that have been sent
    try {
      const webhooksResp = await fetch('https://api.tatum.io/v3/subscription/webhook?pageSize=10', {
        headers: { 'x-api-key': config.tatum_api_key },
      })
      results['recentWebhooks'] = await webhooksResp.json()
    } catch (err) {
      results['recentWebhooks'] = { error: err.message }
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
