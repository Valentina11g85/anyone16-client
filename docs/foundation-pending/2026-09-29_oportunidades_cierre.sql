-- AnyOne16 · Oportunidades — cierre (ratings, cancelación, disputa, seguridad).
-- Additive, safe to run more than once. Never deletes data. Keeps RLS enabled.
-- Does NOT touch favors, reviews, disputes, messages, offers of favors or Worker.
-- Requires 2026-09-29_oportunidades_negociacion.sql to have been run first.
-- Run in the Foundation SQL editor (owruupeffgvlfokgpswm).
--
-- Why not reuse public.reviews / public.disputes: both are bound to favors
-- (reviews insert policy + trigger require a completed favor_id; disputes.favor_id
-- is NOT NULL). Changing them would alter favor behaviour, so Oportunidades gets
-- its own minimal review table and records disputes on the contract + audit_logs.

-- 1. Contract lifecycle metadata ------------------------------------------------
ALTER TABLE public.service_contracts
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by_profile_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS disputed_at timestamptz,
  ADD COLUMN IF NOT EXISTS disputed_by_profile_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS dispute_reason text;

-- Status changes only through the RPC below (no arbitrary UPDATE from the browser).
DROP POLICY IF EXISTS service_contracts_update ON public.service_contracts;
REVOKE UPDATE ON public.service_contracts FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.transition_service_contract(
  _contract_id uuid, _status text, _reason text DEFAULT NULL)
RETURNS public.service_contracts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.service_contracts;
  me uuid := public.current_profile_id();
  target uuid;
  ttl text;
BEGIN
  SELECT * INTO c FROM public.service_contracts WHERE id = _contract_id FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'contract_not_found' USING ERRCODE = 'P0002'; END IF;
  IF me IS NULL OR me NOT IN (c.buyer_profile_id, c.provider_profile_id) THEN
    RAISE EXCEPTION 'not_a_participant' USING ERRCODE = '42501';
  END IF;
  IF NOT (
       (c.status = 'agreed' AND _status = 'confirmed')
    OR (c.status = 'confirmed' AND _status = 'in_progress')
    OR (c.status = 'in_progress' AND _status = 'completed')
    OR (c.status IN ('agreed','confirmed','in_progress') AND _status IN ('cancelled','disputed'))
  ) THEN
    RAISE EXCEPTION 'invalid_transition % -> %', c.status, _status USING ERRCODE = '22023';
  END IF;
  IF _status = 'disputed' AND coalesce(length(trim(_reason)), 0) < 5 THEN
    RAISE EXCEPTION 'dispute_reason_required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.service_contracts SET
    status = _status,
    updated_at = now(),
    completed_at = CASE WHEN _status = 'completed' THEN now() ELSE completed_at END,
    cancelled_at = CASE WHEN _status = 'cancelled' THEN now() ELSE cancelled_at END,
    cancelled_by_profile_id = CASE WHEN _status = 'cancelled' THEN me ELSE cancelled_by_profile_id END,
    disputed_at = CASE WHEN _status = 'disputed' THEN now() ELSE disputed_at END,
    disputed_by_profile_id = CASE WHEN _status = 'disputed' THEN me ELSE disputed_by_profile_id END,
    dispute_reason = CASE WHEN _status = 'disputed' THEN left(trim(_reason), 1000) ELSE dispute_reason END
  WHERE id = c.id
  RETURNING * INTO c;

  target := CASE WHEN me = c.buyer_profile_id THEN c.provider_profile_id ELSE c.buyer_profile_id END;
  ttl := CASE _status
    WHEN 'confirmed' THEN 'Contratación confirmada'
    WHEN 'in_progress' THEN 'Servicio iniciado'
    WHEN 'completed' THEN 'Servicio completado'
    WHEN 'cancelled' THEN 'Contrato cancelado'
    WHEN 'disputed' THEN 'Disputa abierta' END;
  INSERT INTO public.notifications(profile_id, type, title, body,
    related_service_listing_id, related_service_offer_id, is_demo)
  VALUES (target, 'service_contract_' || _status, ttl,
    CASE WHEN _status = 'disputed' THEN left(trim(_reason), 200) ELSE NULL END,
    c.service_listing_id, c.accepted_offer_id, false);

  INSERT INTO public.audit_logs(action, actor_profile_id, entity_type, entity_id, metadata, is_demo)
  VALUES ('service_contract_' || _status, me, 'service_contract', c.id,
    jsonb_build_object('reason', _reason), false);
  RETURN c;
END $$;
REVOKE EXECUTE ON FUNCTION public.transition_service_contract(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_service_contract(uuid, text, text) TO authenticated;

-- 2. Reviews for Oportunidades ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_contract_id uuid NOT NULL REFERENCES public.service_contracts(id),
  reviewer_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  reviewed_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  reviewer_role text NOT NULL CHECK (reviewer_role IN ('buyer','provider')),
  reviewer_name text,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text CHECK (comment IS NULL OR length(comment) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_contract_id, reviewer_profile_id),
  CHECK (reviewer_profile_id <> reviewed_profile_id)
);
GRANT SELECT ON public.service_reviews TO authenticated;
GRANT ALL ON public.service_reviews TO service_role;
ALTER TABLE public.service_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_reviews_select ON public.service_reviews;
CREATE POLICY service_reviews_select ON public.service_reviews FOR SELECT TO authenticated USING (true);
-- No INSERT/UPDATE/DELETE grants: reviews are only created through the RPC.

CREATE OR REPLACE FUNCTION public.submit_service_review(
  _contract_id uuid, _rating integer, _comment text DEFAULT NULL)
RETURNS public.service_reviews
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.service_contracts;
  me uuid := public.current_profile_id();
  r public.service_reviews;
  clean text := nullif(left(trim(coalesce(_comment, '')), 1000), '');
BEGIN
  SELECT * INTO c FROM public.service_contracts WHERE id = _contract_id;
  IF c.id IS NULL THEN RAISE EXCEPTION 'contract_not_found' USING ERRCODE = 'P0002'; END IF;
  IF me IS NULL OR me NOT IN (c.buyer_profile_id, c.provider_profile_id) THEN
    RAISE EXCEPTION 'not_a_participant' USING ERRCODE = '42501';
  END IF;
  IF c.status <> 'completed' THEN
    RAISE EXCEPTION 'contract_not_completed' USING ERRCODE = '22023';
  END IF;
  IF _rating IS NULL OR _rating < 1 OR _rating > 5 THEN
    RAISE EXCEPTION 'rating_must_be_1_to_5' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.service_reviews
             WHERE service_contract_id = c.id AND reviewer_profile_id = me) THEN
    RAISE EXCEPTION 'already_reviewed' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.service_reviews(service_contract_id, reviewer_profile_id, reviewed_profile_id,
    reviewer_role, reviewer_name, rating, comment)
  VALUES (c.id, me,
    CASE WHEN me = c.buyer_profile_id THEN c.provider_profile_id ELSE c.buyer_profile_id END,
    CASE WHEN me = c.buyer_profile_id THEN 'buyer' ELSE 'provider' END,
    (SELECT full_name FROM public.profiles WHERE id = me),
    _rating, clean)
  RETURNING * INTO r;

  INSERT INTO public.notifications(profile_id, type, title, body,
    related_service_listing_id, related_service_offer_id, is_demo)
  VALUES (r.reviewed_profile_id, 'service_review', 'Calificación recibida',
    _rating || '★', c.service_listing_id, c.accepted_offer_id, false);
  RETURN r;
END $$;
REVOKE EXECUTE ON FUNCTION public.submit_service_review(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_service_review(uuid, integer, text) TO authenticated;

-- Reputation aggregates computed in the database.
CREATE OR REPLACE FUNCTION public.get_service_reputation(_profile_ids uuid[])
RETURNS TABLE(profile_id uuid, average numeric, review_count integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT reviewed_profile_id, round(avg(rating)::numeric, 2), count(*)::int
  FROM public.service_reviews
  WHERE reviewed_profile_id = ANY(_profile_ids)
  GROUP BY reviewed_profile_id;
$$;
REVOKE EXECUTE ON FUNCTION public.get_service_reputation(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_service_reputation(uuid[]) TO authenticated;

-- 3. Proposal integrity ----------------------------------------------------------
-- Buyer/provider must match the listing author and the real sender; old proposals
-- can only change status, never amount, parties, kind or sender.
CREATE OR REPLACE FUNCTION public.service_offers_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.service_listings; me uuid := public.current_profile_id();
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF; -- service role / maintenance
  IF TG_OP = 'UPDATE' THEN
    IF NEW.offered_amount IS DISTINCT FROM OLD.offered_amount
       OR NEW.buyer_profile_id IS DISTINCT FROM OLD.buyer_profile_id
       OR NEW.provider_profile_id IS DISTINCT FROM OLD.provider_profile_id
       OR NEW.kind IS DISTINCT FROM OLD.kind
       OR NEW.sender_profile_id IS DISTINCT FROM OLD.sender_profile_id
       OR NEW.service_listing_id IS DISTINCT FROM OLD.service_listing_id THEN
      RAISE EXCEPTION 'offer_fields_immutable' USING ERRCODE = '42501';
    END IF;
    IF me NOT IN (OLD.buyer_profile_id, OLD.provider_profile_id) THEN
      RAISE EXCEPTION 'not_a_participant' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO l FROM public.service_listings WHERE id = NEW.service_listing_id;
  IF l.id IS NULL OR l.is_demo THEN RAISE EXCEPTION 'listing_not_available'; END IF;
  IF NEW.is_demo THEN RAISE EXCEPTION 'demo_offer_not_allowed'; END IF;
  IF l.listing_type = 'offer' THEN
    IF NEW.provider_profile_id IS DISTINCT FROM l.profile_id THEN
      RAISE EXCEPTION 'provider_must_be_listing_author' USING ERRCODE = '42501'; END IF;
    IF me <> l.profile_id AND NEW.buyer_profile_id IS DISTINCT FROM me THEN
      RAISE EXCEPTION 'buyer_must_be_sender' USING ERRCODE = '42501'; END IF;
  ELSE
    IF NEW.buyer_profile_id IS DISTINCT FROM l.profile_id THEN
      RAISE EXCEPTION 'buyer_must_be_listing_author' USING ERRCODE = '42501'; END IF;
    IF me <> l.profile_id AND NEW.provider_profile_id IS DISTINCT FROM me THEN
      RAISE EXCEPTION 'provider_must_be_sender' USING ERRCODE = '42501'; END IF;
  END IF;
  IF me = l.profile_id AND NOT EXISTS (
    SELECT 1 FROM public.service_offers o WHERE o.service_listing_id = l.id
      AND o.buyer_profile_id = NEW.buyer_profile_id
      AND o.provider_profile_id = NEW.provider_profile_id) THEN
    RAISE EXCEPTION 'author_can_only_counter_existing_negotiation' USING ERRCODE = '42501';
  END IF;
  IF NEW.buyer_profile_id = NEW.provider_profile_id THEN
    RAISE EXCEPTION 'cannot_hire_yourself' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS service_offers_guard_trg ON public.service_offers;
CREATE TRIGGER service_offers_guard_trg BEFORE INSERT OR UPDATE ON public.service_offers
FOR EACH ROW EXECUTE FUNCTION public.service_offers_guard();
