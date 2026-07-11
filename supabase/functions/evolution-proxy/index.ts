// Evolution API proxy - keeps API key secret on the server
// Actions: 'status' | 'qr' | 'logout'
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const normalizeBaseUrl = (rawUrl: string) => {
  const trimmed = rawUrl.trim();
  const markdownTarget = trimmed.match(/\]\((https?:\/\/[^\)\s]+)\)/)?.[1];
  const bracketTarget = trimmed.match(/\[(https?:\/\/[^\]\s]+)\]/)?.[1];
  const firstPlainUrl = trimmed.match(/https?:\/\/[^\s\)\]]+/)?.[0];
  const candidate = (markdownTarget ?? bracketTarget ?? firstPlainUrl ?? trimmed)
    .trim()
    .replace(/^[`'"<]+|[`'">]+$/g, "")
    .replace(/\/+$/, "");
  return new URL(candidate).origin;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
    const EVOLUTION_API_KEY_FALLBACK = Deno.env.get("EVOLUTION_API_KEY");
    if (!EVOLUTION_API_URL) {
      return new Response(JSON.stringify({ error: "EVOLUTION_API_URL não configurada." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, instanceName, apiToken } = await req.json();
    if (!action || !instanceName) {
      return new Response(JSON.stringify({ error: "action e instanceName obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = (apiToken as string | undefined)?.trim() || EVOLUTION_API_KEY_FALLBACK;
    if (!token) {
      return new Response(JSON.stringify({ error: "Token da instância ausente." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const base = normalizeBaseUrl(EVOLUTION_API_URL);
    const headers = { "Content-Type": "application/json", apikey: token };

    let url = "";
    let method: "GET" | "POST" | "DELETE" = "GET";
    switch (action) {
      case "status":
        url = `${base}/instance/connectionState/${encodeURIComponent(instanceName)}`;
        break;
      case "qr":
        url = `${base}/instance/connect/${encodeURIComponent(instanceName)}`;
        break;
      case "logout":
        url = `${base}/instance/logout/${encodeURIComponent(instanceName)}`;
        method = "DELETE";
        break;
      default:
        return new Response(JSON.stringify({ error: "Ação inválida" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    const resp = await fetch(url, { method, headers });
    const text = await resp.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    // Try to extract phone number for status
    let connectedNumber: string | null = null;
    if (action === "status" && data && typeof data === "object") {
      const d = data as Record<string, unknown>;
      const inner = (d.data as Record<string, unknown> | undefined) ?? d;
      const name = (inner.Name ?? inner.name ?? inner.ownerJid ?? inner.wuid) as string | undefined;
      if (typeof name === "string") {
        const digits = name.split("@")[0].replace(/\D/g, "");
        if (digits.length >= 8) connectedNumber = digits;
      }
    }

    return new Response(JSON.stringify({ ok: resp.ok, status: resp.status, data, connectedNumber }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("evolution-proxy error", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
