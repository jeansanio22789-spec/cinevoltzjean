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

    // Limpa entradas
    folderId = folderId?.trim() || null;
    search = search?.trim() || null;
    // Se vier um link inteiro de pasta, extrai o ID
    if (folderId) {
      const m = folderId.match(/\/folders\/([\w-]+)/);
      if (m) folderId = m[1];
      // Valida que é um ID válido do Drive (letras/números/_/-, mín 10 chars)
      // Evita enviar "." ou lixo que faz a API retornar "File not found: ."
      if (!/^[\w-]{10,}$/.test(folderId)) {
        return new Response(
          JSON.stringify({
            error: `folderId inválido: "${folderId}". Cole o link completo da pasta do Drive (ex: https://drive.google.com/drive/folders/ABC123...) ou deixe vazio.`,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Helper: lista arquivos do Drive com query montada
    const listPage = async (q: string, pageToken?: string | null) => {
      const params = new URLSearchParams();
      params.set("q", q);
      params.set("fields", "nextPageToken,files(id,name,mimeType,size,thumbnailLink,videoMediaMetadata,createdTime,parents)");
      params.set("pageSize", "1000");
      params.set("orderBy", "modifiedTime desc");
      params.set("supportsAllDrives", "true");
      params.set("includeItemsFromAllDrives", "true");
      if (pageToken && pageToken.trim()) params.set("pageToken", pageToken);

      const resp = await fetch(`${GATEWAY_URL}/files?${params}`, {
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": GDRIVE_KEY,
        },
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(`Drive list: ${JSON.stringify(json)}`);
      return json as { files?: any[]; nextPageToken?: string };
    };

    // Lista TUDO de uma pasta (paginando)
    const listAllInParent = async (parent: string) => {
      const results: any[] = [];
      let token: string | null = null;
      do {
        const escaped = parent.replace(/'/g, "\\'");
        const q = `'${escaped}' in parents and trashed = false`;
        const page = await listPage(q, token);
        results.push(...(page.files || []));
        token = page.nextPageToken || null;
      } while (token);
      return results;
    };

    let allFiles: any[] = [];

    if (folderId) {
      // Walk recursivo: pasta principal + subpastas
      const visited = new Set<string>();
      const stack: string[] = [folderId];
      while (stack.length) {
        const current = stack.pop()!;
        if (visited.has(current)) continue;
        visited.add(current);
        const items = await listAllInParent(current);
        for (const f of items) {
          if (f.mimeType === "application/vnd.google-apps.folder") {
            stack.push(f.id);
          } else if (typeof f.mimeType === "string" && f.mimeType.startsWith("video/")) {
            allFiles.push(f);
          }
        }
        // Limite de segurança pra não estourar tempo de execução
        if (visited.size > 200) break;
      }

      // Aplica filtro de busca por nome (client-side, case-insensitive)
      if (search) {
        const needle = search.toLowerCase();
        allFiles = allFiles.filter((f) => String(f.name || "").toLowerCase().includes(needle));
      }
    } else {
      // Sem pasta: usa query global de vídeos
      const queryParts = ["mimeType contains 'video/'", "trashed = false"];
      if (search) queryParts.push(`name contains '${search.replace(/'/g, "\\'")}'`);
      const page = await listPage(queryParts.join(" and "), pageToken);
      allFiles = page.files || [];
    }

    return new Response(JSON.stringify({ files: allFiles }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
