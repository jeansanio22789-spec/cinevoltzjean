
-- Tabela para vincular dispositivos autorizados ao admin
CREATE TABLE public.admin_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_id text NOT NULL,
  device_label text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, device_id)
);

ALTER TABLE public.admin_devices ENABLE ROW LEVEL SECURITY;

-- Apenas admins veem/gerenciam dispositivos
CREATE POLICY "Admins manage devices"
ON public.admin_devices
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Função: verifica se device é autorizado para o user
CREATE OR REPLACE FUNCTION public.is_device_authorized(_device_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_devices
    WHERE user_id = auth.uid() AND device_id = _device_id
  )
$$;

-- Função: registra device se for o primeiro do admin (regra: 1 device por admin)
-- Para permitir mais devices, admin precisa adicionar manualmente
CREATE OR REPLACE FUNCTION public.register_admin_device(_device_id text, _label text, _ua text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _user uuid := auth.uid();
  _count int;
BEGIN
  IF _user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_admin');
  END IF;

  SELECT count(*) INTO _count FROM public.admin_devices WHERE user_id = _user;

  -- Já existe device cadastrado e não é este → bloqueia
  IF _count > 0 AND NOT EXISTS (
    SELECT 1 FROM public.admin_devices WHERE user_id = _user AND device_id = _device_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'device_locked');
  END IF;

  INSERT INTO public.admin_devices (user_id, device_id, device_label, user_agent)
  VALUES (_user, _device_id, _label, _ua)
  ON CONFLICT (user_id, device_id) DO UPDATE SET last_seen_at = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Função admin para banir/ativar usuário (atualiza profile.status)
CREATE OR REPLACE FUNCTION public.admin_set_user_status(_target uuid, _status text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.profiles SET status = _status WHERE id = _target;
  RETURN true;
END;
$$;

-- Permitir admin atualizar profiles (status, plan)
CREATE POLICY "Admins update any profile"
ON public.profiles
FOR UPDATE TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Permitir admin promover/remover roles via policy já existente (Admins can manage roles) — ok.

-- Bloquear login de usuários banidos via trigger não é simples; usamos check no client + RLS
-- Adicionar policy: usuários banidos não conseguem ler movies
DROP POLICY IF EXISTS "Anyone can read published movies" ON public.movies;
CREATE POLICY "Active users read published movies"
ON public.movies
FOR SELECT TO public
USING (
  status = 'published' AND (
    auth.uid() IS NULL
    OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'Banido')
  )
);
