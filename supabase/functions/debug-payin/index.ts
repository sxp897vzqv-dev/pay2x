import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// Debug version of create-payin to see what's happening
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // Get ALL headers
  const headers: Record<string, string> = {}
  req.headers.forEach((value, key) => {
    headers[key] = value
  })

  // Extract API key same way as create-payin
  const authHeader = req.headers.get('Authorization')
  const apiKey = authHeader?.replace('Bearer ', '')

  // Try to find merchant
  const { data: merchant, error: merchantError } = await supabase
    .from('merchants')
    .select('id, name, live_api_key, is_active')
    .eq('live_api_key', apiKey || '')
    .single()

  // Also try direct query
  const { data: allMerchants } = await supabase
    .from('merchants')
    .select('live_api_key')
    .limit(10)

  return new Response(
    JSON.stringify({
      receivedHeaders: headers,
      extractedAuthHeader: authHeader,
      extractedApiKey: apiKey,
      merchantFound: merchant,
      merchantError: merchantError?.message,
      allApiKeys: allMerchants?.map(m => m.live_api_key),
      keyMatch: allMerchants?.some(m => m.live_api_key === apiKey)
    }, null, 2),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
