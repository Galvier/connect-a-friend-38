// Evolution API proxy - keeps API key secret on the server
// Actions: 'status' | 'qr' | 'logout'
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
    const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Evolution API não configurada. Configure EVOLUTION_API_URL e EVOLUTION_API_KEY." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { action, instanceName } = await req.json();
    if (!action || !instanceName) {
      return new Response(JSON.stringify({ error: "action e instanceName obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const base = EVOLUTION_API_URL.replace(/\/$/, "");
    const headers = { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY };

    let url = "";
    let method: "GET" | "POST" | "DELETE" = "GET";

    switch (action) {
      case "status":
        url = `${base}/instance/status?instanceName=${encodeURIComponent(instanceName)}`;
        method = "GET";
        break;
      case "qr":
        url = `${base}/instance/qr?instanceName=${encodeURIComponent(instanceName)}`;
        method = "GET";
        break;
      case "logout":
        url = `${base}/instance/logout?instanceName=${encodeURIComponent(instanceName)}`;
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
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    return new Response(JSON.stringify({ ok: resp.ok, status: resp.status, data }), {
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
