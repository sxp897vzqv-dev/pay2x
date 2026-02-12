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

  // Check UPI pool
  const { data: upis, error: upiErr } = await supabase
    .from('upi_pool')
    .select('*')
    .limit(10)

  // Check payins table structure (try to insert nothing to see columns)
  const { error: schemaErr } = await supabase
    .from('payins')
    .select('*')
    .limit(1)

  // Also check if it's called 'payin' instead of 'payins'
  const { data: payinData, error: payinErr } = await supabase
    .from('payin')
    .select('*')
    .limit(1)

  return new Response(
    JSON.stringify({
      upiPool: { count: upis?.length || 0, data: upis, error: upiErr?.message },
      payinsTable: { error: schemaErr?.message },
      payinTable: { data: payinData, error: payinErr?.message }
    }, null, 2),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
