ALTER TABLE public.upload_jobs
  ADD COLUMN IF NOT EXISTS upload_mode text,
  ADD COLUMN IF NOT EXISTS upload_parts_total integer,
  ADD COLUMN IF NOT EXISTS upload_part_bytes bigint,
  ADD COLUMN IF NOT EXISTS upload_part_current integer;

CREATE INDEX IF NOT EXISTS idx_upload_jobs_status_updated_at
  ON public.upload_jobs (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_upload_jobs_user_updated_at
  ON public.upload_jobs (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_movies_created_at_desc
  ON public.movies (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_movies_status_created_at_desc
  ON public.movies (status, created_at DESC);