-- ============================================================
-- AnyOne16 — Stage 4 core schema
-- Global-first: country / language / currency / timezone are
-- independent dimensions. Money is always amount + currency_code.
-- Demo rows are flagged with is_demo = true and are readable and
-- writable by anyone (sandbox). Real rows are owned by auth users.
-- ============================================================

-- ---------- enums ----------
CREATE TYPE public.app_role AS ENUM ('customer', 'worker', 'admin');

CREATE TYPE public.favor_status AS ENUM (
  'draft','published','receiving_offers','worker_selected','on_the_way',
  'arrived','in_progress','near_destination','completed','cancelled','disputed'
);

CREATE TYPE public.offer_status AS ENUM ('pending','accepted','rejected','withdrawn','expired');

CREATE TYPE public.message_type AS ENUM ('text','image','location','system');

CREATE TYPE public.verification_status AS ENUM ('pending','verified','rejected','expired');

CREATE TYPE public.availability_status AS ENUM ('available','unavailable');

-- ---------- reference: countries / languages / currencies / categories ----------
CREATE TABLE public.languages (
  code text PRIMARY KEY,
  name text NOT NULL,
  native_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);
GRANT SELECT ON public.languages TO anon, authenticated;
GRANT ALL ON public.languages TO service_role;
ALTER TABLE public.languages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "languages are public" ON public.languages FOR SELECT USING (true);

CREATE TABLE public.currencies (
  code text PRIMARY KEY,
  name text NOT NULL,
  symbol text NOT NULL,
  decimal_places smallint NOT NULL DEFAULT 2,
  is_active boolean NOT NULL DEFAULT true
);
GRANT SELECT ON public.currencies TO anon, authenticated;
GRANT ALL ON public.currencies TO service_role;
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "currencies are public" ON public.currencies FOR SELECT USING (true);

CREATE TABLE public.countries (
  code text PRIMARY KEY,
  name text NOT NULL,
  default_language_code text NOT NULL REFERENCES public.languages(code),
  default_currency_code text NOT NULL REFERENCES public.currencies(code),
  timezone text NOT NULL,
  is_active boolean NOT NULL DEFAULT false
);
GRANT SELECT ON public.countries TO anon, authenticated;
GRANT ALL ON public.countries TO service_role;
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "countries are public" ON public.countries FOR SELECT USING (true);

CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  icon text,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories are public" ON public.categories FOR SELECT USING (true);

-- ---------- app users (profiles of auth.users) ----------
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE,
  email text,
  phone text,
  full_name text,
  avatar_url text,
  country_code text NOT NULL DEFAULT 'CO' REFERENCES public.countries(code),
  language_code text NOT NULL DEFAULT 'es' REFERENCES public.languages(code),
  currency_code text NOT NULL DEFAULT 'COP' REFERENCES public.currencies(code),
  timezone text NOT NULL DEFAULT 'America/Bogota',
  is_active boolean NOT NULL DEFAULT true,
  is_demo boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles readable" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "demo profile insert" ON public.profiles FOR INSERT TO anon, authenticated WITH CHECK (is_demo AND user_id IS NULL);
CREATE POLICY "demo profile update" ON public.profiles FOR UPDATE TO anon, authenticated USING (is_demo AND user_id IS NULL) WITH CHECK (is_demo AND user_id IS NULL);

-- ---------- roles (never stored on profiles) ----------
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- ---------- customer / worker profiles ----------
CREATE TABLE public.customer_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  display_name text,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  zone text,
  rating numeric(3,2) NOT NULL DEFAULT 0,
  published_favors integer NOT NULL DEFAULT 0,
  completed_favors integer NOT NULL DEFAULT 0,
  cancellations integer NOT NULL DEFAULT 0,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.customer_profiles TO anon, authenticated;
GRANT ALL ON public.customer_profiles TO service_role;
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customer profiles readable" ON public.customer_profiles FOR SELECT USING (true);
CREATE POLICY "customer profiles write" ON public.customer_profiles FOR INSERT TO anon, authenticated
  WITH CHECK (is_demo OR profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "customer profiles update" ON public.customer_profiles FOR UPDATE TO anon, authenticated
  USING (is_demo OR profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE TABLE public.worker_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  headline text,
  bio text,
  avatar_url text,
  rating numeric(3,2) NOT NULL DEFAULT 0,
  rating_count integer NOT NULL DEFAULT 0,
  completed_favors integer NOT NULL DEFAULT 0,
  completion_rate numeric(5,2) NOT NULL DEFAULT 0,
  cancellation_rate numeric(5,2) NOT NULL DEFAULT 0,
  verification_status public.verification_status NOT NULL DEFAULT 'pending',
  identity_verified boolean NOT NULL DEFAULT false,
  phone_verified boolean NOT NULL DEFAULT false,
  background_checked boolean NOT NULL DEFAULT false,
  languages text[] NOT NULL DEFAULT '{}',
  service_zone text,
  availability_status public.availability_status NOT NULL DEFAULT 'unavailable',
  available_categories text[] NOT NULL DEFAULT '{}',
  specialties text[] NOT NULL DEFAULT '{}',
  is_demo boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.worker_profiles TO anon, authenticated;
GRANT ALL ON public.worker_profiles TO service_role;
ALTER TABLE public.worker_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "worker profiles readable" ON public.worker_profiles FOR SELECT USING (true);
CREATE POLICY "worker profiles write" ON public.worker_profiles FOR INSERT TO anon, authenticated
  WITH CHECK (is_demo OR profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "worker profiles update" ON public.worker_profiles FOR UPDATE TO anon, authenticated
  USING (is_demo OR profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- ---------- locations ----------
CREATE TABLE public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  details text,
  address text,
  city text,
  region text,
  country_code text REFERENCES public.countries(code),
  postal_code text,
  latitude double precision,
  longitude double precision,
  source text NOT NULL DEFAULT 'manual',
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.locations TO anon, authenticated;
GRANT ALL ON public.locations TO service_role;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "locations readable" ON public.locations FOR SELECT USING (true);
CREATE POLICY "locations insert" ON public.locations FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "locations update" ON public.locations FOR UPDATE TO anon, authenticated USING (true);

-- ---------- favors ----------
CREATE TABLE public.favors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  owner_user_id uuid,
  category_slug text REFERENCES public.categories(slug),
  title text,
  description text NOT NULL,
  status public.favor_status NOT NULL DEFAULT 'draft',
  country_code text NOT NULL DEFAULT 'CO' REFERENCES public.countries(code),
  language_code text NOT NULL DEFAULT 'es' REFERENCES public.languages(code),
  currency_code text NOT NULL DEFAULT 'COP' REFERENCES public.currencies(code),
  pickup_location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  destination_location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  additional_stops jsonb NOT NULL DEFAULT '[]'::jsonb,
  scheduled_preset text,
  scheduled_date date,
  scheduled_time text,
  time_window text,
  urgency text NOT NULL DEFAULT 'normal',
  estimated_duration_minutes integer,
  waiting_required boolean NOT NULL DEFAULT false,
  waiting_duration text,
  item_count integer,
  customer_budget_amount numeric(14,2),
  customer_budget_currency text NOT NULL DEFAULT 'COP' REFERENCES public.currencies(code),
  recommended_min numeric(14,2),
  recommended_max numeric(14,2),
  special_instructions text,
  ai_interpretation jsonb,
  selected_worker_profile_id uuid REFERENCES public.worker_profiles(id) ON DELETE SET NULL,
  selected_offer_id uuid,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz
);
CREATE INDEX favors_status_idx ON public.favors (status);
CREATE INDEX favors_owner_idx ON public.favors (owner_user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.favors TO anon, authenticated;
GRANT ALL ON public.favors TO service_role;
ALTER TABLE public.favors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "favors readable" ON public.favors FOR SELECT USING (true);
CREATE POLICY "favors insert" ON public.favors FOR INSERT TO anon, authenticated
  WITH CHECK (is_demo AND owner_user_id IS NULL OR auth.uid() = owner_user_id);
CREATE POLICY "favors update" ON public.favors FOR UPDATE TO anon, authenticated
  USING (is_demo AND owner_user_id IS NULL OR auth.uid() = owner_user_id);
CREATE POLICY "favors delete" ON public.favors FOR DELETE TO anon, authenticated
  USING (is_demo AND owner_user_id IS NULL OR auth.uid() = owner_user_id);

-- ---------- offers ----------
CREATE TABLE public.offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  favor_id uuid NOT NULL REFERENCES public.favors(id) ON DELETE CASCADE,
  worker_profile_id uuid NOT NULL REFERENCES public.worker_profiles(id) ON DELETE CASCADE,
  worker_user_id uuid,
  kind text NOT NULL DEFAULT 'counter',
  offered_amount numeric(14,2) NOT NULL,
  currency_code text NOT NULL REFERENCES public.currencies(code),
  message text,
  distance_km numeric(6,2),
  estimated_arrival_minutes integer,
  status public.offer_status NOT NULL DEFAULT 'pending',
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (favor_id, worker_profile_id)
);
CREATE INDEX offers_favor_idx ON public.offers (favor_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offers TO anon, authenticated;
GRANT ALL ON public.offers TO service_role;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "offers readable" ON public.offers FOR SELECT USING (true);
CREATE POLICY "offers insert" ON public.offers FOR INSERT TO anon, authenticated
  WITH CHECK (is_demo AND worker_user_id IS NULL OR auth.uid() = worker_user_id);
-- the worker owns the offer, the favor owner may change its status (accept / reject)
CREATE POLICY "offers update" ON public.offers FOR UPDATE TO anon, authenticated
  USING (
    (is_demo AND worker_user_id IS NULL)
    OR auth.uid() = worker_user_id
    OR favor_id IN (SELECT id FROM public.favors WHERE owner_user_id = auth.uid())
  );

ALTER TABLE public.favors
  ADD CONSTRAINT favors_selected_offer_fkey
  FOREIGN KEY (selected_offer_id) REFERENCES public.offers(id) ON DELETE SET NULL;

-- ---------- messages ----------
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  favor_id uuid NOT NULL REFERENCES public.favors(id) ON DELETE CASCADE,
  sender_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  receiver_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_role text NOT NULL DEFAULT 'client',
  body text NOT NULL,
  message_type public.message_type NOT NULL DEFAULT 'text',
  attachment_url text,
  is_demo boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_favor_idx ON public.messages (favor_id, created_at);
GRANT SELECT, INSERT, UPDATE ON public.messages TO anon, authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages readable" ON public.messages FOR SELECT USING (true);
CREATE POLICY "messages insert" ON public.messages FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "messages update" ON public.messages FOR UPDATE TO anon, authenticated USING (true);

-- ---------- notifications ----------
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  related_favor_id uuid REFERENCES public.favors(id) ON DELETE CASCADE,
  related_offer_id uuid REFERENCES public.offers(id) ON DELETE CASCADE,
  is_read boolean NOT NULL DEFAULT false,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.notifications TO anon, authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications readable" ON public.notifications FOR SELECT USING (true);
CREATE POLICY "notifications insert" ON public.notifications FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "notifications update" ON public.notifications FOR UPDATE TO anon, authenticated USING (true);

-- ---------- reviews ----------
CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  favor_id uuid REFERENCES public.favors(id) ON DELETE CASCADE,
  reviewer_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  reviewer_role text NOT NULL DEFAULT 'customer',
  author_name text,
  rating smallint NOT NULL,
  review text,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.reviews TO anon, authenticated;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reviews readable" ON public.reviews FOR SELECT USING (true);
CREATE POLICY "reviews insert" ON public.reviews FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.reviews_require_completed_favor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_demo THEN
    RETURN NEW;
  END IF;
  IF NEW.favor_id IS NULL THEN
    RAISE EXCEPTION 'A review must reference a favor';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.favors f WHERE f.id = NEW.favor_id AND f.status = 'completed'
  ) THEN
    RAISE EXCEPTION 'A review requires a completed favor';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER reviews_require_completed_favor
BEFORE INSERT ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.reviews_require_completed_favor();

-- ---------- verifications ----------
CREATE TABLE public.verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  verification_type text NOT NULL,
  status public.verification_status NOT NULL DEFAULT 'pending',
  verified_at timestamptz,
  expires_at timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.verifications TO anon, authenticated;
GRANT ALL ON public.verifications TO service_role;
ALTER TABLE public.verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "verifications readable" ON public.verifications FOR SELECT USING (true);
CREATE POLICY "verifications insert" ON public.verifications FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "verifications update" ON public.verifications FOR UPDATE TO anon, authenticated USING (true);

-- ---------- audit logs ----------
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO anon, authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit logs readable" ON public.audit_logs FOR SELECT USING (true);
CREATE POLICY "audit logs insert" ON public.audit_logs FOR INSERT TO anon, authenticated WITH CHECK (true);

-- ---------- updated_at trigger ----------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER favors_touch BEFORE UPDATE ON public.favors FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER offers_touch BEFORE UPDATE ON public.offers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER worker_profiles_touch BEFORE UPDATE ON public.worker_profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER customer_profiles_touch BEFORE UPDATE ON public.customer_profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- reference data ----------
INSERT INTO public.languages (code, name, native_name, is_active) VALUES
  ('es','Spanish','Español',true),
  ('en','English','English',true),
  ('pt','Portuguese','Português',true),
  ('fr','French','Français',true),
  ('de','German','Deutsch',true),
  ('it','Italian','Italiano',true),
  ('ja','Japanese','日本語',true),
  ('zh','Chinese','中文',true);

INSERT INTO public.currencies (code, name, symbol, decimal_places, is_active) VALUES
  ('COP','Peso colombiano','$',0,true),
  ('USD','US Dollar','$',2,true),
  ('EUR','Euro','€',2,true),
  ('GBP','British Pound','£',2,true),
  ('MXN','Peso mexicano','$',2,true),
  ('BRL','Real brasileño','R$',2,true),
  ('CLP','Peso chileno','$',0,true),
  ('ARS','Peso argentino','$',2,true),
  ('PEN','Sol peruano','S/',2,true),
  ('CAD','Canadian Dollar','$',2,true),
  ('AUD','Australian Dollar','$',2,true),
  ('JPY','Japanese Yen','¥',0,true),
  ('CNY','Chinese Yuan','¥',2,true),
  ('CHF','Swiss Franc','CHF',2,true);

INSERT INTO public.countries (code, name, default_language_code, default_currency_code, timezone, is_active) VALUES
  ('CO','Colombia','es','COP','America/Bogota',true),
  ('MX','México','es','MXN','America/Mexico_City',false),
  ('US','United States','en','USD','America/New_York',false),
  ('BR','Brasil','pt','BRL','America/Sao_Paulo',false),
  ('ES','España','es','EUR','Europe/Madrid',false),
  ('CL','Chile','es','CLP','America/Santiago',false),
  ('AR','Argentina','es','ARS','America/Argentina/Buenos_Aires',false),
  ('PE','Perú','es','PEN','America/Lima',false);

INSERT INTO public.categories (slug, name, icon, sort_order) VALUES
  ('laundry','Lavandería','WashingMachine',1),
  ('packages','Paquetes','Package',2),
  ('shopping','Compras','ShoppingCart',3),
  ('documents','Documentos','FileText',4),
  ('waiting','Esperar','Home',5),
  ('flowers','Flores','Flower2',6),
  ('gifts','Regalos','Gift',7),
  ('pets','Mascotas','Dog',8),
  ('other','Otro','Sparkles',9);