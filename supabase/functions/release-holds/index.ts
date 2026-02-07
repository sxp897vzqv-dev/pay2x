// Edge Function: release-holds
// Releases expired balance holds and credits back to entities
// Deploy: supabase functions deploy release-holds
// Schedule: Every 15 minutes via cron

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get expired holds
    const { data: holds, error: fetchError } = await supabase
      .from('balance_holds')
      .select('*')
      .eq('status', 'active')
      .not('hold_until', 'is', null)
      .lte('hold_until', new Date().toISOString())

    if (fetchError) throw fetchError
    if (!holds || holds.length === 0) {
      return new Response(JSON.stringify({ released: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let released = 0
    const errors: string[] = []

    for (const hold of holds) {
      try {
        // Start transaction-like operations
        // 1. Update hold status
        const { error: updateHoldError } = await supabase
          .from('balance_holds')
          .update({
            status: 'released',
            released_at: new Date().toISOString(),
            notes: 'Auto-released after hold period expired',
          })
          .eq('id', hold.id)
          .eq('status', 'active') // Optimistic lock

        if (updateHoldError) {
          errors.push(`Hold ${hold.id}: ${updateHoldError.message}`)
          continue
        }

        // 2. Credit balance back to entity
        if (hold.entity_type === 'merchant') {
          const { error: balanceError } = await supabase.rpc('increment_balance', {
            table_name: 'merchants',
            row_id: hold.entity_id,
            amount: hold.amount,
          })
          
          if (balanceError) {
            // Fallback to direct update
            await supabase
              .from('merchants')
              .update({ 
                balance: supabase.raw(`balance + ${hold.amount}`)
              })
              .eq('id', hold.entity_id)
          }
        } else if (hold.entity_type === 'trader') {
          const { error: balanceError } = await supabase.rpc('increment_balance', {
            table_name: 'traders',
            row_id: hold.entity_id,
            amount: hold.amount,
          })
          
          if (balanceError) {
            await supabase
              .from('traders')
              .update({ 
                balance: supabase.raw(`balance + ${hold.amount}`)
              })
              .eq('id', hold.entity_id)
          }
        }

        // 3. Log the release
        await supabase.from('admin_logs').insert({
          action: 'hold_auto_released',
          category: 'finance',
          entity_type: hold.entity_type,
          entity_id: hold.entity_id,
          details: {
            note: `Balance hold of ₹${hold.amount} auto-released`,
            metadata: {
              hold_id: hold.id,
              amount: hold.amount,
              reason: hold.reason,
              held_since: hold.created_at,
            },
          },
          severity: 'info',
        })

        released++
      } catch (err) {
        errors.push(`Hold ${hold.id}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    return new Response(JSON.stringify({ 
      released, 
      total: holds.length,
      errors: errors.length > 0 ? errors : undefined 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Hold release error:', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
