-- AnyOne16 · Legal, privacidad y cumplimiento.
-- PENDIENTE (no ejecutado). Ejecutar manualmente en el SQL Editor de Foundation (owruupeffgvlfokgpswm).
-- Aditivo y re-ejecutable. No borra datos. No toca Favores, pagos, webhook ni RLS existente.
-- Reutiliza: profiles, current_profile_id(), is_payment_admin() (rol admin en user_roles),
--            audit_logs y notifications. No existía ninguna estructura legal equivalente
--            (solo consent_given_at en verificaciones de trabajadores, que no se toca).
--
-- Aceptación: se registra server-side en la misma transacción que crea el perfil de la
-- cuenta nueva (trigger en profiles, lee las casillas enviadas como metadata del alta).
-- Sin IP ni user-agent. Mayoría de edad = consentimiento independiente.
--
-- Tablas nuevas:
--   legal_document_versions  versiones de cada documento (draft → published → archived)
--   legal_acceptances        aceptaciones/consentimientos, registradas SOLO por RPC (hora y versión del servidor)
--   privacy_requests         solicitudes del titular (acceso, rectificación, supresión, revocatoria, cuenta)
--   ip_assets                inventario de propiedad intelectual (solo admin)
--   compliance_items         checklist de cumplimiento (solo admin)

-- 0. Helper de admin -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_legal_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text = 'admin')
$$;
REVOKE ALL ON FUNCTION public.is_legal_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_legal_admin() TO authenticated;

-- 1. Documentos versionados ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.legal_document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type text NOT NULL CHECK (document_type IN (
    'terms', 'privacy_policy', 'data_treatment', 'cancellations_refunds',
    'platform_rules', 'intellectual_property', 'cookies')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
  version text NOT NULL CHECK (version ~ '^[0-9]+\.[0-9]+(\.[0-9]+)?$'),
  content text NOT NULL CHECK (char_length(content) >= 50),
  summary_of_changes text,
  language text NOT NULL DEFAULT 'es' CHECK (language IN ('es', 'en')),
  jurisdiction text NOT NULL DEFAULT 'CO' CHECK (jurisdiction ~ '^[A-Z]{2}$'),
  is_translation boolean NOT NULL DEFAULT false,
  requires_acceptance boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at timestamptz,
  effective_at timestamptz,
  retired_at timestamptz,
  created_by_profile_id uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_type, language, jurisdiction, version),
  CHECK (status = 'draft' OR published_at IS NOT NULL),
  CHECK (status <> 'archived' OR retired_at IS NOT NULL)
);
-- Una sola versión publicada vigente por documento + idioma + jurisdicción.
CREATE UNIQUE INDEX IF NOT EXISTS legal_one_published
  ON public.legal_document_versions (document_type, language, jurisdiction) WHERE status = 'published';

-- Lo publicado/archivado no se puede reescribir: solo se permite archivar.
CREATE OR REPLACE FUNCTION public.legal_versions_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'published_legal_version_is_permanent' USING ERRCODE = '42501'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'draft' AND (
       NEW.content IS DISTINCT FROM OLD.content OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.version IS DISTINCT FROM OLD.version OR NEW.document_type IS DISTINCT FROM OLD.document_type
    OR NEW.language IS DISTINCT FROM OLD.language OR NEW.jurisdiction IS DISTINCT FROM OLD.jurisdiction
    OR NEW.requires_acceptance IS DISTINCT FROM OLD.requires_acceptance) THEN
    RAISE EXCEPTION 'published_legal_version_is_immutable' USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'archived' AND NEW.status <> 'archived' THEN
    RAISE EXCEPTION 'archived_legal_version_is_final' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS legal_versions_guard_trg ON public.legal_document_versions;
CREATE TRIGGER legal_versions_guard_trg BEFORE UPDATE OR DELETE ON public.legal_document_versions
FOR EACH ROW EXECUTE FUNCTION public.legal_versions_guard();

-- 2. Aceptaciones ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  user_id uuid NOT NULL,
  consent_type text NOT NULL CHECK (consent_type IN (
    'terms', 'privacy_policy', 'data_treatment', 'age_confirmation', 'marketing', 'location')),
  document_version_id uuid REFERENCES public.legal_document_versions(id),
  document_version text,
  language text,
  jurisdiction text,
  granted boolean NOT NULL,                 -- false = revocatoria (queda como evento nuevo)
  source text NOT NULL CHECK (source IN ('signup', 'update_prompt', 'legal_center')),
  -- Sin IP ni user-agent: no son necesarios para probar la aceptación (usuario + versión + hora del servidor).
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Documentos exigen versión exacta; edad y opcionales no tienen documento.
  CHECK (consent_type IN ('age_confirmation', 'marketing', 'location') OR document_version_id IS NOT NULL),
  CHECK (consent_type NOT IN ('age_confirmation', 'marketing', 'location') OR document_version_id IS NULL),
  -- La edad y los documentos solo se otorgan; su revocatoria va por privacy_requests (no se borra nada).
  CHECK (granted OR consent_type IN ('marketing', 'location'))
);
-- Una sola aceptación por persona y versión exacta de documento.
CREATE UNIQUE INDEX IF NOT EXISTS legal_acceptances_one_per_version
  ON public.legal_acceptances (profile_id, document_version_id) WHERE document_version_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS legal_acceptances_profile_idx ON public.legal_acceptances (profile_id, consent_type, created_at DESC);
CREATE OR REPLACE FUNCTION public.legal_acceptances_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'legal_acceptances_are_append_only' USING ERRCODE = '42501'; END $$;
DROP TRIGGER IF EXISTS legal_acceptances_append_only_trg ON public.legal_acceptances;
CREATE TRIGGER legal_acceptances_append_only_trg BEFORE UPDATE OR DELETE ON public.legal_acceptances
FOR EACH ROW EXECUTE FUNCTION public.legal_acceptances_append_only();

-- 3. Solicitudes del titular -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.privacy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  request_type text NOT NULL CHECK (request_type IN (
    'access', 'rectification', 'deletion', 'revocation', 'complaint', 'account_deletion', 'other')),
  details text CHECK (details IS NULL OR char_length(details) <= 2000),
  status text NOT NULL DEFAULT 'received' CHECK (status IN (
    'received', 'in_review', 'resolved', 'rejected', 'cancelled')),
  resolution text CHECK (resolution IS NULL OR char_length(resolution) <= 2000),
  due_at timestamptz NOT NULL,              -- plazo orientativo (Ley 1581: 10/15 días hábiles); revisar con abogado
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status NOT IN ('resolved', 'rejected') OR (resolution IS NOT NULL AND resolved_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS privacy_requests_profile_idx ON public.privacy_requests (profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS privacy_requests_open_idx ON public.privacy_requests (status, due_at) WHERE status IN ('received', 'in_review');
-- Una sola solicitud de eliminación de cuenta abierta por persona.
CREATE UNIQUE INDEX IF NOT EXISTS privacy_requests_one_open_account_deletion
  ON public.privacy_requests (profile_id) WHERE request_type = 'account_deletion' AND status IN ('received', 'in_review');

-- 4. Propiedad intelectual y cumplimiento (solo admin) ------------------------------
CREATE TABLE IF NOT EXISTS public.ip_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_type text NOT NULL CHECK (asset_type IN ('software', 'trademark', 'logo', 'design', 'content', 'domain', 'other')),
  name text NOT NULL,
  description text,
  owner_name text,
  registration_status text NOT NULL DEFAULT 'not_registered'
    CHECK (registration_status IN ('not_registered', 'in_preparation', 'filed', 'registered', 'rejected')),
  registry text,                            -- DNDA, SIC, OMPI…
  filing_reference text,
  filed_at date,
  registered_at date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (registration_status <> 'registered' OR (filing_reference IS NOT NULL AND registered_at IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS public.compliance_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area text NOT NULL CHECK (area IN ('privacy', 'terms', 'ip', 'open_source', 'security', 'payments', 'minors', 'other')),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done', 'blocked')),
  owner text,
  due_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Permisos y RLS ----------------------------------------------------------------
GRANT SELECT ON public.legal_document_versions TO anon, authenticated;
GRANT SELECT ON public.legal_acceptances, public.privacy_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ip_assets, public.compliance_items TO authenticated;
GRANT ALL ON public.legal_document_versions, public.legal_acceptances, public.privacy_requests,
  public.ip_assets, public.compliance_items TO service_role;

ALTER TABLE public.legal_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ip_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_items ENABLE ROW LEVEL SECURITY;

-- Publicado/archivado es público (historial); los borradores solo los ve el admin.
DROP POLICY IF EXISTS legal_versions_read ON public.legal_document_versions;
CREATE POLICY legal_versions_read ON public.legal_document_versions FOR SELECT TO anon, authenticated
USING (status IN ('published', 'archived') OR public.is_legal_admin());

DROP POLICY IF EXISTS legal_acceptances_read ON public.legal_acceptances;
CREATE POLICY legal_acceptances_read ON public.legal_acceptances FOR SELECT TO authenticated
USING (profile_id = public.current_profile_id() OR public.is_legal_admin());

DROP POLICY IF EXISTS privacy_requests_read ON public.privacy_requests;
CREATE POLICY privacy_requests_read ON public.privacy_requests FOR SELECT TO authenticated
USING (profile_id = public.current_profile_id() OR public.is_legal_admin());

DROP POLICY IF EXISTS ip_assets_admin ON public.ip_assets;
CREATE POLICY ip_assets_admin ON public.ip_assets FOR ALL TO authenticated
USING (public.is_legal_admin()) WITH CHECK (public.is_legal_admin());
DROP POLICY IF EXISTS compliance_items_admin ON public.compliance_items;
CREATE POLICY compliance_items_admin ON public.compliance_items FOR ALL TO authenticated
USING (public.is_legal_admin()) WITH CHECK (public.is_legal_admin());

-- 6. RPCs de usuario ----------------------------------------------------------------
-- Versiones publicadas que la persona aún no ha aceptado (solo las que exigen aceptación).
CREATE OR REPLACE FUNCTION public.get_my_pending_legal(_language text DEFAULT 'es', _jurisdiction text DEFAULT 'CO')
RETURNS SETOF public.legal_document_versions
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT v.* FROM public.legal_document_versions v
  WHERE v.status = 'published' AND v.requires_acceptance
    AND v.document_type IN ('terms', 'privacy_policy', 'data_treatment')
    AND v.language = _language AND v.jurisdiction = _jurisdiction
    AND public.current_profile_id() IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.legal_acceptances a
      WHERE a.profile_id = public.current_profile_id() AND a.document_version_id = v.id AND a.granted)
  ORDER BY v.document_type
$$;
REVOKE ALL ON FUNCTION public.get_my_pending_legal(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_pending_legal(text, text) TO authenticated;

-- Núcleo común: registra versiones publicadas y/o la confirmación de edad para un perfil.
-- Versión, idioma, jurisdicción, tipo de documento, usuario y hora los decide SIEMPRE el servidor.
-- Interno: no se concede a ningún rol.
CREATE OR REPLACE FUNCTION public.legal_record_acceptances(
  _profile uuid, _user uuid, _version_ids uuid[], _confirm_age boolean, _source text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.legal_document_versions; n integer := 0;
BEGIN
  FOR v IN SELECT * FROM public.legal_document_versions WHERE id = ANY(coalesce(_version_ids, '{}')) LOOP
    IF v.status <> 'published' THEN RAISE EXCEPTION 'version_not_published' USING ERRCODE = '22023'; END IF;
    IF NOT v.requires_acceptance OR v.document_type NOT IN ('terms', 'privacy_policy', 'data_treatment') THEN CONTINUE; END IF;
    INSERT INTO public.legal_acceptances(profile_id, user_id, consent_type, document_version_id,
      document_version, language, jurisdiction, granted, source)
    VALUES (_profile, _user, v.document_type, v.id, v.version, v.language, v.jurisdiction, true, _source)
    ON CONFLICT (profile_id, document_version_id) WHERE document_version_id IS NOT NULL DO NOTHING;
    IF FOUND THEN n := n + 1; END IF;
  END LOOP;
  IF coalesce(_confirm_age, false) AND NOT EXISTS (
      SELECT 1 FROM public.legal_acceptances WHERE profile_id = _profile AND consent_type = 'age_confirmation') THEN
    INSERT INTO public.legal_acceptances(profile_id, user_id, consent_type, granted, source)
    VALUES (_profile, _user, 'age_confirmation', true, _source);
    n := n + 1;
  END IF;
  IF n > 0 THEN
    INSERT INTO public.audit_logs(action, actor_profile_id, entity_type, entity_id, metadata, is_demo)
    VALUES ('legal_accepted', _profile, 'profile', _profile,
      jsonb_build_object('versions', _version_ids, 'age', coalesce(_confirm_age, false), 'source', _source), false);
  END IF;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.legal_record_acceptances(uuid, uuid, uuid[], boolean, text) FROM PUBLIC, anon, authenticated;

-- Aceptación desde la app (actualizaciones o cuentas que aún no tienen todo registrado).
-- 'signup' NO se acepta desde el navegador: el registro lo hace el trigger de perfiles.
DROP FUNCTION IF EXISTS public.accept_legal_versions(uuid[], text, text);
CREATE OR REPLACE FUNCTION public.accept_legal_versions(
  _version_ids uuid[], _source text, _confirm_age boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := public.current_profile_id();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF _source NOT IN ('update_prompt', 'legal_center') THEN RAISE EXCEPTION 'invalid_source' USING ERRCODE = '22023'; END IF;
  RETURN public.legal_record_acceptances(me, auth.uid(), _version_ids, _confirm_age, _source);
END $$;
REVOKE ALL ON FUNCTION public.accept_legal_versions(uuid[], text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_legal_versions(uuid[], text, boolean) TO authenticated;

-- Registro en el alta: se ejecuta en la MISMA transacción en que Foundation crea el perfil
-- de la cuenta nueva (después de que Auth creó el usuario). Lee las casillas que el formulario
-- envió como metadata del usuario (legal_accept_terms, legal_accept_data_age, legal_marketing)
-- y registra SOLO lo marcado, contra las versiones PUBLICADAS en ese momento.
-- Nunca bloquea el alta: si falta algo, la cuenta queda sin aceptaciones obligatorias y
-- get_my_legal_status / has_required_legal la tratan como no habilitada hasta completarlas.
CREATE OR REPLACE FUNCTION public.legal_profiles_signup_consent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE meta jsonb; lang text; ids uuid[] := '{}';
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.user_id IS NOT DISTINCT FROM NEW.user_id THEN RETURN NEW; END IF;
  BEGIN
    SELECT coalesce(u.raw_user_meta_data, '{}'::jsonb) INTO meta FROM auth.users u WHERE u.id = NEW.user_id;
    IF meta IS NULL THEN RETURN NEW; END IF;
    lang := CASE WHEN NEW.language_code = 'en' THEN 'en' ELSE 'es' END;
    IF (meta->>'legal_accept_terms') = 'true' THEN
      ids := ids || ARRAY(SELECT id FROM public.legal_document_versions
        WHERE status = 'published' AND jurisdiction = 'CO' AND document_type IN ('terms', 'privacy_policy')
          AND language = coalesce((SELECT lang WHERE EXISTS (SELECT 1 FROM public.legal_document_versions x
            WHERE x.status = 'published' AND x.language = lang)), 'es'));
    END IF;
    IF (meta->>'legal_accept_data_age') = 'true' THEN
      ids := ids || ARRAY(SELECT id FROM public.legal_document_versions
        WHERE status = 'published' AND jurisdiction = 'CO' AND document_type = 'data_treatment'
          AND language = coalesce((SELECT lang WHERE EXISTS (SELECT 1 FROM public.legal_document_versions x
            WHERE x.status = 'published' AND x.language = lang)), 'es'));
    END IF;
    PERFORM public.legal_record_acceptances(NEW.id, NEW.user_id, ids,
      (meta->>'legal_accept_data_age') = 'true', 'signup');
    -- Comunicaciones comerciales: solo si se marcaron. Ausencia = no se registra nada.
    IF (meta->>'legal_marketing') = 'true' THEN
      INSERT INTO public.legal_acceptances(profile_id, user_id, consent_type, granted, source)
      VALUES (NEW.id, NEW.user_id, 'marketing', true, 'signup');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- No se rompe el alta; queda trazado y la cuenta sigue sin habilitar hasta aceptar.
    INSERT INTO public.audit_logs(action, actor_profile_id, entity_type, entity_id, metadata, is_demo)
    VALUES ('legal_signup_consent_failed', NEW.id, 'profile', NEW.id, jsonb_build_object('sqlstate', SQLSTATE), false);
  END;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.legal_profiles_signup_consent() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS legal_profiles_signup_consent_trg ON public.profiles;
CREATE TRIGGER legal_profiles_signup_consent_trg AFTER INSERT OR UPDATE OF user_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.legal_profiles_signup_consent();

-- ¿La cuenta tiene todo lo obligatorio? (versiones publicadas vigentes que exigen aceptación + edad).
-- Usable en RLS/RPCs futuras para impedir actuar como cuenta plenamente activa.
CREATE OR REPLACE FUNCTION public.has_required_legal(_profile uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _profile IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.legal_acceptances a WHERE a.profile_id = _profile AND a.consent_type = 'age_confirmation')
    AND NOT EXISTS (
      SELECT 1 FROM public.legal_document_versions v
      WHERE v.status = 'published' AND v.requires_acceptance AND v.jurisdiction = 'CO'
        AND v.document_type IN ('terms', 'privacy_policy', 'data_treatment')
        AND v.language = coalesce((SELECT CASE WHEN p.language_code = 'en' AND EXISTS (
              SELECT 1 FROM public.legal_document_versions x WHERE x.status = 'published' AND x.language = 'en')
            THEN 'en' END FROM public.profiles p WHERE p.id = _profile), 'es')
        AND NOT EXISTS (SELECT 1 FROM public.legal_acceptances a
          WHERE a.profile_id = _profile AND a.document_version_id = v.id))
$$;
REVOKE ALL ON FUNCTION public.has_required_legal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_required_legal(uuid) TO authenticated;

-- Estado legal propio: pendientes (versión exacta) + si falta confirmar mayoría de edad.
CREATE OR REPLACE FUNCTION public.get_my_legal_status()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := public.current_profile_id();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'complete', public.has_required_legal(me),
    'age_confirmed', EXISTS (SELECT 1 FROM public.legal_acceptances WHERE profile_id = me AND consent_type = 'age_confirmation'));
END $$;
REVOKE ALL ON FUNCTION public.get_my_legal_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_legal_status() TO authenticated;

-- Consentimientos opcionales (comunicaciones comerciales, ubicación): otorgar o revocar.
CREATE OR REPLACE FUNCTION public.set_optional_consent(_consent_type text, _granted boolean, _source text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := public.current_profile_id();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF _consent_type NOT IN ('marketing', 'location') THEN RAISE EXCEPTION 'invalid_consent_type'; END IF;
  IF _source NOT IN ('update_prompt', 'legal_center') THEN RAISE EXCEPTION 'invalid_source' USING ERRCODE = '22023'; END IF;
  -- Evento nuevo (otorgar o revocar); el historial nunca se modifica.
  INSERT INTO public.legal_acceptances(profile_id, user_id, consent_type, granted, source)
  VALUES (me, auth.uid(), _consent_type, _granted, _source);
  INSERT INTO public.audit_logs(action, actor_profile_id, entity_type, entity_id, metadata, is_demo)
  VALUES (CASE WHEN _granted THEN 'consent_granted' ELSE 'consent_revoked' END, me, 'profile', me,
    jsonb_build_object('consent', _consent_type), false);
END $$;
REVOKE ALL ON FUNCTION public.set_optional_consent(text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_optional_consent(text, boolean, text) TO authenticated;

-- Solicitud del titular. La eliminación de cuenta NO borra nada automáticamente:
-- queda en revisión porque contratos, pagos y auditoría deben conservarse por ley.
CREATE OR REPLACE FUNCTION public.submit_privacy_request(_request_type text, _details text DEFAULT NULL)
RETURNS public.privacy_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := public.current_profile_id(); r public.privacy_requests;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF (SELECT count(*) FROM public.privacy_requests WHERE profile_id = me AND created_at > now() - interval '1 day') >= 5 THEN
    RAISE EXCEPTION 'too_many_requests' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.privacy_requests(profile_id, request_type, details, due_at)
  VALUES (me, _request_type, nullif(left(trim(coalesce(_details, '')), 2000), ''),
    now() + CASE WHEN _request_type IN ('access', 'other') THEN interval '14 days' ELSE interval '21 days' END)
  RETURNING * INTO r;
  INSERT INTO public.audit_logs(action, actor_profile_id, entity_type, entity_id, metadata, is_demo)
  VALUES ('privacy_request_' || _request_type, me, 'privacy_request', r.id, '{}'::jsonb, false);
  INSERT INTO public.notifications(profile_id, type, title, body, is_demo)
  VALUES (me, 'privacy_request_received', 'Recibimos tu solicitud de privacidad', NULL, false);
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.submit_privacy_request(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_privacy_request(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_my_privacy_request(_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := public.current_profile_id();
BEGIN
  UPDATE public.privacy_requests SET status = 'cancelled', updated_at = now()
  WHERE id = _request_id AND profile_id = me AND status = 'received';
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_cancellable' USING ERRCODE = '22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.cancel_my_privacy_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_my_privacy_request(uuid) TO authenticated;

-- 7. RPCs de administración ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_save_legal_draft(
  _id uuid, _document_type text, _title text, _version text, _content text,
  _language text, _jurisdiction text, _requires_acceptance boolean,
  _is_translation boolean DEFAULT false, _summary text DEFAULT NULL)
RETURNS public.legal_document_versions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := public.current_profile_id(); v public.legal_document_versions;
BEGIN
  IF NOT public.is_legal_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  IF _id IS NULL THEN
    INSERT INTO public.legal_document_versions(document_type, title, version, content, language,
      jurisdiction, requires_acceptance, is_translation, summary_of_changes, created_by_profile_id)
    VALUES (_document_type, _title, _version, _content, _language, _jurisdiction,
      _requires_acceptance, _is_translation, _summary, me)
    RETURNING * INTO v;
  ELSE
    UPDATE public.legal_document_versions SET title = _title, version = _version, content = _content,
      requires_acceptance = _requires_acceptance, is_translation = _is_translation, summary_of_changes = _summary
    WHERE id = _id AND status = 'draft' RETURNING * INTO v;
    IF v.id IS NULL THEN RAISE EXCEPTION 'only_drafts_are_editable' USING ERRCODE = '42501'; END IF;
  END IF;
  INSERT INTO public.audit_logs(action, actor_profile_id, entity_type, entity_id, metadata, is_demo)
  VALUES ('legal_draft_saved', me, 'legal_document_version', v.id, jsonb_build_object('version', v.version), false);
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.admin_save_legal_draft(uuid, text, text, text, text, text, text, boolean, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_legal_draft(uuid, text, text, text, text, text, text, boolean, boolean, text) TO authenticated;

-- Publica un borrador y archiva atómicamente la versión vigente anterior.
CREATE OR REPLACE FUNCTION public.admin_publish_legal_version(_id uuid, _effective_at timestamptz DEFAULT NULL)
RETURNS public.legal_document_versions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := public.current_profile_id(); v public.legal_document_versions;
BEGIN
  IF NOT public.is_legal_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v FROM public.legal_document_versions WHERE id = _id FOR UPDATE;
  IF v.id IS NULL OR v.status <> 'draft' THEN RAISE EXCEPTION 'only_drafts_can_be_published' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('legal:' || v.document_type || v.language || v.jurisdiction));
  UPDATE public.legal_document_versions SET status = 'archived', retired_at = now()
  WHERE document_type = v.document_type AND language = v.language AND jurisdiction = v.jurisdiction AND status = 'published';
  UPDATE public.legal_document_versions SET status = 'published', published_at = now(),
    effective_at = coalesce(_effective_at, now())
  WHERE id = v.id RETURNING * INTO v;
  INSERT INTO public.audit_logs(action, actor_profile_id, entity_type, entity_id, metadata, is_demo)
  VALUES ('legal_version_published', me, 'legal_document_version', v.id,
    jsonb_build_object('type', v.document_type, 'version', v.version), false);
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.admin_publish_legal_version(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_publish_legal_version(uuid, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_privacy_request(_id uuid, _status text, _resolution text DEFAULT NULL)
RETURNS public.privacy_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := public.current_profile_id(); r public.privacy_requests;
BEGIN
  IF NOT public.is_legal_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM public.privacy_requests WHERE id = _id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'request_not_found' USING ERRCODE = 'P0002'; END IF;
  IF NOT ((r.status = 'received' AND _status IN ('in_review', 'resolved', 'rejected'))
       OR (r.status = 'in_review' AND _status IN ('resolved', 'rejected'))) THEN
    RAISE EXCEPTION 'invalid_transition' USING ERRCODE = '22023';
  END IF;
  IF _status IN ('resolved', 'rejected') AND coalesce(length(trim(_resolution)), 0) < 5 THEN
    RAISE EXCEPTION 'resolution_required' USING ERRCODE = '22023';
  END IF;
  UPDATE public.privacy_requests SET status = _status,
    resolution = CASE WHEN _status IN ('resolved', 'rejected') THEN left(trim(_resolution), 2000) ELSE resolution END,
    resolved_at = CASE WHEN _status IN ('resolved', 'rejected') THEN now() ELSE resolved_at END,
    updated_at = now()
  WHERE id = r.id RETURNING * INTO r;
  INSERT INTO public.notifications(profile_id, type, title, body, is_demo)
  VALUES (r.profile_id, 'privacy_request_' || _status,
    CASE _status WHEN 'in_review' THEN 'Tu solicitud de privacidad está en revisión'
      WHEN 'resolved' THEN 'Respondimos tu solicitud de privacidad' ELSE 'Tu solicitud de privacidad fue rechazada' END,
    CASE WHEN _status IN ('resolved', 'rejected') THEN left(trim(_resolution), 200) END, false);
  INSERT INTO public.audit_logs(action, actor_profile_id, entity_type, entity_id, metadata, is_demo)
  VALUES ('privacy_request_' || _status, me, 'privacy_request', r.id, '{}'::jsonb, false);
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.admin_update_privacy_request(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_privacy_request(uuid, text, text) TO authenticated;
