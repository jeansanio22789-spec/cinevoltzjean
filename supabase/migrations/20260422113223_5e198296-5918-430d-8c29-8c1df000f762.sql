create policy "Public can read live and maintenance settings"
on public.platform_settings
for select
to anon, authenticated
using (
  key in (
    'live_stream_url',
    'live_stream_title',
    'live_thumbnail_enabled',
    'maintenance_mode',
    'maintenance_message'
  )
);