// Edge function: enrich-movie-metadata
// Recebe um caption (texto) vindo do Telegram e usa Lovable AI pra extrair
// metadados estruturados: título, ano, gênero, sinopse, tipo (filme/série),
// temporada e episódio quando houver.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Você é um especialista em catalogar filmes, séries, animes e doramas.
Recebe o texto bruto da legenda de um vídeo do Telegram e extrai os metadados
no formato definido pela função "extract_movie_metadata".

Regras:
- "title": apenas o nome da obra, sem ano, sem qualidade (1080p, WEB-DL...), sem temporada/episódio.
- "year": ano de lançamento se aparecer no texto, senão null.
- "genre": escolha o gênero principal em PT-BR (Ação, Drama, Comédia, Romance, Terror, Animação, Dorama, Anime, Documentário, Suspense, Ficção Científica, Fantasia).
- "kind": "movie" se for filme único, "series" se for série/dorama/anime com temporadas/episódios.
- "season" e "episode": só preencha se "kind" for "series".
- "synopsis": resumo curto em PT-BR (2-3 frases) baseado no que está no caption. Se não houver descrição, deixe string vazia.
- "original_title": título original (em inglês/coreano/japonês) se aparecer entre parênteses, senão null.
- Nunca invente dados que não estão no caption.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const { caption } = await req.json();
    if (!caption || typeof caption !== "string") {
      throw new Error("Parâmetro 'caption' obrigatório");
    }

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: caption.slice(0, 4000) },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "extract_movie_metadata",
                description: "Retorna os metadados extraídos do caption.",
                parameters: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    original_title: { type: ["string", "null"] },
                    year: { type: ["integer", "null"] },
                    genre: { type: "string" },
                    kind: { type: "string", enum: ["movie", "series"] },
                    season: { type: ["integer", "null"] },
                    episode: { type: ["integer", "null"] },
                    synopsis: { type: "string" },
                  },
                  required: ["title", "genre", "kind", "synopsis"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "extract_movie_metadata" },
          },
        }),
      },
    );

    if (response.status === 429) {
      return new Response(
        JSON.stringify({ error: "Limite de uso da IA atingido. Tente em alguns minutos." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (response.status === 402) {
      return new Response(
        JSON.stringify({ error: "Créditos da IA acabaram. Recarregue em Settings > Workspace > Usage." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!response.ok) {
      const txt = await response.text();
      console.error("AI gateway:", response.status, txt);
      throw new Error(`IA respondeu ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      throw new Error("IA não retornou metadados");
    }
    const metadata = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ ok: true, metadata }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro desconhecido";
    console.error("[enrich-movie-metadata]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
