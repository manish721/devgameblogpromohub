-- Cascade deletes for community deletion
ALTER TABLE public.channels DROP CONSTRAINT IF EXISTS channels_community_id_fkey;
ALTER TABLE public.channels ADD CONSTRAINT channels_community_id_fkey
  FOREIGN KEY (community_id) REFERENCES public.communities(id) ON DELETE CASCADE;
ALTER TABLE public.community_members DROP CONSTRAINT IF EXISTS community_members_community_id_fkey;
ALTER TABLE public.community_members ADD CONSTRAINT community_members_community_id_fkey
  FOREIGN KEY (community_id) REFERENCES public.communities(id) ON DELETE CASCADE;
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_channel_id_fkey;
ALTER TABLE public.messages ADD CONSTRAINT messages_channel_id_fkey
  FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE CASCADE;

-- Notifications
CREATE TABLE public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notif select" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own notif update" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own notif delete" ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Message reports
CREATE TABLE public.message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now()
);
GRANT SELECT, INSERT ON public.message_reports TO authenticated;
GRANT ALL ON public.message_reports TO service_role;
ALTER TABLE public.message_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "report insert" ON public.message_reports FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());
CREATE POLICY "report own select" ON public.message_reports FOR SELECT TO authenticated USING (reporter_id = auth.uid());

-- Bans
CREATE TABLE public.community_bans (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  unique(community_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.community_bans TO authenticated;
GRANT ALL ON public.community_bans TO service_role;
ALTER TABLE public.community_bans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ban select members" ON public.community_bans FOR SELECT TO authenticated USING (public.is_community_member(community_id, auth.uid()));
CREATE POLICY "ban insert admins" ON public.community_bans FOR INSERT TO authenticated WITH CHECK (public.is_community_admin(community_id, auth.uid()));
CREATE POLICY "ban delete admins" ON public.community_bans FOR DELETE TO authenticated USING (public.is_community_admin(community_id, auth.uid()));

-- Mutes
CREATE TABLE public.community_mutes (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null,
  until timestamptz,
  created_at timestamptz not null default now(),
  unique(community_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_mutes TO authenticated;
GRANT ALL ON public.community_mutes TO service_role;
ALTER TABLE public.community_mutes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mute select members" ON public.community_mutes FOR SELECT TO authenticated USING (public.is_community_member(community_id, auth.uid()));
CREATE POLICY "mute insert admins" ON public.community_mutes FOR INSERT TO authenticated WITH CHECK (public.is_community_admin(community_id, auth.uid()));
CREATE POLICY "mute delete admins" ON public.community_mutes FOR DELETE TO authenticated USING (public.is_community_admin(community_id, auth.uid()));

-- Allow community admins to delete messages (in addition to authors)
DROP POLICY IF EXISTS "delete own message" ON public.messages;
DROP POLICY IF EXISTS "msg delete" ON public.messages;
CREATE POLICY "msg delete author or admin" ON public.messages FOR DELETE TO authenticated USING (
  user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.channels c
    WHERE c.id = channel_id AND public.is_community_admin(c.community_id, auth.uid())
  )
);

-- DM delete by participants
DROP POLICY IF EXISTS "dm delete" ON public.direct_messages;
CREATE POLICY "dm delete by participant" ON public.direct_messages FOR DELETE TO authenticated USING (sender_id = auth.uid() OR recipient_id = auth.uid());

-- Mention notifications
CREATE OR REPLACE FUNCTION public.notify_mentions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uname TEXT;
  uid uuid;
  cslug text;
BEGIN
  SELECT co.slug INTO cslug FROM public.channels ch
    JOIN public.communities co ON co.id = ch.community_id
    WHERE ch.id = NEW.channel_id;
  FOR uname IN SELECT DISTINCT (regexp_matches(NEW.content, '@([a-zA-Z0-9_]+)', 'g'))[1]
  LOOP
    SELECT id INTO uid FROM public.profiles WHERE username = uname;
    IF uid IS NOT NULL AND uid <> NEW.user_id THEN
      INSERT INTO public.notifications(user_id, type, title, body, link)
      VALUES (uid, 'mention', 'You were mentioned', left(NEW.content, 200), '/c/' || cslug);
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_mentions_trg ON public.messages;
CREATE TRIGGER notify_mentions_trg AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.notify_mentions();

-- DM notifications
CREATE OR REPLACE FUNCTION public.notify_dm()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  sname text;
BEGIN
  SELECT COALESCE(display_name, username) INTO sname FROM public.profiles WHERE id = NEW.sender_id;
  INSERT INTO public.notifications(user_id, type, title, body, link)
  VALUES (NEW.recipient_id, 'dm', 'New message from ' || COALESCE(sname, 'someone'), left(NEW.content, 200), '/dm/' || NEW.sender_id::text);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_dm_trg ON public.direct_messages;
CREATE TRIGGER notify_dm_trg AFTER INSERT ON public.direct_messages FOR EACH ROW EXECUTE FUNCTION public.notify_dm();