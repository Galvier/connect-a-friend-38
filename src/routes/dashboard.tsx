import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Home,
  Loader2,
  LogOut,
  Plug,
  Power,
  QrCode,
  RefreshCw,
  Smartphone,
  Wifi,
  WifiOff,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

type Status = "loading" | "connected" | "disconnected" | "qr" | "no-instance";

function isLikelyBase64(v: string) {
  return /^[A-Za-z0-9+/=]+$/.test(v) && v.length > 100;
}

function toQrDataUrl(value: string): string | null {
  const s = value.trim();
  if (!s) return null;
  if (s.startsWith("data:image")) return s;
  if (isLikelyBase64(s)) return `data:image/png;base64,${s}`;
  return null;
}

function extractQr(payload: unknown): string | null {
  // Edge function envelopa em payload.data.data
  const outer = (payload as { data?: unknown })?.data;
  const respostaReal =
    (outer as { data?: unknown })?.data !== undefined
      ? (outer as { data: unknown }).data
      : outer;

  console.log("CONTEUDO REAL DA EVOLUTION:", respostaReal);

  if (typeof respostaReal === "string") {
    return toQrDataUrl(respostaReal);
  }

  if (respostaReal && typeof respostaReal === "object") {
    const valores = Object.values(respostaReal as Record<string, unknown>);
    console.log("Valores vasculhados:", valores);
    for (const v of valores) {
      if (typeof v === "string") {
        const found = toQrDataUrl(v);
        if (found) return found;
      }
    }
    // Fallback: procura recursivamente em objetos aninhados
    for (const v of valores) {
      if (v && typeof v === "object") {
        const nested = extractQr({ data: { data: v } });
        if (nested) return nested;
      }
    }
  }

  return null;
}

function extractState(data: unknown): "open" | "close" | "connecting" | "unknown" {
  if (!data || typeof data !== "object") return "unknown";
  const d = data as Record<string, unknown>;
  const state =
    (d.state as string) ??
    ((d.instance as Record<string, unknown>)?.state as string) ??
    ((d.instance as Record<string, unknown>)?.status as string);
  if (state === "open" || state === "connected") return "open";
  if (state === "close" || state === "disconnected") return "close";
  if (state === "connecting") return "connecting";
  return "unknown";
}

function DashboardPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [instanceName, setInstanceName] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [manualName, setManualName] = useState("");

  const checkStatus = useCallback(async (name: string) => {
    setStatus("loading");
    const { data, error } = await supabase.functions.invoke("evolution-proxy", {
      body: { action: "status", instanceName: name },
    });
    if (error) {
      toast.error("Erro ao verificar status");
      setStatus("disconnected");
      return;
    }
    if (data?.ok === false) {
      const msg = (data?.data as { error?: string })?.error ?? "Falha na Evolution API";
      if (data?.status === 401 || /not authorized/i.test(msg)) {
        toast.error("Credenciais da Evolution API inválidas. Verifique EVOLUTION_API_KEY.");
      } else {
        toast.error(`Evolution API: ${msg}`);
      }
      setStatus("disconnected");
      return;
    }
    const state = extractState(data?.data);
    setStatus(state === "open" ? "connected" : "disconnected");
  }, []);

  const load = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      navigate({ to: "/auth", replace: true });
      return;
    }
    setEmail(userData.user.email ?? null);
    const { data: insts } = await supabase
      .from("whatsapp_instances")
      .select("instance_name")
      .eq("user_id", userData.user.id)
      .limit(1);
    const name = insts?.[0]?.instance_name;
    if (!name) {
      setStatus("no-instance");
      return;
    }
    setInstanceName(name);
    checkStatus(name);
  }, [navigate, checkStatus]);

  useEffect(() => {
    load();
  }, [load]);

  const generateQr = async () => {
    if (!instanceName) return;
    setActionLoading(true);
    setStatus("qr");
    setQrImage(null);
    const { data, error } = await supabase.functions.invoke("evolution-proxy", {
      body: { action: "qr", instanceName },
    });
    setActionLoading(false);
    if (error) {
      toast.error("Erro ao gerar QR Code");
      setStatus("disconnected");
      return;
    }
    if (data?.ok === false) {
      const msg = (data?.data as { error?: string })?.error ?? "Falha na Evolution API";
      if (data?.status === 401 || /not authorized/i.test(msg)) {
        toast.error("Credenciais da Evolution API inválidas. Verifique EVOLUTION_API_KEY.");
      } else {
        toast.error(`Evolution API: ${msg}`);
      }
      setStatus("disconnected");
      return;
    }
    const img = extractQr(data);
    if (!img) {
      toast.error("QR Code não retornado pela API");
      return;
    }
    setQrImage(img);
  };

  const logout = async () => {
    if (!instanceName) return;
    setActionLoading(true);
    const { error } = await supabase.functions.invoke("evolution-proxy", {
      body: { action: "logout", instanceName },
    });
    setActionLoading(false);
    if (error) return toast.error("Erro ao desconectar");
    toast.success("Dispositivo desconectado");
    checkStatus(instanceName);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const goHome = () => {
    setQrImage(null);
    setManualName("");
    setInstanceName(null);
    setStatus("no-instance");
  };

  const goBack = () => {
    if (status === "qr") {
      setQrImage(null);
      setStatus(instanceName ? "disconnected" : "no-instance");
      return;
    }
    if (status === "disconnected" || status === "connected") {
      setQrImage(null);
      setInstanceName(null);
      setStatus("no-instance");
      return;
    }
    goHome();
  };

  const currentStep: 1 | 2 = status === "no-instance" || status === "loading" ? 1 : 2;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <header className="flex h-16 items-center justify-between border-b bg-card/60 px-6 backdrop-blur">
        <div className="flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-primary" />
          <span className="font-semibold">WhatsApp Manager</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{email}</span>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" /> Sair
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-12">
        <div className="mb-4 flex items-center justify-between rounded-lg border bg-card/60 px-3 py-2 backdrop-blur">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={goBack} disabled={status === "loading"}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
            </Button>
            <Button variant="ghost" size="sm" onClick={goHome}>
              <Home className="mr-1 h-4 w-4" /> Home
            </Button>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium transition-colors ${
                currentStep === 1
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-background/30 text-[10px]">
                1
              </span>
              Identificar Instância
            </span>
            <span className="text-muted-foreground">→</span>
            <span
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium transition-colors ${
                currentStep === 2
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-background/30 text-[10px]">
                2
              </span>
              Sincronizar Aparelho
            </span>
          </div>
        </div>

        {status === "loading" && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-3 py-16">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Verificando conexão...</p>
            </CardContent>
          </Card>
        )}

        {status === "no-instance" && (
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Conectar WhatsApp</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Insira o nome da sua instância para conectar direto
              </p>
              <Input
                placeholder="ex: minha-instancia"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
              />
              <Button
                onClick={() => {
                  const name = manualName.trim();
                  if (!name) {
                    toast.error("Informe o nome da instância");
                    return;
                  }
                  setInstanceName(name);
                  checkStatus(name);
                }}
              >
                <Plug className="mr-2 h-4 w-4" /> Carregar WhatsApp
              </Button>
            </CardContent>
          </Card>
        )}

        {status === "connected" && (
          <Card className="border-green-500/30 bg-gradient-to-br from-green-500/5 to-transparent shadow-lg">
            <CardContent className="flex flex-col items-center gap-6 py-12">
              <div className="relative">
                <div className="absolute inset-0 animate-ping rounded-full bg-green-500/40" />
                <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-green-500">
                  <Wifi className="h-10 w-10 text-white" />
                </div>
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-bold">WhatsApp Conectado com Sucesso!</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Instância: <span className="font-mono">{instanceName}</span>
                </p>
              </div>
              <Button variant="destructive" onClick={logout} disabled={actionLoading}>
                {actionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Power className="mr-2 h-4 w-4" />}
                Desconectar Dispositivo
              </Button>
            </CardContent>
          </Card>
        )}

        {status === "disconnected" && (
          <Card className="border-yellow-500/30 bg-gradient-to-br from-yellow-500/5 to-transparent shadow-lg">
            <CardContent className="flex flex-col items-center gap-6 py-12">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-yellow-500">
                <WifiOff className="h-10 w-10 text-white" />
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-bold">Aparelho Desconectado</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Gere um QR Code para conectar seu WhatsApp.
                </p>
              </div>
              <Button size="lg" onClick={generateQr} disabled={actionLoading}>
                {actionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
                Gerar QR Code
              </Button>
            </CardContent>
          </Card>
        )}

        {status === "qr" && (
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-center">Escaneie o QR Code</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-6 pb-8">
              {qrImage ? (
                qrImage.startsWith("data:image") ? (
                  <img src={qrImage} alt="QR Code" className="h-64 w-64 rounded-lg border bg-white p-2" />
                ) : (
                  <div className="rounded-lg border bg-white p-4 text-xs break-all">{qrImage}</div>
                )
              ) : (
                <div className="flex h-64 w-64 items-center justify-center rounded-lg border bg-muted">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}
              <p className="text-center text-sm text-muted-foreground">
                Abra o WhatsApp &gt; Aparelhos conectados &gt; Conectar aparelho
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={generateQr} disabled={actionLoading}>
                  {actionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Atualizar QR Code
                </Button>
                <Button variant="ghost" onClick={() => instanceName && checkStatus(instanceName)}>
                  Já conectei
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
