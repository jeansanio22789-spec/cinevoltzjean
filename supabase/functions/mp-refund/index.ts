// Reembolsa um pagamento via Mercado Pago e cancela o acesso/assinatura do usuário.
// Apenas admin pode chamar.
// Body: { purchase_id: "<uuid>" }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const MP_TOKEN_RAW = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
    if (!MP_TOKEN_RAW) throw new Error("Token do Mercado Pago não configurado.");
    const MP_TOKEN = MP_TOKEN_RAW.trim().replace(/^["']|["']$/g, "");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const auth = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1. Verifica que quem chamou está autenticado e é admin
    const { data: { user }, error: uErr } = await userClient.auth.getUser();
    if (uErr || !user) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roleRow } = await admin.from("user_roles")
      .select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Apenas admin pode reembolsar" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { purchase_id } = await req.json().catch(() => ({}));
    if (!purchase_id) {
      return new Response(JSON.stringify({ error: "purchase_id é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Carrega a compra
    const { data: purchase, error: pErr } = await admin
      .from("purchases").select("*").eq("id", purchase_id).maybeSingle();
    if (pErr || !purchase) {
      return new Response(JSON.stringify({ error: "Compra não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (purchase.status !== "approved") {
      return new Response(JSON.stringify({ error: "Só é possível reembolsar pagamentos aprovados" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!purchase.mp_payment_id) {
      return new Response(JSON.stringify({ error: "Compra sem ID de pagamento do Mercado Pago" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Chama API de reembolso do Mercado Pago (reembolso total)
    const idemKey = crypto.randomUUID();
    const mpRes = await fetch(
      `https://api.mercadopago.com/v1/payments/${purchase.mp_payment_id}/refunds`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${MP_TOKEN}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": idemKey,
        },
        body: JSON.stringify({}), // sem amount = reembolso total
      }
    );
    const refund = await mpRes.json();
    if (!mpRes.ok) {
      console.error("MP refund error", refund);
      return new Response(JSON.stringify({
        error: refund.message || "Erro ao reembolsar no Mercado Pago",
        details: refund,
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 4. Atualiza compra como reembolsada
    await admin.from("purchases").update({
      status: "refunded",
      metadata: { ...(purchase.metadata as object || {}), refund },
    }).eq("id", purchase.id);

    // 5. Revoga acesso do usuário
    if (purchase.user_id) {
      if (purchase.movie_id) {
        // Compra de título individual → remove acesso
        await admin.from("user_movie_access")
          .delete()
          .eq("user_id", purchase.user_id)
          .eq("movie_id", purchase.movie_id);
      } else {
        // Compra de plano → cancela assinatura
        await admin.from("subscriptions")
          .update({ status: "cancelled", expires_at: new Date().toISOString() })
          .eq("user_id", purchase.user_id);
      }

      // Notificação pra o cliente
      await admin.from("notifications").insert({
        user_id: purchase.user_id,
        title: "Pagamento reembolsado",
        message: `Sua compra de R$ ${Number(purchase.amount).toFixed(2)} (${purchase.plan}) foi reembolsada.`,
        type: "refund",
      });
    }

    // 6. Audit log
    await admin.from("audit_logs").insert({
      user_id: user.id,
      user_email: user.email,
      action: "purchase_refunded",
      resource_type: "purchase",
      resource_id: purchase.id,
      description: `Reembolso de R$ ${Number(purchase.amount).toFixed(2)} (${purchase.plan}) para ${purchase.user_email}`,
      metadata: { refund_id: refund.id, payment_id: purchase.mp_payment_id },
    });

    return new Response(JSON.stringify({
      ok: true,
      refund_id: refund.id,
      amount: refund.amount,
      status: refund.status,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("mp-refund error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
