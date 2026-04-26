-- 1. Coluna do link do Telegram no filme
ALTER TABLE public.movies
  ADD COLUMN IF NOT EXISTS telegram_url text;

-- 2. Tabela de acessos individuais por usuário/filme
CREATE TABLE IF NOT EXISTS public.user_movie_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  movie_id uuid NOT NULL REFERENCES public.movies(id) ON DELETE CASCADE,
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  UNIQUE (user_id, movie_id)
);

CREATE INDEX IF NOT EXISTS idx_user_movie_access_user ON public.user_movie_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_movie_access_movie ON public.user_movie_access(movie_id);

ALTER TABLE public.user_movie_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage user_movie_access"
  ON public.user_movie_access FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Users read own access"
  ON public.user_movie_access FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

-- 3. Função que diz se um usuário pode ver um filme específico
CREATE OR REPLACE FUNCTION public.has_movie_access(_user_id uuid, _movie_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- admin sempre vê
    public.has_role(_user_id, 'admin'::app_role)
    OR
    -- ou tem registro de acesso ativo
    EXISTS (
      SELECT 1 FROM public.user_movie_access
      WHERE user_id = _user_id
        AND movie_id = _movie_id
        AND (expires_at IS NULL OR expires_at > now())
    );
$$;