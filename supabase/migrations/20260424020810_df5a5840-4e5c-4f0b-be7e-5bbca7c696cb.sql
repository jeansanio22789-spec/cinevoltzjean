-- Tabela de patrocinadores
CREATE TABLE public.sponsors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  logo_url TEXT,
  target_url TEXT NOT NULL,
  monthly_amount NUMERIC NOT NULL DEFAULT 0,
  placement TEXT NOT NULL DEFAULT 'banner', -- 'banner' | 'overlay' | 'both'
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sponsors ENABLE ROW LEVEL SECURITY;

-- Público lê apenas ativos e dentro da janela
CREATE POLICY "Public reads active sponsors"
ON public.sponsors FOR SELECT
TO anon, authenticated
USING (
  is_active = true
  AND (expires_at IS NULL OR expires_at > now())
  OR public.is_admin()
);

-- Admin gerencia tudo
CREATE POLICY "Admins manage sponsors"
ON public.sponsors FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Trigger updated_at
CREATE TRIGGER update_sponsors_updated_at
BEFORE UPDATE ON public.sponsors
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Função pública pra registrar clique sem RLS
CREATE OR REPLACE FUNCTION public.track_sponsor_event(_sponsor_id UUID, _event TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _event = 'click' THEN
    UPDATE public.sponsors SET clicks = clicks + 1 WHERE id = _sponsor_id;
  ELSIF _event = 'impression' THEN
    UPDATE public.sponsors SET impressions = impressions + 1 WHERE id = _sponsor_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.track_sponsor_event(UUID, TEXT) TO anon, authenticated;