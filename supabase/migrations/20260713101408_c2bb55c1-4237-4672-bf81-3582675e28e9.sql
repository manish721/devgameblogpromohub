
-- Audit fields for unban
ALTER TABLE public.user_bans
  ADD COLUMN IF NOT EXISTS unbanned_by uuid,
  ADD COLUMN IF NOT EXISTS unbanned_at timestamptz,
  ADD COLUMN IF NOT EXISTS unban_reason text;

-- Block all writes to key tables when banned
CREATE OR REPLACE FUNCTION public.block_if_banned()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND public.is_user_banned(auth.uid()) THEN
    RAISE EXCEPTION 'Your account is banned from the Hub Community';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_block_ban_communities ON public.communities;
CREATE TRIGGER trg_block_ban_communities
  BEFORE INSERT OR UPDATE OR DELETE ON public.communities
  FOR EACH ROW EXECUTE FUNCTION public.block_if_banned();

DROP TRIGGER IF EXISTS trg_block_ban_channels ON public.channels;
CREATE TRIGGER trg_block_ban_channels
  BEFORE INSERT OR UPDATE OR DELETE ON public.channels
  FOR EACH ROW EXECUTE FUNCTION public.block_if_banned();

DROP TRIGGER IF EXISTS trg_block_ban_messages ON public.messages;
CREATE TRIGGER trg_block_ban_messages
  BEFORE INSERT OR UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.block_if_banned();

DROP TRIGGER IF EXISTS trg_block_ban_dm ON public.direct_messages;
CREATE TRIGGER trg_block_ban_dm
  BEFORE INSERT OR UPDATE ON public.direct_messages
  FOR EACH ROW EXECUTE FUNCTION public.block_if_banned();

DROP TRIGGER IF EXISTS trg_block_ban_members ON public.community_members;
CREATE TRIGGER trg_block_ban_members
  BEFORE INSERT OR UPDATE ON public.community_members
  FOR EACH ROW EXECUTE FUNCTION public.block_if_banned();
