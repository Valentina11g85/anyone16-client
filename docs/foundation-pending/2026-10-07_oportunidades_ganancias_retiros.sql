-- AnyOne16 · Oportunidades — Ganancias y retiros de proveedores.
-- PENDIENTE (no ejecutado). Ejecutar manualmente en el SQL Editor de Foundation (owruupeffgvlfokgpswm).
-- Requiere: 2026-09-29_oportunidades_negociacion.sql, 2026-09-29_oportunidades_cierre.sql,
--           2026-09-29_payment_foundation.sql (payment_orders, is_payment_admin, payment_audit).
--
-- Aditivo y re-ejecutable. No borra datos, no toca Favores, ni el webhook de Mercado Pago,
-- ni payment_orders (solo añade triggers AFTER que leen su estado). No conecta payouts reales.
--
-- Modelo:
--   service_earnings     1 fila por contratación pagada + completada (pending → available | reversed).
--   service_withdrawals  solicitudes de retiro (pending → approved → processing → completed | rejected | cancelled).
--   service_ledger       movimientos INMUTABLES del saldo disponible. available = SUM(amount).
--   service_payout_methods  método de retiro (sin datos bancarios en claro; token del proveedor futuro).
-- El navegador solo puede LEER lo suyo y llamar RPCs; ninguna tabla tiene INSERT/UPDATE/DELETE para authenticated.

-- 0. Parámetros ------------------------------------------------------------------
-- Período de seguridad antes de que una ganancia pase a disponible (horas).
CREATE OR REPLACE FUNCTION public.service_earnings_hold_hours()
RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 72 $$;
-- Comisión por retiro (hoy 0). Se calcula SIEMPRE en el servidor.
CREATE OR REPLACE FUNCTION public.service_withdrawal_fee(_amount numeric, _currency text)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$ SELECT 0::numeric $$;

-- 1. Tablas ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_payout_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  method_type text NOT NULL CHECK (method_type IN ('bank_account', 'mercadopago', 'paypal', 'other')),
  display_label text NOT NULL CHECK (char_length(display_label) BETWEEN 2 AND 60),
  last4 text CHECK (last4 IS NULL OR last4 ~ '^[0-9A-Za-z]{2,4}$'),
  provider text NOT NULL DEFAULT 'unconfigured',
  provider_token text,               -- token opaco del proveedor; nunca se expone (ver vista/columnas)
  verification_status text NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'pending', 'verified', 'rejected')),
  is_default boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_payout_methods_profile_idx ON public.service_payout_methods (profile_id);

CREATE TABLE IF NOT EXISTS public.service_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_contract_id uuid NOT NULL UNIQUE REFERENCES public.service_contracts(id),
  payment_order_id uuid NOT NULL REFERENCES public.payment_orders(id),
  provider_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  buyer_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  gross_amount numeric(18,2) NOT NULL CHECK (gross_amount >= 0),
  platform_fee numeric(18,2) NOT NULL DEFAULT 0 CHECK (platform_fee >= 0),
  net_amount numeric(18,2) NOT NULL CHECK (net_amount >= 0),
  currency_code text NOT NULL CHECK (char_length(currency_code) = 3),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'available', 'reversed')),
  available_at timestamptz NOT NULL,
  released_at timestamptz,
  reversed_at timestamptz,
  reversal_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (net_amount <= gross_amount),
  CHECK (status <> 'available' OR released_at IS NOT NULL),
  CHECK (status <> 'reversed' OR reversed_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS service_earnings_provider_idx
  ON public.service_earnings (provider_profile_id, currency_code, status);
CREATE INDEX IF NOT EXISTS service_earnings_due_idx
  ON public.service_earnings (available_at) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.service_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  payout_method_id uuid REFERENCES public.service_payout_methods(id),
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  fee numeric(18,2) NOT NULL DEFAULT 0 CHECK (fee >= 0),
  net_amount numeric(18,2) NOT NULL CHECK (net_amount > 0),
  currency_code text NOT NULL CHECK (char_length(currency_code) = 3),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'processing', 'completed', 'rejected', 'cancelled')),
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 100),
  payout_provider text NOT NULL DEFAULT 'unconfigured',
  external_reference text,
  rejection_reason text,
  processed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, idempotency_key),
  CHECK (net_amount = amount - fee),
  CHECK (status <> 'rejected' OR rejection_reason IS NOT NULL),
  CHECK (status <> 'completed' OR completed_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS service_withdrawals_profile_idx
  ON public.service_withdrawals (profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS service_withdrawals_status_idx
  ON public.service_withdrawals (status, created_at);

CREATE TABLE IF NOT EXISTS public.service_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  currency_code text NOT NULL CHECK (char_length(currency_code) = 3),
  entry_type text NOT NULL CHECK (entry_type IN (
    'earning_released',      -- + ganancia pasa a disponible
    'earning_reversed',      -- - reembolso/reversión de una ganancia ya disponible
    'withdrawal_hold',       -- - retiro solicitado (fondos reservados)
    'withdrawal_released')), -- + retiro rechazado/cancelado (fondos devueltos)
  amount numeric(18,2) NOT NULL CHECK (amount <> 0),
  earning_id uuid REFERENCES public.service_earnings(id),
  withdrawal_id uuid REFERENCES public.service_withdrawals(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (entry_type IN ('earning_released', 'withdrawal_released') AND amount > 0)
    OR (entry_type IN ('earning_reversed', 'withdrawal_hold') AND amount < 0)),
  CHECK (
    (entry_type LIKE 'earning_%' AND earning_id IS NOT NULL AND withdrawal_id IS NULL)
    OR (entry_type LIKE 'withdrawal_%' AND withdrawal_id IS NOT NULL AND earning_id IS NULL))
);
-- Cada evento se registra una sola vez.
CREATE UNIQUE INDEX IF NOT EXISTS service_ledger_once_earning
  ON public.service_ledger (earning_id, entry_type) WHERE earning_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS service_ledger_once_withdrawal
  ON public.service_ledger (withdrawal_id, entry_type) WHERE withdrawal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS service_ledger_profile_idx
  ON public.service_ledger (profile_id, currency_code);

-- El ledger es inmutable: ni siquiera el dueño de la tabla puede editar/borrar desde la app.
CREATE OR REPLACE FUNCTION public.service_ledger_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'service_ledger_is_append_only' USING ERRCODE = '42501'; END $$;
DROP TRIGGER IF EXISTS service_ledger_no_update ON public.service_ledger;
CREATE TRIGGER service_ledger_no_update BEFORE UPDATE OR DELETE ON public.service_ledger
FOR EACH ROW EXECUTE FUNCTION public.service_ledger_immutable();

-- 2. Permisos y RLS: solo lectura de lo propio (o admin) ---------------------------
GRANT SELECT ON public.service_earnings, public.service_withdrawals, public.service_ledger TO authenticated;
GRANT ALL ON public.service_earnings, public.service_withdrawals, public.service_ledger,
  public.service_payout_methods TO service_role;
-- Métodos: sin provider_token para el navegador (permiso por columna).
GRANT SELECT (id, profile_id, method_type, display_label, last4, provider, verification_status,
  is_default, archived_at, created_at, updated_at) ON public.service_payout_methods TO authenticated;

ALTER TABLE public.service_payout_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_payout_methods_read ON public.service_payout_methods;
CREATE POLICY service_payout_methods_read ON public.service_payout_methods FOR SELECT TO authenticated
USING (profile_id = public.current_profile_id() OR public.is_payment_admin());
DROP POLICY IF EXISTS service_earnings_read ON public.service_earnings;
CREATE POLICY service_earnings_read ON public.service_earnings FOR SELECT TO authenticated
USING (provider_profile_id = public.current_profile_id() OR public.is_payment_admin());
DROP POLICY IF EXISTS service_withdrawals_read ON public.service_withdrawals;
CREATE POLICY service_withdrawals_read ON public.service_withdrawals FOR SELECT TO authenticated
USING (profile_id = public.current_profile_id() OR public.is_payment_admin());
DROP POLICY IF EXISTS service_ledger_read ON public.service_ledger;
CREATE POLICY service_ledger_read ON public.service_ledger FOR SELECT TO authenticated
USING (profile_id = public.current_profile_id() OR public.is_payment_admin());

-- 3. Notificación interna (sin enlaces a chat) ------------------------------------
CREATE OR REPLACE FUNCTION public.service_finance_notify(_profile uuid, _type text, _title text, _body text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notifications(profile_id, type, title, body, is_demo)
  VALUES (_profile, _type, _title, _body, false);
$$;
REVOKE ALL ON FUNCTION public.service_finance_notify(uuid, text, text, text) FROM PUBLIC, anon, authenticated;

-- 4. Alta de la ganancia: contrato completado + orden pagada ------------------------
CREATE OR REPLACE FUNCTION public.service_earning_ensure(_contract_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.service_contracts; o public.payment_orders;
BEGIN
  SELECT * INTO c FROM public.service_contracts WHERE id = _contract_id;
  IF c.id IS NULL OR c.status <> 'completed' THEN RETURN; END IF;
  SELECT * INTO o FROM public.payment_orders
   WHERE subject_type = 'service_contract' AND service_contract_id = c.id AND status = 'paid'
   ORDER BY paid_at DESC NULLS LAST LIMIT 1;
  IF o.id IS NULL THEN RETURN; END IF;
  INSERT INTO public.service_earnings(service_contract_id, payment_order_id, provider_profile_id,
    buyer_profile_id, gross_amount, platform_fee, net_amount, currency_code, available_at)
  VALUES (c.id, o.id, c.provider_profile_id, c.buyer_profile_id, o.subtotal,
    o.platform_fee + o.provider_fee, o.provider_payout, o.currency_code,
    now() + make_interval(hours => public.service_earnings_hold_hours()))
  ON CONFLICT (service_contract_id) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.service_earning_ensure(uuid) FROM PUBLIC, anon, authenticated;

-- Reversión (reembolso total/parcial del pago).
CREATE OR REPLACE FUNCTION public.service_earning_reverse(_order_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.service_earnings;
BEGIN
  SELECT * INTO e FROM public.service_earnings WHERE payment_order_id = _order_id FOR UPDATE;
  IF e.id IS NULL OR e.status = 'reversed' THEN RETURN; END IF;
  IF e.status = 'available' THEN
    INSERT INTO public.service_ledger(profile_id, currency_code, entry_type, amount, earning_id)
    VALUES (e.provider_profile_id, e.currency_code, 'earning_reversed', -e.net_amount, e.id)
    ON CONFLICT DO NOTHING;
  END IF;
  UPDATE public.service_earnings SET status = 'reversed', reversed_at = now(),
    reversal_reason = left(_reason, 200) WHERE id = e.id;
  PERFORM public.payment_audit('service_earning_reversed', NULL, 'service_earning', e.id,
    jsonb_build_object('reason', _reason));
END $$;
REVOKE ALL ON FUNCTION public.service_earning_reverse(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.service_earnings_on_contract()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    PERFORM public.service_earning_ensure(NEW.id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS service_earnings_contract_trg ON public.service_contracts;
CREATE TRIGGER service_earnings_contract_trg AFTER UPDATE OF status ON public.service_contracts
FOR EACH ROW EXECUTE FUNCTION public.service_earnings_on_contract();

CREATE OR REPLACE FUNCTION public.service_earnings_on_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.subject_type <> 'service_contract' THEN RETURN NEW; END IF;
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    PERFORM public.service_earning_ensure(NEW.service_contract_id);
  ELSIF NEW.status IN ('refunded', 'partially_refunded') AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.service_earning_reverse(NEW.id, 'payment_' || NEW.status);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS service_earnings_order_trg ON public.payment_orders;
CREATE TRIGGER service_earnings_order_trg AFTER UPDATE OF status ON public.payment_orders
FOR EACH ROW EXECUTE FUNCTION public.service_earnings_on_order();

-- 5. Liberación de ganancias vencidas (idempotente). Solo si el contrato sigue completado
--    y el pago sigue pagado: disputas/reembolsos bloquean la liberación.
CREATE OR REPLACE FUNCTION public.service_release_due_earnings(_profile uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.service_earnings; n integer := 0;
BEGIN
  FOR e IN
    SELECT se.* FROM public.service_earnings se
    JOIN public.service_contracts c ON c.id = se.service_contract_id AND c.status = 'completed'
    JOIN public.payment_orders o ON o.id = se.payment_order_id AND o.status = 'paid'
    WHERE se.status = 'pending' AND se.available_at <= now()
      AND (_profile IS NULL OR se.provider_profile_id = _profile)
    FOR UPDATE OF se SKIP LOCKED
  LOOP
    UPDATE public.service_earnings SET status = 'available', released_at = now() WHERE id = e.id;
    IF e.net_amount > 0 THEN
      INSERT INTO public.service_ledger(profile_id, currency_code, entry_type, amount, earning_id)
      VALUES (e.provider_profile_id, e.currency_code, 'earning_released', e.net_amount, e.id)
      ON CONFLICT DO NOTHING;
    END IF;
    PERFORM public.service_finance_notify(e.provider_profile_id, 'service_earning_available',
      'Nueva ganancia disponible', e.net_amount || ' ' || e.currency_code);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.service_release_due_earnings(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_release_due_earnings(uuid) TO service_role;

-- 6. Lecturas seguras ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_service_balance()
RETURNS TABLE (currency_code text, available numeric, pending numeric, total_earned numeric,
               total_withdrawn numeric, in_withdrawal numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := public.current_profile_id();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  PERFORM public.service_release_due_earnings(me);
  RETURN QUERY
  WITH cur AS (
    SELECT se.currency_code FROM public.service_earnings se WHERE se.provider_profile_id = me
    UNION SELECT w.currency_code FROM public.service_withdrawals w WHERE w.profile_id = me
  )
  SELECT cur.currency_code,
    coalesce((SELECT sum(l.amount) FROM public.service_ledger l
              WHERE l.profile_id = me AND l.currency_code = cur.currency_code), 0)::numeric,
    coalesce((SELECT sum(se.net_amount) FROM public.service_earnings se
              WHERE se.provider_profile_id = me AND se.currency_code = cur.currency_code
                AND se.status = 'pending'), 0)::numeric,
    coalesce((SELECT sum(se.net_amount) FROM public.service_earnings se
              WHERE se.provider_profile_id = me AND se.currency_code = cur.currency_code
                AND se.status <> 'reversed'), 0)::numeric,
    coalesce((SELECT sum(w.amount) FROM public.service_withdrawals w
              WHERE w.profile_id = me AND w.currency_code = cur.currency_code
                AND w.status = 'completed'), 0)::numeric,
    coalesce((SELECT sum(w.amount) FROM public.service_withdrawals w
              WHERE w.profile_id = me AND w.currency_code = cur.currency_code
                AND w.status IN ('pending', 'approved', 'processing')), 0)::numeric
  FROM cur;
END $$;
REVOKE ALL ON FUNCTION public.get_my_service_balance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_service_balance() TO authenticated;

-- 7. Métodos de retiro (sin datos bancarios completos) ------------------------------
CREATE OR REPLACE FUNCTION public.add_service_payout_method(
  _method_type text, _display_label text, _last4 text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := public.current_profile_id(); new_id uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF (SELECT count(*) FROM public.service_payout_methods WHERE profile_id = me AND archived_at IS NULL) >= 5 THEN
    RAISE EXCEPTION 'too_many_methods' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.service_payout_methods(profile_id, method_type, display_label, last4, is_default)
  VALUES (me, _method_type, trim(_display_label), nullif(trim(coalesce(_last4, '')), ''),
    NOT EXISTS (SELECT 1 FROM public.service_payout_methods WHERE profile_id = me AND archived_at IS NULL))
  RETURNING id INTO new_id;
  PERFORM public.payment_audit('service_payout_method_added', me, 'service_payout_method', new_id,
    jsonb_build_object('method_type', _method_type));
  RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION public.add_service_payout_method(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_service_payout_method(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.archive_service_payout_method(_method_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := public.current_profile_id();
BEGIN
  UPDATE public.service_payout_methods SET archived_at = now(), is_default = false, updated_at = now()
  WHERE id = _method_id AND profile_id = me AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'payout_method_not_found' USING ERRCODE = 'P0002'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.archive_service_payout_method(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_service_payout_method(uuid) TO authenticated;

-- 8. Solicitar retiro: dueño, monto validado, bloqueo por perfil+moneda, idempotente ----
CREATE OR REPLACE FUNCTION public.request_service_withdrawal(
  _amount numeric, _currency text, _payout_method_id uuid, _idempotency_key text)
RETURNS public.service_withdrawals
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := public.current_profile_id();
  w public.service_withdrawals;
  avail numeric;
  amt numeric := round(_amount, 2);
  fee numeric;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF _idempotency_key IS NULL OR char_length(_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'idempotency_key_required' USING ERRCODE = '22023';
  END IF;
  -- Serializa todas las solicitudes de este perfil y moneda (doble clic / concurrencia).
  PERFORM pg_advisory_xact_lock(hashtext('service_withdrawal:' || me::text || ':' || upper(_currency)));

  SELECT * INTO w FROM public.service_withdrawals WHERE profile_id = me AND idempotency_key = _idempotency_key;
  IF w.id IS NOT NULL THEN RETURN w; END IF;   -- mismo envío repetido: no se duplica

  IF amt IS NULL OR amt <= 0 THEN RAISE EXCEPTION 'amount_must_be_positive' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.service_payout_methods
                 WHERE id = _payout_method_id AND profile_id = me AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'payout_method_not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.service_release_due_earnings(me);
  SELECT coalesce(sum(amount), 0) INTO avail FROM public.service_ledger
   WHERE profile_id = me AND currency_code = upper(_currency);
  IF amt > avail THEN RAISE EXCEPTION 'amount_exceeds_available' USING ERRCODE = '22023'; END IF;

  fee := round(public.service_withdrawal_fee(amt, upper(_currency)), 2);
  IF amt - fee <= 0 THEN RAISE EXCEPTION 'amount_below_fee' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.service_withdrawals(profile_id, payout_method_id, amount, fee, net_amount,
    currency_code, idempotency_key)
  VALUES (me, _payout_method_id, amt, fee, amt - fee, upper(_currency), _idempotency_key)
  RETURNING * INTO w;
  INSERT INTO public.service_ledger(profile_id, currency_code, entry_type, amount, withdrawal_id)
  VALUES (me, w.currency_code, 'withdrawal_hold', -w.amount, w.id);

  PERFORM public.service_finance_notify(me, 'service_withdrawal_requested', 'Retiro solicitado',
    w.amount || ' ' || w.currency_code);
  PERFORM public.payment_audit('service_withdrawal_requested', me, 'service_withdrawal', w.id,
    jsonb_build_object('amount', w.amount, 'currency', w.currency_code));
  RETURN w;
END $$;
REVOKE ALL ON FUNCTION public.request_service_withdrawal(numeric, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_service_withdrawal(numeric, text, uuid, text) TO authenticated;

-- 9. Cancelar mi retiro (solo pendiente) -----------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_my_service_withdrawal(_withdrawal_id uuid)
RETURNS public.service_withdrawals
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := public.current_profile_id(); w public.service_withdrawals;
BEGIN
  SELECT * INTO w FROM public.service_withdrawals WHERE id = _withdrawal_id AND profile_id = me FOR UPDATE;
  IF w.id IS NULL THEN RAISE EXCEPTION 'withdrawal_not_found' USING ERRCODE = 'P0002'; END IF;
  IF w.status <> 'pending' THEN RAISE EXCEPTION 'withdrawal_not_cancellable' USING ERRCODE = '22023'; END IF;
  UPDATE public.service_withdrawals SET status = 'cancelled', updated_at = now() WHERE id = w.id RETURNING * INTO w;
  INSERT INTO public.service_ledger(profile_id, currency_code, entry_type, amount, withdrawal_id)
  VALUES (w.profile_id, w.currency_code, 'withdrawal_released', w.amount, w.id);
  PERFORM public.payment_audit('service_withdrawal_cancelled', me, 'service_withdrawal', w.id, '{}'::jsonb);
  RETURN w;
END $$;
REVOKE ALL ON FUNCTION public.cancel_my_service_withdrawal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_my_service_withdrawal(uuid) TO authenticated;

-- 10. Administración (sin pagos reales) ------------------------------------------
--  pending → approved | rejected ; approved → processing | rejected ; processing → completed | rejected
CREATE OR REPLACE FUNCTION public.admin_transition_service_withdrawal(
  _withdrawal_id uuid, _status text, _reason text DEFAULT NULL, _reference text DEFAULT NULL)
RETURNS public.service_withdrawals
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := public.current_profile_id(); w public.service_withdrawals;
BEGIN
  IF NOT public.is_payment_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  SELECT * INTO w FROM public.service_withdrawals WHERE id = _withdrawal_id FOR UPDATE;
  IF w.id IS NULL THEN RAISE EXCEPTION 'withdrawal_not_found' USING ERRCODE = 'P0002'; END IF;
  IF NOT (
       (w.status = 'pending' AND _status IN ('approved', 'rejected'))
    OR (w.status = 'approved' AND _status IN ('processing', 'rejected'))
    OR (w.status = 'processing' AND _status IN ('completed', 'rejected'))
  ) THEN
    RAISE EXCEPTION 'invalid_transition % -> %', w.status, _status USING ERRCODE = '22023';
  END IF;
  IF _status = 'rejected' AND coalesce(length(trim(_reason)), 0) < 5 THEN
    RAISE EXCEPTION 'rejection_reason_required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.service_withdrawals SET
    status = _status,
    rejection_reason = CASE WHEN _status = 'rejected' THEN left(trim(_reason), 500) ELSE rejection_reason END,
    external_reference = coalesce(nullif(trim(coalesce(_reference, '')), ''), external_reference),
    processed_at = CASE WHEN _status = 'processing' THEN now() ELSE processed_at END,
    completed_at = CASE WHEN _status = 'completed' THEN now() ELSE completed_at END,
    updated_at = now()
  WHERE id = w.id RETURNING * INTO w;

  IF _status = 'rejected' THEN
    INSERT INTO public.service_ledger(profile_id, currency_code, entry_type, amount, withdrawal_id)
    VALUES (w.profile_id, w.currency_code, 'withdrawal_released', w.amount, w.id);
  END IF;

  IF _status IN ('processing', 'completed', 'rejected') THEN
    PERFORM public.service_finance_notify(w.profile_id, 'service_withdrawal_' || _status,
      CASE _status WHEN 'processing' THEN 'Retiro en proceso'
                   WHEN 'completed' THEN 'Retiro completado'
                   ELSE 'Retiro rechazado' END,
      CASE WHEN _status = 'rejected' THEN left(trim(_reason), 200) ELSE w.amount || ' ' || w.currency_code END);
  END IF;
  PERFORM public.payment_audit('service_withdrawal_' || _status, me, 'service_withdrawal', w.id,
    jsonb_build_object('reason', _reason, 'reference', _reference));
  RETURN w;
END $$;
REVOKE ALL ON FUNCTION public.admin_transition_service_withdrawal(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_transition_service_withdrawal(uuid, text, text, text) TO authenticated;

-- 11. Contrataciones ya completadas y pagadas antes de esta migración ----------------
SELECT public.service_earning_ensure(c.id)
FROM public.service_contracts c
WHERE c.status = 'completed'
  AND NOT EXISTS (SELECT 1 FROM public.service_earnings se WHERE se.service_contract_id = c.id);
