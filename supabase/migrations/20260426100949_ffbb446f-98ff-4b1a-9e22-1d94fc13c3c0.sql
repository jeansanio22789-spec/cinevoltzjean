-- Tabela pra guardar a STRING_SESSION do MTProto (1 sessão global do admin)
CREATE TABLE IF NOT EXISTS public.mtproto_sessions (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  string_session TEXT NOT NULL,
  phone TEXT,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mtproto_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage mtproto session"
ON public.mtproto_sessions FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Tabela temporária pra guardar o phone_code_hash entre os 2 passos do login
CREATE TABLE IF NOT EXISTS public.mtproto_pending_logins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  phone TEXT NOT NULL,
  phone_code_hash TEXT NOT NULL,
  temp_session TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes')
);

ALTER TABLE public.mtproto_pending_logins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage own pending logins"
ON public.mtproto_pending_logins FOR ALL
TO authenticated
USING (public.is_admin() AND auth.uid() = user_id)
WITH CHECK (public.is_admin() AND auth.uid() = user_id);