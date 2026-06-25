
CREATE OR REPLACE FUNCTION public.is_community_owner(_community uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.community_members WHERE community_id = _community AND user_id = _user AND role = 'owner')
$$;
REVOKE EXECUTE ON FUNCTION public.is_community_owner(uuid, uuid) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "admins manage members" ON public.community_members;

-- Only the owner can change roles; admins cannot promote anyone.
CREATE POLICY "owner manages member roles" ON public.community_members
  FOR UPDATE
  USING (public.is_community_owner(community_id, auth.uid()))
  WITH CHECK (public.is_community_owner(community_id, auth.uid()));
