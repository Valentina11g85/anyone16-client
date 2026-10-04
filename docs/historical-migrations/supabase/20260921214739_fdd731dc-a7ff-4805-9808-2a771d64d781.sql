CREATE OR REPLACE FUNCTION public.verification_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_kind TEXT;
  v_connected BOOLEAN;
  v_trusted BOOLEAN;
  v_admin BOOLEAN;
  v_default public.trust_verification_state;
  v_wants_verified BOOLEAN := FALSE;
BEGIN
  v_kind := CASE TG_TABLE_NAME
    WHEN 'worker_identity_verifications' THEN 'identity'
    WHEN 'worker_address_verifications'  THEN 'address'
    WHEN 'worker_vehicles'               THEN 'vehicle'
    WHEN 'worker_background_checks'      THEN 'background'
  END;
  v_connected := public.verification_provider_connected(v_kind);
  v_trusted   := public.is_verification_service_writer();
  v_admin     := public.has_role(auth.uid(), 'admin');
  v_default   := CASE WHEN v_connected THEN 'pending'::public.trust_verification_state
                      ELSE 'provider_not_connected'::public.trust_verification_state END;

  IF TG_OP = 'INSERT' THEN
    IF NOT v_trusted THEN
      NEW.status := v_default;
      NEW.provider := NULL;
      NEW.provider_reference := NULL;
      IF TG_TABLE_NAME = 'worker_identity_verifications' THEN
        NEW.selfie_check := v_default;
        NEW.liveness_check := v_default;
        NEW.document_check := v_default;
        NEW.completed_at := NULL;
        NEW.last_verified_at := NULL;
      ELSIF TG_TABLE_NAME = 'worker_background_checks' THEN
        NEW.checked_at := NULL;
      ELSIF TG_TABLE_NAME = 'worker_vehicles' THEN
        NEW.verified_at := NULL;
        NEW.insurance_status := 'not_started';
      ELSE
        NEW.verified_at := NULL;
      END IF;
    END IF;
  ELSE
    IF NOT v_trusted THEN
      NEW.provider := OLD.provider;
      NEW.provider_reference := OLD.provider_reference;
      NEW.is_demo := OLD.is_demo;
      IF NOT v_admin THEN
        NEW.status := OLD.status;
        IF TG_TABLE_NAME = 'worker_identity_verifications' THEN
          NEW.selfie_check := OLD.selfie_check;
          NEW.liveness_check := OLD.liveness_check;
          NEW.document_check := OLD.document_check;
          NEW.completed_at := OLD.completed_at;
          NEW.last_verified_at := OLD.last_verified_at;
        ELSIF TG_TABLE_NAME = 'worker_background_checks' THEN
          NEW.checked_at := OLD.checked_at;
        ELSIF TG_TABLE_NAME = 'worker_vehicles' THEN
          NEW.verified_at := OLD.verified_at;
          NEW.insurance_status := OLD.insurance_status;
        ELSE
          NEW.verified_at := OLD.verified_at;
        END IF;
      END IF;
    END IF;
  END IF;

  IF NEW.status = 'verified' THEN
    v_wants_verified := TRUE;
  ELSIF TG_TABLE_NAME = 'worker_identity_verifications' THEN
    IF NEW.selfie_check = 'verified' OR NEW.liveness_check = 'verified' OR NEW.document_check = 'verified' THEN
      v_wants_verified := TRUE;
    END IF;
  ELSIF TG_TABLE_NAME = 'worker_vehicles' THEN
    IF NEW.insurance_status = 'verified' THEN
      v_wants_verified := TRUE;
    END IF;
  END IF;

  IF v_wants_verified THEN
    IF NOT v_connected THEN
      RAISE EXCEPTION 'verification_provider_not_connected: % cannot be verified without a connected provider', v_kind
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.provider IS NULL OR NEW.provider_reference IS NULL THEN
      RAISE EXCEPTION 'verification_reference_required: % needs provider and provider_reference', v_kind
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.is_demo THEN
      RAISE EXCEPTION 'demo_verification_cannot_be_verified'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;