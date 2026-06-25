import { createServerFn } from "@tanstack/react-start";

const SUPER_PASSWORD = "483921";

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
  .inputValidator((d: { password: string; action: Action }) => d)
  .handler(async ({ data }) => {
    if (data.password !== SUPER_PASSWORD) {
      throw new Error("Invalid super admin password");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const a = data.action;
    switch (a.type) {
      case "deleteCommunity": {
        const { error } = await supabaseAdmin.from("communities").delete().eq("id", a.id);
        if (error) throw error;
        return { ok: true };
      }
      case "deleteMessage": {
        const { error } = await supabaseAdmin.from("messages").delete().eq("id", a.id);
        if (error) throw error;
        return { ok: true };
      }
      case "deleteDm": {
        const { error } = await supabaseAdmin.from("direct_messages").delete().eq("id", a.id);
        if (error) throw error;
        return { ok: true };
      }
      case "forceJoin": {
        const { error } = await supabaseAdmin
          .from("community_members")
          .upsert(
            { community_id: a.communityId, user_id: a.userId, role: "admin" },
            { onConflict: "community_id,user_id" },
          );
        if (error) throw error;
        return { ok: true };
      }
      case "ban": {
        await supabaseAdmin
          .from("community_bans")
          .upsert({ community_id: a.communityId, user_id: a.userId }, { onConflict: "community_id,user_id" });
        await supabaseAdmin
          .from("community_members")
          .delete()
          .eq("community_id", a.communityId)
          .eq("user_id", a.userId);
        return { ok: true };
      }
      case "unban": {
        await supabaseAdmin
          .from("community_bans")
          .delete()
          .eq("community_id", a.communityId)
          .eq("user_id", a.userId);
        return { ok: true };
      }
      case "mute": {
        await supabaseAdmin
          .from("community_mutes")
          .upsert({ community_id: a.communityId, user_id: a.userId }, { onConflict: "community_id,user_id" });
        return { ok: true };
      }
      case "unmute": {
        await supabaseAdmin
          .from("community_mutes")
          .delete()
          .eq("community_id", a.communityId)
          .eq("user_id", a.userId);
        return { ok: true };
      }
      default:
        throw new Error("Unknown action");
    }
  });