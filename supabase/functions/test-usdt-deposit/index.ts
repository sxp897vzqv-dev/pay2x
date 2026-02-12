import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

/**
 * TEST USDT DEPOSIT
 * Simulates a USDT deposit for testing WITHOUT real crypto
 * 
 * Usage:
 * POST /test-usdt-deposit
 * Body: { "traderId": "uuid", "amount": 100 }
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { traderId, amount = 100 } = await req.json()

    if (!traderId) {
      return new Response(
        JSON.stringify({ success: false, error: 'traderId required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get trader
    const { data: trader, error: traderError } = await supabase
      .from('traders')
      .select('id, name, balance, usdt_deposit_address')
      .eq('id', traderId)
      .single()

    if (traderError || !trader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Trader not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get USDT rate
    const { data: config } = await supabase
      .from('tatum_config')
      .select('default_usdt_rate')
      .eq('id', 'main')
      .single()

    const usdtRate = config?.default_usdt_rate || 92
    const usdtAmount = parseFloat(amount)
    const inrAmount = Math.round(usdtAmount * usdtRate)

    // Generate fake tx hash
    const fakeTxHash = 'TEST_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10)
    const fakeAddress = trader.usdt_deposit_address || 'T_TEST_ADDRESS'

    const oldBalance = parseFloat(trader.balance) || 0
    const newBalance = oldBalance + inrAmount

    // Update trader balance
    const { error: updateError } = await supabase
      .from('traders')
      .update({
        balance: newBalance,
        last_deposit_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', traderId)

    if (updateError) {
      throw new Error('Failed to update balance: ' + updateError.message)
    }

    // Create transaction record
    const { error: txError } = await supabase
      .from('crypto_transactions')
      .insert({
        trader_id: traderId,
        type: 'deposit',
        usdt_amount: usdtAmount,
        usdt_rate: usdtRate,
        inr_amount: inrAmount,
        tx_hash: fakeTxHash,
        from_address: fakeAddress,
        status: 'completed',
        auto_verified: true,
        description: `[TEST] USDT Deposit - ${usdtAmount} USDT @ ₹${usdtRate} = ₹${inrAmount}`
      })

    if (txError) {
      console.error('Transaction insert error:', txError)
    }

    // Create sweep queue entry (optional - to test sweep)
    await supabase
      .from('sweep_queue')
      .insert({
        trader_id: traderId,
        from_address: fakeAddress,
        amount: usdtAmount,
        tx_hash: fakeTxHash,
        status: 'pending'
      })

    // Log to admin
    await supabase
      .from('admin_logs')
      .insert({
        action: 'test_usdt_deposit',
        category: 'testing',
        entity_type: 'trader',
        entity_id: traderId,
        details: { usdt_amount: usdtAmount, inr_amount: inrAmount, tx_hash: fakeTxHash },
        balance_before: oldBalance,
        balance_after: newBalance,
        severity: 'info',
        source: 'test'
      })

    return new Response(
      JSON.stringify({
        success: true,
        message: '✅ Test deposit simulated!',
        trader: trader.name,
        usdt_amount: usdtAmount,
        usdt_rate: usdtRate,
        inr_credited: inrAmount,
        old_balance: oldBalance,
        new_balance: newBalance,
        tx_hash: fakeTxHash
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
