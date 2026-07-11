import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Loader2, LogOut, Plus, ShieldCheck, Trash2, UserPlus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

type Profile = { id: string; email: string; name: string | null; role: string; created_at: string };
type Instance = { id: string; user_id: string; instance_name: string; api_token: string };

function mask(t: string) {
  if (!t) return "—";
  if (t.length <= 8) return "••••";
  return `${t.slice(0, 4)}••••${t.slice(-4)}`;
}

function AdminPage() {
  const navigate = useNavigate();
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);

  // client dialog
  const [clientOpen, setClientOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientSaving, setClientSaving] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);

  // instance dialog
  const [instOpen, setInstOpen] = useState(false);
  const [instUserId, setInstUserId] = useState<string>("");
  const [instName, setInstName] = useState("");
  const [instToken, setInstToken] = useState("");
  const [instSaving, setInstSaving] = useState(false);

  const load = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return navigate({ to: "/auth", replace: true });
    const { data: me } = await supabase
      .from("profiles").select("role, email, must_change_password").eq("id", userData.user.id).maybeSingle();
    if (me?.must_change_password) return navigate({ to: "/change-password", replace: true });
    if (me?.role !== "admin") { toast.error("Acesso negado"); return navigate({ to: "/dashboard", replace: true }); }
    setAdminEmail(me.email);
    const [{ data: profs }, { data: insts }] = await Promise.all([
      supabase.from("profiles").select("id, email, name, role, created_at").order("created_at", { ascending: false }),
      supabase.from("whatsapp_instances").select("id, user_id, instance_name, api_token"),
    ]);
    setProfiles((profs ?? []) as Profile[]);
    setInstances((insts ?? []) as Instance[]);
    setLoading(false);
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  const createClient = async () => {
    if (!clientName.trim() || !clientEmail.trim()) return toast.error("Preencha nome e email");
    setClientSaving(true);
    const { data, error } = await supabase.functions.invoke("admin-create-user", {
      body: { name: clientName.trim(), email: clientEmail.trim() },
    });
    setClientSaving(false);
    if (error) return toast.error(error.message);
    if (data?.error) return toast.error(data.error);
    setGeneratedPassword(data.password);
    setClientName(""); setClientEmail("");
    load();
  };

  const createInstance = async () => {
    if (!instUserId || !instName.trim() || !instToken.trim()) return toast.error("Preencha todos os campos");
    setInstSaving(true);
    const { error } = await supabase.from("whatsapp_instances").insert({
      user_id: instUserId, instance_name: instName.trim(), api_token: instToken.trim(),
    });
    setInstSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Instância criada!");
    setInstOpen(false);
    setInstUserId(""); setInstName(""); setInstToken("");
    load();
  };

  const deleteInstance = async (id: string) => {
    if (!confirm("Excluir instância?")) return;
    const { error } = await supabase.from("whatsapp_instances").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Instância removida");
    load();
  };

  const signOut = async () => { await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); };

  const clients = profiles.filter((p) => p.role === "client");
  const emailById = (uid: string) => profiles.find((p) => p.id === uid)?.email ?? uid;

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="flex h-16 items-center justify-between border-b bg-card px-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span className="font-semibold">Admin Panel</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{adminEmail}</span>
          <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="mr-2 h-4 w-4" /> Sair</Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <Tabs defaultValue="clients">
          <TabsList>
            <TabsTrigger value="clients">Clientes</TabsTrigger>
            <TabsTrigger value="instances">Instâncias</TabsTrigger>
          </TabsList>

          <TabsContent value="clients" className="mt-4">
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>Clientes ({clients.length})</CardTitle>
                <Button size="sm" onClick={() => { setGeneratedPassword(null); setClientOpen(true); }}>
                  <UserPlus className="mr-2 h-4 w-4" /> Novo Cliente
                </Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Instâncias</TableHead>
                      <TableHead>Criado em</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clients.map((p) => {
                      const count = instances.filter((i) => i.user_id === p.id).length;
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.name ?? "—"}</TableCell>
                          <TableCell>{p.email}</TableCell>
                          <TableCell><Badge variant="outline">{count}</Badge></TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(p.created_at).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="instances" className="mt-4">
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>Instâncias ({instances.length})</CardTitle>
                <Button size="sm" onClick={() => setInstOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Nova Instância
                </Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Token</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {instances.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell className="font-medium">{i.instance_name}</TableCell>
                        <TableCell>{emailById(i.user_id)}</TableCell>
                        <TableCell className="font-mono text-xs">{mask(i.api_token)}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => deleteInstance(i.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* New client dialog */}
      <Dialog open={clientOpen} onOpenChange={(o) => { setClientOpen(o); if (!o) setGeneratedPassword(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{generatedPassword ? "Cliente criado" : "Novo Cliente"}</DialogTitle>
            <DialogDescription>
              {generatedPassword
                ? "Copie e envie a senha ao cliente. Ela não será mostrada novamente."
                : "Uma senha será gerada. O cliente será obrigado a trocá-la no primeiro acesso."}
            </DialogDescription>
          </DialogHeader>

          {generatedPassword ? (
            <div className="space-y-2 py-2">
              <Label>Senha temporária</Label>
              <div className="flex items-center gap-2">
                <Input readOnly value={generatedPassword} className="font-mono" />
                <Button size="icon" variant="outline" onClick={() => {
                  navigator.clipboard.writeText(generatedPassword);
                  toast.success("Senha copiada!");
                }}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <div className="space-y-2">
                <Label htmlFor="cn">Nome</Label>
                <Input id="cn" value={clientName} onChange={(e) => setClientName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ce">Email</Label>
                <Input id="ce" type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
              </div>
            </div>
          )}

          <DialogFooter>
            {generatedPassword ? (
              <Button onClick={() => { setClientOpen(false); setGeneratedPassword(null); }}>Fechar</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setClientOpen(false)}>Cancelar</Button>
                <Button onClick={createClient} disabled={clientSaving}>
                  {clientSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New instance dialog */}
      <Dialog open={instOpen} onOpenChange={setInstOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Instância</DialogTitle>
            <DialogDescription>Vincule uma instância WhatsApp a um cliente.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Cliente</Label>
              <Select value={instUserId} onValueChange={setInstUserId}>
                <SelectTrigger><SelectValue placeholder="Selecione um cliente" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name ?? c.email} ({c.email})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="in">Nome da instância</Label>
              <Input id="in" placeholder="ex: cliente-loja-01" value={instName} onChange={(e) => setInstName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="it">Token (apikey)</Label>
              <Input id="it" placeholder="Token da Evolution API" value={instToken} onChange={(e) => setInstToken(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInstOpen(false)}>Cancelar</Button>
            <Button onClick={createInstance} disabled={instSaving}>
              {instSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
