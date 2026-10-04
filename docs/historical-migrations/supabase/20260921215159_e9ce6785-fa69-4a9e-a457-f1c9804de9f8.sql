-- The guard triggers were SECURITY DEFINER, so current_user inside them was the
-- function owner and is_verification_service_writer() short-circuited to TRUE:
-- every guard was silently skipped. They must run as the calling user.

CREATE OR REPLACE FUNCTION public.messages_stamp_author()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF public.is_verification_service_writer() THEN RETURN NEW; END IF;
  NEW.sender_profile_id := public.current_profile_id();
  NEW.is_demo := FALSE;
  NEW.author_role := CASE WHEN public.is_favor_owner(NEW.favor_id) THEN 'customer' ELSE 'worker' END;
  IF NEW.message_type = 'system' THEN NEW.message_type := 'text'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.locations_stamp_owner()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF public.is_verification_service_writer() THEN RETURN NEW; END IF;
  NEW.created_by_user_id := auth.uid();
  NEW.is_demo := FALSE;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.offers_field_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF public.is_verification_service_writer() THEN RETURN NEW; END IF;
  NEW.favor_id := OLD.favor_id;
  NEW.worker_profile_id := OLD.worker_profile_id;
  NEW.is_demo := OLD.is_demo;
  IF NOT public.owns_worker_profile(OLD.worker_profile_id) OR OLD.status <> 'pending' THEN
    NEW.offered_amount := OLD.offered_amount;
    NEW.currency_code := OLD.currency_code;
    NEW.message := OLD.message;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.favors_field_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_owner BOOLEAN;
  v_status public.favor_status;
  v_guarded public.favors%ROWTYPE;
BEGIN
  IF public.is_verification_service_writer() THEN RETURN NEW; END IF;

  NEW.id := OLD.id;
  NEW.owner_user_id := OLD.owner_user_id;
  NEW.customer_profile_id := OLD.customer_profile_id;
  NEW.is_demo := OLD.is_demo;
  NEW.created_at := OLD.created_at;

  v_owner := OLD.owner_user_id IS NOT NULL AND OLD.owner_user_id = auth.uid();

  IF NOT v_owner AND NOT public.is_platform_admin() THEN
    -- selected worker: only the operational status may move
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

  IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'cancelled_favor_is_final' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'disputed' AND NEW.status <> 'disputed' AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'disputed_favor_requires_admin' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.selected_offer_id IS DISTINCT FROM OLD.selected_offer_id AND NEW.selected_offer_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.offers o WHERE o.id = NEW.selected_offer_id AND o.favor_id = OLD.id) THEN
      RAISE EXCEPTION 'offer_does_not_belong_to_favor' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;