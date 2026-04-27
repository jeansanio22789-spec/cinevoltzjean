// Edge function: troca um UID NFC válido por uma sessão de admin (tap-to-login).
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
    console.log("[nfc-login] received", { tag_uid });
    if (!tag_uid) return json({ ok: false, reason: "missing_tag" }, 200);

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const uid = normalize(tag_uid);
    const uidRev = reverseHex(uid);

    const { data: tags, error: tagsErr } = await admin
      .from("admin_nfc_tags")
      .select("user_id, tag_uid");
    if (tagsErr) {
      console.error("[nfc-login] db_error", tagsErr);
      return json({ ok: false, reason: "db_error", details: tagsErr.message }, 200);
    }

    const match = (tags ?? []).find((t) => {
      const stored = normalize(t.tag_uid);
      return stored === uid || stored === uidRev || uid.includes(stored) || stored.includes(uid);
    });
    if (!match) {
      console.log("[nfc-login] unknown_tag", { uid, total: tags?.length });
      return json({ ok: false, reason: "unknown_tag" }, 200);
    }

    const { data: roleRow } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("user_id", match.user_id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ ok: false, reason: "not_admin" }, 200);

    const { data: prof } = await admin
      .from("profiles")
      .select("email")
      .eq("id", match.user_id)
      .maybeSingle();
    if (!prof?.email) return json({ ok: false, reason: "no_email" }, 200);

    // Gera magic link (precisa hashed_token + email_otp pra verifyOtp)
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: prof.email,
    });
    console.log("[nfc-login] generateLink", {
      hasData: !!linkData,
      hasProps: !!linkData?.properties,
      hasHashed: !!linkData?.properties?.hashed_token,
      hasOtp: !!linkData?.properties?.email_otp,
      err: linkErr?.message,
    });
    if (linkErr || !linkData?.properties) {
      return json({ ok: false, reason: "link_failed", details: linkErr?.message }, 200);
    }

    // Tenta verifyOtp pelo email_otp (mais confiável que token_hash em algumas versões)
    const otp = linkData.properties.email_otp;
    let session: { access_token: string; refresh_token: string } | null = null;

    if (otp) {
      const { data: verified, error: verifyErr } = await admin.auth.verifyOtp({
        type: "magiclink",
        email: prof.email,
        token: otp,
      });
      console.log("[nfc-login] verifyOtp(email_otp)", {
        ok: !!verified?.session,
        err: verifyErr?.message,
      });
      if (verified?.session) {
        session = {
          access_token: verified.session.access_token,
          refresh_token: verified.session.refresh_token,
        };
      }
    }

    // Fallback: tenta hashed_token
    if (!session && linkData.properties.hashed_token) {
      const { data: verified, error: verifyErr } = await admin.auth.verifyOtp({
        type: "magiclink",
        token_hash: linkData.properties.hashed_token,
      });
      console.log("[nfc-login] verifyOtp(token_hash)", {
        ok: !!verified?.session,
        err: verifyErr?.message,
      });
      if (verified?.session) {
        session = {
          access_token: verified.session.access_token,
          refresh_token: verified.session.refresh_token,
        };
      }
    }

    if (!session) {
      return json({ ok: false, reason: "verify_failed" }, 200);
    }

    await admin
      .from("admin_nfc_tags")
      .update({ last_used_at: new Date().toISOString() })
      .eq("user_id", match.user_id);

    return json({ ok: true, session, email: prof.email });
  } catch (e) {
    console.error("[nfc-login] exception", e);
    return json({ ok: false, reason: "exception", details: String(e) }, 200);
  }
});
