-- AnyOne16 · Pruebas del gate legal (A–H). PENDIENTE: ejecutar SOLO en el SQL Editor, DESPUÉS de
-- 2026-10-07_legal_privacidad.sql y 2026-10-08_legal_gate_server.sql.
-- Todo ocurre dentro de una transacción que termina en ROLLBACK: no deja usuarios, perfiles,
-- documentos ni aceptaciones. Si una prueba falla, aborta con 'TEST X FALLÓ'.
-- Usa una tabla temporal con el MISMO trigger del gate (no escribe en tablas reales) y al final
-- comprueba que el trigger esté instalado en las tablas protegidas reales.
BEGIN;

-- Documentos publicados de prueba (solo si no hay uno vigente de ese tipo).
DO $$
DECLARE d text;
BEGIN
  FOREACH d IN ARRAY ARRAY['terms', 'privacy_policy', 'data_treatment'] LOOP
    IF NOT EXISTS (SELECT 1 FROM public.legal_document_versions
                   WHERE document_type = d AND language = 'es' AND jurisdiction = 'CO' AND status = 'published') THEN
      INSERT INTO public.legal_document_versions(document_type, title, version, content, language, jurisdiction,
        requires_acceptance, status, published_at, effective_at)
      VALUES (d, 'TEST ' || d, '0.0.1', repeat('Texto de prueba. ', 10), 'es', 'CO', true, 'published', now(), now());
    END IF;
  END LOOP;
END $$;

-- Usuarios de prueba: A completo, B sin términos, C sin privacidad, D sin tratamiento,
-- E sin mayoría de edad, F sin comerciales, G revocó comerciales.
CREATE TEMP TABLE t_users(label text PRIMARY KEY, uid uuid, pid uuid) ON COMMIT DROP;
INSERT INTO t_users(label, uid) SELECT l, gen_random_uuid() FROM unnest(ARRAY['A','B','C','D','E','F','G']) l;

INSERT INTO auth.users(id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
SELECT uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'legal-gate-test-' || lower(label) || '@example.invalid', '{}'::jsonb, now(), now()
FROM t_users;
INSERT INTO public.profiles(user_id, email, full_name, is_demo)
SELECT uid, 'legal-gate-test-' || lower(label) || '@example.invalid', 'Test ' || label, true FROM t_users
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = t_users.uid);
UPDATE t_users SET pid = p.id FROM public.profiles p WHERE p.user_id = t_users.uid;

-- Aceptaciones según el caso (como postgres, vía el núcleo interno).
DO $$
DECLARE u record; ids uuid[];
BEGIN
  FOR u IN SELECT * FROM t_users LOOP
    SELECT array_agg(id) INTO ids FROM public.legal_document_versions
    WHERE status = 'published' AND language = 'es' AND jurisdiction = 'CO' AND requires_acceptance
      AND document_type IN ('terms', 'privacy_policy', 'data_treatment')
      AND NOT (u.label = 'B' AND document_type = 'terms')
      AND NOT (u.label = 'C' AND document_type = 'privacy_policy')
      AND NOT (u.label = 'D' AND document_type = 'data_treatment');
    PERFORM public.legal_record_acceptances(u.pid, u.uid, ids, u.label <> 'E', 'legal_center');
    IF u.label = 'G' THEN
      INSERT INTO public.legal_acceptances(profile_id, user_id, consent_type, granted, source)
      VALUES (u.pid, u.uid, 'marketing', true, 'signup'), (u.pid, u.uid, 'marketing', false, 'legal_center');
    END IF;
  END LOOP;
END $$;

-- Tabla temporal protegida por el mismo trigger.
CREATE TEMP TABLE t_gate(id serial PRIMARY KEY, v text) ON COMMIT DROP;
CREATE TRIGGER legal_gate_trg BEFORE INSERT OR UPDATE OR DELETE ON t_gate
FOR EACH ROW EXECUTE FUNCTION public.legal_enforce_gate();
GRANT ALL ON t_gate, t_gate_id_seq, t_users TO authenticated;

-- Ejecuta un INSERT como el usuario indicado y devuelve si fue permitido.
CREATE OR REPLACE FUNCTION pg_temp.try_as(_label text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE u uuid; ok boolean := true;
BEGIN
  SELECT uid INTO u FROM t_users WHERE label = _label;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', u::text, true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    INSERT INTO t_gate(v) VALUES (_label);
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM LIKE '%legal_acceptance_required%' THEN ok := false; ELSE RAISE; END IF;
  END;
  PERFORM set_config('role', 'postgres', true);
  RETURN ok;
END $$;

DO $$
BEGIN
  IF NOT pg_temp.try_as('A') THEN RAISE EXCEPTION 'TEST A FALLÓ: cuenta completa bloqueada'; END IF;
  IF pg_temp.try_as('B') THEN RAISE EXCEPTION 'TEST B FALLÓ: sin términos pudo escribir'; END IF;
  IF pg_temp.try_as('C') THEN RAISE EXCEPTION 'TEST C FALLÓ: sin privacidad pudo escribir'; END IF;
  IF pg_temp.try_as('D') THEN RAISE EXCEPTION 'TEST D FALLÓ: sin tratamiento pudo escribir'; END IF;
  IF pg_temp.try_as('E') THEN RAISE EXCEPTION 'TEST E FALLÓ: sin mayoría de edad pudo escribir'; END IF;
  IF NOT pg_temp.try_as('F') THEN RAISE EXCEPTION 'TEST F FALLÓ: sin comerciales quedó bloqueada'; END IF;
  IF NOT pg_temp.try_as('G') THEN RAISE EXCEPTION 'TEST G FALLÓ: revocar comerciales la bloqueó'; END IF;
  RAISE NOTICE 'A–G OK';
END $$;

-- H. Intento directo: el gate está instalado en las tablas protegidas reales que existan.
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(t, ', ') INTO missing
  FROM unnest(ARRAY['favors', 'offers', 'messages', 'reviews', 'disputes', 'favor_evidence',
    'service_listings', 'service_offers', 'service_contracts', 'service_messages', 'service_reviews',
    'service_withdrawals', 'service_payout_methods']) t
  WHERE to_regclass('public.' || t) IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgname = 'legal_gate_trg'
                    AND g.tgrelid = to_regclass('public.' || t) AND NOT g.tgisinternal);
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'TEST H FALLÓ: sin gate en %', missing; END IF;
  -- Y la función de estado no acepta parámetros desde el cliente.
  IF has_function_privilege('authenticated', 'public.has_required_legal(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST H FALLÓ: has_required_legal(uuid) expuesta a authenticated';
  END IF;
  IF has_function_privilege('anon', 'public.has_required_legal_acceptances()', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST H FALLÓ: anon puede consultar el gate';
  END IF;
  RAISE NOTICE 'H OK';
END $$;

ROLLBACK;
