import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Hash, Lock, Plus, Send, Settings, Users } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/c/$slug")({
  head: () => ({ meta: [{ title: "Community — Hubchat" }] }),
  component: CommunityPage,
});

type Community = { id: string; name: string; description: string | null; slug: string };
type Channel = { id: string; name: string; is_private: boolean };
type Member = { user_id: string; role: string; profiles: { username: string; display_name: string | null } | null };
type Message = {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  profile?: { username: string; display_name: string | null };
};

function CommunityPage() {
  const { slug } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [community, setCommunity] = useState<Community | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [myRole, setMyRole] = useState<string | null>(null);
  const [notMember, setNotMember] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isAdmin = myRole === "admin" || myRole === "owner";
  const activeChannel = useMemo(() => channels.find((c) => c.id === activeChannelId), [channels, activeChannelId]);

  // Load community + membership
  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data: c } = await supabase
        .from("communities")
        .select("id, name, description, slug")
        .eq("slug", slug)
        .maybeSingle();
      if (!c) {
        toast.error("Community not found");
        navigate({ to: "/app" });
        return;
      }
      setCommunity(c);
      const { data: m } = await supabase
        .from("community_members")
        .select("role")
        .eq("community_id", c.id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!m) {
        setNotMember(true);
        return;
      }
      setNotMember(false);
      setMyRole(m.role);
      await loadChannels(c.id);
      await loadMembers(c.id);
    })();
  }, [slug, user, navigate]);

  async function loadChannels(cid: string) {
    const { data } = await supabase
      .from("channels")
      .select("id, name, is_private")
      .eq("community_id", cid)
      .order("created_at");
    setChannels(data ?? []);
    if (data && data.length && !activeChannelId) setActiveChannelId(data[0].id);
  }

  async function loadMembers(cid: string) {
    const { data } = await supabase
      .from("community_members")
      .select("user_id, role, profiles ( username, display_name )")
      .eq("community_id", cid);
    setMembers((data as any) ?? []);
  }

  // Load messages + realtime for active channel
  useEffect(() => {
    if (!activeChannelId) return;
    let mounted = true;
    void (async () => {
      const { data } = await supabase
        .from("messages")
        .select("id, content, created_at, user_id")
        .eq("channel_id", activeChannelId)
        .order("created_at", { ascending: true })
        .limit(200);
      const userIds = Array.from(new Set((data ?? []).map((m) => m.user_id)));
      let profMap = new Map<string, { username: string; display_name: string | null }>();
      if (userIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, username, display_name")
          .in("id", userIds);
        (profs ?? []).forEach((p) =>
          profMap.set(p.id, { username: p.username, display_name: p.display_name }),
        );
      }
      if (!mounted) return;
      setMessages((data ?? []).map((m) => ({ ...m, profile: profMap.get(m.user_id) })));
    })();

    const channel = supabase
      .channel(`messages-${activeChannelId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${activeChannelId}` },
        async (payload) => {
          const m = payload.new as Message;
          const { data: p } = await supabase
            .from("profiles")
            .select("username, display_name")
            .eq("id", m.user_id)
            .maybeSingle();
          setMessages((prev) => [...prev, { ...m, profile: p ?? undefined }]);
        },
      )
      .subscribe();
    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, [activeChannelId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !activeChannelId || !user) return;
    const content = text.trim();
    setText("");
    const { error } = await supabase
      .from("messages")
      .insert({ channel_id: activeChannelId, user_id: user.id, content });
    if (error) toast.error(error.message);
  };

  const joinNow = async () => {
    if (!community || !user) return;
    const { error } = await supabase
      .from("community_members")
      .insert({ community_id: community.id, user_id: user.id, role: "member" });
    if (error) toast.error(error.message);
    else {
      toast.success("Joined");
      setNotMember(false);
      setMyRole("member");
      await loadChannels(community.id);
      await loadMembers(community.id);
    }
  };

  if (!community) return <div className="p-6 text-muted-foreground">Loading...</div>;

  if (notMember) {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <h1 className="text-2xl font-bold">{community.name}</h1>
        <p className="text-muted-foreground mt-2">{community.description}</p>
        <Button className="mt-4" onClick={joinNow}>
          Join community
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3rem)]">
      {/* Channels */}
      <aside className="w-56 border-r flex flex-col bg-muted/30">
        <div className="p-3 border-b">
          <div className="font-semibold truncate">{community.name}</div>
          <div className="text-xs text-muted-foreground capitalize">{myRole}</div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2">
            <div className="flex items-center justify-between px-2 pb-1">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Channels</div>
              {isAdmin && <CreateChannelDialog communityId={community.id} onCreated={() => loadChannels(community.id)} />}
            </div>
            {channels.map((ch) => (
              <button
                key={ch.id}
                onClick={() => setActiveChannelId(ch.id)}
                className={`w-full text-left px-2 py-1.5 rounded-md flex items-center gap-2 text-sm hover:bg-accent ${
                  ch.id === activeChannelId ? "bg-accent text-accent-foreground" : ""
                }`}
              >
                {ch.is_private ? <Lock className="h-3.5 w-3.5" /> : <Hash className="h-3.5 w-3.5" />}
                <span className="truncate">{ch.name}</span>
                {ch.is_private && (
                  <Badge variant="outline" className="ml-auto text-[10px] py-0 px-1">
                    admin
                  </Badge>
                )}
              </button>
            ))}
          </div>
        </ScrollArea>
      </aside>

      {/* Chat */}
      <main className="flex-1 flex flex-col min-w-0">
        <div className="h-12 border-b px-4 flex items-center gap-2">
          {activeChannel?.is_private ? <Lock className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
          <div className="font-semibold">{activeChannel?.name ?? "Select a channel"}</div>
          {activeChannel?.is_private && (
            <Badge variant="outline" className="ml-2">
              Admins only
            </Badge>
          )}
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-8">No messages yet. Say hi 👋</div>
          )}
          {messages.map((m) => {
            const name = m.profile?.display_name || m.profile?.username || "user";
            const initials = name.slice(0, 2).toUpperCase();
            const mine = m.user_id === user?.id;
            return (
              <div key={m.id} className="flex gap-3">
                <Avatar className="h-8 w-8 mt-0.5">
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium">
                      {name} {mine && <span className="text-xs text-muted-foreground">(you)</span>}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div className="text-sm whitespace-pre-wrap break-words">{m.content}</div>
                </div>
              </div>
            );
          })}
        </div>
        <form onSubmit={send} className="border-t p-3 flex gap-2">
          <Input
            placeholder={activeChannel ? `Message #${activeChannel.name}` : "Select a channel"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={!activeChannel}
          />
          <Button type="submit" size="icon" disabled={!text.trim() || !activeChannel}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </main>

      {/* Members */}
      <aside className="w-56 border-l hidden md:flex flex-col bg-muted/30">
        <div className="p-3 border-b flex items-center gap-2">
          <Users className="h-4 w-4" />
          <div className="font-semibold text-sm">Members ({members.length})</div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {members.map((m) => {
              const name = m.profiles?.display_name || m.profiles?.username || "user";
              return (
                <button
                  key={m.user_id}
                  onClick={() => m.user_id !== user?.id && navigate({ to: "/dm/$userId", params: { userId: m.user_id } })}
                  disabled={m.user_id === user?.id}
                  className="w-full text-left px-2 py-1.5 rounded-md flex items-center gap-2 hover:bg-accent disabled:opacity-60 disabled:hover:bg-transparent"
                >
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-[10px]">
                      {name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm truncate">{name}</span>
                  {(m.role === "owner" || m.role === "admin") && (
                    <Badge variant="secondary" className="ml-auto text-[10px] py-0 px-1 capitalize">
                      {m.role}
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </aside>
    </div>
  );
}

function CreateChannelDialog({ communityId, onCreated }: { communityId: string; onCreated: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const clean = name
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const { error } = await supabase
      .from("channels")
      .insert({ community_id: communityId, name: clean, is_private: isPrivate, created_by: user.id });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Channel created");
    setOpen(false);
    setName("");
    setIsPrivate(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="h-6 w-6">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create channel</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="chname">Channel name</Label>
            <Input id="chname" required value={name} onChange={(e) => setName(e.target.value)} placeholder="ideas" />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">Admin-only (private)</div>
              <div className="text-xs text-muted-foreground">Only community owner & admins can see this channel.</div>
            </div>
            <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Avoid unused-import lints
export const _icons = { Settings };