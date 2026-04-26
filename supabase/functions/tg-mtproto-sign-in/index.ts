// Edge function: confirma o código e salva STRING_SESSION
// Passo 2 do login MTProto
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { TelegramClient } from "https://deno.land/x/grm@0.8.2/mod.ts";
import { StringSession } from "https://deno.land/x/grm@0.8.2/sessions/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiId = parseInt(Deno.env.get("TELEGRAM_API_ID") || "0");
    const apiHash = Deno.env.get("TELEGRAM_API_HASH") || "";

    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims } = await userClient.auth.getClaims(token);
    if (!claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;

    const admin = createClient(supabaseUrl, supabaseService);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const pendingId = String(body.pending_id || "");
    const code = String(body.code || "").trim();
    const password = body.password ? String(body.password) : null;

    if (!pendingId || !code) {
      return new Response(
        JSON.stringify({ error: "pending_id e code são obrigatórios" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: pending } = await admin
      .from("mtproto_pending_logins")
      .select("*")
      .eq("id", pendingId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!pending) {
      return new Response(
        JSON.stringify({ error: "Login pendente não encontrado ou expirado" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const session = new StringSession(pending.temp_session || "");
    const client = new TelegramClient(session, apiId, apiHash, {
      connectionRetries: 3,
    });
    await client.connect();

    try {
      await client.invoke({
        _: "auth.signIn",
        phone_number: pending.phone,
        phone_code_hash: pending.phone_code_hash,
        phone_code: code,
      } as any);
    } catch (signInErr: any) {
      const msg = String(signInErr?.message || signInErr);
      // Se exigir senha 2FA
      if (msg.includes("SESSION_PASSWORD_NEEDED")) {
        if (!password) {
          await client.disconnect();
          return new Response(
            JSON.stringify({ error: "PASSWORD_REQUIRED" }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
        await client.signInWithPassword(
          { apiId, apiHash },
          { password, onError: (e) => { throw e; } },
        );
      } else {
        await client.disconnect();
        throw signInErr;
      }
    }

    const stringSession = session.save();
    await client.disconnect();

    // Salva sessão única
    await admin
      .from("mtproto_sessions")
      .upsert({
        id: 1,
        string_session: stringSession,
        phone: pending.phone,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      });

    // Limpa pendente
    await admin
      .from("mtproto_pending_logins")
      .delete()
      .eq("id", pendingId);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("sign-in error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Erro desconhecido",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
