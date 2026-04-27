-- Tabela de desafios NFC para autenticação multifator do admin
CREATE TABLE IF NOT EXISTS public.admin_nfc_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  user_id uuid NOT NULL,
  tag_uid text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  consumed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_admin_nfc_challenges_token ON public.admin_nfc_challenges (token);
CREATE INDEX IF NOT EXISTS idx_admin_nfc_challenges_user ON public.admin_nfc_challenges (user_id, expires_at);

ALTER TABLE public.admin_nfc_challenges ENABLE ROW LEVEL SECURITY;

-- Sem políticas públicas: somente as funções SECURITY DEFINER acessam.

-- Cria um desafio a partir do UID do crachá. Pode ser chamado SEM login.
CREATE OR REPLACE FUNCTION public.issue_admin_nfc_challenge(_tag_uid text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid;
  _email text;
  _token text;
BEGIN
  SELECT t.user_id, p.email
    INTO _user_id, _email
  FROM public.admin_nfc_tags t
  JOIN public.profiles p ON p.id = t.user_id
  WHERE t.tag_uid = _tag_uid
  LIMIT 1;

  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_tag');
  END IF;

  -- Confirma que o dono do crachá realmente é admin
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_admin');
  END IF;

  -- Limpa desafios antigos do mesmo admin
  DELETE FROM public.admin_nfc_challenges
   WHERE user_id = _user_id AND (expires_at < now() OR consumed_at IS NOT NULL);

  INSERT INTO public.admin_nfc_challenges (user_id, tag_uid)
  VALUES (_user_id, _tag_uid)
  RETURNING token INTO _token;

  -- Marca uso do crachá
  UPDATE public.admin_nfc_tags SET last_used_at = now()
   WHERE user_id = _user_id AND tag_uid = _tag_uid;

  RETURN jsonb_build_object('ok', true, 'email', _email, 'token', _token);
END;
$$;

-- Consome o desafio APÓS o login com senha.
-- Retorna ok=true se o crachá apresentado pertence ao usuário logado e ainda é válido.
CREATE OR REPLACE FUNCTION public.consume_admin_nfc_challenge(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ch public.admin_nfc_challenges;
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  SELECT * INTO _ch FROM public.admin_nfc_challenges
   WHERE token = _token
   LIMIT 1;

  IF _ch.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_token');
  END IF;

  IF _ch.consumed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_used');
  END IF;

  IF _ch.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  IF _ch.user_id <> _uid THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'mismatch');
  END IF;

  UPDATE public.admin_nfc_challenges SET consumed_at = now() WHERE id = _ch.id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.issue_admin_nfc_challenge(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_admin_nfc_challenge(text) TO authenticated;