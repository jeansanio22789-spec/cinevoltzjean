-- Garante a flag de acesso livre
INSERT INTO public.platform_settings (key, value)
VALUES ('free_access_mode', 'true')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- Permite leitura pública dessa flag
DROP POLICY IF EXISTS "Public can read live and maintenance settings" ON public.platform_settings;
CREATE POLICY "Public can read live and maintenance settings"
ON public.platform_settings
FOR SELECT
TO anon, authenticated
USING (key = ANY (ARRAY[
  'live_stream_url',
  'live_stream_title',
  'live_thumbnail_enabled',
  'maintenance_mode',
  'maintenance_message',
  'free_access_mode'
]));

-- has_active_access agora respeita o modo de teste
CREATE OR REPLACE FUNCTION public.has_active_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    -- Modo de teste liberado para todo mundo
    COALESCE((SELECT value = 'true' FROM public.platform_settings WHERE key = 'free_access_mode'), false)
    OR EXISTS (
      SELECT 1 FROM public.subscriptions
      WHERE user_id = _user_id
        AND status = 'active'
        AND (expires_at IS NULL OR expires_at > now())
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = 'admin'
    );
$function$;

-- has_movie_access também respeita o modo de teste
CREATE OR REPLACE FUNCTION public.has_movie_access(_user_id uuid, _movie_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE((SELECT value = 'true' FROM public.platform_settings WHERE key = 'free_access_mode'), false)
    OR public.has_role(_user_id, 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_movie_access
      WHERE user_id = _user_id
        AND movie_id = _movie_id
        AND (expires_at IS NULL OR expires_at > now())
    );
$function$;