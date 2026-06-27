ALTER TABLE public.community_bans ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days');

-- Drop any policy allowing non-super-admin users to insert/delete bans
DROP POLICY IF EXISTS "Admins manage bans" ON public.community_bans;
DROP POLICY IF EXISTS "Community admins manage bans" ON public.community_bans;
DROP POLICY IF EXISTS "admins_insert_bans" ON public.community_bans;
DROP POLICY IF EXISTS "admins_delete_bans" ON public.community_bans;
DROP POLICY IF EXISTS "members_insert_bans" ON public.community_bans;

-- Only service_role (super admin server fn) may write bans; revoke from authenticated
REVOKE INSERT, UPDATE, DELETE ON public.community_bans FROM authenticated;
GRANT SELECT ON public.community_bans TO authenticated;