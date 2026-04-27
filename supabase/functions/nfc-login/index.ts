// Edge function: troca um UID NFC válido por uma sessão de admin.
// - Procura o crachá usando a mesma normalização/reverso que as RPCs.
// - Confirma que o dono é admin.
// - Gera um magic link (signInWithOtp) e extrai o token_hash.
// - Verifica esse token via verifyOtp pra obter access_token + refresh_token.
// - Devolve a sessão pro front, que chama supabase.auth.setSession().
// Sem isso seria preciso senha — esse é o fluxo único e seguro pra "tap-to-login".
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

const normalize = (s: string) => (s || "").replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
const reverseHex = (h: string) => {
  if (!h || h.length % 2 !== 0) return h;
  let out = "";
  for (let i = h.length - 2; i >= 0; i -= 2) out += h.substring(i, i + 2);
  return out;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tag_uid } = (await req.json().catch(() => ({}))) as { tag_uid?: string };
    if (!tag_uid) return json({ ok: false, reason: "missing_tag" }, 400);

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const uid = normalize(tag_uid);
    const uidRev = reverseHex(uid);

    // Busca todos os crachás (poucos registros) e procura match tolerante.
    const { data: tags, error: tagsErr } = await admin
      .from("admin_nfc_tags")
      .select("user_id, tag_uid");
    if (tagsErr) return json({ ok: false, reason: "db_error", details: tagsErr.message }, 500);

    const match = (tags ?? []).find((t) => {
      const stored = normalize(t.tag_uid);
      return (
        stored === uid ||
        stored === uidRev ||
        uid.includes(stored) ||
        stored.includes(uid)
      );
    });
    if (!match) return json({ ok: false, reason: "unknown_tag" }, 404);

    // Confirma que é admin
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("user_id", match.user_id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ ok: false, reason: "not_admin" }, 403);

    // Pega email pra gerar o magic link
    const { data: prof } = await admin
      .from("profiles")
      .select("email")
      .eq("id", match.user_id)
      .maybeSingle();
    if (!prof?.email) return json({ ok: false, reason: "no_email" }, 500);

    // Gera magic link com token_hash
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: prof.email,
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      return json({ ok: false, reason: "link_failed", details: linkErr?.message }, 500);
    }

    // Verifica o token_hash pra obter access + refresh tokens
    const { data: verified, error: verifyErr } = await admin.auth.verifyOtp({
      type: "magiclink",
      token_hash: linkData.properties.hashed_token,
    });
    if (verifyErr || !verified?.session) {
      return json({ ok: false, reason: "verify_failed", details: verifyErr?.message }, 500);
    }

    // Atualiza last_used_at do crachá
    await admin
      .from("admin_nfc_tags")
      .update({ last_used_at: new Date().toISOString() })
      .eq("user_id", match.user_id);

    return json({
      ok: true,
      session: {
        access_token: verified.session.access_token,
        refresh_token: verified.session.refresh_token,
      },
      email: prof.email,
    });
  } catch (e) {
    return json({ ok: false, reason: "exception", details: String(e) }, 500);
  }
});
