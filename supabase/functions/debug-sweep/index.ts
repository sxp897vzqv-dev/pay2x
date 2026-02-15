import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * DEBUG SWEEP
 * Checks sweep queue status and config
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
      .select('admin_wallet, master_mnemonic, master_address')
      .eq('id', 'main')
      .single()

    // Get pending sweeps
    const { data: pendingSweeps } = await supabase
      .from('sweep_queue')
      .select('*, traders(name, derivation_index)')
      .eq('status', 'pending')

    // Get all sweeps
    const { data: allSweeps } = await supabase
      .from('sweep_queue')
      .select('id, status, amount, from_address, created_at, completed_at, error')
      .order('created_at', { ascending: false })
      .limit(10)

    return new Response(
      JSON.stringify({
        config: {
          admin_wallet: config?.admin_wallet || 'NOT SET',
          has_mnemonic: !!config?.master_mnemonic,
          master_address: config?.master_address || 'NOT SET'
        },
        pending_count: pendingSweeps?.length || 0,
        pending_sweeps: pendingSweeps,
        recent_sweeps: allSweeps
      }, null, 2),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
