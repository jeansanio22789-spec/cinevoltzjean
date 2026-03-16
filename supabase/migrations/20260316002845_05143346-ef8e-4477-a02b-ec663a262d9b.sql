
-- Create movies table
CREATE TABLE public.movies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  video_url TEXT,
  thumbnail_url TEXT,
  description TEXT DEFAULT '',
  genre TEXT DEFAULT 'Ação',
  year INTEGER DEFAULT 2025,
  duration TEXT DEFAULT '',
  rating TEXT DEFAULT '14+',
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.movies ENABLE ROW LEVEL SECURITY;

-- Public can read published movies
CREATE POLICY "Anyone can read published movies"
ON public.movies
FOR SELECT
USING (status = 'published');

-- Authenticated admin can do everything (we'll check email in app code)
CREATE POLICY "Authenticated users can manage movies"
ON public.movies
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
