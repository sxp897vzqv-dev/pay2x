/**
 * Update UPI Geo - Fetch bank location from IFSC for UPI pool
 * 
 * POST /update-upi-geo
 * Body: { upiPoolId: string, ifsc: string }
 * 
 * Or bulk update all UPIs that have IFSC in saved_banks:
 * POST /update-upi-geo
 * Body: { bulk: true }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { getBranchFromIFSC } from '../_shared/geo.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const body = await req.json();

    // Bulk update
    if (body.bulk) {
      // Get all UPIs without geo that have matching saved_banks
      const { data: upis } = await supabase
        .from('upi_pool')
        .select('id, upi_id, trader_id')
        .is('bank_city', null);

      if (!upis?.length) {
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'No UPIs need geo update',
          updated: 0 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let updated = 0;
      const results: any[] = [];

      for (const upi of upis) {
        // Find saved bank for this trader with IFSC
        const { data: savedBank } = await supabase
          .from('saved_banks')
          .select('ifsc')
          .eq('trader_id', upi.trader_id)
          .not('ifsc', 'is', null)
          .limit(1)
          .single();

        if (savedBank?.ifsc) {
          const branch = await getBranchFromIFSC(savedBank.ifsc);
          
          if (branch) {
            await supabase
              .from('upi_pool')
              .update({
                bank_city: branch.city,
                bank_state: branch.state,
                bank_branch: branch.branch,
                bank_ifsc: savedBank.ifsc,
              })
              .eq('id', upi.id);

            updated++;
            results.push({
              upiId: upi.upi_id,
              city: branch.city,
              state: branch.state,
            });
          }
        }

        // Rate limit: 1 req/sec for ip-api
        await new Promise(r => setTimeout(r, 100));
      }

      return new Response(JSON.stringify({ 
        success: true, 
        updated,
        total: upis.length,
        results 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Single update
    const { upiPoolId, ifsc } = body;

    if (!upiPoolId || !ifsc) {
      return new Response(JSON.stringify({ 
        error: 'upiPoolId and ifsc required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const branch = await getBranchFromIFSC(ifsc);

    if (!branch) {
      return new Response(JSON.stringify({ 
        error: 'Invalid IFSC or lookup failed' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await supabase
      .from('upi_pool')
      .update({
        bank_city: branch.city,
        bank_state: branch.state,
        bank_branch: branch.branch,
        bank_ifsc: ifsc,
      })
      .eq('id', upiPoolId);

    return new Response(JSON.stringify({ 
      success: true,
      upiPoolId,
      bank: branch.bank,
      branch: branch.branch,
      city: branch.city,
      state: branch.state,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
