
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_community() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_dm() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_mentions() FROM PUBLIC, anon, authenticated;
