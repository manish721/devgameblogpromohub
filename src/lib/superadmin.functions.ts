import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createHash, timingSafeEqual } from "node:crypto";

type Action =
  | { type: "deleteCommunity"; id: string }
  | { type: "deleteMessage"; id: string }
  | { type: "deleteDm"; id: string }
  | { type: "forceJoin"; communityId: string; userId: string }
  | { type: "ban"; communityId: string; userId: string }
  | { type: "unban"; communityId: string; userId: string }
  | { type: "mute"; communityId: string; userId: string }
  | { type: "unmute"; communityId: string; userId: string }
  | { type: "banUser"; userId: string; reason: string }
  | { type: "unbanUser"; banId: string }
  | { type: "listBans" }
  | { type: "findUser"; query: string };

export const superAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { password: string; action: Action }) => d)
  .handler(async ({ data, context }) => {
    const expected = process.env.SUPER_ADMIN_PASSWORD;
    if (!expected) {
      throw new Error("Super admin not configured");
    }
    const a = createHash("sha256").update(String(data.password ?? ""), "utf8").digest();
    const b = createHash("sha256").update(expected, "utf8").digest();
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new Error("Invalid super admin password");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const act = data.action;
    switch (act.type) {
      case "deleteCommunity": {
        const { error } = await supabaseAdmin.from("communities").delete().eq("id", act.id);
        if (error) throw error;
        return { ok: true };
      }
      case "deleteMessage": {
        const { error } = await supabaseAdmin.from("messages").delete().eq("id", act.id);
        if (error) throw error;
        return { ok: true };
      }
      case "deleteDm": {
        const { error } = await supabaseAdmin.from("direct_messages").delete().eq("id", act.id);
        if (error) throw error;
        return { ok: true };
      }
      case "forceJoin": {
        const { error } = await supabaseAdmin
          .from("community_members")
          .upsert(
            { community_id: act.communityId, user_id: act.userId, role: "admin" },
            { onConflict: "community_id,user_id" },
          );
        if (error) throw error;
        return { ok: true };
      }
      case "ban": {
        await supabaseAdmin
          .from("community_bans")
          .upsert(
            {
              community_id: act.communityId,
              user_id: act.userId,
              expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            },
            { onConflict: "community_id,user_id" },
          );
        await supabaseAdmin
          .from("community_members")
          .delete()
          .eq("community_id", act.communityId)
          .eq("user_id", act.userId);
        return { ok: true };
      }
      case "unban": {
        await supabaseAdmin
          .from("community_bans")
          .delete()
          .eq("community_id", act.communityId)
          .eq("user_id", act.userId);
        return { ok: true };
      }
      case "mute": {
        await supabaseAdmin
          .from("community_mutes")
          .upsert({ community_id: act.communityId, user_id: act.userId }, { onConflict: "community_id,user_id" });
        return { ok: true };
      }
      case "unmute": {
        await supabaseAdmin
          .from("community_mutes")
          .delete()
          .eq("community_id", act.communityId)
          .eq("user_id", act.userId);
        return { ok: true };
      }
      case "banUser": {
        const now = new Date();
        const ends = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        // Expire prior active bans for this user
        await supabaseAdmin
          .from("user_bans")
          .update({ status: "removed" })
          .eq("user_id", act.userId)
          .eq("status", "active");
        const { error } = await supabaseAdmin.from("user_bans").insert({
          user_id: act.userId,
          reason: act.reason || "",
          banned_by: context.userId,
          started_at: now.toISOString(),
          ends_at: ends.toISOString(),
          status: "active",
        });
        if (error) throw error;
        return { ok: true };
      }
      case "unbanUser": {
        const { error } = await supabaseAdmin
          .from("user_bans")
          .update({ status: "removed", ends_at: new Date().toISOString() })
          .eq("id", act.banId);
        if (error) throw error;
        return { ok: true };
      }
      case "listBans": {
        const { data, error } = await supabaseAdmin
          .from("user_bans")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(500);
        if (error) throw error;
        // Resolve usernames
        const ids = Array.from(new Set([...(data ?? []).map((b: any) => b.user_id), ...(data ?? []).map((b: any) => b.banned_by).filter(Boolean)]));
        const { data: profiles } = ids.length
          ? await supabaseAdmin.from("profiles").select("id, username, display_name").in("id", ids)
          : { data: [] as any[] };
        const map = new Map((profiles ?? []).map((p: any) => [p.id, p]));
        return {
          ok: true,
          bans: (data ?? []).map((b: any) => ({
            ...b,
            effective_status:
              b.status === "active" && new Date(b.ends_at) > new Date() ? "active" : b.status === "active" ? "expired" : b.status,
            user: map.get(b.user_id) ?? null,
            admin: b.banned_by ? map.get(b.banned_by) ?? null : null,
          })),
        };
      }
      case "findUser": {
        const q = act.query.trim();
        if (!q) return { ok: true, users: [] };
        const { data, error } = await supabaseAdmin
          .from("profiles")
          .select("id, username, display_name")
          .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
          .limit(20);
        if (error) throw error;
        return { ok: true, users: data ?? [] };
      }
      default:
        throw new Error("Unknown action");
    }
  });