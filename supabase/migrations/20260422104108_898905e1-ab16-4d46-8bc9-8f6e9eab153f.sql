-- Permite leitura pública (anon) dos canais ativos
DROP POLICY IF EXISTS "Anyone authenticated reads active channels" ON public.live_channels;

CREATE POLICY "Public reads active channels"
ON public.live_channels
FOR SELECT
TO anon, authenticated
USING (is_active = true OR is_admin());