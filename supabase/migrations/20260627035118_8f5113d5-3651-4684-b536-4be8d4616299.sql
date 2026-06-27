GRANT EXECUTE ON FUNCTION public.is_community_member(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_community_admin(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_community_owner(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_access_channel(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, anon;