-- AnyOne16 · Oportunidades — minimal, additive changes for Foundation.
-- Safe to run more than once. Never deletes data. Keeps RLS enabled.
-- Run in the Foundation SQL editor (owruupeffgvlfokgpswm).

-- 1. Real author of each proposal (stamped server-side, never trusted from the browser)
ALTER TABLE public.service_offers
  ADD COLUMN IF NOT EXISTS sender_profile_id uuid REFERENCES public.profiles(id);

CREATE OR REPLACE FUNCTION public.service_offers_stamp_sender()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.sender_profile_id := public.current_profile_id();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS service_offers_stamp_sender_trg ON public.service_offers;
CREATE TRIGGER service_offers_stamp_sender_trg BEFORE INSERT ON public.service_offers
FOR EACH ROW EXECUTE FUNCTION public.service_offers_stamp_sender();

-- 2. Notifications: link to services (reuses the existing notifications table)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS related_service_listing_id uuid REFERENCES public.service_listings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS related_service_offer_id uuid REFERENCES public.service_offers(id) ON DELETE SET NULL;

-- Notifies the other party of a service negotiation; caller must be buyer or provider.
CREATE OR REPLACE FUNCTION public.notify_service_participant(
  _service_offer_id uuid, _type text, _title text, _body text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.service_offers; me uuid := public.current_profile_id(); target uuid;
BEGIN
  SELECT * INTO o FROM public.service_offers WHERE id = _service_offer_id;
  IF o.id IS NULL THEN RAISE EXCEPTION 'service offer not found'; END IF;
  IF me IS NULL OR me NOT IN (o.buyer_profile_id, o.provider_profile_id) THEN
    RAISE EXCEPTION 'not a participant';
  END IF;
  target := CASE WHEN me = o.buyer_profile_id THEN o.provider_profile_id ELSE o.buyer_profile_id END;
  IF target IS NULL THEN RETURN; END IF;
  INSERT INTO public.notifications(profile_id, type, title, body,
    related_service_listing_id, related_service_offer_id, is_demo)
  VALUES (target, _type, _title, _body, o.service_listing_id, o.id, false);
END $$;
REVOKE EXECUTE ON FUNCTION public.notify_service_participant(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_service_participant(uuid, text, text, text) TO authenticated;

-- 3. Chat for a service negotiation (messages.favor_id is NOT NULL, so favors chat can't be reused)
CREATE TABLE IF NOT EXISTS public.service_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_listing_id uuid NOT NULL REFERENCES public.service_listings(id) ON DELETE CASCADE,
  sender_profile_id uuid REFERENCES public.profiles(id),
  receiver_profile_id uuid REFERENCES public.profiles(id),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.service_messages TO authenticated;
GRANT ALL ON public.service_messages TO service_role;
ALTER TABLE public.service_messages ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS service_messages_stamp_sender_trg ON public.service_messages;
CREATE TRIGGER service_messages_stamp_sender_trg BEFORE INSERT ON public.service_messages
FOR EACH ROW EXECUTE FUNCTION public.service_offers_stamp_sender();

DROP POLICY IF EXISTS service_messages_select ON public.service_messages;
CREATE POLICY service_messages_select ON public.service_messages FOR SELECT TO authenticated
USING (sender_profile_id = public.current_profile_id() OR receiver_profile_id = public.current_profile_id());
DROP POLICY IF EXISTS service_messages_insert ON public.service_messages;
CREATE POLICY service_messages_insert ON public.service_messages FOR INSERT TO authenticated
WITH CHECK (receiver_profile_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.service_offers o
  WHERE o.service_listing_id = service_messages.service_listing_id
    AND public.current_profile_id() IN (o.buyer_profile_id, o.provider_profile_id)
    AND receiver_profile_id IN (o.buyer_profile_id, o.provider_profile_id)));

-- 4. Contract lifecycle after agreement (no payments)
CREATE TABLE IF NOT EXISTS public.service_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_listing_id uuid NOT NULL REFERENCES public.service_listings(id),
  accepted_offer_id uuid NOT NULL UNIQUE REFERENCES public.service_offers(id),
  buyer_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  provider_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  agreed_amount numeric NOT NULL,
  currency_code text NOT NULL,
  status text NOT NULL DEFAULT 'agreed'
    CHECK (status IN ('agreed','confirmed','in_progress','completed','cancelled','disputed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.service_contracts TO authenticated;
GRANT ALL ON public.service_contracts TO service_role;
ALTER TABLE public.service_contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_contracts_select ON public.service_contracts;
CREATE POLICY service_contracts_select ON public.service_contracts FOR SELECT TO authenticated
USING (public.current_profile_id() IN (buyer_profile_id, provider_profile_id));
DROP POLICY IF EXISTS service_contracts_insert ON public.service_contracts;
CREATE POLICY service_contracts_insert ON public.service_contracts FOR INSERT TO authenticated
WITH CHECK (public.current_profile_id() IN (buyer_profile_id, provider_profile_id) AND EXISTS (
  SELECT 1 FROM public.service_offers o WHERE o.id = accepted_offer_id AND o.status = 'accepted'
    AND o.buyer_profile_id = service_contracts.buyer_profile_id
    AND o.provider_profile_id = service_contracts.provider_profile_id));
DROP POLICY IF EXISTS service_contracts_update ON public.service_contracts;
CREATE POLICY service_contracts_update ON public.service_contracts FOR UPDATE TO authenticated
USING (public.current_profile_id() IN (buyer_profile_id, provider_profile_id))
WITH CHECK (public.current_profile_id() IN (buyer_profile_id, provider_profile_id));
