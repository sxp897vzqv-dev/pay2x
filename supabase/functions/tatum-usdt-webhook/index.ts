import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

/**
 * TATUM USDT WEBHOOK
 * Receives notifications when USDT is deposited to trader addresses
 * Credits trader balance and queues sweep
 */

interface TatumWebhookData {
  address: string
  amount: number
  txId: string
  currency: string
  // Additional fields from Tatum
  blockNumber?: number
  counterAddress?: string
}

serve(async (req) => {
  console.log('🔔 Tatum webhook received')

  // Always return 200 to Tatum (even on errors) to prevent retries
  const successResponse = () => new Response('OK', { status: 200 })

  try {
    const webhookData: TatumWebhookData = await req.json()
    console.log('Webhook data:', JSON.stringify(webhookData))

    // Validate required fields
    if (!webhookData?.address || !webhookData?.amount || !webhookData?.txId) {
      console.log('❌ Invalid webhook data - missing required fields')
      return successResponse()
    }

    const { address, amount, txId, currency } = webhookData

    // Check if it's USDT transaction
    if (currency !== 'USDT' && currency !== 'USDT_TRON') {
      console.log(`❌ Not a USDT transaction (got ${currency})`)
      return successResponse()
    }

    console.log(`💰 USDT Deposit: ${amount} USDT to ${address}`)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Find trader by address
    const { data: mapping, error: mappingError } = await supabase
      .from('address_mapping')
      .select('trader_id')
      .eq('address', address)
      .single()

    if (mappingError || !mapping) {
      console.log('❌ Address not found in mapping:', address)
      return successResponse()
    }

    const traderId = mapping.trader_id
    console.log(`✅ Found trader: ${traderId}`)

    // Get USDT rate (from config or default)
    const { data: config } = await supabase
      .from('tatum_config')
      .select('default_usdt_rate')
      .eq('id', 'main')
      .single()

    const usdtRate = config?.default_usdt_rate || 92

    // Credit trader using stored function (handles duplicates, balance update, logging)
    const { data: result, error: creditError } = await supabase
      .rpc('credit_trader_on_usdt_deposit', {
        p_trader_id: traderId,
        p_usdt_amount: amount,
        p_usdt_rate: usdtRate,
        p_tx_hash: txId,
        p_from_address: address
      })

    if (creditError) {
      console.error('❌ Credit error:', creditError)
      return successResponse()
    }

    if (!result?.success) {
      console.log('❌ Credit failed:', result?.error)
      return successResponse()
    }

    console.log(`✅ Deposit processed: ₹${result.inr_amount} credited`)
    console.log(`✅ Balance: ₹${result.old_balance} → ₹${result.new_balance}`)

    return successResponse()

  } catch (error) {
    console.error('❌ Error processing webhook:', error)
    return successResponse() // Still return 200 to avoid webhook retry
  }
})
