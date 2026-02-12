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

  const schema: Record<string, string[]> = {}

  // Merchants
  const { data: m } = await supabase.from('merchants').select('*').limit(1)
  schema.merchants = m?.[0] ? Object.keys(m[0]) : []

  // Traders
  const { data: t } = await supabase.from('traders').select('*').limit(1)
  schema.traders = t?.[0] ? Object.keys(t[0]) : []

  // Payins
  const { data: p } = await supabase.from('payins').select('*').limit(1)
  schema.payins = p?.[0] ? Object.keys(p[0]) : []

  // Payouts
  const { data: po } = await supabase.from('payouts').select('*').limit(1)
  schema.payouts = po?.[0] ? Object.keys(po[0]) : []

  // Disputes
  const { data: d } = await supabase.from('disputes').select('*').limit(1)
  schema.disputes = d?.[0] ? Object.keys(d[0]) : []

  // UPI Pool
  const { data: u } = await supabase.from('upi_pool').select('*').limit(1)
  schema.upi_pool = u?.[0] ? Object.keys(u[0]) : []

  // Webhook Queue
  const { data: w } = await supabase.from('webhook_queue').select('*').limit(1)
  schema.webhook_queue = w?.[0] ? Object.keys(w[0]) : []

  // Webhook Deliveries
  const { data: wd, error: wdErr } = await supabase.from('webhook_deliveries').select('*').limit(1)
  schema.webhook_deliveries = wd?.[0] ? Object.keys(wd[0]) : [wdErr?.message || 'empty']

  // Webhook Attempts
  const { data: wa, error: waErr } = await supabase.from('webhook_attempts').select('*').limit(1)
  schema.webhook_attempts = wa?.[0] ? Object.keys(wa[0]) : [waErr?.message || 'empty']

  // Payout Webhook Queue
  const { data: pwq, error: pwqErr } = await supabase.from('payout_webhook_queue').select('*').limit(1)
  schema.payout_webhook_queue = pwq?.[0] ? Object.keys(pwq[0]) : [pwqErr?.message || 'empty']

  // Platform Earnings
  const { data: pe, error: peErr } = await supabase.from('platform_earnings').select('*').limit(1)
  schema.platform_earnings = pe?.[0] ? Object.keys(pe[0]) : [peErr?.message || 'empty']

  return new Response(
    JSON.stringify(schema, null, 2),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
