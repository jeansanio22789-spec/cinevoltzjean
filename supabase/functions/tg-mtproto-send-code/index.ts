// Edge function: envia código MTProto pro telefone
// Passo 1 do login MTProto - usando mtcute
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { BaseTelegramClient, sendCode } from "npm:@mtcute/core@0.29.6";
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
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiId = parseInt(Deno.env.get("TELEGRAM_API_ID") || "0");
    const apiHash = Deno.env.get("TELEGRAM_API_HASH") || "";

    if (!apiId || !apiHash) {
      return new Response(
        JSON.stringify({ error: "TELEGRAM_API_ID/HASH não configurados" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

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
    const phone = String(body.phone || "").trim();
    if (!phone || !phone.startsWith("+")) {
      return new Response(
        JSON.stringify({ error: "Telefone inválido (use formato +5511...)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const storage = new MemoryStorage();
    const tg = new BaseTelegramClient({
      apiId, apiHash, storage,
    });
    await tg.connect();

    const sent = await sendCode(tg, { phone });

    // Exporta sessão temporária pra reusar no signIn
    const tempSession = await tg.exportSession();
    await tg.close();

    await admin.from("mtproto_pending_logins").delete().eq("user_id", userId);
    const { data: pending, error: insertErr } = await admin
      .from("mtproto_pending_logins")
      .insert({
        user_id: userId,
        phone,
        phone_code_hash: (sent as any).phoneCodeHash || (sent as any).phone_code_hash || "",
        temp_session: tempSession,
      })
      .select().single();
    if (insertErr) throw insertErr;

    return new Response(JSON.stringify({ ok: true, pending_id: pending.id }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-code error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
