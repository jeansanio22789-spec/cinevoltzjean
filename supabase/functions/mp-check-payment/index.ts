// Polling: cliente verifica se o PIX foi pago.
// Se aprovado, libera acesso IMEDIATAMENTE (sem depender do webhook do MP).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLAN_DAYS: Record<string, number> = {
  "Básico": 30,
  "Padrão": 30,
  "Standard": 30,
  "Premium": 30,
};

type Purchase = {
  id: string;
  user_id: string | null;
  user_email: string | null;
  user_name: string | null;
  plan: string;
  amount: number;
  movie_id: string | null;
  status: string;
  mp_payment_id: string | null;
};

const grantAccess = async (
  admin: ReturnType<typeof createClient>,
  purchase: Purchase,
  paymentId: string,
) => {
  // 1) Marca compra como aprovada (idempotente)
  await admin
    .from("purchases")
    .update({
      status: "approved",
      paid_at: new Date().toISOString(),
    })
    .eq("id", purchase.id);

  if (!purchase.user_id) return;

  // 2a) Compra de TÍTULO INDIVIDUAL → acesso vitalício
  if (purchase.movie_id) {
    await admin.from("user_movie_access").upsert(
      {
        user_id: purchase.user_id,
        movie_id: purchase.movie_id,
        expires_at: null,
      },
      { onConflict: "user_id,movie_id" } as never,
    );

    await admin.from("notifications").insert({
      user_id: purchase.user_id,
      title: "Pagamento aprovado",
      message: "Seu acesso ao título foi liberado.",
      link: `/assistir/${purchase.movie_id}`,
      type: "purchase",
    });
  } else {
    // 2b) Compra de PLANO → ativa/estende assinatura
    const days = PLAN_DAYS[purchase.plan] ?? 30;

    const { data: existing } = await admin
      .from("subscriptions")
      .select("id, expires_at")
      .eq("user_id", purchase.user_id)
      .maybeSingle();

    if (existing) {
      const base =
        existing.expires_at && new Date(existing.expires_at) > new Date()
          ? new Date(existing.expires_at)
          : new Date();
      base.setDate(base.getDate() + days);
      await admin
        .from("subscriptions")
        .update({
          plan: purchase.plan,
          status: "active",
          expires_at: base.toISOString(),
          last_payment_id: paymentId,
        })
        .eq("id", existing.id);
    } else {
      const expires = new Date(Date.now() + days * 86400000).toISOString();
      await admin.from("subscriptions").insert({
        user_id: purchase.user_id,
        plan: purchase.plan,
        status: "active",
        expires_at: expires,
        last_payment_id: paymentId,
      });
    }

    await admin.from("notifications").insert({
      user_id: purchase.user_id,
      title: "Assinatura ativada",
      message: `Seu plano ${purchase.plan} está ativo.`,
      link: `/minha-conta`,
      type: "purchase",
    });
  }

  // 3) Registra transação + auditoria
  await admin.from("transactions").insert({
    user_id: purchase.user_id,
    user_email: purchase.user_email,
    user_name: purchase.user_name,
    plan: purchase.plan,
    amount: purchase.amount,
    method: "PIX",
    status: "Aprovado",
  });

  await admin.from("audit_logs").insert({
    user_id: purchase.user_id,
    user_email: purchase.user_email,
    action: purchase.movie_id ? "movie_access_granted" : "subscription_activated",
    resource_type: purchase.movie_id ? "movie" : "subscription",
    resource_id: purchase.movie_id ?? purchase.user_id,
    description: purchase.movie_id
      ? `Acesso ao título liberado via PIX (R$ ${purchase.amount})`
      : `Plano ${purchase.plan} ativado via PIX (R$ ${purchase.amount})`,
    metadata: { payment_id: paymentId },
  });
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const MP_TOKEN = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN")!;
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { purchase_id } = await req.json();
    if (!purchase_id) throw new Error("purchase_id obrigatório");

    const { data: purchase } = await admin
      .from("purchases")
      .select("*")
      .eq("id", purchase_id)
      .maybeSingle();
    if (!purchase) throw new Error("Compra não encontrada");

    // Já aprovado e processado? devolve direto.
    if (purchase.status === "approved") {
      return new Response(JSON.stringify({ status: "approved" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sem mp_payment_id ainda? devolve status atual.
    if (!purchase.mp_payment_id) {
      return new Response(JSON.stringify({ status: purchase.status }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Consulta MP
    const r = await fetch(
      `https://api.mercadopago.com/v1/payments/${purchase.mp_payment_id}`,
      { headers: { Authorization: `Bearer ${MP_TOKEN}` } },
    );
    const p = await r.json();

    if (r.ok && p.status === "approved") {
      // LIBERA ACESSO AQUI MESMO, sem depender do webhook externo do MP.
      await grantAccess(admin, purchase as Purchase, String(p.id));
      return new Response(JSON.stringify({ status: "approved" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ status: p.status || purchase.status }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
