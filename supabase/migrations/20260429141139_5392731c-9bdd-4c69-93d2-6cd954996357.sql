
CREATE TABLE public.turkish_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url text UNIQUE NOT NULL,
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  description text DEFAULT '',
  thumbnail_url text,
  language text DEFAULT 'Dublado',
  genre text DEFAULT 'Novela Turca',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  episodes_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.turkish_episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id uuid NOT NULL REFERENCES public.turkish_series(id) ON DELETE CASCADE,
  episode_number integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  source_url text,
  player_url text,
  thumbnail_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(series_id, episode_number, title)
);

CREATE INDEX ON public.turkish_episodes(series_id, episode_number);

ALTER TABLE public.turkish_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turkish_episodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public reads active turkish series"
  ON public.turkish_series FOR SELECT
  USING (is_active = true OR is_admin());

CREATE POLICY "Admins manage turkish series"
  ON public.turkish_series FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Public reads turkish episodes"
  ON public.turkish_episodes FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.turkish_series s WHERE s.id = series_id AND (s.is_active OR is_admin())));

CREATE POLICY "Admins manage turkish episodes"
  ON public.turkish_episodes FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE TRIGGER trg_turkish_series_updated
  BEFORE UPDATE ON public.turkish_series
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
