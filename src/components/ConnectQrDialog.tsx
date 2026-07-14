import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, QrCode, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceName: string;
  apiToken: string;
  onConnected: (number: string | null) => void;
};

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
const QR_KEYS = ["qrcode", "qrCode", "base64", "qr", "code", "image"];
function extractQr(payload: unknown): string | null {
  if (!payload) return null;
  if (typeof payload === "string") return toQrDataUrl(payload);
  if (typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  for (const k of QR_KEYS) {
    const v = obj[k];
    if (typeof v === "string") {
      const f = toQrDataUrl(v);
      if (f) return f;
    }
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      const nested = extractQr(v);
      if (nested) return nested;
    } else if (typeof v === "string") {
      const f = toQrDataUrl(v);
      if (f) return f;
    }
  }
  return null;
}

export function ConnectQrDialog({ open, onOpenChange, instanceName, apiToken, onConnected }: Props) {
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const generateQr = useCallback(async () => {
    setLoading(true);
    setQrImage(null);
    const { data, error } = await supabase.functions.invoke("evolution-proxy", {
      body: { action: "qr", instanceName, apiToken },
    });
    setLoading(false);
    if (error) return toast.error("Erro ao gerar QR Code");
    if (data?.ok === false) {
      const msg = (data?.data as { error?: string })?.error ?? "Falha na API";
      return toast.error(`Evolution: ${msg}`);
    }
    const img = extractQr(data);
    if (!img) return toast.error("QR Code não retornado pela API");
    setQrImage(img);
  }, [instanceName, apiToken]);

  useEffect(() => {
    if (!open) {
      setQrImage(null);
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    generateQr();
    pollRef.current = setInterval(async () => {
      const { data } = await supabase.functions.invoke("evolution-proxy", {
        body: { action: "status", instanceName, apiToken },
      });
      if (data?.ok) {
        const inner = ((data?.data as { data?: Record<string, unknown> })?.data ?? data?.data) as Record<string, unknown> | undefined;
        const loggedIn = inner?.LoggedIn === true || inner?.state === "open" || inner?.state === "connected";
        if (loggedIn) {
          onConnected((data?.connectedNumber as string | null) ?? null);
          onOpenChange(false);
        }
      }
    }, 3000);
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [open, generateQr, instanceName, apiToken, onConnected, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-border bg-card p-0 sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Conectar WhatsApp</h2>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 pt-4 text-center text-sm text-muted-foreground">
          Escaneie o QR Code abaixo com seu WhatsApp para conectar a instância{" "}
          <strong className="text-foreground">{instanceName}</strong>
        </div>

        <div className="flex justify-center px-5 py-5">
          <div className="flex h-64 w-64 items-center justify-center rounded-xl bg-white p-3 shadow-inner">
            {qrImage ? (
              <img src={qrImage} alt="QR Code" className="h-full w-full object-contain" />
            ) : (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            )}
          </div>
        </div>

        <div className="mx-5 mb-4 rounded-lg bg-muted/60 p-4 text-sm">
          <p className="mb-2 font-medium text-foreground">Como conectar:</p>
          <ol className="space-y-1 text-muted-foreground">
            <li>1. Abra o WhatsApp no seu celular</li>
            <li>2. Toque em Menu ou Configurações</li>
            <li>3. Toque em Dispositivos conectados</li>
            <li>4. Toque em Conectar um dispositivo</li>
            <li>5. Aponte seu celular para esta tela para capturar o código</li>
          </ol>
        </div>

        <div className="flex gap-2 border-t border-border p-3">
          <Button variant="outline" className="flex-1" onClick={generateQr} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Atualizar QR Code
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="Fechar">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
