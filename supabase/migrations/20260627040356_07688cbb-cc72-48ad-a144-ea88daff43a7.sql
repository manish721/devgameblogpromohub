-- Only the super-admin server function (service_role) may delete messages, DMs, or communities.
REVOKE DELETE ON public.messages FROM authenticated;
REVOKE DELETE ON public.direct_messages FROM authenticated;
REVOKE DELETE ON public.communities FROM authenticated;

-- Drop any user-facing delete policies; service_role bypasses RLS.
DROP POLICY IF EXISTS "Users delete own messages" ON public.messages;
DROP POLICY IF EXISTS "Authors delete own messages" ON public.messages;
DROP POLICY IF EXISTS "Admins delete messages" ON public.messages;
DROP POLICY IF EXISTS "delete_own_message" ON public.messages;

DROP POLICY IF EXISTS "Users delete own dms" ON public.direct_messages;
DROP POLICY IF EXISTS "Senders delete dms" ON public.direct_messages;
DROP POLICY IF EXISTS "Participants delete dms" ON public.direct_messages;

DROP POLICY IF EXISTS "Owners delete communities" ON public.communities;
DROP POLICY IF EXISTS "Owner can delete community" ON public.communities;