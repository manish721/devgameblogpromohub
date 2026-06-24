
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.community_role AS ENUM ('owner', 'admin', 'member');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles insert own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles update own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Platform roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roles readable by self" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Auto-create profile + default role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
  counter INT := 0;
BEGIN
  base_username := COALESCE(
    NULLIF(regexp_replace(lower(split_part(NEW.email, '@', 1)), '[^a-z0-9_]', '', 'g'), ''),
    'user_' || substr(NEW.id::text, 1, 8)
  );
  final_username := base_username;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
    counter := counter + 1;
    final_username := base_username || counter::text;
  END LOOP;

  INSERT INTO public.profiles (id, username, display_name)
  VALUES (NEW.id, final_username, COALESCE(NEW.raw_user_meta_data->>'display_name', final_username));

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Communities
CREATE TABLE public.communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communities TO authenticated;
GRANT ALL ON public.communities TO service_role;
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;

-- Community membership
CREATE TABLE public.community_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role community_role NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(community_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_members TO authenticated;
GRANT ALL ON public.community_members TO service_role;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;

-- Security definer helpers (avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.is_community_member(_community UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.community_members WHERE community_id = _community AND user_id = _user)
$$;

CREATE OR REPLACE FUNCTION public.is_community_admin(_community UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_members
    WHERE community_id = _community AND user_id = _user AND role IN ('owner', 'admin')
  )
$$;

-- Community policies
CREATE POLICY "communities readable by all signed-in" ON public.communities FOR SELECT TO authenticated USING (true);
CREATE POLICY "communities insert by self" ON public.communities FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "communities update by admin" ON public.communities FOR UPDATE TO authenticated
  USING (public.is_community_admin(id, auth.uid()));
CREATE POLICY "communities delete by owner" ON public.communities FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.community_members WHERE community_id = communities.id AND user_id = auth.uid() AND role = 'owner'));

-- Membership policies
CREATE POLICY "members readable by community members" ON public.community_members FOR SELECT TO authenticated
  USING (public.is_community_member(community_id, auth.uid()));
CREATE POLICY "members can join" ON public.community_members FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND role = 'member');
CREATE POLICY "members can leave" ON public.community_members FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.is_community_admin(community_id, auth.uid()));
CREATE POLICY "admins manage members" ON public.community_members FOR UPDATE TO authenticated
  USING (public.is_community_admin(community_id, auth.uid()));

-- Owner-membership insertion via trigger when community is created
CREATE OR REPLACE FUNCTION public.handle_new_community()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.community_members (community_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'owner');
  INSERT INTO public.channels (community_id, name, is_private, created_by)
  VALUES (NEW.id, 'general', false, NEW.created_by),
         (NEW.id, 'admin-only', true, NEW.created_by);
  RETURN NEW;
END;
$$;

-- Channels
CREATE TABLE public.channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_private BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(community_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channels TO authenticated;
GRANT ALL ON public.channels TO service_role;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "channels visible based on membership" ON public.channels FOR SELECT TO authenticated USING (
  public.is_community_member(community_id, auth.uid())
  AND (is_private = false OR public.is_community_admin(community_id, auth.uid()))
);
CREATE POLICY "channels created by admins" ON public.channels FOR INSERT TO authenticated
  WITH CHECK (public.is_community_admin(community_id, auth.uid()) AND auth.uid() = created_by);
CREATE POLICY "channels updated by admins" ON public.channels FOR UPDATE TO authenticated
  USING (public.is_community_admin(community_id, auth.uid()));
CREATE POLICY "channels deleted by admins" ON public.channels FOR DELETE TO authenticated
  USING (public.is_community_admin(community_id, auth.uid()));

CREATE TRIGGER on_community_created
AFTER INSERT ON public.communities FOR EACH ROW EXECUTE FUNCTION public.handle_new_community();

-- Channel messages
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_access_channel(_channel UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.channels c
    WHERE c.id = _channel
      AND public.is_community_member(c.community_id, _user)
      AND (c.is_private = false OR public.is_community_admin(c.community_id, _user))
  )
$$;

CREATE POLICY "messages readable by channel members" ON public.messages FOR SELECT TO authenticated
  USING (public.can_access_channel(channel_id, auth.uid()));
CREATE POLICY "messages sent by channel members" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.can_access_channel(channel_id, auth.uid()));
CREATE POLICY "messages deleted by sender or admin" ON public.messages FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.channels c WHERE c.id = channel_id AND public.is_community_admin(c.community_id, auth.uid())
  ));

-- Direct messages (1:1)
CREATE TABLE public.direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.direct_messages TO authenticated;
GRANT ALL ON public.direct_messages TO service_role;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dm readable by participants" ON public.direct_messages FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);
CREATE POLICY "dm sent by self" ON public.direct_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "dm deleted by sender" ON public.direct_messages FOR DELETE TO authenticated
  USING (auth.uid() = sender_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.channels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_members;

-- Indexes
CREATE INDEX idx_messages_channel ON public.messages(channel_id, created_at DESC);
CREATE INDEX idx_dm_pair ON public.direct_messages(sender_id, recipient_id, created_at DESC);
CREATE INDEX idx_members_user ON public.community_members(user_id);
CREATE INDEX idx_channels_community ON public.channels(community_id);
