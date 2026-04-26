// Edge function: confirma o código e salva STRING_SESSION
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { BaseTelegramClient, signIn, checkPassword } from "npm:@mtcute/core@0.29.6";
import { MemoryStorage } from "npm:@mtcute/core@0.29.6/storage/memory.js";

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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;

    const admin = createClient(supabaseUrl, supabaseService);
    const { data: roleRow } = await admin
      .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const pendingId = String(body.pending_id || "");
    const code = String(body.code || "").trim();
    const password = body.password ? String(body.password) : null;

    if (!pendingId || !code) {
      return new Response(
        JSON.stringify({ error: "pending_id e code são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: pending } = await admin
      .from("mtproto_pending_logins").select("*")
      .eq("id", pendingId).eq("user_id", userId).maybeSingle();

    if (!pending) {
      return new Response(JSON.stringify({ error: "Login pendente expirado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const storage = new MemoryStorage();
    const tg = new BaseTelegramClient({ apiId, apiHash, storage });
    await tg.importSession(pending.temp_session);
    await tg.connect();

    try {
      await signIn(tg, {
        phone: pending.phone,
        phoneCode: code,
        phoneCodeHash: pending.phone_code_hash,
      });
    } catch (signInErr: any) {
      const msg = String(signInErr?.message || signInErr);
      if (msg.includes("SESSION_PASSWORD_NEEDED") || msg.includes("PASSWORD")) {
        if (!password) {
          await tg.close();
          return new Response(JSON.stringify({ error: "PASSWORD_REQUIRED" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        await checkPassword(tg, password);
      } else {
        await tg.close();
        throw signInErr;
      }
    }

    const stringSession = await tg.exportSession();
    await tg.close();

    await admin.from("mtproto_sessions").upsert({
      id: 1,
      string_session: stringSession,
      phone: pending.phone,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    });

    await admin.from("mtproto_pending_logins").delete().eq("id", pendingId);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("sign-in error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
