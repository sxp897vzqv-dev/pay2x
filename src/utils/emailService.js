// src/utils/emailService.js
// Email notification service

import { supabase } from '../supabase';

/**
 * Queue an email notification
 * Emails are processed by an Edge Function
 */
export async function queueEmail({ to, subject, template, data }) {
  const { error } = await supabase.from('email_queue').insert({
    to_email: to,
    subject,
    template,
    template_data: data,
    status: 'pending'
  });
  
  if (error) {
    console.error('Failed to queue email:', error);
    return false;
  }
  return true;
}

/**
 * Send login alert email
 */
export async function sendLoginAlert({ email, ip, userAgent, location, time }) {
  return queueEmail({
    to: email,
    subject: '🔐 New login to your Pay2X account',
    template: 'login_alert',
    data: {
      ip: ip || 'Unknown',
      device: parseUserAgent(userAgent),
      location: location || 'Unknown',
      time: new Date(time).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short'
      })
    }
  });
}

/**
 * Send payment notification
 */
export async function sendPaymentNotification({ email, type, amount, orderId, status, merchantName }) {
  const subjects = {
    payin_completed: `✅ Payment received: ₹${amount}`,
    payin_failed: `❌ Payment failed: ₹${amount}`,
    payout_completed: `✅ Payout sent: ₹${amount}`,
    large_payment: `💰 Large payment: ₹${amount}`,
    refund_processed: `↩️ Refund processed: ₹${amount}`,
  };

  return queueEmail({
    to: email,
    subject: subjects[type] || `Payment update: ₹${amount}`,
    template: 'payment_notification',
    data: {
      type,
      amount: formatCurrency(amount),
      orderId,
      status,
      merchantName,
      time: new Date().toLocaleString('en-IN')
    }
  });
}

/**
 * Send security alert
 */
export async function sendSecurityAlert({ email, action, details }) {
  const subjects = {
    password_changed: '🔑 Your password was changed',
    '2fa_enabled': '🛡️ Two-factor authentication enabled',
    '2fa_disabled': '⚠️ Two-factor authentication disabled',
    api_key_regenerated: '🔄 API key regenerated',
    team_member_added: '👥 New team member added',
    ip_whitelist_changed: '🌐 IP whitelist updated',
  };

  return queueEmail({
    to: email,
    subject: subjects[action] || 'Security update on your account',
    template: 'security_alert',
    data: {
      action,
      details,
      time: new Date().toLocaleString('en-IN')
    }
  });
}

/**
 * Send daily summary email
 */
export async function sendDailySummary({ email, merchantName, stats }) {
  return queueEmail({
    to: email,
    subject: `📊 Daily Summary - ${new Date().toLocaleDateString('en-IN')}`,
    template: 'daily_summary',
    data: {
      merchantName,
      ...stats,
      date: new Date().toLocaleDateString('en-IN', { dateStyle: 'full' })
    }
  });
}

// Helpers
function parseUserAgent(ua) {
  if (!ua) return 'Unknown device';
  
  let browser = 'Unknown browser';
  let os = 'Unknown OS';

  if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Safari')) browser = 'Safari';
  else if (ua.includes('Edge')) browser = 'Edge';

  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  return `${browser} on ${os}`;
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount);
}
