import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * FIX MASTER ADDRESS
 * Derives and sets master_address from xpub (index 0)
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
      .select('master_xpub, master_address, tatum_api_key')
      .eq('id', 'main')
      .single()

    if (!config?.master_xpub || !config?.tatum_api_key) {
      return new Response(
        JSON.stringify({ error: 'Missing xpub or API key' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Derive address at index 0
    const response = await fetch(
      `https://api.tatum.io/v3/tron/address/${config.master_xpub}/0`,
      {
        headers: { 'x-api-key': config.tatum_api_key },
      }
    )

    if (!response.ok) {
      const err = await response.json()
      return new Response(
        JSON.stringify({ error: 'Tatum error', details: err }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { address } = await response.json()

    // Update config
    await supabase
      .from('tatum_config')
      .update({ master_address: address })
      .eq('id', 'main')

    // Also reset failed sweeps
    const { data: resetSweeps } = await supabase
      .from('sweep_queue')
      .update({ status: 'pending', error: null, failed_at: null })
      .eq('status', 'failed')
      .select('id')

    return new Response(
      JSON.stringify({
        success: true,
        master_address: address,
        sweeps_reset: resetSweeps?.length || 0
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
