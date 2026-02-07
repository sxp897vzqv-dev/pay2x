// Edge Function: process-exports
// Processes pending export jobs and generates CSV files
// Deploy: supabase functions deploy process-exports
// Schedule: Every 5 minutes via cron

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

    // Get pending export jobs
    const { data: jobs, error: fetchError } = await supabase
      .from('export_jobs')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(5)

    if (fetchError) throw fetchError
    if (!jobs || jobs.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let processed = 0
    let succeeded = 0

    for (const job of jobs) {
      processed++
      
      // Mark as generating
      await supabase
        .from('export_jobs')
        .update({ status: 'generating', started_at: new Date().toISOString() })
        .eq('id', job.id)

      try {
        // Fetch data based on export type
        let data: Record<string, unknown>[] = []
        let columns: string[] = []

        switch (job.export_type) {
          case 'payins':
            columns = ['id', 'order_id', 'merchant_id', 'amount', 'status', 'upi_id', 'utr', 'created_at', 'completed_at']
            const { data: payins } = await supabase
              .from('payins')
              .select(columns.join(','))
              .gte('created_at', job.date_from || '2020-01-01')
              .lte('created_at', job.date_to || new Date().toISOString())
              .order('created_at', { ascending: false })
              .limit(10000)
            data = payins || []
            break

          case 'payouts':
            columns = ['id', 'order_id', 'merchant_id', 'trader_id', 'amount', 'status', 'bank_name', 'account_number', 'created_at', 'completed_at']
            const { data: payouts } = await supabase
              .from('payouts')
              .select(columns.join(','))
              .gte('created_at', job.date_from || '2020-01-01')
              .lte('created_at', job.date_to || new Date().toISOString())
              .order('created_at', { ascending: false })
              .limit(10000)
            data = payouts || []
            break

          case 'settlements':
            columns = ['id', 'settlement_type', 'merchant_id', 'trader_id', 'period_start', 'period_end', 'gross_amount', 'fee_amount', 'net_amount', 'status', 'created_at']
            const { data: settlements } = await supabase
              .from('settlements')
              .select(columns.join(','))
              .gte('created_at', job.date_from || '2020-01-01')
              .lte('created_at', job.date_to || new Date().toISOString())
              .order('created_at', { ascending: false })
              .limit(10000)
            data = settlements || []
            break

          case 'disputes':
            columns = ['id', 'type', 'status', 'amount', 'merchant_id', 'trader_id', 'reason', 'created_at', 'resolved_at']
            const { data: disputes } = await supabase
              .from('disputes')
              .select(columns.join(','))
              .gte('created_at', job.date_from || '2020-01-01')
              .lte('created_at', job.date_to || new Date().toISOString())
              .order('created_at', { ascending: false })
              .limit(10000)
            data = disputes || []
            break

          default:
            throw new Error(`Unknown export type: ${job.export_type}`)
        }

        // Generate CSV
        const csv = generateCSV(data, columns)
        const csvBlob = new Blob([csv], { type: 'text/csv' })
        const fileName = `exports/${job.export_type}_${job.id}_${Date.now()}.csv`

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from('exports')
          .upload(fileName, csvBlob, {
            contentType: 'text/csv',
            upsert: true,
          })

        if (uploadError) throw uploadError

        // Update job as completed
        await supabase
          .from('export_jobs')
          .update({
            status: 'completed',
            file_path: fileName,
            row_count: data.length,
            file_size: csv.length,
            completed_at: new Date().toISOString(),
          })
          .eq('id', job.id)

        succeeded++
      } catch (err) {
        // Mark as failed
        await supabase
          .from('export_jobs')
          .update({
            status: 'failed',
            error_message: err instanceof Error ? err.message : 'Unknown error',
            completed_at: new Date().toISOString(),
          })
          .eq('id', job.id)
      }
    }

    return new Response(JSON.stringify({ processed, succeeded }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Export processor error:', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

function generateCSV(data: Record<string, unknown>[], columns: string[]): string {
  if (data.length === 0) {
    return columns.join(',') + '\n'
  }

  const header = columns.join(',')
  const rows = data.map(row => 
    columns.map(col => {
      const value = row[col]
      if (value === null || value === undefined) return ''
      if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
        return `"${value.replace(/"/g, '""')}"`
      }
      return String(value)
    }).join(',')
  )

  return [header, ...rows].join('\n')
}
