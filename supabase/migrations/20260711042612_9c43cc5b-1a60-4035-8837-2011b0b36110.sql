-- Trigger-only functions: revoke from everyone (triggers run as table owner)
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_community() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_dm() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_mentions() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_regular_self_join() FROM PUBLIC, anon, authenticated;

-- RLS helper functions: revoke from PUBLIC and anon; keep authenticated (required for policy evaluation)
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_community_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_community_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_community_owner(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_channel(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_community_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_community_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_community_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_channel(uuid, uuid) TO authenticated;

-- join_community: authenticated-only RPC
REVOKE ALL ON FUNCTION public.join_community(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_community(uuid) TO authenticated;

-- Notifications: remove user self-insert ability. Triggers use SECURITY DEFINER so they still work.
DROP POLICY IF EXISTS "users insert own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users insert own notifications" ON public.notifications;
DROP POLICY IF EXISTS "users_insert_own_notifications" ON public.notifications;
