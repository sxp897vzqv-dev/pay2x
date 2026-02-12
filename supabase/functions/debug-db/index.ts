import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // Check merchants
  const { data: merchants, error: mErr } = await supabase
    .from('merchants')
    .select('id, name, live_api_key, is_active')
    .limit(5)

  // Check specific API key
  const { data: specific, error: sErr } = await supabase
    .from('merchants')
    .select('id, name, live_api_key, is_active')
    .eq('live_api_key', 'live_1770660122657_mevpz')
    .single()

  // Check traders
  const { data: traders, error: tErr } = await supabase
    .from('traders')
    .select('id, name, balance, is_active')
    .limit(5)

  return new Response(
    JSON.stringify({
      merchants: { data: merchants, error: mErr?.message },
      specificMerchant: { data: specific, error: sErr?.message },
      traders: { data: traders, error: tErr?.message },
      env: {
        hasUrl: !!Deno.env.get('SUPABASE_URL'),
        hasKey: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      }
    }, null, 2),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
