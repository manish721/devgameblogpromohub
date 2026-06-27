GRANT SELECT, INSERT, DELETE ON public.community_members TO authenticated;
GRANT UPDATE ON public.community_members TO authenticated;
GRANT ALL ON public.community_members TO service_role;