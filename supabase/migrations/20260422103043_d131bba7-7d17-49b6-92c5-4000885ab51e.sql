CREATE TABLE IF NOT EXISTS public.live_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  stream_url text NOT NULL,
  logo_url text,
  category text DEFAULT 'TV Aberta',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.live_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated reads active channels"
ON public.live_channels FOR SELECT
TO authenticated
USING (is_active = true OR public.is_admin());

CREATE POLICY "Admins manage channels"
ON public.live_channels FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE TRIGGER trg_live_channels_updated_at
BEFORE UPDATE ON public.live_channels
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_live_channels_sort ON public.live_channels (sort_order, name);