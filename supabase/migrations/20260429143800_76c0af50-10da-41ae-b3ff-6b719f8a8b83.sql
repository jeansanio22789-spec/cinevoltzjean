ALTER TABLE public.turkish_episodes
  ADD COLUMN IF NOT EXISTS resolved_url text,
  ADD COLUMN IF NOT EXISTS resolved_at timestamp with time zone;