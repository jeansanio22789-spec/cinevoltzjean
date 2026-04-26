
-- 1) Filmes: só admin pode criar/editar/apagar. Cliente continua só lendo publicados.
DROP POLICY IF EXISTS "Authenticated users can manage movies" ON public.movies;

CREATE POLICY "Admins manage movies"
ON public.movies
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 2) Storage do bucket "videos": cliente só LÊ (bucket é público pra streaming).
--    Só admin pode upload / update / delete.
DROP POLICY IF EXISTS "Public read videos bucket" ON storage.objects;
DROP POLICY IF EXISTS "Admins upload videos bucket" ON storage.objects;
DROP POLICY IF EXISTS "Admins update videos bucket" ON storage.objects;
DROP POLICY IF EXISTS "Admins delete videos bucket" ON storage.objects;

CREATE POLICY "Public read videos bucket"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'videos');

CREATE POLICY "Admins upload videos bucket"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'videos' AND public.is_admin());

CREATE POLICY "Admins update videos bucket"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'videos' AND public.is_admin())
WITH CHECK (bucket_id = 'videos' AND public.is_admin());

CREATE POLICY "Admins delete videos bucket"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'videos' AND public.is_admin());
