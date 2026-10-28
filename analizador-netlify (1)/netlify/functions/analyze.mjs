// POST /api/analyze  {ticker, part:"A"|"B", ctx, search}
// La API key vive en Netlify (ANTHROPIC_API_KEY); nunca llega al navegador.
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

const HEAD = (t, ctx) => `Eres analista senior de equity research. Analiza ${t} con el método de las 4 preguntas.
Datos de Yahoo: ${ctx}
No inventes cifras; si algo no se sabe, dilo. Español de México, palabras sencillas. Responde SOLO un JSON válido, sin markdown, con estas llaves:`;

const PARTS = {
  A: `"p1_ingresos": {"resumen": "¿de dónde sale la lana?, 2 frases", "segmentos": [{"nombre": str, "pct": número aprox 0-100}]},
"p2_retencion": {"resumen": "¿por qué no se van sus clientes? ¿puede subir precios sin perderlos?, 2 frases", "moats": [{"tipo": "Efectos de red"|"Costos de cambio"|"Marca/intangibles"|"Ventaja en costos/escala"|"Escala eficiente"|"Sin moat claro", "fuerza": 0-10, "porque": "1 frase"}] (máx 4)},
"moat_score": 0-10 global, "moat_tendencia": "creciendo"|"estable"|"erosionándose",
"narrativa": "la historia que hoy cuenta el mercado, 3 frases", "cambio_narrativa": "qué podría romperla o fortalecerla, 2 frases"`,
  B: `"p3_futuro": {"resumen": "¿por qué debería valer más en 5 años?, 2-3 frases", "motores": ["3 motores de crecimiento"]},
"p4_precio": "¿el precio vale la pena frente a su propia historia y a sus competidores? Si tiene pérdidas, usa ventas, 2 frases",
"entorno": "qué fuerzas macro le pegan más (tasas, recesión, geopolítica), 2 frases",
"bull": ["3 razones a favor"], "bear": ["3 riesgos"],
"vigilar": ["3 señales concretas de que la tesis se rompió o hay disrupción real"],
"peers": ["5 tickers de competidores directos en formato Yahoo Finance"],
"veredicto": "1 frase honesta"`,
};

export default async (req) => {
  if (req.method !== "POST") return J({ error: "Usa POST" }, 405);
  const pw = Netlify.env.get("APP_PASSWORD");
  if (pw && req.headers.get("x-access-code") !== pw) return J({ error: "Código de acceso incorrecto" }, 401);
  const key = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!key) return J({ error: "Falta ANTHROPIC_API_KEY en las variables de Netlify" }, 500);
  const { ticker, part, ctx, search } = await req.json().catch(() => ({}));
  if (!PARTS[part] || !ticker) return J({ error: "Petición inválida" }, 400);
  const body = {
    model: Netlify.env.get("CLAUDE_MODEL") || "claude-sonnet-5-5",
    max_tokens: 1600,
    messages: [{ role: "user", content: `${HEAD(String(ticker).slice(0, 15), String(ctx || "").slice(0, 3000))}\n{\n${PARTS[part]}\n}` }],
  };
  if (search) body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }];
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: AbortSignal.timeout(26000),
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) return J({ error: j.error?.message || "Error de la API de Anthropic" }, 502);
    const txt = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    return J(JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1)));
  } catch (e) {
    return J({ error: e.name === "TimeoutError" ? "La IA tardó demasiado; intenta de nuevo (o quita la búsqueda web)" : "No pude leer la respuesta de la IA" }, 504);
  }
};
export const config = { path: "/api/analyze" };
