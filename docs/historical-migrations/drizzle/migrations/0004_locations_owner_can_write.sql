ALTER POLICY locations_update ON public.locations
  USING (is_demo OR created_by_user_id = auth.uid() OR public.can_read_location(id))
  WITH CHECK (is_demo OR created_by_user_id = auth.uid() OR public.can_read_location(id));