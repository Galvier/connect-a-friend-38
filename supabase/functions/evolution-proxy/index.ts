// Evolution API proxy - keeps API key secret on the server
// Actions: 'status' | 'qr' | 'logout' | 'disconnect'
// New endpoints: instance is resolved via the `apikey` header (per-instance token).
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

type Dict = Record<string, unknown>;

const extractNumberFromPayload = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") return null;
  const stack: Dict[] = [payload as Dict];
  const keys = ["owner", "ownerJid", "wuid", "number", "phone", "phoneNumber", "jid"];
  const seen = new Set<Dict>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const k of keys) {
      const v = cur[k];
      if (typeof v === "string" && v) {
        const digits = v.split("@")[0].replace(/\D/g, "");
        if (digits.length >= 8) return digits;
      }
    }
    for (const v of Object.values(cur)) {
      if (v && typeof v === "object") stack.push(v as Dict);
    }
  }
  return null;
};

const extractState = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") return null;
  const d = payload as Dict;
  const inner = (d.data as Dict | undefined) ?? d;
  const instance = (inner.instance as Dict | undefined) ?? inner;
  const raw =
    (instance.state as string | undefined) ??
    (inner.state as string | undefined) ??
    (d.state as string | undefined) ??
    (instance.status as string | undefined) ??
    (inner.status as string | undefined) ??
    null;
  if (raw) return raw;
  if (typeof instance.LoggedIn === "boolean") return instance.LoggedIn ? "open" : "close";
  if (typeof inner.LoggedIn === "boolean") return inner.LoggedIn ? "open" : "close";
  if (typeof instance.Connected === "boolean") return instance.Connected ? "open" : "close";
  return null;
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
    if (!action) {
      return new Response(JSON.stringify({ error: "action obrigatório" }), {
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
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: token,
    };
    if (instanceName) headers["instance"] = instanceName;

    let url = "";
    let method: "GET" | "POST" | "DELETE" = "GET";
    switch (action) {
      case "status":
        url = `${base}/instance/status`;
        break;
      case "qr":
        url = `${base}/instance/qr`;
        break;
      case "disconnect":
        url = `${base}/instance/disconnect`;
        method = "POST";
        break;
      case "logout":
        url = `${base}/instance/logout`;
        method = "DELETE";
        break;
      case "debug": {
        const paths = ["/", "/docs", "/swagger", "/api-docs", "/openapi.json", "/swagger.json", "/routes"];
        const results: Record<string, unknown> = {};
        for (const p of paths) {
          try {
            const r = await fetch(`${base}${p}`, { headers });
            const t = await r.text();
            results[p] = { status: r.status, body: t.slice(0, 500) };
          } catch (e) { results[p] = { error: (e as Error).message }; }
        }
        return new Response(JSON.stringify(results), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
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

    let connectedNumber: string | null = null;
    let state: string | null = null;
    if (action === "status") {
      state = extractState(data);
      connectedNumber = extractNumberFromPayload(data);
      if (!connectedNumber && (state === "open" || state === "connected")) {
        try {
          const r = await fetch(`${base}/instance/info`, { headers });
          const j = await r.json();
          connectedNumber = extractNumberFromPayload(j);
        } catch (_) { /* ignore */ }
      }
    }

    return new Response(
      JSON.stringify({ ok: resp.ok, status: resp.status, data, connectedNumber, state }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("evolution-proxy error", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
