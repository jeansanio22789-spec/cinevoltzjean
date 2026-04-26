-- =========== PLANS ===========
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  duration_days INTEGER NOT NULL DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  features JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public reads active plans" ON public.plans
  FOR SELECT TO anon, authenticated
  USING (is_active = true OR public.is_admin());

CREATE POLICY "Admins manage plans" ON public.plans
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TRIGGER update_plans_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default plans
INSERT INTO public.plans (name, description, price, duration_days, sort_order, features) VALUES
  ('Mensal', 'Acesso completo por 30 dias', 19.90, 30, 1, '["Catálogo completo","Sem anúncios","Cancele quando quiser"]'::jsonb),
  ('Anual', 'Acesso completo por 365 dias - economize', 199.00, 365, 2, '["Catálogo completo","Sem anúncios","2 meses grátis"]'::jsonb);

-- =========== PLAN <-> MOVIES ===========
CREATE TABLE public.plan_movies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  movie_id UUID NOT NULL REFERENCES public.movies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(plan_id, movie_id)
);
ALTER TABLE public.plan_movies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public reads plan_movies" ON public.plan_movies
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Admins manage plan_movies" ON public.plan_movies
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE INDEX idx_plan_movies_movie ON public.plan_movies(movie_id);
CREATE INDEX idx_plan_movies_plan ON public.plan_movies(plan_id);

-- =========== SUBSCRIPTIONS: link to plans ===========
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL;

-- =========== VIDEO VIEWS ===========
CREATE TABLE public.video_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movie_id UUID NOT NULL REFERENCES public.movies(id) ON DELETE CASCADE,
  user_id UUID,
  watched_seconds INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.video_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone logs view" ON public.video_views
  FOR INSERT TO anon, authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "Admins read views" ON public.video_views
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "Users read own views" ON public.video_views
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE INDEX idx_video_views_movie ON public.video_views(movie_id);
CREATE INDEX idx_video_views_created ON public.video_views(created_at DESC);

-- =========== NOTIFICATIONS ===========
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  message TEXT DEFAULT '',
  link TEXT DEFAULT '',
  type TEXT DEFAULT 'info',
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins insert notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "Users delete own notifications" ON public.notifications
  FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.is_admin());

CREATE INDEX idx_notifications_user ON public.notifications(user_id, is_read, created_at DESC);

-- =========== ACCESS CHECK BY PLAN ===========
CREATE OR REPLACE FUNCTION public.has_plan_access(_user_id UUID, _movie_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- modo grátis global
    COALESCE((SELECT value = 'true' FROM public.platform_settings WHERE key = 'free_access_mode'), false)
    -- admin
    OR public.has_role(_user_id, 'admin'::app_role)
    -- acesso individual
    OR EXISTS (
      SELECT 1 FROM public.user_movie_access
      WHERE user_id = _user_id AND movie_id = _movie_id
        AND (expires_at IS NULL OR expires_at > now())
    )
    -- filme livre (não vinculado a nenhum plano)
    OR NOT EXISTS (SELECT 1 FROM public.plan_movies WHERE movie_id = _movie_id)
    -- assinatura ativa cobrindo um plano que libera esse filme
    OR EXISTS (
      SELECT 1 FROM public.subscriptions s
      JOIN public.plan_movies pm ON pm.plan_id = s.plan_id
      WHERE s.user_id = _user_id
        AND s.status = 'active'
        AND (s.expires_at IS NULL OR s.expires_at > now())
        AND pm.movie_id = _movie_id
    );
$$;

-- =========== TRIGGER: notify on movie publish ===========
CREATE OR REPLACE FUNCTION public.notify_subscribers_new_movie()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published') THEN
    INSERT INTO public.notifications (user_id, title, message, link, type)
    SELECT
      p.id,
      'Novo conteúdo: ' || NEW.title,
      COALESCE(NULLIF(NEW.description, ''), 'Um novo título acabou de chegar no catálogo.'),
      '/watch/' || NEW.id::text,
      'new_movie'
    FROM public.profiles p
    WHERE COALESCE(p.status, 'Ativo') <> 'Banido';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS movies_notify_publish ON public.movies;
CREATE TRIGGER movies_notify_publish
  AFTER INSERT OR UPDATE OF status ON public.movies
  FOR EACH ROW EXECUTE FUNCTION public.notify_subscribers_new_movie();

-- =========== BRANDING SETTINGS (seed) ===========
INSERT INTO public.platform_settings (key, value) VALUES
  ('brand_name', 'Streamflix'),
  ('brand_logo_url', ''),
  ('brand_primary_hsl', '0 100% 50%'),
  ('brand_accent_hsl', '0 100% 50%')
ON CONFLICT DO NOTHING;