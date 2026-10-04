-- Stage 5: real accounts. One account can act as customer and/or worker.

CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_id_key ON public.profiles(user_id) WHERE user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1 $$;

CREATE OR REPLACE FUNCTION public.owns_worker_profile(_worker_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.worker_profiles wp
    JOIN public.profiles p ON p.id = wp.profile_id
    WHERE wp.id = _worker_profile_id AND p.user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.is_favor_participant(_favor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.favors f
    LEFT JOIN public.worker_profiles wp ON wp.id = f.selected_worker_profile_id
    LEFT JOIN public.profiles wpp ON wpp.id = wp.profile_id
    WHERE f.id = _favor_id
      AND (f.is_demo OR f.owner_user_id = auth.uid() OR wpp.user_id = auth.uid())
  )
$$;

-- Replace the permissive Stage 4 policies with ownership-aware ones.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('profiles','customer_profiles','worker_profiles','favors','offers',
                        'messages','notifications','reviews','verifications','audit_logs','locations')
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- profiles: private account data, only the owner reads it.
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT
  USING (user_id = auth.uid() OR is_demo);
CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY customer_profiles_select ON public.customer_profiles FOR SELECT
  USING (is_demo OR profile_id = public.current_profile_id());
CREATE POLICY customer_profiles_insert ON public.customer_profiles FOR INSERT
  WITH CHECK (profile_id = public.current_profile_id());
CREATE POLICY customer_profiles_update ON public.customer_profiles FOR UPDATE
  USING (profile_id = public.current_profile_id())
  WITH CHECK (profile_id = public.current_profile_id());

-- worker_profiles: public reputation, no private contact data.
CREATE POLICY worker_profiles_select ON public.worker_profiles FOR SELECT USING (true);
CREATE POLICY worker_profiles_insert ON public.worker_profiles FOR INSERT
  WITH CHECK (profile_id = public.current_profile_id());
CREATE POLICY worker_profiles_update ON public.worker_profiles FOR UPDATE
  USING (profile_id = public.current_profile_id())
  WITH CHECK (profile_id = public.current_profile_id());

CREATE POLICY locations_select ON public.locations FOR SELECT USING (true);
CREATE POLICY locations_insert ON public.locations FOR INSERT WITH CHECK (true);
CREATE POLICY locations_update ON public.locations FOR UPDATE USING (true) WITH CHECK (true);

-- favors: public marketplace listing, owner-only writes.
CREATE POLICY favors_select ON public.favors FOR SELECT USING (true);
CREATE POLICY favors_insert ON public.favors FOR INSERT
  WITH CHECK (is_demo OR owner_user_id = auth.uid());
CREATE POLICY favors_update ON public.favors FOR UPDATE
  USING (is_demo OR owner_user_id = auth.uid() OR public.is_favor_participant(id))
  WITH CHECK (is_demo OR owner_user_id = auth.uid() OR public.is_favor_participant(id));
CREATE POLICY favors_delete ON public.favors FOR DELETE
  USING (owner_user_id = auth.uid());

-- offers: only a real worker profile owner can offer; the client can respond.
CREATE POLICY offers_select ON public.offers FOR SELECT USING (true);
CREATE POLICY offers_insert ON public.offers FOR INSERT
  WITH CHECK (is_demo OR public.owns_worker_profile(worker_profile_id));
CREATE POLICY offers_update ON public.offers FOR UPDATE
  USING (is_demo OR public.owns_worker_profile(worker_profile_id) OR public.is_favor_participant(favor_id))
  WITH CHECK (is_demo OR public.owns_worker_profile(worker_profile_id) OR public.is_favor_participant(favor_id));

-- messages: only the two people involved in the favor.
CREATE POLICY messages_select ON public.messages FOR SELECT
  USING (is_demo OR public.is_favor_participant(favor_id));
CREATE POLICY messages_insert ON public.messages FOR INSERT
  WITH CHECK (is_demo OR public.is_favor_participant(favor_id));
CREATE POLICY messages_update ON public.messages FOR UPDATE
  USING (public.is_favor_participant(favor_id))
  WITH CHECK (public.is_favor_participant(favor_id));

CREATE POLICY notifications_select ON public.notifications FOR SELECT
  USING (is_demo OR profile_id = public.current_profile_id());
CREATE POLICY notifications_insert ON public.notifications FOR INSERT WITH CHECK (true);
CREATE POLICY notifications_update ON public.notifications FOR UPDATE
  USING (profile_id = public.current_profile_id())
  WITH CHECK (profile_id = public.current_profile_id());

CREATE POLICY reviews_select ON public.reviews FOR SELECT USING (true);
CREATE POLICY reviews_insert ON public.reviews FOR INSERT
  WITH CHECK (is_demo OR reviewer_profile_id = public.current_profile_id());

CREATE POLICY verifications_select ON public.verifications FOR SELECT USING (true);
CREATE POLICY verifications_insert ON public.verifications FOR INSERT
  WITH CHECK (is_demo OR profile_id = public.current_profile_id());
CREATE POLICY verifications_update ON public.verifications FOR UPDATE
  USING (profile_id = public.current_profile_id())
  WITH CHECK (profile_id = public.current_profile_id());

CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT
  USING (is_demo OR actor_profile_id = public.current_profile_id());
CREATE POLICY audit_logs_insert ON public.audit_logs FOR INSERT WITH CHECK (true);

GRANT SELECT ON public.worker_profiles TO anon, authenticated;
GRANT SELECT ON public.favors TO anon, authenticated;
GRANT SELECT ON public.offers TO anon, authenticated;
GRANT SELECT ON public.reviews TO anon, authenticated;
GRANT SELECT ON public.verifications TO anon, authenticated;