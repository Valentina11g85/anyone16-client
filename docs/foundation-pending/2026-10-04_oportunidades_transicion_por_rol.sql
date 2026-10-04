-- PENDIENTE (no ejecutado). Ejecutar manualmente en el SQL Editor de Foundation.
-- Añade al RPC existente transition_service_contract la autorización por rol:
--   agreed -> confirmed      : solo el contratante (buyer)
--   confirmed -> in_progress : solo el proveedor (provider)
-- El resto de la función (transiciones permitidas, notificaciones, auditoría) queda igual.

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
  IF _status = 'confirmed' AND me <> c.buyer_profile_id THEN
    RAISE EXCEPTION 'only_buyer_can_confirm' USING ERRCODE = '42501';
  END IF;
  IF _status = 'in_progress' AND me <> c.provider_profile_id THEN
    RAISE EXCEPTION 'only_provider_can_start' USING ERRCODE = '42501';
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
END;
$$;

REVOKE EXECUTE ON FUNCTION public.transition_service_contract(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_service_contract(uuid, text, text) TO authenticated;
