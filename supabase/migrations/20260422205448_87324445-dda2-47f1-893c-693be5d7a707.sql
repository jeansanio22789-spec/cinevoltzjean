UPDATE public.live_channels 
SET stream_url = 'https://cdn-globoplay-h.fpfis.io/index.m3u8',
    fallback_url = 'https://embedflix.net/embed/globo'
WHERE name = 'TV Globo';