CREATE OR REPLACE FUNCTION public.has_plan_access(_user_id uuid, _movie_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    -- modo grátis global
    COALESCE((SELECT value = 'true' FROM public.platform_settings WHERE key = 'free_access_mode'), false)
    -- admin tem acesso total
    OR public.has_role(_user_id, 'admin'::app_role)
    -- compra individual (vitalícia ou ainda válida)
    OR EXISTS (
      SELECT 1 FROM public.user_movie_access
      WHERE user_id = _user_id AND movie_id = _movie_id
        AND (expires_at IS NULL OR expires_at > now())
    )
    -- assinatura ativa cobrindo um plano que libera esse filme
    OR EXISTS (
      SELECT 1 FROM public.subscriptions s
      JOIN public.plan_movies pm ON pm.plan_id = s.plan_id
      WHERE s.user_id = _user_id
        AND s.status = 'active'
        AND (s.expires_at IS NULL OR s.expires_at > now())
        AND pm.movie_id = _movie_id
    );
$function$;