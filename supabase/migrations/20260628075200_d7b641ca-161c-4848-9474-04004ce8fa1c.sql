DROP POLICY IF EXISTS "members can join" ON public.community_members;
CREATE POLICY "members can join"
  ON public.community_members
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND role = 'member');