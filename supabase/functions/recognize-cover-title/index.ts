// Edge function: recognize-cover-title
// Recebe uma imagem (capa de filme/série) em base64 e usa Lovable AI com visão
// (Gemini) pra LER o título escrito na própria arte e devolver só o nome.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Você analisa capas (pôsteres) de filmes, séries, animes e doramas.
Sua tarefa: LER o que está escrito na imagem e devolver o título e a faixa de áudio.

Regras:
- "title": apenas o nome principal da obra como aparece na capa (em qualquer idioma).
  Sem ano, sem "Temporada 1", sem "S01E02", sem "1080p", sem nome do estúdio.
  NUNCA inclua no título palavras como "Dublado", "Legendado", "Dual", "DUB", "LEG",
  "Nacional", "PT-BR", "SUB" — essas informações vão SOMENTE no campo "audio".
  O título deve ser só o nome do filme/série, limpo.
- "original_title": se houver dois títulos visíveis (ex.: original em japonês + traduzido),
  coloque o original aqui. Senão null.
- "audio": leia se a capa indica a faixa de áudio. Procure por selos/textos como:
  "DUBLADO", "DUB", "NACIONAL", "PT-BR", "PORTUGUÊS" → "Dublado".
  "LEGENDADO", "LEG", "SUB", "SUBTITLED" → "Legendado".
  "DUAL", "DUAL ÁUDIO", "DUB+LEG", "DUBLADO E LEGENDADO" → "Dual".
  Se a capa NÃO mostra nenhum desses indicadores, use "Original".
- "confidence": "high" se você leu o título com clareza,
  "medium" se está parcialmente legível,
  "low" se não dá pra ter certeza.
- Se a imagem não for uma capa ou não houver texto legível, devolva title="" e confidence="low".
- NUNCA invente. Só leia o que está escrito.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const { imageBase64, mimeType } = await req.json();
    if (!imageBase64 || typeof imageBase64 !== "string") {
      throw new Error("Parâmetro 'imageBase64' obrigatório");
    }
    const mt = mimeType || "image/jpeg";
    const dataUrl = `data:${mt};base64,${imageBase64}`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash", // suporta visão
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Leia o título principal nesta capa e devolva via a função.",
                },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "return_cover_title",
                description: "Devolve o título lido na capa.",
                parameters: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    original_title: { type: ["string", "null"] },
                    audio: {
                      type: "string",
                      enum: ["Dublado", "Legendado", "Dual", "Original"],
                    },
                    confidence: {
                      type: "string",
                      enum: ["high", "medium", "low"],
                    },
                  },
                  required: ["title", "audio", "confidence"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "return_cover_title" },
          },
        }),
      },
    );

    if (response.status === 429) {
      return new Response(
        JSON.stringify({
          error: "Limite de uso da IA atingido. Tente em alguns minutos.",
        }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (response.status === 402) {
      return new Response(
        JSON.stringify({
          error:
            "Créditos da IA acabaram. Recarregue em Settings > Workspace > Usage.",
        }),
        {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
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
      throw new Error("IA não retornou título");
    }
    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro desconhecido";
    console.error("[recognize-cover-title]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
