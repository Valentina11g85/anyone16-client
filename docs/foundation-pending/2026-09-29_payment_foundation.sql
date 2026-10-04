-- =====================================================================
-- AnyOne¹⁶ — PAYMENT FOUNDATION (Fase 1)
-- Migración ADITIVA. No modifica favors, offers, service_listings,
-- service_offers, service_contracts, reviews, disputes ni la tabla
-- payments existente. Solo agrega tablas/funciones nuevas y una columna
-- opcional en notifications.
--
-- Ejecutar en Foundation (SQL editor) DESPUÉS de los archivos de
-- Oportunidades (negociacion y cierre).
--
-- Reglas de dinero:
--   subtotal         = precio acordado real (offer seleccionada del favor o
--                      service_contracts.agreed_amount). Nunca del browser.
--   buyer_fee        = cargo al comprador (se SUMA al total).
--   platform_fee     = comisión de plataforma (se DESCUENTA al proveedor).
--   provider_fee     = cargo adicional al proveedor (se DESCUENTA).
--   total_charged    = subtotal + buyer_fee
--   provider_payout  = subtotal - platform_fee - provider_fee (mínimo 0)
--   ingreso plataforma = buyer_fee + platform_fee + provider_fee
-- Todo en numeric, redondeado según los decimales de la moneda.
-- Nunca hay conversión de monedas.
-- =====================================================================

-- ------------------------------------------------------------ helpers --

CREATE OR REPLACE FUNCTION public.payment_currency_decimals(_currency text)
RETURNS integer
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE upper(coalesce(_currency, ''))
    WHEN 'COP' THEN 0 WHEN 'CLP' THEN 0 WHEN 'PYG' THEN 0 WHEN 'JPY' THEN 0
    WHEN 'KRW' THEN 0 WHEN 'VND' THEN 0 WHEN 'ISK' THEN 0 WHEN 'UGX' THEN 0
    ELSE 2 END
$$;

CREATE OR REPLACE FUNCTION public.is_payment_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role::text = 'admin'
  )
$$;
REVOKE ALL ON FUNCTION public.is_payment_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_payment_admin() TO authenticated, service_role;

-- -------------------------------------------------- fee configuration --

CREATE TABLE IF NOT EXISTS public.payment_fee_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_kind text NOT NULL CHECK (fee_kind IN ('platform', 'buyer', 'provider')),
  label text NOT NULL DEFAULT '',
  percentage numeric(7,4) NOT NULL DEFAULT 0 CHECK (percentage >= 0 AND percentage <= 100),
  fixed_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (fixed_amount >= 0),
  currency_code text,               -- NULL = aplica a cualquier moneda (solo el %; fijo se ignora)
  applies_to text NOT NULL DEFAULT 'all' CHECK (applies_to IN ('all', 'favor', 'service_contract')),
  active boolean NOT NULL DEFAULT true,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  created_by_profile_id uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_to IS NULL OR valid_to > valid_from)
);

GRANT SELECT, INSERT, UPDATE ON public.payment_fee_configs TO authenticated;
GRANT ALL ON public.payment_fee_configs TO service_role;
ALTER TABLE public.payment_fee_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fee configs readable" ON public.payment_fee_configs;
CREATE POLICY "fee configs readable" ON public.payment_fee_configs
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "fee configs admin insert" ON public.payment_fee_configs;
CREATE POLICY "fee configs admin insert" ON public.payment_fee_configs
  FOR INSERT TO authenticated WITH CHECK (public.is_payment_admin());
DROP POLICY IF EXISTS "fee configs admin update" ON public.payment_fee_configs;
CREATE POLICY "fee configs admin update" ON public.payment_fee_configs
  FOR UPDATE TO authenticated USING (public.is_payment_admin()) WITH CHECK (public.is_payment_admin());

-- Sin datos iniciales: si no hay configuración activa, las comisiones son 0.
-- Ejemplo (NO se ejecuta; el Admin lo crea cuando decida):
-- INSERT INTO public.payment_fee_configs (fee_kind, label, percentage) VALUES ('platform', 'Comisión estándar', 10);

-- -------------------------------------------------------- orders -------

CREATE TABLE IF NOT EXISTS public.payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL CHECK (subject_type IN ('favor', 'service_contract')),
  favor_id uuid REFERENCES public.favors(id),
  favor_offer_id uuid REFERENCES public.offers(id),
  service_contract_id uuid REFERENCES public.service_contracts(id),
  buyer_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  provider_profile_id uuid REFERENCES public.profiles(id),
  description text NOT NULL DEFAULT '',
  subtotal numeric(18,2) NOT NULL CHECK (subtotal > 0),
  platform_fee numeric(18,2) NOT NULL DEFAULT 0 CHECK (platform_fee >= 0),
  buyer_fee numeric(18,2) NOT NULL DEFAULT 0 CHECK (buyer_fee >= 0),
  provider_fee numeric(18,2) NOT NULL DEFAULT 0 CHECK (provider_fee >= 0),
  total_charged numeric(18,2) NOT NULL CHECK (total_charged >= 0),
  provider_payout numeric(18,2) NOT NULL CHECK (provider_payout >= 0),
  currency_code text NOT NULL CHECK (char_length(currency_code) = 3),
  fee_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'authorized', 'paid', 'failed',
    'cancelled', 'refunded', 'partially_refunded')),
  payment_provider text NOT NULL DEFAULT 'unconfigured',
  external_payment_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_profile_id uuid REFERENCES public.profiles(id),
  paid_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by_profile_id uuid REFERENCES public.profiles(id),
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (subject_type = 'favor' AND favor_id IS NOT NULL AND favor_offer_id IS NOT NULL AND service_contract_id IS NULL)
    OR (subject_type = 'service_contract' AND service_contract_id IS NOT NULL AND favor_id IS NULL AND favor_offer_id IS NULL)
  ),
  CHECK (buyer_profile_id IS DISTINCT FROM provider_profile_id)
);

-- Una sola orden activa por favor y por contrato (no cobrar dos veces).
CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_one_active_favor
  ON public.payment_orders (favor_id)
  WHERE subject_type = 'favor' AND status NOT IN ('cancelled', 'failed');
CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_one_active_contract
  ON public.payment_orders (service_contract_id)
  WHERE subject_type = 'service_contract' AND status NOT IN ('cancelled', 'failed');
CREATE INDEX IF NOT EXISTS payment_orders_buyer_idx ON public.payment_orders (buyer_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_orders_provider_idx ON public.payment_orders (provider_profile_id, created_at DESC);

-- Solo lectura desde la app. Toda escritura pasa por funciones seguras.
GRANT SELECT ON public.payment_orders TO authenticated;
GRANT ALL ON public.payment_orders TO service_role;
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment orders participants read" ON public.payment_orders;
CREATE POLICY "payment orders participants read" ON public.payment_orders
  FOR SELECT TO authenticated USING (
    buyer_profile_id = public.current_profile_id()
    OR provider_profile_id = public.current_profile_id()
    OR public.is_payment_admin()
  );

-- ---------------------------------------------------- transactions -----

CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_order_id uuid NOT NULL REFERENCES public.payment_orders(id),
  payment_provider text NOT NULL,
  external_transaction_id text,
  amount numeric(18,2) NOT NULL CHECK (amount >= 0),
  currency_code text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'authorized', 'captured', 'failed', 'cancelled', 'refunded')),
  provider_status text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_provider, external_transaction_id)
);

GRANT SELECT ON public.payment_transactions TO authenticated;
GRANT ALL ON public.payment_transactions TO service_role;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment transactions participants read" ON public.payment_transactions;
CREATE POLICY "payment transactions participants read" ON public.payment_transactions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.payment_orders o WHERE o.id = payment_order_id)
  );

-- --------------------------------------------------------- refunds -----

CREATE TABLE IF NOT EXISTS public.payment_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_order_id uuid NOT NULL REFERENCES public.payment_orders(id),
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  currency_code text NOT NULL,
  reason text NOT NULL CHECK (char_length(trim(reason)) >= 5 AND char_length(reason) <= 1000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'succeeded', 'failed', 'cancelled')),
  created_by_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  external_refund_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.payment_refunds TO authenticated;
GRANT ALL ON public.payment_refunds TO service_role;
ALTER TABLE public.payment_refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment refunds participants read" ON public.payment_refunds;
CREATE POLICY "payment refunds participants read" ON public.payment_refunds
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.payment_orders o WHERE o.id = payment_order_id)
  );

-- ----------------------------------------- notifications (aditivo) -----

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS related_payment_order_id uuid
  REFERENCES public.payment_orders(id) ON DELETE SET NULL;

-- ----------------------------------------------- internal helpers ------

CREATE OR REPLACE FUNCTION public.payment_notify(
  _order public.payment_orders, _profile_id uuid, _type text, _title text, _body text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _profile_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.notifications(profile_id, type, title, body, related_favor_id,
    related_offer_id, related_payment_order_id, is_demo)
  VALUES (_profile_id, _type, _title, _body, _order.favor_id, _order.favor_offer_id, _order.id, false);
END $$;
REVOKE ALL ON FUNCTION public.payment_notify(public.payment_orders, uuid, text, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.payment_audit(
  _action text, _actor uuid, _entity_type text, _entity_id uuid, _metadata jsonb)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.audit_logs(action, actor_profile_id, entity_type, entity_id, metadata, is_demo)
  VALUES (_action, _actor, _entity_type, _entity_id, coalesce(_metadata, '{}'::jsonb), false);
$$;
REVOKE ALL ON FUNCTION public.payment_audit(text, uuid, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- Calcula comisiones en Postgres a partir de la configuración vigente.
CREATE OR REPLACE FUNCTION public.compute_payment_fees(
  _subtotal numeric, _currency text, _subject_type text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d integer := public.payment_currency_decimals(_currency);
  cfg record;
  fees jsonb := '{"platform":0,"buyer":0,"provider":0}'::jsonb;
  snapshot jsonb := '[]'::jsonb;
  amount numeric;
  v_platform numeric; v_buyer numeric; v_provider numeric;
BEGIN
  FOR cfg IN
    SELECT * FROM public.payment_fee_configs c
    WHERE c.active
      AND c.valid_from <= now() AND (c.valid_to IS NULL OR c.valid_to > now())
      AND (c.applies_to = 'all' OR c.applies_to = _subject_type)
      AND (c.currency_code IS NULL OR upper(c.currency_code) = upper(_currency))
    ORDER BY c.created_at
  LOOP
    amount := round(_subtotal * cfg.percentage / 100, d)
      + CASE WHEN cfg.currency_code IS NOT NULL THEN round(cfg.fixed_amount, d) ELSE 0 END;
    fees := jsonb_set(fees, ARRAY[cfg.fee_kind], to_jsonb((fees ->> cfg.fee_kind)::numeric + amount));
    snapshot := snapshot || jsonb_build_object(
      'config_id', cfg.id, 'fee_kind', cfg.fee_kind, 'label', cfg.label,
      'percentage', cfg.percentage, 'fixed_amount',
      CASE WHEN cfg.currency_code IS NOT NULL THEN cfg.fixed_amount ELSE 0 END,
      'currency_code', cfg.currency_code, 'amount', amount);
  END LOOP;

  v_platform := (fees ->> 'platform')::numeric;
  v_buyer    := (fees ->> 'buyer')::numeric;
  v_provider := (fees ->> 'provider')::numeric;

  RETURN jsonb_build_object(
    'subtotal', round(_subtotal, d),
    'platform_fee', v_platform,
    'buyer_fee', v_buyer,
    'provider_fee', v_provider,
    'total_charged', round(_subtotal, d) + v_buyer,
    'provider_payout', greatest(round(_subtotal, d) - v_platform - v_provider, 0),
    'snapshot', snapshot);
END $$;
REVOKE ALL ON FUNCTION public.compute_payment_fees(numeric, text, text) FROM PUBLIC, anon, authenticated;

-- --------------------------------------------- create_payment_order ----

CREATE OR REPLACE FUNCTION public.create_payment_order(_subject_type text, _subject_id uuid)
RETURNS public.payment_orders
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := public.current_profile_id();
  f public.favors;
  ofr public.offers;
  c public.service_contracts;
  existing public.payment_orders;
  created public.payment_orders;
  v_buyer uuid; v_provider uuid; v_amount numeric; v_currency text; v_desc text;
  calc jsonb;
BEGIN
  IF auth.uid() IS NULL OR me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  IF _subject_type = 'favor' THEN
    SELECT * INTO f FROM public.favors WHERE id = _subject_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'favor_not_found'; END IF;
    IF f.is_demo THEN RAISE EXCEPTION 'demo_not_payable'; END IF;
    IF f.customer_profile_id IS DISTINCT FROM me THEN RAISE EXCEPTION 'only_buyer_can_create_payment'; END IF;
    IF f.status::text IN ('cancelled', 'draft') THEN RAISE EXCEPTION 'favor_not_payable'; END IF;
    IF f.selected_offer_id IS NULL THEN RAISE EXCEPTION 'favor_has_no_selected_offer'; END IF;
    SELECT * INTO ofr FROM public.offers WHERE id = f.selected_offer_id AND favor_id = f.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'selected_offer_not_found'; END IF;
    SELECT * INTO existing FROM public.payment_orders
      WHERE subject_type = 'favor' AND favor_id = f.id AND status NOT IN ('cancelled', 'failed');
    IF FOUND THEN RETURN existing; END IF;
    v_buyer := me;
    SELECT p.id INTO v_provider FROM public.profiles p WHERE p.user_id = ofr.worker_user_id;
    v_amount := ofr.offered_amount;
    v_currency := upper(coalesce(ofr.currency_code, f.currency_code));
    v_desc := coalesce(nullif(f.title, ''), left(coalesce(f.description, 'Favor'), 120));
  ELSIF _subject_type = 'service_contract' THEN
    SELECT * INTO c FROM public.service_contracts WHERE id = _subject_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'contract_not_found'; END IF;
    IF c.buyer_profile_id IS DISTINCT FROM me THEN RAISE EXCEPTION 'only_buyer_can_create_payment'; END IF;
    IF c.status::text NOT IN ('agreed', 'confirmed', 'in_progress', 'completed') THEN
      RAISE EXCEPTION 'contract_not_payable %', c.status;
    END IF;
    SELECT * INTO existing FROM public.payment_orders
      WHERE subject_type = 'service_contract' AND service_contract_id = c.id
        AND status NOT IN ('cancelled', 'failed');
    IF FOUND THEN RETURN existing; END IF;
    v_buyer := c.buyer_profile_id;
    v_provider := c.provider_profile_id;
    v_amount := c.agreed_amount;
    v_currency := upper(c.currency_code);
    SELECT coalesce(nullif(l.title, ''), 'Servicio') INTO v_desc
      FROM public.service_listings l WHERE l.id = c.service_listing_id;
  ELSE
    RAISE EXCEPTION 'invalid_subject_type';
  END IF;

  IF v_amount IS NULL OR v_amount <= 0 THEN RAISE EXCEPTION 'invalid_agreed_amount'; END IF;
  IF v_currency IS NULL OR char_length(v_currency) <> 3 THEN RAISE EXCEPTION 'invalid_currency'; END IF;
  IF v_provider IS NOT NULL AND v_provider = v_buyer THEN RAISE EXCEPTION 'self_payment_not_allowed'; END IF;

  calc := public.compute_payment_fees(v_amount, v_currency, _subject_type);

  INSERT INTO public.payment_orders(
    subject_type, favor_id, favor_offer_id, service_contract_id,
    buyer_profile_id, provider_profile_id, description,
    subtotal, platform_fee, buyer_fee, provider_fee, total_charged, provider_payout,
    currency_code, fee_snapshot, status, payment_provider, created_by_profile_id)
  VALUES (
    _subject_type,
    CASE WHEN _subject_type = 'favor' THEN f.id END,
    CASE WHEN _subject_type = 'favor' THEN ofr.id END,
    CASE WHEN _subject_type = 'service_contract' THEN c.id END,
    v_buyer, v_provider, coalesce(v_desc, ''),
    (calc ->> 'subtotal')::numeric, (calc ->> 'platform_fee')::numeric,
    (calc ->> 'buyer_fee')::numeric, (calc ->> 'provider_fee')::numeric,
    (calc ->> 'total_charged')::numeric, (calc ->> 'provider_payout')::numeric,
    v_currency, calc -> 'snapshot', 'pending', 'unconfigured', me)
  RETURNING * INTO created;

  PERFORM public.payment_audit('payment_order_created', me, 'payment_order', created.id,
    jsonb_build_object('subject_type', _subject_type, 'subject_id', _subject_id,
      'total_charged', created.total_charged, 'currency_code', created.currency_code));
  PERFORM public.payment_notify(created, v_buyer, 'payment_required', 'Pago pendiente',
    'Tu orden de pago fue creada y está esperando pago.');
  RETURN created;
EXCEPTION WHEN unique_violation THEN
  -- Carrera: otra llamada creó la orden activa primero. Devolver esa.
  SELECT * INTO existing FROM public.payment_orders
    WHERE status NOT IN ('cancelled', 'failed')
      AND ((_subject_type = 'favor' AND favor_id = _subject_id)
        OR (_subject_type = 'service_contract' AND service_contract_id = _subject_id));
  IF FOUND THEN RETURN existing; END IF;
  RAISE;
END $$;
REVOKE ALL ON FUNCTION public.create_payment_order(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_payment_order(text, uuid) TO authenticated;

-- ------------------------------------------------ get_payment_order ----

CREATE OR REPLACE FUNCTION public.get_payment_order(_payment_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := public.current_profile_id();
  o public.payment_orders;
BEGIN
  IF auth.uid() IS NULL OR me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO o FROM public.payment_orders WHERE id = _payment_order_id;
  IF NOT FOUND OR NOT (o.buyer_profile_id = me OR o.provider_profile_id = me OR public.is_payment_admin()) THEN
    RAISE EXCEPTION 'payment_order_not_found';
  END IF;
  RETURN jsonb_build_object(
    'order', to_jsonb(o) - 'metadata',
    'transactions', coalesce((SELECT jsonb_agg(to_jsonb(t) - 'metadata' ORDER BY t.created_at)
      FROM public.payment_transactions t WHERE t.payment_order_id = o.id), '[]'::jsonb),
    'refunds', coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at)
      FROM public.payment_refunds r WHERE r.payment_order_id = o.id), '[]'::jsonb),
    'viewer_role', CASE WHEN o.buyer_profile_id = me THEN 'buyer'
                        WHEN o.provider_profile_id = me THEN 'provider' ELSE 'admin' END);
END $$;
REVOKE ALL ON FUNCTION public.get_payment_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_payment_order(uuid) TO authenticated;

-- --------------------------------------------- cancel_payment_order ----

CREATE OR REPLACE FUNCTION public.cancel_payment_order(_payment_order_id uuid, _reason text DEFAULT NULL)
RETURNS public.payment_orders
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := public.current_profile_id();
  o public.payment_orders;
  other uuid;
BEGIN
  IF auth.uid() IS NULL OR me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO o FROM public.payment_orders WHERE id = _payment_order_id FOR UPDATE;
  IF NOT FOUND OR NOT (o.buyer_profile_id = me OR o.provider_profile_id = me) THEN
    RAISE EXCEPTION 'payment_order_not_found';
  END IF;
  -- Solo se cancela lo que no ha pasado por el proveedor. Un pago
  -- autorizado/pagado requiere cancelación o reembolso del proveedor.
  IF o.status <> 'pending' THEN RAISE EXCEPTION 'payment_not_cancellable %', o.status; END IF;

  UPDATE public.payment_orders
     SET status = 'cancelled', cancelled_at = now(), cancelled_by_profile_id = me,
         cancel_reason = nullif(trim(coalesce(_reason, '')), ''), updated_at = now()
   WHERE id = o.id
  RETURNING * INTO o;

  PERFORM public.payment_audit('payment_cancelled', me, 'payment_order', o.id,
    jsonb_build_object('reason', o.cancel_reason));
  other := CASE WHEN o.buyer_profile_id = me THEN o.provider_profile_id ELSE o.buyer_profile_id END;
  PERFORM public.payment_notify(o, other, 'payment_cancelled', 'Pago cancelado',
    'La orden de pago fue cancelada por la otra persona.');
  RETURN o;
END $$;
REVOKE ALL ON FUNCTION public.cancel_payment_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_payment_order(uuid, text) TO authenticated;

-- ------------------------------------------- request_payment_refund ----

CREATE OR REPLACE FUNCTION public.request_payment_refund(
  _payment_order_id uuid, _amount numeric, _reason text)
RETURNS public.payment_refunds
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := public.current_profile_id();
  o public.payment_orders;
  already numeric;
  d integer;
  created public.payment_refunds;
BEGIN
  IF auth.uid() IS NULL OR me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO o FROM public.payment_orders WHERE id = _payment_order_id FOR UPDATE;
  IF NOT FOUND OR o.buyer_profile_id IS DISTINCT FROM me THEN RAISE EXCEPTION 'payment_order_not_found'; END IF;
  IF o.status NOT IN ('paid', 'partially_refunded') THEN RAISE EXCEPTION 'payment_not_refundable %', o.status; END IF;
  IF _reason IS NULL OR char_length(trim(_reason)) < 5 THEN RAISE EXCEPTION 'refund_reason_required'; END IF;
  d := public.payment_currency_decimals(o.currency_code);
  IF _amount IS NULL OR round(_amount, d) <= 0 THEN RAISE EXCEPTION 'invalid_refund_amount'; END IF;
  SELECT coalesce(sum(amount), 0) INTO already FROM public.payment_refunds
    WHERE payment_order_id = o.id AND status NOT IN ('failed', 'cancelled');
  IF round(_amount, d) + already > o.total_charged THEN RAISE EXCEPTION 'refund_exceeds_total'; END IF;

  INSERT INTO public.payment_refunds(payment_order_id, amount, currency_code, reason, status, created_by_profile_id)
  VALUES (o.id, round(_amount, d), o.currency_code, trim(_reason), 'pending', me)
  RETURNING * INTO created;

  PERFORM public.payment_audit('refund_requested', me, 'payment_refund', created.id,
    jsonb_build_object('payment_order_id', o.id, 'amount', created.amount, 'currency_code', created.currency_code));
  PERFORM public.payment_notify(o, o.provider_profile_id, 'refund_requested', 'Reembolso solicitado',
    'El comprador solicitó un reembolso. Queda pendiente hasta que el proveedor de pagos lo confirme.');
  RETURN created;
END $$;
REVOKE ALL ON FUNCTION public.request_payment_refund(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_payment_refund(uuid, numeric, text) TO authenticated;

-- ------------------------------ eventos del proveedor (solo servidor) --
-- La app NUNCA puede llamar estas funciones: solo service_role (webhook
-- del proveedor real, que se conectará en la siguiente fase).

CREATE OR REPLACE FUNCTION public.apply_payment_provider_event(
  _payment_order_id uuid, _payment_provider text, _external_transaction_id text,
  _transaction_status text, _provider_status text DEFAULT NULL, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS public.payment_orders
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.payment_orders;
  new_status text;
  ev text; title text; body text;
BEGIN
  SELECT * INTO o FROM public.payment_orders WHERE id = _payment_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment_order_not_found'; END IF;

  INSERT INTO public.payment_transactions(payment_order_id, payment_provider, external_transaction_id,
    amount, currency_code, status, provider_status, metadata)
  VALUES (o.id, _payment_provider, _external_transaction_id, o.total_charged, o.currency_code,
    _transaction_status, _provider_status, coalesce(_metadata, '{}'::jsonb))
  ON CONFLICT (payment_provider, external_transaction_id) DO UPDATE
    SET status = EXCLUDED.status, provider_status = EXCLUDED.provider_status,
        metadata = EXCLUDED.metadata, updated_at = now();

  new_status := CASE _transaction_status
    WHEN 'processing' THEN 'processing' WHEN 'authorized' THEN 'authorized'
    WHEN 'captured' THEN 'paid' WHEN 'failed' THEN 'failed'
    WHEN 'cancelled' THEN 'cancelled' WHEN 'refunded' THEN 'refunded'
    ELSE o.status END;

  IF new_status = o.status THEN RETURN o; END IF;  -- idempotente, sin notificar de nuevo
  IF o.status IN ('cancelled', 'refunded') THEN RAISE EXCEPTION 'payment_order_closed %', o.status; END IF;

  UPDATE public.payment_orders SET
    status = new_status, payment_provider = _payment_provider,
    external_payment_id = coalesce(_external_transaction_id, external_payment_id),
    paid_at = CASE WHEN new_status = 'paid' THEN now() ELSE paid_at END,
    failed_at = CASE WHEN new_status = 'failed' THEN now() ELSE failed_at END,
    cancelled_at = CASE WHEN new_status = 'cancelled' THEN now() ELSE cancelled_at END,
    updated_at = now()
  WHERE id = o.id RETURNING * INTO o;

  ev := CASE new_status WHEN 'processing' THEN 'payment_processing' WHEN 'authorized' THEN 'payment_authorized'
    WHEN 'paid' THEN 'payment_paid' WHEN 'failed' THEN 'payment_failed'
    WHEN 'cancelled' THEN 'payment_cancelled' ELSE 'payment_' || new_status END;
  PERFORM public.payment_audit(ev, NULL, 'payment_order', o.id,
    jsonb_build_object('provider', _payment_provider, 'external_transaction_id', _external_transaction_id));

  IF new_status IN ('processing', 'paid', 'failed', 'cancelled') THEN
    title := CASE new_status WHEN 'processing' THEN 'Pago en proceso' WHEN 'paid' THEN 'Pago confirmado'
      WHEN 'failed' THEN 'Pago fallido' ELSE 'Pago cancelado' END;
    body := CASE new_status WHEN 'processing' THEN 'El proveedor de pagos está procesando tu pago.'
      WHEN 'paid' THEN 'El proveedor de pagos confirmó el pago.'
      WHEN 'failed' THEN 'El proveedor de pagos rechazó el pago.' ELSE 'El proveedor de pagos canceló el pago.' END;
    PERFORM public.payment_notify(o, o.buyer_profile_id, ev, title, body);
    IF new_status = 'paid' THEN
      PERFORM public.payment_notify(o, o.provider_profile_id, ev, 'Pago confirmado',
        'El comprador pagó. El pago al proveedor queda pendiente de integración.');
    END IF;
  END IF;
  RETURN o;
END $$;
REVOKE ALL ON FUNCTION public.apply_payment_provider_event(uuid, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_payment_provider_event(uuid, text, text, text, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_refund_provider_event(
  _refund_id uuid, _status text, _external_refund_id text DEFAULT NULL)
RETURNS public.payment_refunds
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.payment_refunds;
  o public.payment_orders;
  refunded numeric;
BEGIN
  IF _status NOT IN ('processing', 'succeeded', 'failed', 'cancelled') THEN RAISE EXCEPTION 'invalid_refund_status'; END IF;
  SELECT * INTO r FROM public.payment_refunds WHERE id = _refund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'refund_not_found'; END IF;
  IF r.status = _status THEN RETURN r; END IF;
  IF r.status IN ('succeeded', 'failed', 'cancelled') THEN RAISE EXCEPTION 'refund_closed %', r.status; END IF;

  UPDATE public.payment_refunds SET status = _status,
    external_refund_id = coalesce(_external_refund_id, external_refund_id),
    processed_at = CASE WHEN _status IN ('succeeded', 'failed', 'cancelled') THEN now() ELSE processed_at END,
    updated_at = now()
  WHERE id = r.id RETURNING * INTO r;

  SELECT * INTO o FROM public.payment_orders WHERE id = r.payment_order_id FOR UPDATE;
  IF _status = 'succeeded' THEN
    SELECT coalesce(sum(amount), 0) INTO refunded FROM public.payment_refunds
      WHERE payment_order_id = o.id AND status = 'succeeded';
    UPDATE public.payment_orders SET
      status = CASE WHEN refunded >= total_charged THEN 'refunded' ELSE 'partially_refunded' END,
      updated_at = now()
    WHERE id = o.id RETURNING * INTO o;
    PERFORM public.payment_audit('refund_processed', NULL, 'payment_refund', r.id,
      jsonb_build_object('payment_order_id', o.id, 'amount', r.amount));
    PERFORM public.payment_notify(o, o.buyer_profile_id, 'refund_processed', 'Reembolso procesado',
      'El proveedor de pagos confirmó tu reembolso.');
  ELSIF _status = 'failed' THEN
    PERFORM public.payment_audit('refund_failed', NULL, 'payment_refund', r.id,
      jsonb_build_object('payment_order_id', o.id));
  END IF;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.apply_refund_provider_event(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_refund_provider_event(uuid, text, text) TO service_role;

-- --------------------------------------------------- earnings / admin --

CREATE OR REPLACE FUNCTION public.get_my_payment_earnings()
RETURNS TABLE (currency_code text, pending_payout numeric, paid_payout numeric,
               total_payout numeric, fees_deducted numeric, orders_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.currency_code,
    coalesce(sum(o.provider_payout) FILTER (WHERE o.status IN ('pending', 'processing', 'authorized')), 0),
    coalesce(sum(o.provider_payout) FILTER (WHERE o.status = 'paid'), 0),
    coalesce(sum(o.provider_payout) FILTER (WHERE o.status IN ('paid', 'partially_refunded')), 0),
    coalesce(sum(o.platform_fee + o.provider_fee) FILTER (WHERE o.status IN ('paid', 'partially_refunded')), 0),
    count(*)
  FROM public.payment_orders o
  WHERE o.provider_profile_id = public.current_profile_id()
    AND o.status NOT IN ('cancelled', 'failed')
  GROUP BY o.currency_code
$$;
REVOKE ALL ON FUNCTION public.get_my_payment_earnings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_payment_earnings() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_payment_admin_summary()
RETURNS TABLE (currency_code text, total_volume numeric, platform_revenue numeric,
               pending_count bigint, paid_count bigint, failed_count bigint,
               refunded_amount numeric, pending_refunds bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_payment_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT o.currency_code,
    coalesce(sum(o.total_charged) FILTER (WHERE o.status IN ('paid', 'partially_refunded', 'refunded')), 0),
    coalesce(sum(o.platform_fee + o.buyer_fee + o.provider_fee) FILTER (WHERE o.status IN ('paid', 'partially_refunded')), 0),
    count(*) FILTER (WHERE o.status IN ('pending', 'processing', 'authorized')),
    count(*) FILTER (WHERE o.status = 'paid'),
    count(*) FILTER (WHERE o.status = 'failed'),
    coalesce((SELECT sum(r.amount) FROM public.payment_refunds r JOIN public.payment_orders o2 ON o2.id = r.payment_order_id
      WHERE r.status = 'succeeded' AND o2.currency_code = o.currency_code), 0),
    (SELECT count(*) FROM public.payment_refunds r JOIN public.payment_orders o2 ON o2.id = r.payment_order_id
      WHERE r.status IN ('pending', 'processing') AND o2.currency_code = o.currency_code)
  FROM public.payment_orders o
  GROUP BY o.currency_code;
END $$;
REVOKE ALL ON FUNCTION public.get_payment_admin_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_payment_admin_summary() TO authenticated;
