-- 0015 FINAL PRE-WORKER HARDENING
-- 1) server-side rate limiting / abuse protection
-- 2) demo <-> real isolation
-- 3) configurable, audited commission rules

CREATE TABLE IF NOT EXISTS public.rate_limit_rules (
  operation        TEXT PRIMARY KEY,
  max_attempts     INTEGER NOT NULL,
  window_seconds   INTEGER NOT NULL,
  cooldown_seconds INTEGER NOT NULL DEFAULT 0,
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  description      TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rate_limit_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation     TEXT NOT NULL,
  actor_user_id UUID,
  subject_key   TEXT,
  succeeded     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_limit_events_lookup
  ON public.rate_limit_events (operation, actor_user_id, subject_key, created_at DESC);

GRANT ALL ON public.rate_limit_rules  TO service_role;
GRANT ALL ON public.rate_limit_events TO service_role;
GRANT SELECT ON public.rate_limit_rules TO authenticated;
GRANT SELECT ON public.rate_limit_events TO authenticated;

ALTER TABLE public.rate_limit_rules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rate_limit_rules_admin ON public.rate_limit_rules;
CREATE POLICY rate_limit_rules_admin ON public.rate_limit_rules
  FOR SELECT TO authenticated USING (public.is_platform_admin());

DROP POLICY IF EXISTS rate_limit_events_admin ON public.rate_limit_events;
CREATE POLICY rate_limit_events_admin ON public.rate_limit_events
  FOR SELECT TO authenticated USING (public.is_platform_admin());

INSERT INTO public.rate_limit_rules (operation, max_attempts, window_seconds, cooldown_seconds, description) VALUES
  ('auth.sign_in',              10,   900,  900, 'Sign-in attempts per identity key'),
  ('auth.recovery',              5,  3600, 3600, 'Password recovery requests per identity key'),
  ('auth.sign_up',               5,  3600, 3600, 'Sign-up attempts per identity key'),
  ('favor.create',              15,  3600,    0, 'Favor creation'),
  ('offer.create',              40,  3600,    0, 'Offers and counteroffers'),
  ('message.send',              60,   300,    0, 'Chat messages'),
  ('dispute.open',               5, 86400, 3600, 'Dispute creation'),
  ('evidence.upload',           60,  3600,    0, 'Evidence capture'),
  ('verification.request',       6, 86400, 3600, 'Verification submissions'),
  ('location.create',           60,  3600,    0, 'Saved locations'),
  ('completion_code.validate',  20,  3600, 1800, 'Completion-code validation attempts'),
  ('completion_code.ensure',    30,  3600,    0, 'Completion-code generation'),
  ('payment.create',            15,  3600,    0, 'Payment creation'),
  ('payment.advance',           80,  3600,    0, 'Payment state transitions'),
  ('refund.request',             6, 86400, 3600, 'Refund requests'),
  ('admin.security_action',    200,  3600,    0, 'Administrative security operations'),
  ('notification.send',        120,  3600,    0, 'Participant notifications')
ON CONFLICT (operation) DO NOTHING;

CREATE OR REPLACE FUNCTION public.enforce_rate_limit(
  _operation TEXT, _subject TEXT DEFAULT NULL, _record BOOLEAN DEFAULT TRUE, _succeeded BOOLEAN DEFAULT TRUE
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  r public.rate_limit_rules%ROWTYPE;
  v_uid UUID := auth.uid();
  v_used INTEGER;
  v_cool INTEGER;
BEGIN
  SELECT * INTO r FROM public.rate_limit_rules WHERE operation = _operation AND active;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_uid IS NULL AND _subject IS NULL THEN RETURN; END IF;

  SELECT count(*) INTO v_used FROM public.rate_limit_events e
   WHERE e.operation = _operation
     AND e.created_at > now() - make_interval(secs => r.window_seconds)
     AND ((v_uid IS NOT NULL AND e.actor_user_id = v_uid)
       OR (v_uid IS NULL AND e.subject_key = _subject));

  IF r.cooldown_seconds > 0 THEN
    SELECT count(*) INTO v_cool FROM public.rate_limit_events e
     WHERE e.operation = _operation
       AND e.created_at > now() - make_interval(secs => r.cooldown_seconds)
       AND ((v_uid IS NOT NULL AND e.actor_user_id = v_uid)
         OR (v_uid IS NULL AND e.subject_key = _subject));
  ELSE
    v_cool := v_used;
  END IF;

  IF v_used >= r.max_attempts OR v_cool >= r.max_attempts THEN
    INSERT INTO public.audit_logs (action, entity_type, entity_id, metadata, is_demo)
    VALUES ('security.rate_limited', 'rate_limit', NULL,
            jsonb_build_object('operation', _operation), FALSE);
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0001';
  END IF;

  IF _record THEN
    INSERT INTO public.rate_limit_events (operation, actor_user_id, subject_key, succeeded)
    VALUES (_operation, v_uid, _subject, _succeeded);
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.enforce_rate_limit(TEXT, TEXT, BOOLEAN, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_rate_limit(TEXT, TEXT, BOOLEAN, BOOLEAN) FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_rate_limit(TEXT, TEXT, BOOLEAN, BOOLEAN) FROM authenticated;

CREATE OR REPLACE FUNCTION public.rate_limit_insert_guard()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    PERFORM public.enforce_rate_limit(TG_ARGV[0]);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rl_favors ON public.favors;
CREATE TRIGGER rl_favors BEFORE INSERT ON public.favors
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_insert_guard('favor.create');
DROP TRIGGER IF EXISTS rl_offers ON public.offers;
CREATE TRIGGER rl_offers BEFORE INSERT ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_insert_guard('offer.create');
DROP TRIGGER IF EXISTS rl_messages ON public.messages;
CREATE TRIGGER rl_messages BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_insert_guard('message.send');
DROP TRIGGER IF EXISTS rl_disputes ON public.disputes;
CREATE TRIGGER rl_disputes BEFORE INSERT ON public.disputes
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_insert_guard('dispute.open');
DROP TRIGGER IF EXISTS rl_evidence ON public.favor_evidence;
CREATE TRIGGER rl_evidence BEFORE INSERT ON public.favor_evidence
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_insert_guard('evidence.upload');
DROP TRIGGER IF EXISTS rl_locations ON public.locations;
CREATE TRIGGER rl_locations BEFORE INSERT ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_insert_guard('location.create');
DROP TRIGGER IF EXISTS rl_identity ON public.worker_identity_verifications;
CREATE TRIGGER rl_identity BEFORE INSERT ON public.worker_identity_verifications
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_insert_guard('verification.request');
DROP TRIGGER IF EXISTS rl_address ON public.worker_address_verifications;
CREATE TRIGGER rl_address BEFORE INSERT ON public.worker_address_verifications
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_insert_guard('verification.request');
DROP TRIGGER IF EXISTS rl_vehicle ON public.worker_vehicles;
CREATE TRIGGER rl_vehicle BEFORE INSERT ON public.worker_vehicles
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_insert_guard('verification.request');
DROP TRIGGER IF EXISTS rl_background ON public.worker_background_checks;
CREATE TRIGGER rl_background BEFORE INSERT ON public.worker_background_checks
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_insert_guard('verification.request');
DROP TRIGGER IF EXISTS rl_payments_insert ON public.payments;
CREATE TRIGGER rl_payments_insert BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_insert_guard('payment.create');
DROP TRIGGER IF EXISTS rl_payments_update ON public.payments;
CREATE TRIGGER rl_payments_update BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_insert_guard('payment.advance');
DROP TRIGGER IF EXISTS rl_refunds_insert ON public.refunds;
CREATE TRIGGER rl_refunds_insert BEFORE INSERT ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_insert_guard('refund.request');
DROP TRIGGER IF EXISTS rl_codes_insert ON public.favor_completion_codes;
CREATE TRIGGER rl_codes_insert BEFORE INSERT ON public.favor_completion_codes
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_insert_guard('completion_code.ensure');
DROP TRIGGER IF EXISTS rl_notifications_insert ON public.notifications;
CREATE TRIGGER rl_notifications_insert BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_insert_guard('notification.send');

CREATE OR REPLACE FUNCTION public.guard_auth_action(_kind TEXT, _subject TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF _kind NOT IN ('auth.sign_in','auth.sign_up','auth.recovery') THEN
    RAISE EXCEPTION 'unsupported_operation';
  END IF;
  PERFORM public.enforce_rate_limit(_kind, md5(lower(coalesce(_subject, 'unknown'))));
  RETURN TRUE;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.guard_auth_action(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guard_auth_action(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.guard_auth_action(TEXT, TEXT) TO authenticated;

CREATE TABLE IF NOT EXISTS public.demo_context (
  user_id    UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.demo_context TO authenticated;
GRANT ALL    ON public.demo_context TO service_role;
ALTER TABLE public.demo_context ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS demo_context_select_own ON public.demo_context;
CREATE POLICY demo_context_select_own ON public.demo_context
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.enter_demo_context()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;
  INSERT INTO public.demo_context (user_id) VALUES (auth.uid()) ON CONFLICT DO NOTHING;
  RETURN TRUE;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.enter_demo_context() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enter_demo_context() FROM anon;
GRANT EXECUTE ON FUNCTION public.enter_demo_context() TO authenticated;

CREATE OR REPLACE FUNCTION public.can_read_demo()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.demo_context d WHERE d.user_id = auth.uid())
$$;
REVOKE EXECUTE ON FUNCTION public.can_read_demo() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_read_demo() FROM anon;
GRANT EXECUTE ON FUNCTION public.can_read_demo() TO authenticated;

DROP POLICY IF EXISTS favors_select ON public.favors;
CREATE POLICY favors_select ON public.favors FOR SELECT TO authenticated
USING ((owner_user_id = auth.uid()) OR public.is_favor_participant(id)
       OR public.is_platform_admin() OR (is_demo AND public.can_read_demo()));

DROP POLICY IF EXISTS offers_select ON public.offers;
CREATE POLICY offers_select ON public.offers FOR SELECT TO authenticated
USING (public.is_favor_participant(favor_id) OR public.owns_worker_profile(worker_profile_id)
       OR public.is_platform_admin() OR (is_demo AND public.can_read_demo()));

DROP POLICY IF EXISTS messages_select ON public.messages;
CREATE POLICY messages_select ON public.messages FOR SELECT TO authenticated
USING (public.is_favor_participant(favor_id) OR public.is_platform_admin()
       OR (is_demo AND public.can_read_demo()));

DROP POLICY IF EXISTS favor_locations_select ON public.favor_locations;
CREATE POLICY favor_locations_select ON public.favor_locations FOR SELECT TO authenticated
USING (public.is_favor_participant(favor_id) OR public.is_platform_admin()
       OR (is_demo AND public.can_read_demo()));

DROP POLICY IF EXISTS locations_select ON public.locations;
CREATE POLICY locations_select ON public.locations FOR SELECT TO authenticated
USING ((created_by_user_id = auth.uid()) OR public.can_read_location(id)
       OR public.is_platform_admin() OR (is_demo AND public.can_read_demo()));

DROP POLICY IF EXISTS customer_profiles_select ON public.customer_profiles;
CREATE POLICY customer_profiles_select ON public.customer_profiles FOR SELECT TO authenticated
USING ((profile_id = public.current_profile_id()) OR public.is_platform_admin()
       OR (is_demo AND public.can_read_demo()));

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated
USING ((user_id = auth.uid()) OR public.is_platform_admin()
       OR (is_demo AND public.can_read_demo())
       OR EXISTS (SELECT 1 FROM public.worker_profiles wp
                  WHERE wp.profile_id = profiles.id AND wp.is_demo = FALSE));

DROP POLICY IF EXISTS worker_profiles_select ON public.worker_profiles;
CREATE POLICY worker_profiles_select ON public.worker_profiles FOR SELECT TO authenticated
USING (is_demo = FALSE OR public.can_read_demo());

DROP POLICY IF EXISTS worker_profiles_insert ON public.worker_profiles;
CREATE POLICY worker_profiles_insert ON public.worker_profiles FOR INSERT TO authenticated
WITH CHECK (profile_id = public.current_profile_id() AND is_demo = FALSE);

DROP POLICY IF EXISTS worker_profiles_update ON public.worker_profiles;
CREATE POLICY worker_profiles_update ON public.worker_profiles FOR UPDATE TO authenticated
USING (profile_id = public.current_profile_id() AND is_demo = FALSE)
WITH CHECK (profile_id = public.current_profile_id() AND is_demo = FALSE);

DROP POLICY IF EXISTS reviews_select ON public.reviews;
CREATE POLICY reviews_select ON public.reviews FOR SELECT TO authenticated
USING (is_demo = FALSE OR public.can_read_demo());

CREATE OR REPLACE FUNCTION public.freeze_demo_flag()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NEW.is_demo IS DISTINCT FROM OLD.is_demo THEN
    RAISE EXCEPTION 'demo_flag_is_immutable';
  END IF;
  IF OLD.is_demo AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'demo_records_are_read_only';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS demo_freeze_favors ON public.favors;
CREATE TRIGGER demo_freeze_favors BEFORE UPDATE ON public.favors
  FOR EACH ROW EXECUTE FUNCTION public.freeze_demo_flag();
DROP TRIGGER IF EXISTS demo_freeze_offers ON public.offers;
CREATE TRIGGER demo_freeze_offers BEFORE UPDATE ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.freeze_demo_flag();
DROP TRIGGER IF EXISTS demo_freeze_messages ON public.messages;
CREATE TRIGGER demo_freeze_messages BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.freeze_demo_flag();
DROP TRIGGER IF EXISTS demo_freeze_worker_profiles ON public.worker_profiles;
CREATE TRIGGER demo_freeze_worker_profiles BEFORE UPDATE ON public.worker_profiles
  FOR EACH ROW EXECUTE FUNCTION public.freeze_demo_flag();
DROP TRIGGER IF EXISTS demo_freeze_payments ON public.payments;
CREATE TRIGGER demo_freeze_payments BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.freeze_demo_flag();

ALTER TABLE public.platform_fee_rules
  ADD COLUMN IF NOT EXISTS effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS effective_to   TIMESTAMPTZ;

REVOKE INSERT, UPDATE, DELETE ON public.platform_fee_rules  FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.cancellation_policies FROM authenticated;
DROP POLICY IF EXISTS "admins manage fee rules" ON public.platform_fee_rules;
DROP POLICY IF EXISTS "admins manage policies" ON public.cancellation_policies;

CREATE OR REPLACE FUNCTION public.compute_platform_fee(
  _amount NUMERIC, _currency TEXT, _country TEXT, _category TEXT,
  OUT fee_rule_id UUID, OUT platform_fee NUMERIC)
RETURNS RECORD LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.platform_fee_rules%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.platform_fee_rules
  WHERE active AND NOT is_demo
    AND effective_from <= now()
    AND (effective_to IS NULL OR effective_to > now())
    AND (currency_code IS NULL OR currency_code = _currency)
    AND (country_code IS NULL OR country_code = _country)
    AND (category_slug IS NULL OR category_slug = _category)
  ORDER BY priority DESC, created_at ASC LIMIT 1;

  IF NOT FOUND THEN
    fee_rule_id := NULL;
    platform_fee := round(_amount * (public.trust_setting_int('finance.default_fee_percentage', 12)::NUMERIC / 100.0), 2);
    RETURN;
  END IF;

  fee_rule_id := r.id;
  platform_fee := CASE r.fee_type
    WHEN 'percentage' THEN _amount * r.percentage / 100.0
    WHEN 'fixed'      THEN r.fixed_amount
    ELSE (_amount * r.percentage / 100.0) + r.fixed_amount
  END;
  IF r.min_amount IS NOT NULL THEN platform_fee := GREATEST(platform_fee, r.min_amount); END IF;
  IF r.max_amount IS NOT NULL THEN platform_fee := LEAST(platform_fee, r.max_amount); END IF;
  platform_fee := round(GREATEST(platform_fee, 0), 2);
  IF platform_fee > _amount THEN platform_fee := _amount; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_fee_rule(
  _id UUID, _label TEXT, _fee_type TEXT, _percentage NUMERIC, _fixed_amount NUMERIC,
  _min_amount NUMERIC, _max_amount NUMERIC, _currency_code TEXT, _country_code TEXT,
  _category_slug TEXT, _promo_code TEXT, _priority INTEGER, _active BOOLEAN,
  _effective_from TIMESTAMPTZ, _effective_to TIMESTAMPTZ)
RETURNS public.platform_fee_rules
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row public.platform_fee_rules%ROWTYPE; v_prev JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'admin_only'; END IF;
  PERFORM public.enforce_rate_limit('admin.security_action');
  IF _percentage < 0 OR _percentage > 100 THEN RAISE EXCEPTION 'invalid_percentage'; END IF;
  IF _fixed_amount < 0 THEN RAISE EXCEPTION 'invalid_fixed_amount'; END IF;

  IF _id IS NOT NULL THEN
    SELECT to_jsonb(p) INTO v_prev FROM public.platform_fee_rules p WHERE p.id = _id;
    UPDATE public.platform_fee_rules SET
      label=_label, fee_type=_fee_type::public.fee_type, percentage=_percentage,
      fixed_amount=_fixed_amount, min_amount=_min_amount, max_amount=_max_amount,
      currency_code=_currency_code, country_code=_country_code, category_slug=_category_slug,
      promo_code=_promo_code, priority=COALESCE(_priority,0), active=COALESCE(_active,TRUE),
      effective_from=COALESCE(_effective_from, now()), effective_to=_effective_to, updated_at=now()
    WHERE id=_id RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.platform_fee_rules (label, fee_type, percentage, fixed_amount, min_amount,
      max_amount, currency_code, country_code, category_slug, promo_code, priority, active,
      effective_from, effective_to, is_demo)
    VALUES (_label, _fee_type::public.fee_type, _percentage, _fixed_amount, _min_amount,
      _max_amount, _currency_code, _country_code, _category_slug, _promo_code,
      COALESCE(_priority,0), COALESCE(_active,TRUE), COALESCE(_effective_from, now()), _effective_to, FALSE)
    RETURNING * INTO v_row;
  END IF;

  INSERT INTO public.audit_logs (actor_profile_id, action, entity_type, entity_id, metadata, is_demo)
  VALUES (public.current_profile_id(), 'admin.fee_rule_changed', 'platform_fee_rule', v_row.id,
          jsonb_build_object('previous', v_prev, 'next', to_jsonb(v_row)), FALSE);
  RETURN v_row;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_upsert_fee_rule(UUID,TEXT,TEXT,NUMERIC,NUMERIC,NUMERIC,NUMERIC,TEXT,TEXT,TEXT,TEXT,INTEGER,BOOLEAN,TIMESTAMPTZ,TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_upsert_fee_rule(UUID,TEXT,TEXT,NUMERIC,NUMERIC,NUMERIC,NUMERIC,TEXT,TEXT,TEXT,TEXT,INTEGER,BOOLEAN,TIMESTAMPTZ,TIMESTAMPTZ) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_fee_rule(UUID,TEXT,TEXT,NUMERIC,NUMERIC,NUMERIC,NUMERIC,TEXT,TEXT,TEXT,TEXT,INTEGER,BOOLEAN,TIMESTAMPTZ,TIMESTAMPTZ) TO authenticated;

CREATE OR REPLACE FUNCTION public.fee_rules_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.audit_logs (actor_profile_id, action, entity_type, entity_id, metadata, is_demo)
  VALUES (public.current_profile_id(), 'fee_rule.' || lower(TG_OP), 'platform_fee_rule',
          COALESCE(NEW.id, OLD.id),
          jsonb_build_object('previous', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
                             'next', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END), FALSE);
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS fee_rules_audit_trg ON public.platform_fee_rules;
CREATE TRIGGER fee_rules_audit_trg AFTER INSERT OR UPDATE OR DELETE ON public.platform_fee_rules
  FOR EACH ROW EXECUTE FUNCTION public.fee_rules_audit();

CREATE OR REPLACE FUNCTION public.validate_favor_completion_code(
  _favor_id UUID, _code TEXT, _latitude DOUBLE PRECISION DEFAULT NULL,
  _longitude DOUBLE PRECISION DEFAULT NULL, _session JSONB DEFAULT '{}'::jsonb)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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

  BEGIN
    PERFORM public.enforce_rate_limit('completion_code.validate');
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
  END;

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