import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, MessageCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dm")({
  head: () => ({ meta: [{ title: "Direct messages — Hubchat" }] }),
  component: DmLayout,
});

type Partner = {
  user_id: string;
  username: string;
  display_name: string | null;
  last_message?: string;
  last_at?: string;
};

function DmLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const [partners, setPartners] = useState<Partner[]>([]);
  const isRoot = location.pathname === "/dm" || location.pathname === "/dm/";

  useEffect(() => {
    if (!user) return;
    void load();
    const channel = supabase
      .channel(`dm-list-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        (payload) => {
          const m = payload.new as { sender_id: string; recipient_id: string };
          if (m.sender_id === user.id || m.recipient_id === user.id) void load();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user]);

  async function load() {
    if (!user) return;
    const { data } = await supabase
      .from("direct_messages")
      .select("sender_id, recipient_id, content, created_at")
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(200);
    const map = new Map<string, Partner>();
    for (const m of data ?? []) {
      const other = m.sender_id === user.id ? m.recipient_id : m.sender_id;
      if (!map.has(other)) {
        map.set(other, { user_id: other, username: "", display_name: null, last_message: m.content, last_at: m.created_at });
      }
    }
    const ids = Array.from(map.keys());
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, username, display_name")
        .in("id", ids);
      (profs ?? []).forEach((p) => {
        const entry = map.get(p.id)!;
        entry.username = p.username;
        entry.display_name = p.display_name;
      });
    }
    setPartners(Array.from(map.values()));
  }

  return (
    <div className="flex h-[calc(100vh-3rem)]">
      <aside className="w-64 border-r flex flex-col bg-muted/30">
        <div className="p-3 border-b flex items-center justify-between">
          <div className="font-semibold">Direct messages</div>
          <NewDmDialog />
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {partners.length === 0 && (
              <div className="px-2 py-6 text-xs text-muted-foreground text-center">
                No conversations yet. Click + to start one.
              </div>
            )}
            {partners.map((p) => {
              const name = p.display_name || p.username;
              return (
                <Link
                  key={p.user_id}
                  to="/dm/$userId"
                  params={{ userId: p.user_id }}
                  className="block px-2 py-2 rounded-md hover:bg-accent"
                  activeProps={{ className: "block px-2 py-2 rounded-md bg-accent" }}
                >
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{name}</div>
                      <div className="text-xs text-muted-foreground truncate">{p.last_message}</div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </ScrollArea>
      </aside>
      <main className="flex-1 min-w-0">
        {isRoot ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageCircle className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <div>Select a conversation</div>
            </div>
          </div>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}

function NewDmDialog() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; username: string; display_name: string | null }[]>([]);

  useEffect(() => {
    if (!open || !q.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name")
        .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
        .neq("id", user?.id ?? "")
        .limit(10);
      setResults(data ?? []);
    }, 200);
    return () => clearTimeout(t);
  }, [q, open, user]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="h-7 w-7">
          <Plus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start a private chat</DialogTitle>
          <DialogDescription>Search users by username or display name.</DialogDescription>
        </DialogHeader>
        <Input placeholder="Search..." value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <div className="space-y-1 max-h-72 overflow-auto">
          {results.map((p) => {
            const name = p.display_name || p.username;
            return (
              <Link
                key={p.id}
                to="/dm/$userId"
                params={{ userId: p.id }}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 p-2 rounded-md hover:bg-accent"
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="text-sm font-medium">{name}</div>
                  <div className="text-xs text-muted-foreground">@{p.username}</div>
                </div>
              </Link>
            );
          })}
          {q && results.length === 0 && (
            <div className="text-xs text-muted-foreground px-2 py-3">No matches.</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}