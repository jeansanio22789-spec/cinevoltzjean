-- Normaliza um UID NFC (remove separadores, força maiúsculas)
CREATE OR REPLACE FUNCTION public._normalize_nfc_uid(_uid text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT upper(regexp_replace(coalesce(_uid, ''), '[^0-9A-Fa-f]', '', 'g'));
$$;

-- Inverte os bytes hex (ex: AABBCCDD -> DDCCBBAA) para tolerar little vs big endian
CREATE OR REPLACE FUNCTION public._reverse_hex_bytes(_hex text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  _i int;
  _out text := '';
BEGIN
  IF _hex IS NULL OR length(_hex) = 0 OR length(_hex) % 2 <> 0 THEN
    RETURN _hex;
  END IF;
  FOR _i IN REVERSE (length(_hex) - 1)..0 BY 2 LOOP
    _out := _out || substr(_hex, _i, 2);
  END LOOP;
  RETURN _out;
END;
$$;

-- Reescreve issue_admin_nfc_challenge tolerando variações de UID
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
  _uid text := public._normalize_nfc_uid(_tag_uid);
  _uid_rev text := public._reverse_hex_bytes(_uid);
BEGIN
  SELECT t.user_id, p.email
    INTO _user_id, _email
  FROM public.admin_nfc_tags t
  JOIN public.profiles p ON p.id = t.user_id
  WHERE public._normalize_nfc_uid(t.tag_uid) = _uid
     OR public._normalize_nfc_uid(t.tag_uid) = _uid_rev
     OR _uid LIKE '%' || public._normalize_nfc_uid(t.tag_uid) || '%'
     OR public._normalize_nfc_uid(t.tag_uid) LIKE '%' || _uid || '%'
  LIMIT 1;

  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_tag');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_admin');
  END IF;

  DELETE FROM public.admin_nfc_challenges
   WHERE user_id = _user_id AND (expires_at < now() OR consumed_at IS NOT NULL);

  INSERT INTO public.admin_nfc_challenges (user_id, tag_uid)
  VALUES (_user_id, _uid)
  RETURNING token INTO _token;

  UPDATE public.admin_nfc_tags SET last_used_at = now()
   WHERE user_id = _user_id
     AND (public._normalize_nfc_uid(tag_uid) = _uid OR public._normalize_nfc_uid(tag_uid) = _uid_rev);

  RETURN jsonb_build_object('ok', true, 'email', _email, 'token', _token);
END;
$$;

-- Mesma tolerância na aprovação remota
CREATE OR REPLACE FUNCTION public.approve_admin_login_with_nfc(_request_id uuid, _tag_uid text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user uuid := auth.uid();
  _req public.login_requests;
  _tag public.admin_nfc_tags;
  _uid text := public._normalize_nfc_uid(_tag_uid);
  _uid_rev text := public._reverse_hex_bytes(_uid);
BEGIN
  IF _user IS NULL OR NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authorized');
  END IF;

  SELECT * INTO _tag FROM public.admin_nfc_tags
  WHERE user_id = _user
    AND (public._normalize_nfc_uid(tag_uid) = _uid
      OR public._normalize_nfc_uid(tag_uid) = _uid_rev
      OR _uid LIKE '%' || public._normalize_nfc_uid(tag_uid) || '%'
      OR public._normalize_nfc_uid(tag_uid) LIKE '%' || _uid || '%')
  LIMIT 1;
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

-- E na lookup_email_by_nfc também
CREATE OR REPLACE FUNCTION public.lookup_email_by_nfc(_tag_uid text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email text;
  _uid text := public._normalize_nfc_uid(_tag_uid);
  _uid_rev text := public._reverse_hex_bytes(_uid);
BEGIN
  SELECT p.email INTO _email
  FROM public.admin_nfc_tags t
  JOIN public.profiles p ON p.id = t.user_id
  WHERE public._normalize_nfc_uid(t.tag_uid) = _uid
     OR public._normalize_nfc_uid(t.tag_uid) = _uid_rev
     OR _uid LIKE '%' || public._normalize_nfc_uid(t.tag_uid) || '%'
     OR public._normalize_nfc_uid(t.tag_uid) LIKE '%' || _uid || '%'
  LIMIT 1;

  IF _email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_tag');
  END IF;
  RETURN jsonb_build_object('ok', true, 'email', _email);
END;
$$;