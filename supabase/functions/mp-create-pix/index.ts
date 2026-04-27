// Cria pagamento PIX no Mercado Pago e devolve QR Code para o cliente.
// Suporta dois modos:
//   1) Compra de plano: { plan: "Básico" | "Padrão" | "Premium" }
//   2) Compra de título individual: { movie_id: "<uuid>" } → cobra movies.price
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLANS: Record<string, { amount: number; days: number }> = {
  "Básico":   { amount: 18.90, days: 30 },
  "Padrão":   { amount: 39.90, days: 30 },
  "Premium":  { amount: 55.90, days: 30 },
  "Teste":    { amount: 0.10,  days: 1 },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const MP_TOKEN_RAW = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
    if (!MP_TOKEN_RAW) throw new Error("Token do Mercado Pago não configurado.");

    const MP_TOKEN = MP_TOKEN_RAW.trim().replace(/^["']|["']$/g, "");
    const validPrefix = MP_TOKEN.startsWith("APP_USR-") || MP_TOKEN.startsWith("TEST-");

    if (!MP_TOKEN || MP_TOKEN.length < 40 || !validPrefix) {
      console.error("MP token inválido", {
        length: MP_TOKEN.length,
        prefix: MP_TOKEN.substring(0, 8),
      });
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

    const body = await req.json();
    const { plan, movie_id } = body as { plan?: string; movie_id?: string };

    let amount = 0;
    let label = "";
    let purchasePlan = "";
    let movieRecord: { id: string; title: string; price: number | null } | null = null;

    if (movie_id) {
      const { data: m, error: mErr } = await admin
        .from("movies")
        .select("id, title, price")
        .eq("id", movie_id)
        .maybeSingle();
      if (mErr || !m) {
        return new Response(JSON.stringify({ error: "Título não encontrado" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      movieRecord = { id: m.id as string, title: m.title as string, price: m.price as number | null };
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

    // Usuário (opcional — pode pagar sem login para planos; obrigatório p/ título individual)
    const { data: { user } } = await userClient.auth.getUser();
    if (movie_id && !user) {
      return new Response(JSON.stringify({ error: "Faça login para comprar um título individual." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cria registro de compra pendente
    const { data: purchase, error: pErr } = await admin
      .from("purchases")
      .insert({
        user_id: user?.id ?? null,
        user_email: user?.email ?? null,
        plan: purchasePlan,
        amount,
        method: "PIX",
        status: "pending",
        movie_id: movie_id ?? null,
      })
      .select()
      .single();
    if (pErr) throw pErr;

    // Webhook URL (esta mesma função base)
    const baseUrl = `${SUPABASE_URL}/functions/v1`;
    const notifUrl = `${baseUrl}/mp-webhook?internal_id=${purchase.id}`;

    // Cria pagamento PIX no Mercado Pago
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
        description: `${label} - Cinevolt`,
        payment_method_id: "pix",
        notification_url: notifUrl,
        external_reference: purchase.id,
        payer: {
          email: user?.email || "cliente@cinevolt.app",
        },
      }),
    });

    const mpData = await mpRes.json();
    if (!mpRes.ok) {
      console.error("MP error", mpData);
      throw new Error(mpData.message || "Erro Mercado Pago");
    }

    const qr = mpData?.point_of_interaction?.transaction_data;

    await admin.from("purchases").update({
      mp_payment_id: String(mpData.id),
      mp_qr_code: qr?.qr_code ?? null,
      mp_qr_code_base64: qr?.qr_code_base64 ?? null,
      mp_ticket_url: qr?.ticket_url ?? null,
      metadata: mpData,
    }).eq("id", purchase.id);

    return new Response(JSON.stringify({
      purchase_id: purchase.id,
      payment_id: mpData.id,
      qr_code: qr?.qr_code,
      qr_code_base64: qr?.qr_code_base64,
      ticket_url: qr?.ticket_url,
      amount,
      plan: purchasePlan,
      movie: movieRecord ? { id: movieRecord.id, title: movieRecord.title } : null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
