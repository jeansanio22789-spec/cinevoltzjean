ALTER TABLE public.movies
ADD COLUMN IF NOT EXISTS audio TEXT DEFAULT 'Original';

COMMENT ON COLUMN public.movies.audio IS 'Faixa de áudio: Dublado, Legendado, Dual ou Original';