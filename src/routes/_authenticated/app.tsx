import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Users, Check } from "lucide-react";
import { toast } from "sonner";
import { useSuperAdmin } from "@/hooks/use-super-admin";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2, KeyRound } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({ meta: [{ title: "Communities — Hubchat" }] }),
  component: BrowsePage,
});

type Row = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  member_count: number;
  is_member: boolean;
};

function BrowsePage() {
  const { user } = useAuth();
  const { isSuper, run } = useSuperAdmin();
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
  }, [user]);

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data: comms } = await supabase
      .from("communities")
      .select("id, name, slug, description")
      .order("created_at", { ascending: false });
    const { data: mine } = await supabase
      .from("community_members")
      .select("community_id")
      .eq("user_id", user.id);
    const memberSet = new Set((mine ?? []).map((m) => m.community_id));

    const ids = (comms ?? []).map((c) => c.id);
    const counts: Record<string, number> = {};
    if (ids.length) {
      // simple count per community (small scale)
      for (const id of ids) {
        const { count } = await supabase
          .from("community_members")
          .select("*", { count: "exact", head: true })
          .eq("community_id", id);
        counts[id] = count ?? 0;
      }
    }
    setRows(
      (comms ?? []).map((c) => ({
        ...c,
        member_count: counts[c.id] ?? 0,
        is_member: memberSet.has(c.id),
      })),
    );
    setLoading(false);
  }

  const join = async (id: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("community_members")
      .insert({ community_id: id, user_id: user.id, role: "member" });
    if (error && error.code !== "23505" && !error.message.toLowerCase().includes("duplicate key")) {
      toast.error(error.message);
      return;
    }
    if (error) {
      toast.success("Already joined");
      void load();
      return;
    }
    else {
      toast.success("Joined");
      void load();
    }
  };

  const forceEnter = async (id: string) => {
    if (!user) return;
    const ok = await run({ type: "forceJoin", communityId: id, userId: user.id });
    if (ok) {
      toast.success("Entered with admin access");
      void load();
    }
  };

  const removeCommunity = async (id: string) => {
    const ok = await run({ type: "deleteCommunity", id });
    if (ok) {
      toast.success("Community deleted");
      void load();
    }
  };

  const filtered = rows.filter(
    (r) =>
      r.name.toLowerCase().includes(q.toLowerCase()) ||
      (r.description ?? "").toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="p-6 max-w-5xl mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Discover communities</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Join a community to chat in its channels, or create your own from the sidebar.
        </p>
      </div>
      <Input
        placeholder="Search communities..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="mb-6 max-w-sm"
      />
      {loading ? (
        <div className="text-muted-foreground text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No communities yet. Create the first one from the sidebar.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <Card key={c.id} className="flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">{c.name}</CardTitle>
                <CardDescription className="line-clamp-2">{c.description || "No description"}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto flex items-center justify-between gap-2">
                <Badge variant="secondary" className="gap-1">
                  <Users className="h-3 w-3" /> {c.member_count}
                </Badge>
                <div className="flex items-center gap-1">
                  {c.is_member ? (
                    <Button asChild size="sm" variant="outline">
                      <Link to="/c/$slug" params={{ slug: c.slug }}>
                        <Check className="h-4 w-4" /> Open
                      </Link>
                    </Button>
                  ) : isSuper ? (
                    <Button asChild size="sm" variant="outline">
                      <Link to="/c/$slug" params={{ slug: c.slug }}>
                        <KeyRound className="h-4 w-4" /> Enter
                      </Link>
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => join(c.id)}>
                      Join
                    </Button>
                  )}
                  {isSuper && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => forceEnter(c.id)}
                        title="Force join as admin"
                      >
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="destructive" title="Delete community">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete "{c.name}"?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This permanently deletes the community, all its channels, members, and messages.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => removeCommunity(c.id)}>
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}