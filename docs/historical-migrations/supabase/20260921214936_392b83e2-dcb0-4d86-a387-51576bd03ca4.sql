-- =========================================================================
-- AnyOne16 — Security remediation (C1, C2, C3, H1..H8, M1, M3, M5)
-- Server-side enforcement only. No feature changes.
-- =========================================================================

-- ---------------------------------------------------------------- 0. anon --
-- C1/C2: anonymous role loses every privilege; only reference data remains.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon;
GRANT SELECT ON public.countries, public.currencies, public.languages, public.categories TO anon;

-- --------------------------------------------------------------- 1. helpers
-- H2: demo rows are no longer a participation bypass.
CREATE OR REPLACE FUNCTION public.is_favor_participant(_favor_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.favors f
    LEFT JOIN public.worker_profiles wp ON wp.id = f.selected_worker_profile_id
    LEFT JOIN public.profiles wpp ON wpp.id = wp.profile_id
    WHERE f.id = _favor_id
      AND (f.owner_user_id = auth.uid() OR wpp.user_id = auth.uid())
  )
$$;

CREATE OR REPLACE FUNCTION public.is_favor_owner(_favor_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.favors f WHERE f.id = _favor_id AND f.owner_user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::public.app_role)
$$;

-- demo content stays visible (read-only) to signed-in users only
CREATE OR REPLACE FUNCTION public.can_read_demo()
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT auth.uid() IS NOT NULL $$;

-- M3: fixed search_path on the remaining SECURITY DEFINER / trigger functions
ALTER FUNCTION public.verification_guard() SET search_path = public;
ALTER FUNCTION public.verification_audit() SET search_path = public;
ALTER FUNCTION public.is_verification_service_writer() SET search_path = public;
ALTER FUNCTION public.worker_profiles_freeze_trust() SET search_path = public;

-- ----------------------------------------------------------------- 2. favors
DROP POLICY IF EXISTS favors_select ON public.favors;
DROP POLICY IF EXISTS favors_insert ON public.favors;
DROP POLICY IF EXISTS favors_update ON public.favors;
DROP POLICY IF EXISTS favors_delete ON public.favors;

CREATE POLICY favors_select ON public.favors FOR SELECT TO authenticated
USING (owner_user_id = auth.uid() OR public.is_favor_participant(id) OR public.is_platform_admin() OR is_demo);

CREATE POLICY favors_insert ON public.favors FOR INSERT TO authenticated
WITH CHECK (owner_user_id = auth.uid() AND is_demo = FALSE);

CREATE POLICY favors_update ON public.favors FOR UPDATE TO authenticated
USING (owner_user_id = auth.uid() OR public.is_favor_participant(id) OR public.is_platform_admin())
WITH CHECK (owner_user_id = auth.uid() OR public.is_favor_participant(id) OR public.is_platform_admin());

CREATE POLICY favors_delete ON public.favors FOR DELETE TO authenticated
USING (owner_user_id = auth.uid() AND status IN ('draft','ai_processing','ready_for_review','ready_to_publish','published'));

-- H6: field-level authorisation. A worker may only move the operational status.
CREATE OR REPLACE FUNCTION public.favors_field_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner BOOLEAN;
BEGIN
  IF public.is_verification_service_writer() THEN RETURN NEW; END IF;

  NEW.id := OLD.id;
  NEW.owner_user_id := OLD.owner_user_id;
  NEW.customer_profile_id := OLD.customer_profile_id;
  NEW.is_demo := OLD.is_demo;
  NEW.created_at := OLD.created_at;

  v_owner := OLD.owner_user_id IS NOT NULL AND OLD.owner_user_id = auth.uid();

  IF NOT v_owner AND NOT public.is_platform_admin() THEN
    -- selected worker: operational status only, every other field frozen
    NEW := OLD;
    NEW.status := (SELECT s.status FROM (SELECT NEW.status AS status) s);
    NEW.updated_at := now();
    IF NEW.status NOT IN ('worker_selected','on_the_way','arrived','in_progress',
                          'near_destination','ready_for_confirmation') THEN
      RAISE EXCEPTION 'worker_status_not_allowed: % is not a worker-settable status', NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'cancelled_favor_is_final' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'disputed' AND NEW.status <> 'disputed' AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'disputed_favor_requires_admin' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.selected_offer_id IS DISTINCT FROM OLD.selected_offer_id AND NEW.selected_offer_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.offers o WHERE o.id = NEW.selected_offer_id AND o.favor_id = OLD.id) THEN
      RAISE EXCEPTION 'offer_does_not_belong_to_favor' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS favors_field_guard_trg ON public.favors;
CREATE TRIGGER favors_field_guard_trg BEFORE UPDATE ON public.favors
FOR EACH ROW EXECUTE FUNCTION public.favors_field_guard();

-- ----------------------------------------------------------------- 3. offers
DROP POLICY IF EXISTS offers_select ON public.offers;
DROP POLICY IF EXISTS offers_insert ON public.offers;
DROP POLICY IF EXISTS offers_update ON public.offers;

CREATE POLICY offers_select ON public.offers FOR SELECT TO authenticated
USING (public.is_favor_participant(favor_id) OR public.owns_worker_profile(worker_profile_id)
       OR public.is_platform_admin() OR is_demo);

CREATE POLICY offers_insert ON public.offers FOR INSERT TO authenticated
WITH CHECK (public.owns_worker_profile(worker_profile_id) AND is_demo = FALSE);

CREATE POLICY offers_update ON public.offers FOR UPDATE TO authenticated
USING (public.owns_worker_profile(worker_profile_id) OR public.is_favor_owner(favor_id) OR public.is_platform_admin())
WITH CHECK (public.owns_worker_profile(worker_profile_id) OR public.is_favor_owner(favor_id) OR public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.offers_field_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_verification_service_writer() THEN RETURN NEW; END IF;
  NEW.favor_id := OLD.favor_id;
  NEW.worker_profile_id := OLD.worker_profile_id;
  NEW.is_demo := OLD.is_demo;
  -- only the worker may change price/message, and only while pending
  IF NOT public.owns_worker_profile(OLD.worker_profile_id) OR OLD.status <> 'pending' THEN
    NEW.offered_amount := OLD.offered_amount;
    NEW.currency_code := OLD.currency_code;
    NEW.message := OLD.message;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS offers_field_guard_trg ON public.offers;
CREATE TRIGGER offers_field_guard_trg BEFORE UPDATE ON public.offers
FOR EACH ROW EXECUTE FUNCTION public.offers_field_guard();

-- ------------------------------------------------------------ 4. audit logs
-- C3: no client may ever write the audit trail.
DROP POLICY IF EXISTS audit_logs_insert ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_select ON public.audit_logs;
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM authenticated;

CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT TO authenticated
USING (public.is_platform_admin() OR actor_profile_id = public.current_profile_id());

-- trusted writer used by the app: actor always derived from the session
CREATE OR REPLACE FUNCTION public.log_app_event(
  _action text, _entity_type text, _entity_id uuid, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_profile UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF _action IS NULL OR length(_action) > 120 OR _action LIKE 'admin.%' THEN
    RAISE EXCEPTION 'action_not_allowed';
  END IF;
  IF _entity_type = 'favor' AND _entity_id IS NOT NULL
     AND NOT public.is_favor_participant(_entity_id) AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'not_a_participant';
  END IF;
  v_profile := public.current_profile_id();
  INSERT INTO public.audit_logs (actor_profile_id, action, entity_type, entity_id, metadata, is_demo)
  VALUES (v_profile, _action, coalesce(_entity_type,'app'), _entity_id, coalesce(_metadata,'{}'::jsonb), FALSE);
END;
$$;

-- --------------------------------------------------------- 5. notifications
-- H1: no client-side inserts at all.
DROP POLICY IF EXISTS notifications_insert ON public.notifications;
DROP POLICY IF EXISTS notifications_select ON public.notifications;
REVOKE INSERT, DELETE ON public.notifications FROM authenticated;

CREATE POLICY notifications_select ON public.notifications FOR SELECT TO authenticated
USING (profile_id = public.current_profile_id());

CREATE OR REPLACE FUNCTION public.notify_favor_participant(
  _favor_id uuid, _profile_id uuid, _type text, _title text,
  _body text DEFAULT NULL, _offer_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF _favor_id IS NULL OR NOT public.is_favor_participant(_favor_id) THEN
    RAISE EXCEPTION 'not_a_participant';
  END IF;
  -- recipient must be a participant of the same favor
  IF NOT EXISTS (
    SELECT 1 FROM public.favors f
    LEFT JOIN public.profiles op ON op.user_id = f.owner_user_id
    LEFT JOIN public.worker_profiles wp ON wp.id = f.selected_worker_profile_id
    WHERE f.id = _favor_id AND (_profile_id = op.id OR _profile_id = wp.profile_id OR _profile_id = f.customer_profile_id)
  ) THEN
    RAISE EXCEPTION 'recipient_not_a_participant';
  END IF;
  INSERT INTO public.notifications (profile_id, type, title, body, related_favor_id, related_offer_id, is_demo)
  VALUES (_profile_id, _type, _title, _body, _favor_id, _offer_id, FALSE);
END;
$$;

-- -------------------------------------------------------------- 6. messages
DROP POLICY IF EXISTS messages_select ON public.messages;
DROP POLICY IF EXISTS messages_insert ON public.messages;
DROP POLICY IF EXISTS messages_update ON public.messages;

CREATE POLICY messages_select ON public.messages FOR SELECT TO authenticated
USING (public.is_favor_participant(favor_id) OR public.is_platform_admin() OR is_demo);

CREATE POLICY messages_insert ON public.messages FOR INSERT TO authenticated
WITH CHECK (public.is_favor_participant(favor_id) AND is_demo = FALSE);

CREATE POLICY messages_update ON public.messages FOR UPDATE TO authenticated
USING (receiver_profile_id = public.current_profile_id())
WITH CHECK (receiver_profile_id = public.current_profile_id());

-- H3: author identity is derived server-side, never taken from the client
CREATE OR REPLACE FUNCTION public.messages_stamp_author()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_verification_service_writer() THEN RETURN NEW; END IF;
  NEW.sender_profile_id := public.current_profile_id();
  NEW.is_demo := FALSE;
  NEW.author_role := CASE WHEN public.is_favor_owner(NEW.favor_id) THEN 'customer' ELSE 'worker' END;
  IF NEW.message_type = 'system' THEN NEW.message_type := 'text'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS messages_stamp_author_trg ON public.messages;
CREATE TRIGGER messages_stamp_author_trg BEFORE INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.messages_stamp_author();

-- ------------------------------------------------------------- 7. locations
DROP POLICY IF EXISTS locations_insert ON public.locations;
DROP POLICY IF EXISTS locations_select ON public.locations;
DROP POLICY IF EXISTS locations_update ON public.locations;

CREATE POLICY locations_insert ON public.locations FOR INSERT TO authenticated
WITH CHECK (created_by_user_id = auth.uid() AND is_demo = FALSE);

CREATE POLICY locations_select ON public.locations FOR SELECT TO authenticated
USING (created_by_user_id = auth.uid() OR public.can_read_location(id) OR public.is_platform_admin() OR is_demo);

CREATE POLICY locations_update ON public.locations FOR UPDATE TO authenticated
USING (created_by_user_id = auth.uid())
WITH CHECK (created_by_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.locations_stamp_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_verification_service_writer() THEN RETURN NEW; END IF;
  NEW.created_by_user_id := auth.uid();
  NEW.is_demo := FALSE;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS locations_stamp_owner_trg ON public.locations;
CREATE TRIGGER locations_stamp_owner_trg BEFORE INSERT ON public.locations
FOR EACH ROW EXECUTE FUNCTION public.locations_stamp_owner();

-- H4: GPS history is tied to the authenticated worker
DROP POLICY IF EXISTS location_updates_insert ON public.location_updates;
DROP POLICY IF EXISTS location_updates_select ON public.location_updates;

CREATE POLICY location_updates_insert ON public.location_updates FOR INSERT TO authenticated
WITH CHECK (favor_id IS NOT NULL AND public.is_favor_participant(favor_id)
            AND (worker_profile_id IS NULL OR public.owns_worker_profile(worker_profile_id))
            AND is_demo = FALSE);

CREATE POLICY location_updates_select ON public.location_updates FOR SELECT TO authenticated
USING (favor_id IS NOT NULL AND (public.is_favor_participant(favor_id) OR public.is_platform_admin()));

-- favor_locations: drop the demo write bypass
DROP POLICY IF EXISTS favor_locations_insert ON public.favor_locations;
DROP POLICY IF EXISTS favor_locations_select ON public.favor_locations;
DROP POLICY IF EXISTS favor_locations_update ON public.favor_locations;
DROP POLICY IF EXISTS favor_locations_delete ON public.favor_locations;
CREATE POLICY favor_locations_select ON public.favor_locations FOR SELECT TO authenticated
USING (public.is_favor_participant(favor_id) OR public.is_platform_admin() OR is_demo);
CREATE POLICY favor_locations_insert ON public.favor_locations FOR INSERT TO authenticated
WITH CHECK (public.is_favor_owner(favor_id) AND is_demo = FALSE);
CREATE POLICY favor_locations_update ON public.favor_locations FOR UPDATE TO authenticated
USING (public.is_favor_owner(favor_id)) WITH CHECK (public.is_favor_owner(favor_id));
CREATE POLICY favor_locations_delete ON public.favor_locations FOR DELETE TO authenticated
USING (public.is_favor_owner(favor_id));

-- ------------------------------------------------------- 8. worker profiles
-- H5: internal Trust & Safety columns are not granted to app users at all.
REVOKE SELECT ON public.worker_profiles FROM authenticated;
GRANT SELECT (id, profile_id, display_name, headline, bio, avatar_url, rating, rating_count,
  completed_favors, completion_rate, cancellation_rate, verification_status, identity_verified,
  phone_verified, background_checked, residence_verified, vehicle_verified, trust_level,
  languages, service_zone, availability_status, available_categories, specialties, is_demo,
  joined_at, created_at, updated_at, city, region, country_code, service_radius_km)
  ON public.worker_profiles TO authenticated;

DROP POLICY IF EXISTS worker_profiles_select ON public.worker_profiles;
CREATE POLICY worker_profiles_select ON public.worker_profiles FOR SELECT TO authenticated USING (true);

-- admin-only window on the private safety columns
CREATE OR REPLACE FUNCTION public.admin_worker_safety()
RETURNS TABLE (id uuid, display_name text, risk_level text, risk_score numeric,
               restriction_status text, dispute_count integer, latitude double precision,
               longitude double precision)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'admin_only'; END IF;
  RETURN QUERY SELECT w.id, w.display_name, w.risk_level::TEXT, w.risk_score,
    w.restriction_status::TEXT, w.dispute_count, w.latitude, w.longitude
  FROM public.worker_profiles w;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_worker_restriction(
  _worker_profile_id uuid, _kind text, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'admin_only'; END IF;
  UPDATE public.worker_profiles SET restriction_status = _kind::public.worker_restriction_kind,
         updated_at = now() WHERE id = _worker_profile_id;
  INSERT INTO public.worker_restrictions (worker_profile_id, kind, reason, active,
    created_by_profile_id, is_demo)
  VALUES (_worker_profile_id, _kind::public.worker_restriction_kind, coalesce(_reason,'admin action'),
          _kind <> 'none', public.current_profile_id(), FALSE);
  INSERT INTO public.audit_logs (actor_profile_id, action, entity_type, entity_id, metadata, is_demo)
  VALUES (public.current_profile_id(), 'admin.worker_restriction', 'worker_profile', _worker_profile_id,
          jsonb_build_object('kind', _kind, 'reason', _reason), FALSE);
END;
$$;

DROP POLICY IF EXISTS worker_service_areas_select ON public.worker_service_areas;
DROP POLICY IF EXISTS worker_service_areas_insert ON public.worker_service_areas;
DROP POLICY IF EXISTS worker_service_areas_update ON public.worker_service_areas;
CREATE POLICY worker_service_areas_select ON public.worker_service_areas FOR SELECT TO authenticated
USING (public.owns_worker_profile(worker_profile_id) OR public.is_platform_admin());
CREATE POLICY worker_service_areas_insert ON public.worker_service_areas FOR INSERT TO authenticated
WITH CHECK (public.owns_worker_profile(worker_profile_id) AND is_demo = FALSE);
CREATE POLICY worker_service_areas_update ON public.worker_service_areas FOR UPDATE TO authenticated
USING (public.owns_worker_profile(worker_profile_id)) WITH CHECK (public.owns_worker_profile(worker_profile_id));

-- ------------------------------------------- 9. legacy verifications (H7) --
DROP POLICY IF EXISTS "verifications_select" ON public.verifications;
DROP POLICY IF EXISTS "verifications_insert" ON public.verifications;
DROP POLICY IF EXISTS "verifications_update" ON public.verifications;
REVOKE INSERT, UPDATE, DELETE ON public.verifications FROM authenticated;
CREATE POLICY verifications_select ON public.verifications FOR SELECT TO authenticated
USING (profile_id = public.current_profile_id() OR public.is_platform_admin());

UPDATE public.verifications SET status = 'pending'
WHERE status = 'verified' AND NOT is_demo;

-- --------------------------------------------------------------- 10. reviews
DROP POLICY IF EXISTS reviews_select ON public.reviews;
DROP POLICY IF EXISTS reviews_insert ON public.reviews;
CREATE POLICY reviews_select ON public.reviews FOR SELECT TO authenticated USING (true);
CREATE POLICY reviews_insert ON public.reviews FOR INSERT TO authenticated
WITH CHECK (reviewer_profile_id = public.current_profile_id() AND is_demo = FALSE
            AND favor_id IS NOT NULL AND public.is_favor_participant(favor_id)
            AND reviewed_profile_id IS DISTINCT FROM public.current_profile_id());

CREATE UNIQUE INDEX IF NOT EXISTS reviews_one_per_favor_reviewer
  ON public.reviews (favor_id, reviewer_profile_id) WHERE favor_id IS NOT NULL;

-- ------------------------------------------ 11. evidence / disputes / codes
DROP POLICY IF EXISTS "participants add evidence" ON public.favor_evidence;
CREATE POLICY "participants add evidence" ON public.favor_evidence FOR INSERT TO authenticated
WITH CHECK (public.is_favor_participant(favor_id) AND is_demo = FALSE);

DROP POLICY IF EXISTS "participants open disputes" ON public.disputes;
DROP POLICY IF EXISTS "participants read disputes" ON public.disputes;
DROP POLICY IF EXISTS "admins resolve disputes" ON public.disputes;
CREATE POLICY "participants read disputes" ON public.disputes FOR SELECT TO authenticated
USING (public.is_favor_participant(favor_id) OR public.is_platform_admin());
CREATE POLICY "participants open disputes" ON public.disputes FOR INSERT TO authenticated
WITH CHECK (public.is_favor_participant(favor_id) AND is_demo = FALSE AND status = 'open'
            AND opened_by_profile_id = public.current_profile_id());
CREATE POLICY "admins resolve disputes" ON public.disputes FOR UPDATE TO authenticated
USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- M1: the confirmation-code RPC requires an authenticated caller
CREATE OR REPLACE FUNCTION public.validate_favor_completion_code(
  _favor_id uuid, _code text, _latitude double precision DEFAULT NULL::double precision,
  _longitude double precision DEFAULT NULL::double precision, _session jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_favor public.favors%ROWTYPE;
  v_row public.favor_completion_codes%ROWTYPE;
  v_worker UUID;
  v_is_worker BOOLEAN := FALSE;
  v_clean TEXT := regexp_replace(COALESCE(_code, ''), '\D', '', 'g');
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  SELECT * INTO v_favor FROM public.favors WHERE id = _favor_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'favor_not_found'); END IF;

  IF v_favor.status IN ('cancelled','disputed','completed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'favor_not_completable');
  END IF;

  SELECT wp.id INTO v_worker
  FROM public.worker_profiles wp
  JOIN public.profiles p ON p.id = wp.profile_id
  WHERE wp.id = v_favor.selected_worker_profile_id AND p.user_id = auth.uid();
  v_is_worker := v_worker IS NOT NULL;

  IF NOT v_is_worker AND NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  PERFORM public.ensure_favor_completion_code(_favor_id);
  SELECT * INTO v_row FROM public.favor_completion_codes WHERE favor_id = _favor_id FOR UPDATE;

  IF v_row.status = 'used' THEN RETURN jsonb_build_object('ok', false, 'error', 'code_already_used'); END IF;
  IF v_row.status <> 'active' THEN RETURN jsonb_build_object('ok', false, 'error', 'code_not_active'); END IF;
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
      SET failed_attempts = failed_attempts + 1, updated_at = now() WHERE id = v_row.id;
    INSERT INTO public.favor_code_attempts
      (favor_id, worker_profile_id, actor_user_id, succeeded, latitude, longitude, session_metadata, is_demo)
    VALUES (_favor_id, v_worker, auth.uid(), FALSE, _latitude, _longitude, COALESCE(_session,'{}'::jsonb), v_favor.is_demo);
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
  VALUES (_favor_id, v_worker, auth.uid(), TRUE, _latitude, _longitude, COALESCE(_session,'{}'::jsonb), v_favor.is_demo);

  UPDATE public.favors SET status = 'completed'::public.favor_status,
    completed_at = now(), updated_at = now() WHERE id = _favor_id;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, metadata, is_demo)
  VALUES ('completion_code.validated', 'favor', _favor_id,
    jsonb_build_object('worker_profile_id', v_worker, 'previous_status', v_favor.status,
                       'new_status', 'completed'), v_favor.is_demo);

  RETURN jsonb_build_object('ok', true, 'status', 'completed');
END;
$$;

-- --------------------------------------------- 12. profiles / customer data
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR is_demo OR public.is_platform_admin()
       OR EXISTS (SELECT 1 FROM public.worker_profiles wp
                  WHERE wp.profile_id = profiles.id AND wp.is_demo = FALSE));

DROP POLICY IF EXISTS customer_profiles_insert ON public.customer_profiles;
DROP POLICY IF EXISTS customer_profiles_update ON public.customer_profiles;
CREATE POLICY customer_profiles_insert ON public.customer_profiles FOR INSERT TO authenticated
WITH CHECK (profile_id = public.current_profile_id() AND is_demo = FALSE);
CREATE POLICY customer_profiles_update ON public.customer_profiles FOR UPDATE TO authenticated
USING (profile_id = public.current_profile_id()) WITH CHECK (profile_id = public.current_profile_id());

-- ----------------------------------------------------- 13. execute grants --
-- M2: nothing is callable anonymously; sensitive routines are admin-gated.
REVOKE EXECUTE ON FUNCTION public.validate_favor_completion_code(uuid, text, double precision, double precision, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ensure_favor_completion_code(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_worker_trust_level(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_verification_event(text, text, uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trust_setting_int(text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_read_location(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_profile_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_favor_participant(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.owns_worker_profile(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.verification_provider_connected(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_verification_service_writer() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.validate_favor_completion_code(uuid, text, double precision, double precision, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_worker_trust_level(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_app_event(text, text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_favor_participant(uuid, uuid, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_worker_safety() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_worker_restriction(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_favor_participant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_favor_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_worker_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_location(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trust_setting_int(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verification_provider_connected(text) TO authenticated;