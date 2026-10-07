-- AnyOne16 · Oportunidades — Ganancias y retiros de proveedores.
-- PENDIENTE (no ejecutado). Ejecutar manualmente en el SQL Editor de Foundation (owruupeffgvlfokgpswm).
-- Requiere: 2026-09-29_oportunidades_negociacion.sql, 2026-09-29_oportunidades_cierre.sql,
--           2026-09-29_payment_foundation.sql (payment_orders, is_payment_admin, payment_audit).
--
-- Re-ejecutar NO crea ganancias: el historial se procesa solo con la sección 11 (manual).
-- Aditivo y re-ejecutable. No borra datos, no toca Favores, ni el webhook de Mercado Pago,
-- ni payment_orders (solo añade triggers AFTER que leen su estado). No conecta payouts reales.
--
-- Modelo:
--   service_earnings     1 fila por contratación pagada + completada (pending → available | reversed).
--   service_withdrawals  solicitudes de retiro (pending → approved → processing → completed | rejected | cancelled).
--   service_ledger       movimientos INMUTABLES del saldo disponible. available = SUM(amount).
--   service_payout_methods  método de retiro (sin datos bancarios en claro; token del proveedor futuro).
-- El navegador solo puede LEER lo suyo y llamar RPCs; ninguna tabla tiene INSERT/UPDATE/DELETE para authenticated.

-- 0. Configuración financiera (editable solo por admin vía RPC) ----------------------
-- Fila '*' = valores por defecto; se puede añadir una fila por moneda (p. ej. 'COP').
CREATE TABLE IF NOT EXISTS public.service_finance_config (
  currency_code text PRIMARY KEY CHECK (currency_code = '*' OR char_length(currency_code) = 3),
  hold_hours integer NOT NULL DEFAULT 72 CHECK (hold_hours BETWEEN 0 AND 8760),
  withdrawal_fee_fixed numeric(18,2) NOT NULL DEFAULT 0 CHECK (withdrawal_fee_fixed >= 0),
  withdrawal_fee_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (withdrawal_fee_percent BETWEEN 0 AND 100),
  min_withdrawal numeric(18,2) NOT NULL DEFAULT 0 CHECK (min_withdrawal >= 0),
  max_withdrawal numeric(18,2) CHECK (max_withdrawal IS NULL OR max_withdrawal > 0),  -- NULL = sin límite
  updated_by_profile_id uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (max_withdrawal IS NULL OR max_withdrawal >= min_withdrawal)
);
-- Política de comisión ante reembolsos (documentada en la sección 4b):
--   proportional        el proveedor pierde la parte proporcional de SU neto (refund / total cobrado);
--                       la comisión de la plataforma se devuelve en la misma proporción.
--   provider_bears_full el neto del proveedor se reduce por el monto reembolsado completo
--                       (la plataforma conserva su comisión). Tope: nunca más que el neto.
ALTER TABLE public.service_finance_config ADD COLUMN IF NOT EXISTS refund_fee_policy text NOT NULL DEFAULT 'proportional';
ALTER TABLE public.service_finance_config DROP CONSTRAINT IF EXISTS service_finance_config_refund_policy_chk;
ALTER TABLE public.service_finance_config ADD CONSTRAINT service_finance_config_refund_policy_chk
  CHECK (refund_fee_policy IN ('proportional', 'provider_bears_full'));
INSERT INTO public.service_finance_config(currency_code) VALUES ('*') ON CONFLICT DO NOTHING;
GRANT SELECT ON public.service_finance_config TO authenticated;   -- lectura: mostrar mínimos/comisión
GRANT ALL ON public.service_finance_config TO service_role;
ALTER TABLE public.service_finance_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_finance_config_read ON public.service_finance_config;
CREATE POLICY service_finance_config_read ON public.service_finance_config FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.service_finance_cfg(_currency text)
RETURNS public.service_finance_config LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.service_finance_config
  WHERE currency_code IN (upper(_currency), '*')
  ORDER BY (currency_code = '*') LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.service_finance_cfg(text) FROM PUBLIC, anon, authenticated;

-- Comisión por retiro calculada SIEMPRE en el servidor a partir de la configuración.
CREATE OR REPLACE FUNCTION public.service_withdrawal_fee(_amount numeric, _currency text)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT round(cfg.withdrawal_fee_fixed + _amount * cfg.withdrawal_fee_percent / 100, 2)
  FROM public.service_finance_cfg(_currency) cfg
$$;
REVOKE ALL ON FUNCTION public.service_withdrawal_fee(numeric, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_service_finance_config(
  _currency text, _hold_hours integer, _fee_fixed numeric, _fee_percent numeric,
  _min numeric, _max numeric)
RETURNS public.service_finance_config LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.service_finance_config; cur text := CASE WHEN _currency = '*' THEN '*' ELSE upper(_currency) END;
BEGIN
  IF NOT public.is_payment_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.service_finance_config(currency_code, hold_hours, withdrawal_fee_fixed,
    withdrawal_fee_percent, min_withdrawal, max_withdrawal, updated_by_profile_id, updated_at)
  VALUES (cur, _hold_hours, _fee_fixed, _fee_percent, _min, _max, public.current_profile_id(), now())
  ON CONFLICT (currency_code) DO UPDATE SET hold_hours = EXCLUDED.hold_hours,
    withdrawal_fee_fixed = EXCLUDED.withdrawal_fee_fixed, withdrawal_fee_percent = EXCLUDED.withdrawal_fee_percent,
    min_withdrawal = EXCLUDED.min_withdrawal, max_withdrawal = EXCLUDED.max_withdrawal,
    updated_by_profile_id = EXCLUDED.updated_by_profile_id, updated_at = now()
  RETURNING * INTO r;
  PERFORM public.payment_audit('service_finance_config_updated', public.current_profile_id(),
    'service_finance_config', NULL, to_jsonb(r));
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_service_finance_config(text, integer, numeric, numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_service_finance_config(text, integer, numeric, numeric, numeric, numeric) TO authenticated;

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
  payment_order_id uuid NOT NULL UNIQUE REFERENCES public.payment_orders(id),
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
  -- "Completado" exige una transferencia real confirmada por un proveedor de payouts.
  CHECK (status <> 'completed' OR (completed_at IS NOT NULL AND external_reference IS NOT NULL
                                   AND payout_provider <> 'unconfigured'))
);
CREATE INDEX IF NOT EXISTS service_withdrawals_profile_idx
  ON public.service_withdrawals (profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS service_withdrawals_status_idx
  ON public.service_withdrawals (status, created_at);

-- Reversiones (parciales o total) de una ganancia. Inmutables: nunca se edita la ganancia
-- ni el movimiento original; cada reembolso crea su propia fila compensatoria.
CREATE TABLE IF NOT EXISTS public.service_earning_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  earning_id uuid NOT NULL REFERENCES public.service_earnings(id),
  payment_refund_id uuid UNIQUE REFERENCES public.payment_refunds(id),  -- 1 reversión por reembolso
  kind text NOT NULL CHECK (kind IN ('partial', 'full')),
  refund_amount numeric(18,2) CHECK (refund_amount IS NULL OR refund_amount > 0),
  net_reversed numeric(18,2) NOT NULL CHECK (net_reversed > 0),
  fee_policy text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind = 'full' OR payment_refund_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS service_earning_reversals_one_full
  ON public.service_earning_reversals (earning_id) WHERE kind = 'full';
CREATE INDEX IF NOT EXISTS service_earning_reversals_earning_idx ON public.service_earning_reversals (earning_id);

CREATE TABLE IF NOT EXISTS public.service_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  currency_code text NOT NULL CHECK (char_length(currency_code) = 3),
  entry_type text NOT NULL CHECK (entry_type IN (
    'earning_released',      -- + ganancia pasa a disponible
    'earning_reversed',      -- - reembolso total: revierte lo que quedaba de una ganancia ya disponible
    'earning_partially_reversed', -- - reembolso parcial proporcional de una ganancia ya disponible
    'withdrawal_hold',       -- - retiro solicitado (fondos reservados)
    'withdrawal_released')), -- + retiro rechazado/cancelado (fondos devueltos)
  amount numeric(18,2) NOT NULL CHECK (amount <> 0),
  earning_id uuid REFERENCES public.service_earnings(id),
  reversal_id uuid UNIQUE REFERENCES public.service_earning_reversals(id),
  withdrawal_id uuid REFERENCES public.service_withdrawals(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (entry_type IN ('earning_released', 'withdrawal_released') AND amount > 0)
    OR (entry_type IN ('earning_reversed', 'earning_partially_reversed', 'withdrawal_hold') AND amount < 0)),
  CHECK ((entry_type IN ('earning_reversed', 'earning_partially_reversed')) = (reversal_id IS NOT NULL)),
  CHECK (
    (entry_type LIKE 'earning_%' AND earning_id IS NOT NULL AND withdrawal_id IS NULL)
    OR (entry_type LIKE 'withdrawal_%' AND withdrawal_id IS NOT NULL AND earning_id IS NULL))
);
-- Cada evento se registra una sola vez.
CREATE UNIQUE INDEX IF NOT EXISTS service_ledger_once_earning
  ON public.service_ledger (earning_id, entry_type)
  WHERE earning_id IS NOT NULL AND entry_type IN ('earning_released', 'earning_reversed');
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

-- Los montos de una ganancia o un retiro nunca cambian; solo su estado y fechas.
CREATE OR REPLACE FUNCTION public.service_money_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'financial_rows_are_permanent' USING ERRCODE = '42501'; END IF;
  IF TG_TABLE_NAME = 'service_earnings' AND (
       NEW.gross_amount IS DISTINCT FROM OLD.gross_amount OR NEW.net_amount IS DISTINCT FROM OLD.net_amount
    OR NEW.platform_fee IS DISTINCT FROM OLD.platform_fee OR NEW.currency_code IS DISTINCT FROM OLD.currency_code
    OR NEW.provider_profile_id IS DISTINCT FROM OLD.provider_profile_id
    OR NEW.service_contract_id IS DISTINCT FROM OLD.service_contract_id
    OR NEW.payment_order_id IS DISTINCT FROM OLD.payment_order_id) THEN
    RAISE EXCEPTION 'earning_amounts_are_immutable' USING ERRCODE = '42501';
  END IF;
  IF TG_TABLE_NAME = 'service_withdrawals' AND (
       NEW.amount IS DISTINCT FROM OLD.amount OR NEW.fee IS DISTINCT FROM OLD.fee
    OR NEW.net_amount IS DISTINCT FROM OLD.net_amount OR NEW.currency_code IS DISTINCT FROM OLD.currency_code
    OR NEW.profile_id IS DISTINCT FROM OLD.profile_id OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key) THEN
    RAISE EXCEPTION 'withdrawal_amounts_are_immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS service_earning_reversals_no_update ON public.service_earning_reversals;
CREATE TRIGGER service_earning_reversals_no_update BEFORE UPDATE OR DELETE ON public.service_earning_reversals
FOR EACH ROW EXECUTE FUNCTION public.service_ledger_immutable();
DROP TRIGGER IF EXISTS service_earnings_immutable_trg ON public.service_earnings;
CREATE TRIGGER service_earnings_immutable_trg BEFORE UPDATE OR DELETE ON public.service_earnings
FOR EACH ROW EXECUTE FUNCTION public.service_money_immutable();
DROP TRIGGER IF EXISTS service_withdrawals_immutable_trg ON public.service_withdrawals;
CREATE TRIGGER service_withdrawals_immutable_trg BEFORE UPDATE OR DELETE ON public.service_withdrawals
FOR EACH ROW EXECUTE FUNCTION public.service_money_immutable();

-- 2. Permisos y RLS: solo lectura de lo propio (o admin) ---------------------------
GRANT SELECT ON public.service_earnings, public.service_withdrawals, public.service_ledger TO authenticated;
GRANT ALL ON public.service_earnings, public.service_withdrawals, public.service_ledger,
  public.service_payout_methods, public.service_earning_reversals TO service_role;
GRANT SELECT ON public.service_earning_reversals TO authenticated;
ALTER TABLE public.service_earning_reversals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_earning_reversals_read ON public.service_earning_reversals;
CREATE POLICY service_earning_reversals_read ON public.service_earning_reversals FOR SELECT TO authenticated
USING (public.is_payment_admin() OR EXISTS (SELECT 1 FROM public.service_earnings se
  WHERE se.id = earning_id AND se.provider_profile_id = public.current_profile_id()));
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

-- 4. Elegibilidad: única fuente de verdad para triggers, diagnóstico y backfill ------
-- Una contratación genera dinero SOLO si TODO se cumple:
--   contrato 'completed'; publicación y ambos perfiles NO demo; exactamente UNA orden de
--   pago del contrato en 'paid' o 'partially_refunded'; comprador/proveedor/moneda de la
--   orden coinciden con el contrato; orden confirmada por un proveedor real (payment_provider
--   <> 'unconfigured', paid_at y external_payment_id presentes); existe la transacción
--   'captured' de ese proveedor con ese mismo id externo y live_mode = true (no sandbox/test);
--   la preferencia no está marcada mode = 'test'; montos coherentes.
-- Cualquier caso ambiguo NO califica (se informa el motivo).
CREATE OR REPLACE FUNCTION public.service_earning_eligibility(_contract_id uuid)
RETURNS TABLE (contract_id uuid, qualifies boolean, reason text, payment_order_id uuid,
  provider_profile_id uuid, buyer_profile_id uuid, gross_amount numeric, platform_fee numeric,
  net_amount numeric, currency_code text, paid_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE c public.service_contracts; o public.payment_orders; n integer; why text; demo boolean;
BEGIN
  SELECT * INTO c FROM public.service_contracts WHERE id = _contract_id;
  IF c.id IS NULL THEN
    RETURN QUERY SELECT _contract_id, false, 'contract_not_found'::text, NULL::uuid, NULL::uuid, NULL::uuid,
      NULL::numeric, NULL::numeric, NULL::numeric, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;
  IF c.status <> 'completed' THEN why := 'contract_' || c.status; END IF;

  SELECT (l.is_demo OR bp.is_demo OR pp.is_demo) INTO demo
  FROM public.service_listings l, public.profiles bp, public.profiles pp
  WHERE l.id = c.service_listing_id AND bp.id = c.buyer_profile_id AND pp.id = c.provider_profile_id;
  IF why IS NULL AND demo IS DISTINCT FROM false THEN why := 'demo_data'; END IF;

  SELECT count(*) INTO n FROM public.payment_orders po
  WHERE po.subject_type = 'service_contract' AND po.service_contract_id = c.id
    AND po.status IN ('paid', 'partially_refunded');
  SELECT * INTO o FROM public.payment_orders po
  WHERE po.subject_type = 'service_contract' AND po.service_contract_id = c.id
    AND po.status IN ('paid', 'partially_refunded')
  ORDER BY po.paid_at DESC NULLS LAST LIMIT 1;
  IF why IS NULL AND n = 0 THEN why := 'no_confirmed_payment';
  ELSIF why IS NULL AND n > 1 THEN why := 'ambiguous_multiple_payments'; END IF;

  IF why IS NULL AND (o.buyer_profile_id IS DISTINCT FROM c.buyer_profile_id
                      OR o.provider_profile_id IS DISTINCT FROM c.provider_profile_id) THEN
    why := 'payment_parties_mismatch';
  END IF;
  IF why IS NULL AND upper(o.currency_code) IS DISTINCT FROM upper(c.currency_code) THEN why := 'currency_mismatch'; END IF;
  IF why IS NULL AND (o.paid_at IS NULL OR o.payment_provider = 'unconfigured' OR o.external_payment_id IS NULL) THEN
    why := 'payment_not_provider_confirmed';
  END IF;
  IF why IS NULL AND NOT EXISTS (SELECT 1 FROM public.payment_transactions t
      WHERE t.payment_order_id = o.id AND t.payment_provider = o.payment_provider
        AND t.external_transaction_id = o.external_payment_id AND t.status = 'captured') THEN
    why := 'no_captured_transaction';
  END IF;
  IF why IS NULL AND (coalesce(o.metadata #>> '{mercadopago,mode}', '') = 'test'
      OR NOT EXISTS (SELECT 1 FROM public.payment_transactions t
        WHERE t.payment_order_id = o.id AND t.external_transaction_id = o.external_payment_id
          AND t.status = 'captured' AND t.metadata ->> 'live_mode' = 'true')) THEN
    why := 'test_mode_payment';
  END IF;
  IF why IS NULL AND (o.subtotal <= 0 OR o.provider_payout < 0 OR o.provider_payout > o.subtotal) THEN
    why := 'invalid_amounts';
  END IF;
  IF why IS NULL AND EXISTS (SELECT 1 FROM public.service_earnings se WHERE se.service_contract_id = c.id) THEN
    why := 'already_has_earning';
  END IF;

  RETURN QUERY SELECT c.id, why IS NULL, coalesce(why, 'qualifies'), o.id, c.provider_profile_id,
    c.buyer_profile_id, o.subtotal, o.platform_fee + o.provider_fee, o.provider_payout,
    upper(o.currency_code), o.paid_at;
END $$;
REVOKE ALL ON FUNCTION public.service_earning_eligibility(uuid) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.service_earning_ensure(uuid);
-- Alta de la ganancia (triggers y backfill). La restricción UNIQUE es la última barrera.
CREATE OR REPLACE FUNCTION public.service_earning_ensure(_contract_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE el record; new_id uuid; r record;
BEGIN
  SELECT * INTO el FROM public.service_earning_eligibility(_contract_id);
  IF el.qualifies IS NOT TRUE THEN RETURN false; END IF;
  INSERT INTO public.service_earnings(service_contract_id, payment_order_id, provider_profile_id,
    buyer_profile_id, gross_amount, platform_fee, net_amount, currency_code, available_at)
  VALUES (el.contract_id, el.payment_order_id, el.provider_profile_id, el.buyer_profile_id,
    el.gross_amount, el.platform_fee, el.net_amount, el.currency_code,
    now() + make_interval(hours => (public.service_finance_cfg(el.currency_code)).hold_hours))
  ON CONFLICT DO NOTHING            -- UNIQUE(service_contract_id) y UNIQUE(payment_order_id)
  RETURNING id INTO new_id;
  IF new_id IS NULL THEN RETURN false; END IF;
  PERFORM public.payment_audit('service_earning_created', NULL, 'service_earning', new_id,
    jsonb_build_object('contract', el.contract_id, 'payment_order', el.payment_order_id));
  -- Reembolsos parciales ya confirmados antes de crear la ganancia.
  FOR r IN SELECT id FROM public.payment_refunds
           WHERE payment_order_id = el.payment_order_id AND status = 'succeeded' ORDER BY created_at LOOP
    PERFORM public.service_earning_reverse_partial(r.id);
  END LOOP;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.service_earning_ensure(uuid) FROM PUBLIC, anon, authenticated;

-- 4b. Reembolsos ------------------------------------------------------------------
-- Parcial: por cada reembolso confirmado ('succeeded') se crea UNA reversión proporcional
-- según refund_fee_policy, con tope en lo que queda del neto. Si la ganancia ya estaba
-- disponible, se asienta un movimiento negativo en el ledger; si estaba pendiente, la
-- liberación acreditará solo el neto restante. Nada histórico se modifica ni borra.
CREATE OR REPLACE FUNCTION public.service_earning_reverse_partial(_refund_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.payment_refunds; o public.payment_orders; e public.service_earnings;
        pol text; already numeric; nr numeric; rv uuid;
BEGIN
  SELECT * INTO r FROM public.payment_refunds WHERE id = _refund_id;
  IF r.id IS NULL OR r.status <> 'succeeded' THEN RETURN; END IF;
  SELECT * INTO o FROM public.payment_orders WHERE id = r.payment_order_id;
  IF o.id IS NULL OR o.subject_type <> 'service_contract' THEN RETURN; END IF;
  SELECT * INTO e FROM public.service_earnings WHERE payment_order_id = o.id FOR UPDATE;
  IF e.id IS NULL OR e.status = 'reversed' THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.service_earning_reversals WHERE payment_refund_id = r.id) THEN RETURN; END IF;
  pol := (public.service_finance_cfg(e.currency_code)).refund_fee_policy;
  SELECT coalesce(sum(net_reversed), 0) INTO already FROM public.service_earning_reversals WHERE earning_id = e.id;
  nr := CASE pol WHEN 'provider_bears_full' THEN r.amount
                 ELSE round(e.net_amount * r.amount / nullif(o.total_charged, 0), 2) END;
  nr := least(coalesce(nr, 0), e.net_amount - already);
  IF nr <= 0 THEN RETURN; END IF;
  INSERT INTO public.service_earning_reversals(earning_id, payment_refund_id, kind, refund_amount, net_reversed, fee_policy)
  VALUES (e.id, r.id, 'partial', r.amount, nr, pol)
  ON CONFLICT DO NOTHING RETURNING id INTO rv;
  IF rv IS NULL THEN RETURN; END IF;
  IF e.status = 'available' THEN
    INSERT INTO public.service_ledger(profile_id, currency_code, entry_type, amount, earning_id, reversal_id)
    VALUES (e.provider_profile_id, e.currency_code, 'earning_partially_reversed', -nr, e.id, rv);
  END IF;
  IF already + nr >= e.net_amount THEN
    UPDATE public.service_earnings SET status = 'reversed', reversed_at = now(),
      reversal_reason = 'fully_refunded' WHERE id = e.id;
  END IF;
  PERFORM public.service_finance_notify(e.provider_profile_id, 'service_earning_partially_reversed',
    'Reembolso parcial aplicado', '-' || nr || ' ' || e.currency_code);
  PERFORM public.payment_audit('service_earning_partially_reversed', NULL, 'service_earning', e.id,
    jsonb_build_object('refund', r.id, 'net_reversed', nr, 'policy', pol));
END $$;
REVOKE ALL ON FUNCTION public.service_earning_reverse_partial(uuid) FROM PUBLIC, anon, authenticated;

-- Total: revierte lo que quede del neto (tras parciales) con una sola fila 'full'.
CREATE OR REPLACE FUNCTION public.service_earning_reverse(_order_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.service_earnings; already numeric; remaining numeric; rv uuid;
BEGIN
  SELECT * INTO e FROM public.service_earnings WHERE payment_order_id = _order_id FOR UPDATE;
  IF e.id IS NULL OR e.status = 'reversed' THEN RETURN; END IF;
  SELECT coalesce(sum(net_reversed), 0) INTO already FROM public.service_earning_reversals WHERE earning_id = e.id;
  remaining := e.net_amount - already;
  IF remaining > 0 THEN
    INSERT INTO public.service_earning_reversals(earning_id, kind, net_reversed, fee_policy)
    VALUES (e.id, 'full', remaining, (public.service_finance_cfg(e.currency_code)).refund_fee_policy)
    ON CONFLICT DO NOTHING RETURNING id INTO rv;
    IF rv IS NOT NULL AND e.status = 'available' THEN
      INSERT INTO public.service_ledger(profile_id, currency_code, entry_type, amount, earning_id, reversal_id)
      VALUES (e.provider_profile_id, e.currency_code, 'earning_reversed', -remaining, e.id, rv)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  UPDATE public.service_earnings SET status = 'reversed', reversed_at = now(),
    reversal_reason = left(_reason, 200) WHERE id = e.id;
  PERFORM public.payment_audit('service_earning_reversed', NULL, 'service_earning', e.id,
    jsonb_build_object('reason', _reason, 'net_reversed', remaining));
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

-- Orden: 'paid' crea la ganancia (si el contrato ya terminó); 'refunded' la revierte entera.
-- 'partially_refunded' NO revierte todo: lo hace el trigger de payment_refunds por reembolso.
CREATE OR REPLACE FUNCTION public.service_earnings_on_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.subject_type <> 'service_contract' THEN RETURN NEW; END IF;
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    PERFORM public.service_earning_ensure(NEW.service_contract_id);
  ELSIF NEW.status = 'refunded' AND OLD.status IS DISTINCT FROM 'refunded' THEN
    PERFORM public.service_earning_reverse(NEW.id, 'payment_refunded');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS service_earnings_order_trg ON public.payment_orders;
CREATE TRIGGER service_earnings_order_trg AFTER UPDATE OF status ON public.payment_orders
FOR EACH ROW EXECUTE FUNCTION public.service_earnings_on_order();

CREATE OR REPLACE FUNCTION public.service_earnings_on_refund()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'succeeded' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'succeeded') THEN
    PERFORM public.service_earning_reverse_partial(NEW.id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS service_earnings_refund_trg ON public.payment_refunds;
CREATE TRIGGER service_earnings_refund_trg AFTER INSERT OR UPDATE OF status ON public.payment_refunds
FOR EACH ROW EXECUTE FUNCTION public.service_earnings_on_refund();

-- 5. Liberación de ganancias vencidas (idempotente). Solo si el contrato sigue completado
--    y el pago sigue pagado: disputas/reembolsos bloquean la liberación.
CREATE OR REPLACE FUNCTION public.service_release_due_earnings(_profile uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.service_earnings; n integer := 0; credit numeric;
BEGIN
  FOR e IN
    SELECT se.* FROM public.service_earnings se
    JOIN public.service_contracts c ON c.id = se.service_contract_id AND c.status = 'completed'
    JOIN public.payment_orders o ON o.id = se.payment_order_id AND o.status IN ('paid', 'partially_refunded')
    WHERE se.status = 'pending' AND se.available_at <= now()
      -- Un reembolso en curso congela la liberación hasta que se resuelva.
      AND NOT EXISTS (SELECT 1 FROM public.payment_refunds pr
                      WHERE pr.payment_order_id = o.id AND pr.status IN ('pending', 'processing'))
      AND (_profile IS NULL OR se.provider_profile_id = _profile)
    FOR UPDATE OF se SKIP LOCKED
  LOOP
    -- Neto menos reversiones parciales registradas mientras estaba pendiente.
    credit := e.net_amount - coalesce((SELECT sum(net_reversed) FROM public.service_earning_reversals
                                       WHERE earning_id = e.id), 0);
    UPDATE public.service_earnings SET status = 'available', released_at = now() WHERE id = e.id;
    IF credit > 0 THEN
      INSERT INTO public.service_ledger(profile_id, currency_code, entry_type, amount, earning_id)
      VALUES (e.provider_profile_id, e.currency_code, 'earning_released', credit, e.id)
      ON CONFLICT DO NOTHING;
    END IF;
    PERFORM public.service_finance_notify(e.provider_profile_id, 'service_earning_available',
      'Nueva ganancia disponible', credit || ' ' || e.currency_code);
    PERFORM public.payment_audit('service_earning_released', NULL, 'service_earning', e.id, '{}'::jsonb);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.service_release_due_earnings(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_release_due_earnings(uuid) TO service_role;

-- 6. Lecturas seguras ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_service_balance()
RETURNS TABLE (currency_code text, available numeric, pending numeric, total_earned numeric,
               total_withdrawn numeric, in_withdrawal numeric, debt numeric)
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
  , led AS (
    SELECT cur.currency_code AS cc,
      coalesce((SELECT sum(l.amount) FROM public.service_ledger l
                WHERE l.profile_id = me AND l.currency_code = cur.currency_code), 0)::numeric AS bal
    FROM cur
  )
  SELECT cur.currency_code,
    greatest(led.bal, 0),
    coalesce((SELECT sum((se.net_amount - coalesce((SELECT sum(rv.net_reversed) FROM public.service_earning_reversals rv WHERE rv.earning_id = se.id), 0))) FROM public.service_earnings se
              WHERE se.provider_profile_id = me AND se.currency_code = cur.currency_code
                AND se.status = 'pending'), 0)::numeric,
    coalesce((SELECT sum((se.net_amount - coalesce((SELECT sum(rv.net_reversed) FROM public.service_earning_reversals rv WHERE rv.earning_id = se.id), 0))) FROM public.service_earnings se
              WHERE se.provider_profile_id = me AND se.currency_code = cur.currency_code
                AND se.status <> 'reversed'), 0)::numeric,
    coalesce((SELECT sum(w.amount) FROM public.service_withdrawals w
              WHERE w.profile_id = me AND w.currency_code = cur.currency_code
                AND w.status = 'completed'), 0)::numeric,
    coalesce((SELECT sum(w.amount) FROM public.service_withdrawals w
              WHERE w.profile_id = me AND w.currency_code = cur.currency_code
                AND w.status IN ('pending', 'approved', 'processing')), 0)::numeric,
    greatest(-led.bal, 0)            -- deuda: reversión posterior a un retiro; se compensa con futuras ganancias
  FROM cur JOIN led ON led.cc = cur.currency_code;
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
  -- Saldo negativo (deuda por reembolso posterior a un retiro): no se permiten retiros nuevos.
  -- La cuenta NO se suspende; la deuda se compensa sola con las próximas ganancias.
  IF avail < 0 THEN RAISE EXCEPTION 'negative_balance_blocks_withdrawal' USING ERRCODE = '22023'; END IF;
  IF amt > avail THEN RAISE EXCEPTION 'amount_exceeds_available' USING ERRCODE = '22023'; END IF;

  IF amt < (public.service_finance_cfg(_currency)).min_withdrawal THEN
    RAISE EXCEPTION 'amount_below_minimum' USING ERRCODE = '22023';
  END IF;
  IF (public.service_finance_cfg(_currency)).max_withdrawal IS NOT NULL
     AND amt > (public.service_finance_cfg(_currency)).max_withdrawal THEN
    RAISE EXCEPTION 'amount_above_maximum' USING ERRCODE = '22023';
  END IF;
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
--  pending → approved | rejected ; approved → processing | rejected ; processing → rejected
--  "completed" NO lo puede marcar un administrador: solo record_service_payout_completed (service_role),
--  que llamará la futura integración del proveedor de payouts con su referencia real.
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
    OR (w.status = 'processing' AND _status = 'rejected')
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
    updated_at = now()
  WHERE id = w.id RETURNING * INTO w;

  IF _status = 'rejected' THEN
    INSERT INTO public.service_ledger(profile_id, currency_code, entry_type, amount, withdrawal_id)
    VALUES (w.profile_id, w.currency_code, 'withdrawal_released', w.amount, w.id);
  END IF;

  IF _status IN ('processing', 'rejected') THEN
    PERFORM public.service_finance_notify(w.profile_id, 'service_withdrawal_' || _status,
      CASE _status WHEN 'processing' THEN 'Retiro en proceso' ELSE 'Retiro rechazado' END,
      CASE WHEN _status = 'rejected' THEN left(trim(_reason), 200) ELSE w.amount || ' ' || w.currency_code END);
  END IF;
  PERFORM public.payment_audit('service_withdrawal_' || _status, me, 'service_withdrawal', w.id,
    jsonb_build_object('reason', _reason, 'reference', _reference));
  RETURN w;
END $$;
REVOKE ALL ON FUNCTION public.admin_transition_service_withdrawal(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_transition_service_withdrawal(uuid, text, text, text) TO authenticated;

-- 10b. Completar un retiro: SOLO con confirmación real del proveedor de payouts --------
-- No está concedida a usuarios ni administradores. La invocará la futura integración
-- (servidor con service_role) tras verificar la transferencia con el proveedor.
CREATE OR REPLACE FUNCTION public.record_service_payout_completed(
  _withdrawal_id uuid, _payout_provider text, _external_reference text)
RETURNS public.service_withdrawals
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.service_withdrawals;
BEGIN
  IF coalesce(trim(_payout_provider), '') IN ('', 'unconfigured') OR coalesce(trim(_external_reference), '') = '' THEN
    RAISE EXCEPTION 'real_payout_reference_required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO w FROM public.service_withdrawals WHERE id = _withdrawal_id FOR UPDATE;
  IF w.id IS NULL THEN RAISE EXCEPTION 'withdrawal_not_found' USING ERRCODE = 'P0002'; END IF;
  IF w.status = 'completed' THEN RETURN w; END IF;          -- idempotente ante reintentos del proveedor
  IF w.status <> 'processing' THEN RAISE EXCEPTION 'invalid_transition % -> completed', w.status USING ERRCODE = '22023'; END IF;
  UPDATE public.service_withdrawals SET status = 'completed', payout_provider = trim(_payout_provider),
    external_reference = trim(_external_reference), completed_at = now(), updated_at = now()
  WHERE id = w.id RETURNING * INTO w;
  PERFORM public.service_finance_notify(w.profile_id, 'service_withdrawal_completed', 'Retiro completado',
    w.net_amount || ' ' || w.currency_code);
  PERFORM public.payment_audit('service_withdrawal_completed', NULL, 'service_withdrawal', w.id,
    jsonb_build_object('provider', w.payout_provider, 'reference', w.external_reference));
  RETURN w;
END $$;
REVOKE ALL ON FUNCTION public.record_service_payout_completed(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_service_payout_completed(uuid, text, text) TO service_role;

-- Funciones de trigger: nadie las llama directamente.
REVOKE ALL ON FUNCTION public.service_earnings_on_contract() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.service_earnings_on_order() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.service_earnings_on_refund() FROM PUBLIC, anon, authenticated;

-- 11. Historial: esta migración NO genera ganancias históricas automáticamente --------
-- Re-ejecutar el archivo nunca crea dinero. El historial se procesa en 3 pasos manuales,
-- solo desde el SQL Editor (ningún rol de la app puede llamar estas funciones):
--   1) SELECT * FROM public.service_earnings_backfill_summary();          -- totales (solo lectura)
--   2) SELECT * FROM public.service_earnings_backfill_report() ORDER BY qualifies DESC, reason; -- detalle
--   3) SELECT public.service_run_earnings_backfill(<número exacto de 'qualifies' del paso 1>);

-- Detalle por contratación (solo lectura): califica o motivo exacto de exclusión.
CREATE OR REPLACE FUNCTION public.service_earnings_backfill_report()
RETURNS TABLE (contract_id uuid, contract_status text, qualifies boolean, reason text,
  payment_order_id uuid, provider_profile_id uuid, gross_amount numeric, platform_fee numeric,
  net_amount numeric, currency_code text, paid_at timestamptz, would_be_status text,
  would_be_available_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT el.contract_id, c.status, el.qualifies, el.reason, el.payment_order_id, el.provider_profile_id,
    el.gross_amount, el.platform_fee, el.net_amount, el.currency_code, el.paid_at,
    CASE WHEN el.qualifies THEN 'pending' END,
    CASE WHEN el.qualifies THEN now() + make_interval(hours => (public.service_finance_cfg(el.currency_code)).hold_hours) END
  FROM public.service_contracts c
  CROSS JOIN LATERAL public.service_earning_eligibility(c.id) el
$$;
REVOKE ALL ON FUNCTION public.service_earnings_backfill_report() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_earnings_backfill_report() TO service_role;

-- Resumen (solo lectura). Toda ganancia nace 'pending' (retención); disponible al crear = 0.
CREATE OR REPLACE FUNCTION public.service_earnings_backfill_summary()
RETURNS TABLE (currency_code text, qualifying_contracts bigint, non_qualifying_contracts bigint,
  gross_total numeric, fee_total numeric, net_total numeric, would_be_pending numeric,
  would_be_available numeric, exclusion_reasons jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH r AS (SELECT * FROM public.service_earnings_backfill_report())
  SELECT coalesce(r.currency_code, '—'),
    count(*) FILTER (WHERE r.qualifies),
    count(*) FILTER (WHERE NOT r.qualifies),
    coalesce(sum(r.gross_amount) FILTER (WHERE r.qualifies), 0),
    coalesce(sum(r.platform_fee) FILTER (WHERE r.qualifies), 0),
    coalesce(sum(r.net_amount) FILTER (WHERE r.qualifies), 0),
    coalesce(sum(r.net_amount) FILTER (WHERE r.qualifies), 0),
    0::numeric,
    (SELECT coalesce(jsonb_object_agg(x.reason, x.n), '{}'::jsonb) FROM (
       SELECT r2.reason, count(*) AS n FROM r r2
       WHERE NOT r2.qualifies AND r2.currency_code IS NOT DISTINCT FROM r.currency_code
       GROUP BY r2.reason) x)
  FROM r GROUP BY r.currency_code
$$;
REVOKE ALL ON FUNCTION public.service_earnings_backfill_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_earnings_backfill_summary() TO service_role;

-- Ejecución explícita. Exige el número exacto visto en el resumen (si cambió, aborta todo).
-- Idempotente: lo ya creado deja de calificar ('already_has_earning') y UNIQUE impide duplicados.
CREATE OR REPLACE FUNCTION public.service_run_earnings_backfill(_expected_count integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer; created integer := 0; c record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('service_earnings_backfill'));
  SELECT count(*) INTO n FROM public.service_earnings_backfill_report() WHERE qualifies;
  IF n IS DISTINCT FROM _expected_count THEN
    RAISE EXCEPTION 'backfill_count_mismatch: expected %, found %', _expected_count, n USING ERRCODE = '22023';
  END IF;
  FOR c IN SELECT contract_id FROM public.service_earnings_backfill_report() WHERE qualifies LOOP
    IF public.service_earning_ensure(c.contract_id) THEN created := created + 1; END IF;
  END LOOP;
  PERFORM public.payment_audit('service_earnings_backfill', NULL, 'service_earnings_backfill', gen_random_uuid(),
    jsonb_build_object('expected', _expected_count, 'created', created));
  RETURN created;
END $$;
REVOKE ALL ON FUNCTION public.service_run_earnings_backfill(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_run_earnings_backfill(integer) TO service_role;
