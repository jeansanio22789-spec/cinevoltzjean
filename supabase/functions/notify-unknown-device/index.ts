// Edge function: avisa todos os admins quando um aparelho desconhecido abre o app.
// Cria uma notificação por admin com link pra Sistema → Crachás NFC.
// Pública (sem JWT) porque o aparelho ainda não está logado.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tag_uid, user_agent } = (await req.json().catch(() => ({}))) as {
      tag_uid?: string;
      user_agent?: string;
    };

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Busca todos admins
    const { data: admins, error: rolesErr } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    if (rolesErr) return json({ ok: false, reason: "roles_error", details: rolesErr.message }, 500);
    if (!admins?.length) return json({ ok: true, notified: 0 });

    const prettyUid = tag_uid
      ? (tag_uid.match(/.{1,2}/g)?.join(":") ?? tag_uid)
      : "desconhecido";
    const ua = (user_agent || "").slice(0, 80);

    const rows = admins.map((a) => ({
      user_id: a.user_id,
      title: "Novo aparelho tentando entrar",
      message: `Crachá ${prettyUid} foi aproximado em um aparelho não cadastrado${ua ? ` (${ua})` : ""}. Aproxime seu crachá no aparelho para liberar.`,
      link: "/admin/sistema",
      type: "security",
    }));

    const { error: insertErr } = await admin.from("notifications").insert(rows);
    if (insertErr) return json({ ok: false, reason: "insert_error", details: insertErr.message }, 500);

    return json({ ok: true, notified: rows.length });
  } catch (e) {
    return json({ ok: false, reason: "exception", details: String(e) }, 500);
  }
});
