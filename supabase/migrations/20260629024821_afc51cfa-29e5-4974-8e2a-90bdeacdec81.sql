CREATE OR REPLACE FUNCTION public.join_community(_community_id uuid)
RETURNS public.community_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _membership public.community_members;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to join a community';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.community_bans b
    WHERE b.community_id = _community_id
      AND b.user_id = _user_id
      AND b.expires_at > now()
  ) THEN
    RAISE EXCEPTION 'You are banned from this community';
  END IF;

  INSERT INTO public.community_members (community_id, user_id, role)
  VALUES (_community_id, _user_id, 'member'::public.community_role)
  ON CONFLICT (community_id, user_id) DO NOTHING;

  SELECT *
  INTO _membership
  FROM public.community_members
  WHERE community_id = _community_id
    AND user_id = _user_id;

  RETURN _membership;
END;
$$;

REVOKE ALL ON FUNCTION public.join_community(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_community(uuid) TO authenticated;