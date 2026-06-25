
-- Restrict SELECT on bans/mutes to admins
DROP POLICY IF EXISTS "ban select members" ON public.community_bans;
DROP POLICY IF EXISTS "mute select members" ON public.community_mutes;
CREATE POLICY "ban select admins" ON public.community_bans FOR SELECT USING (public.is_community_admin(community_id, auth.uid()));
CREATE POLICY "mute select admins" ON public.community_mutes FOR SELECT USING (public.is_community_admin(community_id, auth.uid()));

-- Revoke EXECUTE on SECURITY DEFINER helpers from PUBLIC/anon/authenticated.
-- RLS policies still call them as table owner.
REVOKE EXECUTE ON FUNCTION public.is_community_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_community_admin(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_access_channel(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
