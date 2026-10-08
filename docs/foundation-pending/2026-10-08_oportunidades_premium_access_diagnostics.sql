-- AnyOne¹⁶ · Diagnóstico de SOLO LECTURA antes del acceso premium de Oportunidades.
-- PENDIENTE — ejecutar en el SQL Editor de Foundation. No modifica nada.

-- 1. Columnas reales de las tablas de Oportunidades.
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('service_listings','service_offers','service_contracts','service_messages','service_reviews')
ORDER BY table_name, ordinal_position;

-- 2. RLS activado y políticas actuales (incluye storage de fotos).
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname LIKE 'service_%';

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE (schemaname = 'public' AND tablename LIKE 'service_%')
   OR (schemaname = 'storage' AND policyname LIKE 'service_listing_media%')
ORDER BY tablename, policyname;

-- 3. Permisos de tabla (¿anon puede leer service_listings?).
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name LIKE 'service_%'
  AND grantee IN ('anon','authenticated','public')
ORDER BY table_name, grantee, privilege_type;

-- 4. Vistas que leen service_listings (podrían saltarse RLS si no son security_invoker).
SELECT v.table_schema, v.table_name, c.reloptions
FROM information_schema.view_table_usage u
JOIN information_schema.views v ON v.table_schema = u.view_schema AND v.table_name = u.view_name
JOIN pg_class c ON c.relname = v.table_name
WHERE u.table_schema = 'public' AND u.table_name = 'service_listings';

-- 5. Funciones SECURITY DEFINER que mencionan service_listings y quién puede ejecutarlas.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef AS security_definer,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_exec,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND pg_get_functiondef(p.oid) ILIKE '%service_listings%'
ORDER BY p.proname;

-- 6. Tiempo real: ¿service_listings está publicado? (respeta RLS, pero conviene saberlo).
SELECT pubname, schemaname, tablename FROM pg_publication_tables
WHERE schemaname = 'public' AND tablename LIKE 'service_%';

-- 7. Bucket de fotos: privado y con las políticas esperadas.
SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'service-listing-media';

-- 8. Volumen (sin datos personales).
SELECT listing_type, status, coalesce(is_demo, false) AS is_demo, count(*)
FROM public.service_listings GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;

-- 9. Funciones auxiliares de las que depende la propuesta.
SELECT proname, prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND proname IN ('current_profile_id','is_platform_admin');

-- 10. ¿Ya existe algo con los nombres que propone el SQL?
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'opportunities_access%';
