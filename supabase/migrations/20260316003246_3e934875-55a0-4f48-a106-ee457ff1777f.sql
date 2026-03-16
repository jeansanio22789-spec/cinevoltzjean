
-- Profiles table (synced with auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  name TEXT DEFAULT '',
  plan TEXT DEFAULT 'Básico',
  status TEXT DEFAULT 'Ativo',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by authenticated users"
ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', ''));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Platform settings table
CREATE TABLE public.platform_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT DEFAULT '',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Settings readable by authenticated"
ON public.platform_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Settings writable by authenticated"
ON public.platform_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Insert defaults
INSERT INTO public.platform_settings (key, value) VALUES
  ('platform_name', 'StreamFlix'),
  ('maintenance_mode', 'false'),
  ('email_alerts', 'true'),
  ('weekly_reports', 'true');

-- Transactions table
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name TEXT DEFAULT '',
  user_email TEXT DEFAULT '',
  plan TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  method TEXT DEFAULT 'PIX',
  status TEXT DEFAULT 'Pendente',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Transactions readable by authenticated"
ON public.transactions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Transactions insertable by authenticated"
ON public.transactions FOR INSERT TO authenticated WITH CHECK (true);

-- Video storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('videos', 'videos', true, 52428800000);

-- Storage policies for videos bucket
CREATE POLICY "Authenticated users can upload videos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'videos');

CREATE POLICY "Anyone can view videos"
ON storage.objects FOR SELECT
USING (bucket_id = 'videos');

CREATE POLICY "Authenticated users can delete videos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'videos');
