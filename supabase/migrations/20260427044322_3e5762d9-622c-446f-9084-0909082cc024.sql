
-- Tabela com os crachás NFC autorizados por admin
CREATE TABLE public.admin_nfc_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tag_uid text NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  UNIQUE (user_id, tag_uid)
);

ALTER TABLE public.admin_nfc_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage own nfc tags"
  ON public.admin_nfc_tags
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id AND public.is_admin())
  WITH CHECK (auth.uid() = user_id AND public.is_admin());

-- Aprova um login pendente usando o UID de um crachá NFC do admin logado
CREATE OR REPLACE FUNCTION public.approve_admin_login_with_nfc(
  _request_id uuid,
  _tag_uid text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user uuid := auth.uid();
  _req public.login_requests;
  _tag public.admin_nfc_tags;
BEGIN
  IF _user IS NULL OR NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authorized');
  END IF;

  SELECT * INTO _tag FROM public.admin_nfc_tags
  WHERE user_id = _user AND tag_uid = _tag_uid;
  IF _tag.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_tag');
  END IF;

  SELECT * INTO _req FROM public.login_requests
  WHERE id = _request_id AND user_id = _user;
  IF _req.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'request_not_found');
  END IF;
  IF _req.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_decided', 'status', _req.status);
  END IF;
  IF _req.expires_at < now() THEN
    UPDATE public.login_requests SET status = 'expired' WHERE id = _request_id;
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  UPDATE public.login_requests
  SET status = 'approved', decided_at = now()
  WHERE id = _request_id;

  INSERT INTO public.admin_devices (user_id, device_id, device_label, user_agent)
  VALUES (_user, _req.device_id, _req.device_label, _req.user_agent)
  ON CONFLICT (user_id, device_id) DO UPDATE SET last_seen_at = now();

  UPDATE public.admin_nfc_tags SET last_used_at = now() WHERE id = _tag.id;

  RETURN jsonb_build_object('ok', true, 'status', 'approved');
END;
$$;
