INSERT INTO storage.buckets (id, name, public) VALUES ('thumbnails', 'thumbnails', true);

CREATE POLICY "Authenticated users can upload thumbnails"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'thumbnails');

CREATE POLICY "Public can read thumbnails"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'thumbnails');

CREATE POLICY "Authenticated users can delete thumbnails"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'thumbnails');