-- ============================================================================
-- AnyOne16 — Verification hardening.
-- No verification may reach 'verified' unless a real, connected provider
-- returned the result, with a stored reference, on a non-demo record.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.verification_providers (
  kind TEXT PRIMARY KEY,
  provider_key TEXT,
  display_name TEXT,
  connected BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.verification_providers TO authenticated, anon;
GRANT ALL ON public.verification_providers TO service_role;
ALTER TABLE public.verification_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "providers readable" ON public.verification_providers FOR SELECT USING (true);
-- No INSERT/UPDATE/DELETE policy: clients (including admins) can never
-- mark a provider as connected from the app. Only server-side ops can.

INSERT INTO public.verification_providers (kind, display_name, connected, notes) VALUES
  ('identity',   'Identity / document KYC provider', FALSE, 'Not connected: no real KYC provider integrated yet.'),
  ('liveness',   'Selfie & liveness provider',       FALSE, 'Not connected.'),
  ('address',    'Residence verification provider',  FALSE, 'Not connected.'),
  ('vehicle',    'Vehicle & insurance provider',     FALSE, 'Not connected.'),
  ('background', 'Background-check provider',        FALSE, 'Not connected.')
ON CONFLICT (kind) DO NOTHING;

CREATE OR REPLACE FUNCTION public.verification_provider_connected(_kind TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.verification_providers
    WHERE kind = _kind AND connected AND active AND provider_key IS NOT NULL
  );
$$;
REVOKE ALL ON FUNCTION public.verification_provider_connected(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verification_provider_connected(TEXT) TO authenticated, anon, service_role;

-- Trusted writer = a server-side session (service role / db owner), never a
-- browser session. Evaluated with the *invoking* role, so this function must
-- only be called from SECURITY INVOKER code.
CREATE OR REPLACE FUNCTION public.is_verification_service_writer()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT current_user IN ('service_role', 'postgres', 'supabase_admin');
$$;
GRANT EXECUTE ON FUNCTION public.is_verification_service_writer() TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.log_verification_event(
  _action TEXT, _entity_type TEXT, _entity_id UUID, _metadata JSONB, _is_demo BOOLEAN
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_logs (actor_profile_id, action, entity_type, entity_id, metadata, is_demo)
  VALUES (public.current_profile_id(), _action, _entity_type, _entity_id, COALESCE(_metadata, '{}'::jsonb), COALESCE(_is_demo, FALSE));
END;
$$;
REVOKE ALL ON FUNCTION public.log_verification_event(TEXT, TEXT, UUID, JSONB, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_verification_event(TEXT, TEXT, UUID, JSONB, BOOLEAN) TO authenticated, anon, service_role;

-- ---------------------------------------------------------------- the guard
CREATE OR REPLACE FUNCTION public.verification_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_kind TEXT;
  v_connected BOOLEAN;
  v_trusted BOOLEAN;
  v_admin BOOLEAN;
  v_default public.trust_verification_state;
BEGIN
  v_kind := CASE TG_TABLE_NAME
    WHEN 'worker_identity_verifications' THEN 'identity'
    WHEN 'worker_address_verifications'  THEN 'address'
    WHEN 'worker_vehicles'               THEN 'vehicle'
    WHEN 'worker_background_checks'      THEN 'background'
  END;
  v_connected := public.verification_provider_connected(v_kind);
  v_trusted   := public.is_verification_service_writer();
  v_admin     := public.has_role(auth.uid(), 'admin');
  v_default   := CASE WHEN v_connected THEN 'pending'::public.trust_verification_state
                      ELSE 'provider_not_connected'::public.trust_verification_state END;

  IF TG_OP = 'INSERT' THEN
    IF NOT v_trusted THEN
      -- A client may only submit a request. It can never choose the outcome.
      NEW.status := v_default;
      NEW.provider := NULL;
      NEW.provider_reference := NULL;
      IF TG_TABLE_NAME = 'worker_identity_verifications' THEN
        NEW.selfie_check := v_default;
        NEW.liveness_check := v_default;
        NEW.document_check := v_default;
        NEW.completed_at := NULL;
        NEW.last_verified_at := NULL;
      ELSIF TG_TABLE_NAME = 'worker_background_checks' THEN
        NEW.checked_at := NULL;
      ELSE
        NEW.verified_at := NULL;
        IF TG_TABLE_NAME = 'worker_vehicles' THEN
          NEW.insurance_status := 'not_started';
        END IF;
      END IF;
    END IF;
  ELSE
    IF NOT v_trusted THEN
      -- Provider identity and demo flag are immutable from the app.
      NEW.provider := OLD.provider;
      NEW.provider_reference := OLD.provider_reference;
      NEW.is_demo := OLD.is_demo;
      IF NOT v_admin THEN
        -- Workers can update their declared data only, never their status.
        NEW.status := OLD.status;
        IF TG_TABLE_NAME = 'worker_identity_verifications' THEN
          NEW.selfie_check := OLD.selfie_check;
          NEW.liveness_check := OLD.liveness_check;
          NEW.document_check := OLD.document_check;
          NEW.completed_at := OLD.completed_at;
          NEW.last_verified_at := OLD.last_verified_at;
        ELSIF TG_TABLE_NAME = 'worker_background_checks' THEN
          NEW.checked_at := OLD.checked_at;
        ELSE
          NEW.verified_at := OLD.verified_at;
          IF TG_TABLE_NAME = 'worker_vehicles' THEN
            NEW.insurance_status := OLD.insurance_status;
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;

  -- Absolute rule, for every role including the service role: 'verified'
  -- requires a connected provider, a stored reference and a real (non-demo) record.
  IF NEW.status = 'verified'
     OR (TG_TABLE_NAME = 'worker_identity_verifications'
         AND (NEW.selfie_check = 'verified' OR NEW.liveness_check = 'verified' OR NEW.document_check = 'verified'))
     OR (TG_TABLE_NAME = 'worker_vehicles' AND NEW.insurance_status = 'verified')
  THEN
    IF NOT v_connected THEN
      RAISE EXCEPTION 'verification_provider_not_connected: % cannot be marked verified without a connected provider', v_kind
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.provider IS NULL OR NEW.provider_reference IS NULL THEN
      RAISE EXCEPTION 'verification_reference_required: % needs provider and provider_reference to be verified', v_kind
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.is_demo THEN
      RAISE EXCEPTION 'demo_verification_cannot_be_verified: demo records never produce a real verification'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.verification_audit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.log_verification_event(
      'verification.status_' || NEW.status::TEXT,
      TG_TABLE_NAME,
      NEW.id,
      jsonb_build_object(
        'worker_profile_id', NEW.worker_profile_id,
        'previous_status', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status::TEXT END,
        'new_status', NEW.status::TEXT,
        'provider', NEW.provider,
        'provider_reference', NEW.provider_reference
      ),
      NEW.is_demo
    );
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS guard_identity_verification ON public.worker_identity_verifications;
CREATE TRIGGER guard_identity_verification BEFORE INSERT OR UPDATE ON public.worker_identity_verifications
  FOR EACH ROW EXECUTE FUNCTION public.verification_guard();
DROP TRIGGER IF EXISTS audit_identity_verification ON public.worker_identity_verifications;
CREATE TRIGGER audit_identity_verification AFTER INSERT OR UPDATE ON public.worker_identity_verifications
  FOR EACH ROW EXECUTE FUNCTION public.verification_audit();

DROP TRIGGER IF EXISTS guard_address_verification ON public.worker_address_verifications;
CREATE TRIGGER guard_address_verification BEFORE INSERT OR UPDATE ON public.worker_address_verifications
  FOR EACH ROW EXECUTE FUNCTION public.verification_guard();
DROP TRIGGER IF EXISTS audit_address_verification ON public.worker_address_verifications;
CREATE TRIGGER audit_address_verification AFTER INSERT OR UPDATE ON public.worker_address_verifications
  FOR EACH ROW EXECUTE FUNCTION public.verification_audit();

DROP TRIGGER IF EXISTS guard_vehicle_verification ON public.worker_vehicles;
CREATE TRIGGER guard_vehicle_verification BEFORE INSERT OR UPDATE ON public.worker_vehicles
  FOR EACH ROW EXECUTE FUNCTION public.verification_guard();
DROP TRIGGER IF EXISTS audit_vehicle_verification ON public.worker_vehicles;
CREATE TRIGGER audit_vehicle_verification AFTER INSERT OR UPDATE ON public.worker_vehicles
  FOR EACH ROW EXECUTE FUNCTION public.verification_audit();

DROP TRIGGER IF EXISTS guard_background_verification ON public.worker_background_checks;
CREATE TRIGGER guard_background_verification BEFORE INSERT OR UPDATE ON public.worker_background_checks
  FOR EACH ROW EXECUTE FUNCTION public.verification_guard();
DROP TRIGGER IF EXISTS audit_background_verification ON public.worker_background_checks;
CREATE TRIGGER audit_background_verification AFTER INSERT OR UPDATE ON public.worker_background_checks
  FOR EACH ROW EXECUTE FUNCTION public.verification_audit();

-- ------------------------------------------- trust flags are server-computed
CREATE OR REPLACE FUNCTION public.worker_profiles_freeze_trust()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NOT public.is_verification_service_writer() THEN
    NEW.trust_level := OLD.trust_level;
    NEW.identity_verified := OLD.identity_verified;
    NEW.residence_verified := OLD.residence_verified;
    NEW.vehicle_verified := OLD.vehicle_verified;
    NEW.background_checked := OLD.background_checked;
    NEW.verification_status := OLD.verification_status;
    NEW.risk_level := OLD.risk_level;
    NEW.risk_score := OLD.risk_score;
    NEW.restriction_status := OLD.restriction_status;
    NEW.dispute_count := OLD.dispute_count;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS worker_profiles_freeze_trust_trg ON public.worker_profiles;
CREATE TRIGGER worker_profiles_freeze_trust_trg BEFORE UPDATE ON public.worker_profiles
  FOR EACH ROW EXECUTE FUNCTION public.worker_profiles_freeze_trust();

-- ------------------------------ trust level counts only real, referenced,
-- ------------------------------ unexpired verifications from a provider
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
                 WHERE worker_profile_id = _worker_profile_id AND status = 'verified'
                   AND NOT is_demo AND provider IS NOT NULL AND provider_reference IS NOT NULL
                   AND (expires_at IS NULL OR expires_at > now())) INTO v_identity;
  SELECT EXISTS (SELECT 1 FROM public.worker_address_verifications
                 WHERE worker_profile_id = _worker_profile_id AND status = 'verified'
                   AND NOT is_demo AND provider IS NOT NULL AND provider_reference IS NOT NULL
                   AND (expires_at IS NULL OR expires_at > now())) INTO v_address;
  SELECT EXISTS (SELECT 1 FROM public.worker_vehicles
                 WHERE worker_profile_id = _worker_profile_id AND status = 'verified' AND is_active
                   AND NOT is_demo AND provider IS NOT NULL AND provider_reference IS NOT NULL
                   AND (expires_at IS NULL OR expires_at > now())) INTO v_vehicle;
  SELECT EXISTS (SELECT 1 FROM public.worker_background_checks
                 WHERE worker_profile_id = _worker_profile_id AND status = 'verified'
                   AND NOT is_demo AND provider IS NOT NULL AND provider_reference IS NOT NULL
                   AND (expires_at IS NULL OR expires_at > now())) INTO v_background;
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

-- Reconcile any record that predates this hardening pass.
UPDATE public.worker_identity_verifications
  SET status = 'provider_not_connected', selfie_check = 'provider_not_connected',
      liveness_check = 'provider_not_connected', document_check = 'provider_not_connected'
  WHERE status = 'verified' AND (provider IS NULL OR provider_reference IS NULL OR is_demo);
UPDATE public.worker_address_verifications SET status = 'provider_not_connected'
  WHERE status = 'verified' AND (provider IS NULL OR provider_reference IS NULL OR is_demo);
UPDATE public.worker_vehicles SET status = 'provider_not_connected'
  WHERE status = 'verified' AND (provider IS NULL OR provider_reference IS NULL OR is_demo);
UPDATE public.worker_background_checks SET status = 'provider_not_connected'
  WHERE status = 'verified' AND (provider IS NULL OR provider_reference IS NULL OR is_demo);

UPDATE public.worker_profiles p SET
  identity_verified = EXISTS (SELECT 1 FROM public.worker_identity_verifications v
    WHERE v.worker_profile_id = p.id AND v.status = 'verified' AND NOT v.is_demo
      AND v.provider IS NOT NULL AND v.provider_reference IS NOT NULL),
  residence_verified = EXISTS (SELECT 1 FROM public.worker_address_verifications v
    WHERE v.worker_profile_id = p.id AND v.status = 'verified' AND NOT v.is_demo
      AND v.provider IS NOT NULL AND v.provider_reference IS NOT NULL),
  vehicle_verified = EXISTS (SELECT 1 FROM public.worker_vehicles v
    WHERE v.worker_profile_id = p.id AND v.status = 'verified' AND v.is_active AND NOT v.is_demo
      AND v.provider IS NOT NULL AND v.provider_reference IS NOT NULL),
  background_checked = EXISTS (SELECT 1 FROM public.worker_background_checks v
    WHERE v.worker_profile_id = p.id AND v.status = 'verified' AND NOT v.is_demo
      AND v.provider IS NOT NULL AND v.provider_reference IS NOT NULL);

UPDATE public.worker_profiles SET trust_level = CASE
    WHEN identity_verified AND residence_verified AND background_checked AND completed_favors >= public.trust_setting_int('trust.level4_min_completed', 10) THEN 4
    WHEN identity_verified AND residence_verified AND vehicle_verified THEN 3
    WHEN identity_verified AND residence_verified THEN 2
    WHEN identity_verified THEN 1
    ELSE 0 END;