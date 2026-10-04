-- AnyOne16 Stage 8: Trust & Safety, mandatory completion code, worker verification.

CREATE TYPE public.trust_verification_state AS ENUM (
  'not_started','provider_not_connected','pending','in_review','verified','rejected','expired'
);
CREATE TYPE public.risk_level AS ENUM ('low','medium','high','critical');
CREATE TYPE public.completion_code_state AS ENUM ('active','used','expired','revoked');
CREATE TYPE public.worker_restriction_kind AS ENUM (
  'none','additional_verification_required','category_restricted','temporarily_suspended','permanently_suspended'
);

-- ------------------------------------------------------------ worker trust
ALTER TABLE public.worker_profiles
  ADD COLUMN IF NOT EXISTS trust_level SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS restriction_status public.worker_restriction_kind NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS risk_level public.risk_level NOT NULL DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS risk_score NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS residence_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS vehicle_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS dispute_count INTEGER NOT NULL DEFAULT 0;

-- ------------------------------------------------- configurable trust rules
CREATE TABLE public.trust_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  country_code TEXT REFERENCES public.countries(code),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.trust_settings TO anon, authenticated;
GRANT ALL ON public.trust_settings TO service_role;
ALTER TABLE public.trust_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trust settings readable" ON public.trust_settings FOR SELECT USING (true);
CREATE POLICY "admins manage trust settings" ON public.trust_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.trust_eligibility_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  min_trust_level SMALLINT NOT NULL DEFAULT 1,
  category_slug TEXT REFERENCES public.categories(slug),
  country_code TEXT REFERENCES public.countries(code),
  city TEXT,
  requires_vehicle BOOLEAN NOT NULL DEFAULT FALSE,
  requires_residence BOOLEAN NOT NULL DEFAULT FALSE,
  requires_background_check BOOLEAN NOT NULL DEFAULT FALSE,
  min_amount NUMERIC,
  max_amount NUMERIC,
  currency_code TEXT REFERENCES public.currencies(code),
  high_risk BOOLEAN NOT NULL DEFAULT FALSE,
  priority INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.trust_eligibility_rules TO anon, authenticated;
GRANT ALL ON public.trust_eligibility_rules TO service_role;
ALTER TABLE public.trust_eligibility_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "eligibility rules readable" ON public.trust_eligibility_rules FOR SELECT USING (true);
CREATE POLICY "admins manage eligibility rules" ON public.trust_eligibility_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------- identity / address
CREATE TABLE public.worker_identity_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id UUID NOT NULL REFERENCES public.worker_profiles(id) ON DELETE CASCADE,
  legal_name TEXT,
  date_of_birth DATE,
  document_type TEXT,
  document_country TEXT REFERENCES public.countries(code),
  document_reference TEXT,
  status public.trust_verification_state NOT NULL DEFAULT 'not_started',
  provider TEXT,
  provider_reference TEXT,
  selfie_check public.trust_verification_state NOT NULL DEFAULT 'not_started',
  liveness_check public.trust_verification_state NOT NULL DEFAULT 'not_started',
  document_check public.trust_verification_state NOT NULL DEFAULT 'not_started',
  failure_reason TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ,
  consent_given_at TIMESTAMPTZ,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX worker_identity_one_per_worker_uidx
  ON public.worker_identity_verifications (worker_profile_id);
GRANT SELECT, INSERT, UPDATE ON public.worker_identity_verifications TO authenticated;
GRANT ALL ON public.worker_identity_verifications TO service_role;
ALTER TABLE public.worker_identity_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "worker reads own identity" ON public.worker_identity_verifications FOR SELECT TO authenticated
  USING (public.owns_worker_profile(worker_profile_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "worker writes own identity" ON public.worker_identity_verifications FOR INSERT TO authenticated
  WITH CHECK (public.owns_worker_profile(worker_profile_id));
CREATE POLICY "worker updates own identity" ON public.worker_identity_verifications FOR UPDATE TO authenticated
  USING (public.owns_worker_profile(worker_profile_id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.owns_worker_profile(worker_profile_id) OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.worker_address_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id UUID NOT NULL REFERENCES public.worker_profiles(id) ON DELETE CASCADE,
  declared_address TEXT,
  city TEXT,
  region TEXT,
  country_code TEXT REFERENCES public.countries(code),
  postal_code TEXT,
  proof_type TEXT,
  provider TEXT,
  provider_reference TEXT,
  status public.trust_verification_state NOT NULL DEFAULT 'not_started',
  verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  failure_reason TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX worker_address_one_per_worker_uidx
  ON public.worker_address_verifications (worker_profile_id);
GRANT SELECT, INSERT, UPDATE ON public.worker_address_verifications TO authenticated;
GRANT ALL ON public.worker_address_verifications TO service_role;
ALTER TABLE public.worker_address_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "worker reads own address" ON public.worker_address_verifications FOR SELECT TO authenticated
  USING (public.owns_worker_profile(worker_profile_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "worker writes own address" ON public.worker_address_verifications FOR INSERT TO authenticated
  WITH CHECK (public.owns_worker_profile(worker_profile_id));
CREATE POLICY "worker updates own address" ON public.worker_address_verifications FOR UPDATE TO authenticated
  USING (public.owns_worker_profile(worker_profile_id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.owns_worker_profile(worker_profile_id) OR public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------- vehicles
CREATE TABLE public.worker_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id UUID NOT NULL REFERENCES public.worker_profiles(id) ON DELETE CASCADE,
  vehicle_type TEXT NOT NULL,
  make TEXT,
  model TEXT,
  year INTEGER,
  plate TEXT,
  ownership TEXT NOT NULL DEFAULT 'owner',
  country_code TEXT REFERENCES public.countries(code),
  document_reference TEXT,
  insurance_status public.trust_verification_state NOT NULL DEFAULT 'not_started',
  status public.trust_verification_state NOT NULL DEFAULT 'not_started',
  provider TEXT,
  provider_reference TEXT,
  verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  failure_reason TEXT,
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.worker_vehicles TO authenticated;
GRANT ALL ON public.worker_vehicles TO service_role;
ALTER TABLE public.worker_vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "worker reads own vehicles" ON public.worker_vehicles FOR SELECT TO authenticated
  USING (public.owns_worker_profile(worker_profile_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "worker writes own vehicles" ON public.worker_vehicles FOR INSERT TO authenticated
  WITH CHECK (public.owns_worker_profile(worker_profile_id));
CREATE POLICY "worker updates own vehicles" ON public.worker_vehicles FOR UPDATE TO authenticated
  USING (public.owns_worker_profile(worker_profile_id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.owns_worker_profile(worker_profile_id) OR public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------- background checks
CREATE TABLE public.worker_background_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id UUID NOT NULL REFERENCES public.worker_profiles(id) ON DELETE CASCADE,
  provider TEXT,
  check_type TEXT NOT NULL DEFAULT 'standard',
  country_code TEXT REFERENCES public.countries(code),
  status public.trust_verification_state NOT NULL DEFAULT 'not_started',
  result_category TEXT,
  provider_reference TEXT,
  consent_given_at TIMESTAMPTZ,
  checked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.worker_background_checks TO authenticated;
GRANT ALL ON public.worker_background_checks TO service_role;
ALTER TABLE public.worker_background_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "worker reads own checks" ON public.worker_background_checks FOR SELECT TO authenticated
  USING (public.owns_worker_profile(worker_profile_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "worker writes own checks" ON public.worker_background_checks FOR INSERT TO authenticated
  WITH CHECK (public.owns_worker_profile(worker_profile_id));
CREATE POLICY "admins update checks" ON public.worker_background_checks FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- --------------------------------------------------- mandatory completion code
CREATE TABLE public.favor_completion_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  favor_id UUID NOT NULL REFERENCES public.favors(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  status public.completion_code_state NOT NULL DEFAULT 'active',
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  expires_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  used_by_worker_profile_id UUID REFERENCES public.worker_profiles(id),
  used_latitude DOUBLE PRECISION,
  used_longitude DOUBLE PRECISION,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX favor_completion_codes_favor_uidx ON public.favor_completion_codes (favor_id);
-- Only the client who owns the favor (or an admin) may ever read the code.
GRANT SELECT ON public.favor_completion_codes TO authenticated;
GRANT ALL ON public.favor_completion_codes TO service_role;
ALTER TABLE public.favor_completion_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "only favor owner reads code" ON public.favor_completion_codes FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.favors f
      WHERE f.id = favor_id AND f.owner_user_id = auth.uid()
    )
  );

CREATE TABLE public.favor_code_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  favor_id UUID NOT NULL REFERENCES public.favors(id) ON DELETE CASCADE,
  worker_profile_id UUID REFERENCES public.worker_profiles(id),
  actor_user_id UUID,
  succeeded BOOLEAN NOT NULL DEFAULT FALSE,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  session_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX favor_code_attempts_favor_idx ON public.favor_code_attempts (favor_id);
GRANT SELECT ON public.favor_code_attempts TO authenticated;
GRANT ALL ON public.favor_code_attempts TO service_role;
ALTER TABLE public.favor_code_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participants read code attempts" ON public.favor_code_attempts FOR SELECT TO authenticated
  USING (public.is_favor_participant(favor_id) OR public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------- evidence
CREATE TABLE public.favor_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  favor_id UUID NOT NULL REFERENCES public.favors(id) ON DELETE CASCADE,
  worker_profile_id UUID REFERENCES public.worker_profiles(id),
  customer_profile_id UUID REFERENCES public.profiles(id),
  kind TEXT NOT NULL,
  description TEXT,
  photo_url TEXT,
  receipt_url TEXT,
  amount NUMERIC,
  currency_code TEXT REFERENCES public.currencies(code),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX favor_evidence_favor_idx ON public.favor_evidence (favor_id);
GRANT SELECT, INSERT ON public.favor_evidence TO authenticated;
GRANT ALL ON public.favor_evidence TO service_role;
ALTER TABLE public.favor_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participants read evidence" ON public.favor_evidence FOR SELECT TO authenticated
  USING (public.is_favor_participant(favor_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "participants add evidence" ON public.favor_evidence FOR INSERT TO authenticated
  WITH CHECK (public.is_favor_participant(favor_id));

-- ------------------------------------------------- restrictions / risk log
CREATE TABLE public.worker_restrictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id UUID NOT NULL REFERENCES public.worker_profiles(id) ON DELETE CASCADE,
  kind public.worker_restriction_kind NOT NULL,
  reason TEXT NOT NULL,
  restricted_categories TEXT[] NOT NULL DEFAULT '{}',
  required_trust_level SMALLINT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  created_by_profile_id UUID REFERENCES public.profiles(id),
  lifted_by_profile_id UUID REFERENCES public.profiles(id),
  lifted_at TIMESTAMPTZ,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.worker_restrictions TO authenticated;
GRANT ALL ON public.worker_restrictions TO service_role;
ALTER TABLE public.worker_restrictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "worker reads own restrictions" ON public.worker_restrictions FOR SELECT TO authenticated
  USING (public.owns_worker_profile(worker_profile_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage restrictions" ON public.worker_restrictions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.risk_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type TEXT NOT NULL,
  subject_id UUID,
  favor_id UUID REFERENCES public.favors(id) ON DELETE CASCADE,
  signal TEXT NOT NULL,
  weight NUMERIC NOT NULL DEFAULT 1,
  level public.risk_level NOT NULL DEFAULT 'low',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX risk_signals_subject_idx ON public.risk_signals (subject_type, subject_id);
GRANT SELECT ON public.risk_signals TO authenticated;
GRANT ALL ON public.risk_signals TO service_role;
ALTER TABLE public.risk_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read risk signals" ON public.risk_signals FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage risk signals" ON public.risk_signals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------- dispute extensions
ALTER TABLE public.disputes
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS assigned_admin_profile_id UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS decision TEXT,
  ADD COLUMN IF NOT EXISTS appeal_status TEXT,
  ADD COLUMN IF NOT EXISTS evidence_bundle JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- --------------------------------------------------------------- functions
CREATE OR REPLACE FUNCTION public.trust_setting_int(_key TEXT, _fallback INTEGER)
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT (value #>> '{}')::INTEGER FROM public.trust_settings WHERE key = _key), _fallback)
$$;

-- Creates the mandatory 6-digit code for a favor. Never returns the code.
CREATE OR REPLACE FUNCTION public.ensure_favor_completion_code(_favor_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_favor public.favors%ROWTYPE;
  v_code TEXT;
BEGIN
  SELECT * INTO v_favor FROM public.favors WHERE id = _favor_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF EXISTS (SELECT 1 FROM public.favor_completion_codes WHERE favor_id = _favor_id) THEN
    RETURN TRUE;
  END IF;
  v_code := lpad(((floor(random() * 900000) + 100000))::INT::TEXT, 6, '0');
  INSERT INTO public.favor_completion_codes (favor_id, code, max_attempts, expires_at, is_demo)
  VALUES (
    _favor_id,
    v_code,
    public.trust_setting_int('completion_code.max_attempts', 5),
    now() + (public.trust_setting_int('completion_code.expiry_hours', 72) || ' hours')::INTERVAL,
    v_favor.is_demo
  );
  INSERT INTO public.audit_logs (action, entity_type, entity_id, metadata, is_demo)
  VALUES ('completion_code.generated', 'favor', _favor_id, '{}'::jsonb, v_favor.is_demo);
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_favor_completion_code(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_favor_completion_code(UUID) TO authenticated, anon, service_role;

-- Generate the code automatically the moment a favor is published.
CREATE OR REPLACE FUNCTION public.favors_generate_completion_code()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status::TEXT NOT IN ('draft','ai_processing','ready_for_review','ready_to_publish') THEN
    PERFORM public.ensure_favor_completion_code(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER favors_completion_code_after_write
  AFTER INSERT OR UPDATE OF status ON public.favors
  FOR EACH ROW EXECUTE FUNCTION public.favors_generate_completion_code();

-- Server-side enforcement: no favor may reach 'completed' without a used code.
CREATE OR REPLACE FUNCTION public.favors_enforce_completion_code()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'completed'::public.favor_status
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.favor_completion_codes c
      WHERE c.favor_id = NEW.id AND c.status = 'used' AND c.used_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'completion_code_required: a favor can only be completed after the client confirmation code is validated';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER favors_enforce_completion_code_before_write
  BEFORE INSERT OR UPDATE OF status ON public.favors
  FOR EACH ROW EXECUTE FUNCTION public.favors_enforce_completion_code();

-- The only way to complete a favor: worker submits the client's code.
CREATE OR REPLACE FUNCTION public.validate_favor_completion_code(
  _favor_id UUID,
  _code TEXT,
  _latitude DOUBLE PRECISION DEFAULT NULL,
  _longitude DOUBLE PRECISION DEFAULT NULL,
  _session JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_favor public.favors%ROWTYPE;
  v_row public.favor_completion_codes%ROWTYPE;
  v_worker UUID;
  v_is_worker BOOLEAN := FALSE;
  v_clean TEXT := regexp_replace(COALESCE(_code, ''), '\D', '', 'g');
BEGIN
  SELECT * INTO v_favor FROM public.favors WHERE id = _favor_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'favor_not_found');
  END IF;

  SELECT wp.id INTO v_worker
  FROM public.worker_profiles wp
  JOIN public.profiles p ON p.id = wp.profile_id
  WHERE wp.id = v_favor.selected_worker_profile_id AND p.user_id = auth.uid();
  v_is_worker := v_worker IS NOT NULL;

  -- Only the selected worker (or, for demo favors, the demo session) may submit.
  IF NOT v_is_worker AND NOT v_favor.is_demo AND NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  PERFORM public.ensure_favor_completion_code(_favor_id);
  SELECT * INTO v_row FROM public.favor_completion_codes WHERE favor_id = _favor_id FOR UPDATE;

  IF v_row.status = 'used' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'code_already_used');
  END IF;
  IF v_row.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'code_not_active');
  END IF;
  IF v_row.expires_at IS NOT NULL AND v_row.expires_at < now() THEN
    UPDATE public.favor_completion_codes SET status = 'expired', updated_at = now() WHERE id = v_row.id;
    RETURN jsonb_build_object('ok', false, 'error', 'code_expired');
  END IF;
  IF v_row.failed_attempts >= v_row.max_attempts THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_many_attempts',
      'failed_attempts', v_row.failed_attempts, 'max_attempts', v_row.max_attempts);
  END IF;

  IF v_clean <> v_row.code THEN
    UPDATE public.favor_completion_codes
      SET failed_attempts = failed_attempts + 1, updated_at = now()
      WHERE id = v_row.id;
    INSERT INTO public.favor_code_attempts
      (favor_id, worker_profile_id, actor_user_id, succeeded, latitude, longitude, session_metadata, is_demo)
    VALUES (_favor_id, v_worker, auth.uid(), FALSE, _latitude, _longitude, COALESCE(_session, '{}'::jsonb), v_favor.is_demo);
    INSERT INTO public.audit_logs (action, entity_type, entity_id, metadata, is_demo)
    VALUES ('completion_code.attempt_failed', 'favor', _favor_id,
      jsonb_build_object('failed_attempts', v_row.failed_attempts + 1, 'max_attempts', v_row.max_attempts), v_favor.is_demo);
    IF v_row.failed_attempts + 1 >= v_row.max_attempts THEN
      INSERT INTO public.risk_signals (subject_type, subject_id, favor_id, signal, weight, level, is_demo)
      VALUES ('worker', v_worker, _favor_id, 'completion_code.attempts_exhausted', 3, 'high', v_favor.is_demo);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code',
      'failed_attempts', v_row.failed_attempts + 1, 'max_attempts', v_row.max_attempts);
  END IF;

  UPDATE public.favor_completion_codes
    SET status = 'used', used_at = now(), used_by_worker_profile_id = v_worker,
        used_latitude = _latitude, used_longitude = _longitude, updated_at = now()
    WHERE id = v_row.id;
  INSERT INTO public.favor_code_attempts
    (favor_id, worker_profile_id, actor_user_id, succeeded, latitude, longitude, session_metadata, is_demo)
  VALUES (_favor_id, v_worker, auth.uid(), TRUE, _latitude, _longitude, COALESCE(_session, '{}'::jsonb), v_favor.is_demo);

  UPDATE public.favors
    SET status = 'completed'::public.favor_status, completed_at = now(), updated_at = now()
    WHERE id = _favor_id;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, metadata, is_demo)
  VALUES ('completion_code.validated', 'favor', _favor_id,
    jsonb_build_object('worker_profile_id', v_worker, 'previous_status', v_favor.status,
                       'new_status', 'completed', 'latitude', _latitude, 'longitude', _longitude),
    v_favor.is_demo);

  RETURN jsonb_build_object('ok', true, 'status', 'completed');
END;
$$;
REVOKE ALL ON FUNCTION public.validate_favor_completion_code(UUID, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_favor_completion_code(UUID, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, JSONB) TO authenticated, anon, service_role;

-- Recomputes the worker trust level from verified records (0..4).
CREATE OR REPLACE FUNCTION public.recompute_worker_trust_level(_worker_profile_id UUID)
RETURNS SMALLINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_identity BOOLEAN;
  v_address BOOLEAN;
  v_vehicle BOOLEAN;
  v_background BOOLEAN;
  v_completed INTEGER;
  v_level SMALLINT := 0;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.worker_identity_verifications
                 WHERE worker_profile_id = _worker_profile_id AND status = 'verified') INTO v_identity;
  SELECT EXISTS (SELECT 1 FROM public.worker_address_verifications
                 WHERE worker_profile_id = _worker_profile_id AND status = 'verified') INTO v_address;
  SELECT EXISTS (SELECT 1 FROM public.worker_vehicles
                 WHERE worker_profile_id = _worker_profile_id AND status = 'verified' AND is_active) INTO v_vehicle;
  SELECT EXISTS (SELECT 1 FROM public.worker_background_checks
                 WHERE worker_profile_id = _worker_profile_id AND status = 'verified') INTO v_background;
  SELECT completed_favors INTO v_completed FROM public.worker_profiles WHERE id = _worker_profile_id;

  IF v_identity THEN v_level := 1; END IF;
  IF v_identity AND v_address THEN v_level := 2; END IF;
  IF v_identity AND v_address AND v_vehicle THEN v_level := 3; END IF;
  IF v_identity AND v_address AND v_background
     AND COALESCE(v_completed, 0) >= public.trust_setting_int('trust.level4_min_completed', 10) THEN
    v_level := GREATEST(v_level, 4);
  END IF;

  UPDATE public.worker_profiles
    SET trust_level = v_level,
        identity_verified = v_identity,
        residence_verified = v_address,
        vehicle_verified = v_vehicle,
        background_checked = v_background,
        updated_at = now()
    WHERE id = _worker_profile_id;
  RETURN v_level;
END;
$$;
REVOKE ALL ON FUNCTION public.recompute_worker_trust_level(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recompute_worker_trust_level(UUID) TO authenticated, service_role;

CREATE TRIGGER worker_identity_touch BEFORE UPDATE ON public.worker_identity_verifications
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER worker_address_touch BEFORE UPDATE ON public.worker_address_verifications
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER worker_vehicles_touch BEFORE UPDATE ON public.worker_vehicles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER worker_background_touch BEFORE UPDATE ON public.worker_background_checks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER completion_codes_touch BEFORE UPDATE ON public.favor_completion_codes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER worker_restrictions_touch BEFORE UPDATE ON public.worker_restrictions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER disputes_touch BEFORE UPDATE ON public.disputes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();