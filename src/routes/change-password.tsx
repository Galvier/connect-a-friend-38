import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, KeyRound } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/change-password")({
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return navigate({ to: "/auth", replace: true });
      setUserId(data.user.id);
    })();
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("Senha deve ter ao menos 8 caracteres");
    if (password !== confirm) return toast.error("Senhas não coincidem");
    if (!userId) return;
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setLoading(false); return toast.error(error.message); }
    const { error: profErr } = await supabase
      .from("profiles").update({ must_change_password: false }).eq("id", userId);
    setLoading(false);
    if (profErr) return toast.error(profErr.message);
    toast.success("Senha alterada!");
    const { data: prof } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
    navigate({ to: prof?.role === "admin" ? "/admin" : "/dashboard", replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 px-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <KeyRound className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Definir nova senha</CardTitle>
          <CardDescription>É seu primeiro acesso. Escolha uma nova senha para continuar.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="p">Nova senha</Label>
              <Input id="p" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c">Confirmar senha</Label>
              <Input id="c" type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar nova senha
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
