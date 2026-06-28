CREATE OR REPLACE FUNCTION public.enforce_regular_self_join()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required to join a community';
  END IF;

  NEW.user_id := auth.uid();
  NEW.role := 'member'::public.community_role;
  RETURN NEW;
END;
$$;