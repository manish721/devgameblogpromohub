CREATE POLICY "users insert own notifications" ON public.notifications
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());