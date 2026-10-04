-- AnyOne16 Stage 6: locations architecture, route geography and GPS-ready scaffolding.

-- 1. Richer, international location structure -------------------------------
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS place_name text;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS instructions text;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'pickup';
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS precision text NOT NULL DEFAULT 'approximate';
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS created_by_user_id uuid;

-- 2. Ordered route points per favor ----------------------------------------
CREATE TABLE IF NOT EXISTS public.favor_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  favor_id uuid NOT NULL REFERENCES public.favors(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'stop',
  position integer NOT NULL DEFAULT 0,
  instructions text,
  wait_minutes integer,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS favor_locations_favor_idx ON public.favor_locations (favor_id, position);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.favor_locations TO authenticated;
GRANT SELECT ON public.favor_locations TO anon;
GRANT ALL ON public.favor_locations TO service_role;
ALTER TABLE public.favor_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY favor_locations_select ON public.favor_locations
  FOR SELECT USING (is_demo OR public.is_favor_participant(favor_id));
CREATE POLICY favor_locations_insert ON public.favor_locations
  FOR INSERT WITH CHECK (is_demo OR public.is_favor_participant(favor_id));
CREATE POLICY favor_locations_update ON public.favor_locations
  FOR UPDATE USING (is_demo OR public.is_favor_participant(favor_id))
  WITH CHECK (is_demo OR public.is_favor_participant(favor_id));
CREATE POLICY favor_locations_delete ON public.favor_locations
  FOR DELETE USING (is_demo OR public.is_favor_participant(favor_id));

-- 3. Worker operating areas -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.worker_service_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id uuid NOT NULL REFERENCES public.worker_profiles(id) ON DELETE CASCADE,
  label text,
  city text,
  region text,
  country_code text,
  latitude double precision,
  longitude double precision,
  radius_km numeric NOT NULL DEFAULT 10,
  is_active boolean NOT NULL DEFAULT true,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS worker_service_areas_worker_idx ON public.worker_service_areas (worker_profile_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.worker_service_areas TO authenticated;
GRANT SELECT ON public.worker_service_areas TO anon;
GRANT ALL ON public.worker_service_areas TO service_role;
ALTER TABLE public.worker_service_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY worker_service_areas_select ON public.worker_service_areas
  FOR SELECT USING (true);
CREATE POLICY worker_service_areas_insert ON public.worker_service_areas
  FOR INSERT WITH CHECK (is_demo OR public.owns_worker_profile(worker_profile_id));
CREATE POLICY worker_service_areas_update ON public.worker_service_areas
  FOR UPDATE USING (is_demo OR public.owns_worker_profile(worker_profile_id))
  WITH CHECK (is_demo OR public.owns_worker_profile(worker_profile_id));

CREATE TRIGGER worker_service_areas_touch BEFORE UPDATE ON public.worker_service_areas
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. GPS-ready position stream (structure only, no live tracking yet) -------
CREATE TABLE IF NOT EXISTS public.location_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  favor_id uuid REFERENCES public.favors(id) ON DELETE CASCADE,
  worker_profile_id uuid REFERENCES public.worker_profiles(id) ON DELETE CASCADE,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy_meters numeric,
  heading numeric,
  speed_kmh numeric,
  source text NOT NULL DEFAULT 'manual',
  is_demo boolean NOT NULL DEFAULT false,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS location_updates_favor_idx ON public.location_updates (favor_id, recorded_at DESC);

GRANT SELECT, INSERT ON public.location_updates TO authenticated;
GRANT ALL ON public.location_updates TO service_role;
ALTER TABLE public.location_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY location_updates_select ON public.location_updates
  FOR SELECT USING (favor_id IS NOT NULL AND public.is_favor_participant(favor_id));
CREATE POLICY location_updates_insert ON public.location_updates
  FOR INSERT WITH CHECK (favor_id IS NOT NULL AND public.is_favor_participant(favor_id));

-- 5. Coarse, public-safe geography on the favor itself ----------------------
ALTER TABLE public.favors ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.favors ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE public.favors ADD COLUMN IF NOT EXISTS zone_label text;
ALTER TABLE public.favors ADD COLUMN IF NOT EXISTS stop_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.favors ADD COLUMN IF NOT EXISTS route_distance_km numeric;
ALTER TABLE public.favors ADD COLUMN IF NOT EXISTS estimated_travel_minutes integer;
ALTER TABLE public.favors ADD COLUMN IF NOT EXISTS estimated_wait_minutes integer;
ALTER TABLE public.favors ADD COLUMN IF NOT EXISTS estimated_total_minutes integer;
ALTER TABLE public.favors ADD COLUMN IF NOT EXISTS origin_latitude double precision;
ALTER TABLE public.favors ADD COLUMN IF NOT EXISTS origin_longitude double precision;

-- 6. Worker and customer coarse position -----------------------------------
ALTER TABLE public.worker_profiles ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.worker_profiles ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE public.worker_profiles ADD COLUMN IF NOT EXISTS country_code text;
ALTER TABLE public.worker_profiles ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE public.worker_profiles ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE public.worker_profiles ADD COLUMN IF NOT EXISTS service_radius_km numeric NOT NULL DEFAULT 10;

ALTER TABLE public.customer_profiles ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.customer_profiles ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE public.customer_profiles ADD COLUMN IF NOT EXISTS country_code text;
ALTER TABLE public.customer_profiles ADD COLUMN IF NOT EXISTS approximate_latitude double precision;
ALTER TABLE public.customer_profiles ADD COLUMN IF NOT EXISTS approximate_longitude double precision;

-- 7. Exact addresses are only readable by authorised parties ----------------
CREATE OR REPLACE FUNCTION public.can_read_location(_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.locations l
    WHERE l.id = _location_id
      AND (l.is_demo OR l.created_by_user_id = auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.favors f
    WHERE (f.pickup_location_id = _location_id OR f.destination_location_id = _location_id)
      AND public.is_favor_participant(f.id)
  )
  OR EXISTS (
    SELECT 1 FROM public.favor_locations fl
    WHERE fl.location_id = _location_id
      AND public.is_favor_participant(fl.favor_id)
  )
$$;

DROP POLICY IF EXISTS locations_select ON public.locations;
CREATE POLICY locations_select ON public.locations
  FOR SELECT USING (is_demo OR public.can_read_location(id));

DROP POLICY IF EXISTS locations_update ON public.locations;
CREATE POLICY locations_update ON public.locations
  FOR UPDATE USING (is_demo OR public.can_read_location(id))
  WITH CHECK (is_demo OR public.can_read_location(id));
