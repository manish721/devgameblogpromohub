import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "@tanstack/react-router";

export type MyBan = {
  id: string;
  user_id: string;
  reason: string;
  banned_by: string | null;
  started_at: string;
  ends_at: string;
  status: string;
};

export function useMyBan() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [ban, setBan] = useState<MyBan | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setBan(null);
      setLoading(false);
      return;
    }
    const { data } = await (supabase as any)
      .from("user_bans")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .gt("ends_at", new Date().toISOString())
      .order("ends_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setBan((data as MyBan | null) ?? null);
    setLoading(false);
  }, [user]);

  // If a ban becomes active for the signed-in user, immediately terminate the session.
  useEffect(() => {
    if (!ban || typeof window === "undefined") return;
    try {
      sessionStorage.setItem("hub:bannedInfo", JSON.stringify(ban));
    } catch {}
    void (async () => {
      await supabase.auth.signOut();
      navigate({ to: "/banned" });
    })();
  }, [ban, navigate]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Realtime: react to new/updated bans against me
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`my-bans-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_bans", filter: `user_id=eq.${user.id}` },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user, refresh]);

  // Auto re-check when ends_at passes
  useEffect(() => {
    if (!ban) return;
    const ms = new Date(ban.ends_at).getTime() - Date.now();
    if (ms <= 0) {
      void refresh();
      return;
    }
    const t = setTimeout(() => void refresh(), ms + 500);
    return () => clearTimeout(t);
  }, [ban, refresh]);

  return { ban, loading, refresh };
}