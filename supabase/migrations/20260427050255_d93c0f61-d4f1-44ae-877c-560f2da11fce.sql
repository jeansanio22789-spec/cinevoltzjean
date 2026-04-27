-- Permite descobrir o email do admin associado a um crachá NFC
-- (apenas o email, para autopreencher a tela de login)
CREATE OR REPLACE FUNCTION public.lookup_email_by_nfc(_tag_uid text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email text;
BEGIN
  SELECT p.email INTO _email
  FROM public.admin_nfc_tags t
  JOIN public.profiles p ON p.id = t.user_id
  WHERE t.tag_uid = _tag_uid
  LIMIT 1;

  IF _email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_tag');
  END IF;

  RETURN jsonb_build_object('ok', true, 'email', _email);
END;
$$;

-- Permite chamada anônima (precisamos disso ANTES de logar)
GRANT EXECUTE ON FUNCTION public.lookup_email_by_nfc(text) TO anon, authenticated;