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
WITH a AS (SELECT pid FROM t WHERE label = 'AUTHOR')
INSERT INTO public.service_listings(profile_id, listing_type, title, description, status, is_demo)
SELECT a.pid, x.kind, 'TEST ' || x.kind, 'Detalle privado', 'published', false
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
  IF pg_temp.visible_as('PROPOSER') <> 1 THEN RAISE EXCEPTION 'TEST 4 FALLÓ (proponente: solo ESA publicación)'; END IF;
  IF pg_temp.visible_as('HIRED')    <> 1 THEN RAISE EXCEPTION 'TEST 5 FALLÓ (contratado: solo ESA publicación)'; END IF;
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

SELECT 'TODAS LAS PRUEBAS PASARON' AS resultado;
ROLLBACK;
