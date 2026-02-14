import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { xpub, index, fromIndex, toIndex } = await req.json()

    // Get Tatum API key from config
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: config, error: configError } = await supabase
      .from('tatum_config')
      .select('tatum_api_key')
      .eq('id', 'main')
      .single()

    if (configError) {
      return new Response(
        JSON.stringify({ error: `DB error: ${configError.message}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!config?.tatum_api_key) {
      return new Response(
        JSON.stringify({ error: 'Tatum API key not configured in tatum_config table. Add it in HD Wallets → Configuration.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const apiKey = config.tatum_api_key
    console.log('Using API key:', apiKey?.substring(0, 8) + '...')

    // Single address derivation
    if (index !== undefined) {
      const res = await fetch(`https://api.tatum.io/v3/tron/address/${xpub}/${index}`, {
        headers: { 'x-api-key': apiKey }
      })
      
      if (!res.ok) {
        const err = await res.text()
        throw new Error(`Tatum API error: ${res.status} - ${err}`)
      }
      
      const data = await res.json()
      return new Response(
        JSON.stringify({ address: data.address, index }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Multiple address derivation
    if (fromIndex !== undefined && toIndex !== undefined) {
      const addresses = []
      for (let i = fromIndex; i <= toIndex; i++) {
        const res = await fetch(`https://api.tatum.io/v3/tron/address/${xpub}/${i}`, {
          headers: { 'x-api-key': apiKey }
        })
        
        if (!res.ok) {
          throw new Error(`Tatum API error at index ${i}: ${res.status}`)
        }
        
        const data = await res.json()
        addresses.push({ index: i, address: data.address })
      }
      
      return new Response(
        JSON.stringify({ addresses }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Provide index or fromIndex+toIndex' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
