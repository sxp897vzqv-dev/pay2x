import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * TATUM USDT WEBHOOK
 * Receives notifications when USDT is deposited to trader addresses
 * Credits trader balance and queues sweep
 * 
 * Tatum ADDRESS_EVENT webhook payload for TRC20:
 * {
 *   "address": "T...",
 *   "counterAddress": "sender address",
 *   "txId": "transaction hash",
 *   "amount": "100000000" (6 decimals for USDT),
 *   "currency": "USDT",
 *   "chain": "TRON",
 *   "type": "trc20"
 * }
 */

// USDT TRC20 contract address on TRON mainnet
const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'

serve(async (req) => {
  console.log('🔔 Tatum webhook received')
  console.log('Method:', req.method)
  console.log('Headers:', JSON.stringify(Object.fromEntries(req.headers.entries())))

  // Always return 200 to Tatum (even on errors) to prevent retries
  const successResponse = (msg = 'OK') => new Response(msg, { status: 200 })

  // Handle GET for webhook verification
  if (req.method === 'GET') {
    return successResponse('Webhook active')
  }

  try {
    const rawBody = await req.text()
    console.log('Raw body:', rawBody)

    let webhookData
    try {
      webhookData = JSON.parse(rawBody)
    } catch {
      console.log('❌ Failed to parse JSON')
      return successResponse()
    }

    console.log('Parsed webhook data:', JSON.stringify(webhookData))

    // Handle both single event and array of events
    const events = Array.isArray(webhookData) ? webhookData : [webhookData]

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get USDT rate once
    const { data: config } = await supabase
      .from('tatum_config')
      .select('default_usdt_rate')
      .eq('id', 'main')
      .single()
    
    const usdtRate = config?.default_usdt_rate || 92

    for (const event of events) {
      try {
        // Extract fields - Tatum uses various field names
        const address = event.address || event.to
        const txId = event.txId || event.txID || event.transaction_id || event.hash
        const rawAmount = event.amount || event.value || '0'
        const currency = event.currency || event.asset || event.tokenInfo?.symbol
        const chain = event.chain || 'TRON'
        const counterAddress = event.counterAddress || event.from || event.sender
        const type = event.type

        // Validate required fields
        if (!address || !txId) {
          console.log('⏭️ Skipping event - missing address or txId')
          continue
        }

        // Check if it's USDT/TRC20 transaction
        const isUSDT = currency === 'USDT' || 
                       currency === 'USDT_TRON' || 
                       type === 'trc20' ||
                       event.contractAddress === USDT_CONTRACT

        if (!isUSDT) {
          console.log(`⏭️ Skipping - not USDT (currency: ${currency}, type: ${type})`)
          continue
        }

        // Parse amount (USDT has 6 decimals)
        let amount: number
        if (typeof rawAmount === 'string') {
          amount = parseFloat(rawAmount) / 1000000
        } else {
          amount = rawAmount / 1000000
        }

        if (amount <= 0) {
          console.log('⏭️ Skipping - zero amount')
          continue
        }

        console.log(`💰 USDT Deposit: ${amount} USDT to ${address}`)

        // Find trader by address
        const { data: mapping, error: mappingError } = await supabase
          .from('address_mapping')
          .select('trader_id')
          .eq('address', address)
          .single()

        if (mappingError || !mapping) {
          console.log('❌ Address not found in mapping:', address)
          continue
        }

        const traderId = mapping.trader_id
        console.log(`✅ Found trader: ${traderId}`)

        // Credit trader using stored function
        const { data: result, error: creditError } = await supabase
          .rpc('credit_trader_on_usdt_deposit', {
            p_trader_id: traderId,
            p_usdt_amount: amount,
            p_usdt_rate: usdtRate,
            p_tx_hash: txId,
            p_from_address: counterAddress || 'unknown'
          })

        if (creditError) {
          console.error('❌ Credit error:', creditError)
          continue
        }

        if (!result?.success) {
          console.log('⚠️ Credit result:', result?.error || JSON.stringify(result))
          continue
        }

        console.log(`✅ Deposit processed: ₹${result.inr_amount} credited`)
        console.log(`📊 Balance: ₹${result.old_balance} → ₹${result.new_balance}`)

      } catch (eventError) {
        console.error('Error processing event:', eventError)
      }
    }

    return successResponse()

  } catch (error) {
    console.error('❌ Error processing webhook:', error)
    return successResponse() // Still return 200 to avoid webhook retry
  }
})
