-- 1. Assinaturas ativas
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan text NOT NULL DEFAULT 'Básico',
  status text NOT NULL DEFAULT 'inactive', -- active | inactive | expired | cancelled
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  last_payment_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own subscription"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_admin());

CREATE POLICY "Admins manage subscriptions"
  ON public.subscriptions FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- 2. Histórico de compras
CREATE TABLE public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  user_email text,
  user_name text,
  plan text NOT NULL,
  amount numeric NOT NULL,
  method text NOT NULL DEFAULT 'PIX',
  status text NOT NULL DEFAULT 'pending', -- pending | approved | rejected | cancelled | refunded
  mp_payment_id text UNIQUE,
  mp_qr_code text,
  mp_qr_code_base64 text,
  mp_ticket_url text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_purchases_user ON public.purchases(user_id);
CREATE INDEX idx_purchases_mp ON public.purchases(mp_payment_id);

CREATE POLICY "Users read own purchases"
  ON public.purchases FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_admin());

CREATE POLICY "Authenticated create own purchase"
  ON public.purchases FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Admins manage purchases"
  ON public.purchases FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- 3. Tokens de acesso por filme (link mágico)
CREATE TABLE public.access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  movie_id uuid REFERENCES public.movies(id) ON DELETE CASCADE,
  created_by uuid,
  max_uses integer DEFAULT NULL, -- null = ilimitado
  uses integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  label text
);
ALTER TABLE public.access_tokens ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_access_tokens_token ON public.access_tokens(token);
CREATE INDEX idx_access_tokens_movie ON public.access_tokens(movie_id);

CREATE POLICY "Admins manage access tokens"
  ON public.access_tokens FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- 4. Função: usuário tem acesso ativo?
CREATE OR REPLACE FUNCTION public.has_active_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = _user_id
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > now())
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'admin'
  );
$$;

-- 5. Função: resgatar token de acesso (público, sem auth)
CREATE OR REPLACE FUNCTION public.redeem_access_token(_token text, _movie_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _t public.access_tokens;
BEGIN
  SELECT * INTO _t FROM public.access_tokens
  WHERE token = _token
  LIMIT 1;

  IF _t.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  IF _t.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  IF _t.max_uses IS NOT NULL AND _t.uses >= _t.max_uses THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'used_up');
  END IF;

  IF _t.movie_id IS NOT NULL AND _t.movie_id <> _movie_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_movie');
  END IF;

  RETURN jsonb_build_object('ok', true, 'movie_id', COALESCE(_t.movie_id, _movie_id));
END;
$$;

-- 6. Função: incrementar uso (chamada quando o vídeo carrega)
CREATE OR REPLACE FUNCTION public.consume_access_token(_token text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.access_tokens SET uses = uses + 1 WHERE token = _token;
$$;

-- 7. Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER subs_updated BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER purchases_updated BEFORE UPDATE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. Permitir chamadas anônimas das funções públicas
GRANT EXECUTE ON FUNCTION public.redeem_access_token(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_access_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_access(uuid) TO authenticated;