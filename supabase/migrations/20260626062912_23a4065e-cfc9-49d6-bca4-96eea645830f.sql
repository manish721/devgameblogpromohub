
DROP POLICY IF EXISTS "ban select admins" ON public.community_bans;
CREATE POLICY "ban select admins" ON public.community_bans FOR SELECT TO authenticated USING (public.is_community_admin(community_id, auth.uid()));

DROP POLICY IF EXISTS "mute select admins" ON public.community_mutes;
CREATE POLICY "mute select admins" ON public.community_mutes FOR SELECT TO authenticated USING (public.is_community_admin(community_id, auth.uid()));

DROP POLICY IF EXISTS "owner manages member roles" ON public.community_members;
CREATE POLICY "owner manages member roles" ON public.community_members FOR UPDATE TO authenticated USING (public.is_community_owner(community_id, auth.uid())) WITH CHECK (public.is_community_owner(community_id, auth.uid()));
