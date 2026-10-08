-- AnyOne¹⁶ · Pruebas del acceso premium de Oportunidades. PENDIENTE — NO EJECUTADO.
-- Ejecutar SOLO después de 2026-10-08_oportunidades_premium_access.sql (y, si está instalado,
-- con los usuarios de prueba aceptando lo legal: el gate legal bloquea escrituras de
-- usuarios autenticados; aquí todas las escrituras se hacen como postgres).
-- Todo dentro de una transacción con ROLLBACK: no deja datos. Si algo falla: 'TEST N FALLÓ'.
-- Si la inserción de publicaciones falla por columnas obligatorias adicionales que no
-- usa la app, completar esas columnas según el diagnóstico (consulta 1).
BEGIN;

CREATE TEMP TABLE t(label text PRIMARY KEY, uid uuid, pid uuid, lid uuid) ON COMMIT DROP;
-- AUTHOR publica; PREMIUM pagó; PROPOSER envió propuesta; HIRED tiene contrato; NOBODY nada.
INSERT INTO t(label, uid) SELECT l, gen_random_uuid()
FROM unnest(ARRAY['AUTHOR','PREMIUM','PROPOSER','HIRED','NOBODY']) l;
INSERT INTO auth.users(id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
SELECT uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'opp-premium-' || lower(label) || '@example.invalid', '{}'::jsonb, now(), now() FROM t;
INSERT INTO public.profiles(user_id, email, full_name, is_demo)
SELECT uid, 'opp-premium-' || lower(label) || '@example.invalid', 'Test ' || label, true FROM t
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = t.uid);
UPDATE t SET pid = p.id FROM public.profiles p WHERE p.user_id = t.uid;

-- Dos publicaciones del AUTHOR (un servicio y una oferta de trabajo). is_demo=false: reales.
-- category_slug es NOT NULL en Foundation. Si tiene FK, se usa un slug que YA existe en la
-- tabla referenciada (preferente 'other', el valor por defecto de la app); si no tiene FK,
-- se usa 'other'. No se inventan categorías ni se insertan filas en catálogos.
CREATE TEMP TABLE test_cat(slug text) ON COMMIT DROP;
DO $cat$
DECLARE ref_tbl regclass; ref_col text; v text;
BEGIN
  SELECT c.confrelid::regclass, a2.attname INTO ref_tbl, ref_col
    FROM pg_constraint c
    JOIN pg_attribute a1 ON a1.attrelid = c.conrelid AND a1.attnum = c.conkey[1]
    JOIN pg_attribute a2 ON a2.attrelid = c.confrelid AND a2.attnum = c.confkey[1]
   WHERE c.conrelid = 'public.service_listings'::regclass AND c.contype = 'f'
     AND a1.attname = 'category_slug'
   LIMIT 1;
  IF ref_tbl IS NULL THEN
    v := 'other';
  ELSE
    EXECUTE format('SELECT %1$I::text FROM %2$s ORDER BY (%1$I::text = ''other'') DESC, %1$I LIMIT 1',
                   ref_col, ref_tbl) INTO v;
    IF v IS NULL THEN RAISE EXCEPTION 'PRECONDICIÓN TEST: % no tiene categorías', ref_tbl; END IF;
  END IF;
  INSERT INTO test_cat VALUES (v);
END $cat$;

-- Columnas obligatorias: se rellenan TODAS las que la app escribe siempre al publicar
-- (src/lib/opportunities-repo.ts → toRow), con valores mínimos y válidos para COP.
-- Comprobación previa: si Foundation tiene otra columna NOT NULL sin DEFAULT que este
-- INSERT no cubre, se detiene con un mensaje que la nombra (sin insertar nada).
DO $nn$
DECLARE missing text;
BEGIN
  SELECT string_agg(column_name, ', ' ORDER BY ordinal_position) INTO missing
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'service_listings'
     AND is_nullable = 'NO' AND column_default IS NULL
     AND is_identity = 'NO' AND is_generated = 'NEVER'
     AND column_name NOT IN ('profile_id','listing_type','title','description','category_slug',
       'price_amount','price_currency','price_type','availability','duration_minutes','modality',
       'country_code','city','zone','service_radius_km','language_codes','photos','portfolio',
       'status','is_demo','published_at');
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'PRECONDICIÓN TEST: service_listings exige columnas no cubiertas: %', missing;
  END IF;
END $nn$;

WITH a AS (SELECT pid FROM t WHERE label = 'AUTHOR')
INSERT INTO public.service_listings(
  profile_id, listing_type, title, description, category_slug,
  price_amount, price_currency, price_type, availability, duration_minutes, modality,
  country_code, city, zone, service_radius_km, language_codes, photos, portfolio,
  status, is_demo, published_at)
SELECT a.pid, x.kind, 'TEST ' || x.kind, 'Detalle privado', (SELECT slug FROM test_cat),
       50000, 'COP', 'service', '{"type":"all_week","note":"","duration":"60"}'::jsonb, 60, 'in_person',
       'CO', 'Bogotá', 'Test', 5, '["es"]'::jsonb, '[]'::jsonb, '[]'::jsonb,
       'published', false, now()
FROM a, (VALUES ('offer'), ('request')) x(kind);
UPDATE t SET lid = (SELECT id FROM public.service_listings
                    WHERE profile_id = (SELECT pid FROM t WHERE label = 'AUTHOR') AND listing_type = 'request');

-- PROPOSER: propuesta existente; HIRED: propuesta aceptada + contrato.
INSERT INTO public.service_offers(service_listing_id, buyer_profile_id, provider_profile_id, kind,
  offered_amount, currency_code, message, status)
SELECT (SELECT lid FROM t LIMIT 1), (SELECT pid FROM t WHERE label='AUTHOR'), pid, 'offer', 50000, 'COP', 'x',
       CASE label WHEN 'HIRED' THEN 'accepted' ELSE 'pending' END
FROM t WHERE label IN ('PROPOSER','HIRED');
INSERT INTO public.service_contracts(service_listing_id, accepted_offer_id, buyer_profile_id,
  provider_profile_id, agreed_amount, currency_code)
SELECT o.service_listing_id, o.id, o.buyer_profile_id, o.provider_profile_id, 50000, 'COP'
FROM public.service_offers o WHERE o.provider_profile_id = (SELECT pid FROM t WHERE label='HIRED');

-- 15. Pago confirmado (servidor) para PREMIUM.
DO $$ BEGIN
  IF public.activate_opportunities_access((SELECT pid FROM t WHERE label='PREMIUM'),
       'test', 'pay-1', 4000, 'COP', 'confirmed', true) <> 'activated' THEN RAISE EXCEPTION 'TEST 15 FALLÓ'; END IF;
  -- 12. Confirmación duplicada.
  IF public.activate_opportunities_access((SELECT pid FROM t WHERE label='PREMIUM'),
       'test', 'pay-1', 4000, 'COP', 'confirmed', true) <> 'duplicate' THEN RAISE EXCEPTION 'TEST 12 FALLÓ'; END IF;
  IF (SELECT count(*) FROM public.opportunities_access WHERE profile_id = (SELECT pid FROM t WHERE label='PREMIUM')) <> 1
    THEN RAISE EXCEPTION 'TEST 12b FALLÓ'; END IF;
  -- 13/14. Pago fallido y pendiente: no activan.
  IF public.activate_opportunities_access((SELECT pid FROM t WHERE label='NOBODY'),
       'test', 'pay-2', 4000, 'COP', 'failed', true) <> 'recorded' THEN RAISE EXCEPTION 'TEST 13 FALLÓ'; END IF;
  IF public.activate_opportunities_access((SELECT pid FROM t WHERE label='NOBODY'),
       'test', 'pay-3', 4000, 'COP', 'pending', true) <> 'recorded' THEN RAISE EXCEPTION 'TEST 14 FALLÓ'; END IF;
  -- 11. Precio manipulado / modo prueba: no activan.
  IF public.activate_opportunities_access((SELECT pid FROM t WHERE label='NOBODY'),
       'test', 'pay-4', 1, 'COP', 'confirmed', true) <> 'rejected_amount' THEN RAISE EXCEPTION 'TEST 11 FALLÓ'; END IF;
  IF public.activate_opportunities_access((SELECT pid FROM t WHERE label='NOBODY'),
       'test', 'pay-5', 4000, 'COP', 'confirmed', false) <> 'rejected_test_mode' THEN RAISE EXCEPTION 'TEST 11b FALLÓ'; END IF;
  IF EXISTS (SELECT 1 FROM public.opportunities_access WHERE profile_id = (SELECT pid FROM t WHERE label='NOBODY'))
    THEN RAISE EXCEPTION 'TEST 13-14 FALLÓ'; END IF;
END $$;

GRANT SELECT ON t TO authenticated, anon;

-- Helper: cuántas publicaciones TEST ve cada usuario.
CREATE OR REPLACE FUNCTION pg_temp.visible_as(_label text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', (SELECT uid FROM t WHERE label = _label), 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.service_listings WHERE title LIKE 'TEST %'
    AND profile_id = (SELECT pid FROM t WHERE label = 'AUTHOR');
  RESET ROLE;
  RETURN n;
END $$;

DO $$ BEGIN
  IF pg_temp.visible_as('NOBODY')   <> 0 THEN RAISE EXCEPTION 'TEST 1/6 FALLÓ (sin acceso ve publicaciones)'; END IF;
  IF pg_temp.visible_as('PREMIUM')  <> 2 THEN RAISE EXCEPTION 'TEST 2 FALLÓ (con acceso no ve ambas)'; END IF;
  IF pg_temp.visible_as('AUTHOR')   <> 2 THEN RAISE EXCEPTION 'TEST 3 FALLÓ (autor no ve las suyas)'; END IF;
  -- Revisión 2: participantes NO leen la tabla directamente (solo vía get_service_listing_for_me).
  IF pg_temp.visible_as('PROPOSER') <> 0 THEN RAISE EXCEPTION 'TEST 4 FALLÓ (proponente ve la tabla)'; END IF;
  IF pg_temp.visible_as('HIRED')    <> 0 THEN RAISE EXCEPTION 'TEST 5 FALLÓ (contratado ve la tabla)'; END IF;
END $$;

-- 7/8. Por ID directo y paginando, sin acceso: 0 filas.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT uid FROM t WHERE label='NOBODY'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.service_listings WHERE id = (SELECT lid FROM t LIMIT 1)) THEN
    RAISE EXCEPTION 'TEST 7 FALLÓ'; END IF;
  IF EXISTS (SELECT 1 FROM (SELECT id FROM public.service_listings
             WHERE profile_id = (SELECT pid FROM t WHERE label='AUTHOR') ORDER BY created_at LIMIT 50 OFFSET 0) s) THEN
    RAISE EXCEPTION 'TEST 8 FALLÓ'; END IF;
  -- 9. Imagen bloqueada: storage solo se lee si la publicación es visible.
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'service-listing-media'
             AND (storage.foldername(name))[1] = (SELECT pid FROM t WHERE label='AUTHOR')::text) THEN
    RAISE EXCEPTION 'TEST 9 FALLÓ'; END IF;
  -- 10. Activar desde el navegador: sin permiso.
  BEGIN
    PERFORM public.activate_opportunities_access((SELECT pid FROM t WHERE label='NOBODY'),
      'test', 'hack', 4000, 'COP', 'confirmed', true);
    RAISE EXCEPTION 'TEST 10 FALLÓ (pudo llamar activate)';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.opportunities_access(profile_id, amount, currency_code, payment_provider, external_payment_id)
    VALUES ((SELECT pid FROM t WHERE label='NOBODY'), 4000, 'COP', 'x', 'y');
    RAISE EXCEPTION 'TEST 10b FALLÓ (pudo insertar acceso)';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- 11b. Cambiar precio desde el navegador.
  BEGIN
    UPDATE public.opportunities_access_config SET amount = 1;
    IF (SELECT amount FROM public.opportunities_access_config) <> 4000 THEN RAISE EXCEPTION 'TEST 11c FALLÓ'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF (SELECT active FROM public.get_my_opportunities_access()) THEN RAISE EXCEPTION 'TEST 1b FALLÓ'; END IF;
END $$;
RESET ROLE;

-- 16. No autenticado.
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    IF EXISTS (SELECT 1 FROM public.service_listings WHERE title LIKE 'TEST %') THEN RAISE EXCEPTION 'TEST 16 FALLÓ'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;


-- ===== Revisión 2: marketplace vs publicación participada =====
CREATE OR REPLACE FUNCTION pg_temp.as_user(_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', (SELECT uid FROM t WHERE label = _label), 'role', 'authenticated')::text, true);
END $$;
-- PREPARACIÓN DE DATOS como postgres: sin JWT simulado (auth.uid() = NULL) y sin rol de
-- usuario. Llamar antes de CADA escritura de preparación posterior a una simulación.
CREATE OR REPLACE FUNCTION pg_temp.as_system() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RESET ROLE;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.market_count(_label text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  PERFORM pg_temp.as_user(_label); SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.get_opportunities_market(NULL, 100, 0) m
   WHERE m->>'profile_id' = (SELECT pid FROM t WHERE label='AUTHOR')::text;
  RESET ROLE; RETURN n;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.detail_count(_label text, _kind text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint; lid uuid;
BEGIN
  SELECT id INTO lid FROM public.service_listings
   WHERE profile_id = (SELECT pid FROM t WHERE label='AUTHOR') AND listing_type = _kind;
  PERFORM pg_temp.as_user(_label); SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.get_service_listing_for_me(lid);
  RESET ROLE; RETURN n;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.can_media(_label text, _kind text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE r boolean; lid uuid;
BEGIN
  SELECT id INTO lid FROM public.service_listings
   WHERE profile_id = (SELECT pid FROM t WHERE label='AUTHOR') AND listing_type = _kind;
  PERFORM pg_temp.as_user(_label); SET LOCAL ROLE authenticated;
  r := public.can_view_service_listing(lid);
  RESET ROLE; RETURN r;
END $$;

DO $$ BEGIN
  -- 17. Marketplace sin pago: 0 publicaciones ajenas (aunque participe en una).
  IF pg_temp.market_count('NOBODY')   <> 0 THEN RAISE EXCEPTION 'TEST 17a FALLÓ'; END IF;
  IF pg_temp.market_count('PROPOSER') <> 0 THEN RAISE EXCEPTION 'TEST 17b FALLÓ (participación desbloqueó marketplace)'; END IF;
  IF pg_temp.market_count('HIRED')    <> 0 THEN RAISE EXCEPTION 'TEST 17c FALLÓ (contratación desbloqueó marketplace)'; END IF;
  -- 18. El autor sin pago no ve sus propias publicaciones como tarjetas del marketplace.
  IF pg_temp.market_count('AUTHOR')   <> 0 THEN RAISE EXCEPTION 'TEST 18 FALLÓ'; END IF;
  -- 19. Con pago: ve ambas (servicio + oferta de trabajo) con una sola compra.
  IF pg_temp.market_count('PREMIUM')  <> 2 THEN RAISE EXCEPTION 'TEST 19 FALLÓ'; END IF;
  -- 20. Participante abre ESA publicación concreta.
  IF pg_temp.detail_count('PROPOSER','request') <> 1 THEN RAISE EXCEPTION 'TEST 20a FALLÓ'; END IF;
  IF pg_temp.detail_count('HIRED','request')    <> 1 THEN RAISE EXCEPTION 'TEST 20b FALLÓ'; END IF;
  -- 21. Bypass por UUID: participante pide OTRA publicación; ajeno pide cualquiera → 0.
  IF pg_temp.detail_count('PROPOSER','offer')   <> 0 THEN RAISE EXCEPTION 'TEST 21a FALLÓ (otra publicación por UUID)'; END IF;
  IF pg_temp.detail_count('NOBODY','request')   <> 0 THEN RAISE EXCEPTION 'TEST 21b FALLÓ (UUID sin relación)'; END IF;
  IF pg_temp.detail_count('PREMIUM','offer')    <> 1 THEN RAISE EXCEPTION 'TEST 21c FALLÓ (premium por UUID)'; END IF;
  -- 22. Imágenes: misma decisión que el detalle.
  IF NOT pg_temp.can_media('HIRED','request')   THEN RAISE EXCEPTION 'TEST 22a FALLÓ (participante sin imágenes)'; END IF;
  IF pg_temp.can_media('HIRED','offer')         THEN RAISE EXCEPTION 'TEST 22b FALLÓ (imágenes de otra publicación)'; END IF;
  IF pg_temp.can_media('NOBODY','request')      THEN RAISE EXCEPTION 'TEST 22c FALLÓ (imágenes sin acceso)'; END IF;
  -- 23. Revocación (reembolso): vuelve a 0 en marketplace.
  PERFORM pg_temp.as_system();
  PERFORM public.revoke_opportunities_access('test', 'pay-1', 'refund');
  IF pg_temp.market_count('PREMIUM')  <> 0 THEN RAISE EXCEPTION 'TEST 23 FALLÓ'; END IF;
  -- 24. Confirmación repetida tras revocación no reactiva por sí sola con el mismo pago.
  PERFORM pg_temp.as_system();
  IF public.activate_opportunities_access((SELECT pid FROM t WHERE label='PREMIUM'),
       'test', 'pay-1', 4000, 'COP', 'confirmed', true) = 'activated' THEN RAISE EXCEPTION 'TEST 24 FALLÓ'; END IF;
END $$;

-- =====================================================================================
-- ===== Revisión 5: reembolso antes de confirmación, resumen, propuestas, mensajes ====
-- =====================================================================================
-- Usuario nuevo EARLY (sin ningún pago previo). Escrituras como postgres.
SELECT pg_temp.as_system();
INSERT INTO t(label, uid) VALUES ('EARLY', gen_random_uuid());
INSERT INTO auth.users(id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
SELECT uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'opp-premium-early@example.invalid', '{}'::jsonb, now(), now() FROM t WHERE label = 'EARLY';
INSERT INTO public.profiles(user_id, email, full_name, is_demo)
SELECT uid, 'opp-premium-early@example.invalid', 'Test EARLY', true FROM t
 WHERE label = 'EARLY' AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = t.uid);
UPDATE t SET pid = p.id FROM public.profiles p WHERE p.user_id = t.uid AND t.label = 'EARLY';

-- Aceptaciones legales de TODOS los usuarios de prueba (mismo patrón que
-- 2026-10-08_legal_gate_tests.sql), para que las escrituras como usuario lleguen al gate
-- Premium y no se detengan en legal_acceptance_required. Firma real:
-- legal_record_acceptances(_profile uuid, _user uuid, _version_ids uuid[], _confirm_age boolean, _source text).
-- SQL dinámico: si el SQL legal no está instalado, se omite con NOTICE sin romper el archivo.
DO $$
DECLARE u record; ids uuid[]; d text;
BEGIN
  IF to_regprocedure('public.legal_record_acceptances(uuid,uuid,uuid[],boolean,text)') IS NULL
     OR to_regclass('public.legal_document_versions') IS NULL THEN
    RAISE NOTICE 'SQL legal no instalado: se omiten aceptaciones de prueba';
    RETURN;
  END IF;
  FOREACH d IN ARRAY ARRAY['terms', 'privacy_policy', 'data_treatment'] LOOP
    EXECUTE $q$
      INSERT INTO public.legal_document_versions(document_type, title, version, content, language, jurisdiction,
        requires_acceptance, status, published_at, effective_at)
      SELECT $1, 'TEST ' || $1, '0.0.1', repeat('Texto de prueba. ', 10), 'es', 'CO', true, 'published', now(), now()
      WHERE NOT EXISTS (SELECT 1 FROM public.legal_document_versions
                         WHERE document_type = $1 AND language = 'es' AND jurisdiction = 'CO' AND status = 'published')
    $q$ USING d;
  END LOOP;
  EXECUTE $q$
    SELECT array_agg(id) FROM public.legal_document_versions
     WHERE status = 'published' AND language = 'es' AND jurisdiction = 'CO' AND requires_acceptance
       AND document_type IN ('terms', 'privacy_policy', 'data_treatment')
  $q$ INTO ids;
  FOR u IN SELECT * FROM t LOOP
    EXECUTE 'SELECT public.legal_record_acceptances($1, $2, $3, true, ''legal_center'')'
      USING u.pid, u.uid, ids;
  END LOOP;
END $$;

-- R5-1 … R5-5: pagos (como postgres, igual que el webhook con service_role).
DO $$
DECLARE early uuid := (SELECT pid FROM t WHERE label = 'EARLY'); r text;
BEGIN
  -- R5-1. Reembolso ANTES de cualquier confirmación.
  PERFORM public.revoke_opportunities_access('test', 'pay-EARLY', 'refund');
  IF (SELECT count(*) FROM public.opportunities_access_payment_blocks
       WHERE payment_provider = 'test' AND external_payment_id = 'pay-EARLY') <> 1
    THEN RAISE EXCEPTION 'TEST R5-1a FALLÓ (no hay exactamente un bloqueo)'; END IF;
  IF EXISTS (SELECT 1 FROM public.opportunities_access_payments WHERE profile_id IS NULL)
    THEN RAISE EXCEPTION 'TEST R5-1b FALLÓ (pago con profile_id NULL)'; END IF;
  IF EXISTS (SELECT 1 FROM public.opportunities_access_payments
              WHERE payment_provider = 'test' AND external_payment_id = 'pay-EARLY')
    THEN RAISE EXCEPTION 'TEST R5-1c FALLÓ (el reembolso temprano insertó un pago)'; END IF;
  IF EXISTS (SELECT 1 FROM public.opportunities_access WHERE profile_id = early)
    THEN RAISE EXCEPTION 'TEST R5-1d FALLÓ (se creó acceso)'; END IF;

  -- R5-2. Confirmación tardía del mismo pago.
  r := public.activate_opportunities_access(early, 'test', 'pay-EARLY', 4000, 'COP', 'confirmed', true);
  IF r IS DISTINCT FROM 'rejected_refunded' THEN RAISE EXCEPTION 'TEST R5-2a FALLÓ (devolvió %)', r; END IF;
  IF EXISTS (SELECT 1 FROM public.opportunities_access WHERE profile_id = early)
    THEN RAISE EXCEPTION 'TEST R5-2b FALLÓ (confirmación tardía creó acceso)'; END IF;
  IF (SELECT count(*) FROM public.opportunities_access_payments
       WHERE payment_provider = 'test' AND external_payment_id = 'pay-EARLY'
         AND profile_id = early AND status = 'refunded' AND outcome = 'rejected_refunded') <> 1
    THEN RAISE EXCEPTION 'TEST R5-2c FALLÓ (falta pago auditado con perfil correcto y refunded)'; END IF;

  -- R5-3. Reembolso repetido: sin error, sin duplicados.
  PERFORM public.revoke_opportunities_access('test', 'pay-EARLY', 'refund');
  IF (SELECT count(*) FROM public.opportunities_access_payment_blocks
       WHERE payment_provider = 'test' AND external_payment_id = 'pay-EARLY') <> 1
    THEN RAISE EXCEPTION 'TEST R5-3a FALLÓ (bloqueo duplicado)'; END IF;
  IF (SELECT count(*) FROM public.opportunities_access_payments
       WHERE payment_provider = 'test' AND external_payment_id = 'pay-EARLY') <> 1
    THEN RAISE EXCEPTION 'TEST R5-3b FALLÓ (pago duplicado)'; END IF;

  -- R5-12. Avisos incompletos: rechazo controlado, sin acceso ni registro con valores supuestos.
  IF public.activate_opportunities_access(early, 'test', 'pay-INV1', NULL, 'COP', 'confirmed', true) <> 'rejected_invalid'
    THEN RAISE EXCEPTION 'TEST R5-12a FALLÓ (sin monto)'; END IF;
  IF public.activate_opportunities_access(early, 'test', 'pay-INV2', 4000, NULL, 'confirmed', true) <> 'rejected_invalid'
    THEN RAISE EXCEPTION 'TEST R5-12b FALLÓ (sin moneda)'; END IF;
  IF public.activate_opportunities_access(early, 'test', 'pay-INV3', 4000, 'COP', 'confirmed', NULL) <> 'rejected_invalid'
    THEN RAISE EXCEPTION 'TEST R5-12c FALLÓ (sin modo)'; END IF;
  IF public.activate_opportunities_access(early, 'test', 'pay-INV4', 4000, 'COP', 'weird', true) <> 'rejected_invalid'
    THEN RAISE EXCEPTION 'TEST R5-12d FALLÓ (estado desconocido)'; END IF;
  IF EXISTS (SELECT 1 FROM public.opportunities_access WHERE profile_id = early)
     OR EXISTS (SELECT 1 FROM public.opportunities_access_payments WHERE external_payment_id LIKE 'pay-INV%')
    THEN RAISE EXCEPTION 'TEST R5-12e FALLÓ (aviso incompleto dejó acceso o registro)'; END IF;

  -- R5-4. Pago NUEVO y distinto sí activa.
  r := public.activate_opportunities_access(early, 'test', 'pay-NEW', 4000, 'COP', 'confirmed', true);
  IF r IS DISTINCT FROM 'activated' THEN RAISE EXCEPTION 'TEST R5-4a FALLÓ (devolvió %)', r; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.opportunities_access
                  WHERE profile_id = early AND status = 'active' AND external_payment_id = 'pay-NEW')
    THEN RAISE EXCEPTION 'TEST R5-4b FALLÓ (no se creó acceso)'; END IF;

  -- R5-5. El pago bloqueado sigue rechazado y no altera el acceso vigente.
  r := public.activate_opportunities_access(early, 'test', 'pay-EARLY', 4000, 'COP', 'confirmed', true);
  IF r IS DISTINCT FROM 'rejected_refunded' THEN RAISE EXCEPTION 'TEST R5-5a FALLÓ (devolvió %)', r; END IF;
  IF (SELECT external_payment_id FROM public.opportunities_access WHERE profile_id = early) <> 'pay-NEW'
    THEN RAISE EXCEPTION 'TEST R5-5b FALLÓ (pay-EARLY tomó el acceso)'; END IF;
  -- R5-5c. Revocar pay-NEW y reintentar pay-EARLY: nunca reactiva.
  PERFORM public.revoke_opportunities_access('test', 'pay-NEW', 'refund');
  r := public.activate_opportunities_access(early, 'test', 'pay-EARLY', 4000, 'COP', 'confirmed', true);
  IF r IS DISTINCT FROM 'rejected_refunded'
     OR EXISTS (SELECT 1 FROM public.opportunities_access WHERE profile_id = early AND status = 'active')
    THEN RAISE EXCEPTION 'TEST R5-5c FALLÓ (pay-EARLY reactivó Premium)'; END IF;
  -- Deja a EARLY con Premium para R5-6 (pago nuevo, otro id).
  r := public.activate_opportunities_access(early, 'test', 'pay-NEW-2', 4000, 'COP', 'confirmed', true);
  IF r IS DISTINCT FROM 'activated' THEN RAISE EXCEPTION 'TEST R5-5d FALLÓ (devolvió %)', r; END IF;
END $$;

-- R5-1e. La tabla de bloqueos no es legible ni escribible por usuarios normales.
SELECT pg_temp.as_user('NOBODY');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.opportunities_access_payment_blocks)
    THEN RAISE EXCEPTION 'TEST R5-1e FALLÓ (usuario lee bloqueos)'; END IF;
  BEGIN
    INSERT INTO public.opportunities_access_payment_blocks(payment_provider, external_payment_id) VALUES ('x','y');
    RAISE EXCEPTION 'TEST R5-1f FALLÓ (usuario inserta bloqueos)';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.revoke_opportunities_access('test', 'pay-NEW-2', 'hack');
    RAISE EXCEPTION 'TEST R5-1g FALLÓ (usuario llama revoke)';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

-- R5-6. Resumen del mercado: mismo gate y mismos conteos que get_opportunities_market.
CREATE OR REPLACE FUNCTION pg_temp.summary_vs_market(_label text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE s_off bigint; s_req bigint; m_off bigint := 0; m_req bigint := 0;
        p_off bigint; p_req bigint; n bigint; o int := 0;
BEGIN
  PERFORM pg_temp.as_user(_label); SET LOCAL ROLE authenticated;
  SELECT services_count, job_offers_count INTO s_off, s_req FROM public.get_opportunities_market_summary();
  LOOP
    SELECT count(*) FILTER (WHERE x.j->>'listing_type' = 'offer'),
           count(*) FILTER (WHERE x.j->>'listing_type' <> 'offer'), count(*)
      INTO p_off, p_req, n
      FROM public.get_opportunities_market(NULL, 100, o) AS x(j);
    m_off := m_off + p_off; m_req := m_req + p_req;
    EXIT WHEN n < 100;
    o := o + 100;
  END LOOP;
  RESET ROLE;
  RETURN s_off || '/' || s_req || '=' || m_off || '/' || m_req;
END $$;

DO $$
DECLARE r text;
BEGIN
  -- Sin Premium: 0/0 (aunque sea autor o participante).
  FOREACH r IN ARRAY ARRAY['NOBODY','PROPOSER','HIRED','AUTHOR','PREMIUM'] LOOP  -- PREMIUM fue revocado en 23
    IF split_part(pg_temp.summary_vs_market(r), '=', 1) <> '0/0'
      THEN RAISE EXCEPTION 'TEST R5-6a FALLÓ (% sin Premium ve conteos)', r; END IF;
  END LOOP;
  -- Con Premium: resumen idéntico al mercado real.
  r := pg_temp.summary_vs_market('EARLY');
  IF split_part(r, '=', 1) <> split_part(r, '=', 2)
    THEN RAISE EXCEPTION 'TEST R5-6b FALLÓ (resumen % ≠ mercado %)', split_part(r,'=',1), split_part(r,'=',2); END IF;
  IF split_part(r, '=', 1) = '0/0'
    THEN RAISE EXCEPTION 'TEST R5-6c FALLÓ (Premium no ve las 2 publicaciones TEST)'; END IF;
END $$;

-- R5-7. Propuestas (trigger opportunities_offer_access_guard).
-- Solo cuenta como FALLO el error 'opportunities_access_required' cuando debía permitirse;
-- otros rechazos (p. ej. políticas propias de service_offers) se informan con NOTICE,
-- porque esas políticas NO se modifican aquí.
CREATE OR REPLACE FUNCTION pg_temp.try_offer(_label text, _kind text) RETURNS text LANGUAGE plpgsql AS $$
-- Roles según las reglas EXISTENTES (service_offers_guard):
--   servicio ofrecido (listing_type='offer'): provider = AUTHOR, buyer = quien envía.
--   oferta de trabajo (listing_type='request'): buyer = AUTHOR, provider = quien envía.
--   el AUTHOR contraoferta a la contraparte existente (PROPOSER). sender lo fija el trigger.
DECLARE lid uuid; me uuid; author uuid; other uuid; b uuid; pr uuid;
BEGIN
  PERFORM pg_temp.as_system();
  SELECT id, profile_id INTO lid, author FROM public.service_listings
   WHERE profile_id = (SELECT pid FROM t WHERE label='AUTHOR') AND listing_type = _kind;
  me := (SELECT pid FROM t WHERE label = _label);
  other := CASE WHEN me = author THEN (SELECT pid FROM t WHERE label='PROPOSER') ELSE me END;
  IF _kind = 'offer' THEN b := other; pr := author; ELSE b := author; pr := other; END IF;
  PERFORM pg_temp.as_user(_label); SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.service_offers(service_listing_id, buyer_profile_id, provider_profile_id,
      kind, offered_amount, currency_code, message, status)
    VALUES (lid, b, pr, CASE WHEN me = author THEN 'counter' ELSE 'offer' END, 60000, 'COP', 'r5', 'pending');
    PERFORM pg_temp.as_system(); RETURN 'ok';
  EXCEPTION
    WHEN insufficient_privilege THEN
      PERFORM pg_temp.as_system();
      RETURN CASE WHEN SQLERRM LIKE '%opportunities_access_required%' THEN 'gate' ELSE 'other:' || SQLERRM END;
    WHEN OTHERS THEN PERFORM pg_temp.as_system(); RETURN 'other:' || SQLERRM;
  END;
END $$;

DO $$
DECLARE r text;
BEGIN
  -- a. Sin Premium, publicación ajena sin relación → bloqueado por el gate.
  r := pg_temp.try_offer('NOBODY', 'offer');
  IF r <> 'gate' THEN RAISE EXCEPTION 'TEST R5-7a FALLÓ (sin Premium pudo negociar: %)', r; END IF;
  -- b. Participante existente continúa (contraoferta en SU publicación).
  r := pg_temp.try_offer('PROPOSER', 'request');
  IF r = 'gate' THEN RAISE EXCEPTION 'TEST R5-7b FALLÓ (participante bloqueado por el gate)'; END IF;
  IF r <> 'ok' THEN RAISE NOTICE 'R5-7b: rechazado por política existente de service_offers: %', r; END IF;
  -- c. Autor contraoferta.
  r := pg_temp.try_offer('AUTHOR', 'request');
  IF r = 'gate' THEN RAISE EXCEPTION 'TEST R5-7c FALLÓ (autor bloqueado por el gate)'; END IF;
  IF r <> 'ok' THEN RAISE NOTICE 'R5-7c: rechazado por política existente de service_offers: %', r; END IF;
  -- d. Premium inicia una propuesta nueva.
  r := pg_temp.try_offer('EARLY', 'offer');
  IF r = 'gate' THEN RAISE EXCEPTION 'TEST R5-7d FALLÓ (Premium bloqueado por el gate)'; END IF;
  IF r <> 'ok' THEN RAISE NOTICE 'R5-7d: rechazado por política existente de service_offers: %', r; END IF;
  -- e. Participante en otra publicación no puede abrir negociación en la siguiente.
  r := pg_temp.try_offer('PROPOSER', 'offer');
  IF r <> 'gate' THEN RAISE EXCEPTION 'TEST R5-7e FALLÓ (participación abrió otra publicación: %)', r; END IF;
END $$;

-- R5-8. Mensajes: el SQL premium no toca service_messages. Se comprueba que no existen
-- triggers/políticas creadas por él y que un mensaje existente sigue legible por ambos
-- participantes (con las políticas actuales, sean cuales sean).
-- Preparación como postgres (sin JWT: legal gate no aplica). El trigger que registra el
-- remitente lo deja en NULL sin JWT, así que se fija después con UPDATE (sin tocar triggers).
SELECT pg_temp.as_system();
INSERT INTO public.service_messages(service_listing_id, receiver_profile_id, body)
SELECT (SELECT lid FROM t LIMIT 1), (SELECT pid FROM t WHERE label='HIRED'), 'r5-msg';
UPDATE public.service_messages SET sender_profile_id = (SELECT pid FROM t WHERE label='AUTHOR')
 WHERE body = 'r5-msg' AND service_listing_id = (SELECT lid FROM t LIMIT 1);
DO $$
DECLARE n bigint; lbl text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='service_messages'
              AND (policyname ILIKE '%premium%' OR policyname ILIKE 'opportunities_%'))
    THEN RAISE EXCEPTION 'TEST R5-8a FALLÓ (política premium en service_messages)'; END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.service_messages'::regclass
              AND tgname ILIKE 'opportunities_%')
    THEN RAISE EXCEPTION 'TEST R5-8b FALLÓ (trigger premium en service_messages)'; END IF;
  FOREACH lbl IN ARRAY ARRAY['AUTHOR','HIRED'] LOOP   -- HIRED no tiene Premium
    PERFORM pg_temp.as_user(lbl); SET LOCAL ROLE authenticated;
    SELECT count(*) INTO n FROM public.service_messages WHERE body = 'r5-msg';
    RESET ROLE;
    IF n <> 1 THEN RAISE EXCEPTION 'TEST R5-8c FALLÓ (% no lee su mensaje)', lbl; END IF;
  END LOOP;
END $$;

-- R5-9. Privacidad de la tabla y por UUID (complementa 1–8 y 20–21).
DO $$ BEGIN
  IF pg_temp.visible_as('NOBODY') <> 0 THEN RAISE EXCEPTION 'TEST R5-9a FALLÓ'; END IF;
  IF pg_temp.detail_count('NOBODY','offer') <> 0 THEN RAISE EXCEPTION 'TEST R5-9b FALLÓ (UUID sin relación)'; END IF;
  IF pg_temp.detail_count('HIRED','request') <> 1 THEN RAISE EXCEPTION 'TEST R5-9c FALLÓ (participante)'; END IF;
END $$;

-- R5-9d. Premium ve LAS DOS publicaciones de prueba (identificadas por el AUTHOR de la tabla t).
-- No exige que el marketplace completo tenga 2: Foundation puede tener publicaciones reales.
SELECT pg_temp.as_system();
DO $$
DECLARE v_ids uuid[]; v_test_count bigint;
BEGIN
  SELECT array_agg(id) INTO v_ids FROM public.service_listings
   WHERE profile_id = (SELECT pid FROM t WHERE label = 'AUTHOR');
  IF coalesce(array_length(v_ids, 1), 0) <> 2 THEN
    RAISE EXCEPTION 'TEST R5-9d FALLÓ (precondición: se esperaban 2 publicaciones de prueba, hay %)', coalesce(array_length(v_ids, 1), 0);
  END IF;
  PERFORM pg_temp.as_user('EARLY'); SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_test_count FROM public.get_opportunities_market(NULL, 100, 0) m
   WHERE (m->>'id')::uuid = ANY (v_ids);
  RESET ROLE;
  IF v_test_count <> 2 THEN
    RAISE EXCEPTION 'TEST R5-9d FALLÓ (Premium no ve las 2 publicaciones de prueba). EARLY ve % de 2', v_test_count;
  END IF;
END $$;
SELECT pg_temp.as_system();

-- R5-13. Premium solo abre publicaciones 'published'; dueño y participante no se rompen.
SELECT pg_temp.as_system();
UPDATE public.service_listings SET status = 'paused'
 WHERE profile_id = (SELECT pid FROM t WHERE label='AUTHOR');
DO $$ BEGIN
  IF pg_temp.detail_count('EARLY','offer')   <> 0 THEN RAISE EXCEPTION 'TEST R5-13a FALLÓ (Premium abre pausada)'; END IF;
  IF pg_temp.visible_as('EARLY')             <> 0 THEN RAISE EXCEPTION 'TEST R5-13b FALLÓ (Premium lee pausadas en la tabla)'; END IF;
  IF pg_temp.can_media('EARLY','offer')          THEN RAISE EXCEPTION 'TEST R5-13c FALLÓ (Premium ve fotos de pausada)'; END IF;
  IF pg_temp.detail_count('HIRED','request') <> 1 THEN RAISE EXCEPTION 'TEST R5-13d FALLÓ (participante perdió su publicación)'; END IF;
  IF pg_temp.visible_as('AUTHOR')            <> 2 THEN RAISE EXCEPTION 'TEST R5-13e FALLÓ (dueño perdió sus publicaciones)'; END IF;
END $$;
SELECT pg_temp.as_system();
UPDATE public.service_listings SET status = 'published'
 WHERE profile_id = (SELECT pid FROM t WHERE label='AUTHOR');

-- R5-10. Storage: objeto ficticio en la carpeta del autor (solo metadato, sin archivo;
-- se deshace con el ROLLBACK). Lectura real a través de la política de storage.objects.
SELECT pg_temp.as_system();
INSERT INTO storage.objects(bucket_id, name, owner)
SELECT 'service-listing-media',
       (SELECT pid FROM t WHERE label='AUTHOR')::text || '/' || l.id::text || '/photos/r5-' || l.listing_type || '.jpg',
       (SELECT uid FROM t WHERE label='AUTHOR')
  FROM public.service_listings l
 WHERE l.profile_id = (SELECT pid FROM t WHERE label='AUTHOR');
CREATE OR REPLACE FUNCTION pg_temp.media_rows(_label text, _kind text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  PERFORM pg_temp.as_user(_label); SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM storage.objects
   WHERE bucket_id = 'service-listing-media' AND name LIKE '%/photos/r5-' || _kind || '.jpg';
  RESET ROLE; RETURN n;
END $$;
DO $$ BEGIN
  IF pg_temp.media_rows('NOBODY','request') <> 0 THEN RAISE EXCEPTION 'TEST R5-10a FALLÓ (sin acceso lee imagen)'; END IF;
  IF pg_temp.media_rows('HIRED','request')  <> 1 THEN RAISE EXCEPTION 'TEST R5-10b FALLÓ (participante sin imagen)'; END IF;
  IF pg_temp.media_rows('HIRED','offer')    <> 0 THEN RAISE EXCEPTION 'TEST R5-10c FALLÓ (imagen de otra publicación)'; END IF;
  IF pg_temp.media_rows('EARLY','offer')    <> 1 THEN RAISE EXCEPTION 'TEST R5-10d FALLÓ (Premium sin imagen)'; END IF;
  IF pg_temp.media_rows('AUTHOR','offer')   <> 1 THEN RAISE EXCEPTION 'TEST R5-10e FALLÓ (autor sin su imagen)'; END IF;
  IF (SELECT public FROM storage.buckets WHERE id = 'service-listing-media') IS DISTINCT FROM false
    THEN RAISE EXCEPTION 'TEST R5-10f FALLÓ (bucket público o inexistente)'; END IF;
END $$;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'service-listing-media' AND name LIKE '%/photos/r5-%')
      THEN RAISE EXCEPTION 'TEST R5-10g FALLÓ (anónimo lee imágenes)'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

-- R5-11. Perfiles: profiles_select_own sigue existiendo y el SQL premium no añadió
-- políticas en profiles; el nombre/foto del autor llegan solo por las RPC nuevas.
DO $$
DECLARE j jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles'
                  AND policyname='profiles_select_own')
    THEN RAISE EXCEPTION 'TEST R5-11a FALLÓ (profiles_select_own no existe)'; END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles'
              AND (policyname ILIKE '%premium%' OR policyname ILIKE 'opportunities_%'))
    THEN RAISE EXCEPTION 'TEST R5-11b FALLÓ (política premium en profiles)'; END IF;
  PERFORM pg_temp.as_user('EARLY'); SET LOCAL ROLE authenticated;
  SELECT x INTO j FROM public.get_opportunities_market('offer', 100, 0) x
   WHERE x->>'profile_id' = (SELECT pid FROM t WHERE label='AUTHOR')::text;
  RESET ROLE;
  IF j IS NULL OR NOT (j ? 'author_name') OR NOT (j ? 'author_avatar_url')
    THEN RAISE EXCEPTION 'TEST R5-11c FALLÓ (RPC sin author_name/author_avatar_url)'; END IF;
END $$;

-- R7. Lectura DIRECTA de la tabla (no RPC) por usuarios sin Premium.
DO $$
DECLARE n bigint;
BEGIN
  -- R7a. NOBODY: SELECT directo de todo lo publicado → 0 filas ajenas.
  PERFORM pg_temp.as_user('NOBODY'); SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.service_listings WHERE status='published';
  RESET ROLE;
  IF n <> 0 THEN RAISE EXCEPTION 'TEST R7a FALLÓ (SELECT directo sin Premium ve %)', n; END IF;
  -- R7b. NOBODY: SELECT por UUID conocido → 0.
  PERFORM pg_temp.as_user('NOBODY'); SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.service_listings WHERE id=(SELECT lid FROM t WHERE label='AUTHOR');
  RESET ROLE;
  IF n <> 0 THEN RAISE EXCEPTION 'TEST R7b FALLÓ (UUID directo)'; END IF;
  -- R7c. HIRED (participante): SELECT directo por UUID → 0; la RPC concreta → 1.
  PERFORM pg_temp.as_user('HIRED'); SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.service_listings WHERE id=(SELECT lid FROM t WHERE label='AUTHOR');
  RESET ROLE;
  IF n <> 0 THEN RAISE EXCEPTION 'TEST R7c FALLÓ (participante lee la tabla directa)'; END IF;
  IF pg_temp.detail_count('HIRED','request') <> 1 THEN RAISE EXCEPTION 'TEST R7c2 FALLÓ'; END IF;
  -- R7d. Participación no desbloquea el mercado.
  IF pg_temp.market_count('HIRED') <> 0 OR pg_temp.market_count('PROPOSER') <> 0
    THEN RAISE EXCEPTION 'TEST R7d FALLÓ (participante ve mercado)'; END IF;
  -- R7e. NOBODY: mercado y resumen 0.
  IF pg_temp.market_count('NOBODY') <> 0 THEN RAISE EXCEPTION 'TEST R7e FALLÓ'; END IF;
  PERFORM pg_temp.as_user('NOBODY'); SET LOCAL ROLE authenticated;
  IF EXISTS (
    SELECT 1
    FROM public.get_opportunities_market_summary() s
    WHERE s.services_count <> 0
       OR s.job_offers_count <> 0
  ) THEN
    RESET ROLE;
    RAISE EXCEPTION 'TEST R7e2 FALLÓ (resumen sin Premium)';
  END IF;
  RESET ROLE;
  -- R7f. anon: nada.
  SET LOCAL ROLE anon;
  BEGIN
    SELECT count(*) INTO n FROM public.service_listings;
    IF n <> 0 THEN RESET ROLE; RAISE EXCEPTION 'TEST R7f FALLÓ (anon)'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  -- R7g. Dueño: sigue leyendo/gestionando lo suyo (Mis servicios / Mis solicitudes).
  IF pg_temp.visible_as('AUTHOR') <> 2 THEN RAISE EXCEPTION 'TEST R7g FALLÓ'; END IF;
END $$;
SELECT pg_temp.as_system();

SELECT 'TODAS LAS PRUEBAS PASARON' AS resultado;
ROLLBACK;
