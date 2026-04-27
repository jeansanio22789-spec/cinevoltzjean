// Cria preferência de Checkout Pro do Mercado Pago.
// Permite pagar com Cartão de Crédito/Débito, Mercado Pago Wallet e PIX,
// tudo numa única página hospedada pelo MP — não precisa SDK do cliente.
//
// Body:
//   { plan: "Básico" | "Padrão" | "Premium" | "Série" } OU { movie_id: "<uuid>" }
//   methods?: "card" | "wallet" | "all" (default "all")
//
// Retorna: { purchase_id, init_point, sandbox_init_point, amount }
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
    const validPrefix = MP_TOKEN.startsWith("APP_USR-") || MP_TOKEN.startsWith("TEST-");
    if (!MP_TOKEN || MP_TOKEN.length < 40 || !validPrefix) {
      throw new Error("O token do Mercado Pago salvo está inválido. Cadastre o Access Token correto em vez de Client Secret ou Public Key.");
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const auth = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    const { plan, movie_id, methods = "all", origin } = body as {
      plan?: string;
      movie_id?: string;
      methods?: "card" | "wallet" | "all";
      origin?: string;
    };

    let amount = 0;
    let label = "";
    let purchasePlan = "";

    if (movie_id) {
      const { data: m, error: mErr } = await admin
        .from("movies").select("id, title, price").eq("id", movie_id).maybeSingle();
      if (mErr || !m) {
        return new Response(JSON.stringify({ error: "Título não encontrado" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      amount = Number(m.price ?? 10);
      if (amount <= 0) amount = 10;
      label = `Título: ${m.title}`;
      purchasePlan = `Título: ${m.title}`;
    } else if (plan) {
      const planCfg = PLANS[plan];
      if (!planCfg) {
        return new Response(JSON.stringify({ error: "Plano inválido" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      amount = planCfg.amount;
      label = `Plano ${plan}`;
      purchasePlan = plan;
    } else {
      return new Response(JSON.stringify({ error: "Informe plan ou movie_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user } } = await userClient.auth.getUser();
    if (movie_id && !user) {
      return new Response(JSON.stringify({ error: "Faça login para comprar." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cria registro de compra pendente
    const methodLabel = methods === "card" ? "CARD" : methods === "wallet" ? "WALLET" : "CHECKOUT";
    const { data: purchase, error: pErr } = await admin
      .from("purchases")
      .insert({
        user_id: user?.id ?? null,
        user_email: user?.email ?? null,
        plan: purchasePlan,
        amount,
        method: methodLabel,
        status: "pending",
        movie_id: movie_id ?? null,
      })
      .select().single();
    if (pErr) throw pErr;

    // Restrições de método de pagamento:
    // "card"   → só cartão (exclui pix e wallet)
    // "wallet" → só Mercado Pago Wallet (exclui cartão e pix)
    // "all"    → libera tudo (PIX + cartão + wallet)
    let excluded_payment_types: { id: string }[] = [];
    let excluded_payment_methods: { id: string }[] = [];
    if (methods === "card") {
      excluded_payment_types = [{ id: "ticket" }, { id: "atm" }];
      excluded_payment_methods = [{ id: "pix" }];
    } else if (methods === "wallet") {
      // Força só MP wallet
      excluded_payment_types = [
        { id: "credit_card" }, { id: "debit_card" },
        { id: "ticket" }, { id: "atm" },
      ];
      excluded_payment_methods = [{ id: "pix" }];
    }

    const baseUrl = `${SUPABASE_URL}/functions/v1`;
    const notifUrl = `${baseUrl}/mp-webhook?internal_id=${purchase.id}`;
    const backOrigin = origin || req.headers.get("origin") || "https://cinevoltzjean.lovable.app";

    const idemKey = crypto.randomUUID();
    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MP_TOKEN}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": idemKey,
      },
      body: JSON.stringify({
        items: [{
          id: purchase.id,
          title: label,
          quantity: 1,
          currency_id: "BRL",
          unit_price: amount,
        }],
        payer: user?.email ? { email: user.email } : undefined,
        external_reference: purchase.id,
        notification_url: notifUrl,
        back_urls: {
          success: `${backOrigin}/minha-conta?pago=1`,
          failure: `${backOrigin}/planos?erro=1`,
          pending: `${backOrigin}/minha-conta?pendente=1`,
        },
        auto_return: "approved",
        payment_methods: {
          excluded_payment_types,
          excluded_payment_methods,
          installments: 12,
        },
        statement_descriptor: "CINEVOLT",
      }),
    });

    const mpData = await mpRes.json();
    if (!mpRes.ok) {
      console.error("MP checkout error", mpData);
      throw new Error(mpData.message || "Erro Mercado Pago");
    }

    await admin.from("purchases").update({
      mp_payment_id: String(mpData.id),
      mp_ticket_url: mpData.init_point ?? null,
      metadata: mpData,
    }).eq("id", purchase.id);

    return new Response(JSON.stringify({
      purchase_id: purchase.id,
      preference_id: mpData.id,
      init_point: mpData.init_point,
      sandbox_init_point: mpData.sandbox_init_point,
      amount,
      plan: purchasePlan,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
