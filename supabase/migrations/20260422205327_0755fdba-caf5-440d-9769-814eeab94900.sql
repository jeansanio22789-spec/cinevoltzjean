UPDATE public.live_channels 
SET stream_url = 'https://embedcanaistv.com/embed/globo-rj.php',
    fallback_url = 'https://reidoplay.app/embed/?canal=globo'
WHERE name = 'TV Globo';