UPDATE public.platform_settings SET value='https://video09.logicahost.com.br/sbtcuiaba/sbtcuiaba/playlist.m3u8', updated_at=now() WHERE key='live_stream_url';
UPDATE public.platform_settings SET value='SBT ao vivo', updated_at=now() WHERE key='live_stream_title';
INSERT INTO public.platform_settings (key, value)
SELECT 'live_stream_url', 'https://video09.logicahost.com.br/sbtcuiaba/sbtcuiaba/playlist.m3u8'
WHERE NOT EXISTS (SELECT 1 FROM public.platform_settings WHERE key='live_stream_url');
INSERT INTO public.platform_settings (key, value)
SELECT 'live_stream_title', 'SBT ao vivo'
WHERE NOT EXISTS (SELECT 1 FROM public.platform_settings WHERE key='live_stream_title');