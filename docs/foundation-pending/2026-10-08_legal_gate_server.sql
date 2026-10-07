-- AnyOne16 · Gate legal centralizado (server-side).
-- PENDIENTE (no ejecutado). Ejecutar DESPUÉS de 2026-10-07_legal_privacidad.sql
-- (y, si se instalan, de las migraciones de Oportunidades y de Ganancias).
--
-- Qué hace: una cuenta autenticada SIN los consentimientos obligatorios vigentes
-- (Términos, Privacidad, Tratamiento de datos publicados + mayoría de edad) no puede
-- crear, modificar ni borrar actividad en las tablas protegidas, venga la escritura de
-- la app, de una RPC o de una llamada directa a la API.
--
-- Cómo: un trigger BEFORE INSERT/UPDATE/DELETE por tabla protegida. NO cambia RLS,
-- policies, RPCs ni reglas de negocio de Favores / Oportunidades / pagos / ganancias:
-- solo añade una condición transversal que se evalúa en la base de datos.
--   · Se evalúa con la identidad del JWT (auth.uid()), también dentro de RPCs SECURITY DEFINER.
--   · Escrituras del sistema (service_role: webhook de Mercado Pago, cron, SQL Editor,
--     auth.uid() NULL) no se bloquean: no actúan en nombre de un usuario.
--   · Los administradores también deben cumplir cuando actúan como usuarios (no hay excepción).
--   · Comunicaciones comerciales y ubicación NO cuentan.
-- Lo que sigue permitido a una cuenta incompleta: iniciar sesión, leer, ver documentos
-- públicos, aceptar lo pendiente, editar su perfil, marcar notificaciones, solicitudes de privacidad.
-- Re-ejecutable y aditivo. No borra datos.

-- 1. Función central ----------------------------------------------------------------
-- Reutiliza has_required_legal(profile) (definida en 2026-10-07_legal_privacidad.sql).
-- Sin parámetros: React no puede pasar un resultado ni otro perfil.
CREATE OR REPLACE FUNCTION public.has_required_legal_acceptances()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_required_legal(public.current_profile_id())
$$;
REVOKE ALL ON FUNCTION public.has_required_legal_acceptances() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_required_legal_acceptances() TO authenticated;

-- (has_required_legal(uuid) ya no se concede a authenticated en el SQL legal; se reafirma aquí.)
REVOKE EXECUTE ON FUNCTION public.has_required_legal(uuid) FROM authenticated;

-- 2. Trigger transversal --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.legal_enforce_gate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid;
BEGIN
  -- Sistema (sin usuario o con service_role): no actúa en nombre de una persona.
  IF auth.uid() IS NULL OR coalesce(auth.role(), '') = 'service_role' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  me := public.current_profile_id();
  -- Sin perfil: lo resuelven las RLS existentes (no se conceden permisos nuevos).
  IF me IS NOT NULL AND NOT public.has_required_legal(me) THEN
    RAISE EXCEPTION 'legal_acceptance_required'
      USING ERRCODE = '42501', HINT = 'Acepta los documentos legales vigentes para continuar.';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION public.legal_enforce_gate() FROM PUBLIC, anon, authenticated;

-- 3. Tablas protegidas (solo las que existan) -------------------------------------------
-- Favores: favors, offers, messages, reviews, disputes, favor_evidence.
-- Oportunidades: service_listings, service_offers, service_contracts, service_messages, service_reviews.
-- Ganancias: service_withdrawals, service_payout_methods.
-- NO protegidas a propósito: profiles, customer_profiles (alta/edición de cuenta), notifications,
-- legal_*, privacy_requests, favor_completion_codes/favor_code_attempts/location_updates
-- (continuidad de un servicio ya en curso), y las tablas de pagos (no se tocan).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['favors', 'offers', 'messages', 'reviews', 'disputes', 'favor_evidence',
    'service_listings', 'service_offers', 'service_contracts', 'service_messages', 'service_reviews',
    'service_withdrawals', 'service_payout_methods']
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS legal_gate_trg ON public.%I', t);
      EXECUTE format('CREATE TRIGGER legal_gate_trg BEFORE INSERT OR UPDATE OR DELETE ON public.%I
        FOR EACH ROW EXECUTE FUNCTION public.legal_enforce_gate()', t);
    ELSE
      RAISE NOTICE 'legal gate: tabla % no existe, se omite', t;
    END IF;
  END LOOP;
END $$;

-- 4. Verificación (solo lectura): qué tablas quedaron protegidas.
--   SELECT event_object_table, string_agg(event_manipulation, ',')
--   FROM information_schema.triggers WHERE trigger_name = 'legal_gate_trg'
--   GROUP BY 1 ORDER BY 1;
