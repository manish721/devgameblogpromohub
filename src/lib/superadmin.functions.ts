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
  | { type: "unmute"; communityId: string; userId: string };

export const superAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { password: string; action: Action }) => d)
  .handler(async ({ data }) => {
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
          .upsert({ community_id: act.communityId, user_id: act.userId }, { onConflict: "community_id,user_id" });
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
      default:
        throw new Error("Unknown action");
    }
  });