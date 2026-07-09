import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link2, LogOut, Loader2, ShieldCheck, Users } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

type Profile = { id: string; email: string; role: string };
type Instance = { user_id: string; instance_name: string };

function AdminPage() {
  const navigate = useNavigate();
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [target, setTarget] = useState<Profile | null>(null);
  const [instanceName, setInstanceName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      navigate({ to: "/auth", replace: true });
      return;
    }
    const { data: me } = await supabase
      .from("profiles")
      .select("role, email")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (me?.role !== "admin") {
      toast.error("Acesso negado");
      navigate({ to: "/dashboard", replace: true });
      return;
    }
    setAdminEmail(me.email);
    const [{ data: profs }, { data: insts }] = await Promise.all([
      supabase.from("profiles").select("id, email, role").order("created_at", { ascending: false }),
      supabase.from("whatsapp_instances").select("user_id, instance_name"),
    ]);
    setProfiles(profs ?? []);
    setInstances(insts ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openDialog = (p: Profile) => {
    setTarget(p);
    setInstanceName("");
    setDialogOpen(true);
  };

  const saveInstance = async () => {
    if (!target || !instanceName.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from("whatsapp_instances")
      .insert({ user_id: target.id, instance_name: instanceName.trim() });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Instância vinculada!");
    setDialogOpen(false);
    load();
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const instancesFor = (uid: string) => instances.filter((i) => i.user_id === uid);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="hidden w-64 flex-col border-r bg-card p-6 md:flex">
        <div className="mb-8 flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <span className="font-bold">Admin Panel</span>
        </div>
        <nav className="flex-1 space-y-1">
          <div className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
            <Users className="h-4 w-4" /> Usuários
          </div>
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b bg-card px-6">
          <h1 className="text-lg font-semibold">Gerenciamento de Usuários</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{adminEmail}</span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" /> Sair
            </Button>
          </div>
        </header>

        <main className="flex-1 p-6">
          <Card>
            <CardHeader>
              <CardTitle>Usuários cadastrados ({profiles.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead>Instâncias</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profiles.map((p) => {
                    const userInsts = instancesFor(p.id);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.email}</TableCell>
                        <TableCell>
                          <Badge variant={p.role === "admin" ? "default" : "secondary"}>{p.role}</Badge>
                        </TableCell>
                        <TableCell>
                          {userInsts.length === 0 ? (
                            <span className="text-sm text-muted-foreground">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {userInsts.map((i) => (
                                <Badge key={i.instance_name} variant="outline">{i.instance_name}</Badge>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" onClick={() => openDialog(p)}>
                            <Link2 className="mr-2 h-4 w-4" /> Vincular Instância
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </main>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vincular Instância</DialogTitle>
            <DialogDescription>
              Cadastre um nome de instância WhatsApp para <strong>{target?.email}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="inst">Nome da instância</Label>
            <Input
              id="inst"
              placeholder="ex: cliente-loja-01"
              value={instanceName}
              onChange={(e) => setInstanceName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveInstance} disabled={saving || !instanceName.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
