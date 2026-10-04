-- AnyOne16 — Completion Code enforcement (hardening, non-destructive).
--
-- Problem: favors_field_guard let the favor OWNER update status to 'completed'
-- (and set completed_at) directly from the browser, skipping the Completion Code.
--
-- Fix: reuse the existing guard trigger. No new tables, no RLS changes, no new RPC.
--  * Nobody but a trusted server context may set status = 'completed' or touch
--    completed_at. The only trusted path is validate_favor_completion_code
--    (SECURITY DEFINER, runs as the function owner, so is_verification_service_writer()
--    is true inside it). Platform admins keep their existing dispute-resolution rights.
--  * Even the trusted path may only complete a favor that has an ACCEPTED offer
--    matching selected_offer_id and that is in an operational status
--    (never from draft/published/cancelled/disputed/already completed).
--  * selected_offer_id must point to an ACCEPTED offer of the same favor, and once
--    a worker is selected the owner cannot swap offer/worker from the browser.
-- validate_favor_completion_code itself is unchanged: it already checks auth,
-- favor existence, assigned worker = caller, cancelled/disputed/completed, locks the
-- code row FOR UPDATE (anti-replay / concurrent requests), marks it 'used', counts
-- failed attempts and writes audit_logs without storing the code.
-- Safe to run more than once.

CREATE OR REPLACE FUNCTION public.favors_field_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_owner BOOLEAN;
  v_status public.favor_status;
  v_guarded public.favors%ROWTYPE;
BEGIN
  -- Integrity checks that apply to EVERY caller, including the trusted RPC.
  IF NEW.status::TEXT = 'completed' AND OLD.status::TEXT <> 'completed' THEN
    IF OLD.status::TEXT NOT IN ('worker_selected','on_the_way','arrived','in_progress',
                                'near_destination','ready_for_confirmation','code_entered') THEN
      RAISE EXCEPTION 'favor_not_completable_from_%', OLD.status USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.selected_offer_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.offers o
      WHERE o.id = OLD.selected_offer_id AND o.favor_id = OLD.id AND o.status = 'accepted'
    ) THEN
      RAISE EXCEPTION 'completion_requires_accepted_offer' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF public.is_verification_service_writer() THEN RETURN NEW; END IF;

  NEW.id := OLD.id;
  NEW.owner_user_id := OLD.owner_user_id;
  NEW.customer_profile_id := OLD.customer_profile_id;
  NEW.is_demo := OLD.is_demo;
  NEW.created_at := OLD.created_at;

  v_owner := OLD.owner_user_id IS NOT NULL AND OLD.owner_user_id = auth.uid();

  IF NOT v_owner AND NOT public.is_platform_admin() THEN
    -- selected worker: only the operational status may move (never 'completed')
    v_status := NEW.status;
    IF v_status::TEXT NOT IN ('worker_selected','on_the_way','arrived','in_progress',
                              'near_destination','ready_for_confirmation') THEN
      RAISE EXCEPTION 'worker_status_not_allowed: % is not a worker-settable status', v_status
        USING ERRCODE = 'check_violation';
    END IF;
    v_guarded := OLD;
    v_guarded.status := v_status;
    v_guarded.updated_at := now();
    RETURN v_guarded;
  END IF;

  IF NOT public.is_platform_admin() THEN
    -- Completion only through validate_favor_completion_code.
    IF NEW.status::TEXT = 'completed' AND OLD.status::TEXT <> 'completed' THEN
      RAISE EXCEPTION 'completion_requires_code_validation' USING ERRCODE = 'check_violation';
    END IF;
    NEW.completed_at := OLD.completed_at;
    -- Once someone is chosen, the owner cannot swap the offer or worker from the browser.
    IF OLD.selected_offer_id IS NOT NULL THEN
      NEW.selected_offer_id := OLD.selected_offer_id;
      NEW.selected_worker_profile_id := OLD.selected_worker_profile_id;
    END IF;
  END IF;

  IF OLD.status = 'completed' AND NEW.status <> 'completed' AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'completed_favor_is_final' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'cancelled_favor_is_final' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'disputed' AND NEW.status <> 'disputed' AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'disputed_favor_requires_admin' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.selected_offer_id IS DISTINCT FROM OLD.selected_offer_id AND NEW.selected_offer_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.offers o
      WHERE o.id = NEW.selected_offer_id AND o.favor_id = OLD.id AND o.status = 'accepted'
    ) THEN
      RAISE EXCEPTION 'offer_does_not_belong_to_favor_or_not_accepted' USING ERRCODE = 'check_violation';
    END IF;
    -- The selected worker must be the one who made that offer.
    SELECT o.worker_profile_id INTO NEW.selected_worker_profile_id
    FROM public.offers o WHERE o.id = NEW.selected_offer_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger already exists (favors_field_guard_trg BEFORE UPDATE); recreate defensively.
DROP TRIGGER IF EXISTS favors_field_guard_trg ON public.favors;
CREATE TRIGGER favors_field_guard_trg BEFORE UPDATE ON public.favors
  FOR EACH ROW EXECUTE FUNCTION public.favors_field_guard();

-- Quick checks after applying (run as a signed-in owner, expect errors):
--   UPDATE public.favors SET status = 'completed' WHERE id = '<my favor>';   -> completion_requires_code_validation
--   UPDATE public.favors SET completed_at = now() WHERE id = '<my favor>';   -> silently ignored
