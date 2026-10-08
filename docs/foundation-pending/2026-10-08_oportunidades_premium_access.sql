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
-- REVISIÓN 2: marketplace (get_opportunities_market) separado de la publicación
-- participada (get_service_listing_for_me). Reemplaza únicamente la política
-- storage service_listing_media_select del bucket service-listing-media.
-- REQUISITO ANTES DE INSTALAR: el frontend debe leer el listado general con
-- get_opportunities_market y los detalles ajenos con get_service_listing_for_me; si no,
-- los participantes sin pago dejarán de ver publicaciones ajenas en sus flujos.
-- REVISIÓN 3 (FINAL, tras diagnóstico real de Foundation):
--   * NO modifica políticas de service_offers, service_messages ni profiles.
--   * get_opportunities_market / get_service_listing_for_me devuelven la fila de la
--     publicación + author_name + author_avatar_url (calculados aquí, solo si la
--     publicación ya está autorizada). La RLS de profiles no se amplía.
--   * Marketplace: published, is_demo=false, ajenas y NO participadas.
--   * Activación: comprobación de duplicados corregida (sin depender de FOUND).
-- REVISIÓN 4: reembolso antes de confirmación. revoke_opportunities_access registra el
-- pago como 'refunded' aunque no exista fila previa, así una confirmación tardía del
-- mismo (provider, external_payment_id) queda rechazada sin depender del orden de los
-- webhooks. Un pago nuevo y distinto sí activa Premium.
-- REVISIÓN 5:
--   * El reembolso temprano ya NO inserta en opportunities_access_payments con
--     profile_id NULL (fallaba por NOT NULL). Se registra en la tabla nueva
--     opportunities_access_payment_blocks (provider, external_payment_id) que no
--     necesita perfil. profile_id sigue NOT NULL en pagos y accesos.
--   * activate_opportunities_access consulta ese bloqueo antes de todo; si existe,
--     registra el intento con su profile_id real y outcome 'rejected_refunded'.
--   * activate y revoke comparten el mismo bloqueo por pago (sin carreras).
--   * get_opportunities_market_summary devuelve 0/0 sin Premium ni admin.
-- REVISIÓN 6:
--   * Premium solo concede acceso a publicaciones con status='published' (detalle,
--     imágenes y lectura directa de la tabla). Dueño, participante real y admin igual.
--   * activate_opportunities_access rechaza con 'rejected_invalid' (sin error técnico ni
--     valores supuestos) avisos sin monto, moneda, modo o con estado desconocido.
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

-- ------------------------------------------- 3b. payments bloqueados (reembolsos) ----
-- Lista negra permanente de pagos reembolsados/cancelados. No requiere perfil, así el
-- reembolso puede registrarse aunque la confirmación aún no haya llegado. Nunca se borra.
CREATE TABLE IF NOT EXISTS public.opportunities_access_payment_blocks (
  payment_provider text NOT NULL CHECK (payment_provider <> ''),
  external_payment_id text NOT NULL CHECK (external_payment_id <> ''),
  reason text,
  blocked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (payment_provider, external_payment_id)
);
REVOKE ALL ON public.opportunities_access_payment_blocks FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.opportunities_access_payment_blocks TO service_role;
ALTER TABLE public.opportunities_access_payment_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS opportunities_access_payment_blocks_admin_read ON public.opportunities_access_payment_blocks;
CREATE POLICY opportunities_access_payment_blocks_admin_read ON public.opportunities_access_payment_blocks
  FOR SELECT TO authenticated USING (public.is_platform_admin());
GRANT SELECT ON public.opportunities_access_payment_blocks TO authenticated;

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

-- Autor real de una publicación a partir del segmento de ruta (texto). SECURITY DEFINER
-- para que la política de storage no dependa de la RLS de la tabla. No expone contenido.
CREATE OR REPLACE FUNCTION public.service_listings_media_owner(_listing_text text)
RETURNS TABLE (listing_id uuid, profile_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.id, l.profile_id FROM public.service_listings l
   WHERE _listing_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND l.id = _listing_text::uuid;
$$;
REVOKE ALL ON FUNCTION public.service_listings_media_owner(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.service_listings_media_owner(text) TO authenticated;

-- --------------------------------------------- 6. RESTRICTIVE policy on listings -----
-- REVISIÓN 2 (separación marketplace / publicación participada):
-- La tabla SOLO deja leer filas a: cuenta con acceso activo, administrador, o el AUTOR
-- sobre SUS PROPIAS filas (necesario para editar/eliminar lo propio; no permite descubrir
-- nada ajeno). Los PARTICIPANTES ya NO leen la tabla directamente: abren ESA publicación
-- solo mediante get_service_listing_for_me(id). Así, sin pago, una consulta directa
-- (listado, paginación o por UUID) nunca devuelve publicaciones ajenas.
DROP POLICY IF EXISTS service_listings_premium_gate ON public.service_listings;
CREATE POLICY service_listings_premium_gate ON public.service_listings
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    (public.has_opportunities_access() AND status = 'published')
    OR public.is_platform_admin()
    OR profile_id = public.current_profile_id()
  );
DROP POLICY IF EXISTS service_listings_premium_gate_anon ON public.service_listings;
CREATE POLICY service_listings_premium_gate_anon ON public.service_listings
  AS RESTRICTIVE FOR SELECT TO anon USING (false);

-- 6b. MARKETPLACE: única fuente del listado general. Sin acceso (y sin ser admin)
-- devuelve 0 filas. Solo published, is_demo=false, de OTROS perfiles y en las que el
-- usuario NO participa (esas se abren con get_service_listing_for_me).
-- Devuelve jsonb: columnas de service_listings + author_name + author_avatar_url.
DROP FUNCTION IF EXISTS public.get_opportunities_market(text, int, int);
CREATE FUNCTION public.get_opportunities_market(
  _listing_type text DEFAULT NULL, _limit int DEFAULT 50, _offset int DEFAULT 0)
RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := public.current_profile_id();
BEGIN
  IF auth.uid() IS NULL OR me IS NULL
     OR NOT (public.has_opportunities_access() OR public.is_platform_admin()) THEN
    RETURN;                                                   -- 0 filas → la UI muestra la galaxia
  END IF;
  RETURN QUERY
    SELECT to_jsonb(l) || jsonb_build_object(
             'author_name', p.full_name,
             'author_avatar_url', p.avatar_url)
      FROM public.service_listings l
      LEFT JOIN public.profiles p ON p.id = l.profile_id
     WHERE l.status = 'published'
       AND NOT coalesce(l.is_demo, false)
       AND l.profile_id <> me
       AND (_listing_type IS NULL OR l.listing_type = _listing_type)
       AND NOT EXISTS (SELECT 1 FROM public.service_offers o
                        WHERE o.service_listing_id = l.id
                          AND me IN (o.buyer_profile_id, o.provider_profile_id, o.sender_profile_id))
       AND NOT EXISTS (SELECT 1 FROM public.service_contracts c
                        WHERE c.service_listing_id = l.id
                          AND me IN (c.buyer_profile_id, c.provider_profile_id))
       AND NOT EXISTS (SELECT 1 FROM public.service_messages m
                        WHERE m.service_listing_id = l.id
                          AND me IN (m.sender_profile_id, m.receiver_profile_id))
     ORDER BY l.created_at DESC
     LIMIT least(greatest(coalesce(_limit, 50), 1), 100)
     OFFSET greatest(coalesce(_offset, 0), 0);
END $$;
REVOKE ALL ON FUNCTION public.get_opportunities_market(text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_opportunities_market(text, int, int) TO authenticated;

-- 6c. Decisión única de "¿puedo ver ESTA publicación?" (detalle e imágenes).
-- Admin → autor o participante real en ESA publicación (cualquier estado) → Premium
-- (solo si la publicación está 'published'). El UUID por sí solo no concede nada.
CREATE OR REPLACE FUNCTION public.can_view_service_listing(_listing_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_profile_id() IS NOT NULL
     AND _listing_id IS NOT NULL
     AND (public.is_platform_admin()
          OR public.is_service_listing_participant(_listing_id)
          OR (public.has_opportunities_access()
              AND EXISTS (SELECT 1 FROM public.service_listings l
                           WHERE l.id = _listing_id AND l.status = 'published')));
$$;
REVOKE ALL ON FUNCTION public.can_view_service_listing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_service_listing(uuid) TO authenticated;

-- 6d. PUBLICACIÓN CONCRETA (contratación, chat, notificación, propuesta, historial).
-- Devuelve como máximo UNA fila y solo si can_view_service_listing(id). Conocer el UUID
-- no basta: sin pago y sin relación real → 0 filas (la UI trata 0 filas como "no
-- disponible"). No acepta filtros ni listas: no sirve para descubrir.
DROP FUNCTION IF EXISTS public.get_service_listing_for_me(uuid);
CREATE FUNCTION public.get_service_listing_for_me(_listing_id uuid)
RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_view_service_listing(_listing_id) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT to_jsonb(l) || jsonb_build_object(
             'author_name', p.full_name,
             'author_avatar_url', p.avatar_url)
      FROM public.service_listings l
      LEFT JOIN public.profiles p ON p.id = l.profile_id
     WHERE l.id = _listing_id
     LIMIT 1;
END $$;
REVOKE ALL ON FUNCTION public.get_service_listing_for_me(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_service_listing_for_me(uuid) TO authenticated;

-- 6e. IMÁGENES. Reemplaza SOLO la política de lectura del bucket de Oportunidades
-- (antes dependía de la RLS de la tabla, que ya no incluye a participantes). Ruta:
-- <profile>/<listing>/<kind>/<file>. Lee: dueño de la carpeta, o quien pueda ver ESA
-- publicación (premium/admin/participante) y la carpeta corresponde a su autor real.
-- No toca insert/delete ni otros buckets.
DROP POLICY IF EXISTS service_listing_media_select ON storage.objects;
CREATE POLICY service_listing_media_select ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'service-listing-media'
  AND (
    (storage.foldername(name))[1] = public.current_profile_id()::text
    OR EXISTS (
      SELECT 1 FROM public.service_listings_media_owner((storage.foldername(name))[2]) o
      WHERE o.profile_id::text = (storage.foldername(name))[1]
        AND public.can_view_service_listing(o.listing_id)
    )
  )
);

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
DECLARE cfg public.opportunities_access_config; prev text; prev_status text; result text;
BEGIN
  IF _profile_id IS NULL OR coalesce(_provider, '') = '' OR coalesce(_external_payment_id, '') = '' THEN
    RAISE EXCEPTION 'invalid_arguments';
  END IF;
  -- Aviso incompleto o con estado desconocido: rechazo controlado, sin suponer valores
  -- (nada de amount=4000, COP o live_mode=true por defecto) y sin crear acceso.
  IF _amount IS NULL OR coalesce(_currency, '') = '' OR _live_mode IS NULL
     OR _status IS NULL OR _status NOT IN ('pending', 'confirmed', 'failed', 'refunded') THEN
    RETURN 'rejected_invalid';
  END IF;
  -- Mismo bloqueo por pago que revoke_opportunities_access (siempre se toma PRIMERO,
  -- luego el de cuenta; revoke solo toma el de pago → sin interbloqueos).
  PERFORM pg_advisory_xact_lock(hashtextextended('opp_access_pay:' || _provider || ':' || _external_payment_id, 0));
  -- Serializa por cuenta: dos confirmaciones simultáneas no crean dos accesos.
  PERFORM pg_advisory_xact_lock(hashtextextended('opp_access:' || _profile_id::text, 0));

  -- Pago reembolsado/cancelado (aunque el reembolso llegara antes): rechazo permanente.
  -- Se audita el intento con el profile_id real; nunca se crea acceso.
  IF EXISTS (SELECT 1 FROM public.opportunities_access_payment_blocks
              WHERE payment_provider = _provider AND external_payment_id = _external_payment_id) THEN
    INSERT INTO public.opportunities_access_payments
      (profile_id, payment_provider, external_payment_id, amount, currency_code, status, live_mode, outcome)
    VALUES (_profile_id, _provider, _external_payment_id, _amount,
            upper(_currency), 'refunded', _live_mode, 'rejected_refunded')
    ON CONFLICT (payment_provider, external_payment_id)
    DO UPDATE SET status = 'refunded', outcome = 'rejected_refunded', received_at = now();
    RETURN 'rejected_refunded';
  END IF;

  SELECT outcome, status INTO prev, prev_status FROM public.opportunities_access_payments
   WHERE payment_provider = _provider AND external_payment_id = _external_payment_id
   FOR UPDATE;
  -- Un pago ya reembolsado nunca vuelve a activar acceso (reenvíos tardíos del proveedor).
  IF prev_status = 'refunded' THEN
    RETURN 'rejected_refunded';
  END IF;
  IF prev IS NOT NULL AND _status = 'confirmed' AND prev IN ('activated', 'already_active') THEN
    RETURN 'duplicate';                                     -- reintento del proveedor
  END IF;

  SELECT * INTO cfg FROM public.opportunities_access_config WHERE id;
  result := CASE
    WHEN _status <> 'confirmed' THEN 'recorded'
    WHEN cfg.amount IS NULL THEN 'rejected_no_config'
    WHEN NOT coalesce(_live_mode, false) THEN 'rejected_test_mode'
    WHEN upper(coalesce(_currency, '')) <> cfg.currency_code OR coalesce(_amount, 0) < cfg.amount THEN 'rejected_amount'
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

-- Reembolso/contracargo/cancelación: revoca (no borra). Solo servidor.
-- Garantía de orden de webhooks: el pago entra SIEMPRE en
-- opportunities_access_payment_blocks (no necesita perfil). Si ya existía fila de pago
-- (con su profile_id real) se marca 'refunded'; si no existía, NO se inserta ninguna
-- fila sin perfil. Una confirmación tardía del mismo (provider, external_payment_id)
-- es rechazada por activate_opportunities_access. Idempotente. Un pago NUEVO sí activa.
CREATE OR REPLACE FUNCTION public.revoke_opportunities_access(
  _provider text, _external_payment_id text, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(_provider, '') = '' OR coalesce(_external_payment_id, '') = '' THEN
    RAISE EXCEPTION 'invalid_arguments';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('opp_access_pay:' || _provider || ':' || _external_payment_id, 0));

  INSERT INTO public.opportunities_access_payment_blocks (payment_provider, external_payment_id, reason)
  VALUES (_provider, _external_payment_id, _reason)
  ON CONFLICT (payment_provider, external_payment_id) DO NOTHING;   -- idempotente

  UPDATE public.opportunities_access
     SET status = 'revoked', revoked_at = now(), revoke_reason = _reason, updated_at = now()
   WHERE payment_provider = _provider AND external_payment_id = _external_payment_id
     AND status = 'active';

  -- Solo actualiza filas existentes (ya tienen profile_id NOT NULL). Nunca inserta.
  UPDATE public.opportunities_access_payments
     SET status = 'refunded', outcome = 'rejected_refunded', received_at = now()
   WHERE payment_provider = _provider AND external_payment_id = _external_payment_id
     AND status <> 'refunded';
END $$;
REVOKE ALL ON FUNCTION public.revoke_opportunities_access(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_opportunities_access(text, text, text) TO service_role;

-- ------------------------------------------------------- 9. counts only --------------
-- Mismo gate que get_opportunities_market: sin Premium ni admin devuelve 0 / 0, para no
-- revelar el tamaño del mercado. Con acceso cuenta lo mismo que el mercado muestra
-- (publicadas, no demo, ajenas y no participadas). Sin datos individuales.
CREATE OR REPLACE FUNCTION public.get_opportunities_market_summary()
RETURNS TABLE (services_count bigint, job_offers_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := public.current_profile_id();
BEGIN
  IF me IS NULL OR NOT (public.has_opportunities_access() OR public.is_platform_admin()) THEN
    RETURN QUERY SELECT 0::bigint, 0::bigint;
    RETURN;
  END IF;
  RETURN QUERY
  SELECT count(*) FILTER (WHERE l.listing_type = 'offer'),
         count(*) FILTER (WHERE l.listing_type <> 'offer')
    FROM public.service_listings l
   WHERE l.status = 'published' AND NOT coalesce(l.is_demo, false)
     AND l.profile_id <> me
     AND NOT public.is_service_listing_participant(l.id);
END $$;
REVOKE ALL ON FUNCTION public.get_opportunities_market_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_opportunities_market_summary() TO authenticated;

COMMIT;
