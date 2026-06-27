import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Lock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useSuperAdmin } from "@/hooks/use-super-admin";

export const Route = createFileRoute("/_authenticated/dm/$userId")({
  component: DmConversation,
});

type Msg = { id: string; sender_id: string; recipient_id: string; content: string; created_at: string };

function DmConversation() {
  const { userId } = Route.useParams();
  const { user } = useAuth();
  const { isSuper, run } = useSuperAdmin();
  const [other, setOther] = useState<{ username: string; display_name: string | null } | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    void (async () => {
      const { data: prof } = await supabase
        .from("profiles")
        .select("username, display_name")
        .eq("id", userId)
        .maybeSingle();
      if (mounted) setOther(prof);
      const { data } = await supabase
        .from("direct_messages")
        .select("*")
        .or(
          `and(sender_id.eq.${user.id},recipient_id.eq.${userId}),and(sender_id.eq.${userId},recipient_id.eq.${user.id})`,
        )
        .order("created_at", { ascending: true })
        .limit(500);
      if (mounted) setMessages((data as Msg[]) ?? []);
    })();

    const channel = supabase
      .channel(`dm-${user.id}-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        (payload) => {
          const m = payload.new as Msg;
          const relevant =
            (m.sender_id === user.id && m.recipient_id === userId) ||
            (m.sender_id === userId && m.recipient_id === user.id);
          if (relevant) setMessages((prev) => [...prev, m]);
        },
      )
      .subscribe();
    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, [user, userId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !user) return;
    const content = text.trim();
    setText("");
    const { error } = await supabase
      .from("direct_messages")
      .insert({ sender_id: user.id, recipient_id: userId, content });
    if (error) toast.error(error.message);
  };

  const deleteDm = async (id: string) => {
    if (!isSuper) {
      toast.error("Only the admin can delete messages");
      return;
    }
    const ok = await run({ type: "deleteDm", id });
    if (ok) setMessages((prev) => prev.filter((m) => m.id !== id));
  };

  const name = other?.display_name || other?.username || "user";

  return (
    <div className="flex flex-col h-full">
      <div className="h-12 border-b px-4 flex items-center gap-2">
        <Avatar className="h-7 w-7">
          <AvatarFallback className="text-xs">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="font-semibold">{name}</div>
        <div className="ml-2 text-xs text-muted-foreground flex items-center gap-1">
          <Lock className="h-3 w-3" /> Private
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">
            This is the start of your private conversation with {name}.
          </div>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === user?.id;
          return (
            <div key={m.id} className={`group flex items-center gap-1 ${mine ? "justify-end" : "justify-start"}`}>
              {mine && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100"
                  onClick={() => deleteDm(m.id)}
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
              <div
                className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm ${
                  mine ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}
              >
                <div className="whitespace-pre-wrap break-words">{m.content}</div>
                <div className={`text-[10px] mt-1 ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
              {!mine && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100"
                  onClick={() => deleteDm(m.id)}
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          );
        })}
      </div>
      <form onSubmit={send} className="border-t p-3 flex gap-2">
        <Input placeholder={`Message ${name}`} value={text} onChange={(e) => setText(e.target.value)} />
        <Button type="submit" size="icon" disabled={!text.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}