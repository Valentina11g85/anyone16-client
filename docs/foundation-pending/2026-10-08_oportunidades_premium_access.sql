-- =====================================================================================
-- AnyOne¹⁶ · Oportunidades — ACCESO PREMIUM REAL ($4.000 COP por cuenta)
-- PENDIENTE — NO EJECUTADO. Revisar y ejecutar manualmente en el SQL Editor de Foundation.
--
-- ANTES de ejecutar: correr 2026-10-08_oportunidades_premium_access_diagnostics.sql y
-- revisar sus resultados (políticas reales de service_listings, vistas y funciones que
-- leen service_listings). Este archivo NO depende de conocer esas políticas: añade una
-- política RESTRICTIVA, que se combina con AND con las permisivas existentes y por lo
-- tanto solo puede QUITAR visibilidad, nunca ampliarla.
--
-- Qué hace (solo aditivo):
--   1. opportunities_access_config  — precio/moneda del desbloqueo (solo servidor escribe).
--   2. opportunities_access         — un acceso por cuenta (UNIQUE profile_id).
--   3. opportunities_access_payments— confirmaciones de pago, idempotentes por
--                                     (provider, external_payment_id).
--   4. has_opportunities_access() / get_my_opportunities_access() — solo el usuario actual.
--   5. is_service_listing_participant(listing) — relación real con ESA publicación.
--   6. Política RESTRICTIVA de SELECT en service_listings.
--   7. Trigger en service_offers: sin acceso no se puede abrir una negociación nueva
--      sobre una publicación ajena (evita usar "enviar propuesta" como puerta trasera).
--   8. activate_opportunities_access(...) — SOLO service_role, tras confirmación verificada.
--   9. get_opportunities_market_summary() — solo conteos, sin datos individuales.
--
-- NO modifica: favors, offers, messages, payment_orders, payment_transactions,
-- service_contracts, service_messages, service_reviews, sus políticas, ni datos existentes.
-- Las fotos quedan protegidas automáticamente: la política de storage
-- service_listing_media_select ya exige poder ver la publicación bajo RLS.
-- =====================================================================================

BEGIN;

-- ------------------------------------------------------------------ 1. config --------
CREATE TABLE IF NOT EXISTS public.opportunities_access_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),          -- fila única
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  currency_code text NOT NULL CHECK (char_length(currency_code) = 3),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.opportunities_access_config TO authenticated;
GRANT ALL ON public.opportunities_access_config TO service_role;
ALTER TABLE public.opportunities_access_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS opportunities_access_config_read ON public.opportunities_access_config;
CREATE POLICY opportunities_access_config_read ON public.opportunities_access_config
  FOR SELECT TO authenticated USING (true);
INSERT INTO public.opportunities_access_config (id, amount, currency_code)
VALUES (true, 4000, 'COP') ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------ 2. access --------
CREATE TABLE IF NOT EXISTS public.opportunities_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  amount numeric(18,2) NOT NULL,
  currency_code text NOT NULL,
  payment_provider text NOT NULL,
  external_payment_id text NOT NULL,
  activated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_provider, external_payment_id)
);
GRANT SELECT ON public.opportunities_access TO authenticated;   -- sin INSERT/UPDATE/DELETE
GRANT ALL ON public.opportunities_access TO service_role;
ALTER TABLE public.opportunities_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS opportunities_access_own_read ON public.opportunities_access;
CREATE POLICY opportunities_access_own_read ON public.opportunities_access
  FOR SELECT TO authenticated
  USING (profile_id = public.current_profile_id() OR public.is_platform_admin());

-- ---------------------------------------------------------------- 3. payments --------
CREATE TABLE IF NOT EXISTS public.opportunities_access_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  payment_provider text NOT NULL,
  external_payment_id text NOT NULL,
  amount numeric(18,2) NOT NULL,
  currency_code text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'confirmed', 'failed', 'refunded')),
  live_mode boolean NOT NULL,
  outcome text NOT NULL,           -- activated | already_active | rejected_<motivo> | recorded
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_provider, external_payment_id)
);
GRANT SELECT ON public.opportunities_access_payments TO authenticated;
GRANT ALL ON public.opportunities_access_payments TO service_role;
ALTER TABLE public.opportunities_access_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS opportunities_access_payments_own_read ON public.opportunities_access_payments;
CREATE POLICY opportunities_access_payments_own_read ON public.opportunities_access_payments
  FOR SELECT TO authenticated
  USING (profile_id = public.current_profile_id() OR public.is_platform_admin());

-- ------------------------------------------------------------ 4. access checks -------
CREATE OR REPLACE FUNCTION public.has_opportunities_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.opportunities_access a
    WHERE a.profile_id = public.current_profile_id() AND a.status = 'active'
  );
$$;
REVOKE ALL ON FUNCTION public.has_opportunities_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_opportunities_access() TO authenticated;

-- Lo que llama el frontend (src/lib/opportunities-access.ts). Sin parámetros: no se puede
-- consultar el acceso de otra persona.
CREATE OR REPLACE FUNCTION public.get_my_opportunities_access()
RETURNS TABLE (active boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_opportunities_access();
$$;
REVOKE ALL ON FUNCTION public.get_my_opportunities_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_opportunities_access() TO authenticated;

-- ------------------------------------------------------- 5. participant check --------
-- SECURITY DEFINER para no depender de (ni recursar en) las políticas de offers/contracts.
-- Solo responde sobre el usuario actual y sobre UNA publicación.
CREATE OR REPLACE FUNCTION public.is_service_listing_participant(_listing_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT public.current_profile_id() AS id)
  SELECT (SELECT id FROM me) IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.service_listings l, me
            WHERE l.id = _listing_id AND l.profile_id = me.id)
    OR EXISTS (SELECT 1 FROM public.service_offers o, me
               WHERE o.service_listing_id = _listing_id
                 AND me.id IN (o.buyer_profile_id, o.provider_profile_id, o.sender_profile_id))
    OR EXISTS (SELECT 1 FROM public.service_contracts c, me
               WHERE c.service_listing_id = _listing_id
                 AND me.id IN (c.buyer_profile_id, c.provider_profile_id))
    OR EXISTS (SELECT 1 FROM public.service_messages m, me
               WHERE m.service_listing_id = _listing_id
                 AND me.id IN (m.sender_profile_id, m.receiver_profile_id))
  );
$$;
REVOKE ALL ON FUNCTION public.is_service_listing_participant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_service_listing_participant(uuid) TO authenticated;

-- --------------------------------------------- 6. RESTRICTIVE policy on listings -----
-- Se suma (AND) a las políticas existentes. Autor, participante de ESA publicación,
-- cuenta con acceso activo o admin. Anónimos: nada.
DROP POLICY IF EXISTS service_listings_premium_gate ON public.service_listings;
CREATE POLICY service_listings_premium_gate ON public.service_listings
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    profile_id = public.current_profile_id()
    OR public.has_opportunities_access()
    OR public.is_service_listing_participant(id)
    OR public.is_platform_admin()
  );
DROP POLICY IF EXISTS service_listings_premium_gate_anon ON public.service_listings;
CREATE POLICY service_listings_premium_gate_anon ON public.service_listings
  AS RESTRICTIVE FOR SELECT TO anon USING (false);

-- ------------------------------------------- 7. no new negotiation without access ----
CREATE OR REPLACE FUNCTION public.opportunities_offer_access_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := public.current_profile_id(); author uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;            -- service role / mantenimiento
  SELECT profile_id INTO author FROM public.service_listings WHERE id = NEW.service_listing_id;
  IF author IS NOT NULL AND author = me THEN RETURN NEW; END IF;   -- el autor contraoferta
  IF public.has_opportunities_access() THEN RETURN NEW; END IF;
  -- Negociación ya existente en ESTA publicación (antes del paywall) sigue funcionando.
  IF EXISTS (SELECT 1 FROM public.service_offers o
             WHERE o.service_listing_id = NEW.service_listing_id
               AND me IN (o.buyer_profile_id, o.provider_profile_id, o.sender_profile_id))
     OR EXISTS (SELECT 1 FROM public.service_contracts c
                WHERE c.service_listing_id = NEW.service_listing_id
                  AND me IN (c.buyer_profile_id, c.provider_profile_id)) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'opportunities_access_required' USING ERRCODE = '42501';
END $$;
REVOKE ALL ON FUNCTION public.opportunities_offer_access_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS opportunities_offer_access_guard_trg ON public.service_offers;
CREATE TRIGGER opportunities_offer_access_guard_trg BEFORE INSERT ON public.service_offers
FOR EACH ROW EXECUTE FUNCTION public.opportunities_offer_access_guard();

-- ------------------------------------------------------ 8. activation (server) -------
-- La llama SOLO el servidor (webhook del proveedor, con firma verificada) usando
-- service_role. Idempotente por (provider, external_payment_id) y por cuenta.
CREATE OR REPLACE FUNCTION public.activate_opportunities_access(
  _profile_id uuid, _provider text, _external_payment_id text,
  _amount numeric, _currency text, _status text, _live_mode boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg public.opportunities_access_config; prev text; result text;
BEGIN
  IF _profile_id IS NULL OR coalesce(_provider, '') = '' OR coalesce(_external_payment_id, '') = '' THEN
    RAISE EXCEPTION 'invalid_arguments';
  END IF;
  -- Serializa por cuenta: dos confirmaciones simultáneas no crean dos accesos.
  PERFORM pg_advisory_xact_lock(hashtextextended('opp_access:' || _profile_id::text, 0));

  SELECT outcome INTO prev FROM public.opportunities_access_payments
   WHERE payment_provider = _provider AND external_payment_id = _external_payment_id;
  IF FOUND AND _status = 'confirmed' AND prev IN ('activated', 'already_active') THEN
    RETURN 'duplicate';                                     -- reintento del proveedor
  END IF;

  SELECT * INTO cfg FROM public.opportunities_access_config WHERE id;
  result := CASE
    WHEN _status <> 'confirmed' THEN 'recorded'
    WHEN NOT _live_mode THEN 'rejected_test_mode'
    WHEN upper(_currency) <> cfg.currency_code OR _amount < cfg.amount THEN 'rejected_amount'
    WHEN EXISTS (SELECT 1 FROM public.opportunities_access
                 WHERE profile_id = _profile_id AND status = 'active') THEN 'already_active'
    ELSE 'activated' END;

  INSERT INTO public.opportunities_access_payments
    (profile_id, payment_provider, external_payment_id, amount, currency_code, status, live_mode, outcome)
  VALUES (_profile_id, _provider, _external_payment_id, _amount, upper(_currency), _status, _live_mode, result)
  ON CONFLICT (payment_provider, external_payment_id)
  DO UPDATE SET status = EXCLUDED.status, outcome = EXCLUDED.outcome, received_at = now();

  IF result = 'activated' THEN
    INSERT INTO public.opportunities_access
      (profile_id, amount, currency_code, payment_provider, external_payment_id)
    VALUES (_profile_id, _amount, upper(_currency), _provider, _external_payment_id)
    ON CONFLICT (profile_id) DO UPDATE
      SET status = 'active', revoked_at = NULL, revoke_reason = NULL,
          amount = EXCLUDED.amount, currency_code = EXCLUDED.currency_code,
          payment_provider = EXCLUDED.payment_provider,
          external_payment_id = EXCLUDED.external_payment_id,
          activated_at = now(), updated_at = now()
      WHERE public.opportunities_access.status = 'revoked';
  END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.activate_opportunities_access(uuid, text, text, numeric, text, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_opportunities_access(uuid, text, text, numeric, text, text, boolean)
  TO service_role;

-- Reembolso/contracargo: revoca (no borra). Solo servidor.
CREATE OR REPLACE FUNCTION public.revoke_opportunities_access(
  _provider text, _external_payment_id text, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.opportunities_access
     SET status = 'revoked', revoked_at = now(), revoke_reason = _reason, updated_at = now()
   WHERE payment_provider = _provider AND external_payment_id = _external_payment_id
     AND status = 'active';
  UPDATE public.opportunities_access_payments SET status = 'refunded', received_at = now()
   WHERE payment_provider = _provider AND external_payment_id = _external_payment_id;
END $$;
REVOKE ALL ON FUNCTION public.revoke_opportunities_access(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_opportunities_access(text, text, text) TO service_role;

-- ------------------------------------------------------- 9. counts only --------------
CREATE OR REPLACE FUNCTION public.get_opportunities_market_summary()
RETURNS TABLE (services_count bigint, job_offers_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*) FILTER (WHERE listing_type = 'offer'),
         count(*) FILTER (WHERE listing_type <> 'offer')
    FROM public.service_listings
   WHERE status = 'published' AND NOT coalesce(is_demo, false);
$$;
REVOKE ALL ON FUNCTION public.get_opportunities_market_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_opportunities_market_summary() TO authenticated;

COMMIT;
