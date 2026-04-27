-- Tabela para sincronizar a fila de uploads entre dispositivos do admin
CREATE TABLE public.upload_jobs (
  id text PRIMARY KEY,
  user_id uuid NOT NULL,
  device_label text,
  file_name text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  title text NOT NULL,
  genre text,
  description text,
  status text NOT NULL DEFAULT 'queued',
  progress numeric NOT NULL DEFAULT 0,
  speed_mbs numeric NOT NULL DEFAULT 0,
  eta_sec numeric NOT NULL DEFAULT 0,
  upload_path text,
  error_msg text,
  started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.upload_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage upload jobs"
  ON public.upload_jobs
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE TRIGGER upload_jobs_updated_at
  BEFORE UPDATE ON public.upload_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_upload_jobs_status ON public.upload_jobs (status);
CREATE INDEX idx_upload_jobs_updated_at ON public.upload_jobs (updated_at DESC);

-- Habilita realtime
ALTER TABLE public.upload_jobs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.upload_jobs;