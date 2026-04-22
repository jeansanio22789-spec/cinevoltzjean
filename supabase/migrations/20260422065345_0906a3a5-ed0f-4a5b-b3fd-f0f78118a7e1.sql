INSERT INTO public.platform_settings (key, value)
VALUES 
  ('maintenance_message', 'Estamos em manutenção. Voltamos já! 🛠️'),
  ('live_thumbnail_enabled', 'true'),
  ('live_stream_url', 'https://www2.meufut.xyz/bbb26'),
  ('live_stream_title', 'AO VIVO 24H')
ON CONFLICT (key) DO NOTHING;