-- Hardening: remove execute access from signed-out callers on privileged helpers.
-- No function bodies, tables, RLS policies, or triggers are changed.

-- 1. Revoke from PUBLIC and anon (REVOKE is a no-op if the grant doesn't exist)
REVOKE EXECUTE ON FUNCTION public.admin_worker_safety() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_worker_restriction(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_favor_owner(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_app_event(text, text, uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.notify_favor_participant(uuid, uuid, text, text, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.recompute_worker_trust_level(uuid) FROM PUBLIC, anon;

-- 2. Keep/ensure authenticated access where required (already granted; idempotent)
GRANT EXECUTE ON FUNCTION public.admin_worker_safety() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_worker_restriction(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_favor_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_app_event(text, text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_favor_participant(uuid, uuid, text, text, text, uuid) TO authenticated;

-- 3. recompute_worker_trust_level: internal/service-role only
REVOKE EXECUTE ON FUNCTION public.recompute_worker_trust_level(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_worker_trust_level(uuid) TO service_role;