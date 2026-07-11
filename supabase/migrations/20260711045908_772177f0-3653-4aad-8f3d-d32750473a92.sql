
CREATE TABLE IF NOT EXISTS public.user_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  reason text NOT NULL DEFAULT '',
  banned_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_bans_user_id_idx ON public.user_bans(user_id);
CREATE INDEX IF NOT EXISTS user_bans_status_idx ON public.user_bans(status);
GRANT SELECT ON public.user_bans TO authenticated;
GRANT ALL ON public.user_bans TO service_role;
ALTER TABLE public.user_bans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user sees own bans" ON public.user_bans;
CREATE POLICY "user sees own bans" ON public.user_bans FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_user_banned(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_bans WHERE user_id = _user AND status = 'active' AND ends_at > now())
$$;
REVOKE ALL ON FUNCTION public.is_user_banned(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_user_banned(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_active_ban()
RETURNS public.user_bans LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.* FROM public.user_bans b
  WHERE b.user_id = auth.uid() AND b.status = 'active' AND b.ends_at > now()
  ORDER BY b.ends_at DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.get_my_active_ban() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_active_ban() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.user_bans_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS user_bans_touch_trg ON public.user_bans;
CREATE TRIGGER user_bans_touch_trg BEFORE UPDATE ON public.user_bans FOR EACH ROW EXECUTE FUNCTION public.user_bans_touch();

CREATE OR REPLACE FUNCTION public.notify_user_ban()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'active') THEN
    INSERT INTO public.notifications(user_id, type, title, body, link)
    VALUES (NEW.user_id, 'ban','You have been banned',
      COALESCE(NULLIF(NEW.reason,''), 'Violation of community rules') || ' — expires ' || to_char(NEW.ends_at, 'YYYY-MM-DD HH24:MI UTC'),
      '/banned');
  ELSIF (TG_OP = 'UPDATE' AND OLD.status = 'active' AND NEW.status <> 'active') THEN
    INSERT INTO public.notifications(user_id, type, title, body, link)
    VALUES (NEW.user_id, 'unban','Your ban has been lifted','You now have full access to the community again.','/app');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_user_ban_ins ON public.user_bans;
CREATE TRIGGER notify_user_ban_ins AFTER INSERT ON public.user_bans FOR EACH ROW EXECUTE FUNCTION public.notify_user_ban();
DROP TRIGGER IF EXISTS notify_user_ban_upd ON public.user_bans;
CREATE TRIGGER notify_user_ban_upd AFTER UPDATE ON public.user_bans FOR EACH ROW EXECUTE FUNCTION public.notify_user_ban();

-- Rescope public policies to authenticated
DROP POLICY IF EXISTS "ban select admins" ON public.community_bans;
CREATE POLICY "ban select admins" ON public.community_bans
  FOR SELECT TO authenticated USING (public.is_community_admin(community_id, auth.uid()));

DROP POLICY IF EXISTS "mute select admins" ON public.community_mutes;
CREATE POLICY "mute select admins" ON public.community_mutes
  FOR SELECT TO authenticated USING (public.is_community_admin(community_id, auth.uid()));

DROP POLICY IF EXISTS "owner manages member roles" ON public.community_members;
CREATE POLICY "owner manages member roles" ON public.community_members
  FOR UPDATE TO authenticated
  USING (public.is_community_owner(community_id, auth.uid()))
  WITH CHECK (public.is_community_owner(community_id, auth.uid()));

-- Join blocks banned users
CREATE OR REPLACE FUNCTION public.join_community(_community_id uuid)
RETURNS public.community_members LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _user_id uuid := auth.uid(); _m public.community_members;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF public.is_user_banned(_user_id) THEN RAISE EXCEPTION 'You are banned from the Hub Community'; END IF;
  IF EXISTS (SELECT 1 FROM public.community_bans b WHERE b.community_id=_community_id AND b.user_id=_user_id AND b.expires_at > now()) THEN
    RAISE EXCEPTION 'You are banned from this community';
  END IF;
  INSERT INTO public.community_members(community_id, user_id, role)
  VALUES (_community_id, _user_id, 'member'::public.community_role)
  ON CONFLICT (community_id, user_id) DO NOTHING;
  SELECT * INTO _m FROM public.community_members WHERE community_id=_community_id AND user_id=_user_id;
  RETURN _m;
END $$;
