-- AnyOne16 — enable realtime for live favor status and tracking (non-destructive).
-- Adds existing tables to the supabase_realtime publication. RLS still applies.
-- Safe to run more than once.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['favors','offers','messages','location_updates','notifications','service_offers','service_contracts','service_messages','payment_orders']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
