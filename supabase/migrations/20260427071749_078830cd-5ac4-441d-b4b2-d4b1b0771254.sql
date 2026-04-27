-- Preço por título (default R$ 10,00)
ALTER TABLE public.movies
  ADD COLUMN IF NOT EXISTS price numeric NOT NULL DEFAULT 10.00;

-- Permitir que uma compra esteja vinculada a um filme específico
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS movie_id uuid REFERENCES public.movies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchases_movie_id ON public.purchases(movie_id);