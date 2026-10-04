-- =========================================================================
-- AnyOne16 — C4 / M4: financial values and state transitions move server-side
-- No real payment provider is connected. Test payments only.
-- =========================================================================

-- --------------------------------------------- 1. remove client write paths
DROP POLICY IF EXISTS "customer creates payment" ON public.payments;
DROP POLICY IF EXISTS "participants update payment" ON public.payments;
DROP POLICY IF EXISTS "participants read payments" ON public.payments;
REVOKE INSERT, UPDATE, DELETE ON public.payments FROM authenticated;
CREATE POLICY "participants read payments" ON public.payments FOR SELECT TO authenticated
USING (public.is_favor_participant(favor_id) OR public.is_platform_admin());

DROP POLICY IF EXISTS "participants create settlements" ON public.settlements;
DROP POLICY IF EXISTS "participants update settlements" ON public.settlements;
DROP POLICY IF EXISTS "admins update settlements" ON public.settlements;
DROP POLICY IF EXISTS "participants read settlements" ON public.settlements;
REVOKE INSERT, UPDATE, DELETE ON public.settlements FROM authenticated;
CREATE POLICY "participants read settlements" ON public.settlements FOR SELECT TO authenticated
USING (public.is_favor_participant(favor_id) OR public.is_platform_admin());

DROP POLICY IF EXISTS "participants create refunds" ON public.refunds;
DROP POLICY IF EXISTS "admins update refunds" ON public.refunds;
DROP POLICY IF EXISTS "participants read refunds" ON public.refunds;
REVOKE INSERT, UPDATE, DELETE ON public.refunds FROM authenticated;
CREATE POLICY "participants read refunds" ON public.refunds FOR SELECT TO authenticated
USING (public.is_favor_participant(favor_id) OR public.is_platform_admin());

DROP POLICY IF EXISTS "participants write payment events" ON public.payment_events;
DROP POLICY IF EXISTS "participants read payment events" ON public.payment_events;
REVOKE INSERT, UPDATE, DELETE ON public.payment_events FROM authenticated;
CREATE POLICY "participants read payment events" ON public.payment_events FOR SELECT TO authenticated
USING ((favor_id IS NOT NULL AND public.is_favor_participant(favor_id)) OR public.is_platform_admin());

-- fee rules and cancellation policies: readable, admin-writable, never anon
DROP POLICY IF EXISTS "fee rules readable" ON public.platform_fee_rules;
CREATE POLICY "fee rules readable" ON public.platform_fee_rules FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "policies readable" ON public.cancellation_policies;
CREATE POLICY "policies readable" ON public.cancellation_policies FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "trust_settings_select" ON public.trust_settings;
DROP POLICY IF EXISTS "trust_eligibility_rules_select" ON public.trust_eligibility_rules;

-- ------------------------------------------------ 2. server-side fee engine
CREATE OR REPLACE FUNCTION public.compute_platform_fee(
  _amount numeric, _currency text, _country text, _category text,
  OUT fee_rule_id uuid, OUT platform_fee numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.platform_fee_rules%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.platform_fee_rules
  WHERE active AND NOT is_demo
    AND (currency_code IS NULL OR currency_code = _currency)
    AND (country_code IS NULL OR country_code = _country)
    AND (category_slug IS NULL OR category_slug = _category)
  ORDER BY priority DESC, created_at ASC LIMIT 1;

  IF NOT FOUND THEN
    fee_rule_id := NULL;
    platform_fee := round(_amount * 0.12, 2);
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

-- ------------------------------------------ 3. payment creation (idempotent)
CREATE OR REPLACE FUNCTION public.create_favor_payment(_favor_id uuid, _method text DEFAULT NULL)
RETURNS public.payments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_favor public.favors%ROWTYPE;
  v_offer public.offers%ROWTYPE;
  v_existing public.payments%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_key TEXT;
  v_amount NUMERIC;
  v_currency TEXT;
  v_fee NUMERIC;
  v_rule UUID;
  v_worker UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  SELECT * INTO v_favor FROM public.favors WHERE id = _favor_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'favor_not_found'; END IF;
  IF v_favor.owner_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'only_the_client_can_pay'; END IF;
  IF v_favor.is_demo THEN RAISE EXCEPTION 'demo_favors_cannot_be_paid'; END IF;
  IF v_favor.status IN ('cancelled','disputed') THEN RAISE EXCEPTION 'favor_not_payable'; END IF;

  v_key := 'payment:' || _favor_id::TEXT;
  SELECT * INTO v_existing FROM public.payments WHERE idempotency_key = v_key;
  IF FOUND THEN RETURN v_existing; END IF;

  -- authoritative price: the accepted offer, never a client-supplied amount
  SELECT * INTO v_offer FROM public.offers
  WHERE favor_id = _favor_id AND status = 'accepted' ORDER BY updated_at DESC LIMIT 1;
  IF FOUND THEN
    v_amount := v_offer.offered_amount;
    v_currency := v_offer.currency_code;
    v_worker := v_offer.worker_profile_id;
  ELSE
    v_amount := v_favor.customer_budget_amount;
    v_currency := v_favor.customer_budget_currency;
    v_worker := v_favor.selected_worker_profile_id;
  END IF;
  IF v_amount IS NULL OR v_amount <= 0 THEN RAISE EXCEPTION 'no_agreed_price'; END IF;

  SELECT c.fee_rule_id, c.platform_fee INTO v_rule, v_fee
  FROM public.compute_platform_fee(v_amount, v_currency, v_favor.country_code, v_favor.category_slug) c;

  INSERT INTO public.payments (favor_id, offer_id, customer_profile_id, worker_profile_id,
    amount, currency_code, platform_fee, processing_fee, taxes, worker_amount, total_amount,
    fee_rule_id, status, method, provider, idempotency_key, is_demo)
  VALUES (_favor_id, v_offer.id, v_favor.customer_profile_id, v_worker,
    v_amount, v_currency, v_fee, 0, 0, round(v_amount - v_fee, 2), v_amount,
    v_rule, 'unpaid', _method, NULL, v_key, FALSE)
  RETURNING * INTO v_payment;

  INSERT INTO public.payment_events (payment_id, favor_id, actor_profile_id, event, entity_type,
    entity_id, new_status, metadata, is_demo)
  VALUES (v_payment.id, _favor_id, public.current_profile_id(), 'payment_created', 'payment',
    v_payment.id, 'unpaid', jsonb_build_object('fee_rule_id', v_rule, 'currency_code', v_currency), FALSE);

  RETURN v_payment;
EXCEPTION WHEN unique_violation THEN
  SELECT * INTO v_existing FROM public.payments WHERE idempotency_key = v_key;
  RETURN v_existing;
END;
$$;

-- --------------------------------- 4. controlled test-payment state machine
CREATE OR REPLACE FUNCTION public.advance_favor_payment(_payment_id uuid, _next text)
RETURNS public.payments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_prev TEXT;
  v_settlement public.settlements%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  SELECT * INTO v_payment FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment_not_found'; END IF;
  IF NOT public.is_favor_owner(v_payment.favor_id) AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'only_the_client_or_an_admin_can_advance_a_payment';
  END IF;

  v_prev := v_payment.status::TEXT;

  -- the client may only walk the authorisation path; money-out states are admin-only
  IF NOT public.is_platform_admin() AND _next NOT IN ('payment_pending','authorized','paid','held','cancelled') THEN
    RAISE EXCEPTION 'status_not_allowed_for_client';
  END IF;

  IF NOT (
    (v_prev = 'unpaid'          AND _next IN ('payment_pending','cancelled','failed')) OR
    (v_prev = 'payment_pending' AND _next IN ('authorized','failed','cancelled')) OR
    (v_prev = 'authorized'      AND _next IN ('paid','held','failed','cancelled')) OR
    (v_prev = 'paid'            AND _next IN ('held','released','refunded','partially_refunded','disputed')) OR
    (v_prev = 'held'            AND _next IN ('released','refunded','partially_refunded','disputed')) OR
    (v_prev = 'released'        AND _next IN ('disputed'))
  ) THEN
    RAISE EXCEPTION 'invalid_transition:%->%', v_prev, _next;
  END IF;

  UPDATE public.payments SET status = _next::public.payment_status, updated_at = now()
  WHERE id = _payment_id AND status::TEXT = v_prev RETURNING * INTO v_payment;

  INSERT INTO public.payment_events (payment_id, favor_id, actor_profile_id, event, entity_type,
    entity_id, previous_status, new_status, metadata, is_demo)
  VALUES (v_payment.id, v_payment.favor_id, public.current_profile_id(), 'payment_' || _next,
    'payment', v_payment.id, v_prev, _next, '{}'::jsonb, FALSE);

  -- funds held => create the pending settlement from stored payment values
  IF _next = 'held' THEN
    SELECT * INTO v_settlement FROM public.settlements WHERE payment_id = v_payment.id;
    IF NOT FOUND THEN
      INSERT INTO public.settlements (payment_id, favor_id, worker_profile_id, gross_amount,
        platform_fee, processing_fee, taxes, worker_amount, currency_code, status, is_demo)
      VALUES (v_payment.id, v_payment.favor_id, v_payment.worker_profile_id, v_payment.amount,
        v_payment.platform_fee, v_payment.processing_fee, v_payment.taxes, v_payment.worker_amount,
        v_payment.currency_code, 'pending', FALSE)
      RETURNING * INTO v_settlement;
      INSERT INTO public.payment_events (payment_id, favor_id, actor_profile_id, event, entity_type,
        entity_id, new_status, metadata, is_demo)
      VALUES (v_payment.id, v_payment.favor_id, public.current_profile_id(), 'settlement_created',
        'settlement', v_settlement.id, 'pending',
        jsonb_build_object('worker_amount', v_settlement.worker_amount), FALSE);
    END IF;
  END IF;

  RETURN v_payment;
END;
$$;

-- ------------------------------------------------ 5. settlement release (admin)
CREATE OR REPLACE FUNCTION public.release_favor_settlement(_settlement_id uuid)
RETURNS public.settlements LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.settlements%ROWTYPE;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'admin_only'; END IF;
  UPDATE public.settlements SET status = 'released', released_at = now(), updated_at = now()
  WHERE id = _settlement_id AND status = 'pending' RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'settlement_not_releasable'; END IF;
  INSERT INTO public.payment_events (payment_id, favor_id, actor_profile_id, event, entity_type,
    entity_id, previous_status, new_status, is_demo)
  VALUES (v_row.payment_id, v_row.favor_id, public.current_profile_id(), 'settlement_released',
    'settlement', v_row.id, 'pending', 'released', FALSE);
  RETURN v_row;
END;
$$;

-- ------------------------------------------------------------- 6. refunds --
CREATE OR REPLACE FUNCTION public.request_favor_refund(
  _payment_id uuid, _amount numeric, _reason text)
RETURNS public.refunds LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_refund public.refunds%ROWTYPE;
  v_kind TEXT;
  v_key TEXT;
  v_already NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  SELECT * INTO v_payment FROM public.payments WHERE id = _payment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment_not_found'; END IF;
  IF NOT public.is_favor_participant(v_payment.favor_id) AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'not_a_participant';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;

  SELECT COALESCE(sum(amount), 0) INTO v_already FROM public.refunds
  WHERE payment_id = _payment_id AND status <> 'rejected';
  IF v_already + _amount > v_payment.amount THEN RAISE EXCEPTION 'refund_exceeds_payment'; END IF;

  v_kind := CASE WHEN _amount >= v_payment.amount THEN 'full' ELSE 'partial' END;
  v_key := 'refund:' || _payment_id::TEXT || ':' || v_kind || ':' || _amount::TEXT;
  SELECT * INTO v_refund FROM public.refunds WHERE idempotency_key = v_key;
  IF FOUND THEN RETURN v_refund; END IF;

  INSERT INTO public.refunds (payment_id, favor_id, amount, currency_code, kind, reason, status,
    requested_by_profile_id, idempotency_key, is_demo)
  VALUES (_payment_id, v_payment.favor_id, _amount, v_payment.currency_code, v_kind,
    coalesce(_reason,'unspecified'), 'requested', public.current_profile_id(), v_key, FALSE)
  RETURNING * INTO v_refund;

  INSERT INTO public.payment_events (payment_id, favor_id, actor_profile_id, event, entity_type,
    entity_id, previous_status, new_status, metadata, is_demo)
  VALUES (_payment_id, v_payment.favor_id, public.current_profile_id(), 'refund_requested',
    'refund', v_refund.id, v_payment.status::TEXT, 'requested',
    jsonb_build_object('amount', _amount, 'currency_code', v_refund.currency_code), FALSE);
  RETURN v_refund;
EXCEPTION WHEN unique_violation THEN
  SELECT * INTO v_refund FROM public.refunds WHERE idempotency_key = v_key;
  RETURN v_refund;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_resolve_refund(_refund_id uuid, _status text)
RETURNS public.refunds LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.refunds%ROWTYPE; v_prev TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'admin_only'; END IF;
  IF _status NOT IN ('approved','rejected','processed','failed') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  SELECT status::TEXT INTO v_prev FROM public.refunds WHERE id = _refund_id;
  UPDATE public.refunds SET status = _status::public.refund_status, updated_at = now()
  WHERE id = _refund_id RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'refund_not_found'; END IF;
  INSERT INTO public.payment_events (payment_id, favor_id, actor_profile_id, event, entity_type,
    entity_id, previous_status, new_status, is_demo)
  VALUES (v_row.payment_id, v_row.favor_id, public.current_profile_id(), 'refund_' || _status,
    'refund', v_row.id, v_prev, _status, FALSE);
  RETURN v_row;
END;
$$;

-- --------------------------------------------------------------- 7. grants --
REVOKE EXECUTE ON FUNCTION public.compute_platform_fee(numeric, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_favor_payment(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.advance_favor_payment(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.release_favor_settlement(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.request_favor_refund(uuid, numeric, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_resolve_refund(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.compute_platform_fee(numeric, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_favor_payment(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_favor_payment(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_favor_settlement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_favor_refund(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_refund(uuid, text) TO authenticated;