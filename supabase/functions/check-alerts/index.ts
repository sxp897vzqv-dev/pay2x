// Edge Function: check-alerts
// Checks alert conditions and triggers notifications
// Deploy: supabase functions deploy check-alerts
// Schedule: Every 5 minutes via cron

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AlertRule {
  id: string
  name: string
  event_type: string
  conditions: Record<string, number | string>
  channels: string[]
  severity: string
  notify_admins: boolean
  notify_emails: string[] | null
  telegram_chat_ids: string[] | null
  webhook_urls: string[] | null
  cooldown_minutes: number
  last_triggered_at: string | null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get active alert rules not in cooldown
    const { data: rules, error: rulesError } = await supabase
      .from('alert_rules')
      .select('*')
      .eq('is_active', true)

    if (rulesError) throw rulesError
    if (!rules || rules.length === 0) {
      return new Response(JSON.stringify({ checked: 0, triggered: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let checked = 0
    let triggered = 0

    for (const rule of rules as AlertRule[]) {
      checked++

      // Check cooldown
      if (rule.last_triggered_at) {
        const cooldownEnd = new Date(rule.last_triggered_at).getTime() + rule.cooldown_minutes * 60 * 1000
        if (Date.now() < cooldownEnd) continue
      }

      // Check condition based on event type
      const alertData = await checkCondition(supabase, rule)
      
      if (alertData.triggered) {
        triggered++

        // Create alert history record
        await supabase.from('alert_history').insert({
          rule_id: rule.id,
          rule_name: rule.name,
          event_type: rule.event_type,
          severity: rule.severity,
          trigger_data: alertData.data,
          message: alertData.message,
          channels_notified: rule.channels,
        })

        // Update last triggered time
        await supabase
          .from('alert_rules')
          .update({ last_triggered_at: new Date().toISOString() })
          .eq('id', rule.id)

        // Send notifications
        await sendNotifications(supabase, rule, alertData.message, alertData.data)
      }
    }

    return new Response(JSON.stringify({ checked, triggered }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Alert checker error:', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function checkCondition(
  supabase: ReturnType<typeof createClient>,
  rule: AlertRule
): Promise<{ triggered: boolean; message: string; data: Record<string, unknown> }> {
  const threshold = Number(rule.conditions?.threshold) || 50
  const windowMinutes = Number(rule.conditions?.window_minutes) || 30
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString()

  switch (rule.event_type) {
    case 'high_failure_rate': {
      // Check payin failure rate
      const { data: payins } = await supabase
        .from('payins')
        .select('status')
        .gte('created_at', windowStart)

      if (!payins || payins.length < 10) {
        return { triggered: false, message: '', data: {} }
      }

      const failed = payins.filter(p => p.status === 'failed' || p.status === 'rejected').length
      const rate = (failed / payins.length) * 100

      if (rate >= threshold) {
        return {
          triggered: true,
          message: `⚠️ High failure rate alert: ${rate.toFixed(1)}% failures in last ${windowMinutes} mins (threshold: ${threshold}%)`,
          data: { failureRate: rate, total: payins.length, failed, windowMinutes },
        }
      }
      break
    }

    case 'large_transaction': {
      const amountThreshold = Number(rule.conditions?.amount_above) || 100000
      const { data: transactions } = await supabase
        .from('payins')
        .select('id, amount, merchant_id')
        .gte('amount', amountThreshold)
        .gte('created_at', windowStart)
        .order('created_at', { ascending: false })
        .limit(5)

      if (transactions && transactions.length > 0) {
        return {
          triggered: true,
          message: `💰 Large transaction alert: ${transactions.length} transaction(s) above ₹${amountThreshold.toLocaleString()}`,
          data: { count: transactions.length, transactions: transactions.slice(0, 3) },
        }
      }
      break
    }

    case 'new_dispute': {
      const { data: disputes, count } = await supabase
        .from('disputes')
        .select('*', { count: 'exact' })
        .gte('created_at', windowStart)

      if (count && count > 0) {
        return {
          triggered: true,
          message: `🚨 New dispute alert: ${count} dispute(s) in last ${windowMinutes} mins`,
          data: { count, disputes: disputes?.slice(0, 3) },
        }
      }
      break
    }

    case 'low_balance': {
      const balanceThreshold = Number(rule.conditions?.balance_below) || 10000
      const { data: lowBalanceTraders } = await supabase
        .from('traders')
        .select('id, name, balance')
        .eq('is_active', true)
        .lt('balance', balanceThreshold)

      if (lowBalanceTraders && lowBalanceTraders.length > 0) {
        return {
          triggered: true,
          message: `💸 Low balance alert: ${lowBalanceTraders.length} trader(s) below ₹${balanceThreshold.toLocaleString()}`,
          data: { count: lowBalanceTraders.length, traders: lowBalanceTraders.slice(0, 5) },
        }
      }
      break
    }

    case 'upi_down': {
      const { data: downUpis } = await supabase
        .from('upi_pool')
        .select('id, upi_id, status, failure_count')
        .or('status.eq.inactive,failure_count.gte.5')
        .eq('is_active', true)

      if (downUpis && downUpis.length > 0) {
        return {
          triggered: true,
          message: `📉 UPI health alert: ${downUpis.length} UPI(s) degraded or down`,
          data: { count: downUpis.length, upis: downUpis.slice(0, 5) },
        }
      }
      break
    }

    default:
      return { triggered: false, message: '', data: {} }
  }

  return { triggered: false, message: '', data: {} }
}

async function sendNotifications(
  supabase: ReturnType<typeof createClient>,
  rule: AlertRule,
  message: string,
  data: Record<string, unknown>
): Promise<void> {
  // In-app notification (always)
  if (rule.notify_admins) {
    const { data: admins } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin')

    // Could create in-app notifications here if you have a notifications table
  }

  // Telegram notification
  if (rule.channels.includes('telegram') && rule.telegram_chat_ids?.length) {
    const telegramToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
    if (telegramToken) {
      for (const chatId of rule.telegram_chat_ids) {
        try {
          await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: `🔔 *Pay2X Alert*\n\n${message}\n\nSeverity: ${rule.severity.toUpperCase()}`,
              parse_mode: 'Markdown',
            }),
          })
        } catch (e) {
          console.error('Telegram send failed:', e)
        }
      }
    }
  }

  // Webhook notification
  if (rule.channels.includes('webhook') && rule.webhook_urls?.length) {
    for (const url of rule.webhook_urls) {
      try {
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            alert: rule.name,
            event_type: rule.event_type,
            severity: rule.severity,
            message,
            data,
            timestamp: new Date().toISOString(),
          }),
        })
      } catch (e) {
        console.error('Webhook send failed:', e)
      }
    }
  }
}
