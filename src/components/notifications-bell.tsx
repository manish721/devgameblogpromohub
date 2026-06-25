import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Bell, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

type N = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
};

export function NotificationsBell() {
  const { user } = useAuth();
  const [items, setItems] = useState<N[]>([]);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    void supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (mounted) setItems((data as N[]) ?? []);
      });

    const ch = supabase
      .channel(`notif-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new as N;
          setItems((prev) => [n, ...prev]);
          toast(n.title, { description: n.body ?? undefined });
        },
      )
      .subscribe();
    return () => {
      mounted = false;
      void supabase.removeChannel(ch);
    };
  }, [user]);

  const unread = items.filter((n) => !n.read).length;

  const markAll = async () => {
    if (!user) return;
    await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const markOne = async (id: string) => {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" className="relative">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="font-semibold text-sm">Notifications</div>
          {unread > 0 && (
            <Button size="sm" variant="ghost" onClick={markAll} className="h-7 text-xs">
              <Check className="h-3 w-3" /> Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">No notifications yet.</div>
          )}
          {items.map((n) => {
            const content = (
              <div className={`p-3 border-b text-sm ${!n.read ? "bg-accent/40" : ""}`}>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] capitalize">{n.type}</Badge>
                  <div className="font-medium truncate flex-1">{n.title}</div>
                </div>
                {n.body && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{n.body}</div>}
                <div className="text-[10px] text-muted-foreground mt-1">
                  {new Date(n.created_at).toLocaleString()}
                </div>
              </div>
            );
            return n.link ? (
              <Link key={n.id} to={n.link} onClick={() => markOne(n.id)} className="block hover:bg-accent/30">
                {content}
              </Link>
            ) : (
              <button key={n.id} onClick={() => markOne(n.id)} className="w-full text-left hover:bg-accent/30">
                {content}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}