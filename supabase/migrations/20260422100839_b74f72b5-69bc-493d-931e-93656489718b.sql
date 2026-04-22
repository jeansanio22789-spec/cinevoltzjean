-- Tabela de solicitações de login do admin em dispositivos novos
CREATE TABLE public.login_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_id text NOT NULL,
  device_label text,
  user_agent text,
  ip_address text,
  status text NOT NULL DEFAULT 'pending', -- pending | approved | denied | expired
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes')
);

CREATE INDEX idx_login_requests_user_status ON public.login_requests(user_id, status, created_at DESC);
CREATE INDEX idx_login_requests_device ON public.login_requests(device_id, status);

ALTER TABLE public.login_requests ENABLE ROW LEVEL SECURITY;

-- O próprio admin vê e gerencia suas solicitações
CREATE POLICY "Admin views own login requests"
ON public.login_requests
FOR SELECT
TO authenticated
USING (auth.uid() = user_id AND public.is_admin());

CREATE POLICY "Admin updates own login requests"
ON public.login_requests
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id AND public.is_admin())
WITH CHECK (auth.uid() = user_id AND public.is_admin());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.login_requests;
ALTER TABLE public.login_requests REPLICA IDENTITY FULL;

-- Função: dispositivo novo cria a solicitação (chamada após login bem-sucedido)
CREATE OR REPLACE FUNCTION public.request_admin_login(
  _device_id text,
  _device_label text,
  _user_agent text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user uuid := auth.uid();
  _request_id uuid;
BEGIN
  IF _user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  -- Se não é admin, não precisa de aprovação
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', true, 'status', 'not_required');
  END IF;

  -- Se o dispositivo já é autorizado, libera direto
  IF EXISTS (SELECT 1 FROM public.admin_devices WHERE user_id = _user AND device_id = _device_id) THEN
    RETURN jsonb_build_object('ok', true, 'status', 'already_authorized');
  END IF;

  -- Marca solicitações antigas pendentes do mesmo device como expiradas
  UPDATE public.login_requests
  SET status = 'expired'
  WHERE user_id = _user AND device_id = _device_id AND status = 'pending';

  -- Cria nova solicitação
  INSERT INTO public.login_requests (user_id, device_id, device_label, user_agent)
  VALUES (_user, _device_id, _device_label, _user_agent)
  RETURNING id INTO _request_id;

  RETURN jsonb_build_object('ok', true, 'status', 'pending', 'request_id', _request_id);
END;
$$;

-- Função: celular principal aprova ou nega
CREATE OR REPLACE FUNCTION public.decide_admin_login(
  _request_id uuid,
  _decision text -- 'approve' | 'deny'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user uuid := auth.uid();
  _req public.login_requests;
BEGIN
  IF _user IS NULL OR NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authorized');
  END IF;

  SELECT * INTO _req FROM public.login_requests
  WHERE id = _request_id AND user_id = _user;

  IF _req.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF _req.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_decided', 'status', _req.status);
  END IF;

  IF _req.expires_at < now() THEN
    UPDATE public.login_requests SET status = 'expired' WHERE id = _request_id;
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  IF _decision = 'approve' THEN
    UPDATE public.login_requests
    SET status = 'approved', decided_at = now()
    WHERE id = _request_id;

    -- Autoriza o dispositivo automaticamente
    INSERT INTO public.admin_devices (user_id, device_id, device_label, user_agent)
    VALUES (_user, _req.device_id, _req.device_label, _req.user_agent)
    ON CONFLICT (user_id, device_id) DO UPDATE SET last_seen_at = now();

    RETURN jsonb_build_object('ok', true, 'status', 'approved');
  ELSIF _decision = 'deny' THEN
    UPDATE public.login_requests
    SET status = 'denied', decided_at = now()
    WHERE id = _request_id;
    RETURN jsonb_build_object('ok', true, 'status', 'denied');
  ELSE
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_decision');
  END IF;
END;
$$;

-- Função: dispositivo solicitante consulta status
CREATE OR REPLACE FUNCTION public.check_admin_login_status(_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _req public.login_requests;
BEGIN
  SELECT * INTO _req FROM public.login_requests WHERE id = _request_id;
  IF _req.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF _req.status = 'pending' AND _req.expires_at < now() THEN
    RETURN jsonb_build_object('ok', true, 'status', 'expired');
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', _req.status);
END;
$$;