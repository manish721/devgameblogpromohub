import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Hash, LogOut, MessageCircle, Plus, Search, Users } from "lucide-react";
import { toast } from "sonner";

type Community = { id: string; name: string; slug: string };

export function AppSidebar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [profile, setProfile] = useState<{ username: string; display_name: string | null } | null>(null);

  useEffect(() => {
    if (!user) return;
    void loadMyCommunities();
    void supabase
      .from("profiles")
      .select("username, display_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setProfile(data));

    const channel = supabase
      .channel("my-memberships")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_members", filter: `user_id=eq.${user.id}` },
        () => void loadMyCommunities(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user]);

  async function loadMyCommunities() {
    if (!user) return;
    const { data } = await supabase
      .from("community_members")
      .select("communities ( id, name, slug )")
      .eq("user_id", user.id);
    const list = (data ?? [])
      .map((r: any) => r.communities as Community)
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
    setCommunities(list);
  }

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  const initials = (profile?.display_name || profile?.username || "?").slice(0, 2).toUpperCase();

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <MessageCircle className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="font-semibold">Hubchat</div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link to="/app">
                    <Search className="h-4 w-4" />
                    <span>Browse communities</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link to="/dm">
                    <MessageCircle className="h-4 w-4" />
                    <span>Direct messages</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>My communities</SidebarGroupLabel>
          <CreateCommunityDialog onCreated={loadMyCommunities} />
          <SidebarGroupContent>
            <SidebarMenu>
              {communities.length === 0 && (
                <div className="px-2 py-2 text-xs text-muted-foreground">
                  Join or create a community to get started.
                </div>
              )}
              {communities.map((c) => (
                <SidebarMenuItem key={c.id}>
                  <SidebarMenuButton asChild>
                    <Link to="/c/$slug" params={{ slug: c.slug }}>
                      <Users className="h-4 w-4" />
                      <span className="truncate">{c.name}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-2 p-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{profile?.display_name || profile?.username}</div>
            <div className="text-xs text-muted-foreground truncate">@{profile?.username}</div>
          </div>
          <Button size="icon" variant="ghost" onClick={signOut} title="Sign out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function CreateCommunityDialog({ onCreated }: { onCreated: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const slug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 40) +
      "-" +
      Math.random().toString(36).slice(2, 6);
    const { error } = await supabase
      .from("communities")
      .insert({ name, description, slug, created_by: user.id });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Community created");
    setOpen(false);
    setName("");
    setDescription("");
    onCreated();
    navigate({ to: "/c/$slug", params: { slug } });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <SidebarGroupAction title="Create community">
          <Plus className="h-4 w-4" />
        </SidebarGroupAction>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a community</DialogTitle>
          <DialogDescription>You'll become the owner with admin access.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cname">Name</Label>
            <Input id="cname" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Indie Hackers" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cdesc">Description</Label>
            <Textarea id="cdesc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this community about?" />
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

// re-export to satisfy unused import lints if needed
export const _ = { Hash, useParams };