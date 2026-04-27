// Processa pagamento de cartão usando o token gerado pelo Card Brick do Mercado Pago.
// Body:
//   {
//     token: "<card_token>",
//     payment_method_id: "visa" | "master" | ...,
//     installments: number,
//     issuer_id?: string,
//     payer: { email, identification: { type, number } },
//     plan?: string,
//     movie_id?: string
//   }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLANS: Record<string, { amount: number; days: number }> = {
  "Básico":  { amount: 18.90, days: 30 },
  "Padrão":  { amount: 39.90, days: 30 },
  "Premium": { amount: 55.90, days: 30 },
  "Série":   { amount: 10.00, days: 0 },
  "Teste":   { amount: 0.10,  days: 1 },
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

    const body = await req.json().catch(() => ({}));
    const {
      token,
      payment_method_id,
      installments = 1,
      issuer_id,
      payer,
      plan,
      movie_id,
    } = body as {
      token: string;
      payment_method_id: string;
      installments?: number;
      issuer_id?: string;
      payer: { email: string; identification?: { type: string; number: string } };
      plan?: string;
      movie_id?: string;
    };

    if (!token || !payment_method_id || !payer?.email) {
      return new Response(JSON.stringify({ error: "Dados do cartão incompletos" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let amount = 0;
    let label = "";
    let purchasePlan = "";
    if (movie_id) {
      const { data: m } = await admin.from("movies").select("id, title, price").eq("id", movie_id).maybeSingle();
      if (!m) {
        return new Response(JSON.stringify({ error: "Título não encontrado" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      amount = Number(m.price ?? 10) || 10;
      label = `Título: ${m.title}`;
      purchasePlan = `Título: ${m.title}`;
    } else if (plan) {
      const cfg = PLANS[plan];
      if (!cfg) {
        return new Response(JSON.stringify({ error: "Plano inválido" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      amount = cfg.amount;
      label = `Plano ${plan}`;
      purchasePlan = plan;
    } else {
      return new Response(JSON.stringify({ error: "Informe plan ou movie_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user } } = await userClient.auth.getUser();

    const { data: purchase, error: pErr } = await admin
      .from("purchases")
      .insert({
        user_id: user?.id ?? null,
        user_email: user?.email ?? payer.email,
        plan: purchasePlan,
        amount,
        method: "CARD",
        status: "pending",
        movie_id: movie_id ?? null,
      })
      .select().single();
    if (pErr) throw pErr;

    const idemKey = crypto.randomUUID();
    const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MP_TOKEN}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": idemKey,
      },
      body: JSON.stringify({
        transaction_amount: amount,
        token,
        description: label,
        installments: Number(installments) || 1,
        payment_method_id,
        issuer_id,
        payer: {
          email: payer.email,
          identification: payer.identification,
        },
        external_reference: purchase.id,
        notification_url: `${SUPABASE_URL}/functions/v1/mp-webhook?internal_id=${purchase.id}`,
        statement_descriptor: "CINEVOLT",
      }),
    });

    const payment = await mpRes.json();
    if (!mpRes.ok) {
      console.error("MP card error", payment);
      await admin.from("purchases").update({
        status: "rejected",
        metadata: payment,
      }).eq("id", purchase.id);
      return new Response(JSON.stringify({
        error: payment.message || "Pagamento recusado",
        status: payment.status,
        status_detail: payment.status_detail,
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const status = payment.status; // approved | in_process | rejected
    const statusMap: Record<string, string> = {
      approved: "approved",
      in_process: "pending",
      pending: "pending",
      rejected: "rejected",
    };
    const purchaseStatus = statusMap[status] || "pending";

    const paymentTypeMap: Record<string, string> = {
      credit_card: "Cartão de Crédito",
      debit_card: "Cartão de Débito",
    };
    const realMethod = paymentTypeMap[payment.payment_type_id] || "Cartão";

    await admin.from("purchases").update({
      mp_payment_id: String(payment.id),
      status: purchaseStatus,
      method: realMethod,
      paid_at: status === "approved" ? new Date().toISOString() : null,
      metadata: payment,
    }).eq("id", purchase.id);

    // Se aprovou na hora, libera acesso já (webhook é apenas garantia)
    if (status === "approved" && user?.id) {
      if (movie_id) {
        await admin.from("user_movie_access").upsert(
          { user_id: user.id, movie_id, expires_at: null },
          { onConflict: "user_id,movie_id" } as never,
        );
      } else if (plan) {
        const days = PLANS[plan]?.days ?? 30;
        const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
        const { data: existing } = await admin.from("subscriptions")
          .select("id, expires_at").eq("user_id", user.id).maybeSingle();
        if (existing) {
          const base = existing.expires_at && new Date(existing.expires_at) > new Date()
            ? new Date(existing.expires_at) : new Date();
          base.setDate(base.getDate() + days);
          await admin.from("subscriptions").update({
            plan, status: "active", expires_at: base.toISOString(),
            last_payment_id: String(payment.id),
          }).eq("id", existing.id);
        } else {
          await admin.from("subscriptions").insert({
            user_id: user.id, plan, status: "active",
            expires_at: expires, last_payment_id: String(payment.id),
          });
        }
      }

      await admin.from("transactions").insert({
        user_id: user.id,
        user_email: user.email,
        plan: purchasePlan,
        amount,
        method: realMethod,
        status: "Aprovado",
      });
    }

    return new Response(JSON.stringify({
      purchase_id: purchase.id,
      payment_id: payment.id,
      status,
      status_detail: payment.status_detail,
      amount,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("mp-process-card error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
