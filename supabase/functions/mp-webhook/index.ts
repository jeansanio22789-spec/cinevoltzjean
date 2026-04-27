// Webhook do Mercado Pago: recebe notificação de pagamento.
// - Plano → ativa/estende assinatura
// - Compra de título individual → grava em user_movie_access (acesso vitalício)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLAN_DAYS: Record<string, number> = {
  "Básico": 30, "Padrão": 30, "Premium": 30, "Teste": 1,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const MP_TOKEN = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
    if (!MP_TOKEN) throw new Error("MP token missing");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const url = new URL(req.url);
    let paymentId =
      url.searchParams.get("data.id") ||
      url.searchParams.get("id");

    // Mercado Pago também envia no body
    if (!paymentId) {
      try {
        const body = await req.json();
        paymentId = body?.data?.id || body?.id;
      } catch { /* sem body */ }
    }

    if (!paymentId) {
      return new Response("ok", { headers: corsHeaders });
    }

    // Consultar pagamento no MP
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { "Authorization": `Bearer ${MP_TOKEN}` },
    });
    const payment = await mpRes.json();
    if (!mpRes.ok) {
      console.error("MP fetch failed", payment);
      return new Response("ok", { headers: corsHeaders });
    }

    const externalRef = payment.external_reference;
    const status = payment.status; // approved | pending | rejected | cancelled | refunded

    const statusMap: Record<string, string> = {
      approved: "approved",
      pending: "pending",
      in_process: "pending",
      rejected: "rejected",
      cancelled: "cancelled",
      refunded: "refunded",
    };
    const purchaseStatus = statusMap[status] || "pending";

    // Detecta o método real usado pelo cliente (PIX, cartão, wallet, etc.)
    const paymentTypeMap: Record<string, string> = {
      credit_card: "Cartão de Crédito",
      debit_card: "Cartão de Débito",
      ticket: "Boleto",
      atm: "Caixa Eletrônico",
      bank_transfer: "PIX",
      account_money: "Mercado Pago Wallet",
      digital_wallet: "Carteira Digital",
    };
    const realMethod =
      payment.payment_method_id === "pix"
        ? "PIX"
        : paymentTypeMap[payment.payment_type_id] || payment.payment_type_id || "PIX";

    // Atualizar compra
    const { data: purchase } = await admin.from("purchases")
      .update({
        status: purchaseStatus,
        method: realMethod,
        paid_at: status === "approved" ? new Date().toISOString() : null,
        metadata: payment,
      })
      .eq("id", externalRef)
      .select()
      .single();

    if (purchase && status === "approved" && purchase.user_id) {
      // ── Compra de TÍTULO INDIVIDUAL ────────────────────────────────
      if (purchase.movie_id) {
        await admin.from("user_movie_access").upsert(
          {
            user_id: purchase.user_id,
            movie_id: purchase.movie_id,
            expires_at: null, // vitalício
          },
          { onConflict: "user_id,movie_id" } as never,
        );

        await admin.from("transactions").insert({
          user_id: purchase.user_id,
          user_email: purchase.user_email,
          user_name: purchase.user_name,
          plan: purchase.plan,
          amount: purchase.amount,
          method: realMethod,
          status: "Aprovado",
        });

        await admin.from("audit_logs").insert({
          user_id: purchase.user_id,
          user_email: purchase.user_email,
          action: "movie_access_granted",
          resource_type: "movie",
          resource_id: purchase.movie_id,
          description: `Acesso ao título liberado via PIX (R$ ${purchase.amount})`,
          metadata: { payment_id: payment.id },
        });

        // Notificação na sininho
        await admin.from("notifications").insert({
          user_id: purchase.user_id,
          title: "Pagamento aprovado",
          message: `Seu acesso ao título foi liberado.`,
          link: `/assistir/${purchase.movie_id}`,
          type: "purchase",
        });
      } else {
        // ── Compra de PLANO ──────────────────────────────────────────
        const days = PLAN_DAYS[purchase.plan] ?? 30;
        const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

        const { data: existing } = await admin.from("subscriptions")
          .select("id, expires_at, status")
          .eq("user_id", purchase.user_id)
          .maybeSingle();

        if (existing) {
          const base = existing.expires_at && new Date(existing.expires_at) > new Date()
            ? new Date(existing.expires_at)
            : new Date();
          base.setDate(base.getDate() + days);
          await admin.from("subscriptions").update({
            plan: purchase.plan,
            status: "active",
            expires_at: base.toISOString(),
            last_payment_id: String(payment.id),
          }).eq("id", existing.id);
        } else {
          await admin.from("subscriptions").insert({
            user_id: purchase.user_id,
            plan: purchase.plan,
            status: "active",
            expires_at: expires,
            last_payment_id: String(payment.id),
          });
        }

        await admin.from("transactions").insert({
          user_id: purchase.user_id,
          user_email: purchase.user_email,
          user_name: purchase.user_name,
          plan: purchase.plan,
          amount: purchase.amount,
          method: realMethod,
          status: "Aprovado",
        });

        await admin.from("audit_logs").insert({
          user_id: purchase.user_id,
          user_email: purchase.user_email,
          action: "subscription_activated",
          resource_type: "subscription",
          resource_id: purchase.user_id,
          description: `Plano ${purchase.plan} ativado via PIX (R$ ${purchase.amount})`,
          metadata: { payment_id: payment.id },
        });
      }
    }

    return new Response("ok", { headers: corsHeaders });
  } catch (e) {
    console.error("webhook error", e);
    return new Response("ok", { headers: corsHeaders }); // sempre 200 pro MP não retentar
  }
});
