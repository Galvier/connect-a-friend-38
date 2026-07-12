import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, LogOut, Power, QrCode, ShieldCheck, Smartphone, Wifi, WifiOff } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConnectQrDialog } from "@/components/ConnectQrDialog";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

type Instance = {
  id: string;
  instance_name: string;
  api_token: string;
  connected_number: string | null;
};
type InstanceStatus = "loading" | "connected" | "disconnected";

function extractState(data: unknown): "open" | "close" | "unknown" {
  if (!data || typeof data !== "object") return "unknown";
  const d = data as Record<string, unknown>;
  const inner = (d.data as Record<string, unknown> | undefined) ?? d;
  if (typeof inner.LoggedIn === "boolean") return inner.LoggedIn ? "open" : "close";
  if (typeof inner.Connected === "boolean" && inner.Connected) return "open";
  const state = (inner.state as string) ?? (d.state as string);
  if (state === "open" || state === "connected") return "open";
  return "close";
}

function DashboardPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [statuses, setStatuses] = useState<Record<string, InstanceStatus>>({});
  const [loading, setLoading] = useState(true);
  const [qrFor, setQrFor] = useState<Instance | null>(null);

  const checkStatus = useCallback(async (inst: Instance) => {
    setStatuses((s) => ({ ...s, [inst.id]: "loading" }));
    const { data, error } = await supabase.functions.invoke("evolution-proxy", {
      body: { action: "status", instanceName: inst.instance_name, apiToken: inst.api_token },
    });
    if (error || data?.ok === false) {
      setStatuses((s) => ({ ...s, [inst.id]: "disconnected" }));
      return;
    }
    const state = extractState(data?.data);
    const connected = state === "open";
    setStatuses((s) => ({ ...s, [inst.id]: connected ? "connected" : "disconnected" }));
    const number = (data?.connectedNumber as string | null) ?? null;
    if (connected && number && number !== inst.connected_number) {
      await supabase.from("whatsapp_instances").update({ connected_number: number }).eq("id", inst.id);
      setInstances((prev) => prev.map((i) => (i.id === inst.id ? { ...i, connected_number: number } : i)));
    }
  }, []);

  const load = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return navigate({ to: "/auth", replace: true });
    setEmail(userData.user.email ?? null);
    const { data: prof, error: profErr } = await supabase
      .from("profiles").select("role, must_change_password").eq("id", userData.user.id).maybeSingle();
    if (profErr) console.error("[dashboard] profile fetch error", profErr);
    if (prof?.must_change_password) return navigate({ to: "/change-password", replace: true });
    if (prof?.role === "admin") setIsAdmin(true);

    const { data: insts } = await supabase
      .from("whatsapp_instances")
      .select("id, instance_name, api_token, connected_number")
      .eq("user_id", userData.user.id)
      .order("created_at", { ascending: true });
    const list = (insts ?? []) as Instance[];
    setInstances(list);
    setLoading(false);
    list.forEach(checkStatus);
  }, [navigate, checkStatus]);

  useEffect(() => { load(); }, [load]);

  const disconnect = async (inst: Instance) => {
    const { error } = await supabase.functions.invoke("evolution-proxy", {
      body: { action: "logout", instanceName: inst.instance_name, apiToken: inst.api_token },
    });
    if (error) return toast.error("Erro ao desconectar");
    await supabase.from("whatsapp_instances").update({ connected_number: null }).eq("id", inst.id);
    setInstances((prev) => prev.map((i) => (i.id === inst.id ? { ...i, connected_number: null } : i)));
    toast.success("Dispositivo desconectado");
    checkStatus(inst);
  };

  const onConnected = (inst: Instance) => async (number: string | null) => {
    if (number) {
      await supabase.from("whatsapp_instances").update({ connected_number: number }).eq("id", inst.id);
      setInstances((prev) => prev.map((i) => (i.id === inst.id ? { ...i, connected_number: number } : i)));
    }
    toast.success("WhatsApp conectado!");
    checkStatus(inst);
  };

  const signOut = async () => { await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

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

      <main className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="mb-6 text-2xl font-bold">Minhas Instâncias</h1>

        {instances.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <Smartphone className="h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">
                Nenhuma instância atribuída. Entre em contato com o administrador.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {instances.map((inst) => {
              const status = statuses[inst.id] ?? "loading";
              return (
                <Card key={inst.id} className="shadow-md">
                  <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
                    <CardTitle className="text-base">{inst.instance_name}</CardTitle>
                    {status === "loading" ? (
                      <Badge variant="secondary"><Loader2 className="mr-1 h-3 w-3 animate-spin" />...</Badge>
                    ) : status === "connected" ? (
                      <Badge className="bg-green-600 hover:bg-green-600"><Wifi className="mr-1 h-3 w-3" />Conectado</Badge>
                    ) : (
                      <Badge variant="secondary"><WifiOff className="mr-1 h-3 w-3" />Desconectado</Badge>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {status === "connected" && inst.connected_number && (
                      <p className="text-sm text-muted-foreground">
                        Número: <span className="font-mono text-foreground">+{inst.connected_number}</span>
                      </p>
                    )}
                    {status === "connected" ? (
                      <Button variant="destructive" className="w-full" onClick={() => disconnect(inst)}>
                        <Power className="mr-2 h-4 w-4" /> Desconectar
                      </Button>
                    ) : (
                      <Button className="w-full" onClick={() => setQrFor(inst)} disabled={status === "loading"}>
                        <QrCode className="mr-2 h-4 w-4" /> Conectar
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      {qrFor && (
        <ConnectQrDialog
          open={!!qrFor}
          onOpenChange={(o) => !o && setQrFor(null)}
          instanceName={qrFor.instance_name}
          apiToken={qrFor.api_token}
          onConnected={onConnected(qrFor)}
        />
      )}
    </div>
  );
}
