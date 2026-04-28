// Lista vídeos do Google Drive conectado.
// Suporta filtro por pasta (folderId) e busca por nome.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_drive/drive/v3";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GDRIVE_KEY = Deno.env.get("GOOGLE_DRIVE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY ausente");
    if (!GDRIVE_KEY) throw new Error("GOOGLE_DRIVE_API_KEY ausente — conecte o Google Drive em Connectors");
    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Supabase ausente");

    // Verifica admin
    const auth = req.headers.get("authorization");
    if (!auth) return new Response(JSON.stringify({ error: "no auth" }), { status: 401, headers: corsHeaders });
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return new Response(JSON.stringify({ error: "invalid auth" }), { status: 401, headers: corsHeaders });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    if (!roles?.some((r) => r.role === "admin")) {
      return new Response(JSON.stringify({ error: "not admin" }), { status: 403, headers: corsHeaders });
    }

    const url = new URL(req.url);
    let folderId = url.searchParams.get("folderId");
    let search = url.searchParams.get("q");
    let pageToken = url.searchParams.get("pageToken");

    // Suporta também body JSON (supabase.functions.invoke)
    if (req.method === "POST") {
      try {
        const body = await req.json();
        folderId = body.folderId ?? folderId;
        search = body.q ?? search;
        pageToken = body.pageToken ?? pageToken;
      } catch (_) { /* body opcional */ }
    }

    // Filtro: vídeos + opcional pasta + opcional busca
    const queryParts: string[] = [
      "mimeType contains 'video/'",
      "trashed = false",
    ];
    if (folderId) queryParts.push(`'${folderId}' in parents`);
    if (search) queryParts.push(`name contains '${search.replace(/'/g, "\\'")}'`);

    const params = new URLSearchParams({
      q: queryParts.join(" and "),
      fields: "nextPageToken,files(id,name,mimeType,size,thumbnailLink,videoMediaMetadata,createdTime)",
      pageSize: "50",
      orderBy: "modifiedTime desc",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const resp = await fetch(`${GATEWAY_URL}/files?${params}`, {
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": GDRIVE_KEY,
      },
    });
    const data = await resp.json();
    if (!resp.ok) {
      return new Response(JSON.stringify({ error: data }), {
        status: resp.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
