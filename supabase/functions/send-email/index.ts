// supabase/functions/send-email/index.ts
// Process email queue and send via Resend/SMTP

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'Pay2X <noreply@pay2x.com>'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Email templates
const templates: Record<string, (data: any) => { subject: string; html: string }> = {
  login_alert: (data) => ({
    subject: '🔐 New login to your Pay2X account',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4F46E5;">New Login Detected</h2>
        <p>We noticed a new login to your Pay2X merchant account:</p>
        <div style="background: #F3F4F6; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p><strong>Time:</strong> ${data.time}</p>
          <p><strong>IP Address:</strong> ${data.ip || 'Unknown'}</p>
          <p><strong>Device:</strong> ${data.device || data.user_agent || 'Unknown'}</p>
          ${data.location ? `<p><strong>Location:</strong> ${data.location}</p>` : ''}
        </div>
        <p>If this was you, no action is needed.</p>
        <p style="color: #DC2626;"><strong>If this wasn't you</strong>, please change your password immediately and enable two-factor authentication.</p>
        <hr style="margin: 24px 0; border: none; border-top: 1px solid #E5E7EB;">
        <p style="color: #6B7280; font-size: 12px;">This is an automated security alert from Pay2X. Do not reply to this email.</p>
      </div>
    `
  }),

  payment_notification: (data) => ({
    subject: data.type === 'payin_completed' ? `✅ Payment received: ${data.amount}` :
             data.type === 'payin_failed' ? `❌ Payment failed: ${data.amount}` :
             data.type === 'large_payment' ? `💰 Large payment: ${data.amount}` :
             `Payment update: ${data.amount}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4F46E5;">Payment ${data.status}</h2>
        <div style="background: #F3F4F6; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="font-size: 24px; font-weight: bold; color: #111827;">${data.amount}</p>
          <p><strong>Order ID:</strong> ${data.orderId || 'N/A'}</p>
          <p><strong>Status:</strong> ${data.status}</p>
          <p><strong>Time:</strong> ${data.time}</p>
        </div>
        <p>View details in your <a href="https://pay2x.com/merchant/payins" style="color: #4F46E5;">merchant dashboard</a>.</p>
      </div>
    `
  }),

  security_alert: (data) => ({
    subject: data.action === 'password_changed' ? '🔑 Your password was changed' :
             data.action === '2fa_enabled' ? '🛡️ Two-factor authentication enabled' :
             data.action === '2fa_disabled' ? '⚠️ Two-factor authentication disabled' :
             'Security update on your account',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4F46E5;">Security Update</h2>
        <p>The following change was made to your account:</p>
        <div style="background: #FEF3C7; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #F59E0B;">
          <p style="font-weight: bold; margin: 0;">${formatAction(data.action)}</p>
          <p style="margin: 8px 0 0; color: #6B7280; font-size: 14px;">Time: ${data.time}</p>
        </div>
        <p>If you didn't make this change, please contact support immediately.</p>
      </div>
    `
  }),

  daily_summary: (data) => ({
    subject: `📊 Daily Summary - ${data.date}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4F46E5;">Daily Summary for ${data.merchantName}</h2>
        <p>${data.date}</p>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0;">
          <div style="background: #ECFDF5; padding: 16px; border-radius: 8px; text-align: center;">
            <p style="color: #059669; font-size: 24px; font-weight: bold; margin: 0;">${data.totalPayins || 0}</p>
            <p style="color: #6B7280; margin: 4px 0 0;">Payins</p>
          </div>
          <div style="background: #EFF6FF; padding: 16px; border-radius: 8px; text-align: center;">
            <p style="color: #2563EB; font-size: 24px; font-weight: bold; margin: 0;">${data.volume || '₹0'}</p>
            <p style="color: #6B7280; margin: 4px 0 0;">Volume</p>
          </div>
          <div style="background: #F3F4F6; padding: 16px; border-radius: 8px; text-align: center;">
            <p style="color: #111827; font-size: 24px; font-weight: bold; margin: 0;">${data.successRate || 0}%</p>
            <p style="color: #6B7280; margin: 4px 0 0;">Success Rate</p>
          </div>
          <div style="background: #FEF2F2; padding: 16px; border-radius: 8px; text-align: center;">
            <p style="color: #DC2626; font-size: 24px; font-weight: bold; margin: 0;">${data.failed || 0}</p>
            <p style="color: #6B7280; margin: 4px 0 0;">Failed</p>
          </div>
        </div>
        <p><a href="https://pay2x.com/merchant/reports" style="color: #4F46E5;">View full report →</a></p>
      </div>
    `
  }),
}

function formatAction(action: string): string {
  const actions: Record<string, string> = {
    'password_changed': 'Password Changed',
    '2fa_enabled': 'Two-Factor Authentication Enabled',
    '2fa_disabled': 'Two-Factor Authentication Disabled',
    'api_key_regenerated': 'API Key Regenerated',
    'team_member_added': 'Team Member Added',
    'ip_whitelist_changed': 'IP Whitelist Updated',
  }
  return actions[action] || action
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get pending emails (limit 10 per run)
    const { data: emails, error: fetchError } = await supabase
      .from('email_queue')
      .select('*')
      .eq('status', 'pending')
      .lt('attempts', 3)
      .order('created_at', { ascending: true })
      .limit(10)

    if (fetchError) throw fetchError

    if (!emails || emails.length === 0) {
      return new Response(JSON.stringify({ message: 'No pending emails' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let sent = 0
    let failed = 0

    for (const email of emails) {
      try {
        // Get template
        const templateFn = templates[email.template]
        if (!templateFn) {
          throw new Error(`Unknown template: ${email.template}`)
        }

        const { html } = templateFn(email.template_data || {})

        // Send via Resend
        if (RESEND_API_KEY) {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: FROM_EMAIL,
              to: email.to_email,
              subject: email.subject,
              html: html,
            }),
          })

          if (!res.ok) {
            const err = await res.text()
            throw new Error(`Resend error: ${err}`)
          }
        } else {
          // No API key - just log
          console.log(`[EMAIL] Would send to ${email.to_email}: ${email.subject}`)
        }

        // Mark as sent
        await supabase
          .from('email_queue')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', email.id)

        sent++
      } catch (err) {
        // Mark as failed (or retry)
        const newAttempts = (email.attempts || 0) + 1
        await supabase
          .from('email_queue')
          .update({
            attempts: newAttempts,
            last_attempt_at: new Date().toISOString(),
            status: newAttempts >= 3 ? 'failed' : 'pending',
            error: err.message,
          })
          .eq('id', email.id)

        failed++
      }
    }

    return new Response(JSON.stringify({ sent, failed, total: emails.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
