ALTER TABLE public.movies ADD COLUMN IF NOT EXISTS is_premiere boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_movies_is_premiere ON public.movies(is_premiere) WHERE is_premiere = true;