ALTER TABLE public.live_channels
ADD COLUMN IF NOT EXISTS fallback_url text;