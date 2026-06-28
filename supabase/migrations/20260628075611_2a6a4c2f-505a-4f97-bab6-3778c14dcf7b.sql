CREATE OR REPLACE FUNCTION public.enforce_regular_self_join()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required to join a community';
  END IF;

  NEW.user_id := auth.uid();
  NEW.role := 'member'::public.community_role;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_regular_self_join ON public.community_members;
CREATE TRIGGER enforce_regular_self_join
  BEFORE INSERT ON public.community_members
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_regular_self_join();

DROP POLICY IF EXISTS "members can join" ON public.community_members;
CREATE POLICY "members can join"
  ON public.community_members
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND role = 'member'::public.community_role);