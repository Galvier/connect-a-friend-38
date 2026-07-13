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

    // Try to extract phone number + normalized state for status
    let connectedNumber: string | null = null;
    let state: string | null = null;
    if (action === "status" && data && typeof data === "object") {
      const d = data as Record<string, unknown>;
      const inner = (d.data as Record<string, unknown> | undefined) ?? d;
      const instance = (inner.instance as Record<string, unknown> | undefined) ?? inner;
      state =
        (instance.state as string | undefined) ??
        (inner.state as string | undefined) ??
        (d.state as string | undefined) ??
        null;

      const candidates = [
        instance.owner, instance.ownerJid, instance.wuid, instance.number,
        inner.owner, inner.ownerJid, inner.wuid, inner.number,
        instance.Name, inner.Name, instance.name, inner.name,
      ];
      for (const c of candidates) {
        if (typeof c === "string" && c) {
          const digits = c.split("@")[0].replace(/\D/g, "");
          if (digits.length >= 8) { connectedNumber = digits; break; }
        }
      }

      if (!connectedNumber && (state === "open" || state === "connected")) {
        try {
          const r = await fetch(
            `${base}/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`,
            { headers },
          );
          const j = await r.json();
          const list = Array.isArray(j) ? j : (Array.isArray(j?.data) ? j.data : []);
          for (const entry of list) {
            const inst = entry?.instance ?? entry;
            const owner = inst?.owner ?? inst?.ownerJid ?? inst?.wuid ?? inst?.number;
            if (typeof owner === "string") {
              const digits = owner.split("@")[0].replace(/\D/g, "");
              if (digits.length >= 8) { connectedNumber = digits; break; }
            }
          }
        } catch (_) { /* ignore */ }
      }
    }

    return new Response(JSON.stringify({ ok: resp.ok, status: resp.status, data, connectedNumber, state }), {
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
