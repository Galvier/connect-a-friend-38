
-- whatsapp_instances: token por instância, número conectado e updated_at
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS api_token text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS connected_number text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.whatsapp_instances ALTER COLUMN api_token DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS whatsapp_instances_set_updated_at ON public.whatsapp_instances;
CREATE TRIGGER whatsapp_instances_set_updated_at
BEFORE UPDATE ON public.whatsapp_instances
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Permitir usuários atualizarem connected_number das próprias instâncias
DROP POLICY IF EXISTS "Users update own instance status" ON public.whatsapp_instances;
CREATE POLICY "Users update own instance status"
ON public.whatsapp_instances
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- profiles: nome e flag must_change_password
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
