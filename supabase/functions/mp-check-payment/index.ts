// Polling: cliente verifica se o PIX foi pago
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const MP_TOKEN = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN")!;
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { purchase_id } = await req.json();
    if (!purchase_id) throw new Error("purchase_id obrigatório");

    const { data: purchase } = await admin.from("purchases")
      .select("*").eq("id", purchase_id).maybeSingle();
    if (!purchase) throw new Error("Compra não encontrada");

    // Se já aprovado no DB, devolve
    if (purchase.status === "approved") {
      return new Response(JSON.stringify({ status: "approved" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Caso contrário, consulta MP diretamente
    if (purchase.mp_payment_id) {
      const r = await fetch(`https://api.mercadopago.com/v1/payments/${purchase.mp_payment_id}`, {
        headers: { "Authorization": `Bearer ${MP_TOKEN}` },
      });
      const p = await r.json();
      if (r.ok && p.status === "approved") {
        // Dispara o webhook lógicamente: chama internamente
        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/mp-webhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: { id: purchase.mp_payment_id } }),
        });
        return new Response(JSON.stringify({ status: "approved" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ status: p.status || "pending" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ status: purchase.status }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
